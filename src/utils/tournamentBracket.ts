/**
 * Pure computation helpers for TournamentBracket (see types/index.ts).
 * No Firestore here — just standings math and team-reference resolution,
 * shared between the results page and (later) any other consumer.
 */

import type { BracketMatch, BracketTeamRef, TournamentBracket } from '../types';

export interface StandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Every distinct team name that has appeared in this group's matches, in first-seen order. */
export function teamsInGroup(bracket: TournamentBracket, groupId: string): string[] {
  const seen: string[] = [];
  for (const m of bracket.matches) {
    if (m.groupId !== groupId) continue;
    for (const ref of [m.home, m.away]) {
      if (ref.type === 'manual' && ref.name && !seen.includes(ref.name)) seen.push(ref.name);
    }
  }
  return seen;
}

/**
 * Standings for one group — 2 points win / 1 draw / 0 loss, sorted by points,
 * then goal difference, then goals scored. Only counts matches with both
 * scores entered; unplayed matches don't affect the table.
 */
export function computeGroupStandings(bracket: TournamentBracket, groupId: string): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const ensure = (team: string): StandingRow => {
    let row = rows.get(team);
    if (!row) {
      row = { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
      rows.set(team, row);
    }
    return row;
  };

  for (const team of teamsInGroup(bracket, groupId)) ensure(team);

  for (const m of bracket.matches) {
    if (m.groupId !== groupId) continue;
    if (m.home.type !== 'manual' || m.away.type !== 'manual' || !m.home.name || !m.away.name) continue;
    if (m.homeScore === undefined || m.awayScore === undefined) continue;

    const home = ensure(m.home.name);
    const away = ensure(m.away.name);
    home.played++; away.played++;
    home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) { home.won++; home.points += 2; away.lost++; }
    else if (m.homeScore < m.awayScore) { away.won++; away.points += 2; home.lost++; }
    else { home.drawn++; away.drawn++; home.points += 1; away.points += 1; }
  }

  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;

  return Array.from(rows.values()).sort((a, b) =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)
  );
}

/**
 * Resolve a team-reference slot to a display name. 'manual' is literal text;
 * 'groupStanding' reads the computed table; 'matchWinner'/'matchLoser' read
 * another match's result. Falls back to a readable placeholder (e.g. "A1",
 * "Winner TBD") when the underlying result isn't in yet.
 */
export function resolveTeamRef(ref: BracketTeamRef, bracket: TournamentBracket): string {
  if (ref.type === 'manual') return ref.name || '';
  if (ref.override) return ref.override;

  if (ref.type === 'groupStanding') {
    const group = bracket.groups.find(g => g.id === ref.group);
    const placeholder = `${group?.name || ref.group || '?'}${ref.position ?? ''}`;
    if (!group || !ref.position) return placeholder;
    const standings = computeGroupStandings(bracket, group.id);
    return standings[ref.position - 1]?.team || placeholder;
  }

  // matchWinner / matchLoser
  const match = bracket.matches.find(m => m.id === ref.matchId);
  if (!match || match.homeScore === undefined || match.awayScore === undefined) {
    return ref.type === 'matchWinner' ? 'Winner TBD' : 'Loser TBD';
  }
  if (match.homeScore === match.awayScore) return 'TBD';
  const homeTeam = resolveTeamRef(match.home, bracket);
  const awayTeam = resolveTeamRef(match.away, bracket);
  const homeWon = match.homeScore > match.awayScore;
  return ref.type === 'matchWinner' ? (homeWon ? homeTeam : awayTeam) : (homeWon ? awayTeam : homeTeam);
}

/** True when a non-'manual' slot has been pinned to a fixed name and could be reset back to auto. */
export function isOverridden(ref: BracketTeamRef): boolean {
  return ref.type !== 'manual' && !!ref.override;
}

export function matchLabel(m: BracketMatch, bracket: TournamentBracket): string {
  return `${resolveTeamRef(m.home, bracket)} – ${resolveTeamRef(m.away, bracket)}`;
}
