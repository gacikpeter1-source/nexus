/**
 * StatsTab — Team statistics dashboard hub
 *
 * Architecture: DASHBOARDS array drives the card grid.
 * To add a new dashboard: push a new entry to DASHBOARDS and add its
 * render block under "Dashboard content" below.
 *
 * Athlete resolution (mirrors AttendTab):
 *   - Team member with childIds  → replaced by their child athlete accounts
 *   - Team member without childIds → appears directly as an athlete
 * Stats are always keyed by the ATHLETE id (child or direct member),
 * never by the parent's id — because attendance records use athlete ids.
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { getTeamNominations, getTeamTournaments } from '../../services/firebase/nominations';
import { getTeamPlayerCards } from '../../services/firebase/playerCards';
import { resolveTeamRef } from '../../utils/tournamentBracket';
import type { User, NominationGame, PlayerCard } from '../../types';
import type { Attendance } from '../../types/attendance';

interface Props {
  clubId: string;
  teamId: string;
  members: User[];       // raw team members (may include parents)
  canManage: boolean;
  currentUserId: string;
}

type DashboardId = 'attendance' | 'games' | 'overview' | 'cards';

interface Athlete {
  userId: string;
  userName: string;
  photoURL?: string;
}

interface MemberStat extends Athlete {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}

interface SessionRow {
  sessionDate: string;
  eventTitle: string;
  status: string;
}

interface GameRecord {
  nominationId: string;
  nominationTitle: string;
  game: NominationGame;
  nameMap: Record<string, string>; // athleteId -> display name, scoped to that game's nomination roster
  confirmedAthleteIds: string[]; // roster confirmed for this nomination — credited with "played" for every game in it
}

// ── colour helpers ──────────────────────────────────────────────────────────
const rateColor = (r: number) =>
  r >= 90 ? 'text-chart-cyan' : r >= 75 ? 'text-green-400' : r >= 60 ? 'text-yellow-400' : 'text-chart-pink';

const barColor = (r: number) =>
  r >= 90 ? 'bg-chart-cyan' : r >= 75 ? 'bg-green-400' : r >= 60 ? 'bg-yellow-400' : 'bg-chart-pink';

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useLanguage();
  switch (status) {
    case 'present':  return <span className="text-[10px] text-chart-cyan  font-semibold">✓ {t('stats.statusPresent')}</span>;
    case 'absent':   return <span className="text-[10px] text-chart-pink  font-semibold">✗ {t('stats.statusAbsent')}</span>;
    case 'late':     return <span className="text-[10px] text-yellow-400  font-semibold">⌚ {t('stats.statusLate')}</span>;
    case 'excused':  return <span className="text-[10px] text-chart-purple font-semibold">◎ {t('stats.statusExcused')}</span>;
    default:         return <span className="text-[10px] text-text-muted">—</span>;
  }
};

// ── dashboard definitions ───────────────────────────────────────────────────
interface DashDef {
  id: DashboardId;
  title: string;
  icon: React.ReactNode;
  available: boolean;
}

const DASHBOARDS: DashDef[] = [
  {
    id: 'attendance',
    title: 'stats.dashboards.attendance',
    available: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'games',
    title: 'stats.dashboards.games',
    available: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'overview',
    title: 'stats.dashboards.overview',
    available: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'cards',
    title: 'stats.dashboards.cards',
    available: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

// ── main component ──────────────────────────────────────────────────────────
export default function StatsTab({ clubId, teamId, members, canManage, currentUserId }: Props) {
  const { t } = useLanguage();
  const [activeDashboard, setActiveDashboard] = useState<DashboardId | null>(null);

  // Resolved athletes — children replace parents, direct members stay
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  // Athlete IDs that represent the current user (own id, or their children)
  const [myAthleteIds, setMyAthleteIds] = useState<string[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(false);

  // Attendance state
  const [attendanceDocs, setAttendanceDocs] = useState<Attendance[]>([]);
  const [loadingAtt, setLoadingAtt]         = useState(false);
  const [eventTitles, setEventTitles]       = useState<Record<string, string>>({});
  const [loadingTitles, setLoadingTitles]   = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [exporting, setExporting]           = useState(false);

  // Games/Overview state — played games (teamScore + opponentScore both set)
  // flattened from every nomination (single + tournament) this team has.
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [expandedGameKey, setExpandedGameKey] = useState<string | null>(null);
  const [expandedTournamentKey, setExpandedTournamentKey] = useState<string | null>(null);

  // Team Cards state — position/handedness/jersey/photo per athlete, keyed by athleteId
  const [playerCards, setPlayerCards] = useState<Record<string, PlayerCard>>({});
  const [loadingCards, setLoadingCards] = useState(false);

  // Resolve athletes whenever team members change (same logic as AttendTab)
  useEffect(() => {
    if (members.length > 0) resolveAthletes();
    else { setAthletes([]); setMyAthleteIds([]); }
  }, [members, teamId, currentUserId]);

  const resolveAthletes = async () => {
    setAthletesLoading(true);
    try {
      const childIdSet: Record<string, true> = {}; // child IDs from active parents
      const parentMembersList: User[] = [];
      const directAthletes: Athlete[] = [];
      const currentUserChildIds: string[] = [];

      for (const member of members) {
        const isActivePar = (member.role === 'parent' || member.isParent === true)
          && member.childIds && member.childIds.length > 0;

        if (isActivePar) {
          // Active parent — their children are the athletes
          parentMembersList.push(member);
          for (const childId of member.childIds!) {
            childIdSet[childId] = true;
          }
          if (member.id === currentUserId) {
            currentUserChildIds.push(...member.childIds!);
          }
        } else {
          // Direct athlete — no active parent role
          directAthletes.push({
            userId: member.id,
            userName: member.displayName,
            photoURL: member.photoURL,
          });
        }
      }

      // Fetch child user documents
      const allChildIds = Object.keys(childIdSet);
      const childUsers = allChildIds.length > 0
        ? await Promise.all(
            allChildIds.map(async id => {
              const snap = await getDoc(doc(db, 'users', id));
              return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
            })
          )
        : [];

      // Only children explicitly assigned to this team
      const childrenHere = (childUsers.filter(Boolean) as User[])
        .filter(c => Array.isArray(c.teamIds) && c.teamIds.includes(teamId));
      const childAthletes: Athlete[] = childrenHere
        .map(c => ({ userId: c.id, userName: c.displayName, photoURL: c.photoURL }));

      // Parents whose children are not in this team fall back to appearing directly
      const childIdsHere = new Set(childrenHere.map(c => c.id));
      const parentsWithNoChildHere: Athlete[] = parentMembersList
        .filter(p => !p.childIds!.some(cid => childIdsHere.has(cid)))
        .map(p => ({ userId: p.id, userName: p.displayName, photoURL: p.photoURL }));

      const resolved = [...directAthletes, ...childAthletes, ...parentsWithNoChildHere];
      setAthletes(resolved);

      // Personal view: current user's children (if active parent) or themselves
      const myChildrenHere = currentUserChildIds.filter(cid => childIdsHere.has(cid));
      if (myChildrenHere.length > 0) {
        setMyAthleteIds(myChildrenHere);
      } else {
        // Current user is a direct athlete (or trainer, or parent with no children here)
        setMyAthleteIds([currentUserId]);
      }
    } catch (err) {
      console.error('StatsTab: athlete resolve failed', err);
    } finally {
      setAthletesLoading(false);
    }
  };

  // Lazy-load attendance when the dashboard opens
  useEffect(() => {
    if (activeDashboard === 'attendance' && attendanceDocs.length === 0 && !loadingAtt) {
      loadAttendance();
    }
  }, [activeDashboard]);

  // Lazy-load played games when Games, Team Overview, or Team Cards opens
  useEffect(() => {
    if ((activeDashboard === 'games' || activeDashboard === 'overview' || activeDashboard === 'cards') && gameRecords.length === 0 && !loadingGames) {
      loadGames();
    }
  }, [activeDashboard]);

  // Lazy-load player cards (position/handedness/jersey/photo) when Team Cards opens
  useEffect(() => {
    if (activeDashboard === 'cards' && Object.keys(playerCards).length === 0 && !loadingCards) {
      loadPlayerCards();
    }
  }, [activeDashboard]);

  const loadPlayerCards = async () => {
    setLoadingCards(true);
    try {
      const list = await getTeamPlayerCards(clubId, teamId);
      const map: Record<string, PlayerCard> = {};
      list.forEach(c => { map[c.athleteId] = c; });
      setPlayerCards(map);
    } catch (err) {
      console.error('StatsTab: player cards load failed', err);
    } finally {
      setLoadingCards(false);
    }
  };

  const loadGames = async () => {
    setLoadingGames(true);
    try {
      // Staff can read every nomination (single + tournament); a regular member's
      // query is only provably safe under the rules when scoped to tournament-kind
      // docs, since single-game nominations stay private to staff + recipients.
      const nominations = canManage
        ? await getTeamNominations(clubId, teamId)
        : await getTeamTournaments(clubId, teamId);
      const records: GameRecord[] = [];
      for (const nom of nominations) {
        const nameMap: Record<string, string> = {};
        Object.values(nom.primary).forEach(e => { nameMap[e.athleteId] = e.displayName; });
        Object.values(nom.backlog).forEach(e => { nameMap[e.athleteId] = e.displayName; });
        // Confirmed roster for this nomination — credited with "played" for every
        // played game in it (there's no separate per-game attendance record).
        const confirmedAthleteIds = Object.values(nom.primary)
          .filter(e => e.status === 'confirmed')
          .map(e => e.athleteId);
        for (const game of nom.games) {
          if (game.teamScore === undefined || game.opponentScore === undefined) continue;
          records.push({ nominationId: nom.id, nominationTitle: nom.title, game, nameMap, confirmedAthleteIds });
        }

        // Multi-team bracket tournaments (groups + playoffs) keep their scores on
        // bracket.matches, not on games[] — pull this team's own matches in too,
        // once staff has marked which resolved bracket name is "us".
        if (nom.bracket && nom.favoriteTeamName) {
          const bracket = nom.bracket;
          const sharedDate = nom.games[0]?.date || '';
          for (const m of bracket.matches) {
            if (m.homeScore === undefined || m.awayScore === undefined) continue;
            const homeName = resolveTeamRef(m.home, bracket);
            const awayName = resolveTeamRef(m.away, bracket);
            const weAreHome = homeName === nom.favoriteTeamName;
            const weAreAway = awayName === nom.favoriteTeamName;
            if (!weAreHome && !weAreAway) continue;
            records.push({
              nominationId: nom.id,
              nominationTitle: nom.title,
              game: {
                id: `bracket-${m.id}`,
                date: sharedDate,
                opponent: weAreHome ? awayName : homeName,
                teamScore: weAreHome ? m.homeScore : m.awayScore,
                opponentScore: weAreHome ? m.awayScore : m.homeScore,
              },
              nameMap,
              confirmedAthleteIds,
            });
          }
        }
      }
      records.sort((a, b) => b.game.date.localeCompare(a.game.date));
      setGameRecords(records);
    } catch (err) {
      console.error('StatsTab: games load failed', err);
    } finally {
      setLoadingGames(false);
    }
  };

  const loadAttendance = async () => {
    setLoadingAtt(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('clubId', '==', clubId),
          where('teamId', '==', teamId)
        )
      );
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Attendance)
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
      setAttendanceDocs(docs);
    } catch (err) {
      console.error('StatsTab: attendance load failed', err);
    } finally {
      setLoadingAtt(false);
    }
  };

  // Load event titles once — only when a session list is first expanded
  const ensureEventTitles = async () => {
    if (Object.keys(eventTitles).length > 0 || loadingTitles) return;
    const ids = [...new Set(attendanceDocs.map(d => d.eventId).filter(Boolean) as string[])];
    if (ids.length === 0) return;
    setLoadingTitles(true);
    try {
      const results = await Promise.all(
        ids.map(async id => {
          const snap = await getDoc(doc(db, 'events', id));
          return { id, title: snap.exists() ? (snap.data().title as string) : '' };
        })
      );
      const map: Record<string, string> = {};
      results.forEach(r => { if (r.title) map[r.id] = r.title; });
      setEventTitles(map);
    } catch (err) {
      console.error('StatsTab: event title load failed', err);
    } finally {
      setLoadingTitles(false);
    }
  };

  // Compute per-athlete stats from loaded attendance docs
  const memberStats = useMemo((): MemberStat[] => {
    return athletes
      .map(athlete => {
        let total = 0, present = 0, absent = 0, late = 0, excused = 0;
        for (const d of attendanceDocs) {
          const rec = d.records?.[athlete.userId];
          if (!rec) continue;
          total++;
          if (rec.status === 'present')       present++;
          else if (rec.status === 'absent')   absent++;
          else if (rec.status === 'late')     late++;
          else if (rec.status === 'excused')  excused++;
        }
        return { ...athlete, total, present, absent, late, excused,
          rate: total > 0 ? Math.round((present / total) * 100) : 0 };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [athletes, attendanceDocs]);

  // Stats for the current user's athlete(s) — used in personal view
  const myStats = memberStats.filter(s => myAthleteIds.includes(s.userId));

  // Best rate among my athletes — shown on the dashboard card
  const myBestRate = myStats.length > 0 && myStats.some(s => s.total > 0)
    ? Math.max(...myStats.filter(s => s.total > 0).map(s => s.rate))
    : null;

  // Sessions for a single athlete, sorted newest first
  const getAthleteSessions = (userId: string): SessionRow[] =>
    attendanceDocs
      .filter(d => d.records?.[userId])
      .map(d => ({
        sessionDate: d.sessionDate,
        eventTitle: d.eventId ? (eventTitles[d.eventId] || t('stats.training')) : t('stats.training'),
        status: d.records[userId].status,
      }));

  const toggleExpand = async (userId: string) => {
    if (expandedUserId === userId) { setExpandedUserId(null); return; }
    setExpandedUserId(userId);
    await ensureEventTitles();
  };

  // Excel export — xlsx loaded dynamically to keep initial bundle small
  const handleExport = async () => {
    if (memberStats.length === 0 || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const summaryData = [
        [t('stats.exportAthlete'), t('stats.exportTotalSessions'), t('stats.statusPresent'), t('stats.statusAbsent'), t('stats.statusLate'), t('stats.statusExcused'), t('stats.exportAttendancePct')],
        ...memberStats.map(m => [
          m.userName, m.total, m.present, m.absent, m.late, m.excused, `${m.rate}%`,
        ]),
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];

      const detailRows: (string | number)[][] = [[t('stats.exportAthlete'), t('stats.date'), t('stats.session'), t('stats.status')]];
      for (const ms of memberStats) {
        for (const s of getAthleteSessions(ms.userId)) {
          detailRows.push([ms.userName, s.sessionDate, s.eventTitle, s.status]);
        }
      }
      const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
      wsDetail['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 28 }, { wch: 10 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Sessions');
      XLSX.writeFile(wb, `attendance_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('StatsTab: export failed', err);
    } finally {
      setExporting(false);
    }
  };

  // ── shared session list UI ─────────────────────────────────────────────────
  const SessionList = ({ userId }: { userId: string }) => {
    const sessions = getAthleteSessions(userId);
    if (loadingTitles) {
      return <div className="flex justify-center py-3"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" /></div>;
    }
    if (sessions.length === 0) {
      return <p className="text-center text-xs text-text-secondary py-3">{t('stats.noSessions')}</p>;
    }
    return (
      <div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold border-b border-white/5">
          <span className="w-16 flex-shrink-0">{t('stats.date')}</span>
          <span className="flex-1">{t('stats.session')}</span>
          <span className="w-16 text-right flex-shrink-0">{t('stats.status')}</span>
        </div>
        {sessions.map((s, i) => (
          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-[10px] text-text-muted w-16 flex-shrink-0">
              {new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })}
            </span>
            <span className="flex-1 text-xs text-text-primary truncate">{s.eventTitle}</span>
            <span className="w-16 text-right flex-shrink-0"><StatusBadge status={s.status} /></span>
          </div>
        ))}
      </div>
    );
  };

  // ── team overview aggregation ────────────────────────────────────────────────
  const overview = useMemo(() => {
    let wins = 0, losses = 0, draws = 0, goalsFor = 0, goalsAgainst = 0;
    const scorers: Record<string, { name: string; goals: number; assists: number }> = {};
    const penalties: Record<string, { name: string; minutes: number }> = {};
    const goalies: Record<string, { name: string; saves: number; goalsAgainst: number }> = {};
    const headToHead: Record<string, { wins: number; losses: number; draws: number }> = {};

    const bump = (name: string) => (scorers[name] ||= { name, goals: 0, assists: 0 });

    for (const rec of gameRecords) {
      const { game, nameMap } = rec;
      const ts = game.teamScore!, os = game.opponentScore!;
      goalsFor += ts;
      goalsAgainst += os;
      const outcome: 'wins' | 'losses' | 'draws' = ts > os ? 'wins' : ts < os ? 'losses' : 'draws';
      if (outcome === 'wins') wins++; else if (outcome === 'losses') losses++; else draws++;

      const opponentKey = (game.opponent || '').trim();
      if (opponentKey) {
        headToHead[opponentKey] ||= { wins: 0, losses: 0, draws: 0 };
        headToHead[opponentKey][outcome]++;
      }

      for (const goal of game.goalEvents || []) {
        const scorerName = nameMap[goal.scorerId] || goal.scorerId;
        bump(scorerName).goals++;
        for (const assistId of goal.assistIds || []) {
          bump(nameMap[assistId] || assistId).assists++;
        }
      }

      for (const pen of game.penaltyEvents || []) {
        const name = nameMap[pen.athleteId] || pen.athleteId;
        penalties[name] ||= { name, minutes: 0 };
        penalties[name].minutes += pen.minutes;
      }

      for (const g of game.goalieStats || []) {
        const name = nameMap[g.athleteId] || g.athleteId;
        goalies[name] ||= { name, saves: 0, goalsAgainst: 0 };
        goalies[name].saves += g.saves;
        goalies[name].goalsAgainst += g.goalsAgainst;
      }
    }

    return {
      played: gameRecords.length,
      wins, losses, draws, goalsFor, goalsAgainst,
      topScorers: Object.values(scorers).filter(s => s.goals > 0 || s.assists > 0)
        .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).slice(0, 8),
      penaltyLeaders: Object.values(penalties).sort((a, b) => b.minutes - a.minutes).slice(0, 8),
      goalieLeaders: Object.values(goalies).map(g => ({
        ...g,
        savePct: g.saves + g.goalsAgainst > 0 ? Math.round((g.saves / (g.saves + g.goalsAgainst)) * 100) : 0,
      })).sort((a, b) => (b.saves + b.goalsAgainst) - (a.saves + a.goalsAgainst)),
      headToHead: Object.entries(headToHead).map(([opponent, r]) => {
        const played = r.wins + r.losses + r.draws;
        return { opponent, ...r, played, winPct: played > 0 ? Math.round((r.wins / played) * 100) : 0 };
      }).sort((a, b) => b.played - a.played),
    };
  }, [gameRecords]);

  // Per-athlete stats for Team Cards — keyed by athleteId (not name, unlike `overview` above)
  const cardStats = useMemo(() => {
    const map: Record<string, { games: number; goals: number; assists: number; penaltyMinutes: number; saves: number; goalsAgainst: number }> = {};
    const ensure = (id: string) => (map[id] ||= { games: 0, goals: 0, assists: 0, penaltyMinutes: 0, saves: 0, goalsAgainst: 0 });

    for (const { game, confirmedAthleteIds } of gameRecords) {
      for (const id of confirmedAthleteIds) ensure(id).games++;
      for (const goal of game.goalEvents || []) {
        ensure(goal.scorerId).goals++;
        for (const assistId of goal.assistIds || []) ensure(assistId).assists++;
      }
      for (const pen of game.penaltyEvents || []) ensure(pen.athleteId).penaltyMinutes += pen.minutes;
      for (const g of game.goalieStats || []) {
        const s = ensure(g.athleteId);
        s.saves += g.saves;
        s.goalsAgainst += g.goalsAgainst;
      }
    }
    return map;
  }, [gameRecords]);

  // Games grouped by tournament/nomination — collapsed by default, expand to see its games
  const tournamentGroups = useMemo(() => {
    const groups: Record<string, { nominationId: string; nominationTitle: string; date: string; games: GameRecord[] }> = {};
    for (const rec of gameRecords) {
      const g = (groups[rec.nominationId] ||= {
        nominationId: rec.nominationId,
        nominationTitle: rec.nominationTitle,
        date: rec.game.date,
        games: [],
      });
      g.games.push(rec);
      if (rec.game.date < g.date) g.date = rec.game.date;
    }
    return Object.values(groups)
      .map(g => ({ ...g, games: g.games.sort((a, b) => a.game.date.localeCompare(b.game.date)) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [gameRecords]);

  const outcomeBadge = (game: NominationGame) => {
    const ts = game.teamScore!, os = game.opponentScore!;
    if (ts > os) return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-chart-cyan/20 text-chart-cyan">W</span>;
    if (ts < os) return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-chart-pink/20 text-chart-pink">L</span>;
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-text-muted/20 text-text-muted">D</span>;
  };

  // ── render ──────────────────────────────────────────────────────────────────
  const isLoading = athletesLoading || loadingAtt;

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* Dashboard card grid */}
      <div className="grid grid-cols-3 gap-2">
        {DASHBOARDS.map(dash => {
          const isActive = activeDashboard === dash.id;
          return (
            <button
              key={dash.id}
              onClick={() => dash.available && setActiveDashboard(isActive ? null : dash.id)}
              disabled={!dash.available}
              className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 rounded-xl border transition-all duration-200 text-center min-h-[80px] ${
                !dash.available
                  ? 'bg-app-secondary/40 border-white/5 text-text-muted cursor-not-allowed opacity-50'
                  : isActive
                  ? 'bg-app-blue/20 border-app-blue text-app-cyan shadow-button'
                  : 'bg-app-secondary border-white/10 text-text-secondary hover:border-app-cyan/40 hover:text-text-primary cursor-pointer'
              }`}
            >
              <span className={isActive ? 'text-app-cyan' : 'text-text-muted'}>{dash.icon}</span>
              <span className="text-[10px] sm:text-xs font-semibold leading-tight">{t(dash.title)}</span>
              {dash.id === 'attendance' && myBestRate !== null && (
                <span className={`text-sm font-bold ${rateColor(myBestRate)}`}>{myBestRate}%</span>
              )}
              {!dash.available && <span className="text-[9px] text-text-muted">{t('stats.dashboards.comingSoon')}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Attendance dashboard ──────────────────────────────────────────── */}
      {activeDashboard === 'attendance' && (
        <div className="space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-text-primary">{t('stats.attendanceTitle')}</h3>
            {canManage && memberStats.length > 0 && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] sm:text-xs bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all font-medium disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? t('stats.exporting') : t('stats.exportExcel')}
              </button>
            )}
          </div>

          {/* Loading */}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>

          ) : attendanceDocs.length === 0 ? (
            <p className="text-center py-10 text-xs text-text-secondary">{t('stats.noAttendanceData')}</p>

          ) : canManage ? (
            /* ── Trainer / assistant / owner view: all athletes ── */
            <div className="space-y-1">
              {memberStats.length === 0 ? (
                <p className="text-center text-xs text-text-secondary py-6">{t('stats.noAthletes')}</p>
              ) : memberStats.map(ms => {
                const isExpanded = expandedUserId === ms.userId;
                return (
                  <div key={ms.userId} className="border border-white/10 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpand(ms.userId)}
                      className="w-full flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary hover:bg-white/5 transition-colors text-left"
                    >
                      {ms.photoURL ? (
                        <img src={ms.photoURL} alt={ms.userName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                          {ms.userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 text-xs font-semibold text-text-primary truncate">{ms.userName}</span>
                      <span className="text-[10px] text-text-muted flex-shrink-0 hidden sm:inline">{ms.present}/{ms.total}</span>
                      <div className="w-16 sm:w-20 h-1.5 bg-white/10 rounded-full flex-shrink-0 overflow-hidden">
                        <div className={`h-full rounded-full ${barColor(ms.rate)}`} style={{ width: `${ms.rate}%` }} />
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 w-10 text-right ${rateColor(ms.rate)}`}>
                        {ms.total > 0 ? `${ms.rate}%` : '—'}
                      </span>
                      <svg className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/10">
                        <SessionList userId={ms.userId} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          ) : (
            /* ── Regular user / parent view: own athlete(s) only ── */
            myStats.length === 0 || myStats.every(s => s.total === 0) ? (
              <p className="text-center py-10 text-xs text-text-secondary">{t('stats.noAttendanceRecorded')}</p>
            ) : (
              <div className="space-y-4">
                {myStats.filter(s => s.total > 0).map(ms => (
                  <div key={ms.userId} className="space-y-2">
                    {/* Athlete label — only shown when parent has multiple children */}
                    {myStats.length > 1 && (
                      <p className="text-xs font-semibold text-text-secondary px-1">{ms.userName}</p>
                    )}

                    {/* Big personal card */}
                    <div
                      className="bg-app-secondary border border-white/10 rounded-xl p-4 sm:p-5 cursor-pointer hover:border-app-cyan/30 transition-colors"
                      onClick={() => toggleExpand(ms.userId)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-text-secondary">
                          {myStats.length > 1 ? ms.userName : t('stats.myAttendance')}
                        </span>
                        <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedUserId === ms.userId ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <span className={`text-4xl sm:text-5xl font-bold ${rateColor(ms.rate)}`}>{ms.rate}%</span>
                          <p className="text-xs text-text-muted mt-1">{ms.present} / {ms.total} {t('stats.trainingsAttended')}</p>
                        </div>
                        <div className="text-right text-[10px] text-text-muted space-y-0.5">
                          {ms.absent  > 0 && <div className="text-chart-pink">{ms.absent} {t('stats.absentLabel')}</div>}
                          {ms.late    > 0 && <div className="text-yellow-400">{ms.late} {t('stats.lateLabel')}</div>}
                          {ms.excused > 0 && <div className="text-chart-purple">{ms.excused} {t('stats.excusedLabel')}</div>}
                        </div>
                      </div>

                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor(ms.rate)}`} style={{ width: `${ms.rate}%` }} />
                      </div>
                    </div>

                    {/* Session list */}
                    {expandedUserId === ms.userId && (
                      <div className="border border-white/10 rounded-xl overflow-hidden">
                        <SessionList userId={ms.userId} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ── Games & Results ── */}
      {activeDashboard === 'games' && (
        loadingGames ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" /></div>
        ) : tournamentGroups.length === 0 ? (
          <p className="text-center py-10 text-xs text-text-secondary">{t('stats.noPlayedGames')}</p>
        ) : (
          <div className="space-y-1.5">
            {tournamentGroups.map(group => {
              const isGroupOpen = expandedTournamentKey === group.nominationId;
              const wins = group.games.filter(r => r.game.teamScore! > r.game.opponentScore!).length;
              const losses = group.games.filter(r => r.game.teamScore! < r.game.opponentScore!).length;
              const draws = group.games.length - wins - losses;
              return (
                <div key={group.nominationId} className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedTournamentKey(isGroupOpen ? null : group.nominationId)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary truncate">{group.nominationTitle}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {new Date(group.date + 'T00:00:00').toLocaleDateString()} · {group.games.length} {group.games.length === 1 ? t('stats.game') : t('stats.gamesPlural')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-text-muted">{wins}-{losses}-{draws}</span>
                      <span className="text-text-muted text-[10px]">{isGroupOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isGroupOpen && (
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {group.games.map((rec, i) => {
                        const key = `${rec.nominationId}-${rec.game.id}`;
                        const isOpen = expandedGameKey === key;
                        const hasStats = (rec.game.goalEvents?.length || 0) > 0 || (rec.game.penaltyEvents?.length || 0) > 0 || (rec.game.goalieStats?.length || 0) > 0;
                        return (
                          <div key={key}>
                            <button
                              onClick={() => setExpandedGameKey(isOpen ? null : key)}
                              className="w-full flex items-center justify-between gap-2 p-2.5 pl-4 text-left hover:bg-white/5 transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {outcomeBadge(rec.game)}
                                  <span className="text-[10px] text-text-muted">{t('stats.gameLabel')} {i + 1}</span>
                                  <span className="text-xs font-semibold text-text-primary truncate">{rec.game.opponent || t('nominations.opponentTbd')}</span>
                                </div>
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  {new Date(rec.game.date + 'T00:00:00').toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-sm font-bold text-text-primary">{rec.game.teamScore} : {rec.game.opponentScore}</span>
                                {hasStats && <span className="text-text-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>}
                              </div>
                            </button>

                            {isOpen && hasStats && (
                              <div className="px-2.5 pb-2.5 pl-4 space-y-1.5">
                                {(rec.game.goalEvents || []).map(ev => (
                                  <div key={ev.id} className="text-[11px] text-text-primary">
                                    ⚽ {rec.nameMap[ev.scorerId] || ev.scorerId}
                                    {ev.assistIds && ev.assistIds.length > 0 && (
                                      <span className="text-text-muted"> — {t('gameStats.assistedBy')} {ev.assistIds.map(id => rec.nameMap[id] || id).join(', ')}</span>
                                    )}
                                  </div>
                                ))}
                                {(rec.game.penaltyEvents || []).map(ev => (
                                  <div key={ev.id} className="text-[11px] text-text-primary">
                                    🟨 {rec.nameMap[ev.athleteId] || ev.athleteId} — {ev.minutes}'
                                  </div>
                                ))}
                                {(rec.game.goalieStats || []).map(g => {
                                  const shots = g.saves + g.goalsAgainst;
                                  const pct = shots > 0 ? Math.round((g.saves / shots) * 100) : 0;
                                  return (
                                    <div key={g.athleteId} className="text-[11px] text-text-primary">
                                      🥅 {rec.nameMap[g.athleteId] || g.athleteId} — {g.saves} {t('goalie.saves').toLowerCase()}, {g.goalsAgainst} {t('gameStats.goalsAgainst')} ({pct}%)
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Team Overview ── */}
      {activeDashboard === 'overview' && (
        loadingGames ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" /></div>
        ) : overview.played === 0 ? (
          <p className="text-center py-10 text-xs text-text-secondary">{t('stats.noPlayedGames')}</p>
        ) : (
          <div className="space-y-4">
            {/* Record summary */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="bg-app-secondary border border-white/10 rounded-lg p-2 text-center">
                <div className="text-base font-bold text-text-primary">{overview.played}</div>
                <div className="text-[9px] text-text-muted uppercase font-semibold">{t('stats.played')}</div>
              </div>
              <div className="bg-app-secondary border border-white/10 rounded-lg p-2 text-center">
                <div className="text-base font-bold text-chart-cyan">{overview.wins}-{overview.losses}-{overview.draws}</div>
                <div className="text-[9px] text-text-muted uppercase font-semibold">{t('stats.wld')}</div>
              </div>
              <div className="bg-app-secondary border border-white/10 rounded-lg p-2 text-center">
                <div className="text-base font-bold text-text-primary">{overview.goalsFor}:{overview.goalsAgainst}</div>
                <div className="text-[9px] text-text-muted uppercase font-semibold">{t('stats.goals')}</div>
              </div>
              <div className="bg-app-secondary border border-white/10 rounded-lg p-2 text-center">
                <div className={`text-base font-bold ${overview.goalsFor - overview.goalsAgainst >= 0 ? 'text-chart-cyan' : 'text-chart-pink'}`}>
                  {overview.goalsFor - overview.goalsAgainst > 0 ? '+' : ''}{overview.goalsFor - overview.goalsAgainst}
                </div>
                <div className="text-[9px] text-text-muted uppercase font-semibold">{t('stats.diff')}</div>
              </div>
            </div>

            {/* Top scorers */}
            {overview.topScorers.length > 0 && (
              <div className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold">{t('stats.topScorers')}</div>
                {overview.topScorers.map(s => (
                  <div key={s.name} className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-text-primary truncate">{s.name}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0">{s.goals}G · {s.assists}A · {s.goals + s.assists}P</span>
                  </div>
                ))}
              </div>
            )}

            {/* Penalty leaders */}
            {overview.penaltyLeaders.length > 0 && (
              <div className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold">{t('stats.penaltyMinutes')}</div>
                {overview.penaltyLeaders.map(p => (
                  <div key={p.name} className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-text-primary truncate">{p.name}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0">{p.minutes}'</span>
                  </div>
                ))}
              </div>
            )}

            {/* Goalie leaders */}
            {overview.goalieLeaders.length > 0 && (
              <div className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold">{t('stats.goalies')}</div>
                {overview.goalieLeaders.map(g => (
                  <div key={g.name} className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-text-primary truncate">{g.name}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0">{g.saves} {t('goalie.saves').toLowerCase()} · {g.goalsAgainst} {t('gameStats.goalsAgainst')} · {g.savePct}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Head-to-head */}
            {overview.headToHead.length > 0 && (
              <div className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold">{t('stats.headToHead')}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[9px] text-text-muted uppercase font-semibold border-b border-white/5">
                        <th className="text-left px-2.5 py-1.5 font-semibold">{t('stats.tableOpponent')}</th>
                        <th className="text-center px-1.5 py-1.5 font-semibold">{t('stats.played')}</th>
                        <th className="text-center px-1.5 py-1.5 font-semibold">{t('stats.tableWin')}</th>
                        <th className="text-center px-1.5 py-1.5 font-semibold">{t('stats.tableLose')}</th>
                        <th className="text-center px-1.5 py-1.5 font-semibold">{t('stats.tableEqual')}</th>
                        <th className="text-right px-2.5 py-1.5 font-semibold">{t('stats.tableSuccessPct')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.headToHead.map(h => (
                        <tr key={h.opponent} className="border-b border-white/5 last:border-0">
                          <td className="px-2.5 py-1.5 text-text-primary truncate max-w-[120px]">{h.opponent}</td>
                          <td className="text-center px-1.5 py-1.5 text-text-secondary">{h.played}</td>
                          <td className="text-center px-1.5 py-1.5 text-chart-cyan font-semibold">{h.wins}</td>
                          <td className="text-center px-1.5 py-1.5 text-chart-pink font-semibold">{h.losses}</td>
                          <td className="text-center px-1.5 py-1.5 text-text-secondary">{h.draws}</td>
                          <td className={`text-right px-2.5 py-1.5 font-bold ${h.winPct >= 50 ? 'text-chart-cyan' : 'text-chart-pink'}`}>{h.winPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Team Cards ── */}
      {activeDashboard === 'cards' && (
        (loadingGames || loadingCards) ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" /></div>
        ) : athletes.length === 0 ? (
          <p className="text-center py-10 text-xs text-text-secondary">{t('stats.noAthletes')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {athletes.map(athlete => {
              const card = playerCards[athlete.userId];
              const s = cardStats[athlete.userId];
              const isGoalie = card?.position === 'goalie';
              const photo = card?.photoURL || athlete.photoURL;
              return (
                <div key={athlete.userId} className="relative bg-app-secondary border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                  {card?.jerseyNumber !== undefined && card.jerseyNumber !== null && (
                    <span className="absolute top-1.5 right-1.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-app-blue text-white text-[10px] font-bold">
                      {card.jerseyNumber}
                    </span>
                  )}
                  {photo ? (
                    <img src={photo} alt={athlete.userName} className="w-12 h-12 rounded-full object-cover mb-1.5" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-white mb-1.5">
                      {athlete.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[11px] font-semibold text-text-primary truncate w-full">{athlete.userName}</span>
                  <span className="text-[9px] text-app-cyan font-medium mt-0.5">
                    {card?.position ? t(`cards.positions.${card.position}`) : t('cards.noPosition')}
                  </span>
                  <div className="w-full mt-2 pt-2 border-t border-white/5 text-[10px] text-text-muted space-y-0.5">
                    <div>{s?.games || 0} {t('stats.cards.games')}</div>
                    {isGoalie ? (
                      <div>{s?.saves || 0} {t('goalie.saves').toLowerCase()} · {s?.goalsAgainst || 0} {t('gameStats.goalsAgainst')}</div>
                    ) : (
                      <div>{s?.goals || 0}G · {s?.assists || 0}A · {s?.penaltyMinutes || 0}'</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
