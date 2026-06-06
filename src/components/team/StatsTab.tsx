/**
 * StatsTab — Team statistics dashboard hub
 *
 * Architecture: DASHBOARDS array drives the card grid.
 * To add a new dashboard: push a new entry to DASHBOARDS and add its
 * render block under "Dashboard content" below.
 *
 * Current dashboards:
 *   1. Attendance  — live (personal card for members, full table for managers)
 *   2. Games       — placeholder
 *   3. Team Overview — placeholder
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';
import type { Attendance } from '../../types/attendance';

interface Props {
  clubId: string;
  teamId: string;
  members: User[];
  canManage: boolean;
  currentUserId: string;
}

type DashboardId = 'attendance' | 'games' | 'overview';

interface MemberStat {
  userId: string;
  userName: string;
  photoURL?: string;
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

// ── colour helpers ──────────────────────────────────────────────────────────
const rateColor = (r: number) =>
  r >= 90 ? 'text-chart-cyan' : r >= 75 ? 'text-green-400' : r >= 60 ? 'text-yellow-400' : 'text-chart-pink';

const barColor = (r: number) =>
  r >= 90 ? 'bg-chart-cyan' : r >= 75 ? 'bg-green-400' : r >= 60 ? 'bg-yellow-400' : 'bg-chart-pink';

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'present':  return <span className="text-[10px] text-chart-cyan  font-semibold">✓ Present</span>;
    case 'absent':   return <span className="text-[10px] text-chart-pink  font-semibold">✗ Absent</span>;
    case 'late':     return <span className="text-[10px] text-yellow-400  font-semibold">⌚ Late</span>;
    case 'excused':  return <span className="text-[10px] text-chart-purple font-semibold">◎ Excused</span>;
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
    title: 'Attendance',
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
    title: 'Games & Results',
    available: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'overview',
    title: 'Team Overview',
    available: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

// ── main component ──────────────────────────────────────────────────────────
export default function StatsTab({ clubId, teamId, members, canManage, currentUserId }: Props) {
  const [activeDashboard, setActiveDashboard] = useState<DashboardId | null>(null);

  // Attendance state
  const [attendanceDocs, setAttendanceDocs]     = useState<Attendance[]>([]);
  const [loadingAtt, setLoadingAtt]             = useState(false);
  const [eventTitles, setEventTitles]           = useState<Record<string, string>>({});
  const [loadingTitles, setLoadingTitles]       = useState(false);
  const [expandedUserId, setExpandedUserId]     = useState<string | null>(null);
  const [exporting, setExporting]               = useState(false);

  // Lazy-load attendance when the dashboard opens
  useEffect(() => {
    if (activeDashboard === 'attendance' && attendanceDocs.length === 0 && !loadingAtt) {
      loadAttendance();
    }
  }, [activeDashboard]);

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

  // Compute per-member stats from loaded attendance docs
  const memberStats = useMemo((): MemberStat[] => {
    return members
      .map(m => {
        let total = 0, present = 0, absent = 0, late = 0, excused = 0;
        for (const d of attendanceDocs) {
          const rec = d.records?.[m.id];
          if (!rec) continue;
          total++;
          if (rec.status === 'present')  present++;
          else if (rec.status === 'absent')  absent++;
          else if (rec.status === 'late')    late++;
          else if (rec.status === 'excused') excused++;
        }
        return {
          userId: m.id,
          userName: m.displayName,
          photoURL: m.photoURL,
          total, present, absent, late, excused,
          rate: total > 0 ? Math.round((present / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [members, attendanceDocs]);

  const myStats = memberStats.find(s => s.userId === currentUserId);

  // Sessions for a single member, sorted newest first
  const getMemberSessions = (userId: string): SessionRow[] =>
    attendanceDocs
      .filter(d => d.records?.[userId])
      .map(d => ({
        sessionDate: d.sessionDate,
        eventTitle: d.eventId ? (eventTitles[d.eventId] || 'Training') : 'Training',
        status: d.records[userId].status,
      }));

  const toggleExpand = async (userId: string) => {
    if (expandedUserId === userId) { setExpandedUserId(null); return; }
    setExpandedUserId(userId);
    await ensureEventTitles();
  };

  // Excel export — xlsx is loaded dynamically to keep the initial bundle small
  const handleExport = async () => {
    if (memberStats.length === 0 || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      // Summary sheet
      const summaryData = [
        ['Member', 'Total Sessions', 'Present', 'Absent', 'Late', 'Excused', 'Attendance %'],
        ...memberStats.map(m => [
          m.userName, m.total, m.present, m.absent, m.late, m.excused, `${m.rate}%`,
        ]),
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];

      // Detail sheet — one row per member × session
      const detailRows: (string | number)[][] = [
        ['Member', 'Date', 'Session', 'Status'],
      ];
      for (const ms of memberStats) {
        for (const s of getMemberSessions(ms.userId)) {
          detailRows.push([ms.userName, s.sessionDate, s.eventTitle, s.status]);
        }
      }
      const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
      wsDetail['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 28 }, { wch: 10 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Sessions');

      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `attendance_${date}.xlsx`);
    } catch (err) {
      console.error('StatsTab: export failed', err);
    } finally {
      setExporting(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 sm:space-y-4">

      {/* Dashboard card grid */}
      <div className="grid grid-cols-3 gap-2">
        {DASHBOARDS.map(dash => {
          const isActive = activeDashboard === dash.id;
          const myRate = dash.id === 'attendance' && myStats?.total ? myStats.rate : null;
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
              <span className="text-[10px] sm:text-xs font-semibold leading-tight">{dash.title}</span>
              {myRate !== null && (
                <span className={`text-sm font-bold ${rateColor(myRate)}`}>{myRate}%</span>
              )}
              {!dash.available && (
                <span className="text-[9px] text-text-muted">Coming soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Attendance dashboard content ──────────────────────────────── */}
      {activeDashboard === 'attendance' && (
        <div className="space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-text-primary">Attendance Statistics</h3>
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
                {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
            )}
          </div>

          {/* Loading */}
          {loadingAtt ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>
          ) : attendanceDocs.length === 0 ? (
            <div className="text-center py-10 text-xs text-text-secondary">
              No attendance data recorded yet.
            </div>

          ) : canManage ? (
            /* ── Trainer / assistant view: all members ── */
            <div className="space-y-1">
              {memberStats.map(ms => {
                const sessions = getMemberSessions(ms.userId);
                const isExpanded = expandedUserId === ms.userId;
                return (
                  <div key={ms.userId} className="border border-white/10 rounded-lg overflow-hidden">
                    {/* Member row */}
                    <button
                      onClick={() => toggleExpand(ms.userId)}
                      className="w-full flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary hover:bg-white/5 transition-colors text-left"
                    >
                      {/* Avatar */}
                      {ms.photoURL ? (
                        <img src={ms.photoURL} alt={ms.userName}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                          {ms.userName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Name */}
                      <span className="flex-1 text-xs font-semibold text-text-primary truncate">{ms.userName}</span>

                      {/* Present / total */}
                      <span className="text-[10px] text-text-muted flex-shrink-0 hidden sm:inline">
                        {ms.present}/{ms.total}
                      </span>

                      {/* Progress bar */}
                      <div className="w-16 sm:w-20 h-1.5 bg-white/10 rounded-full flex-shrink-0 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(ms.rate)}`}
                          style={{ width: `${ms.rate}%` }}
                        />
                      </div>

                      {/* Rate */}
                      <span className={`text-xs font-bold flex-shrink-0 w-10 text-right ${rateColor(ms.rate)}`}>
                        {ms.total > 0 ? `${ms.rate}%` : '—'}
                      </span>

                      <svg
                        className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Session list */}
                    {isExpanded && (
                      <div className="border-t border-white/10">
                        {loadingTitles ? (
                          <div className="flex justify-center py-3">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                          </div>
                        ) : sessions.length === 0 ? (
                          <p className="text-center text-xs text-text-secondary py-3">No sessions recorded</p>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold border-b border-white/5">
                              <span className="w-20 flex-shrink-0">Date</span>
                              <span className="flex-1">Session</span>
                              <span className="w-16 text-right flex-shrink-0">Status</span>
                            </div>
                            {sessions.map((s, i) => (
                              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5 last:border-0">
                                <span className="text-[10px] text-text-muted w-20 flex-shrink-0">
                                  {new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })}
                                </span>
                                <span className="flex-1 text-xs text-text-primary truncate">{s.eventTitle}</span>
                                <span className="w-16 text-right flex-shrink-0">
                                  <StatusBadge status={s.status} />
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          ) : (
            /* ── Regular user view: personal card only ── */
            !myStats || myStats.total === 0 ? (
              <div className="text-center py-10 text-xs text-text-secondary">
                No attendance recorded for you yet.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Big personal card */}
                <div
                  className="bg-app-secondary border border-white/10 rounded-xl p-4 sm:p-5 cursor-pointer hover:border-app-cyan/30 transition-colors"
                  onClick={() => toggleExpand(myStats.userId)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-text-secondary">My Attendance</span>
                    <svg
                      className={`w-4 h-4 text-text-muted transition-transform ${expandedUserId === myStats.userId ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <span className={`text-4xl sm:text-5xl font-bold ${rateColor(myStats.rate)}`}>
                        {myStats.rate}%
                      </span>
                      <p className="text-xs text-text-muted mt-1">
                        {myStats.present} / {myStats.total} trainings attended
                      </p>
                    </div>
                    <div className="text-right text-[10px] text-text-muted space-y-0.5">
                      {myStats.absent > 0 && <div className="text-chart-pink">{myStats.absent} absent</div>}
                      {myStats.late > 0 && <div className="text-yellow-400">{myStats.late} late</div>}
                      {myStats.excused > 0 && <div className="text-chart-purple">{myStats.excused} excused</div>}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(myStats.rate)}`}
                      style={{ width: `${myStats.rate}%` }}
                    />
                  </div>
                </div>

                {/* Session list */}
                {expandedUserId === myStats.userId && (
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    {loadingTitles ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-app-card/60 text-[9px] text-text-muted uppercase font-semibold border-b border-white/10">
                          <span className="w-16 flex-shrink-0">Date</span>
                          <span className="flex-1">Session</span>
                          <span className="w-16 text-right flex-shrink-0">Status</span>
                        </div>
                        {getMemberSessions(myStats.userId).map((s, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                            <span className="text-[10px] text-text-muted w-16 flex-shrink-0">
                              {new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })}
                            </span>
                            <span className="flex-1 text-xs text-text-primary truncate">{s.eventTitle}</span>
                            <span className="w-16 text-right flex-shrink-0">
                              <StatusBadge status={s.status} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* ── Games dashboard placeholder ── */}
      {activeDashboard === 'games' && (
        <div className="text-center py-10 text-xs text-text-secondary">
          Games & Results dashboard — coming soon
        </div>
      )}

      {/* ── Team Overview placeholder ── */}
      {activeDashboard === 'overview' && (
        <div className="text-center py-10 text-xs text-text-secondary">
          Team Overview dashboard — coming soon
        </div>
      )}
    </div>
  );
}
