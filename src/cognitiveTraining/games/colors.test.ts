import { describe, it, expect } from 'vitest';
import { colorsGame } from './colors';
import type { ColorsContent } from './colors';

const PALETTE_KEYS = ['green', 'red', 'yellow', 'blue', 'orange', 'purple'];
const SAMPLE = 300;

function tasksForLevel(level: 1 | 2 | 3, count = SAMPLE) {
  return colorsGame.generateTasks({ level }, count).map(t => ({
    content: t.content as ColorsContent,
    correctAnswer: t.correctAnswer,
  }));
}

describe('colors game — level 1: simple color naming', () => {
  it('always names an actual palette color as the answer', () => {
    for (const { content, correctAnswer } of tasksForLevel(1)) {
      expect(content.kind).toBe('simple');
      const c = content as ColorsContent & { kind: 'simple' };
      expect(PALETTE_KEYS).toContain(c.color);
      expect(correctAnswer).toBe(c.color);
    }
  });
});

describe('colors game — level 2: Stroop effect', () => {
  it('the ink color is always different from the written word, and is the correct answer', () => {
    for (const { content, correctAnswer } of tasksForLevel(2)) {
      expect(content.kind).toBe('stroop');
      const c = content as ColorsContent & { kind: 'stroop' };
      expect(PALETTE_KEYS).toContain(c.word);
      expect(PALETTE_KEYS).toContain(c.inkColor);
      expect(c.inkColor).not.toBe(c.word);
      expect(correctAnswer).toBe(c.inkColor);
    }
  });
});

describe('colors game — level 3: counting', () => {
  it('the answer is always the exact count of circles matching the target color', () => {
    for (const { content, correctAnswer } of tasksForLevel(3)) {
      expect(content.kind).toBe('count');
      const c = content as ColorsContent & { kind: 'count' };
      expect(PALETTE_KEYS).toContain(c.targetColor);
      expect(c.circles.length).toBeGreaterThanOrEqual(8);
      expect(c.circles.length).toBeLessThanOrEqual(14);
      for (const circle of c.circles) expect(PALETTE_KEYS).toContain(circle);
      const expected = c.circles.filter(color => color === c.targetColor).length;
      expect(correctAnswer).toBe(expected);
      expect(typeof correctAnswer).toBe('number');
      expect(correctAnswer as number).toBeGreaterThanOrEqual(0);
    }
  });
});
