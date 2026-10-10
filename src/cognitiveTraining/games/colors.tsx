/**
 * "Farby" — three escalating color-naming tasks the player answers out
 * loud (same tap-to-mark model as every other game here):
 *  1. simple   — a circle in one color, centered; say the color.
 *  2. stroop   — a color's NAME is shown, written in a DIFFERENT ink
 *                color; say the ink color, not the word (classic Stroop
 *                interference task).
 *  3. count    — a scatter of colored circles; say how many match the
 *                announced target color.
 * The color/word/ink/target for every task is picked fresh at random —
 * there's no fixed sequence, matching "every interval different color".
 */

import { useLanguage } from '../../contexts/LanguageContext';
import type { CognitiveGameModule, GeneratedTask } from '../registry';

export type ColorKey = 'green' | 'red' | 'yellow' | 'blue' | 'orange' | 'purple';

const PALETTE: { key: ColorKey; hex: string }[] = [
  { key: 'green', hex: '#22C55E' },
  { key: 'red', hex: '#EF4444' },
  { key: 'yellow', hex: '#EAB308' },
  { key: 'blue', hex: '#3B82F6' },
  { key: 'orange', hex: '#F97316' },
  { key: 'purple', hex: '#A855F7' },
];

const HEX_BY_KEY: Record<ColorKey, string> = Object.fromEntries(PALETTE.map(c => [c.key, c.hex])) as Record<ColorKey, string>;

export type ColorsContent =
  | { kind: 'simple'; color: ColorKey }
  | { kind: 'stroop'; word: ColorKey; inkColor: ColorKey }
  | { kind: 'count'; circles: ColorKey[]; targetColor: ColorKey };

interface ColorsConfig {
  level: 1 | 2 | 3;
}

const DEFAULT_CONFIG: ColorsConfig = { level: 1 };

function clampLevel(n: unknown): 1 | 2 | 3 {
  const v = typeof n === 'number' ? Math.round(n) : 1;
  return v <= 1 ? 1 : v >= 3 ? 3 : 2;
}

function resolveConfig(raw: Record<string, unknown>): ColorsConfig {
  return { level: clampLevel(raw.level) };
}

function randomColor(exclude?: ColorKey): ColorKey {
  const pool = exclude ? PALETTE.filter(c => c.key !== exclude) : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)].key;
}

const COUNT_MIN = 8;
const COUNT_MAX = 14;

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function genSimple(): GeneratedTask {
  const color = randomColor();
  return { content: { kind: 'simple', color } as ColorsContent, correctAnswer: color };
}

function genStroop(): GeneratedTask {
  const word = randomColor();
  const inkColor = randomColor(word); // always different from the word itself
  return { content: { kind: 'stroop', word, inkColor } as ColorsContent, correctAnswer: inkColor };
}

function genCount(): GeneratedTask {
  const targetColor = randomColor();
  const total = randomInt(COUNT_MIN, COUNT_MAX);
  const circles: ColorKey[] = Array.from({ length: total }, () => randomColor());
  const correctAnswer = circles.filter(c => c === targetColor).length;
  return { content: { kind: 'count', circles, targetColor } as ColorsContent, correctAnswer };
}

const LEVEL_GENERATORS: Record<1 | 2 | 3, () => GeneratedTask> = {
  1: genSimple,
  2: genStroop,
  3: genCount,
};

function generateTasks(raw: Record<string, unknown>, count: number): GeneratedTask[] {
  const { level } = resolveConfig(raw);
  const gen = LEVEL_GENERATORS[level];
  return Array.from({ length: count }, () => gen());
}

const LEVELS: (1 | 2 | 3)[] = [1, 2, 3];

function ConfigEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const { t } = useLanguage();
  const { level } = resolveConfig(value);
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {LEVELS.map(lvl => (
        <button
          key={lvl}
          type="button"
          onClick={() => onChange({ level: lvl })}
          className={`px-2.5 py-2 text-xs font-semibold rounded-xl border text-left transition-colors ${
            level === lvl ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
          }`}
        >
          {lvl}. {t(`cognitiveTraining.games.colors.levels.level${lvl}`)}
        </button>
      ))}
    </div>
  );
}

