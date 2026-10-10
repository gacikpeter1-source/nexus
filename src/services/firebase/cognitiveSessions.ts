/**
 * Firebase service for Cognitive Training sessions — players solve tasks
 * shown on a public TV while exercising; the trainer's phone shows the
 * same task plus its correct answer and records who got it right.
 *
 * Split into two Firestore collections — see types/index.ts's
 * CognitiveSession/CognitiveSessionPublic doc comments for why. This file
 * only ever touches the PRIVATE `cognitiveSessions` collection; the public
 * mirror is written exclusively by the mirrorCognitiveSessionPublic Cloud
 * Function trigger (functions/src/index.ts), never by the client.
 *
 * Per-athlete results live in a SUBCOLLECTION (cognitiveSessions/{id}/
 * results/{athleteId}), not an embedded map — see CognitiveResultDoc's doc
 * comment for why (a player needs to read only their own, never anyone
 * else's, which an embedded map can't express in Firestore rules).
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
  limit as fsLimit,
  runTransaction,
  writeBatch,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  deleteField,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { CognitiveSession, CognitiveSessionPublic, CognitiveParticipant, CognitiveResultDoc, CognitiveTemplate } from '../../types';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import { computeTotalTaskCount, MANUAL_ROUND_TASK_BUFFER } from '../../utils/cognitiveSessionPhases';

const COLLECTION = 'cognitiveSessions';
const PUBLIC_COLLECTION = 'cognitiveSessionsPublic';

export interface CreateCognitiveSessionParams {
  clubId: string;
  teamId?: string;
  createdBy: string;
  createdByName: string;
  gameId: string;
  gameConfig: Record<string, unknown>;
  participants: CognitiveParticipant[];
  roundMode: 'interval' | 'manual';
  roundSec: number; // 'interval' mode only, ignored for 'manual'
  roundCount: number; // 'interval' mode only, ignored for 'manual'
  breakSec: number; // 'interval' mode only, ignored for 'manual'
  taskDisplaySec: number;
  answerRevealDelaySec: number;
  answerRevealDurationSec: number;
  countdownSec: number;
  markingMode: 'markCorrect' | 'markIncorrect';
  tapGraceSec: number;
  fontScale?: number;
}

export async function createCognitiveSession(params: CreateCognitiveSessionParams): Promise<string> {
  const game = getCognitiveGame(params.gameId);
  if (!game) throw new Error(`Unknown cognitive game: ${params.gameId}`);

  // 'interval' mode pre-generates the whole plan up front (fixed round
  // count). 'manual' mode doesn't know how many rounds there will be, so it
  // only pre-generates round 0's buffer — advanceCognitiveRound() tops up
  // the plan with another buffer's worth each time the trainer starts a
  // new round.
  const totalTaskCount = params.roundMode === 'interval'
    ? computeTotalTaskCount(params)
    : MANUAL_ROUND_TASK_BUFFER;
  const generated = game.generateTasks(params.gameConfig, totalTaskCount);
  const plan = generated.map((task, taskIndex) => ({ taskIndex, content: task.content, correctAnswer: task.correctAnswer }));

  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, COLLECTION), {
    clubId: params.clubId,
    ...(params.teamId ? { teamId: params.teamId } : {}),
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    gameId: params.gameId,
    gameConfig: params.gameConfig,
    participants: params.participants,
    participantIds: params.participants.map(p => p.athleteId),
    roundMode: params.roundMode,
    roundSec: params.roundSec,
    roundCount: params.roundCount,
    breakSec: params.breakSec,
    taskDisplaySec: params.taskDisplaySec,
    answerRevealDelaySec: params.answerRevealDelaySec,
    answerRevealDurationSec: params.answerRevealDurationSec,
    countdownSec: params.countdownSec,
    markingMode: params.markingMode,
    tapGraceSec: params.tapGraceSec,
    ...(params.fontScale ? { fontScale: params.fontScale } : {}),
    plan,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function getCognitiveSession(id: string): Promise<CognitiveSession | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as CognitiveSession) : null;
}

export function subscribeToCognitiveSession(id: string, callback: (session: CognitiveSession | null) => void): Unsubscribe {
  return onSnapshot(doc(db, COLLECTION, id), snap => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as CognitiveSession) : null);
  });
}

/** Public mirror — what the unauthenticated TV page reads. No results (see CognitiveResultDoc). */
export function subscribeToCognitiveSessionPublic(id: string, callback: (session: CognitiveSessionPublic | null) => void): Unsubscribe {
  return onSnapshot(doc(db, PUBLIC_COLLECTION, id), snap => {
    callback(snap.exists() ? (snap.data() as CognitiveSessionPublic) : null);
  });
}

