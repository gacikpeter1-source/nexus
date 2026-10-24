import { describe, it, expect } from 'vitest';
import {
  applyRinkAwareSchedule,
  buildGroupStageBracket,
  appendCrossSeededPlayoffs,
  playoffPlacesForAdvanceCount,
  playoffMatchCountForAdvanceCount,
} from './tournamentBracket';
import type { TournamentBracket, BracketMatch } from '../types';

function match(id: string, matchNumber: number): BracketMatch {
  return {
    id,
    matchNumber,
    home: { type: 'manual', name: `Home ${matchNumber}` },
    away: { type: 'manual', name: `Away ${matchNumber}` },
  };
}

function bracket(matchCount: number, rinks: TournamentBracket['rinks'] = []): TournamentBracket {
  return {
    groups: [],
    matches: Array.from({ length: matchCount }, (_, i) => match(`m${i + 1}`, i + 1)),
    rinks,
  };
}

function times(result: TournamentBracket): string[] {
  return [...result.matches].sort((a, b) => a.matchNumber - b.matchNumber).map(m => m.startTime!);
}

describe('applyRinkAwareSchedule', () => {
  it('spaces matches sequentially by gameMinutes + breakMinutes with one surface', () => {
    const result = applyRinkAwareSchedule(bracket(3), { firstStartTime: '09:00', gameMinutes: 15, breakMinutes: 3 });
    expect(times(result)).toEqual(['09:00', '09:18', '09:36']);
  });

  it('pairs matches onto parallel surfaces before advancing the slot', () => {
    const result = applyRinkAwareSchedule(
      bracket(4, [{ id: 'r1', name: 'Ihrisko 1', layout: 'full' }, { id: 'r2', name: 'Ihrisko 2', layout: 'full' }]),
      { firstStartTime: '09:00', gameMinutes: 15, breakMinutes: 3 }
    );
    expect(times(result)).toEqual(['09:00', '09:00', '09:18', '09:18']);
  });

  it('pushes a slot whose game would overlap a maintenance window to right after it ends', () => {
    // Without a window: 09:00, 09:18, 09:36, 09:54, 10:12 — the 09:18 slot
    // (09:18-09:33) would overlap a 09:20-09:35 ice-cleaning window.
    const result = applyRinkAwareSchedule(bracket(5), {
      firstStartTime: '09:00',
      gameMinutes: 15,
      breakMinutes: 3,
      maintenanceWindows: [{ start: '09:20', end: '09:35' }],
    });
    expect(times(result)).toEqual(['09:00', '09:35', '09:53', '10:11', '10:29']);
  });

  it('skips past two adjacent maintenance windows in one go', () => {
    const result = applyRinkAwareSchedule(bracket(2), {
      firstStartTime: '09:00',
      gameMinutes: 15,
      breakMinutes: 3,
      maintenanceWindows: [
        { start: '09:00', end: '09:10' },
        { start: '09:10', end: '09:20' },
      ],
    });
    expect(times(result)).toEqual(['09:20', '09:38']);
  });

  it('ignores an empty or inverted window instead of looping forever', () => {
    const result = applyRinkAwareSchedule(bracket(2), {
      firstStartTime: '09:00',
      gameMinutes: 15,
      breakMinutes: 3,
      maintenanceWindows: [{ start: '10:00', end: '09:00' }],
    });
    expect(times(result)).toEqual(['09:00', '09:18']);
  });
});

const labels = {
  semifinal1: 'SF1',
  semifinal2: 'SF2',
  thirdPlace: '3rd',
  final: 'Final',
  placementRange: (low: number, high: number) => `${low}-${high}`,
};

function groupsOf(sizeA: number, sizeB: number): TournamentBracket {
  return buildGroupStageBracket([
    { name: 'A', teamNames: Array.from({ length: sizeA }, (_, i) => `A${i + 1}`) },
    { name: 'B', teamNames: Array.from({ length: sizeB }, (_, i) => `B${i + 1}`) },
  ]);
}

function playoffLabels(result: TournamentBracket): string[] {
  return result.matches.filter(m => !m.groupId).sort((a, b) => a.matchNumber - b.matchNumber).map(m => m.label!);
}

describe('appendCrossSeededPlayoffs', () => {
  it('advanceCount 1 generates just a final deciding 1st-2nd', () => {
    const result = appendCrossSeededPlayoffs(groupsOf(2, 2), 1, labels);
    expect(playoffLabels(result)).toEqual(['Final']);
    expect(playoffPlacesForAdvanceCount(1)).toBe(2);
  });

  it('advanceCount 2 generates semis + bronze + final, deciding 1st-4th', () => {
    const result = appendCrossSeededPlayoffs(groupsOf(4, 4), 2, labels);
    expect(playoffLabels(result)).toEqual(['SF1', 'SF2', '3rd', 'Final']);
    expect(playoffPlacesForAdvanceCount(2)).toBe(4);
    expect(playoffMatchCountForAdvanceCount(2)).toBe(4);
  });

  it('advanceCount 5 (two 5-team groups) adds placement games all the way down to 9th-10th', () => {
    const result = appendCrossSeededPlayoffs(groupsOf(5, 5), 5, labels);
    expect(playoffLabels(result)).toEqual(['SF1', 'SF2', '3rd', 'Final', '5-6', '7-8', '9-10']);
    expect(playoffPlacesForAdvanceCount(5)).toBe(10);
    expect(playoffMatchCountForAdvanceCount(5)).toBe(7);

    const nineTen = result.matches.find(m => m.label === '9-10')!;
    expect(nineTen.home).toEqual({ type: 'groupStanding', group: result.groups[0].id, position: 5 });
    expect(nineTen.away).toEqual({ type: 'groupStanding', group: result.groups[1].id, position: 5 });
  });
});
