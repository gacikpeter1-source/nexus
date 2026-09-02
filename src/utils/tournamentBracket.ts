/**
 * Pure computation helpers for TournamentBracket (see types/index.ts).
 * No Firestore here — just standings math and team-reference resolution,
 * shared between the results page and (later) any other consumer.
 */

import type { BracketGroup, BracketMatch, BracketTeamRef, TournamentBracket, TournamentRink } from '../types';

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

// ── Setup wizard — builds a full bracket from a few guided questions ────────

export interface WizardGroupInput {
  name: string;
  teamNames: string[];
}

export interface WizardScheduleInput {
  firstStartTime: string; // "HH:MM"
  minutesPerGame: number;
}

/** How many places advance out of a 2-group stage into playoffs. */
export type WizardAdvanceCount = 1 | 2 | 3 | 4;

const groupStandingRef = (groupId: string, position: number): BracketTeamRef => ({
  type: 'groupStanding',
  group: groupId,
  position,
});

const matchWinnerRef = (matchId: string): BracketTeamRef => ({ type: 'matchWinner', matchId });
const matchLoserRef = (matchId: string): BracketTeamRef => ({ type: 'matchLoser', matchId });

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Builds groups + round-robin group-stage matches from the wizard's group
 * inputs. Playoffs (only offered for exactly 2 groups — the one shape with a
 * proven, unambiguous cross-seeding convention) are generated as a separate
 * step by appendCrossSeededPlayoffs so the group stage alone stays usable for
 * any group count.
 */
export function buildGroupStageBracket(groupInputs: WizardGroupInput[]): TournamentBracket {
  const groups: BracketGroup[] = groupInputs.map(g => ({ id: crypto.randomUUID(), name: g.name }));
  const matches: BracketMatch[] = [];
  let matchNumber = 1;

  groupInputs.forEach((input, i) => {
    const groupId = groups[i].id;
    for (const [a, b] of roundRobinPairs(input.teamNames)) {
      matches.push({
        id: crypto.randomUUID(),
        matchNumber: matchNumber++,
        groupId,
        home: { type: 'manual', name: a },
        away: { type: 'manual', name: b },
      });
    }
  });

  return { groups, matches };
}

/**
 * Appends the standard 2-group playoff cross-seeding on top of an existing
 * group-stage bracket: SF1 = 1st-A vs 2nd-B, SF2 = 1st-B vs 2nd-A, Final =
 * winner(SF1) vs winner(SF2), plus a 3rd-place game and, at higher advance
 * counts, extra placement games for the remaining seeds. With advanceCount 1
 * there's no semifinal — just a single Final between the two group winners.
 * Caller is responsible for only offering this when there are exactly 2
 * groups; other group counts don't have one standard seeding convention.
 */
export interface WizardPlayoffLabels {
  semifinal1: string;
  semifinal2: string;
  thirdPlace: string;
  final: string;
  place5to6: string;
  place7to8: string;
}

