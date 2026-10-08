import { describe, it, expect } from 'vitest';
import {
  buildPhaseSequence,
  resolveSessionPhase,
  tasksPerInterval,
  computeTotalTaskCount,
  taskIndexForElapsed,
  type SessionPhaseConfig,
} from './cognitiveSessionPhases';

// 3s countdown, 10s interval with tasks rotating every 3s (3 tasks/interval,
// 1s leftover folded into the last), 5s break between intervals, 3 intervals.
const CONFIG: SessionPhaseConfig = {
  countdownSec: 3,
  intervalSec: 10,
  taskDisplaySec: 3,
  breakSec: 5,
  intervalCount: 3,
};

describe('tasksPerInterval / computeTotalTaskCount', () => {
  it('floors to whole tasks per interval', () => {
    expect(tasksPerInterval(CONFIG)).toBe(3); // floor(10/3)
  });

  it('multiplies by intervalCount for the total plan length', () => {
    expect(computeTotalTaskCount(CONFIG)).toBe(9); // 3 tasks/interval * 3 intervals
  });

  it('never returns less than 1 task per interval even if taskDisplaySec exceeds intervalSec', () => {
    expect(tasksPerInterval({ intervalSec: 2, taskDisplaySec: 10 })).toBe(1);
  });
});

describe('taskIndexForElapsed', () => {
  it('rotates to the next local task every taskDisplaySec', () => {
    expect(taskIndexForElapsed(0, CONFIG)).toBe(0);
    expect(taskIndexForElapsed(2.9, CONFIG)).toBe(0);
    expect(taskIndexForElapsed(3, CONFIG)).toBe(1);
    expect(taskIndexForElapsed(6, CONFIG)).toBe(2);
  });

  it('folds the remainder into the last task, which keeps showing until the interval ends', () => {
    expect(taskIndexForElapsed(9, CONFIG)).toBe(2);
    expect(taskIndexForElapsed(9.9, CONFIG)).toBe(2); // would be floor(9.9/3)=3, clamped back to 2
  });
});

describe('buildPhaseSequence', () => {
  it('produces one phase per interval (full intervalSec, not split by task), with a break only between intervals', () => {
    const phases = buildPhaseSequence(CONFIG);
    expect(phases.map(p => p.type)).toEqual(['countdown', 'interval', 'break', 'interval', 'break', 'interval']);
  });

  it('keeps each interval phase at the full intervalSec duration — tasks rotate underneath, the clock does not reset per task', () => {
    const phases = buildPhaseSequence(CONFIG);
    const intervalPhases = phases.filter(p => p.type === 'interval');
    expect(intervalPhases.map(p => p.durationSec)).toEqual([10, 10, 10]);
  });

  it('numbers intervalIndex 0-indexed across the session', () => {
    const phases = buildPhaseSequence(CONFIG);
    expect(phases.filter(p => p.type === 'interval').map(p => p.intervalIndex)).toEqual([0, 1, 2]);
  });

  it('omits the countdown phase entirely when countdownSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, countdownSec: 0 });
    expect(phases[0].type).toBe('interval');
  });

  it('omits break phases entirely when breakSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, breakSec: 0 });
    expect(phases.filter(p => p.type === 'break')).toHaveLength(0);
  });

  it('clamps intervalCount to at least 1', () => {
    const phases = buildPhaseSequence({ ...CONFIG, intervalCount: 0 });
    expect(phases.filter(p => p.type === 'interval')).toHaveLength(1);
  });
});

