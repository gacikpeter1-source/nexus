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
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Nomination, NominationEntry, NominationGame, NominationKind, Event, EventResponseData, TournamentBracket, GameGoalEvent, GamePenaltyEvent, GameGoalieStat, User } from '../../types';
import { getTeamMembers } from './teams';
import { NotificationManager } from '../notifications/NotificationManager';
import { resolveTeamAthletes } from '../../utils/resolveTeamAthletes';

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
 * Uses the same resolution rule as AttendTab/useTeamAthletes (resolveTeamAthletes).
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
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
    }))
  ).filter(Boolean) as User[];

  const { directAthletes, childrenForThisTeam, parentsWithNoChildHere } = await resolveTeamAthletes(members, teamId);

  const directCandidates: NominationCandidate[] = directAthletes.map(member => ({
    athleteId: member.id,
    isChild: false,
    recipientIds: [member.id],
    displayName: member.displayName || member.email || 'Unknown',
  }));

  const childCandidates: NominationCandidate[] = childrenForThisTeam.map(child => ({
    athleteId: child.id,
    isChild: true,
    recipientIds: Array.isArray(child.parentIds) && child.parentIds.length > 0 ? child.parentIds : [],
    displayName: child.displayName || 'Unknown',
  }));

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

/** Find the (at most one) real info event for a nomination. */
async function getNominationInfoEventDoc(nominationId: string) {
  const existingQuery = query(
    collection(db, 'events'),
    where('nominationId', '==', nominationId),
    where('isNominationInfo', '==', true)
  );
  const snap = await getDocs(existingQuery);
  return snap.docs;
}

/** Primary-list-derived responses/confirmedCount/recipientIds, shared by sync and mirror below. */
function deriveEventFieldsFromRoster(nomination: Pick<Nomination, 'primary'>) {
  const primaryEntries = Object.values(nomination.primary);
  const responses: Record<string, EventResponseData> = {};
  primaryEntries.forEach(entry => {
    if (entry.status === 'pending') return;
    const status = entry.status;
    entry.recipientIds.forEach(id => {
      responses[id] = { response: status, timestamp: Timestamp.now() };
    });
  });
  const confirmedCount = primaryEntries.filter(e => e.status === 'confirmed').length;
  const nominationRecipientIds = Array.from(new Set(primaryEntries.flatMap(e => e.recipientIds)));
  return { responses, confirmedCount, nominationRecipientIds };
}

/**
 * Keep the single team-wide informational calendar event for a nomination in
 * sync — one event per nomination (games[] is irrelevant here; the event's
 * date comes from nomination.gameDate, the actual game/tournament day).
 * Upserts in place (same event id across edits) so links/notifications stay
 * valid. Staff-triggered (full write — title/date/location/etc.): callers
 * are createNomination, updateNominationDetails, addNominationEntry,
 * removeNominationEntry, promoteNextFromBacklog. A recipient's own response
 * instead goes through the narrower mirrorNominationResponseToEvent below,
 * which only touches the fields a non-staff recipient is allowed to write.
 * Never throws — a sync failure shouldn't block the nomination write that
 * triggered it; callers wrap this in try/catch.
 */
export async function syncNominationInfoEvents(nomination: Nomination): Promise<void> {
  const existingDocs = await getNominationInfoEventDoc(nomination.id);

  if (nomination.cancelled || !nomination.gameDate) {
    if (existingDocs.length === 0) return;
    const batch = writeBatch(db);
    existingDocs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return;
  }

  const { responses, confirmedCount, nominationRecipientIds } = deriveEventFieldsFromRoster(nomination);
  const eventFields = {
    title: nomination.title,
    type: 'team' as const,
    visibilityLevel: 'team' as const,
    category: nomination.kind === 'tournament' ? 'tournament' as const : 'game' as const,
    clubId: nomination.clubId,
    teamId: nomination.teamId,
    createdBy: nomination.createdBy,
    date: nomination.gameDate,
    confirmedCount,
    responses,
    isNominationInfo: true,
    nominationId: nomination.id,
    nominationRecipientIds,
    updatedAt: Timestamp.now(),
  };

  if (existingDocs.length > 0) {
    const batch = writeBatch(db);
    existingDocs.forEach((d, i) => {
      if (i === 0) batch.update(d.ref, eventFields);
      else batch.delete(d.ref); // defensive cleanup of any stray duplicate
    });
    await batch.commit();
  } else {
    await addDoc(collection(db, 'events'), { ...eventFields, createdAt: Timestamp.now() } as Omit<Event, 'id'>);
  }
}