export function appendCrossSeededPlayoffs(
  bracket: TournamentBracket,
  advanceCount: WizardAdvanceCount,
  labels: WizardPlayoffLabels
): TournamentBracket {
  if (bracket.groups.length !== 2) return bracket;
  const [groupA, groupB] = bracket.groups;
  let matchNumber = bracket.matches.length > 0 ? Math.max(...bracket.matches.map(m => m.matchNumber)) + 1 : 1;
  const newMatches: BracketMatch[] = [];

  if (advanceCount === 1) {
    newMatches.push({
      id: crypto.randomUUID(),
      matchNumber: matchNumber++,
      label: labels.final,
      home: groupStandingRef(groupA.id, 1),
      away: groupStandingRef(groupB.id, 1),
    });
  } else {
    const sf1: BracketMatch = {
      id: crypto.randomUUID(),
      matchNumber: matchNumber++,
      label: labels.semifinal1,
      home: groupStandingRef(groupA.id, 1),
      away: groupStandingRef(groupB.id, 2),
    };
    const sf2: BracketMatch = {
      id: crypto.randomUUID(),
      matchNumber: matchNumber++,
      label: labels.semifinal2,
      home: groupStandingRef(groupB.id, 1),
      away: groupStandingRef(groupA.id, 2),
    };
    newMatches.push(sf1, sf2);
    newMatches.push({
      id: crypto.randomUUID(),
      matchNumber: matchNumber++,
      label: labels.thirdPlace,
      home: matchLoserRef(sf1.id),
      away: matchLoserRef(sf2.id),
    });
    newMatches.push({
      id: crypto.randomUUID(),
      matchNumber: matchNumber++,
      label: labels.final,
      home: matchWinnerRef(sf1.id),
      away: matchWinnerRef(sf2.id),
    });

    if (advanceCount >= 3) {
      newMatches.push({
        id: crypto.randomUUID(),
        matchNumber: matchNumber++,
        label: labels.place5to6,
        home: groupStandingRef(groupA.id, 3),
        away: groupStandingRef(groupB.id, 3),
      });
    }
    if (advanceCount >= 4) {
      newMatches.push({
        id: crypto.randomUUID(),
        matchNumber: matchNumber++,
        label: labels.place7to8,
        home: groupStandingRef(groupA.id, 4),
        away: groupStandingRef(groupB.id, 4),
      });
    }
  }

  return { ...bracket, matches: [...bracket.matches, ...newMatches] };
}

/**
 * Stamps sequential `startTime` values onto every match in matchNumber
 * order, starting at `firstStartTime` and advancing by `minutesPerGame` each
 * game — the same slot is reused across every rink, so with multiple rinks
 * defined this produces one shared kickoff time per round rather than a
 * true per-surface schedule; staff can still hand-adjust individual matches
 * afterward.
 */
export function applySequentialSchedule(bracket: TournamentBracket, schedule: WizardScheduleInput): TournamentBracket {
  const sorted = [...bracket.matches].sort((a, b) => a.matchNumber - b.matchNumber);
  let time = schedule.firstStartTime;
  const times = new Map<string, string>();
  for (const m of sorted) {
    times.set(m.id, time);
    time = addMinutes(time, schedule.minutesPerGame);
  }
  return { ...bracket, matches: bracket.matches.map(m => ({ ...m, startTime: times.get(m.id) || m.startTime })) };
}

export interface WizardRinkAwareScheduleInput {
  firstStartTime: string; // "HH:MM"
  gameMinutes: number;
  breakMinutes: number;
}

/**
 * Schedules every match across the tournament's playing surfaces (each rink,
 * or each half/third of a split rink counts as its own surface) instead of
 * one single queue — matches land round-robin onto surfaces in matchNumber
 * order, so matches on different surfaces share the same start time (they
 * can be played at once) while matches sharing one surface are spaced out
 * by gameMinutes + breakMinutes. With no rinks defined, this is equivalent
 * to one surface (a plain sequential schedule).
 */
export function applyRinkAwareSchedule(bracket: TournamentBracket, schedule: WizardRinkAwareScheduleInput): TournamentBracket {
  const surfaces = allSurfaces(bracket.rinks || []);
  const surfaceCount = Math.max(1, surfaces.length);
  const slotMinutes = schedule.gameMinutes + schedule.breakMinutes;
  const sorted = [...bracket.matches].sort((a, b) => a.matchNumber - b.matchNumber);

  const updates = new Map<string, { startTime: string; surface?: string }>();
  sorted.forEach((m, i) => {
    const slotIndex = Math.floor(i / surfaceCount);
    const surfaceIndex = i % surfaceCount;
    let startTime = schedule.firstStartTime;
    for (let s = 0; s < slotIndex; s++) startTime = addMinutes(startTime, slotMinutes);
    updates.set(m.id, { startTime, surface: surfaces[surfaceIndex] });
  });

  return {
    ...bracket,
    matches: bracket.matches.map(m => {
      const u = updates.get(m.id);
      if (!u) return m;
      return { ...m, startTime: u.startTime, ...(u.surface ? { surface: u.surface } : {}) };
    }),
  };
}

