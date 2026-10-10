import { describe, it, expect } from 'vitest';
import { mathGame } from './math';
import type { MathContent } from './math';

const SAMPLE = 300;

function tasksForLevel(level: number, count = SAMPLE) {
  return mathGame.generateTasks({ level, progressive: false }, count).map(t => ({
    content: t.content as MathContent,
    correctAnswer: t.correctAnswer as number,
  }));
}

function expectWholeNonNegative(n: unknown) {
  expect(typeof n).toBe('number');
  expect(Number.isInteger(n)).toBe(true);
  expect(n as number).toBeGreaterThanOrEqual(0);
}

describe('math game — no-repeat-consecutive', () => {
  it('never generates the exact same task twice in a row, for every level', () => {
    for (let level = 1; level <= 10; level++) {
      const tasks = tasksForLevel(level);
      for (let i = 1; i < tasks.length; i++) {
        expect(JSON.stringify(tasks[i].content)).not.toBe(JSON.stringify(tasks[i - 1].content));
      }
    }
  });
});

describe('math game — level 1: addition to 10', () => {
  it('always produces a whole, non-negative sum no greater than 10', () => {
    for (const { content, correctAnswer } of tasksForLevel(1)) {
      expect(content.kind).toBe('arithmetic');
      const c = content as MathContent & { kind: 'arithmetic' };
      expect(c.operator).toBe('+');
      expect(c.a).toBeGreaterThanOrEqual(1);
      expect(c.b).toBeGreaterThanOrEqual(1);
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBeLessThanOrEqual(10);
      expect(correctAnswer).toBe(c.a + c.b);
    }
  });
});

describe('math game — level 2: subtraction to 10', () => {
  it('always produces a whole, non-negative difference, minuend at most 10', () => {
    for (const { content, correctAnswer } of tasksForLevel(2)) {
      const c = content as MathContent & { kind: 'arithmetic' };
      expect(c.operator).toBe('-');
      expect(c.a).toBeLessThanOrEqual(10);
      expect(c.b).toBeLessThan(c.a);
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBe(c.a - c.b);
    }
  });
});

describe('math game — level 3: addition/subtraction to 20', () => {
  it('always produces a whole, non-negative result no greater than 20', () => {
    for (const { content, correctAnswer } of tasksForLevel(3)) {
      const c = content as MathContent & { kind: 'arithmetic' };
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBeLessThanOrEqual(20);
      expect(correctAnswer).toBe(c.operator === '+' ? c.a + c.b : c.a - c.b);
    }
  });
});

describe('math game — level 4: addition/subtraction to 100', () => {
  it('always produces a whole, non-negative result no greater than 100', () => {
    for (const { content, correctAnswer } of tasksForLevel(4)) {
      const c = content as MathContent & { kind: 'arithmetic' };
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBeLessThanOrEqual(100);
      expect(correctAnswer).toBe(c.operator === '+' ? c.a + c.b : c.a - c.b);
    }
  });
});

describe('math game — level 5: small multiplication table', () => {
  it('always multiplies two factors from 1-10', () => {
    for (const { content, correctAnswer } of tasksForLevel(5)) {
      expect(content.kind).toBe('multiplication');
      const c = content as MathContent & { kind: 'multiplication' };
      expect(c.left).toBeGreaterThanOrEqual(1);
      expect(c.left).toBeLessThanOrEqual(10);
      expect(c.right).toBeGreaterThanOrEqual(1);
      expect(c.right).toBeLessThanOrEqual(10);
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBe(c.left * c.right);
    }
  });
});

describe('math game — level 6: division without remainder', () => {
  it('always divides exactly, quotient 1-10', () => {
    for (const { content, correctAnswer } of tasksForLevel(6)) {
      expect(content.kind).toBe('division');
      const c = content as MathContent & { kind: 'division' };
      expect(c.dividend % c.divisor).toBe(0);
      expectWholeNonNegative(correctAnswer);
      expect(correctAnswer).toBeGreaterThanOrEqual(1);
      expect(correctAnswer).toBeLessThanOrEqual(10);
      expect(correctAnswer).toBe(c.dividend / c.divisor);
    }
  });
});

describe('math game — level 7: mixed operations with precedence', () => {
  it('always resolves to a whole, non-negative number honoring × before +/-', () => {
    for (const { content, correctAnswer } of tasksForLevel(7)) {
      expect(content.kind).toBe('mixed3');
      const c = content as MathContent & { kind: 'mixed3' };
      expectWholeNonNegative(correctAnswer);

      let expected: number;
      if (c.op1 === '×' && c.op2 === '×') expected = c.a * c.b * c.c;
      else if (c.op1 === '×') expected = c.op2 === '+' ? c.a * c.b + c.c : c.a * c.b - c.c;
      else if (c.op2 === '×') expected = c.op1 === '+' ? c.a + c.b * c.c : c.a - c.b * c.c;
      else expected = c.op2 === '+' ? (c.op1 === '+' ? c.a + c.b : c.a - c.b) + c.c : (c.op1 === '+' ? c.a + c.b : c.a - c.b) - c.c;

      expect(correctAnswer).toBe(expected);
    }
  });
});

