import { describe, it, expect } from 'vitest';
import { buildPhaseSequence, resolveSessionPhase, type SessionPhaseConfig } from './cognitiveSessionPhases';

const CONFIG: SessionPhaseConfig = {
  countdownSec: 3,
  taskDurationSec: 10,
  breakDurationSec: 5,
  taskCount: 3,
};

describe('buildPhaseSequence', () => {
  it('starts with the countdown, alternates task/break, and never has a trailing break', () => {
    const phases = buildPhaseSequence(CONFIG);
    expect(phases.map(p => p.type)).toEqual(['countdown', 'task', 'break', 'task', 'break', 'task']);
    expect(phases.map(p => p.taskIndex)).toEqual([undefined, 0, undefined, 1, undefined, 2]);
    expect(phases.every(p => p.durationSec > 0)).toBe(true);
  });

  it('omits the countdown phase entirely when countdownSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, countdownSec: 0 });
    expect(phases[0].type).toBe('task');
  });

  it('omits break phases entirely when breakDurationSec is 0', () => {
    const phases = buildPhaseSequence({ ...CONFIG, breakDurationSec: 0 });
    expect(phases.map(p => p.type)).toEqual(['countdown', 'task', 'task', 'task']);
  });

  it('clamps taskCount to at least 1', () => {
    const phases = buildPhaseSequence({ ...CONFIG, taskCount: 0 });
    expect(phases.filter(p => p.type === 'task')).toHaveLength(1);
  });
});

describe('resolveSessionPhase', () => {
  const START = '2026-01-01T12:00:00.000Z';

  it('is phase 0 (countdown) with full remaining time while idle', () => {
    const resolved = resolveSessionPhase(CONFIG, { status: 'idle' }, new Date(START));
    expect(resolved.phaseIndex).toBe(0);
    expect(resolved.phase.type).toBe('countdown');
    expect(resolved.elapsedSec).toBe(0);
    expect(resolved.remainingSec).toBe(3);
    expect(resolved.finished).toBe(false);
  });

  it('stays in the countdown phase partway through it', () => {
    const now = new Date(new Date(START).getTime() + 1500); // 1.5s in
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('countdown');
    expect(resolved.elapsedSec).toBeCloseTo(1.5);
    expect(resolved.remainingSec).toBeCloseTo(1.5);
  });

  it('crosses from countdown into the first task at the exact boundary', () => {
    const now = new Date(new Date(START).getTime() + 3000); // exactly 3s — countdown over
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(0);
    expect(resolved.elapsedSec).toBe(0);
  });

  it('resolves a break phase between two tasks', () => {
    // countdown(3) + task0(10) = 13s in; break starts at 13s, lasts 5s
    const now = new Date(new Date(START).getTime() + 15000); // 2s into the break
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('break');
    expect(resolved.elapsedSec).toBeCloseTo(2);
    expect(resolved.remainingSec).toBeCloseTo(3);
  });

  it('resolves the last task and marks isLastPhase', () => {
    // countdown(3) + task0(10) + break(5) + task1(10) + break(5) = 33s in; task2 starts at 33s
    const now = new Date(new Date(START).getTime() + 35000); // 2s into the final task
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(2);
    expect(resolved.isLastPhase).toBe(true);
    expect(resolved.finished).toBe(false);
  });

  it('is finished once elapsed time exceeds the whole sequence, even if status still says running', () => {
    const totalSec = 3 + 10 + 5 + 10 + 5 + 10; // 43s
    const now = new Date(new Date(START).getTime() + (totalSec + 5) * 1000);
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.finished).toBe(true);
    expect(resolved.phase.taskIndex).toBe(2);
  });

  it('jumps across several phase boundaries at once after being offline', () => {
    // Simulates a device reconnecting long after countdown + task0 + break have all elapsed.
    const now = new Date(new Date(START).getTime() + 20000); // 7s into task1 (started at 18s)
    const resolved = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(1);
    expect(resolved.elapsedSec).toBeCloseTo(2);
  });

  it('freezes elapsed/remaining time at the moment of pausing', () => {
    const pausedAt = new Date(new Date(START).getTime() + 6000).toISOString(); // paused 3s into task0
    const muchLater = new Date(new Date(START).getTime() + 600000); // real clock has moved on a lot
    const resolved = resolveSessionPhase(CONFIG, { status: 'paused', startAt: START, pausedAt }, muchLater);
    expect(resolved.phase.type).toBe('task');
    expect(resolved.phase.taskIndex).toBe(0);
    expect(resolved.elapsedSec).toBeCloseTo(3);
    expect(resolved.remainingSec).toBeCloseTo(7);
  });

  it('resuming (shifting startAt forward by the paused duration) continues seamlessly from where it paused', () => {
    // Paused 3s into task0 (at 6s elapsed), stayed paused for 100s, then resumed.
    // services/firebase/cognitiveSessions.ts's resumeSession would shift startAt forward by 100s.
    const shiftedStartAt = new Date(new Date(START).getTime() + 100000).toISOString();

    // Right at the resume instant: should show exactly what it showed when paused (3s into task0).
    const rightAfterResume = new Date(new Date(shiftedStartAt).getTime() + 6000);
    const atResume = resolveSessionPhase(CONFIG, { status: 'running', startAt: shiftedStartAt }, rightAfterResume);
    expect(atResume.phase.type).toBe('task');
    expect(atResume.phase.taskIndex).toBe(0);
    expect(atResume.elapsedSec).toBeCloseTo(3);

    // 2 more real seconds pass after resuming — elapsed should keep moving forward from there.
    const twoSecondsLater = new Date(rightAfterResume.getTime() + 2000);
    const afterResume = resolveSessionPhase(CONFIG, { status: 'running', startAt: shiftedStartAt }, twoSecondsLater);
    expect(afterResume.phase.taskIndex).toBe(0);
    expect(afterResume.elapsedSec).toBeCloseTo(5);
  });

  it('is finished at phase 0 (idle-equivalent) when status is finished before ever starting', () => {
    const resolved = resolveSessionPhase(CONFIG, { status: 'finished' });
    expect(resolved.finished).toBe(true);
  });

  it('agrees across devices given the same config/timing regardless of who asks', () => {
    const now = new Date(new Date(START).getTime() + 15000);
    const a = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, now);
    const b = resolveSessionPhase(CONFIG, { status: 'running', startAt: START }, new Date(now));
    expect(a).toEqual(b);
  });
});