describe('resolveSessionPhase', () => {
  const START = '2026-01-01T12:00:00.000Z';

  it('is phase 0 (countdown) with full remaining time while idle, and no task yet', () => {
    const resolved = resolveSessionPhase(CONFIG, { status: 'idle' }, new Date(START));
    expect(resolved.phase.type).toBe('countdown');
    expect(resolved.elapsedSec).toBe(0);
    expect(resolved.remainingSec).toBe(3);
    expect(resolved.taskIndex).toBeUndefined();
  });

  it('shows the interval at its full remaining duration right as the countdown ends', () => {
    const now = new Date(new Date(START).getTime() + 3000); // countdown just finished
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('interval');
    expect(resolved.phase.intervalIndex).toBe(0);
    expect(resolved.remainingSec).toBe(10);
    expect(resolved.taskIndex).toBe(0);
  });

  it('counts down the whole interval, not each task — remainingSec only resets at interval boundaries', () => {
    // countdown(3) + 7s into interval0: remainingSec is 10-7=3, NOT reset per 3s task.
    const now = new Date(new Date(START).getTime() + 10000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('interval');
    expect(resolved.remainingSec).toBeCloseTo(3);
    expect(resolved.taskIndex).toBe(2); // 3rd task rotates in, but the clock keeps counting the interval down
  });

  it('rotates the underlying task every taskDisplaySec independently of the interval clock', () => {
    // countdown(3) + 4s into interval0: 2nd task is showing, interval clock reads 6s left.
    const now = new Date(new Date(START).getTime() + 7000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.remainingSec).toBeCloseTo(6);
    expect(resolved.taskIndex).toBe(1);
  });

  it('folds the leftover remainder into the last task slot, which keeps showing until the interval ends', () => {
    // countdown(3) + 9.5s into interval0 — well into the folded remainder tail.
    const now = new Date(new Date(START).getTime() + 12500);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.remainingSec).toBeCloseTo(0.5);
    expect(resolved.taskIndex).toBe(2);
  });

  it('resolves the break between intervals, not mid-interval', () => {
    // countdown(3) + interval0(10) = 13s in; break starts at 13s, lasts 5s.
    const now = new Date(new Date(START).getTime() + 15000); // 2s into the break
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('break');
    expect(resolved.elapsedSec).toBeCloseTo(2);
    expect(resolved.taskIndex).toBeUndefined();
  });

  it('resolves the first task of the second interval right after the break, with the clock reset to a fresh interval', () => {
    const now = new Date(new Date(START).getTime() + 18000); // exactly when the break ends
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('interval');
    expect(resolved.phase.intervalIndex).toBe(1);
    expect(resolved.remainingSec).toBe(10);
    expect(resolved.taskIndex).toBe(3); // first task of interval 2 (global index 3)
  });

  it('is finished once elapsed time exceeds the whole sequence, even if status still says running', () => {
    // 3 + 10*3 + 5*2 = 3 + 30 + 10 = 43s total
    const now = new Date(new Date(START).getTime() + 50000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.finished).toBe(true);
  });

  it('jumps across an entire interval+break boundary at once after being offline', () => {
    // countdown(3) + interval0(10) + break(5) + 7s into interval1 = 25s
    const now = new Date(new Date(START).getTime() + 25000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.intervalIndex).toBe(1);
    expect(resolved.taskIndex).toBe(5);
    expect(resolved.remainingSec).toBeCloseTo(3);
  });

  it('freezes elapsed/remaining time at the moment of pausing', () => {
    const pausedAt = new Date(new Date(START).getTime() + 7000).toISOString(); // 4s into interval0
    const muchLater = new Date(new Date(START).getTime() + 600000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'paused', startAt: START, pausedAt }, muchLater);
    expect(resolved.taskIndex).toBe(1);
    expect(resolved.remainingSec).toBeCloseTo(6);
  });

  it('resuming (shifting startAt forward by the paused duration) continues seamlessly from where it paused', () => {
    const shiftedStartAt = new Date(new Date(START).getTime() + 100000).toISOString();
    const rightAfterResume = new Date(new Date(shiftedStartAt).getTime() + 7000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: shiftedStartAt }, rightAfterResume);
    expect(resolved.taskIndex).toBe(1);
    expect(resolved.remainingSec).toBeCloseTo(6);
  });

  it('agrees across devices given the same config/timing regardless of who asks', () => {
    const now = new Date(new Date(START).getTime() + 15000);
    const a = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    const b = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, new Date(now));
    expect(a).toEqual(b);
  });
});
