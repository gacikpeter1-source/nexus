/**
 * Firebase Nominations Service
 * Trainer-curated game/tournament rosters (nomination lists).
 *
 * Distinct from the open RSVP model in events.ts: a nominated athlete only
 * appears on the roster once a staff member adds them, and the game is only
 * meant to be surfaced to that athlete once they confirm.
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
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Nomination, NominationEntry, NominationGame, NominationKind } from '../../types';
import { getTeamMembers } from './teams';
import { NotificationManager } from '../notifications/NotificationManager';

// ==================== Roster resolution ====================

export interface NominationCandidate {
  athleteId: string;
  isChild: boolean;
  isManual?: boolean; // no linked account — no notification, auto-confirmed on add
  recipientIds: string[];
  displayName: string;
}

// Charset avoids 0/O and 1/I to reduce read errors when typed manually elsewhere in this app
const MANUAL_ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A hardcoded roster slot for someone without an account — no invite, no response, staff-confirmed on add. */
export function createManualCandidate(displayName: string): NominationCandidate {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += MANUAL_ID_CHARS[Math.floor(Math.random() * MANUAL_ID_CHARS.length)];
  return {
    athleteId: `manual_${Date.now()}_${suffix}`,
    isChild: false,
    isManual: true,
    recipientIds: [],
    displayName: displayName.trim(),
  };
}

/**
 * Build the list of nominate-able athletes for a team: children replace their
 * parent when assigned to this team, everyone else appears directly.
 * Mirrors the athlete-resolution logic already used by AttendTab/StatsTab.
 */