// ── Team-list prep for the standalone-tournament wizard ─────────────────────

/** Splits pasted, comma-separated team names into a clean, trimmed list (blanks dropped). */
export function parsePastedTeamNames(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

/** Names that appear more than once (case-insensitive) — surfaced so staff can fix typos before creating the bracket. */
export function findDuplicateTeamNames(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) dupes.add(name.trim());
    else seen.add(key);
  }
  return Array.from(dupes);
}

/** Randomly deals a flat team list into `groupCount` roughly-even groups. */
export function randomlySplitIntoGroups(teamNames: string[], groupCount: number): string[][] {
  const shuffled = [...teamNames];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((name, i) => groups[i % groupCount].push(name));
  return groups;
}

// ── Single/double-elimination bracket generation ─────────────────────────
// Both use a standard balanced seeding so the top 2 seeds can only meet in
// the final if they keep winning. Team counts that aren't a power of two are
// padded with byes (a literal placeholder team on the round-1 opponent side,
// auto-decided so the real team advances without anyone entering a score) —
// byes then propagate forward automatically through every later round that
// depends on them, since the winner/loser refs resolve through the actual
// (auto-decided) match results.

export interface WizardEliminationLabels {
  bye: string;
  final: string;
  semifinal: string;
  quarterfinal: string;
  roundOf: (teamsEntering: number) => string;
  grandFinal: string;       // double-elim only
  losersRound: (n: number) => string; // double-elim only, 1-indexed
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

function roundLabelFor(roundsFromFinal: number, teamsEntering: number, labels: WizardEliminationLabels): string {
  if (roundsFromFinal === 0) return labels.final;
  if (roundsFromFinal === 1) return labels.semifinal;
  if (roundsFromFinal === 2) return labels.quarterfinal;
  return labels.roundOf(teamsEntering);
}

/** Builds the winners bracket (byes seeded and auto-decided) shared by single- and double-elimination. */
function buildWinnersBracket(
  teamNames: string[],
  labels: WizardEliminationLabels
): { matches: BracketMatch[]; roundsById: string[][]; totalRounds: number; nextMatchNumber: number } {
  const size = nextPowerOfTwo(teamNames.length);
  const totalRounds = Math.log2(size);
  const order = seedOrder(size);
  const seedTeam = (seed: number): string | null => (seed <= teamNames.length ? teamNames[seed - 1] : null);

  const matches: BracketMatch[] = [];
  const roundsById: string[][] = [];
  let matchNumber = 1;
  let roundIds: string[] = [];

  for (let i = 0; i < order.length; i += 2) {
    const homeTeam = seedTeam(order[i]);
    const awayTeam = seedTeam(order[i + 1]);
    const id = crypto.randomUUID();
    const match: BracketMatch = {
      id,
      matchNumber: matchNumber++,
      round: 1,
      label: roundLabelFor(totalRounds - 1, size, labels),
      home: { type: 'manual', name: homeTeam ?? labels.bye },
      away: { type: 'manual', name: awayTeam ?? labels.bye },
    };
    if (!homeTeam || !awayTeam) {
      match.homeScore = homeTeam ? 1 : 0;
      match.awayScore = awayTeam ? 1 : 0;
    }
    matches.push(match);
    roundIds.push(id);
  }
  roundsById.push(roundIds);

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
    roundsById.push(nextIds);
    roundIds = nextIds;
    round++;
  }

  return { matches, roundsById, totalRounds, nextMatchNumber: matchNumber };
}

