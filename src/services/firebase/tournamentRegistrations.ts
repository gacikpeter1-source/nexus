/**
 * Tournament Registration — a separate, additional pre-step for standalone
 * tournaments. The organizer invites known clubs to a tournament that
 * doesn't exist yet; each invited club accepts (naming the squad it's
 * sending — possibly more than once, for a roster split into several
 * small-format entries) or declines, before the actual tournament/bracket
 * is created. Does not touch the existing tournaments/CreateStandaloneTournament
 * flow at all — that stays exactly as it is.
 *
 * Entries live in their own flat top-level collection (not a subcollection
 * of tournamentRegistrations) so a club can list every entry it's been
 * invited to with a plain where('clubId','==',...) query.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { NotificationManager } from '../notifications/NotificationManager';
import type { TournamentRegistration, RegistrationEntry, RegistrationEntryStatus } from '../../types';

function randomToken(): string {
  // Reserved for a future no-login email response link — not used yet, but
  // generated up front so every entry already has one once that ships.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createTournamentRegistration(params: {
  createdBy: string;
  title: string;
  category?: string;
  sport?: string;
  deadline: string;
}): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'tournamentRegistrations'), {
    createdBy: params.createdBy,
    title: params.title,
    ...(params.category ? { category: params.category } : {}),
    ...(params.sport ? { sport: params.sport } : {}),
    deadline: params.deadline,
    status: 'open',
    siteOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function getTournamentRegistration(id: string): Promise<TournamentRegistration | null> {
  const snap = await getDoc(doc(db, 'tournamentRegistrations', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as TournamentRegistration) : null;
}

export async function getMyTournamentRegistrations(userId: string): Promise<TournamentRegistration[]> {
  const q = query(
    collection(db, 'tournamentRegistrations'),
    where('createdBy', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TournamentRegistration));
}

export async function closeTournamentRegistration(id: string): Promise<void> {
  await updateDoc(doc(db, 'tournamentRegistrations', id), {
    status: 'closed',
    updatedAt: Timestamp.now(),
  });
}

export async function reopenTournamentRegistration(id: string): Promise<void> {
  await updateDoc(doc(db, 'tournamentRegistrations', id), {
    status: 'open',
    updatedAt: Timestamp.now(),
  });
}

/** Organizer inviting a club (Nexus club, or a free-typed name for one that isn't). */
export async function inviteClubToRegistration(params: {
  registrationId: string;
  clubId?: string;
  teamId?: string;
  clubName: string;
  email?: string;
  invitedBy: string;
}): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'registrationEntries'), {
    registrationId: params.registrationId,
    ...(params.clubId ? { clubId: params.clubId } : {}),
    ...(params.teamId ? { teamId: params.teamId } : {}),
    clubName: params.clubName,
    ...(params.email ? { email: params.email } : {}),
    status: 'pending',
    invitedBy: params.invitedBy,
    token: randomToken(),
    createdAt: now,
    updatedAt: now,
  });

  // Best-effort — a failed notification never blocks the invite itself.
  if (params.clubId) {
    try {
      const registration = await getTournamentRegistration(params.registrationId);
      if (registration) {
        await NotificationManager.onTournamentRegistrationInvite({
          registrationId: params.registrationId,
          clubId: params.clubId,
          title: registration.title,
          invitedBy: params.invitedBy,
        });
      }
    } catch (error) {
      console.error('❌ Failed to send tournament registration invite notification:', error);
    }
  }

  return docRef.id;
}