/**
 * Recipient-triggered mirror — called after respondToNomination writes the
 * nomination doc, to reflect the new status on the linked info event too.
 * Deliberately narrow (only responses/confirmedCount/updatedAt) to match
 * what the Firestore rules allow a non-staff recipient to write; never
 * creates the event (that's staff-only, via syncNominationInfoEvents) and
 * is a silent no-op if it doesn't exist yet. Never throws — callers wrap
 * this in try/catch.
 */
async function mirrorNominationResponseToEvent(nomination: Pick<Nomination, 'id' | 'primary'>): Promise<void> {
  const existingDocs = await getNominationInfoEventDoc(nomination.id);
  if (existingDocs.length === 0) return;

  const { responses, confirmedCount } = deriveEventFieldsFromRoster(nomination);
  await updateDoc(existingDocs[0].ref, {
    responses,
    confirmedCount,
    updatedAt: Timestamp.now(),
  });
}

export async function createNomination(params: {
  clubId: string;
  teamId: string;
  createdBy: string;
  title: string;
  kind: NominationKind;
  sport?: string;
  games: NominationGame[];
  gameDate: string;
  deadline: Date;
  primarySize: number;
  primaryCandidates: NominationCandidate[];
  backlogCandidates: NominationCandidate[];
}): Promise<string> {
  const { clubId, teamId, createdBy, title, kind, sport, games, gameDate, deadline, primarySize, primaryCandidates, backlogCandidates } = params;

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
    ...(sport ? { sport } : {}), // Firestore rejects an explicit `undefined` field value
    games,
    gameDate,
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
    await syncNominationInfoEvents({ ...newNomination, id: ref.id });
  } catch (err) {
    console.error('❌ Failed to sync nomination info events:', err);
  }

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

/**
 * Team view for regular (non-staff) members: only tournament-kind nominations.
 * A mixed-kind query (getTeamNominations) can't be proven safe by the security
 * rules for a non-staff reader — the rule only opens tournament-kind docs to
 * any club member, and Firestore rejects a query that could hypothetically
 * also match a single-game nomination the reader isn't a recipient of. Filtering
 * by kind here keeps the query provably within what the rule allows.
 */
export async function getTeamTournaments(clubId: string, teamId: string): Promise<Nomination[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'nominations'),
    where('teamId', '==', teamId),
    where('kind', '==', 'tournament'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Nomination);
}

/** Staff view: every tournament-kind nomination across the whole club, any team. */
export async function getClubTournaments(clubId: string): Promise<Nomination[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'nominations'),
    where('kind', '==', 'tournament')
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

/** Staff — set (or clear) which resolved bracket team name is this club's own team. */
export async function setNominationFavoriteTeam(
  clubId: string,
  nominationId: string,
  teamName: string | null
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    ...(teamName ? { favoriteTeamName: teamName } : { favoriteTeamName: deleteField() }),
    updatedAt: Timestamp.now(),
  });
}

/** Staff — replace the whole tournament bracket (groups + matches). Always allowed, no lockdown. */
export async function updateNominationBracket(
  clubId: string,
  nominationId: string,
  bracket: TournamentBracket
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    bracket,
    updatedAt: Timestamp.now(),
  });
}

/** Staff — enter/edit a single game's final score. Always allowed, no lockdown. */
export async function updateNominationGameScore(
  clubId: string,
  nominationId: string,
  gameId: string,
  teamScore: number,
  opponentScore: number
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');

  const games = nomination.games.map(g =>
    g.id === gameId ? { ...g, teamScore, opponentScore } : g
  );

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    games,
    updatedAt: Timestamp.now(),
  });
}

/** Internal helper — read-modify-write a single game's fields within a nomination. */
async function patchGame(
  clubId: string,
  nominationId: string,
  gameId: string,
  patch: Partial<Pick<NominationGame, 'goalEvents' | 'penaltyEvents' | 'goalieStats'>>
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');

  const games = nomination.games.map(g => (g.id === gameId ? { ...g, ...patch } : g));

  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    games,
    updatedAt: Timestamp.now(),
  });
}

/** Staff — record a goal (scorer + optional assists) for a game. */
export async function addGameGoalEvent(
  clubId: string,
  nominationId: string,
  gameId: string,
  scorerId: string,
  assistIds: string[] = []
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const newEvent: GameGoalEvent = {
    id: crypto.randomUUID(),
    scorerId,
    ...(assistIds.length > 0 ? { assistIds } : {}),
  };
  const goalEvents = [...(game.goalEvents || []), newEvent];
  await patchGame(clubId, nominationId, gameId, { goalEvents });
}

/** Staff — remove a previously recorded goal. */
export async function removeGameGoalEvent(
  clubId: string,
  nominationId: string,
  gameId: string,
  eventId: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const goalEvents = (game.goalEvents || []).filter(e => e.id !== eventId);
  await patchGame(clubId, nominationId, gameId, { goalEvents });
}

