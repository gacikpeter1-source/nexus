/**
 * Individual-elimination bracket builder (karate, taekwondo, kickboxing, MMA,
 * ...) — a straight single-elimination knockout of named participants,
 * decided by a declared winner + method rather than a numeric score.
 *
 * Deliberately separate from tournamentBracket.ts's team-score engine: that
 * engine's matchWinner/matchLoser resolution is score-based (homeScore >
 * awayScore), which has no equivalent here, and its bracket always carries a
 * (here meaningless) group stage. The seeding/bye algorithm below mirrors
 * buildSingleEliminationBracket's approach.
 */

import type { CombatDivision, CombatMatch, CombatSlotRef } from '../types';

export interface CombatRoundLabels {
  bye: string;
  final: string;
  semifinal: string;
  quarterfinal: string;
  roundOf: (n: number) => string;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Balanced seed order for a bracket of `size` (power of 2), e.g. size 8 → [1,8,4,5,2,7,3,6]. */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  const rounds = Math.log2(size);
  for (let r = 1; r < rounds; r++) {
    const sum = 2 ** (r + 1) + 1;
    const next: number[] = [];
    for (const s of seeds) next.push(s, sum - s);
    seeds = next;
  }
  return seeds;
}

function roundLabelFor(roundsFromFinal: number, participantsEntering: number, labels: CombatRoundLabels): string {
  if (roundsFromFinal === 0) return labels.final;
  if (roundsFromFinal === 1) return labels.semifinal;
  if (roundsFromFinal === 2) return labels.quarterfinal;
  return labels.roundOf(participantsEntering);
}

/** Resolves a slot to the participant name currently occupying it — recursively, since a later round's slot references an earlier match's still-unresolved winner. */
export function resolveCombatSlot(ref: CombatSlotRef, matches: CombatMatch[]): string {
  if (ref.type === 'manual') return ref.name || '';
  const match = matches.find(m => m.id === ref.matchId);
  if (!match || !match.winner) return 'TBD';
  return resolveCombatSlot(match.winner === 'home' ? match.home : match.away, matches);
}

/** Auto-decides any still-open match where one side resolved to the bye placeholder, in dependency order, so a bye propagates through the whole bracket. */
function propagateByes(matches: CombatMatch[], byeLabel: string): void {
  for (const m of matches) {
    if (m.winner) continue;
    const homeIsBye = resolveCombatSlot(m.home, matches) === byeLabel;
    const awayIsBye = resolveCombatSlot(m.away, matches) === byeLabel;
    if (!homeIsBye && !awayIsBye) continue;
    m.winner = awayIsBye ? 'home' : 'away';
    m.method = 'walkover';
  }
}

/** Straight knockout bracket for one division's seeded participant list (participants[0] = top seed). */
export function buildCombatDivisionMatches(participants: string[], labels: CombatRoundLabels): CombatMatch[] {
  if (participants.length < 2) return [];

  const size = nextPowerOfTwo(participants.length);
  const totalRounds = Math.log2(size);
  const order = seedOrder(size);
  const seedName = (seed: number): string | null => (seed <= participants.length ? participants[seed - 1] : null);

  const matches: CombatMatch[] = [];
  let matchNumber = 1;
  let roundIds: string[] = [];

  for (let i = 0; i < order.length; i += 2) {
    const homeName = seedName(order[i]);
    const awayName = seedName(order[i + 1]);
    const id = crypto.randomUUID();
    const match: CombatMatch = {
      id,
      matchNumber: matchNumber++,
      round: 1,
      label: roundLabelFor(totalRounds - 1, size, labels),
      home: { type: 'manual', name: homeName ?? labels.bye },
      away: { type: 'manual', name: awayName ?? labels.bye },
    };
    if (!homeName || !awayName) {
      match.winner = homeName ? 'home' : 'away';
      match.method = 'walkover';
    }
    matches.push(match);
    roundIds.push(id);
  }

  let round = 2;
  while (roundIds.length > 1) {
    const nextIds: string[] = [];
    for (let i = 0; i < roundIds.length; i += 2) {
      const id = crypto.randomUUID();
      matches.push({
        id,
        matchNumber: matchNumber++,
        round,
        label: roundLabelFor(totalRounds - round, roundIds.length, labels),
        home: { type: 'matchWinner', matchId: roundIds[i] },
        away: { type: 'matchWinner', matchId: roundIds[i + 1] },
      });
      nextIds.push(id);
    }
    roundIds = nextIds;
    round++;
  }

  propagateByes(matches, labels.bye);
  return matches;
}

/** Every match in a division still waiting on a real decision (not a bye). */
export function pendingCombatMatches(matches: CombatMatch[]): CombatMatch[] {
  return matches.filter(m => !m.winner);
}

export interface CombatScheduleInput {
  firstStartTime: string; // "HH:MM"
  fightMinutes: number;
  breakMinutes: number;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

const UNASSIGNED_SURFACE = '__unassigned__';

/**
 * Stamps a start time onto every real (non-bye) match, ticking
 * fightMinutes+breakMinutes apart per tatami: divisions on different tatamis
 * run in parallel from the same tournament-wide first start time, while
 * divisions sharing one tatami are queued one after another (in the order
 * they're listed) — mirroring the team engine's rink-aware scheduler, just
 * keyed by division order instead of round-robin group matches.
 */
export function applyCombatSchedule(divisions: CombatDivision[], schedule: CombatScheduleInput): CombatDivision[] {
  const nextTimeBySurface = new Map<string, string>();

  return divisions.map(division => {
    const ordered = [...division.matches].sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
    const startTimes = new Map<string, string>();
    for (const match of ordered) {
      if (match.winner) continue; // decided by bye — no real fight to schedule
      const surface = match.surface || UNASSIGNED_SURFACE;
      const currentTime = nextTimeBySurface.get(surface) || schedule.firstStartTime;
      startTimes.set(match.id, currentTime);
      nextTimeBySurface.set(surface, addMinutes(currentTime, schedule.fightMinutes + schedule.breakMinutes));
    }
    return {
      ...division,
      matches: division.matches.map(m => {
        const startTime = startTimes.get(m.id);
        return startTime ? { ...m, startTime } : m;
      }),
    };
  });
}
