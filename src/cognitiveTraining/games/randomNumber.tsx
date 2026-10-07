/**
 * Demo game — shows a random integer in a configurable range. No real
 * "skill" involved; it exists purely to verify the TV/phone sync works
 * end to end before any real game is built on top of this base.
 */

import type { CognitiveGameModule, GeneratedTask } from '../registry';

interface RandomNumberConfig {
  min: number;
  max: number;
}

interface RandomNumberContent {
  number: number;
}

const DEFAULT_CONFIG: RandomNumberConfig = { min: 1, max: 20 };

function resolveConfig(raw: Record<string, unknown>): RandomNumberConfig {
  const min = typeof raw.min === 'number' ? raw.min : DEFAULT_CONFIG.min;
  const max = typeof raw.max === 'number' ? raw.max : DEFAULT_CONFIG.max;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function generateTasks(raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const { min, max } = resolveConfig(raw);
  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < count; i++) {
    const number = Math.floor(min + Math.random() * (max - min + 1));
    tasks.push({ content: { number } as RandomNumberContent, correctAnswer: number });
  }
  return tasks;
}

function ConfigEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const config = resolveConfig(value);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1">Min</label>
        <input
          type="number"
          value={config.min}
          onChange={e => onChange({ ...config, min: Number(e.target.value) || 1 })}
          className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1">Max</label>
        <input
          type="number"
          value={config.max}
          onChange={e => onChange({ ...config, max: Number(e.target.value) || 20 })}
          className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
        />
      </div>
    </div>
  );
}

function TaskViewTV({ content }: { content: unknown }) {
  const { number } = content as RandomNumberContent;
  return <div className="font-black text-white leading-none" style={{ fontSize: 'min(45vw, 50vh)' }}>{number}</div>;
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { number } = content as RandomNumberContent;
  return (
    <div className="text-center">
      <div className="text-6xl font-black text-white">{number}</div>
      <p className="text-xs text-text-muted mt-1">Správna odpoveď: {String(answer)}</p>
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
