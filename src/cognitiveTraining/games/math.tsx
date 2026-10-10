/**
 * "Matematika" — 10 fixed difficulty levels, from simple addition to the
 * Pythagorean theorem. Every generator guarantees a non-negative,
 * whole-number result (see each genLevelN function below); consecutive
 * tasks are never identical (generateNoRepeat). A level can either be
 * fixed for the whole session, or ramp up by 1 each round in "progressive"
 * mode (see GenerateTasksContext in registry.ts for how round boundaries
 * reach this module).
 */

import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask, GenerateTasksContext } from '../registry';

type Op3 = '+' | '-' | '×';

export type MathContent =
  | { kind: 'arithmetic'; a: number; b: number; operator: '+' | '-' }
  | { kind: 'multiplication'; left: number; right: number }
  | { kind: 'division'; dividend: number; divisor: number }
  | { kind: 'mixed3'; a: number; op1: Op3; b: number; op2: Op3; c: number }
  | { kind: 'rect'; shape: 'square'; a: number; metric: 'perimeter' | 'area' }
  | { kind: 'rect'; shape: 'rectangle'; a: number; b: number; metric: 'perimeter' | 'area' }
  | { kind: 'triangle'; a: number; h: number }
  | { kind: 'cube'; a: number }
  | { kind: 'cuboid'; a: number; b: number; c: number }
  | { kind: 'pythagorean'; a: number; b: number; c: number; unknown: 'a' | 'b' | 'c' };

export interface MathConfig {
  level: number; // 1-10, used when progressive === false
  progressive: boolean;
  startLevel: number;
  maxLevel: number;
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

const DEFAULT_CONFIG: MathConfig = { level: 3, progressive: false, startLevel: 1, maxLevel: 10 };

export function clampLevel(n: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n)));
}

export function resolveMathConfig(raw: Record<string, unknown>): MathConfig {
  const level = typeof raw.level === 'number' ? clampLevel(raw.level) : DEFAULT_CONFIG.level;
  const progressive = raw.progressive === true;
  const startLevel = typeof raw.startLevel === 'number' ? clampLevel(raw.startLevel) : DEFAULT_CONFIG.startLevel;
  const maxLevel = Math.max(startLevel, typeof raw.maxLevel === 'number' ? clampLevel(raw.maxLevel) : DEFAULT_CONFIG.maxLevel);
  return { level, progressive, startLevel, maxLevel };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// --- Per-level generators — each one always returns a non-negative,
// whole-number correctAnswer by construction, never by post-hoc rounding.

function genAdditionTo10(): GeneratedTask {
  const b = randomInt(1, 9);
  const a = randomInt(1, 10 - b);
  return { content: { kind: 'arithmetic', a, b, operator: '+' } as MathContent, correctAnswer: a + b };
}

function genSubtractionTo10(): GeneratedTask {
  const a = randomInt(2, 10);
  const b = randomInt(1, a - 1);
  return { content: { kind: 'arithmetic', a, b, operator: '-' } as MathContent, correctAnswer: a - b };
}

function genAddSubTo(limit: number): GeneratedTask {
  const operator: '+' | '-' = Math.random() < 0.5 ? '+' : '-';
  if (operator === '+') {
    const b = randomInt(1, limit - 1);
    const a = randomInt(1, limit - b);
    return { content: { kind: 'arithmetic', a, b, operator: '+' } as MathContent, correctAnswer: a + b };
  }
  const a = randomInt(2, limit);
  const b = randomInt(1, a - 1);
  return { content: { kind: 'arithmetic', a, b, operator: '-' } as MathContent, correctAnswer: a - b };
}

function genSmallMultiplication(): GeneratedTask {
  const left = randomInt(1, 10);
  const right = randomInt(1, 10);
  return { content: { kind: 'multiplication', left, right } as MathContent, correctAnswer: left * right };
}

function genDivisionNoRemainder(): GeneratedTask {
  const divisor = randomInt(1, 10);
  const quotient = randomInt(1, 10);
  return { content: { kind: 'division', dividend: divisor * quotient, divisor } as MathContent, correctAnswer: quotient };
}

function evalWithPrecedence(a: number, op1: Op3, b: number, op2: Op3, c: number): number {
  if (op1 === '×' && op2 === '×') return a * b * c;
  if (op1 === '×') { const ab = a * b; return op2 === '+' ? ab + c : ab - c; }
  if (op2 === '×') { const bc = b * c; return op1 === '+' ? a + bc : a - bc; }
  const left = op1 === '+' ? a + b : a - b;
  return op2 === '+' ? left + c : left - c;
}

function genMixedThree(): GeneratedTask {
  const ops: Op3[] = ['+', '-', '×'];
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = randomInt(1, 10);
    const b = randomInt(1, 10);
    const c = randomInt(1, 10);
    const op1 = ops[Math.floor(Math.random() * ops.length)];
    const op2 = ops[Math.floor(Math.random() * ops.length)];
    const result = evalWithPrecedence(a, op1, b, op2, c);
    if (result >= 0) {
      return { content: { kind: 'mixed3', a, op1, b, op2, c } as MathContent, correctAnswer: result };
    }
  }
  // Astronomically unlikely to be reached, but guarantees termination.
  return { content: { kind: 'mixed3', a: 5, op1: '+', b: 3, op2: '-', c: 2 } as MathContent, correctAnswer: 6 };
}

