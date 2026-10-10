/**
 * "Progresívny trénink" — starts easy (small addition/subtraction) and
 * gets harder across the session: small multiplication table, then
 * formula naming, then chemistry/physics quantity naming. The plan is
 * split into four equal bands by task index — reuses the exact same
 * number-generation helpers as the standalone styles (imported, not
 * duplicated) so this never silently drifts from them.
 */

import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask } from '../registry';
import { generateArithmeticTask, type ArithmeticContent } from './randomNumber';
import { generateMultiplicationTask, rangeForSize, type MultiplicationContent } from './multiplicationTable';
import { randomFormula, type FormulaContent } from './mathFormulas';

type ProgressiveContent =
  | ({ kind: 'arithmetic' } & ArithmeticContent)
  | ({ kind: 'multiplication' } & MultiplicationContent)
  | ({ kind: 'formula' } & FormulaContent)
  | { kind: 'chemistry'; symbol: string };

// Deliberately a small, easy-to-extend starting set — chemistry formulas
// and physical quantity symbols side by side, same "name what this is" task.
const QUANTITIES: { symbol: string; nameKey: string }[] = [
  { symbol: 'H₂O', nameKey: 'cognitiveTraining.games.progressiveTraining.items.water' },
  { symbol: 'CO₂', nameKey: 'cognitiveTraining.games.progressiveTraining.items.carbonDioxide' },
  { symbol: 'NaCl', nameKey: 'cognitiveTraining.games.progressiveTraining.items.sodiumChloride' },
  { symbol: 'O₂', nameKey: 'cognitiveTraining.games.progressiveTraining.items.oxygen' },
  { symbol: 'N₂', nameKey: 'cognitiveTraining.games.progressiveTraining.items.nitrogen' },
  { symbol: 'CH₄', nameKey: 'cognitiveTraining.games.progressiveTraining.items.methane' },
  { symbol: 'NaOH', nameKey: 'cognitiveTraining.games.progressiveTraining.items.sodiumHydroxide' },
  { symbol: 'HCl', nameKey: 'cognitiveTraining.games.progressiveTraining.items.hydrochloricAcid' },
  { symbol: 'm', nameKey: 'cognitiveTraining.games.progressiveTraining.items.mass' },
  { symbol: 'v', nameKey: 'cognitiveTraining.games.progressiveTraining.items.velocity' },
  { symbol: 'F', nameKey: 'cognitiveTraining.games.progressiveTraining.items.force' },
  { symbol: 'ρ', nameKey: 'cognitiveTraining.games.progressiveTraining.items.density' },
];

function randomQuantity() {
  return QUANTITIES[Math.floor(Math.random() * QUANTITIES.length)];
}

/** Which of the 4 difficulty bands a given task index falls into, scaled to the plan's actual length. */
function bandFor(index: number, count: number): 1 | 2 | 3 | 4 {
  const quarter = Math.max(1, count) / 4;
  if (index < quarter) return 1;
  if (index < quarter * 2) return 2;
  if (index < quarter * 3) return 3;
  return 4;
}

function generateTasks(_raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const { min: smallMin, max: smallMax } = rangeForSize('small');
  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < count; i++) {
    const band = bandFor(i, count);
    if (band === 1) {
      const base = generateArithmeticTask(1, 10);
      tasks.push({ content: { kind: 'arithmetic', ...(base.content as ArithmeticContent) }, correctAnswer: base.correctAnswer });
    } else if (band === 2) {
      const base = generateMultiplicationTask(smallMin, smallMax);
      tasks.push({ content: { kind: 'multiplication', ...(base.content as MultiplicationContent) }, correctAnswer: base.correctAnswer });
    } else if (band === 3) {
      const entry = randomFormula();
      tasks.push({ content: { kind: 'formula', formula: entry.formula }, correctAnswer: entry.nameKey });
    } else {
      const entry = randomQuantity();
      tasks.push({ content: { kind: 'chemistry', symbol: entry.symbol }, correctAnswer: entry.nameKey });
    }
  }
  return tasks;
}

function ConfigEditor() {
  const { t } = useLanguage();
  return <p className="text-xs text-text-muted italic">{t('cognitiveTraining.noSettings')}</p>;
}

function TaskViewTV({ content, revealedAnswer }: { content: unknown; revealedAnswer?: unknown }) {
  const { t } = useLanguage();
  const c = content as ProgressiveContent;
  const isNamed = c.kind === 'formula' || c.kind === 'chemistry';
  const text =
    c.kind === 'arithmetic' ? `${c.a} ${c.operator} ${c.b} = ${revealedAnswer !== undefined ? String(revealedAnswer) : '?'}` :
    c.kind === 'multiplication' ? `${c.left} ${c.operator} ${c.right} = ${revealedAnswer !== undefined ? String(revealedAnswer) : '?'}` :
    c.kind === 'formula' ? c.formula :
    c.symbol;
  const fontSize = isNamed ? 'min(20vw, 26vh)' : 'min(30vw, 35vh)';
  return (
    <div className="text-center px-8">
      <div className="font-black text-white leading-none" style={{ fontSize }}>{text}</div>
      {revealedAnswer !== undefined && isNamed && (
        <p className="text-white font-semibold mt-6" style={{ fontSize: 'min(6vw, 8vh)' }}>{t(String(revealedAnswer))}</p>
      )}
    </div>
  );
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const c = content as ProgressiveContent;
  const text =
    c.kind === 'arithmetic' ? `${c.a} ${c.operator} ${c.b}` :
    c.kind === 'multiplication' ? `${c.left} ${c.operator} ${c.right}` :
    c.kind === 'formula' ? c.formula :
    c.symbol;
  const isNamed = c.kind === 'formula' || c.kind === 'chemistry';
  return (
    <div className="text-center">
      <div className="text-5xl font-black text-white">{text}{isNamed ? '' : ` = ${String(answer)}`}</div>
      {isNamed ? (
        <p className="text-sm text-app-cyan font-semibold mt-1">{t(String(answer))}</p>
      ) : (
        <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {String(answer)}</p>
      )}
    </div>
  );
}

export const progressiveTrainingGame: CognitiveGameModule = {
  id: 'progressiveTraining',
  nameKey: 'cognitiveTraining.games.progressiveTraining.name',
  defaultConfig: {},
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
