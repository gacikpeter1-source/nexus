/**
 * "Násobilka" — random multiplication or exact division within a small
 * (1-10) or large (1-20) table. Division is always constructed from a
 * known product so the result is guaranteed to be a whole number.
 */

import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask } from '../registry';

type TableSize = 'small' | 'large';

interface MultiplicationConfig {
  size: TableSize;
}

export type Operator = '×' | '÷';

export interface MultiplicationContent {
  left: number;
  right: number;
  operator: Operator;
}

const DEFAULT_CONFIG: MultiplicationConfig = { size: 'small' };

function resolveConfig(raw: Record<string, unknown>): MultiplicationConfig {
  return { size: raw.size === 'large' ? 'large' : 'small' };
}

export function rangeForSize(size: TableSize): { min: number; max: number } {
  return size === 'large' ? { min: 1, max: 20 } : { min: 1, max: 10 };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Exported so progressiveTraining.tsx can reuse the exact same task shape
// for its "medium" band instead of duplicating (and risking drifting
// from) this logic.
export function generateMultiplicationTask(min: number, max: number): GeneratedTask {
  const f1 = randomInt(min, max);
  const f2 = randomInt(min, max);
  if (Math.random() < 0.5) {
    return { content: { left: f1, right: f2, operator: '×' } as MultiplicationContent, correctAnswer: f1 * f2 };
  }
  // Division, built from a known product — always a whole-number result.
  const product = f1 * f2;
  return { content: { left: product, right: f1, operator: '÷' } as MultiplicationContent, correctAnswer: f2 };
}


function generateTasks(raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const { min, max } = rangeForSize(resolveConfig(raw).size);
  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < count; i++) {
    tasks.push(generateMultiplicationTask(min, max));
  }
  return tasks;
}

function ConfigEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const { t } = useLanguage();
  const config = resolveConfig(value);
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange({ size: 'small' })}
        className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
          config.size === 'small' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
        }`}
      >
        {t('cognitiveTraining.games.multiplicationTable.small')}
      </button>
      <button
        type="button"
        onClick={() => onChange({ size: 'large' })}
        className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
          config.size === 'large' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
        }`}
      >
        {t('cognitiveTraining.games.multiplicationTable.large')}
      </button>
    </div>
  );
}

function TaskViewTV({ content, revealedAnswer }: { content: unknown; revealedAnswer?: unknown }) {
  const { left, right, operator } = content as MultiplicationContent;
  return (
    <div className="font-black text-white leading-none" style={{ fontSize: 'min(30vw, 35vh)' }}>
      {left} {operator} {right} = {revealedAnswer !== undefined ? String(revealedAnswer) : '?'}
    </div>
  );
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const { left, right, operator } = content as MultiplicationContent;
  return (
    <div className="text-center">
      <div className="text-5xl font-black text-white">{left} {operator} {right} = {String(answer)}</div>
      <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {String(answer)}</p>
    </div>
  );
}

export const multiplicationTableGame: CognitiveGameModule = {
  id: 'multiplicationTable',
  nameKey: 'cognitiveTraining.games.multiplicationTable.name',
  defaultConfig: DEFAULT_CONFIG as unknown as Record<string, unknown>,
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
