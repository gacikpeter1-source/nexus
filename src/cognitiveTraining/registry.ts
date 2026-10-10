/**
 * Cognitive Training game plugin registry — the one place core code
 * (CreateCognitiveSession, CognitiveSessionControl, CognitiveSessionTV)
 * looks up a game by id. Adding a new game means adding one file under
 * games/ and one entry in the GAMES array below; nothing else in the app
 * needs to change.
 *
 * content/correctAnswer/gameConfig are opaque (`unknown`) at this
 * boundary — only the game module itself knows their real shape. See
 * games/randomNumber.tsx for the simplest possible example.
 */

import type { ComponentType } from 'react';
import { randomNumberGame } from './games/randomNumber';
import { multiplicationTableGame } from './games/multiplicationTable';
import { mathFormulasGame } from './games/mathFormulas';
import { progressiveTrainingGame } from './games/progressiveTraining';

export interface GeneratedTask {
  content: unknown;
  correctAnswer: unknown;
}

export interface CognitiveGameModule {
  id: string;
  nameKey: string; // i18n key, e.g. 'cognitiveTraining.games.randomNumber.name'
  defaultConfig: Record<string, unknown>;
  ConfigEditor: ComponentType<{ value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }>;
  generateTasks: (config: Record<string, unknown>, count: number) => GeneratedTask[];
  // revealedAnswer is only passed once the session's answer-reveal window
  // is active (see cognitiveSessionPhases.ts's isAnswerRevealed) — absent
  // otherwise, in which case the game should just show the bare task.
  TaskViewTV: ComponentType<{ content: unknown; revealedAnswer?: unknown }>;
  TaskViewTrainer: ComponentType<{ content: unknown; answer: unknown }>;
}

const GAMES: CognitiveGameModule[] = [randomNumberGame, multiplicationTableGame, mathFormulasGame, progressiveTrainingGame];

const REGISTRY = new Map(GAMES.map(g => [g.id, g]));

export function getCognitiveGame(id: string): CognitiveGameModule | undefined {
  return REGISTRY.get(id);
}

export function listCognitiveGames(): CognitiveGameModule[] {
  return GAMES;
}
