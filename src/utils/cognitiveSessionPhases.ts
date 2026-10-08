/**
 * Pure phase-sequence math for Cognitive Training sessions — no Firestore
 * here, mirroring the "wall-clock anchor" trick in trainingTimerPhases.ts
 * but generalized to a heterogeneous countdown/task/break sequence instead
 * of uniform work/break.
 *
 * One INTERVAL is a physical training cycle (e.g. 1 minute of exercise)
 * during which tasks keep rotating every taskDisplaySec — not one task per
 * interval. A break only ever happens BETWEEN intervals, never mid-interval.
 *
 * Unlike TrainingTimer, a session's phase sequence never changes once
 * created (no mid-session reconfiguration), so a single startAt anchor for
 * the whole sequence is enough — no stored "current phase index" is ever
 * written back to Firestore. Every device (TV, phone, or a late joiner)
 * computes the same answer purely from (config, status, startAt, pausedAt)
 * + its own clock, including jumping across several phase boundaries at
 * once after being offline. Pausing freezes the phase/elapsed math at
 * pausedAt; resuming shifts startAt forward by however long the pause
 * lasted (see services/firebase/cognitiveSessions.ts's resumeSession), so
 * elapsed time always excludes time spent paused without needing a stored
 * phase index to "freeze" against.
 */

export type SessionPhaseType = 'countdown' | 'task' | 'break';

export interface SessionPhase {
  type: SessionPhaseType;
  durationSec: number;
  taskIndex?: number; // 0-indexed into the session's plan — only present for 'task' phases
}

export interface SessionPhaseConfig {
  countdownSec: number;
  intervalSec: number; // duration of one training cycle
  taskDisplaySec: number; // how long each individual task stays on screen within an interval
  breakSec: number; // 0 — no break between intervals
  intervalCount: number;
}

/** How many tasks fit in one interval, given how long each stays on screen. */
export function tasksPerInterval(config: Pick<SessionPhaseConfig, 'intervalSec' | 'taskDisplaySec'>): number {
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const intervalSec = Math.max(taskDisplaySec, config.intervalSec);
  return Math.max(1, Math.floor(intervalSec / taskDisplaySec));
}

/** Total number of tasks the full plan needs to pre-generate for this config. */
export function computeTotalTaskCount(config: Pick<SessionPhaseConfig, 'intervalSec' | 'taskDisplaySec' | 'intervalCount'>): number {
  return Math.max(1, config.intervalCount) * tasksPerInterval(config);
}

/**
 * [countdown?, task, task, ..., break?, task, task, ..., break?, ...] —
 * tasksPerInterval() tasks back-to-back per interval (any remainder from
 * intervalSec not dividing evenly by taskDisplaySec is folded into the
 * last task of that interval so the interval's total duration is exact),
 * a break between intervals (never after the last one), repeated
 * intervalCount times.
 */
export function buildPhaseSequence(config: SessionPhaseConfig): SessionPhase[] {
  const phases: SessionPhase[] = [];
  if (config.countdownSec > 0) {
    phases.push({ type: 'countdown', durationSec: config.countdownSec });
  }

  const intervalCount = Math.max(1, config.intervalCount);
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const intervalSec = Math.max(taskDisplaySec, config.intervalSec);
  const perInterval = tasksPerInterval(config);
  const leftoverSec = intervalSec - perInterval * taskDisplaySec;

  let taskIndex = 0;
  for (let i = 0; i < intervalCount; i++) {
    for (let j = 0; j < perInterval; j++) {
      const isLastTaskInInterval = j === perInterval - 1;
      const durationSec = isLastTaskInInterval ? taskDisplaySec + leftoverSec : taskDisplaySec;
      phases.push({ type: 'task', durationSec, taskIndex });
      taskIndex += 1;
    }
    if (i < intervalCount - 1 && config.breakSec > 0) {
      phases.push({ type: 'break', durationSec: config.breakSec });
    }
  }
  return phases;
}

export interface SessionTiming {
  status: 'idle' | 'running' | 'paused' | 'finished';
  startAt?: string; // ISO — the instant the countdown (or first task, if no countdown) began
  pausedAt?: string; // ISO — set while status is 'paused'
}

export interface ResolvedSessionPhase {
  phase: SessionPhase;
  phaseIndex: number;
  totalPhases: number;
  elapsedSec: number;
  remainingSec: number;
  isLastPhase: boolean;
  /** Locally resolved — true once every phase's duration has elapsed, even before Firestore's status says 'finished'. */
  finished: boolean;
}

/**
 * Resolves which phase should be active right now, purely from elapsed
 * wall-clock time since startAt. Never mutates anything and never throws —
 * safe to call every animation frame on the TV or the phone.
 */
export function resolveSessionPhase(
  config: SessionPhaseConfig,
  timing: SessionTiming,
  now: Date = new Date()
): ResolvedSessionPhase {
  const phases = buildPhaseSequence(config);
  const lastIndex = phases.length - 1;

  const finishedResult = (): ResolvedSessionPhase => ({
    phase: phases[lastIndex],
    phaseIndex: lastIndex,
    totalPhases: phases.length,
    elapsedSec: phases[lastIndex].durationSec,
    remainingSec: 0,
    isLastPhase: true,
    finished: true,
  });

  if (timing.status === 'finished') return finishedResult();

  if (timing.status === 'idle' || !timing.startAt) {
    return {
      phase: phases[0],
      phaseIndex: 0,
      totalPhases: phases.length,
      elapsedSec: 0,
      remainingSec: phases[0].durationSec,
      isLastPhase: lastIndex === 0,
      finished: false,
    };
  }

  // While paused, freezing "now" at pausedAt gives a fixed, stable answer —
  // resuming later shifts startAt forward to compensate, so this never
  // needs to track a separately-stored phase index.
  const effectiveNow = timing.status === 'paused' && timing.pausedAt ? new Date(timing.pausedAt) : now;
  let elapsedMs = Math.max(0, effectiveNow.getTime() - new Date(timing.startAt).getTime());

  let index = 0;
  while (index < phases.length) {
    const durationMs = phases[index].durationSec * 1000;
    if (elapsedMs < durationMs) {
      return {
        phase: phases[index],
        phaseIndex: index,
        totalPhases: phases.length,
        elapsedSec: elapsedMs / 1000,
        remainingSec: Math.max(0, phases[index].durationSec - elapsedMs / 1000),
        isLastPhase: index === lastIndex,
        finished: false,
      };
    }
    elapsedMs -= durationMs;
    index += 1;
  }

  return finishedResult();
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
