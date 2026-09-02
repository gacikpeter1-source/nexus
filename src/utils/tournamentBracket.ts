/**
 * Pure computation helpers for TournamentBracket (see types/index.ts).
 * No Firestore here — just standings math and team-reference resolution,
 * shared between the results page and (later) any other consumer.
 */

import type { BracketMatch, BracketTeamRef, TournamentBracket, TournamentRink } from '../types';

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
 *
 * Tiebreak: when exactly TWO teams are level on points, their own head-to-
 * head result decides the order (not overall goal difference) — the played
 * match between them wins over goal difference. A 3+-way points tie falls
 * back to goal difference / goals scored, since a pairwise rule doesn't
 * generalize to a group of three or more without a specified mini-league
 * rule, and a draw or an unplayed head-to-head match also falls back.
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
    if (m.live) continue; // in progress — not final yet, doesn't count until staff end it

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

  const baseCompare = (a: StandingRow, b: StandingRow) =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team);

  const list = Array.from(rows.values()).sort(baseCompare);

  // Adjacent-pair pass: swap two teams level on points if they played each
  // other and it wasn't a draw. Skipped when either neighbor also shares
  // the same points total, since that means 3+ teams are tied and a simple
  // pairwise swap doesn't correctly resolve a group tie.
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (a.points !== b.points) continue;
    const prevTied = i > 0 && list[i - 1].points === a.points;
    const nextTied = i + 2 < list.length && list[i + 2].points === b.points;
    if (prevTied || nextTied) continue;

    const h2h = bracket.matches.find(m =>
      m.groupId === groupId &&
      m.home.type === 'manual' && m.away.type === 'manual' &&
      m.homeScore !== undefined && m.awayScore !== undefined &&
      ((m.home.name === a.team && m.away.name === b.team) ||
       (m.home.name === b.team && m.away.name === a.team))
    );
    if (!h2h || h2h.homeScore === h2h.awayScore) continue; // not played, or a draw

    const aIsHome = h2h.home.name === a.team;
    const aWon = aIsHome ? h2h.homeScore! > h2h.awayScore! : h2h.awayScore! > h2h.homeScore!;
    if (!aWon) {
      list[i] = b;
      list[i + 1] = a;
    }
  }

  return list;
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

/** Every distinct team name across the whole bracket (all groups), in first-seen order. */
export function allTeams(bracket: TournamentBracket): string[] {
  const seen: string[] = [];
  for (const group of bracket.groups) {
    for (const team of teamsInGroup(bracket, group.id)) {
      if (!seen.includes(team)) seen.push(team);
    }
  }
  return seen;
}

/** Every selectable surface a rink offers, given how it's split. */
export function rinkSurfaces(rink: TournamentRink): string[] {
  switch (rink.layout) {
    case 'halfCrossIce':
    case 'halfLengthwise':
      return [`${rink.name} – A`, `${rink.name} – B`];
    case 'thirdsCrossIce':
      return [`${rink.name} – 1`, `${rink.name} – 2`, `${rink.name} – 3`];
    case 'full':
    default:
      return [rink.name];
  }
}

/** Every selectable surface across every rink defined for this tournament. */
export function allSurfaces(rinks: TournamentRink[]): string[] {
  return rinks.flatMap(rinkSurfaces);
}

/** Every unique unordered pair from a list of team names (single round-robin), in stable order. */
export function roundRobinPairs(teamNames: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < teamNames.length; i++) {
    for (let j = i + 1; j < teamNames.length; j++) {
      pairs.push([teamNames[i], teamNames[j]]);
    }
  }
  return pairs;
}

/** True when a non-'manual' slot has been pinned to a fixed name and could be reset back to auto. */
export function isOverridden(ref: BracketTeamRef): boolean {
  return ref.type !== 'manual' && !!ref.override;
}

export function matchLabel(m: BracketMatch, bracket: TournamentBracket): string {
  return `${resolveTeamRef(m.home, bracket)} – ${resolveTeamRef(m.away, bracket)}`;
}