describe('math game — level 8: perimeter/area of square/rectangle', () => {
  it('computes the correct perimeter or area for whichever shape was generated', () => {
    for (const { content, correctAnswer } of tasksForLevel(8)) {
      expect(content.kind).toBe('rect');
      const c = content as MathContent & { kind: 'rect' };
      expectWholeNonNegative(correctAnswer);
      if (c.shape === 'square') {
        expect(correctAnswer).toBe(c.metric === 'perimeter' ? c.a * 4 : c.a * c.a);
      } else {
        expect(correctAnswer).toBe(c.metric === 'perimeter' ? (c.a + c.b) * 2 : c.a * c.b);
      }
    }
  });
});

describe('math game — level 9: triangle area / cube / cuboid volume', () => {
  it('computes the correct value for whichever shape was generated', () => {
    for (const { content, correctAnswer } of tasksForLevel(9)) {
      expectWholeNonNegative(correctAnswer);
      if (content.kind === 'triangle') {
        expect(correctAnswer).toBe((content.a * content.h) / 2);
      } else if (content.kind === 'cube') {
        expect(correctAnswer).toBe(content.a ** 3);
      } else if (content.kind === 'cuboid') {
        expect(correctAnswer).toBe(content.a * content.b * content.c);
      } else {
        throw new Error(`unexpected kind for level 9: ${content.kind}`);
      }
    }
  });
});

describe('math game — level 10: Pythagorean theorem', () => {
  it('only ever uses exact integer triples, and the unknown slot matches the hidden leg/hypotenuse', () => {
    for (const { content, correctAnswer } of tasksForLevel(10)) {
      expect(content.kind).toBe('pythagorean');
      const c = content as MathContent & { kind: 'pythagorean' };
      expectWholeNonNegative(correctAnswer);
      // a² + b² = c² must hold exactly — these are real integer triples, never sqrt()-derived.
      expect(c.a * c.a + c.b * c.b).toBe(c.c * c.c);
      expect(correctAnswer).toBe(c[c.unknown]);
    }
  });
});

describe('math game — progressive mode', () => {
  it('steps the level up by 1 each round, clamped to maxLevel, and stays there afterwards', () => {
    const tasksPerRound = 10;
    const tasks = mathGame.generateTasks(
      { progressive: true, startLevel: 1, maxLevel: 5, level: 1 },
      50,
      { startRoundIndex: 0, tasksPerRound },
    );

    // Round 0 (tasks 0-9) must be level 1 -> plain arithmetic additions capped at 10.
    for (let i = 0; i < 10; i++) {
      const c = tasks[i].content as MathContent;
      expect(c.kind).toBe('arithmetic');
    }

    // Round 4 (tasks 40-49) is startLevel(1) + round(4) = level 5 -> multiplication.
    for (let i = 40; i < 50; i++) {
      const c = tasks[i].content as MathContent;
      expect(c.kind).toBe('multiplication');
    }
  });

  it('never exceeds maxLevel even when there are more rounds than levels available', () => {
    const tasksPerRound = 5;
    // 10 rounds' worth of tasks, but maxLevel caps at 3 -> round 9 should still be level 3 (mixed +/- to 20), not overflow into level 13.
    const tasks = mathGame.generateTasks(
      { progressive: true, startLevel: 1, maxLevel: 3, level: 1 },
      50,
      { startRoundIndex: 0, tasksPerRound },
    );
    const lastBatch = tasks.slice(45, 50);
    for (const task of lastBatch) {
      const c = task.content as MathContent;
      expect(c.kind).toBe('arithmetic');
      const correct = task.correctAnswer as number;
      expect(correct).toBeLessThanOrEqual(20);
    }
  });

  it('honors startRoundIndex for a batch that represents a single later round (manual mode)', () => {
    // Manual mode calls generateTasks once per round with no tasksPerRound,
    // so the whole batch should be treated as exactly one round.
    const tasks = mathGame.generateTasks(
      { progressive: true, startLevel: 1, maxLevel: 10, level: 1 },
      20,
      { startRoundIndex: 4 }, // startLevel(1) + round(4) = level 5 -> multiplication
    );
    for (const task of tasks) {
      const c = task.content as MathContent;
      expect(c.kind).toBe('multiplication');
    }
  });
});
