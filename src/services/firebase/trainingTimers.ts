/**
 * Firebase service for the Training Timer tool — a club-scoped, synced
 * interval/stopwatch clock any staff member can join and follow (see
 * types/index.ts's TrainingTimer doc comment and utils/trainingTimerPhases.ts
 * for how the sync actually works). Only the creator can change config or
 * control playback; advancing to the next phase when time runs out is the
 * one write any joined viewer's client is allowed to make (see
 * advancePhase), so the session keeps moving even if the creator's own
 * device isn't the one that notices first.
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
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { TrainingTimer, TrainingTimerMode } from '../../types';
import { buildPhases } from '../../utils/trainingTimerPhases';

const COLLECTION = 'trainingTimers';

export async function createTrainingTimer(params: {
  clubId: string;
  createdBy: string;
  createdByName: string;
  title?: string;
  mode: TrainingTimerMode;
  sets: number;
  workMinutes: number;
  breakMinutes: number;
  warningMinutesBefore: number;
}): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, COLLECTION), {
    clubId: params.clubId,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    ...(params.title?.trim() ? { title: params.title.trim() } : {}),
    mode: params.mode,
    sets: params.sets,
    workMinutes: params.workMinutes,
    breakMinutes: params.breakMinutes,
    warningMinutesBefore: params.warningMinutesBefore,
    status: 'idle',
    currentPhaseIndex: 0,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function getClubTrainingTimers(clubId: string): Promise<TrainingTimer[]> {
  const q = query(
    collection(db, COLLECTION),
    where('clubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    fsLimit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingTimer));
}

export async function getTrainingTimer(id: string): Promise<TrainingTimer | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as TrainingTimer) : null;
}

export function subscribeToTrainingTimer(id: string, callback: (timer: TrainingTimer | null) => void): Unsubscribe {
  return onSnapshot(doc(db, COLLECTION, id), snap => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as TrainingTimer) : null);
  });
}

/** Creator-only. Starts (or restarts from idle) the current phase's clock. */
export async function startTrainingTimer(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'running',
    phaseStartedAt: new Date().toISOString(),
    pausedAt: null,
    updatedAt: Timestamp.now(),
  });
}

/** Creator-only. Freezes the countdown — resumeTrainingTimer shifts phaseStartedAt to exclude the paused span. */
export async function pauseTrainingTimer(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'paused',
    pausedAt: new Date().toISOString(),
    updatedAt: Timestamp.now(),
  });
}

/** Creator-only. */
export async function resumeTrainingTimer(id: string): Promise<void> {
  const timerRef = doc(db, COLLECTION, id);
  const snap = await getDoc(timerRef);
  if (!snap.exists()) return;
  const timer = snap.data() as TrainingTimer;
  if (!timer.phaseStartedAt || !timer.pausedAt) {
    await updateDoc(timerRef, { status: 'running', pausedAt: null, updatedAt: Timestamp.now() });
    return;
  }
  const pausedForMs = Date.now() - new Date(timer.pausedAt).getTime();
  const shiftedStart = new Date(new Date(timer.phaseStartedAt).getTime() + pausedForMs).toISOString();
  await updateDoc(timerRef, {
    status: 'running',
    phaseStartedAt: shiftedStart,
    pausedAt: null,
    updatedAt: Timestamp.now(),
  });
}

/** Creator-only. Back to phase 0, idle — configuration is untouched. */
export async function resetTrainingTimer(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'idle',
    currentPhaseIndex: 0,
    phaseStartedAt: null,
    pausedAt: null,
    updatedAt: Timestamp.now(),
  });
}

export async function finishTrainingTimer(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'finished',
    pausedAt: null,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Creator-only, and only while idle — changing sets/durations mid-session
 * would leave the running clock referring to a phase sequence that no
 * longer matches, so the UI only offers this before starting.
 */
export async function updateTrainingTimerConfig(id: string, params: {
  title?: string;
  mode: TrainingTimerMode;
  sets: number;
  workMinutes: number;
  breakMinutes: number;
  warningMinutesBefore: number;
}): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...(params.title?.trim() ? { title: params.title.trim() } : {}),
    mode: params.mode,
    sets: params.sets,
    workMinutes: params.workMinutes,
    breakMinutes: params.breakMinutes,
    warningMinutesBefore: params.warningMinutesBefore,
    updatedAt: Timestamp.now(),
  });
}

/**
 * The one write any joined viewer (not just the creator) is allowed to
 * make — moving on once a phase's time has actually run out, guarded by a
 * transaction so simultaneous viewers don't double-advance or race past
 * a phase the creator has since paused/reset. No-ops if the phase already
 * moved on or the timer is no longer running.
 */
export async function advanceTrainingTimerPhase(id: string, expectedPhaseIndex: number): Promise<void> {
  const timerRef = doc(db, COLLECTION, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(timerRef);
    if (!snap.exists()) return;
    const timer = snap.data() as TrainingTimer;
    if (timer.status !== 'running' || timer.currentPhaseIndex !== expectedPhaseIndex) return;

    const phases = buildPhases(timer);
    const nextIndex = expectedPhaseIndex + 1;
    if (nextIndex >= phases.length) {
      tx.update(timerRef, { status: 'finished', pausedAt: null, updatedAt: Timestamp.now() });
    } else {
      tx.update(timerRef, {
        currentPhaseIndex: nextIndex,
        phaseStartedAt: new Date().toISOString(),
        updatedAt: Timestamp.now(),
      });
    }
  });
}

/** Creator, or club owner/admin doing cleanup. */
export async function deleteTrainingTimer(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
