import { describe, it, expect } from 'vitest';
import {
  buildPhaseSequence,
  resolveSessionPhase,
  resolveManualRoundPhase,
  tasksPerRound,
  computeTotalTaskCount,
  taskIndexForElapsed,
  elapsedWithinTask,
  isAnswerRevealed,
  resolveActiveGroup,
  MANUAL_ROUND_TASK_BUFFER,
  type SessionPhaseConfig,
  type AnswerRevealConfig,
} from './cognitiveSessionPhases';

// 3s countdown, 10s round with tasks rotating every 3s (3 tasks/round, 1s
// leftover folded into the last), 5s break between rounds, 3 rounds.
const CONFIG: SessionPhaseConfig = {
  countdownSec: 3,
  roundSec: 10,
  taskDisplaySec: 3,
  breakSec: 5,
  roundCount: 3,
};

// Answer shows 1s after a task appears, stays for 1s, so [1s, 2s) within a task.
const REVEAL: AnswerRevealConfig = {
  answerRevealDelaySec: 1,
  answerRevealDurationSec: 1,
};

const FULL = { ...CONFIG, ...REVEAL };

describe('tasksPerRound / computeTotalTaskCount', () => {
  it('floors to whole tasks per round', () => {
    expect(tasksPerRound(CONFIG)).toBe(3); // floor(10/3)
  });

  it('multiplies by roundCount for the total plan length', () => {
    expect(computeTotalTaskCount(CONFIG)).toBe(9); // 3 tasks/round * 3 rounds
  });

  it('never returns less than 1 task per round even if taskDisplaySec exceeds roundSec', () => {
    expect(tasksPerRound({ roundSec: 2, taskDisplaySec: 10 })).toBe(1);
  });
});

describe('taskIndexForElapsed / elapsedWithinTask', () => {
  it('rotates to the next local task every taskDisplaySec', () => {
    expect(taskIndexForElapsed(0, CONFIG)).toBe(0);
    expect(taskIndexForElapsed(2.9, CONFIG)).toBe(0);
    expect(taskIndexForElapsed(3, CONFIG)).toBe(1);
    expect(taskIndexForElapsed(6, CONFIG)).toBe(2);
  });

  it('folds the remainder into the last task, which keeps showing until the round ends', () => {
    expect(taskIndexForElapsed(9, CONFIG)).toBe(2);
    expect(taskIndexForElapsed(9.9, CONFIG)).toBe(2); // would be floor(9.9/3)=3, clamped back to 2
  });

  it('reports how long the CURRENT task has itself been showing', () => {
    expect(elapsedWithinTask(0, CONFIG)).toBeCloseTo(0);
    expect(elapsedWithinTask(4, CONFIG)).toBeCloseTo(1); // 1s into the 2nd task
    expect(elapsedWithinTask(9.5, CONFIG)).toBeCloseTo(3.5); // well into the folded last task
  });
});

describe('isAnswerRevealed', () => {
  it('is false before the delay and after the reveal window', () => {
    expect(isAnswerRevealed(0, REVEAL)).toBe(false);
    expect(isAnswerRevealed(0.9, REVEAL)).toBe(false);
    expect(isAnswerRevealed(2, REVEAL)).toBe(false);
    expect(isAnswerRevealed(5, REVEAL)).toBe(false);
  });

  it('is true during [delay, delay+duration)', () => {
    expect(isAnswerRevealed(1, REVEAL)).toBe(true);
    expect(isAnswerRevealed(1.5, REVEAL)).toBe(true);
  });

  it('is always false when answerRevealDurationSec is 0 (reveal disabled)', () => {
    expect(isAnswerRevealed(1, { answerRevealDelaySec: 1, answerRevealDurationSec: 0 })).toBe(false);
  });
});

describe('buildPhaseSequence', () => {
  it('produces one phase per round (full roundSec, not split by task), with a break only between rounds', () => {
    const phases = buildPhaseSequence(CONFIG);
    expect(phases.map(p => p.type)).toEqual(['countdown', 'round', 'break', 'round', 'break', 'round']);
  });

  it('keeps each round phase at the full roundSec duration — tasks rotate underneath, the clock does not reset per task', () => {
    const phases = buildPhaseSequence(CONFIG);
    const roundPhases = phases.filter(p => p.type === 'round');
    expect(roundPhases.map(p => p.durationSec)).toEqual([10, 10, 10]);
  });

  it('numbers roundIndex 0-indexed across the session', () => {
    const phases = buildPhaseSequence(CONFIG);
    expect(phases.filter(p => p.type === 'round').map(p => p.roundIndex)).toEqual([0, 1, 2]);
  });

  it('omits the countdown phase entirely when countdownSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, countdownSec: 0 });
    expect(phases[0].type).toBe('round');
  });

  it('omits break phases entirely when breakSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, breakSec: 0 });
    expect(phases.filter(p => p.type === 'break')).toHaveLength(0);
  });

  it('clamps roundCount to at least 1', () => {
    const phases = buildPhaseSequence({ ...CONFIG, roundCount: 0 });
    expect(phases.filter(p => p.type === 'round')).toHaveLength(1);
  });
});

