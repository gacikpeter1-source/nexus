/**
 * Firebase service for standalone (plain) tournaments — a bracket/scoring
 * tool with no club or team attached, no roster, no RSVP. Lives in its own
 * top-level `tournaments` collection so it never depends on club membership.
 * Public viewing goes through the same tournamentPublic mirror + /tv/:id
 * page used by club tournaments (see mirrorStandaloneTournamentPublicData
 * in functions/src/index.ts) — this file only touches the private,
 * staff-facing side.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { StandaloneTournament, TournamentBracket, TournamentFormat, TournamentFormatKey } from '../../types';
import { createTvShortCode } from './tvShortCodes';

export async function createStandaloneTournament(params: {
  title: string;
  location?: string;
  creatorId: string;
  creatorEmail?: string;
  formatId: string;
  formatKey: TournamentFormatKey;
  bracket: TournamentBracket;
  teamContacts?: Record<string, string>;
  emailTag?: string;
}): Promise<{ id: string; shortCode: string }> {
  const now = Timestamp.now();
  // The id is generated up front (not yet written) so the short code's
  // mapping — and the tournament doc's own shortCode field — can both be in
  // place from the very first write. Attaching shortCode via a follow-up
  // update() instead would race sendTournamentCreatedEmail's
  // onDocumentCreated trigger, which fires off that first write and could
  // easily see shortCode still missing.
  const docRef = doc(collection(db, 'tournaments'));
  const shortCode = await createTvShortCode(docRef.id);

  await setDoc(docRef, {
    title: params.title,
    ...(params.location ? { location: params.location } : {}),
    creatorId: params.creatorId,
    ...(params.creatorEmail ? { creatorEmail: params.creatorEmail } : {}),
    siteOrigin: window.location.origin,
    formatId: params.formatId,
    formatKey: params.formatKey,
    bracket: params.bracket,
    ...(params.teamContacts && Object.keys(params.teamContacts).length > 0 ? { teamContacts: params.teamContacts } : {}),
    ...(params.emailTag ? { emailTag: params.emailTag } : {}),
    shortCode,
    createdAt: now,
    updatedAt: now,
  });

  return { id: docRef.id, shortCode };
}

export async function getStandaloneTournament(tournamentId: string): Promise<StandaloneTournament | null> {
  const snap = await getDoc(doc(db, 'tournaments', tournamentId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StandaloneTournament) : null;
}

export function subscribeToStandaloneTournament(
  tournamentId: string,
  callback: (tournament: StandaloneTournament | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'tournaments', tournamentId), snap => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as StandaloneTournament) : null);
  });
}

/** Tournaments this user created — shown on the Tools > Tournaments hub. */
export async function getMyStandaloneTournaments(userId: string): Promise<StandaloneTournament[]> {
  const q = query(
    collection(db, 'tournaments'),
    where('creatorId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StandaloneTournament));
}

export async function updateStandaloneTournamentBracket(tournamentId: string, bracket: TournamentBracket): Promise<void> {
  await updateDoc(doc(db, 'tournaments', tournamentId), {
    bracket,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteStandaloneTournament(tournamentId: string): Promise<void> {
  await deleteDoc(doc(db, 'tournaments', tournamentId));
}

/** Backfills a TV short code for a tournament created before shortCode existed. */
export async function ensureTvShortCode(tournamentId: string): Promise<string> {
  const shortCode = await createTvShortCode(tournamentId);
  await updateDoc(doc(db, 'tournaments', tournamentId), { shortCode });
  return shortCode;
}

// ==================== Tournament formats ====================

export async function getTournamentFormats(): Promise<TournamentFormat[]> {
  const snap = await getDocs(query(collection(db, 'tournamentFormats'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TournamentFormat));
}

export async function addCustomTournamentFormat(params: {
  name: string;
  description?: string;
  createdBy: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, 'tournamentFormats'), {
    key: 'custom',
    name: params.name,
    ...(params.description ? { description: params.description } : {}),
    isCustom: true,
    createdBy: params.createdBy,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function deleteCustomTournamentFormat(formatId: string): Promise<void> {
  await deleteDoc(doc(db, 'tournamentFormats', formatId));
}