/** An invited club responding (accept with a squad name, or decline). */
export async function respondToRegistrationEntry(
  entryId: string,
  response: { status: 'accepted' | 'declined'; squadName?: string; respondedBy: string }
): Promise<void> {
  const entryRef = doc(db, 'registrationEntries', entryId);
  await updateDoc(entryRef, {
    status: response.status,
    ...(response.squadName ? { squadName: response.squadName } : {}),
    respondedBy: response.respondedBy,
    respondedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Best-effort — a failed notification never blocks the response itself.
  try {
    const entrySnap = await getDoc(entryRef);
    const entry = entrySnap.data() as RegistrationEntry | undefined;
    if (entry) {
      const registration = await getTournamentRegistration(entry.registrationId);
      if (registration) {
        await NotificationManager.onTournamentRegistrationResponse({
          registrationId: entry.registrationId,
          organizerId: registration.createdBy,
          title: registration.title,
          clubName: entry.clubName,
          status: response.status,
          respondedBy: response.respondedBy,
        });
      }
    }
  } catch (error) {
    console.error('❌ Failed to send tournament registration response notification:', error);
  }
}

/**
 * A club adding another squad of its own to a registration it's already
 * part of — created pre-accepted, since the club is entering itself rather
 * than responding to an invite. Covers the "one 30-player roster splits
 * into several small-format entries" case.
 */
export async function addOwnRegistrationEntry(params: {
  registrationId: string;
  clubId: string;
  teamId?: string;
  clubName: string;
  squadName: string;
  respondedBy: string;
}): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'registrationEntries'), {
    registrationId: params.registrationId,
    clubId: params.clubId,
    ...(params.teamId ? { teamId: params.teamId } : {}),
    clubName: params.clubName,
    status: 'accepted',
    squadName: params.squadName,
    invitedBy: params.respondedBy,
    respondedBy: params.respondedBy,
    respondedAt: now,
    token: randomToken(),
    createdAt: now,
    updatedAt: now,
  });

  // Best-effort — a failed notification never blocks the entry itself.
  try {
    const registration = await getTournamentRegistration(params.registrationId);
    if (registration) {
      await NotificationManager.onTournamentRegistrationResponse({
        registrationId: params.registrationId,
        organizerId: registration.createdBy,
        title: registration.title,
        clubName: params.clubName,
        status: 'accepted',
        respondedBy: params.respondedBy,
      });
    }
  } catch (error) {
    console.error('❌ Failed to send tournament registration response notification:', error);
  }

  return docRef.id;
}

export async function updateRegistrationEntryStatus(entryId: string, status: RegistrationEntryStatus): Promise<void> {
  await updateDoc(doc(db, 'registrationEntries', entryId), { status, updatedAt: Timestamp.now() });
}

export async function deleteRegistrationEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'registrationEntries', entryId));
}

/** Every entry across all clubs, for the organizer's own dashboard. */
export async function getRegistrationEntries(registrationId: string): Promise<RegistrationEntry[]> {
  const q = query(collection(db, 'registrationEntries'), where('registrationId', '==', registrationId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistrationEntry));
}

/** Every entry a specific club has anywhere — across every registration it's been invited to. */
export async function getClubRegistrationEntries(clubId: string): Promise<RegistrationEntry[]> {
  const q = query(collection(db, 'registrationEntries'), where('clubId', '==', clubId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistrationEntry));
}

/**
 * No-login email response flow (Phase 2) — for clubs not yet on Nexus.
 * These two go through Cloud Functions callables (server verifies the
 * per-entry token with the Admin SDK) rather than direct Firestore reads,
 * since the visitor isn't signed in and Firestore rules require auth.
 */

export interface PublicRegistrationEntryView {
  entry: {
    clubName: string;
    status: RegistrationEntryStatus;
    squadName?: string;
  };
  registration: {
    title: string;
    category?: string;
    sport?: string;
    deadline: string;
    status: 'open' | 'closed';
  };
}

const getRegistrationEntryPublicFn = httpsCallable<
  { entryId: string; token: string },
  PublicRegistrationEntryView
>(functions, 'getRegistrationEntryPublic');

const respondToRegistrationEntryPublicFn = httpsCallable<
  { entryId: string; token: string; status: 'accepted' | 'declined'; squadName?: string },
  { ok: true }
>(functions, 'respondToRegistrationEntryPublic');

export async function getRegistrationEntryPublic(entryId: string, token: string): Promise<PublicRegistrationEntryView> {
  const result = await getRegistrationEntryPublicFn({ entryId, token });
  return result.data;
}

export async function respondToRegistrationEntryPublic(params: {
  entryId: string;
  token: string;
  status: 'accepted' | 'declined';
  squadName?: string;
}): Promise<void> {
  await respondToRegistrationEntryPublicFn(params);
}
