/**
 * "Náhodné čísla" — addition/subtraction practice. Two random whole
 * numbers from a configurable range, combined with + or − (subtraction
 * always ordered so the result is a non-negative whole number).
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask } from '../registry';

interface RandomNumberConfig {
  min: number;
  max: number;
}

export type Operator = '+' | '-';

export interface ArithmeticContent {
  a: number;
  b: number;
  operator: Operator;
}

const DEFAULT_CONFIG: RandomNumberConfig = { min: 1, max: 20 };

function resolveConfig(raw: Record<string, unknown>): RandomNumberConfig {
  const min = typeof raw.min === 'number' ? raw.min : DEFAULT_CONFIG.min;
  const max = typeof raw.max === 'number' ? raw.max : DEFAULT_CONFIG.max;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Exported so progressiveTraining.tsx can reuse the exact same task shape
// for its "easy" band instead of duplicating (and risking drifting from)
// this logic.
export function generateArithmeticTask(min: number, max: number): GeneratedTask {
  let a = randomInt(min, max);
  let b = randomInt(min, max);
  const operator: Operator = Math.random() < 0.5 ? '+' : '-';
  // Subtraction always ordered largest-first — every math task here must
  // have a whole-number result, and a negative one isn't appropriate for
  // this audience.
  if (operator === '-' && a < b) [a, b] = [b, a];
  const correctAnswer = operator === '+' ? a + b : a - b;
  return { content: { a, b, operator } as ArithmeticContent, correctAnswer };
}

function generateTasks(raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const { min, max } = resolveConfig(raw);
  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < count; i++) {
    tasks.push(generateArithmeticTask(min, max));
  }
  return tasks;
}

function ConfigEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const { t } = useLanguage();
  const config = resolveConfig(value);

  // Lets each field go visually blank while being retyped instead of
  // snapping to a digit mid-edit — same pattern as CreateTrainingTimer.tsx.
  const [minBlank, setMinBlank] = useState(false);
  const [maxBlank, setMaxBlank] = useState(false);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">{t('cognitiveTraining.games.randomNumber.min')}</label>
          <input
            type="number"
            value={minBlank ? '' : config.min}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') { setMinBlank(true); return; }
              setMinBlank(false);
              onChange({ ...config, min: Number(raw) || 1 });
            }}
            onBlur={() => setMinBlank(false)}
            className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">{t('cognitiveTraining.games.randomNumber.max')}</label>
          <input
            type="number"
            value={maxBlank ? '' : config.max}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') { setMaxBlank(true); return; }
              setMaxBlank(false);
              onChange({ ...config, max: Number(raw) || 20 });
            }}
            onBlur={() => setMaxBlank(false)}
            className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          />
        </div>
      </div>
      <p className="text-[10px] text-text-muted">{t('cognitiveTraining.games.randomNumber.rangeHint', { min: config.min, max: config.max })}</p>
    </div>
  );
}

function TaskViewTV({ content }: { content: unknown }) {
  const { a, b, operator } = content as ArithmeticContent;
  return <div className="font-black text-white leading-none" style={{ fontSize: 'min(30vw, 35vh)' }}>{a} {operator} {b} = ?</div>;
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const { a, b, operator } = content as ArithmeticContent;
  return (
    <div className="text-center">
      <div className="text-5xl font-black text-white">{a} {operator} {b} = {String(answer)}</div>
      <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {String(answer)}</p>
    </div>
  );
}

export const randomNumberGame: CognitiveGameModule = {
  id: 'randomNumber',
  nameKey: 'cognitiveTraining.games.randomNumber.name',
  defaultConfig: DEFAULT_CONFIG as unknown as Record<string, unknown>,
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