/** Staff — record a penalty for a player. */
export async function addGamePenaltyEvent(
  clubId: string,
  nominationId: string,
  gameId: string,
  athleteId: string,
  minutes: number
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const newEvent: GamePenaltyEvent = { id: crypto.randomUUID(), athleteId, minutes };
  const penaltyEvents = [...(game.penaltyEvents || []), newEvent];
  await patchGame(clubId, nominationId, gameId, { penaltyEvents });
}

/** Staff — remove a previously recorded penalty. */
export async function removeGamePenaltyEvent(
  clubId: string,
  nominationId: string,
  gameId: string,
  eventId: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const penaltyEvents = (game.penaltyEvents || []).filter(e => e.id !== eventId);
  await patchGame(clubId, nominationId, gameId, { penaltyEvents });
}

/** Staff — start tracking a goalie for this game, at zero saves/goals-against. No-op if already tracked. */
export async function addGoalieToGame(
  clubId: string,
  nominationId: string,
  gameId: string,
  athleteId: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const existing = game.goalieStats || [];
  if (existing.some(g => g.athleteId === athleteId)) return;

  const goalieStats = [...existing, { athleteId, saves: 0, goalsAgainst: 0 }];
  await patchGame(clubId, nominationId, gameId, { goalieStats });
}

/** Staff — add a save or a goal-against to a goalie's tally for this game. */
export async function addGoalieStatTick(
  clubId: string,
  nominationId: string,
  gameId: string,
  athleteId: string,
  kind: 'save' | 'goalAgainst'
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const existing = game.goalieStats || [];
  const idx = existing.findIndex(g => g.athleteId === athleteId);
  const delta: Partial<GameGoalieStat> = kind === 'save' ? { saves: 1 } : { goalsAgainst: 1 };

  let goalieStats: GameGoalieStat[];
  if (idx === -1) {
    goalieStats = [...existing, { athleteId, saves: 0, goalsAgainst: 0, ...delta } as GameGoalieStat];
  } else {
    goalieStats = existing.map((g, i) =>
      i === idx ? { ...g, saves: g.saves + (delta.saves || 0), goalsAgainst: g.goalsAgainst + (delta.goalsAgainst || 0) } : g
    );
  }
  await patchGame(clubId, nominationId, gameId, { goalieStats });
}

/** Staff — remove a goalie from this game's stat tally entirely. */
export async function removeGoalieFromGame(
  clubId: string,
  nominationId: string,
  gameId: string,
  athleteId: string
): Promise<void> {
  const nomination = await getNomination(clubId, nominationId);
  if (!nomination) throw new Error('Nomination not found');
  const game = nomination.games.find(g => g.id === gameId);
  if (!game) throw new Error('Game not found');

  const goalieStats = (game.goalieStats || []).filter(g => g.athleteId !== athleteId);
  await patchGame(clubId, nominationId, gameId, { goalieStats });
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

/** Staff edit — title/games/gameDate/deadline/primarySize/cancelled. Always allowed, deadline or not. */
export async function updateNominationDetails(
  clubId: string,
  nominationId: string,
  updates: Partial<Pick<Nomination, 'title' | 'games' | 'gameDate' | 'primarySize' | 'cancelled'>> & { deadline?: Date | Nomination['deadline'] }
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'nominations', nominationId), {
    ...updates,
    updatedAt: Timestamp.now(),
  });

  try {
    const fresh = await getNomination(clubId, nominationId);
    if (fresh) await syncNominationInfoEvents(fresh);
  } catch (err) {
    console.error('❌ Failed to sync nomination info events:', err);
  }
}

export async function deleteNomination(clubId: string, nominationId: string): Promise<void> {
  try {
    const existingDocs = await getNominationInfoEventDoc(nominationId);
    const batch = writeBatch(db);
    existingDocs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('❌ Failed to delete nomination info events:', err);
  }

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

  try {
    await syncNominationInfoEvents({ ...nomination, ...updated });
  } catch (err) {
    console.error('❌ Failed to sync nomination info events:', err);
  }

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

  try {
    await syncNominationInfoEvents({ ...nomination, primary, backlog });
  } catch (err) {
    console.error('❌ Failed to sync nomination info events:', err);
  }
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

  try {
    await syncNominationInfoEvents({ ...nomination, primary, backlog });
  } catch (err) {
    console.error('❌ Failed to sync nomination info events:', err);
  }

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

  try {
    await mirrorNominationResponseToEvent({ ...nomination, primary });
  } catch (err) {
    console.error('❌ Failed to mirror nomination response to event:', err);
  }

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
