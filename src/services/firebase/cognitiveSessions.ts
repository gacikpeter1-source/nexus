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
 */

import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  runTransaction,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  deleteField,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { CognitiveSession, CognitiveSessionPublic, CognitiveTaskResult } from '../../types';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import { computeTotalTaskCount } from '../../utils/cognitiveSessionPhases';

const COLLECTION = 'cognitiveSessions';
const PUBLIC_COLLECTION = 'cognitiveSessionsPublic';

export async function createCognitiveSession(params: {
  clubId: string;
  teamId?: string;
  createdBy: string;
  createdByName: string;
  gameId: string;
  gameConfig: Record<string, unknown>;
  intervalSec: number;
  taskDisplaySec: number;
  breakSec: number;
  intervalCount: number;
  countdownSec: number;
  fontScale?: number;
}): Promise<string> {
  const game = getCognitiveGame(params.gameId);
  if (!game) throw new Error(`Unknown cognitive game: ${params.gameId}`);

  const totalTaskCount = computeTotalTaskCount(params);
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
    intervalSec: params.intervalSec,
    taskDisplaySec: params.taskDisplaySec,
    breakSec: params.breakSec,
    intervalCount: params.intervalCount,
    countdownSec: params.countdownSec,
    ...(params.fontScale ? { fontScale: params.fontScale } : {}),
    plan,
    status: 'idle',
    results: {},
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

/** Public mirror — what the unauthenticated TV page reads. No correctAnswer, no results. */
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
    updatedAt: Timestamp.now(),
  });
}

/** Creator-only. Freezes the clock — resumeCognitiveSession shifts startAt to exclude the paused span. */
export async function pauseCognitiveSession(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'paused',
    pausedAt: new Date().toISOString(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only. Shifts startAt forward by however long the session was
 * paused, so resolveSessionPhase picks up exactly where it left off — see
 * utils/cognitiveSessionPhases.ts's doc comment.
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
  await updateDoc(sessionRef, {
    status: 'running',
    startAt: shiftedStartAt,
    pausedAt: deleteField(),
    updatedAt: Timestamp.now(),
  });
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
 * again from the start. Clears results too — without this, re-running the
 * same quiz left every athlete's correct/incorrect marks from the PREVIOUS
 * run sitting on the session, showing as already-marked on tasks nobody
 * has answered yet in the new run.
 */
export async function resetCognitiveSession(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'idle',
    startAt: deleteField(),
    pausedAt: deleteField(),
    results: {},
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only. Records (or corrects) one athlete's correct/incorrect mark
 * for one task — transactional so two quick taps in a row never race each
 * other into losing an update.
 */
export async function recordCognitiveTaskResult(
  id: string,
  athleteId: string,
  taskIndex: number,
  correct: boolean
): Promise<void> {
  const sessionRef = doc(db, COLLECTION, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists()) return;
    const session = snap.data() as CognitiveSession;
    const existing: CognitiveTaskResult[] = session.results?.[athleteId] || [];
    const updated = [...existing.filter(r => r.taskIndex !== taskIndex), { taskIndex, correct }]
      .sort((a, b) => a.taskIndex - b.taskIndex);
    tx.update(sessionRef, {
      [`results.${athleteId}`]: updated,
      updatedAt: Timestamp.now(),
    });
  });
}

/** Creator, or club owner/admin doing cleanup. */
export async function deleteCognitiveSession(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
