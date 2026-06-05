import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit as fsLimit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { createAttendance, updateAttendance } from '../../services/firebase/attendance';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Event, User } from '../../types';
import type { AttendanceRecord, AttendanceStatus, SessionType } from '../../types/attendance';

interface Props {
  clubId: string;
  teamId: string;
  members: User[];
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

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
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

export default function AttendTab({ clubId, teamId, members }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showFuture, setShowFuture] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttCache>>({});
  const [attLoading, setAttLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => { loadEvents(); }, [clubId, teamId]);

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
      // newest first
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
      // clubId constraint lets Firestore evaluate the security rule at query time
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

  const toggleMember = async (ev: Event, memberId: string) => {
    const k = evKey(ev);
    const prevStatus = attendance[k]?.records[memberId];
    const nextStatus: AttendanceStatus = prevStatus === 'present' ? 'absent' : 'present';
    const sk = `${k}|${memberId}`;

    // optimistic update
    setAttendance(p => ({
      ...p,
      [k]: { ...p[k], records: { ...p[k]?.records, [memberId]: nextStatus } }
    }));
    setSaving(p => ({ ...p, [sk]: true }));

    try {
      const existing = attendance[k];
      // build full records for all members (unmarked default to absent)
      const full: Record<string, AttendanceRecord> = {};
      for (const m of members)
        full[m.id] = { status: m.id === memberId ? nextStatus : (existing?.records[m.id] || 'absent') };

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
      // revert optimistic update
      setAttendance(p => ({
        ...p,
        [k]: { ...p[k], records: { ...p[k]?.records, [memberId]: prevStatus || 'absent' } }
      }));
    } finally {
      setSaving(p => ({ ...p, [sk]: false }));
    }
  };

  const rsvpBadge = (status?: string) => {
    if (status === 'confirmed') return <span className="text-[10px] text-chart-cyan font-medium">{t('calendar.rsvp.confirmed')}</span>;
    if (status === 'maybe') return <span className="text-[10px] text-chart-purple font-medium">{t('calendar.rsvp.maybe')}</span>;
    if (status === 'declined') return <span className="text-[10px] text-chart-pink font-medium">{t('calendar.rsvp.declined')}</span>;
    return <span className="text-[10px] text-text-muted">—</span>;
  };

  const today = new Date().toISOString().split('T')[0];
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
                  {/* Date block */}
                  <div className={`flex-shrink-0 w-9 rounded py-1 text-center ${isFuture ? 'bg-app-blue/20' : 'bg-app-card'}`}>
                    <div className="text-[9px] text-text-muted uppercase leading-tight">
                      {d.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-sm font-bold text-text-primary leading-tight">{d.getDate()}</div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{ev.title}</div>
                    {ev.startTime && (
                      <div className="text-[10px] text-text-muted">{ev.startTime}</div>
                    )}
                  </div>

                  {hasMarks && (
                    <span className="text-[10px] text-chart-cyan font-semibold flex-shrink-0">
                      {presentCount}/{members.length}
                    </span>
                  )}

                  <svg
                    className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded member list */}
                {isOpen && (
                  <div className="border-t border-white/10">
                    {attLoading[k] ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                      </div>
                    ) : members.length === 0 ? (
                      <p className="text-center text-xs text-text-secondary py-4">{t('attendance.noMembers')}</p>
                    ) : (
                      <div>
                        {/* Column header */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-app-card/60 border-b border-white/5 text-[9px] text-text-muted uppercase font-semibold">
                          <span className="flex-1">{t('attendance.columnMember')}</span>
                          <span className="w-10 text-center">{t('attendance.columnRsvp')}</span>
                          <span className="w-20 text-center">{t('attendance.columnAttended')}</span>
                        </div>

                        {members.map(m => {
                          const rsvp = ev.responses?.[m.id]?.response;
                          const status = rec?.records[m.id];
                          const isPresent = status === 'present';
                          const isAbsent = status === 'absent';
                          const sk = `${k}|${m.id}`;

                          return (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5 last:border-0"
                            >
                              {m.photoURL ? (
                                <img src={m.photoURL} alt={m.displayName} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                                  {m.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}

                              <span className="flex-1 text-xs text-text-primary truncate">{m.displayName}</span>

                              <span className="w-10 text-center">{rsvpBadge(rsvp)}</span>

                              <div className="w-20 flex justify-center">
                                <button
                                  onClick={() => toggleMember(ev, m.id)}
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
