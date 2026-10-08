import { describe, it, expect } from 'vitest';
import {
  buildPhaseSequence,
  resolveSessionPhase,
  tasksPerInterval,
  computeTotalTaskCount,
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

describe('buildPhaseSequence', () => {
  it('rotates multiple tasks back-to-back within each interval, with a break only between intervals', () => {
    const phases = buildPhaseSequence(CONFIG);
    // countdown, [task,task,task], break, [task,task,task], break, [task,task,task] — no trailing break
    expect(phases.map(p => p.type)).toEqual([
      'countdown',
      'task', 'task', 'task',
      'break',
      'task', 'task', 'task',
      'break',
      'task', 'task', 'task',
    ]);
  });

  it('numbers taskIndex globally across the whole session, not per-interval', () => {
    const phases = buildPhaseSequence(CONFIG);
    const taskIndexes = phases.filter(p => p.type === 'task').map(p => p.taskIndex);
    expect(taskIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('folds the remainder (intervalSec not divisible by taskDisplaySec) into the last task of each interval', () => {
    const phases = buildPhaseSequence(CONFIG);
    const firstIntervalTasks = phases.slice(1, 4); // after the countdown
    expect(firstIntervalTasks.map(p => p.durationSec)).toEqual([3, 3, 4]); // 3+3+4 = 10 = intervalSec
  });

  it('omits the countdown phase entirely when countdownSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, countdownSec: 0 });
    expect(phases[0].type).toBe('task');
  });

  it('omits break phases entirely when breakSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, breakSec: 0 });
    expect(phases.filter(p => p.type === 'break')).toHaveLength(0);
  });

  it('clamps intervalCount to at least 1', () => {
    const phases = buildPhaseSequence({ ...CONFIG, intervalCount: 0 });
    expect(phases.filter(p => p.type === 'task')).toHaveLength(3);
  });
});

describe('resolveSessionPhase', () => {
  const START = '2026-01-01T12:00:00.000Z';

  it('is phase 0 (countdown) with full remaining time while idle', () => {
    const resolved = resolveSessionPhase(CONFIG, { status: 'idle' }, new Date(START));
    expect(resolved.phase.type).toBe('countdown');
    expect(resolved.elapsedSec).toBe(0);
    expect(resolved.remainingSec).toBe(3);
  });

  it('rotates to the second task within the same interval after the first task elapses', () => {
    // countdown(3) + task0(3) = 6s in; task1 starts at 6s, lasts 3s
    const now = new Date(new Date(START).getTime() + 7000); // 1s into task1
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(1);
    expect(resolved.elapsedSec).toBeCloseTo(1);
  });

  it('resolves the break between intervals, not mid-interval', () => {
    // countdown(3) + task0(3) + task1(3) + task2(4, with leftover) = 13s in; break starts at 13s, lasts 5s
    const now = new Date(new Date(START).getTime() + 15000); // 2s into the break
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('break');
    expect(resolved.elapsedSec).toBeCloseTo(2);
  });

  it('resolves the first task of the second interval right after the break', () => {
    const now = new Date(new Date(START).getTime() + 18000); // exactly when the break ends
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(3); // first task of interval 2
  });

  it('is finished once elapsed time exceeds the whole sequence, even if status still says running', () => {
    // 3 + (3+3+4)*3 + 5*2 = 3 + 30 + 10 = 43s total
    const now = new Date(new Date(START).getTime() + 50000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.finished).toBe(true);
  });

  it('jumps across several task boundaries within an interval at once after being offline', () => {
    const now = new Date(new Date(START).getTime() + 12000); // countdown(3)+task0(3)+task1(3) = 9s, so 3s into task2
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.taskIndex).toBe(2);
    expect(resolved.elapsedSec).toBeCloseTo(3);
  });

  it('freezes elapsed/remaining time at the moment of pausing', () => {
    const pausedAt = new Date(new Date(START).getTime() + 7000).toISOString(); // paused 1s into task1
    const muchLater = new Date(new Date(START).getTime() + 600000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'paused', startAt: START, pausedAt }, muchLater);
    expect(resolved.phase.taskIndex).toBe(1);
    expect(resolved.elapsedSec).toBeCloseTo(1);
  });

  it('resuming (shifting startAt forward by the paused duration) continues seamlessly from where it paused', () => {
    const shiftedStartAt = new Date(new Date(START).getTime() + 100000).toISOString();
    const rightAfterResume = new Date(new Date(shiftedStartAt).getTime() + 7000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: shiftedStartAt }, rightAfterResume);
    expect(resolved.phase.taskIndex).toBe(1);
    expect(resolved.elapsedSec).toBeCloseTo(1);
  });

  it('agrees across devices given the same config/timing regardless of who asks', () => {
    const now = new Date(new Date(START).getTime() + 15000);
    const a = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    const b = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, new Date(now));
    expect(a).toEqual(b);
  });
});
