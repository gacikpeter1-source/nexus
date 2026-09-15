/**
 * Position layouts for the event Lineup tool — one "shape" per sport.
 *
 * Hockey and volleyball use repeating lanes (forward/defense lines, service
 * rotations): the trainer adds as many lane rows as needed, each with the
 * same fixed set of position columns. Football instead uses a
 * formation-driven single XI on a pitch (no lanes) — buildFootballSlots()
 * derives the actual on-pitch slot positions from a 'D-M-F' formation
 * string, same convention as CreateStandaloneTournament's sport list.
 */

import type { HockeyLineupLane, VolleyballLineupLane, LineupSport } from '../types';

export interface LineupColumn {
  key: string;
  labelKey: string; // translation key under lineup.columns.*
}

export const HOCKEY_COLUMNS: LineupColumn[] = [
  { key: 'dl', labelKey: 'lineup.columns.dl' },
  { key: 'dr', labelKey: 'lineup.columns.dr' },
  { key: 'wl', labelKey: 'lineup.columns.wl' },
  { key: 'wr', labelKey: 'lineup.columns.wr' },
  { key: 'c', labelKey: 'lineup.columns.c' },
];

export const VOLLEYBALL_COLUMNS: LineupColumn[] = [
  { key: 'p1', labelKey: 'lineup.columns.p1' },
  { key: 'p2', labelKey: 'lineup.columns.p2' },
  { key: 'p3', labelKey: 'lineup.columns.p3' },
  { key: 'p4', labelKey: 'lineup.columns.p4' },
  { key: 'p5', labelKey: 'lineup.columns.p5' },
  { key: 'p6', labelKey: 'lineup.columns.p6' },
];

export function emptyLane(cols: LineupColumn[]): Record<string, string | null> {
  const lane: Record<string, string | null> = {};
  cols.forEach(c => { lane[c.key] = null; });
  return lane;
}

export const LANE_SPORTS: LineupSport[] = ['hockey', 'volleyball'];

export function columnsForSport(sport: LineupSport): LineupColumn[] {
  return sport === 'hockey' ? HOCKEY_COLUMNS : VOLLEYBALL_COLUMNS;
}

export function hasGoalies(sport: LineupSport): boolean {
  return sport === 'hockey';
}

export const FOOTBALL_FORMATIONS = ['4-3-3', '3-4-3', '4-4-2', '3-5-2', '5-3-2'];

export type FootballSlotGroup = 'fw' | 'mf' | 'df' | 'gk';

export interface FootballSlot {
  id: string;
  group: FootballSlotGroup;
  labelKey: string; // translation key
  x: number; // percent, 0-100
  y: number; // percent, 0-100
}

const FOOTBALL_GROUP_LABEL_KEY: Record<FootballSlotGroup, string> = {
  fw: 'lineup.columns.forward',
  mf: 'lineup.columns.midfield',
  df: 'lineup.columns.defense',
  gk: 'lineup.goalie',
};

export function buildFootballSlots(formation: string): FootballSlot[] {
  const parts = formation.split('-').map(n => parseInt(n, 10));
  const [df, mf, fw] = parts.length === 3 && parts.every(n => !isNaN(n)) ? parts : [4, 3, 3];
  const slots: FootballSlot[] = [];

  function row(n: number, group: FootballSlotGroup, y: number, prefix: string) {
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 50 : 14 + i * (72 / (n - 1));
      slots.push({ id: `${prefix}${i}`, group, labelKey: FOOTBALL_GROUP_LABEL_KEY[group], x, y });
    }
  }

  row(fw, 'fw', 12, 'fw');
  row(mf, 'mf', 40, 'mf');
  row(df, 'df', 66, 'df');
  slots.push({ id: 'gk', group: 'gk', labelKey: FOOTBALL_GROUP_LABEL_KEY.gk, x: 50, y: 90 });
  return slots;
}

export type { HockeyLineupLane, VolleyballLineupLane };