export async function getNominationCandidates(clubId: string, teamId: string): Promise<NominationCandidate[]> {
  const clubSnap = await getDoc(doc(db, 'clubs', clubId));
  if (!clubSnap.exists()) return [];
  const club = clubSnap.data();
  const team = (club.teams || []).find((t: any) => t.id === teamId);
  if (!team) return [];

  const memberIds = Object.keys(getTeamMembers(team));
  if (memberIds.length === 0) return [];

  const members = (
    await Promise.all(memberIds.map(async id => {
      const snap = await getDoc(doc(db, 'users', id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as any) : null;
    }))
  ).filter(Boolean) as any[];

  const parentMembers: any[] = [];
  const directCandidates: NominationCandidate[] = [];

  for (const member of members) {
    const isActiveParent = (member.role === 'parent' || member.isParent === true)
      && member.childIds && member.childIds.length > 0;
    if (isActiveParent) {
      parentMembers.push(member);
    } else {
      directCandidates.push({
        athleteId: member.id,
        isChild: false,
        recipientIds: [member.id],
        displayName: member.displayName || member.email || 'Unknown',
      });
    }
  }

  const childIds = Array.from(new Set(parentMembers.flatMap(p => p.childIds || [])));
  const children = (
    await Promise.all(childIds.map(async id => {
      const snap = await getDoc(doc(db, 'users', id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as any) : null;
    }))
  ).filter(Boolean) as any[];

  const childrenForThisTeam = children.filter(c => Array.isArray(c.teamIds) && c.teamIds.includes(teamId));
  const childCandidates: NominationCandidate[] = childrenForThisTeam.map(child => ({
    athleteId: child.id,
    isChild: true,
    recipientIds: Array.isArray(child.parentIds) && child.parentIds.length > 0 ? child.parentIds : [],
    displayName: child.displayName || 'Unknown',
  }));

  // Parents whose children aren't assigned to this team fall back to appearing directly
  const childIdsHere = new Set(childrenForThisTeam.map(c => c.id));
  const parentsWithNoChildHere = parentMembers.filter(p => !(p.childIds || []).some((cid: string) => childIdsHere.has(cid)));
  const fallbackCandidates: NominationCandidate[] = parentsWithNoChildHere.map(p => ({
    athleteId: p.id,
    isChild: false,
    recipientIds: [p.id],
    displayName: p.displayName || p.email || 'Unknown',
  }));

  return [...directCandidates, ...childCandidates, ...fallbackCandidates];
}

/**
 * Staff who should be notified about declines / no-responses for a team:
 * team-level trainers/assistants + club owner + club-level trainers (same
 * "always include club owner + club trainers" rule used for event notifications).
 */
export async function getNominationStaffRecipients(clubId: string, teamId: string): Promise<string[]> {
  const clubSnap = await getDoc(doc(db, 'clubs', clubId));
  if (!clubSnap.exists()) return [];
  const club = clubSnap.data();
  const team = (club.teams || []).find((t: any) => t.id === teamId);

  const ids = new Set<string>();
  if (team) {
    const teamMembers = getTeamMembers(team);
    Object.entries(teamMembers).forEach(([id, data]) => {
      if (data.role === 'trainer' || data.role === 'assistant') ids.add(id);
    });
  }
  if (club.ownerId) ids.add(club.ownerId);
  (club.trainers || []).forEach((id: string) => ids.add(id));

  return Array.from(ids);
}

// ==================== CRUD ====================

function flattenRecipients(nomination: Pick<Nomination, 'primary' | 'backlog'>): string[] {
  const ids = new Set<string>();
  for (const entry of [...Object.values(nomination.primary), ...Object.values(nomination.backlog)]) {
    entry.recipientIds.forEach(id => ids.add(id));
  }
  return Array.from(ids);
}

export async function createNomination(params: {
  clubId: string;
  teamId: string;
  createdBy: string;
  title: string;
  kind: NominationKind;
  games: NominationGame[];
  deadline: Date;
  primarySize: number;
  primaryCandidates: NominationCandidate[];
  backlogCandidates: NominationCandidate[];
}): Promise<string> {
  const { clubId, teamId, createdBy, title, kind, games, deadline, primarySize, primaryCandidates, backlogCandidates } = params;

  const toEntry = (c: NominationCandidate, order: number): NominationEntry => ({
    athleteId: c.athleteId,
    isChild: c.isChild,
    ...(c.isManual ? { isManual: true } : {}), // Firestore rejects an explicit `undefined` field value
    recipientIds: c.recipientIds,
    displayName: c.displayName,
    // No account to notify → nothing to wait on, so a manual entry is confirmed on add.
    status: c.isManual ? 'confirmed' : 'pending',
    order,
  });

  const primary: Record<string, NominationEntry> = {};
  primaryCandidates.forEach((c, i) => { primary[c.athleteId] = toEntry(c, i); });

  const backlog: Record<string, NominationEntry> = {};
  backlogCandidates.forEach((c, i) => { backlog[c.athleteId] = toEntry(c, i); });

  const newNomination: Omit<Nomination, 'id'> = {
    clubId,
    teamId,
    createdBy,
    title,
    kind,
    games,
    deadline: Timestamp.fromDate(deadline),
    primarySize,
    primary,
    backlog,
    allRecipientIds: flattenRecipients({ primary, backlog }),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const ref = await addDoc(collection(db, 'clubs', clubId, 'nominations'), newNomination);

  try {
    for (const c of primaryCandidates) {
      if (c.recipientIds.length === 0) continue;
      await NotificationManager.onNominationInvite({
        nominationId: ref.id,
        clubId,
        title,
        athleteName: c.displayName,
        createdBy,
        recipientIds: c.recipientIds,
      });
    }
  } catch (err) {
    console.error('❌ Failed to send nomination invite notifications:', err);
  }

  return ref.id;
}

export async function getNomination(clubId: string, nominationId: string): Promise<Nomination | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'nominations', nominationId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Nomination;
}

/** Staff view: every nomination list for a team, newest first. */
export async function getTeamNominations(clubId: string, teamId: string): Promise<Nomination[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'nominations'),
    where('teamId', '==', teamId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Nomination);
}

/** Recipient view: nominations (in this club) where the user or one of their children appears. */
export async function getUserNominations(clubId: string, userId: string): Promise<Nomination[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'nominations'),
    where('allRecipientIds', 'array-contains', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Nomination);
}

export function subscribeToNomination(
  clubId: string,
  nominationId: string,
  callback: (nomination: Nomination | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'clubs', clubId, 'nominations', nominationId), snap => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Nomination) : null);
  });
}

/** Staff edit — title/games/deadline/primarySize/cancelled. Always allowed, deadline or not. */
export async function updateNominationDetails(
  clubId: string,
  nominationId: string,
  updates: Partial<Pick<Nomination, 'title' | 'games' | 'primarySize' | 'cancelled'>> & { deadline?: Date | Nomination['deadline'] }
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteNomination(clubId: string, nominationId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'nominations', nominationId));
}

