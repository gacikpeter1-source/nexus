/**
 * Pure phase-sequence math for the Training Timer tool — no Firestore here,
 * just turning a timer's config into a sequence of work/break phases and
 * computing what any viewer should currently be showing.
 *
 * resolveTrainingTimerPhase is the "independent mode" trick borrowed from
 * lap-timer apps like LapLync: every device's clock is already NTP-synced,
 * so given the same config + the same last-confirmed anchor (phaseStartedAt
 * + currentPhaseIndex), any device can work out what phase should be active
 * RIGHT NOW purely from elapsed wall-clock time — including walking across
 * several phase boundaries at once if it's been offline (or the tab was
 * backgrounded) through more than one of them. Firestore only needs to
 * distribute the anchor when a device is online; it isn't the thing devices
 * wait on moment-to-moment to know a phase ended.
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

export interface ResolvedTrainingTimerPhase {
  phaseIndex: number; // the phase that should be active right now
  phaseStartedAt: string; // boundary-aligned ISO start time for that phase — not "now"
  finished: boolean; // every phase's duration has elapsed (or Firestore already says so)
}

/**
 * Walks forward from the timer's last confirmed anchor to the phase that
 * should be active at `now`, jumping across as many boundaries as elapsed
 * time demands. Returns the SAME answer on every device given the same
 * timer doc and clock — that agreement is what makes it safe to use for
 * both local display/alarms and as the target state a sync write commits.
 */
export function resolveTrainingTimerPhase(timer: TrainingTimer, now: Date = new Date()): ResolvedTrainingTimerPhase {
  const phases = buildPhases(timer);
  const startIndex = Math.min(Math.max(0, timer.currentPhaseIndex), phases.length - 1);

  if (timer.status === 'finished') {
    return { phaseIndex: startIndex, phaseStartedAt: timer.phaseStartedAt || now.toISOString(), finished: true };
  }
  if (timer.mode === 'stopwatch' || timer.status !== 'running' || !timer.phaseStartedAt) {
    return { phaseIndex: startIndex, phaseStartedAt: timer.phaseStartedAt || now.toISOString(), finished: false };
  }

  let boundary = new Date(timer.phaseStartedAt).getTime();
  let elapsedMs = now.getTime() - boundary;
  let index = startIndex;

  while (index < phases.length) {
    const durationMs = phases[index].durationSec * 1000;
    if (elapsedMs < durationMs) {
      return { phaseIndex: index, phaseStartedAt: new Date(boundary).toISOString(), finished: false };
    }
    elapsedMs -= durationMs;
    boundary += durationMs;
    index += 1;
  }

  return { phaseIndex: phases.length - 1, phaseStartedAt: new Date(boundary).toISOString(), finished: true };
}

export interface LiveTimerState {
  phase: TimerPhase;
  phaseIndex: number;
  totalPhases: number;
  elapsedSec: number;
  remainingSec: number; // Infinity for stopwatch — elapsedSec is what matters there
  isLastPhase: boolean;
  /** Locally resolved — true once every phase's duration has elapsed, even before Firestore confirms it. */
  finished: boolean;
}

export function computeLiveState(timer: TrainingTimer, now: Date = new Date()): LiveTimerState {
  const phases = buildPhases(timer);
  const resolved = resolveTrainingTimerPhase(timer, now);
  const phase = phases[resolved.phaseIndex];

  let elapsedSec = 0;
  if (timer.phaseStartedAt) {
    const anchor = timer.status === 'paused' && timer.pausedAt ? new Date(timer.pausedAt) : now;
    elapsedSec = Math.max(0, (anchor.getTime() - new Date(resolved.phaseStartedAt).getTime()) / 1000);
  }

  const isStopwatch = phase.type === 'stopwatch';
  const remainingSec = isStopwatch ? Infinity : Math.max(0, phase.durationSec - elapsedSec);
  const isLastPhase = resolved.phaseIndex === phases.length - 1;

  return {
    phase,
    phaseIndex: resolved.phaseIndex,
    totalPhases: phases.length,
    elapsedSec,
    remainingSec,
    isLastPhase,
    finished: resolved.finished,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
