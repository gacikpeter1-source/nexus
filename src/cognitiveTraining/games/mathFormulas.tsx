/**
 * "Matematické vzorce" — a formula is shown and the player has to name
 * what it calculates (e.g. "2 · π · r" → "Obvod kruhu"). No numeric
 * computation involved — correctAnswer is a translation key for the
 * name, judged by the trainer the same way as any other task.
 */

import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask } from '../registry';

export interface FormulaContent {
  formula: string; // language-neutral math notation
}

// Deliberately a small, easy-to-extend starting set — add more entries
// (and their translations) here without touching anything else.
const FORMULAS: { formula: string; nameKey: string }[] = [
  { formula: '2 · π · r', nameKey: 'cognitiveTraining.games.mathFormulas.items.circleCircumference' },
  { formula: 'π · r²', nameKey: 'cognitiveTraining.games.mathFormulas.items.circleArea' },
  { formula: 'a²', nameKey: 'cognitiveTraining.games.mathFormulas.items.squareArea' },
  { formula: 'a · b', nameKey: 'cognitiveTraining.games.mathFormulas.items.rectangleArea' },
  { formula: 'a³', nameKey: 'cognitiveTraining.games.mathFormulas.items.cubeVolume' },
  { formula: 'a · b · c', nameKey: 'cognitiveTraining.games.mathFormulas.items.cuboidVolume' },
  { formula: 'π · r² · h', nameKey: 'cognitiveTraining.games.mathFormulas.items.cylinderVolume' },
  { formula: '(4/3) · π · r³', nameKey: 'cognitiveTraining.games.mathFormulas.items.sphereVolume' },
  { formula: '½ · a · h', nameKey: 'cognitiveTraining.games.mathFormulas.items.triangleArea' },
  { formula: 'a² + b² = c²', nameKey: 'cognitiveTraining.games.mathFormulas.items.pythagorean' },
];

export function randomFormula() {
  return FORMULAS[Math.floor(Math.random() * FORMULAS.length)];
}

function generateTasks(_raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < count; i++) {
    const entry = randomFormula();
    tasks.push({ content: { formula: entry.formula } as FormulaContent, correctAnswer: entry.nameKey });
  }
  return tasks;
}

function ConfigEditor() {
  const { t } = useLanguage();
  return <p className="text-xs text-text-muted italic">{t('cognitiveTraining.noSettings')}</p>;
}

function TaskViewTV({ content, revealedAnswer }: { content: unknown; revealedAnswer?: unknown }) {
  const { t } = useLanguage();
  const { formula } = content as FormulaContent;
  return (
    <div className="text-center px-8">
      <div className="font-black text-white leading-none" style={{ fontSize: 'min(16vw, 22vh)' }}>{formula}</div>
      {revealedAnswer !== undefined && (
        <p className="text-white font-semibold mt-6" style={{ fontSize: 'min(6vw, 8vh)' }}>{t(String(revealedAnswer))}</p>
      )}
    </div>
  );
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const { formula } = content as FormulaContent;
  return (
    <div className="text-center">
      <div className="text-4xl font-black text-white">{formula}</div>
      <p className="text-sm text-app-cyan font-semibold mt-1">{t(String(answer))}</p>
    </div>
  );
}

export const mathFormulasGame: CognitiveGameModule = {
  id: 'mathFormulas',
  nameKey: 'cognitiveTraining.games.mathFormulas.name',
  defaultConfig: {},
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