/** Live so a newly created session shows up for other staff already sitting on the hub page. */
export function subscribeToClubCognitiveSessions(clubId: string, callback: (sessions: CognitiveSession[]) => void): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    where('clubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    fsLimit(20)
  );
  return onSnapshot(
    q,
    snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CognitiveSession)));
    },
    err => {
      // Without this, a query failure (e.g. a missing index) leaves the hub
      // page's loading spinner spinning forever instead of showing an empty
      // list — the caller only ever hears back via this callback.
      console.error('subscribeToClubCognitiveSessions: query failed', err);
      callback([]);
    }
  );
}

/** Creator-only. Starts (or restarts from idle) the whole phase sequence's clock. */
export async function startCognitiveSession(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'running',
    startAt: new Date().toISOString(),
    pausedAt: deleteField(),
    currentRoundIndex: deleteField(),
    currentRoundStartAt: deleteField(),
    updatedAt: Timestamp.now(),
  });
}

/** Creator-only. Freezes the clock — resumeCognitiveSession shifts the relevant anchor to exclude the paused span. */
export async function pauseCognitiveSession(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'paused',
    pausedAt: new Date().toISOString(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only. Shifts startAt (and, in 'manual' mode, currentRoundStartAt
 * too, if a round is already underway) forward by however long the
 * session was paused, so resolveSessionPhase/resolveManualRoundPhase pick
 * up exactly where they left off — see utils/cognitiveSessionPhases.ts's
 * doc comment.
 */
export async function resumeCognitiveSession(id: string): Promise<void> {
  const sessionRef = doc(db, COLLECTION, id);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return;
  const session = snap.data() as CognitiveSession;
  if (!session.startAt || !session.pausedAt) {
    await updateDoc(sessionRef, { status: 'running', pausedAt: deleteField(), updatedAt: Timestamp.now() });
    return;
  }
  const pausedForMs = Date.now() - new Date(session.pausedAt).getTime();
  const shiftedStartAt = new Date(new Date(session.startAt).getTime() + pausedForMs).toISOString();
  const update: Record<string, unknown> = {
    status: 'running',
    startAt: shiftedStartAt,
    pausedAt: deleteField(),
    updatedAt: Timestamp.now(),
  };
  if (session.currentRoundStartAt) {
    update.currentRoundStartAt = new Date(new Date(session.currentRoundStartAt).getTime() + pausedForMs).toISOString();
  }
  await updateDoc(sessionRef, update);
}

/** Creator-only. */
export async function finishCognitiveSession(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'finished',
    pausedAt: deleteField(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only. Back to idle so the same configuration/plan can be run
 * again from the start. Clears every athlete's results subcollection doc
 * too — without this, re-running the same quiz left every athlete's
 * correct/incorrect marks from the PREVIOUS run sitting on the session,
 * showing as already-marked on tasks nobody has answered yet in the new run.
 */
export async function resetCognitiveSession(id: string): Promise<void> {
  const resultsSnap = await getDocs(collection(db, COLLECTION, id, 'results'));
  await Promise.all(resultsSnap.docs.map(d => deleteDoc(d.ref)));

  await updateDoc(doc(db, COLLECTION, id), {
    status: 'idle',
    startAt: deleteField(),
    pausedAt: deleteField(),
    currentRoundIndex: deleteField(),
    currentRoundStartAt: deleteField(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only, 'manual' mode only. Advances to the next round: anchors a
 * fresh currentRoundStartAt and tops up the plan with another
 * MANUAL_ROUND_TASK_BUFFER tasks for it (round 0 already has its buffer
 * from createCognitiveSession and never needs its own anchor — see
 * resolveManualRoundPhase).
 */
export async function advanceCognitiveRound(id: string): Promise<void> {
  const sessionRef = doc(db, COLLECTION, id);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return;
  const session = { id: snap.id, ...snap.data() } as CognitiveSession;
  if (session.roundMode !== 'manual') throw new Error('advanceCognitiveRound is only valid for manual-mode sessions');

  const game = getCognitiveGame(session.gameId);
  if (!game) throw new Error(`Unknown cognitive game: ${session.gameId}`);

  const nextRoundIndex = (session.currentRoundIndex ?? 0) + 1;
  const generated = game.generateTasks(session.gameConfig, MANUAL_ROUND_TASK_BUFFER);
  const startIndex = nextRoundIndex * MANUAL_ROUND_TASK_BUFFER;
  const newTasks = generated.map((task, i) => ({ taskIndex: startIndex + i, content: task.content, correctAnswer: task.correctAnswer }));

  await updateDoc(sessionRef, {
    plan: [...session.plan, ...newTasks],
    currentRoundIndex: nextRoundIndex,
    currentRoundStartAt: new Date().toISOString(),
    updatedAt: Timestamp.now(),
  });
}

// ==================== Per-athlete results (subcollection) ====================

function resultsRef(sessionId: string, athleteId: string) {
  return doc(db, COLLECTION, sessionId, 'results', athleteId);
}

/** Staff on the session's club/team. Live, so every connected trainer's phone sees every tap. */
export function subscribeToCognitiveResults(sessionId: string, callback: (results: CognitiveResultDoc[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION, sessionId, 'results'),
    snap => callback(snap.docs.map(d => d.data() as CognitiveResultDoc)),
    err => {
      console.error('subscribeToCognitiveResults: query failed', err);
      callback([]);
    }
  );
}

/** A player (or their parent) reading only their own results — never anyone else's, see CognitiveResultDoc. */
export function subscribeToMyCognitiveResult(sessionId: string, athleteId: string, callback: (result: CognitiveResultDoc | null) => void): Unsubscribe {
  return onSnapshot(resultsRef(sessionId, athleteId), snap => {
    callback(snap.exists() ? (snap.data() as CognitiveResultDoc) : null);
  });
}

/**
 * Staff-only. Records (or corrects) one athlete's correct/incorrect mark
 * for one task — transactional so two quick taps in a row never race each
 * other into losing an update. No-op for guests (no athleteId, nothing to
 * read back — their marks only ever matter live on the control page via
 * the in-memory undo stack, not persisted per-athlete).
 */
export async function recordCognitiveTaskResult(
  sessionId: string,
  athleteId: string,
  displayName: string,
  taskIndex: number,
  correct: boolean
): Promise<void> {
  const ref = resultsRef(sessionId, athleteId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const existing: CognitiveResultDoc['entries'] = snap.exists() ? (snap.data() as CognitiveResultDoc).entries || [] : [];
    const entries = [...existing.filter(r => r.taskIndex !== taskIndex), { taskIndex, correct }]
      .sort((a, b) => a.taskIndex - b.taskIndex);
    tx.set(ref, { athleteId, displayName, entries, updatedAt: Timestamp.now() });
  });
}

/** Staff-only — undoes a single mark (removes the entry entirely, back to "not yet recorded"). */
export async function removeCognitiveTaskResult(sessionId: string, athleteId: string, taskIndex: number): Promise<void> {
  const ref = resultsRef(sessionId, athleteId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const existing = (snap.data() as CognitiveResultDoc).entries || [];
    const entries = existing.filter(r => r.taskIndex !== taskIndex);
    tx.update(ref, { entries, updatedAt: Timestamp.now() });
  });
}

/**
 * Staff-only. For every participant NOT in explicitlyMarkedAthleteIds,
 * records defaultCorrect for taskIndex — unless they already have an
 * entry for it (never clobbers an explicit tap, even one attributed here
 * late via the tap-grace window). Called once a task's display window
 * ends, so the trainer only ever has to tap the exceptions (see
 * markingMode) while every participant still ends up with a real recorded
 * result for every task — required for accurate per-player statistics.
 */
export async function fillDefaultTaskResults(
  sessionId: string,
  participants: CognitiveParticipant[],
  taskIndex: number,
  explicitlyMarkedAthleteIds: Set<string>,
  defaultCorrect: boolean
): Promise<void> {
  const toFill = participants.filter(p => !explicitlyMarkedAthleteIds.has(p.athleteId));
  if (toFill.length === 0) return;

  const snaps = await Promise.all(toFill.map(p => getDoc(resultsRef(sessionId, p.athleteId))));
  const batch = writeBatch(db);
  let hasWrites = false;
  toFill.forEach((p, i) => {
    const snap = snaps[i];
    const existing: CognitiveResultDoc['entries'] = snap.exists() ? (snap.data() as CognitiveResultDoc).entries || [] : [];
    if (existing.some(e => e.taskIndex === taskIndex)) return;
    const entries = [...existing, { taskIndex, correct: defaultCorrect }].sort((a, b) => a.taskIndex - b.taskIndex);
    batch.set(resultsRef(sessionId, p.athleteId), { athleteId: p.athleteId, displayName: p.displayName, entries, updatedAt: Timestamp.now() });
    hasWrites = true;
  });
  if (hasWrites) await batch.commit();
}

/** Staff-only. Every session for a club (optionally one team) with its full results subcollection — powers the trainer-facing stats page. */
export async function getClubCognitiveStats(clubId: string, teamId?: string): Promise<{ session: CognitiveSession; results: CognitiveResultDoc[] }[]> {
  const sessionsSnap = await getDocs(query(collection(db, COLLECTION), where('clubId', '==', clubId)));
  const sessions = sessionsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as CognitiveSession))
    .filter(s => !teamId || s.teamId === teamId);

  return Promise.all(sessions.map(async session => {
    const resultsSnap = await getDocs(collection(db, COLLECTION, session.id, 'results'));
    return { session, results: resultsSnap.docs.map(d => d.data() as CognitiveResultDoc) };
  }));
}

/** Every session (any club the caller can read) a given athlete has results in — powers the player-facing stats page. */
export async function getCognitiveResultsForAthlete(athleteId: string): Promise<{ session: CognitiveSession; result: CognitiveResultDoc }[]> {
  // array-contains on the flat participantIds (not an equality filter on
  // clubId) is what lets a non-staff participant run this at all — the
  // Firestore rule above can only prove read access per-document when the
  // query itself is constrained to docs the caller is actually in.
  const sessionsSnap = await getDocs(query(collection(db, COLLECTION), where('participantIds', 'array-contains', athleteId)));
  const out: { session: CognitiveSession; result: CognitiveResultDoc }[] = [];
  for (const sessionDoc of sessionsSnap.docs) {
    const resultSnap = await getDoc(resultsRef(sessionDoc.id, athleteId));
    if (resultSnap.exists()) {
      out.push({ session: { id: sessionDoc.id, ...sessionDoc.data() } as CognitiveSession, result: resultSnap.data() as CognitiveResultDoc });
    }
  }
  return out;
}

/** Creator, or club owner/admin doing cleanup. Results subcollection docs are orphaned (never read once the session is gone) — Firestore doesn't cascade-delete, but nothing ever queries a dangling subcollection, so this is a harmless, accepted leftover rather than something worth a batch cleanup here. */
export async function deleteCognitiveSession(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ==================== Templates ====================

export type CognitiveTemplateInput = Omit<CognitiveTemplate, 'id' | 'createdAt'>;

export async function createCognitiveTemplate(input: CognitiveTemplateInput): Promise<string> {
  const docRef = await addDoc(collection(db, 'clubs', input.clubId, 'cognitiveTemplates'), {
    ...input,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function getClubCognitiveTemplates(clubId: string): Promise<CognitiveTemplate[]> {
  const snap = await getDocs(query(collection(db, 'clubs', clubId, 'cognitiveTemplates'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CognitiveTemplate));
}

export async function deleteCognitiveTemplate(clubId: string, templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'cognitiveTemplates', templateId));
}
