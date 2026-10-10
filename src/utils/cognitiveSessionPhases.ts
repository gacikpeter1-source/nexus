/**
 * Pure phase-sequence math for Cognitive Training sessions — no Firestore
 * here, mirroring the "wall-clock anchor" trick in trainingTimerPhases.ts
 * but generalized to a heterogeneous countdown/round/break sequence
 * instead of uniform work/break.
 *
 * One ROUND is a physical training cycle (e.g. 1 minute of exercise). The
 * on-screen clock always counts down the ROUND (or break, or countdown) as
 * a whole — it never resets per task. Underneath, tasks keep rotating
 * every taskDisplaySec within that same round, purely derived from
 * elapsed time; a break only ever happens BETWEEN rounds, never
 * mid-round. After a task has been showing for answerRevealDelaySec, it
 * also enters a reveal window (answerRevealDurationSec long) during which
 * the TV shows the correct answer too.
 *
 * Two round-advancement strategies share this same per-task rotation math:
 *  - 'interval': the whole sequence (countdown + N rounds + breaks) is
 *    fixed up front and anchored to one `startAt`, same as before.
 *  - 'manual': there's no fixed round length or count — the trainer
 *    advances with a button (see advanceCognitiveRound in
 *    services/firebase/cognitiveSessions.ts). Each round gets its own
 *    `currentRoundStartAt` anchor instead of one anchor for the whole
 *    sequence; resolveManualRoundPhase handles this case.
 *
 * Pausing freezes elapsed-time math at pausedAt; resuming shifts the
 * relevant anchor forward by the paused duration, so elapsed time always
 * excludes time spent paused without needing a stored phase index to
 * "freeze" against.
 */

export type SessionPhaseType = 'countdown' | 'round' | 'break';

export interface SessionPhase {
  type: SessionPhaseType;
  durationSec: number;
  roundIndex?: number; // 0-indexed training cycle — only present for 'round' phases
}

export interface SessionPhaseConfig {
  countdownSec: number;
  roundSec: number; // duration of one training cycle — what the on-screen clock counts down ('interval' mode)
  taskDisplaySec: number; // how long each individual task stays on screen within a round
  breakSec: number; // 0 — no break between rounds ('interval' mode)
  roundCount: number; // 'interval' mode only
}

export interface AnswerRevealConfig {
  answerRevealDelaySec: number;
  answerRevealDurationSec: number;
}

/** How many tasks fit in one round, given how long each stays on screen. */
export function tasksPerRound(config: Pick<SessionPhaseConfig, 'roundSec' | 'taskDisplaySec'>): number {
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const roundSec = Math.max(taskDisplaySec, config.roundSec);
  return Math.max(1, Math.floor(roundSec / taskDisplaySec));
}

/** Total number of tasks the full plan needs to pre-generate for this config ('interval' mode). */
export function computeTotalTaskCount(config: Pick<SessionPhaseConfig, 'roundSec' | 'taskDisplaySec' | 'roundCount'>): number {
  return Math.max(1, config.roundCount) * tasksPerRound(config);
}

/**
 * Which task (local to its round, 0-indexed) should be showing given how
 * much time has elapsed since the round started. Any remainder from
 * roundSec not dividing evenly by taskDisplaySec is folded into the last
 * task slot, so it just keeps showing until the round ends. Also used
 * as-is by manual mode (a round's internal rotation math doesn't care how
 * the round itself was started).
 */
export function taskIndexForElapsed(
  elapsedSec: number,
  config: Pick<SessionPhaseConfig, 'roundSec' | 'taskDisplaySec'>
): number {
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const perRound = tasksPerRound(config);
  return Math.min(perRound - 1, Math.max(0, Math.floor(elapsedSec / taskDisplaySec)));
}

/** How long the current task (by taskIndexForElapsed) has itself been showing. */
export function elapsedWithinTask(
  elapsedSec: number,
  config: Pick<SessionPhaseConfig, 'roundSec' | 'taskDisplaySec'>
): number {
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const localIndex = taskIndexForElapsed(elapsedSec, config);
  return Math.max(0, elapsedSec - localIndex * taskDisplaySec);
}

