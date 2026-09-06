/**
 * Sport registry for tournament creation.
 *
 * `format` is forward-looking metadata, not yet wired to any bracket-building
 * logic — today every sport still uses the same team-score bracket engine
 * (groups + matches + a single score per side). It records which of the
 * eventual match-format engines (team-score / set-based / individual-
 * elimination / time-ranked) each sport actually belongs to, so that work can
 * key off it later without re-touching the sport list or the wizard's step.
 */

export type SportId =
  | 'hockey'
  | 'football'
  | 'basketball'
  | 'waterPolo'
  | 'volleyball'
  | 'tennis'
  | 'tableTennis'
  | 'swimming'
  | 'running'
  | 'karate'
  | 'taekwondo'
  | 'other';

export type SportFormat = 'teamScore' | 'setBased' | 'individualElimination' | 'timeRanked';

export interface SportDef {
  id: SportId;
  format: SportFormat;
  icon: string;
}

export const SPORTS: SportDef[] = [
  { id: 'hockey', format: 'teamScore', icon: '🏒' },
  { id: 'football', format: 'teamScore', icon: '⚽' },
  { id: 'basketball', format: 'teamScore', icon: '🏀' },
  { id: 'waterPolo', format: 'teamScore', icon: '🤽' },
  { id: 'volleyball', format: 'setBased', icon: '🏐' },
  { id: 'tennis', format: 'setBased', icon: '🎾' },
  { id: 'tableTennis', format: 'setBased', icon: '🏓' },
  { id: 'swimming', format: 'timeRanked', icon: '🏊' },
  { id: 'running', format: 'timeRanked', icon: '🏃' },
  { id: 'karate', format: 'individualElimination', icon: '🥋' },
  { id: 'taekwondo', format: 'individualElimination', icon: '🥋' },
  { id: 'other', format: 'teamScore', icon: '🏆' },
];