function genRectMetric(): GeneratedTask {
  const shape: 'square' | 'rectangle' = Math.random() < 0.5 ? 'square' : 'rectangle';
  const metric: 'perimeter' | 'area' = Math.random() < 0.5 ? 'perimeter' : 'area';
  const a = randomInt(2, 20);
  if (shape === 'square') {
    const correctAnswer = metric === 'perimeter' ? a * 4 : a * a;
    return { content: { kind: 'rect', shape: 'square', a, metric } as MathContent, correctAnswer };
  }
  const b = randomInt(2, 20);
  const correctAnswer = metric === 'perimeter' ? (a + b) * 2 : a * b;
  return { content: { kind: 'rect', shape: 'rectangle', a, b, metric } as MathContent, correctAnswer };
}

function genTriangleOrVolume(): GeneratedTask {
  const r = Math.random();
  if (r < 1 / 3) {
    const a = randomInt(2, 20);
    const h = randomInt(1, 10) * 2; // always even -> a*h/2 is always a whole number
    return { content: { kind: 'triangle', a, h } as MathContent, correctAnswer: (a * h) / 2 };
  }
  if (r < 2 / 3) {
    const a = randomInt(1, 8);
    return { content: { kind: 'cube', a } as MathContent, correctAnswer: a ** 3 };
  }
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const c = randomInt(1, 10);
  return { content: { kind: 'cuboid', a, b, c } as MathContent, correctAnswer: a * b * c };
}

// Integer Pythagorean triples only — never derived via sqrt(), so the
// displayed numbers are always exact whole numbers.
const PYTHAGOREAN_TRIPLES: [number, number, number][] = [
  [3, 4, 5], [6, 8, 10], [9, 12, 15], [5, 12, 13], [8, 15, 17], [7, 24, 25], [12, 16, 20], [10, 24, 26], [20, 21, 29], [18, 24, 30],
];

function genPythagorean(): GeneratedTask {
  const [a, b, c] = PYTHAGOREAN_TRIPLES[Math.floor(Math.random() * PYTHAGOREAN_TRIPLES.length)];
  const unknown = (['a', 'b', 'c'] as const)[Math.floor(Math.random() * 3)];
  const correctAnswer = unknown === 'a' ? a : unknown === 'b' ? b : c;
  return { content: { kind: 'pythagorean', a, b, c, unknown } as MathContent, correctAnswer };
}

const LEVEL_GENERATORS: Record<number, () => GeneratedTask> = {
  1: genAdditionTo10,
  2: genSubtractionTo10,
  3: () => genAddSubTo(20),
  4: () => genAddSubTo(100),
  5: genSmallMultiplication,
  6: genDivisionNoRemainder,
  7: genMixedThree,
  8: genRectMetric,
  9: genTriangleOrVolume,
  10: genPythagorean,
};

function generateForLevel(level: number): GeneratedTask {
  return LEVEL_GENERATORS[clampLevel(level)]();
}

function generateNoRepeat(prevSerialized: string | null, gen: () => GeneratedTask): GeneratedTask {
  let task = gen();
  let tries = 0;
  while (prevSerialized !== null && JSON.stringify(task.content) === prevSerialized && tries < 25) {
    task = gen();
    tries++;
  }
  return task;
}

function generateTasks(raw: Record<string, unknown>, count: number, context?: GenerateTasksContext): GeneratedTask[] {
  const config = resolveMathConfig(raw);
  const startRound = context?.startRoundIndex ?? 0;
  const perRound = Math.max(1, context?.tasksPerRound ?? count);
  const tasks: GeneratedTask[] = [];
  let prevSerialized: string | null = null;
  for (let i = 0; i < count; i++) {
    const level = config.progressive
      ? Math.min(config.maxLevel, config.startLevel + startRound + Math.floor(i / perRound))
      : config.level;
    const task = generateNoRepeat(prevSerialized, () => generateForLevel(level));
    tasks.push(task);
    prevSerialized = JSON.stringify(task.content);
  }
  return tasks;
}

const AGE_PRESETS: { key: string; level: number }[] = [
  { key: 'age1', level: 2 },
  { key: 'age2', level: 4 },
  { key: 'age3', level: 7 },
  { key: 'age4', level: 9 },
];

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

function ConfigEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const { t } = useLanguage();
  const config = resolveMathConfig(value);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1">{t('cognitiveTraining.games.math.ageGroupLabel')}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {AGE_PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ ...config, level: p.level, progressive: false })}
              className="px-1.5 py-1.5 text-[10px] font-semibold rounded-lg border bg-app-secondary border-white/10 text-text-secondary hover:border-white/30 transition-colors"
            >
              {t(`cognitiveTraining.games.math.ageGroups.${p.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1">{t('cognitiveTraining.games.math.levelLabel')}</p>
        <div className="grid grid-cols-1 gap-1">
          {LEVELS.map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => onChange({ ...config, level: lvl })}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border text-left transition-colors ${
                !config.progressive && config.level === lvl
                  ? 'bg-app-cyan/10 border-app-cyan text-app-cyan'
                  : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
              }`}
            >
              {lvl}. {t(`cognitiveTraining.games.math.levels.level${lvl}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" checked={config.progressive} onChange={e => onChange({ ...config, progressive: e.target.checked })} />
        {t('cognitiveTraining.games.math.progressiveLabel')}
      </label>

      {config.progressive && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-text-muted">{t('cognitiveTraining.games.math.progressiveHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">{t('cognitiveTraining.games.math.startLevelLabel')}</label>
              <select
                value={config.startLevel}
                onChange={e => onChange({ ...config, startLevel: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                {LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">{t('cognitiveTraining.games.math.maxLevelLabel')}</label>
              <select
                value={config.maxLevel}
                onChange={e => onChange({ ...config, maxLevel: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                {LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MathAnswerLine({ content, answer }: { content: MathContent; answer: unknown }) {
  const { t } = useLanguage();
  const answerText = answer !== undefined ? String(answer) : '?';

  switch (content.kind) {
    case 'arithmetic':
      return <>{content.a} {content.operator} {content.b} = {answerText}</>;
    case 'multiplication':
      return <>{content.left} × {content.right} = {answerText}</>;
    case 'division':
      return <>{content.dividend} ÷ {content.divisor} = {answerText}</>;
    case 'mixed3':
      return <>{content.a} {content.op1} {content.b} {content.op2} {content.c} = {answerText}</>;
    case 'rect': {
      const label = content.shape === 'square'
        ? t('cognitiveTraining.games.math.geometry.square', { a: content.a })
        : t('cognitiveTraining.games.math.geometry.rectangle', { a: content.a, b: content.b });
      const metricLabel = t(`cognitiveTraining.games.math.geometry.${content.metric === 'perimeter' ? 'perimeterLabel' : 'areaLabel'}`);
      return <>{label} → {metricLabel} = {answerText}</>;
    }
    case 'triangle':
      return <>{t('cognitiveTraining.games.math.geometry.triangle', { a: content.a, h: content.h })} → {t('cognitiveTraining.games.math.geometry.areaLabel')} = {answerText}</>;
    case 'cube':
      return <>{t('cognitiveTraining.games.math.geometry.cube', { a: content.a })} → {t('cognitiveTraining.games.math.geometry.volumeLabel')} = {answerText}</>;
    case 'cuboid':
      return <>{t('cognitiveTraining.games.math.geometry.cuboid', { a: content.a, b: content.b, c: content.c })} → {t('cognitiveTraining.games.math.geometry.volumeLabel')} = {answerText}</>;
    case 'pythagorean': {
      const show = (key: 'a' | 'b' | 'c') => content.unknown === key ? answerText : String(content[key]);
      return <>{show('a')}² + {show('b')}² = {show('c')}²</>;
    }
  }
}

const PHRASE_KINDS = new Set(['rect', 'triangle', 'cube', 'cuboid']);

function TaskViewTV({ content, revealedAnswer }: { content: unknown; revealedAnswer?: unknown }) {
  const c = content as MathContent;
  const fontSize = PHRASE_KINDS.has(c.kind) ? 'min(9vw, 14vh)' : c.kind === 'pythagorean' ? 'min(18vw, 24vh)' : 'min(26vw, 32vh)';
  return (
    <div className="text-center px-8">
      <div className="font-black text-white leading-tight" style={{ fontSize }}>
        <MathAnswerLine content={c} answer={revealedAnswer} />
      </div>
    </div>
  );
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const c = content as MathContent;
  return (
    <div className="text-center">
      <div className="text-3xl font-black text-white">
        <MathAnswerLine content={c} answer={answer} />
      </div>
      <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {String(answer)}</p>
    </div>
  );
}

export const mathGame: CognitiveGameModule = {
  id: 'math',
  nameKey: 'cognitiveTraining.games.math.name',
  defaultConfig: DEFAULT_CONFIG as unknown as Record<string, unknown>,
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