/**
 * Whether the TV should be showing the correct answer right now, given how
 * long the current task has been on screen. answerRevealDurationSec <= 0
 * means this game/session never reveals it.
 */
export function isAnswerRevealed(withinTaskSec: number, config: AnswerRevealConfig): boolean {
  if (config.answerRevealDurationSec <= 0) return false;
  const delay = Math.max(0, config.answerRevealDelaySec);
  return withinTaskSec >= delay && withinTaskSec < delay + config.answerRevealDurationSec;
}

/**
 * [countdown?, round, break?, round, break?, ...] — one phase per training
 * cycle (duration = roundSec, the number the on-screen clock counts down),
 * a break between rounds (never after the last one), repeated roundCount
 * times. Which task is showing within a 'round' phase is NOT part of the
 * sequence — it's derived live from elapsed time, see taskIndexForElapsed.
 * 'interval' mode only.
 */
export function buildPhaseSequence(config: SessionPhaseConfig): SessionPhase[] {
  const phases: SessionPhase[] = [];
  if (config.countdownSec > 0) {
    phases.push({ type: 'countdown', durationSec: config.countdownSec });
  }

  const roundCount = Math.max(1, config.roundCount);
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  const roundSec = Math.max(taskDisplaySec, config.roundSec);

  for (let i = 0; i < roundCount; i++) {
    phases.push({ type: 'round', durationSec: roundSec, roundIndex: i });
    if (i < roundCount - 1 && config.breakSec > 0) {
      phases.push({ type: 'break', durationSec: config.breakSec });
    }
  }
  return phases;
}

export interface SessionTiming {
  status: 'idle' | 'running' | 'paused' | 'finished';
  startAt?: string; // ISO — the instant the countdown (or first round, if no countdown) began
  pausedAt?: string; // ISO — set while status is 'paused'
}

export interface ResolvedSessionPhase {
  phase: SessionPhase;
  phaseIndex: number;
  totalPhases: number;
  elapsedSec: number;
  remainingSec: number;
  isLastPhase: boolean;
  /** Global index into the session's plan/tasks — only present while phase.type === 'round'. */
  taskIndex?: number;
  /** Only meaningful while phase.type === 'round'. */
  answerRevealed: boolean;
  /** Locally resolved — true once every phase's duration has elapsed, even before Firestore's status says 'finished'. */
  finished: boolean;
}

function globalTaskIndex(phase: SessionPhase, elapsedSec: number, config: SessionPhaseConfig): number | undefined {
  if (phase.type !== 'round' || phase.roundIndex === undefined) return undefined;
  const perRound = tasksPerRound(config);
  const localIndex = taskIndexForElapsed(elapsedSec, config);
  return phase.roundIndex * perRound + localIndex;
}

function resolvedAnswerRevealed(phase: SessionPhase, elapsedSec: number, config: SessionPhaseConfig & AnswerRevealConfig): boolean {
  if (phase.type !== 'round') return false;
  return isAnswerRevealed(elapsedWithinTask(elapsedSec, config), config);
}

/**
 * Resolves which phase should be active right now, purely from elapsed
 * wall-clock time since startAt. Never mutates anything and never throws —
 * safe to call every animation frame on the TV or the phone. 'interval'
 * mode only — see resolveManualRoundPhase for 'manual' mode.
 */
export function resolveSessionPhase(
  config: SessionPhaseConfig & AnswerRevealConfig,
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
    taskIndex: globalTaskIndex(phases[lastIndex], phases[lastIndex].durationSec, config),
    answerRevealed: resolvedAnswerRevealed(phases[lastIndex], phases[lastIndex].durationSec, config),
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
      taskIndex: globalTaskIndex(phases[0], 0, config),
      answerRevealed: resolvedAnswerRevealed(phases[0], 0, config),
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
      const elapsedSec = elapsedMs / 1000;
      return {
        phase: phases[index],
        phaseIndex: index,
        totalPhases: phases.length,
        elapsedSec,
        remainingSec: Math.max(0, phases[index].durationSec - elapsedSec),
        isLastPhase: index === lastIndex,
        taskIndex: globalTaskIndex(phases[index], elapsedSec, config),
        answerRevealed: resolvedAnswerRevealed(phases[index], elapsedSec, config),
        finished: false,
      };
    }
    elapsedMs -= durationMs;
    index += 1;
  }

  return finishedResult();
}

