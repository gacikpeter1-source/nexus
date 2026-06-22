import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, doc, limit as fsLimit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { createAttendance, updateAttendance } from '../../services/firebase/attendance';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Event, User } from '../../types';
import type { AttendanceRecord, AttendanceStatus, SessionType } from '../../types/attendance';
import { localDateStr } from '../../utils/dateUtils';

interface Props {
  clubId: string;
  teamId: string;
  members: User[]; // team members (may include parents)
  canManage?: boolean; // trainer | assistant | club owner — shows export button
}

interface AttCache {
  docId?: string;
  records: Record<string, AttendanceStatus>;
}

function toSessionType(type?: string): SessionType {
  if (type === 'game') return 'game';
  if (type === 'meeting') return 'meeting';
  return 'practice';
}

const toDateStr = localDateStr;

// confirmed > maybe > declined — used when multiple parents RSVPed for the same child
function mergeRsvp(rsvps: (string | undefined)[]): string | undefined {
  if (rsvps.includes('confirmed')) return 'confirmed';
  if (rsvps.includes('maybe')) return 'maybe';
  if (rsvps.includes('declined')) return 'declined';
  return undefined;
}

function expandEvents(base: Event[], from: Date, to: Date): Event[] {
  const out: Event[] = [];
  for (const ev of base) {
    const exceptions = ev.exceptions || [];
    const bd = new Date(ev.date + 'T00:00:00');
    if (bd >= from && bd <= to && !exceptions.includes(ev.date)) out.push(ev);
    if (!ev.isRecurring || !ev.recurrenceRule) continue;

    const rule = ev.recurrenceRule;
    const maxDate = rule.endDate
      ? new Date(Math.min(new Date(rule.endDate + 'T00:00:00').getTime(), to.getTime()))
      : to;
    const maxCount = rule.count ?? Infinity;
    let count = 1;
    const cur = new Date(ev.date + 'T00:00:00');

    if (rule.frequency === 'weekly' && rule.daysOfWeek?.length) {
      cur.setDate(cur.getDate() + 1);
      while (cur <= maxDate && count < maxCount) {
        if (rule.daysOfWeek.includes(cur.getDay())) {
          const ds = toDateStr(cur);
          if (cur >= from && !exceptions.includes(ds)) out.push({ ...ev, date: ds });
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const advance = () => {
        if (rule.frequency === 'daily') cur.setDate(cur.getDate() + rule.interval);
        else if (rule.frequency === 'weekly') cur.setDate(cur.getDate() + 7 * rule.interval);
        else cur.setMonth(cur.getMonth() + rule.interval);
      };
      advance();
      while (cur <= maxDate && count < maxCount) {
        const ds = toDateStr(cur);
        if (cur >= from && !exceptions.includes(ds)) out.push({ ...ev, date: ds });
        count++;
        advance();
      }
    }
  }
  return out;
}

export default function AttendTab({ clubId, teamId, members, canManage }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showFuture, setShowFuture] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Athletes = child accounts of team members
  const [athletes, setAthletes] = useState<User[]>([]);
  // athleteId → array of parent userIds (who are in this team)
  const [athleteParentMap, setAthleteParentMap] = useState<Record<string, string[]>>({});
  const [athletesLoading, setAthletesLoading] = useState(false);

  const [attendance, setAttendance] = useState<Record<string, AttCache>>({});
  const [attLoading, setAttLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<Record<string, boolean>>({});

  useEffect(() => { loadEvents(); }, [clubId, teamId]);

  // Re-derive athletes whenever the team members list changes
  useEffect(() => {
    if (members.length > 0) loadAthletes();
    else { setAthletes([]); setAthleteParentMap({}); }
  }, [members]);

  // Build the attendance list:
  // - members who ARE parents (isParent or role==='parent') with childIds → show children
  // - all others (regular members, or parents whose role was removed) → appear directly
  // - parents whose children are all unassigned from this team → fall back to direct athlete
  const loadAthletes = async () => {
    setAthletesLoading(true);
    try {
      const parentMap: Record<string, string[]> = {}; // childId → parentIds[]
      const parentMembers: User[] = [];
      const directAthletes: User[] = [];

      for (const member of members) {
        const isActivePar = (member.role === 'parent' || member.isParent === true)
          && member.childIds && member.childIds.length > 0;

        if (isActivePar) {
          parentMembers.push(member);
          for (const childId of member.childIds!) {
            if (!parentMap[childId]) parentMap[childId] = [];
            parentMap[childId].push(member.id);
          }
        } else {
          directAthletes.push(member);
        }
      }

      // Fetch child user documents
      const childIds = Object.keys(parentMap);
      const childUsers = childIds.length > 0
        ? await Promise.all(
            childIds.map(async id => {
              const snap = await getDoc(doc(db, 'users', id));
              return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
            })
          )
        : [];

      // Only children explicitly assigned to this team
      const childrenForThisTeam = (childUsers.filter(Boolean) as User[]).filter(
        c => Array.isArray(c.teamIds) && c.teamIds.includes(teamId)
      );

      // Parents whose children are not in this team fall back to appearing directly
      const childIdsHere = new Set(childrenForThisTeam.map(c => c.id));
      const parentsWithNoChildHere = parentMembers.filter(
        p => !p.childIds!.some(cid => childIdsHere.has(cid))
      );

      setAthletes([...directAthletes, ...childrenForThisTeam, ...parentsWithNoChildHere]);
      setAthleteParentMap(parentMap);
    } catch (err) {
      console.error('AttendTab: error loading athletes', err);
    } finally {
      setAthletesLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const now = new Date();
      const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
      const to = new Date(now); to.setMonth(to.getMonth() + 1);

      const [recentSnap, recurSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'events'),
          where('clubId', '==', clubId),
          where('date', '>=', toDateStr(from)),
          fsLimit(200)
        )),
        getDocs(query(
          collection(db, 'events'),
          where('clubId', '==', clubId),
          where('isRecurring', '==', true),
          fsLimit(100)
        )),
      ]);

      const map = new Map<string, Event>();
      for (const snap of [recentSnap, recurSnap])
        for (const d of snap.docs) map.set(d.id, { id: d.id, ...d.data() } as Event);

      const base = Array.from(map.values()).filter(e => e.teamId === teamId);
      const expanded = expandEvents(base, from, to);
      expanded.sort((a, b) => b.date.localeCompare(a.date) || (b.startTime || '').localeCompare(a.startTime || ''));
      setAllEvents(expanded);
    } catch (err) {
      console.error('AttendTab: error loading events', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const evKey = (ev: Event) => `${ev.id}|${ev.date}`;

  const loadAttendance = async (ev: Event) => {
    const k = evKey(ev);
    if (attendance[k] !== undefined) return;
    setAttLoading(p => ({ ...p, [k]: true }));
    try {
      const snap = await getDocs(query(
        collection(db, 'attendance'),
        where('eventId', '==', ev.id),
        where('clubId', '==', clubId)
      ));
      const match = snap.docs.find(d => d.data().sessionDate === ev.date);
      if (match) {
        const records: Record<string, AttendanceStatus> = {};
        for (const [uid, rec] of Object.entries(match.data().records || {}))
          records[uid] = (rec as AttendanceRecord).status;
        setAttendance(p => ({ ...p, [k]: { docId: match.id, records } }));
      } else {
        setAttendance(p => ({ ...p, [k]: { records: {} } }));
      }
    } catch (err) {
      console.error('AttendTab: error loading attendance', err);
      setAttendance(p => ({ ...p, [k]: { records: {} } }));
    } finally {
      setAttLoading(p => ({ ...p, [k]: false }));
    }
  };

  const handleRowClick = (ev: Event) => {
    const k = evKey(ev);
    if (expandedKey === k) { setExpandedKey(null); return; }
    setExpandedKey(k);
    loadAttendance(ev);
  };

  const toggleAthlete = async (ev: Event, athleteId: string) => {
    const k = evKey(ev);
    const prevStatus = attendance[k]?.records[athleteId];
    const nextStatus: AttendanceStatus = prevStatus === 'present' ? 'absent' : 'present';
    const sk = `${k}|${athleteId}`;

    // optimistic update
    setAttendance(p => ({
      ...p,
      [k]: { ...p[k], records: { ...p[k]?.records, [athleteId]: nextStatus } }
    }));
    setSaving(p => ({ ...p, [sk]: true }));

    try {
      const existing = attendance[k];
      // build full records keyed by athlete IDs (unmarked → absent)
      const full: Record<string, AttendanceRecord> = {};
      for (const a of athletes)
        full[a.id] = { status: a.id === athleteId ? nextStatus : (existing?.records[a.id] || 'absent') };

      if (existing?.docId) {
        await updateAttendance(existing.docId, full);
      } else {
        const docId = await createAttendance(
          clubId, teamId, ev.date, toSessionType(ev.type), full, user?.id || '', ev.id
        );
        setAttendance(p => ({ ...p, [k]: { ...p[k], docId } }));
      }
    } catch (err) {
      console.error('AttendTab: error saving', err);
      setAttendance(p => ({
        ...p,
        [k]: { ...p[k], records: { ...p[k]?.records, [athleteId]: prevStatus || 'absent' } }
      }));
    } finally {
      setSaving(p => ({ ...p, [sk]: false }));
    }
  };

  const exportEvent = async (ev: Event) => {
    const k = evKey(ev);
    setExporting(p => ({ ...p, [k]: true }));
    try {
      const XLSX = await import('xlsx');

      const rsvpLabel = (status?: string) => {
        if (status === 'confirmed') return t('calendar.rsvp.confirmed');
        if (status === 'maybe') return t('calendar.rsvp.maybe');
        if (status === 'declined') return t('calendar.rsvp.declined');
        return '—';
      };

      const checkLabel = (status?: AttendanceStatus) => {
        if (status === 'present') return t('attendance.present');
        if (status === 'absent') return t('attendance.absent');
        if (status === 'late') return t('attendance.late');
        if (status === 'excused') return t('attendance.excused');
        return '—';
      };

      const rec = attendance[k];
      const rows: string[][] = [
        [ev.title],
        [],
        [t('attendance.columnAthlete'), t('attendance.columnRsvp'), t('attendance.columnAttended')],
        ...athletes.map(a => [
          a.displayName,
          rsvpLabel(getAthleteRsvp(a.id, ev)),
          checkLabel(rec?.records[a.id]),
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, ev.title.slice(0, 31));
      const safeName = ev.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
      XLSX.writeFile(wb, `${safeName}_${ev.date}.xlsx`);
    } catch (err) {
      console.error('AttendTab: export failed', err);
    } finally {
      setExporting(p => ({ ...p, [k]: false }));
    }
  };

  // Derive RSVP for a person in the attendance list:
  // - direct athlete (no parent entry) → use their own event response
  // - child account (has parent entry) → use parent(s)' response, respecting forAthletes
  const getAthleteRsvp = (athleteId: string, ev: Event): string | undefined => {
    const parentIds = athleteParentMap[athleteId] || [];
    if (parentIds.length === 0) {
      // Direct team member — their own RSVP
      return ev.responses?.[athleteId]?.response;
    }
    // Child account — inherit from parent(s), filtered by forAthletes if set
    const rsvps = parentIds.map(pid => {
      const r = ev.responses?.[pid];
      if (!r) return undefined;
      if (r.forAthletes && r.forAthletes.length > 0 && !r.forAthletes.includes(athleteId)) {
        return undefined;
      }
      return r.response;
    });
    return mergeRsvp(rsvps);
  };

  const rsvpBadge = (status?: string) => {
    if (status === 'confirmed') return <span className="text-[10px] text-chart-cyan font-medium">{t('calendar.rsvp.confirmed')}</span>;
    if (status === 'maybe') return <span className="text-[10px] text-chart-purple font-medium">{t('calendar.rsvp.maybe')}</span>;
    if (status === 'declined') return <span className="text-[10px] text-chart-pink font-medium">{t('calendar.rsvp.declined')}</span>;
    return <span className="text-[10px] text-text-muted">—</span>;
  };

  const today = localDateStr();
  const visible = showFuture ? allEvents : allEvents.filter(e => e.date <= today);

  if (eventsLoading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('attendance.title')}</h2>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showFuture}
            onChange={e => setShowFuture(e.target.checked)}
            className="w-3.5 h-3.5 accent-app-cyan"
          />
          {t('attendance.includeFuture')}
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-center text-xs text-text-secondary py-8">{t('attendance.noPastEvents')}</p>
      ) : (
        <div className="space-y-1">
          {visible.map(ev => {
            const k = evKey(ev);
            const isOpen = expandedKey === k;
            const rec = attendance[k];
            const presentCount = rec ? Object.values(rec.records).filter(s => s === 'present').length : 0;
            const hasMarks = rec && Object.keys(rec.records).length > 0;
            const isFuture = ev.date > today;
            const d = new Date(ev.date + 'T00:00:00');

            return (
              <div key={k} className="border border-white/10 rounded-lg overflow-hidden">
                {/* Event row */}
                <button
                  onClick={() => handleRowClick(ev)}
                  className="w-full flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary hover:bg-white/5 transition-colors text-left"
                >
                  <div className={`flex-shrink-0 w-9 rounded py-1 text-center ${isFuture ? 'bg-app-blue/20' : 'bg-app-card'}`}>
                    <div className="text-[9px] text-text-muted uppercase leading-tight">
                      {d.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-sm font-bold text-text-primary leading-tight">{d.getDate()}</div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{ev.title}</div>
                    {ev.startTime && <div className="text-[10px] text-text-muted">{ev.startTime}</div>}
                  </div>

                  {hasMarks && (
                    <span className="text-[10px] text-chart-cyan font-semibold flex-shrink-0">
                      {presentCount}/{athletes.length}
                    </span>
                  )}

                  <svg
                    className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded athlete list */}
                {isOpen && (
                  <div className="border-t border-white/10">
                    {attLoading[k] || athletesLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                      </div>
                    ) : athletes.length === 0 ? (
                      <p className="text-center text-xs text-text-secondary py-4">{t('attendance.noAthletes')}</p>
                    ) : (
                      <div>
                        {/* Column headers */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-app-card/60 border-b border-white/5 text-[9px] text-text-muted uppercase font-semibold">
                          <span className="flex-1">{t('attendance.columnAthlete')}</span>
                          <span className="w-10 text-center">{t('attendance.columnRsvp')}</span>
                          <span className="w-20 text-center">{t('attendance.columnAttended')}</span>
                          {canManage && (
                            <button
                              onClick={() => exportEvent(ev)}
                              disabled={exporting[k]}
                              className="ml-1 px-2 py-0.5 text-[9px] font-semibold rounded bg-app-blue/20 text-app-cyan border border-app-cyan/20 hover:bg-app-blue/40 transition-colors disabled:opacity-50 normal-case"
                            >
                              {exporting[k] ? t('attendance.exporting') : t('attendance.exportEvent')}
                            </button>
                          )}
                        </div>

                        {athletes.map(a => {
                          const rsvp = getAthleteRsvp(a.id, ev);
                          const status = rec?.records[a.id];
                          const isPresent = status === 'present';
                          const isAbsent = status === 'absent';
                          const sk = `${k}|${a.id}`;

                          return (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5 last:border-0"
                            >
                              {/* Avatar */}
                              {a.photoURL ? (
                                <img src={a.photoURL} alt={a.displayName} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                                  {a.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}

                              {/* Name */}
                              <span className="flex-1 text-xs text-text-primary truncate">{a.displayName}</span>

                              {/* RSVP — derived from parent's response */}
                              <span className="w-10 text-center" title={t('attendance.parentRsvp')}>
                                {rsvpBadge(rsvp)}
                              </span>

                              {/* Attendance toggle */}
                              <div className="w-20 flex justify-center">
                                <button
                                  onClick={() => toggleAthlete(ev, a.id)}
                                  disabled={saving[sk]}
                                  className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-all disabled:opacity-50 ${
                                    isPresent
                                      ? 'bg-chart-cyan text-white'
                                      : isAbsent
                                      ? 'bg-chart-pink/20 text-chart-pink border border-chart-pink/30'
                                      : 'bg-white/5 text-text-muted border border-white/10'
                                  }`}
                                >
                                  {saving[sk] ? '…' : isPresent ? t('attendance.present') : isAbsent ? t('attendance.absent') : t('attendance.mark')}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