/** Auto-decides any still-open match where one side has resolved to the literal bye placeholder, in dependency order, so walkovers propagate through the whole bracket. */
function propagateByes(matches: BracketMatch[], byeLabel: string): void {
  const scratch: TournamentBracket = { groups: [], matches };
  for (const m of matches) {
    if (m.homeScore !== undefined) continue;
    const homeName = resolveTeamRef(m.home, scratch);
    const awayName = resolveTeamRef(m.away, scratch);
    const homeIsBye = homeName === byeLabel;
    const awayIsBye = awayName === byeLabel;
    if (!homeIsBye && !awayIsBye) continue;
    // Both sides empty (two byes met, e.g. deep in a small losers bracket) —
    // there's no real winner to pick, but the match still needs a non-draw
    // result so its own matchWinner/matchLoser refs keep resolving; the
    // "win" stays on the home slot's ref chain, which (since it's still
    // just a bye placeholder) keeps propagating as a bye further downstream.
    m.homeScore = awayIsBye ? 1 : 0;
    m.awayScore = awayIsBye ? 0 : 1;
  }
}

/** Straight knockout bracket — one loss and you're out. */
export function buildSingleEliminationBracket(teamNames: string[], labels: WizardEliminationLabels): TournamentBracket {
  if (teamNames.length < 2) return { groups: [], matches: [] };
  const { matches } = buildWinnersBracket(teamNames, labels);
  propagateByes(matches, labels.bye);
  return { groups: [], matches };
}

/**
 * Winners bracket + losers bracket + a single grand final (winners-bracket
 * champion vs losers-bracket champion). Deliberately does NOT auto-generate
 * a "bracket reset" second grand final for when the losers-bracket team
 * wins it — that depends on a result this generator can't know in advance;
 * staff can add that decisive rematch manually via Add Match if it happens.
 */
export function buildDoubleEliminationBracket(teamNames: string[], labels: WizardEliminationLabels): TournamentBracket {
  if (teamNames.length < 2) return { groups: [], matches: [] };
  const { matches, roundsById, totalRounds, nextMatchNumber } = buildWinnersBracket(teamNames, labels);
  let matchNumber = nextMatchNumber;
  const wbChampionMatchId = roundsById[roundsById.length - 1][0];

  let lbChampionRef: BracketTeamRef;
  if (totalRounds < 2) {
    // Only one winners-bracket round (2 teams total) — the "losers bracket"
    // is just that one loser, no extra matches needed to identify it.
    lbChampionRef = matchLoserRef(roundsById[0][0]);
  } else {
    let lbRoundNum = 1;
    const playLbRound = (refs: BracketTeamRef[]): BracketTeamRef[] => {
      const winners: BracketTeamRef[] = [];
      for (let i = 0; i < refs.length; i += 2) {
        const id = crypto.randomUUID();
        matches.push({
          id,
          matchNumber: matchNumber++,
          round: 100 + lbRoundNum,
          label: labels.losersRound(lbRoundNum),
          home: refs[i],
          away: refs[i + 1],
        });
        winners.push(matchWinnerRef(id));
      }
      lbRoundNum++;
      return winners;
    };

    // LB round 1 (minor): the losers of WB round 1 play each other.
    let lbSurvivors = playLbRound(roundsById[0].map(id => matchLoserRef(id)));

    for (let wbRound = 2; wbRound <= totalRounds; wbRound++) {
      const newLosers = roundsById[wbRound - 1].map(id => matchLoserRef(id));
      // Major round: each LB survivor faces one freshly-eliminated WB team.
      const combined: BracketTeamRef[] = [];
      for (let i = 0; i < lbSurvivors.length; i++) combined.push(lbSurvivors[i], newLosers[i]);
      lbSurvivors = playLbRound(combined);
      if (wbRound < totalRounds && lbSurvivors.length > 1) {
        // Minor round: LB survivors play each other before the next WB round's losers arrive.
        lbSurvivors = playLbRound(lbSurvivors);
      }
    }
    lbChampionRef = lbSurvivors[0];
  }

  propagateByes(matches, labels.bye);

  matches.push({
    id: crypto.randomUUID(),
    matchNumber: matchNumber++,
    label: labels.grandFinal,
    home: { type: 'matchWinner', matchId: wbChampionMatchId },
    away: lbChampionRef,
  });

  return { groups: [], matches };
}