function ColorDot({ colorKey, size }: { colorKey: ColorKey; size: string }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: HEX_BY_KEY[colorKey] }} />;
}

function AnswerCaption({ t, answer }: { t: (key: string) => string; answer: unknown }) {
  if (answer === undefined) return null;
  return <p className="text-white font-semibold mt-4" style={{ fontSize: 'min(6vw, 8vh)' }}>{t(`cognitiveTraining.games.colors.colorNames.${String(answer)}`)}</p>;
}

function TaskViewTV({ content, revealedAnswer }: { content: unknown; revealedAnswer?: unknown }) {
  const { t } = useLanguage();
  const c = content as ColorsContent;

  if (c.kind === 'simple') {
    return (
      <div className="flex flex-col items-center">
        <ColorDot colorKey={c.color} size="min(40vw, 45vh)" />
        {revealedAnswer !== undefined && <AnswerCaption t={t} answer={revealedAnswer} />}
      </div>
    );
  }

  if (c.kind === 'stroop') {
    return (
      <div className="text-center px-8">
        <div className="font-black leading-none" style={{ fontSize: 'min(22vw, 30vh)', color: HEX_BY_KEY[c.inkColor] }}>
          {t(`cognitiveTraining.games.colors.colorNames.${c.word}`)}
        </div>
        {revealedAnswer !== undefined && <AnswerCaption t={t} answer={revealedAnswer} />}
      </div>
    );
  }

  // count
  return (
    <div className="flex flex-col items-center gap-6 px-8">
      <div className="flex items-center gap-3">
        <span className="text-white font-bold" style={{ fontSize: 'min(5vw, 7vh)' }}>{t('cognitiveTraining.games.colors.countLabel')}</span>
        <ColorDot colorKey={c.targetColor} size="min(6vw, 8vh)" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-5xl">
        {c.circles.map((color, i) => (
          <ColorDot key={i} colorKey={color} size="min(7vw, 9vh)" />
        ))}
      </div>
      {revealedAnswer !== undefined && (
        <p className="text-white font-black" style={{ fontSize: 'min(10vw, 14vh)' }}>{String(revealedAnswer)}</p>
      )}
    </div>
  );
}

function TaskViewTrainer({ content, answer }: { content: unknown; answer: unknown }) {
  const { t } = useLanguage();
  const c = content as ColorsContent;

  if (c.kind === 'simple') {
    return (
      <div className="flex flex-col items-center">
        <ColorDot colorKey={c.color} size="4rem" />
        <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {t(`cognitiveTraining.games.colors.colorNames.${String(answer)}`)}</p>
      </div>
    );
  }

  if (c.kind === 'stroop') {
    return (
      <div className="text-center">
        <div className="text-4xl font-black" style={{ color: HEX_BY_KEY[c.inkColor] }}>{t(`cognitiveTraining.games.colors.colorNames.${c.word}`)}</div>
        <p className="text-xs text-text-muted mt-1">{t('cognitiveTraining.correctAnswerLabel')} {t(`cognitiveTraining.games.colors.colorNames.${String(answer)}`)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary font-semibold">{t('cognitiveTraining.games.colors.countLabel')}</span>
        <ColorDot colorKey={c.targetColor} size="1.1rem" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 max-w-xs">
        {c.circles.map((color, i) => <ColorDot key={i} colorKey={color} size="0.9rem" />)}
      </div>
      <p className="text-xs text-text-muted">{t('cognitiveTraining.correctAnswerLabel')} {String(answer)}</p>
    </div>
  );
}

export const colorsGame: CognitiveGameModule = {
  id: 'colors',
  nameKey: 'cognitiveTraining.games.colors.name',
  defaultConfig: DEFAULT_CONFIG as unknown as Record<string, unknown>,
  ConfigEditor,
  generateTasks,
  TaskViewTV,
  TaskViewTrainer,
};