// ==================== 'manual' round mode ====================

/**
 * How many tasks are pre-generated for EACH round in 'manual' mode — there
 * is no roundSec to size the buffer from, since the trainer decides when a
 * round ends. Large enough that no realistic round ever exhausts it; if
 * one somehow did, the local index just clamps to the last task in the
 * buffer (it keeps showing) rather than throwing.
 */
export const MANUAL_ROUND_TASK_BUFFER = 200;

export interface ManualRoundTiming {
  status: 'idle' | 'running' | 'paused' | 'finished';
  startAt?: string; // countdown anchor
  pausedAt?: string;
  currentRoundIndex?: number;
  currentRoundStartAt?: string;
}

export interface ResolvedManualPhase {
  phase: 'countdown' | 'round';
  elapsedSec: number;
  remainingSec?: number; // only meaningful for 'countdown' — a round is open-ended
  roundIndex?: number;
  taskIndex?: number; // global index into plan — only present while phase === 'round'
  answerRevealed: boolean;
  finished: boolean;
}

/** 'manual' mode equivalent of resolveSessionPhase — see the module doc comment. */
export function resolveManualRoundPhase(
  config: Pick<SessionPhaseConfig, 'roundSec' | 'taskDisplaySec'> & AnswerRevealConfig & { countdownSec: number },
  timing: ManualRoundTiming,
  now: Date = new Date()
): ResolvedManualPhase {
  if (timing.status === 'finished') {
    return { phase: 'round', elapsedSec: 0, answerRevealed: false, finished: true };
  }

  if (timing.status === 'idle' || !timing.startAt) {
    return {
      phase: 'countdown',
      elapsedSec: 0,
      remainingSec: config.countdownSec,
      answerRevealed: false,
      finished: false,
    };
  }

  const effectiveNow = timing.status === 'paused' && timing.pausedAt ? new Date(timing.pausedAt) : now;

  // Countdown always anchors to startAt, regardless of whether a round has
  // started since — it only ever happens once, before round 0.
  const countdownElapsedMs = effectiveNow.getTime() - new Date(timing.startAt).getTime();
  if (countdownElapsedMs < config.countdownSec * 1000 && timing.currentRoundIndex === undefined) {
    return {
      phase: 'countdown',
      elapsedSec: countdownElapsedMs / 1000,
      remainingSec: Math.max(0, config.countdownSec - countdownElapsedMs / 1000),
      answerRevealed: false,
      finished: false,
    };
  }

  // Round 0 never needs its own server write — it starts automatically the
  // moment the countdown ends, same as every other mode, so its anchor is
  // just derived from startAt + countdownSec. Only round 1+ needs an
  // explicit advanceCognitiveRound() call (currentRoundIndex/StartAt).
  const roundIndex = timing.currentRoundIndex ?? 0;
  const roundStartAt = timing.currentRoundStartAt ?? new Date(new Date(timing.startAt).getTime() + config.countdownSec * 1000).toISOString();

  const roundElapsedSec = Math.max(0, effectiveNow.getTime() - new Date(roundStartAt).getTime()) / 1000;
  const taskDisplaySec = Math.max(1, config.taskDisplaySec);
  // Unlike taskIndexForElapsed, a manual round has no roundSec to clamp
  // against — it only ever ends when the trainer says so — so the local
  // index is clamped against the fixed per-round buffer size instead.
  const localIndex = Math.min(MANUAL_ROUND_TASK_BUFFER - 1, Math.floor(roundElapsedSec / taskDisplaySec));
  const withinTask = Math.max(0, roundElapsedSec - localIndex * taskDisplaySec);

  return {
    phase: 'round',
    elapsedSec: roundElapsedSec,
    roundIndex,
    taskIndex: roundIndex * MANUAL_ROUND_TASK_BUFFER + localIndex,
    answerRevealed: isAnswerRevealed(withinTask, config),
    finished: false,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