describe('resolveSessionPhase (interval mode)', () => {
  const START = '2026-01-01T12:00:00.000Z';

  it('is phase 0 (countdown) with full remaining time while idle, and no task yet', () => {
    const resolved = resolveSessionPhase(FULL, { status: 'idle' }, new Date(START));
    expect(resolved.phase.type).toBe('countdown');
    expect(resolved.elapsedSec).toBe(0);
    expect(resolved.remainingSec).toBe(3);
    expect(resolved.taskIndex).toBeUndefined();
    expect(resolved.answerRevealed).toBe(false);
  });

  it('shows the round at its full remaining duration right as the countdown ends', () => {
    const now = new Date(new Date(START).getTime() + 3000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('round');
    expect(resolved.phase.roundIndex).toBe(0);
    expect(resolved.remainingSec).toBe(10);
    expect(resolved.taskIndex).toBe(0);
  });

  it('counts down the whole round, not each task — remainingSec only resets at round boundaries', () => {
    const now = new Date(new Date(START).getTime() + 10000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('round');
    expect(resolved.remainingSec).toBeCloseTo(3);
    expect(resolved.taskIndex).toBe(2);
  });

  it('reveals the answer during the configured window within the current task', () => {
    // countdown(3) + 4s into round0: 1s into the 2nd task (local index 1) -> within reveal window.
    const now = new Date(new Date(START).getTime() + 7000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.taskIndex).toBe(1);
    expect(resolved.answerRevealed).toBe(true);
  });

  it('does not reveal the answer outside the window', () => {
    // countdown(3) + 3.5s into round0: 0.5s into the 2nd task -> before the 1s delay.
    const now = new Date(new Date(START).getTime() + 6500);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.answerRevealed).toBe(false);
  });

  it('resolves the break between rounds, not mid-round', () => {
    const now = new Date(new Date(START).getTime() + 15000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('break');
    expect(resolved.elapsedSec).toBeCloseTo(2);
    expect(resolved.taskIndex).toBeUndefined();
    expect(resolved.answerRevealed).toBe(false);
  });

  it('resolves the first task of the second round right after the break, with the clock reset to a fresh round', () => {
    const now = new Date(new Date(START).getTime() + 18000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('round');
    expect(resolved.phase.roundIndex).toBe(1);
    expect(resolved.remainingSec).toBe(10);
    expect(resolved.taskIndex).toBe(3);
  });

  it('is finished once elapsed time exceeds the whole sequence, even if status still says running', () => {
    const now = new Date(new Date(START).getTime() + 50000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.finished).toBe(true);
  });

  it('jumps across an entire round+break boundary at once after being offline', () => {
    const now = new Date(new Date(START).getTime() + 25000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    expect(resolved.phase.roundIndex).toBe(1);
    expect(resolved.taskIndex).toBe(5);
    expect(resolved.remainingSec).toBeCloseTo(3);
  });

  it('freezes elapsed/remaining time at the moment of pausing', () => {
    const pausedAt = new Date(new Date(START).getTime() + 7000).toISOString();
    const muchLater = new Date(new Date(START).getTime() + 600000);
    const resolved = resolveSessionPhase(FULL, { status: 'paused', startAt: START, pausedAt }, muchLater);
    expect(resolved.taskIndex).toBe(1);
    expect(resolved.remainingSec).toBeCloseTo(6);
  });

  it('resuming (shifting startAt forward by the paused duration) continues seamlessly from where it paused', () => {
    const shiftedStartAt = new Date(new Date(START).getTime() + 100000).toISOString();
    const rightAfterResume = new Date(new Date(shiftedStartAt).getTime() + 7000);
    const resolved = resolveSessionPhase(FULL, { status: 'running', startAt: shiftedStartAt }, rightAfterResume);
    expect(resolved.taskIndex).toBe(1);
    expect(resolved.remainingSec).toBeCloseTo(6);
  });

  it('agrees across devices given the same config/timing regardless of who asks', () => {
    const now = new Date(new Date(START).getTime() + 15000);
    const a = resolveSessionPhase(FULL, { status: 'running', startAt: START }, now);
    const b = resolveSessionPhase(FULL, { status: 'running', startAt: START }, new Date(now));
    expect(a).toEqual(b);
  });
});

describe('resolveManualRoundPhase (manual mode)', () => {
  const START = '2026-01-01T12:00:00.000Z';
  const MANUAL_CONFIG = { roundSec: 999, taskDisplaySec: 3, countdownSec: 3, ...REVEAL };

  it('is the countdown while idle', () => {
    const resolved = resolveManualRoundPhase(MANUAL_CONFIG, { status: 'idle' }, new Date(START));
    expect(resolved.phase).toBe('countdown');
    expect(resolved.remainingSec).toBe(3);
    expect(resolved.taskIndex).toBeUndefined();
  });

  it('counts down the countdown before any round has started', () => {
    const now = new Date(new Date(START).getTime() + 1000);
    const resolved = resolveManualRoundPhase(MANUAL_CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase).toBe('countdown');
    expect(resolved.remainingSec).toBeCloseTo(2);
  });

  it('auto-starts round 0 right after the countdown with no explicit round anchor needed', () => {
    // countdown(3) ends at START+3000; 1s into round 0 by START+4000.
    const now = new Date(new Date(START).getTime() + 4000);
    const resolved = resolveManualRoundPhase(MANUAL_CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase).toBe('round');
    expect(resolved.roundIndex).toBe(0);
    expect(resolved.taskIndex).toBe(0);
    expect(resolved.elapsedSec).toBeCloseTo(1);
  });

  it('starts round 0 at task 0 once the trainer has anchored the first round', () => {
    const roundStart = new Date(new Date(START).getTime() + 3000).toISOString();
    const now = new Date(new Date(roundStart).getTime() + 1000);
    const resolved = resolveManualRoundPhase(
      MANUAL_CONFIG,
      { status: 'running', startAt: START, currentRoundIndex: 0, currentRoundStartAt: roundStart },
      now
    );
    expect(resolved.phase).toBe('round');
    expect(resolved.roundIndex).toBe(0);
    expect(resolved.taskIndex).toBe(0);
  });

  it('rotates tasks within the open-ended round purely by elapsed time, with no fixed round length', () => {
    const roundStart = new Date(new Date(START).getTime() + 3000).toISOString();
    const now = new Date(new Date(roundStart).getTime() + 6500); // 6.5s into the round -> 3rd task (index 2), 0.5s into it
    const resolved = resolveManualRoundPhase(
      MANUAL_CONFIG,
      { status: 'running', startAt: START, currentRoundIndex: 0, currentRoundStartAt: roundStart },
      now
    );
    expect(resolved.taskIndex).toBe(2);
    expect(resolved.answerRevealed).toBe(false); // 0.5s into the task, before the 1s delay
  });

  it('reveals the answer within a manual round the same way as interval mode', () => {
    const roundStart = new Date(new Date(START).getTime() + 3000).toISOString();
    const now = new Date(new Date(roundStart).getTime() + 7000); // 1s into the 3rd task
    const resolved = resolveManualRoundPhase(
      MANUAL_CONFIG,
      { status: 'running', startAt: START, currentRoundIndex: 0, currentRoundStartAt: roundStart },
      now
    );
    expect(resolved.answerRevealed).toBe(true);
  });

  it('offsets the global task index by the round buffer size for later rounds', () => {
    const roundStart = new Date(new Date(START).getTime() + 3000).toISOString();
    const now = new Date(new Date(roundStart).getTime() + 1000);
    const resolved = resolveManualRoundPhase(
      MANUAL_CONFIG,
      { status: 'running', startAt: START, currentRoundIndex: 2, currentRoundStartAt: roundStart },
      now
    );
    expect(resolved.roundIndex).toBe(2);
    expect(resolved.taskIndex).toBe(2 * MANUAL_ROUND_TASK_BUFFER);
  });

  it('is finished once status says finished, regardless of elapsed time', () => {
    const resolved = resolveManualRoundPhase(MANUAL_CONFIG, { status: 'finished' }, new Date(START));
    expect(resolved.finished).toBe(true);
  });

  it('freezes at pausedAt within an open-ended round', () => {
    const roundStart = new Date(new Date(START).getTime() + 3000).toISOString();
    const pausedAt = new Date(new Date(roundStart).getTime() + 4000).toISOString(); // 1s into 2nd task
    const muchLater = new Date(new Date(START).getTime() + 600000);
    const resolved = resolveManualRoundPhase(
      MANUAL_CONFIG,
      { status: 'paused', startAt: START, pausedAt, currentRoundIndex: 0, currentRoundStartAt: roundStart },
      muchLater
    );
    expect(resolved.taskIndex).toBe(1);
  });
});

describe('resolveActiveGroup', () => {
  const groups = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

  it('cycles through groups in order, one per round', () => {
    expect(resolveActiveGroup(groups, 'alternating', 0)?.name).toBe('A');
    expect(resolveActiveGroup(groups, 'alternating', 1)?.name).toBe('B');
    expect(resolveActiveGroup(groups, 'alternating', 2)?.name).toBe('C');
  });

  it('wraps back around once every group has had a turn', () => {
    expect(resolveActiveGroup(groups, 'alternating', 3)?.name).toBe('A');
    expect(resolveActiveGroup(groups, 'alternating', 4)?.name).toBe('B');
    expect(resolveActiveGroup(groups, 'alternating', 7)?.name).toBe('B'); // 7 % 3 === 1
  });

  it('returns null when groupMode is simultaneous', () => {
    expect(resolveActiveGroup(groups, 'simultaneous', 0)).toBeNull();
  });

  it('returns null when there are no groups', () => {
    expect(resolveActiveGroup([], 'alternating', 0)).toBeNull();
    expect(resolveActiveGroup(undefined, 'alternating', 0)).toBeNull();
  });

  it('returns null when roundIndex is not known yet (e.g. countdown/break)', () => {
    expect(resolveActiveGroup(groups, 'alternating', undefined)).toBeNull();
  });
});
