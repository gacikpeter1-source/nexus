/**
 * Pure phase-sequence math for the Training Timer tool — no Firestore here,
 * just turning a timer's config into a sequence of work/break phases and
 * computing what any viewer should currently be showing. Every joined
 * device calls computeLiveState with its own local clock, but always
 * against the same shared phaseStartedAt from Firestore, so everyone's
 * countdown agrees regardless of when they joined or how their own clock
 * is set.
 */

import type { TrainingTimer } from '../types';

export interface TimerPhase {
  type: 'work' | 'break' | 'stopwatch';
  durationSec: number; // meaningless (0) for 'stopwatch' — it's open-ended
  setNumber?: number; // 1-indexed, only present for 'work' phases
}

/** No trailing break is scheduled after the final set — practice just ends. */
export function buildPhases(timer: Pick<TrainingTimer, 'mode' | 'sets' | 'workMinutes' | 'breakMinutes'>): TimerPhase[] {
  if (timer.mode === 'stopwatch') return [{ type: 'stopwatch', durationSec: 0 }];

  const phases: TimerPhase[] = [];
  const sets = Math.max(1, timer.sets);
  for (let i = 1; i <= sets; i++) {
    phases.push({ type: 'work', durationSec: Math.max(1, timer.workMinutes) * 60, setNumber: i });
    if (i < sets && timer.breakMinutes > 0) {
      phases.push({ type: 'break', durationSec: timer.breakMinutes * 60 });
    }
  }
  return phases;
}

export interface LiveTimerState {
  phase: TimerPhase;
  phaseIndex: number;
  totalPhases: number;
  elapsedSec: number;
  remainingSec: number; // Infinity for stopwatch — elapsedSec is what matters there
  isLastPhase: boolean;
  /** True once a running (non-stopwatch) phase has counted past its duration — the driving client should advance it. */
  shouldAdvance: boolean;
}

export function computeLiveState(timer: TrainingTimer, now: Date = new Date()): LiveTimerState {
  const phases = buildPhases(timer);
  const phaseIndex = Math.min(Math.max(0, timer.currentPhaseIndex), phases.length - 1);
  const phase = phases[phaseIndex];

  let elapsedSec = 0;
  if (timer.phaseStartedAt) {
    const anchor = timer.status === 'paused' && timer.pausedAt ? new Date(timer.pausedAt) : now;
    elapsedSec = Math.max(0, (anchor.getTime() - new Date(timer.phaseStartedAt).getTime()) / 1000);
  }

  const isStopwatch = phase.type === 'stopwatch';
  const remainingSec = isStopwatch ? Infinity : Math.max(0, phase.durationSec - elapsedSec);
  const isLastPhase = phaseIndex === phases.length - 1;

  return {
    phase,
    phaseIndex,
    totalPhases: phases.length,
    elapsedSec,
    remainingSec,
    isLastPhase,
    shouldAdvance: timer.status === 'running' && !isStopwatch && remainingSec <= 0,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