/** Staff — add a candidate to the primary list or the backlog. Always allowed. */
export async function addNominationEntry(
  clubId: string,
  nominationId: string,
  candidate: NominationCandidate,
  listType: 'primary' | 'backlog',
  addedBy: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  if (nomination.primary[candidate.athleteId] || nomination.backlog[candidate.athleteId]) {
    throw new Error('Athlete already on this list');
  }

  const list = { ...nomination[listType] };
  const nextOrder = Object.keys(list).length;
  list[candidate.athleteId] = {
    athleteId: candidate.athleteId,
    isChild: candidate.isChild,
    ...(candidate.isManual ? { isManual: true } : {}), // Firestore rejects an explicit `undefined` field value
    recipientIds: candidate.recipientIds,
    displayName: candidate.displayName,
    // No account to notify → nothing to wait on, so a manual entry is confirmed on add.
    status: candidate.isManual ? 'confirmed' : 'pending',
    order: nextOrder,
  };

  const updated: Pick<Nomination, 'primary' | 'backlog'> = {
    primary: listType === 'primary' ? list : nomination.primary,
    backlog: listType === 'backlog' ? list : nomination.backlog,
  };

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    ...updated,
    allRecipientIds: flattenRecipients(updated),
    updatedAt: Timestamp.now(),
  });

  if (listType === 'primary' && candidate.recipientIds.length > 0) {
    try {
      await NotificationManager.onNominationInvite({
        nominationId,
        clubId,
        title: nomination.title,
        athleteName: candidate.displayName,
        createdBy: addedBy,
        recipientIds: candidate.recipientIds,
      });
    } catch (err) {
      console.error('❌ Failed to send nomination invite notification:', err);
    }
  }
}

/** Staff — remove an athlete from whichever list they're on. Always allowed. */
export async function removeNominationEntry(
  clubId: string,
  nominationId: string,
  athleteId: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');

  const primary = { ...nomination.primary };
  const backlog = { ...nomination.backlog };
  delete primary[athleteId];
  delete backlog[athleteId];

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    primary,
    backlog,
    allRecipientIds: flattenRecipients({ primary, backlog }),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Staff — promote the top-ranked backlog athlete into the primary list
 * (used after a decline, or a manual "no response" follow-up).
 * Returns the promoted athlete's display name, or null if backlog was empty.
 */
export async function promoteNextFromBacklog(
  clubId: string,
  nominationId: string,
  promotedBy: string
): Promise<string | null> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');

  const backlogEntries = Object.values(nomination.backlog).sort((a, b) => a.order - b.order);
  const next = backlogEntries[0];
  if (!next) return null;

  const backlog = { ...nomination.backlog };
  delete backlog[next.athleteId];

  const primary = { ...nomination.primary };
  primary[next.athleteId] = {
    ...next,
    status: 'pending',
    order: Object.keys(nomination.primary).length,
    noResponseAlertSent: false,
  };

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    primary,
    backlog,
    allRecipientIds: flattenRecipients({ primary, backlog }),
    updatedAt: Timestamp.now(),
  });

  if (next.recipientIds.length > 0) {
    try {
      await NotificationManager.onNominationPromoted({
        nominationId,
        clubId,
        title: nomination.title,
        athleteName: next.displayName,
        promotedBy,
        recipientIds: next.recipientIds,
      });
    } catch (err) {
      console.error('❌ Failed to send nomination promotion notification:', err);
    }
  }

  return next.displayName;
}

/**
 * Recipient — confirm or decline a nomination on behalf of an athlete
 * (a parent responds for their child; a direct athlete responds for themselves).
 */
export async function respondToNomination(
  clubId: string,
  nominationId: string,
  athleteId: string,
  response: 'confirmed' | 'declined',
  respondedBy: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');

  const entry = nomination.primary[athleteId];
  if (!entry) throw new Error('Athlete is not on the primary list');
  if (!entry.recipientIds.includes(respondedBy)) throw new Error('Not authorized to respond for this athlete');

  const primary = {
    ...nomination.primary,
    [athleteId]: {
      ...entry,
      status: response,
      respondedBy,
      respondedAt: Timestamp.now(),
    },
  };

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    primary,
    updatedAt: Timestamp.now(),
  });

  if (response === 'declined') {
    try {
      const staffRecipientIds = await getNominationStaffRecipients(clubId, nomination.teamId);
      await NotificationManager.onNominationDeclined({
        nominationId,
        clubId,
        title: nomination.title,
        athleteName: entry.displayName,
        declinedByRecipientId: respondedBy,
        staffRecipientIds,
      });
    } catch (err) {
      console.error('❌ Failed to send nomination declined notification:', err);
    }
  }
}

// ==================== Helpers ====================

export function isNominationDeadlinePassed(nomination: Nomination): boolean {
  const deadline = typeof nomination.deadline === 'string'
    ? new Date(nomination.deadline)
    : nomination.deadline.toDate();
  return new Date() > deadline;
}
