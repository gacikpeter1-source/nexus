/**
 * Pure phase-sequence math for Cognitive Training sessions — no Firestore
 * here, mirroring the "wall-clock anchor" trick in trainingTimerPhases.ts
 * but generalized to a heterogeneous countdown/task/break sequence instead
 * of uniform work/break.
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
  taskDurationSec: number;
  breakDurationSec: number; // 0 — no break between tasks
  taskCount: number;
}

/** [countdown?, task, break?, task, break?, ..., task] — no trailing break after the last task. */
export function buildPhaseSequence(config: SessionPhaseConfig): SessionPhase[] {
  const phases: SessionPhase[] = [];
  if (config.countdownSec > 0) {
    phases.push({ type: 'countdown', durationSec: config.countdownSec });
  }

  const taskCount = Math.max(1, config.taskCount);
  for (let i = 0; i < taskCount; i++) {
    phases.push({ type: 'task', durationSec: Math.max(1, config.taskDurationSec), taskIndex: i });
    if (i < taskCount - 1 && config.breakDurationSec > 0) {
      phases.push({ type: 'break', durationSec: config.breakDurationSec });
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
