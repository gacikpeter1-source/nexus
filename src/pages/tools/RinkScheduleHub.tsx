/**
 * Rink Schedule — club-wide ice-time/room schedule tool. Staff manage halls
 * and entries here; saving publishes everything into the regular Calendar
 * (see saveRinkSchedule). This is Phase 1: halls + a manual entry form. The
 * visual day/hall timeline grid, Excel import/export, and the public TV
 * board are separate follow-up phases.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { getRinkSchedule, saveRinkSchedule } from '../../services/firebase/rinkSchedule';
import type { Club, RinkHall, RinkScheduleEntry, RecurrenceRule } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DraftEntry = Omit<RinkScheduleEntry, 'teamId' | 'eventId'>;

function emptyDraft(hallId: string): DraftEntry {
  return {
    id: crypto.randomUUID(),
    hallId,
    name: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '15:30',
    endTime: '16:30',
    room: '',
    isRecurring: false,
  };
}

export default function RinkScheduleHub() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const [halls, setHalls] = useState<RinkHall[]>([]);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<DraftEntry | null>(null);

  const club = useMemo(() => clubs.find(c => c.id === clubId), [clubs, clubId]);
  const teamNames = useMemo(() => (club?.teams || []).map(tm => tm.name), [club]);

  useEffect(() => {
    if (!user || !isStaff) return;
    (async () => {
      setLoading(true);
      try {
        const userClubs = await getUserClubs(user.id);
        setClubs(userClubs);
        if (userClubs.length === 1) setClubId(userClubs[0].id!);
      } catch (err) {
        console.error('RinkScheduleHub: load clubs failed', err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isStaff]);

  useEffect(() => {
    if (!clubId) { setHalls([]); setEntries([]); return; }
    (async () => {
      try {
        const schedule = await getRinkSchedule(clubId);
        setHalls(schedule?.halls || []);
        setEntries(schedule?.entries.map(({ teamId, eventId, ...rest }) => rest) || []);
      } catch (err) {
        console.error('RinkScheduleHub: load schedule failed', err);
      }
    })();
  }, [clubId]);

  const addHall = () => {
    setHalls(prev => [...prev, { id: crypto.randomUUID(), name: `Hall ${String.fromCharCode(65 + prev.length)}` }]);
  };
  const renameHall = (id: string, name: string) => {
    setHalls(prev => prev.map(h => (h.id === id ? { ...h, name } : h)));
  };
  const removeHall = (id: string) => {
    setHalls(prev => prev.filter(h => h.id !== id));
    setEntries(prev => prev.filter(e => e.hallId !== id));
  };

  const openNewEntry = () => {
    if (halls.length === 0) return;
    setEditingEntry(emptyDraft(halls[0].id));
  };
  const saveEntry = (entry: DraftEntry) => {
    setEntries(prev => {
      const exists = prev.some(e => e.id === entry.id);
      return exists ? prev.map(e => (e.id === entry.id ? entry : e)) : [...prev, entry];
    });
    setEditingEntry(null);
  };
  const removeEntry = (id: string) => {
    if (!confirm(t('rinkSchedule.confirmRemoveEntry'))) return;
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handlePublish = async () => {
    if (!club || !user) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      await saveRinkSchedule(club, halls, entries, user.id);
      setSaved(true);
    } catch (err) {
      console.error('RinkScheduleHub: publish failed', err);
      setSaveError(t('rinkSchedule.publishError'));
    } finally {
      setSaving(false);
    }
  };

  if (!isStaff) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/" className="text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">🏒 {t('rinkSchedule.title')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('rinkSchedule.hubSubtitle')}</p>
        </div>

        {clubs.length > 1 && (
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('lineup.filterClub')}</label>
            <select
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="">{t('rinkSchedule.pickClub')}</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
          </div>
        ) : !clubId ? (
          <p className="text-xs text-text-muted text-center py-2">{t('rinkSchedule.pickClub')}</p>
        ) : (
          <>
            {/* Halls */}
            <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-text-primary">{t('rinkSchedule.halls')}</h2>
                <button onClick={addHall} className="px-2.5 py-1 text-xs font-semibold bg-white/5 border border-white/10 rounded-lg text-text-secondary hover:border-app-cyan/40">
                  + {t('rinkSchedule.addHall')}
                </button>
              </div>
              {halls.length === 0 ? (
                <p className="text-xs text-text-muted">{t('rinkSchedule.noHalls')}</p>
              ) : (
                <div className="space-y-2">
                  {halls.map(h => (
                    <div key={h.id} className="flex items-center gap-2">
                      <input
                        value={h.name}
                        onChange={(e) => renameHall(h.id, e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                      <button onClick={() => removeHall(h.id)} className="text-xs text-red-400 hover:text-red-300 px-2">
                        {t('common.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Entries */}
            <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-text-primary">{t('rinkSchedule.entries')}</h2>
                <button
                  onClick={openNewEntry}
                  disabled={halls.length === 0}
                  className="px-2.5 py-1 text-xs font-semibold bg-white/5 border border-white/10 rounded-lg text-text-secondary hover:border-app-cyan/40 disabled:opacity-40"
                >
                  + {t('rinkSchedule.addEntry')}
                </button>
              </div>
              {halls.length === 0 ? (
                <p className="text-xs text-text-muted">{t('rinkSchedule.addHallFirst')}</p>
              ) : entries.length === 0 ? (
                <p className="text-xs text-text-muted">{t('rinkSchedule.noEntries')}</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(entry => {
                    const hall = halls.find(h => h.id === entry.hallId);
                    return (
                      <div key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{entry.name || t('rinkSchedule.untitled')}</p>
                          <p className="text-[11px] text-text-muted truncate">
                            {hall?.name} · {entry.startTime}–{entry.endTime}
                            {entry.isRecurring && ` · ${t('rinkSchedule.repeats')}`}
                            {' · '}{entry.room ? entry.room : t('rinkSchedule.roomTba')}
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button onClick={() => setEditingEntry(entry)} className="text-xs text-app-cyan hover:text-app-cyan/80">
                            {t('common.edit')}
                          </button>
                          <button onClick={() => removeEntry(entry.id)} className="text-xs text-red-400 hover:text-red-300">
                            {t('common.remove')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePublish}
                disabled={saving || halls.length === 0}
                className="px-4 py-2 text-sm font-semibold bg-gradient-primary text-white rounded-lg shadow-button disabled:opacity-50"
              >
                {saving ? t('rinkSchedule.publishing') : t('rinkSchedule.publish')}
              </button>
              {saved && <span className="text-xs text-green-400">{t('rinkSchedule.published')}</span>}
              {saveError && <span className="text-xs text-red-400">{saveError}</span>}
            </div>
            <p className="text-[11px] text-text-muted">{t('rinkSchedule.publishHint')}</p>
          </>
        )}
      </div>

      {editingEntry && (
        <EntryEditor
          entry={editingEntry}
          halls={halls}
          teamNames={teamNames}
          onCancel={() => setEditingEntry(null)}
          onSave={saveEntry}
        />
      )}
    </Container>
  );
}

function EntryEditor({
  entry, halls, teamNames, onCancel, onSave,
}: {
  entry: DraftEntry;
  halls: RinkHall[];
  teamNames: string[];
  onCancel: () => void;
  onSave: (entry: DraftEntry) => void;
}) {
  const { t } = useLanguage();
  const [hallId, setHallId] = useState(entry.hallId);
  const [name, setName] = useState(entry.name);
  const [date, setDate] = useState(entry.date);
  const [startTime, setStartTime] = useState(entry.startTime);
  const [endTime, setEndTime] = useState(entry.endTime);
  const [room, setRoom] = useState(entry.room || '');

  const [isRecurring, setIsRecurring] = useState(entry.isRecurring);
  const [frequency, setFrequency] = useState<RecurrenceRule['frequency']>(entry.recurrenceRule?.frequency || 'weekly');
  const [interval, setIntervalVal] = useState(entry.recurrenceRule?.interval || 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(entry.recurrenceRule?.daysOfWeek || []);
  const [endType, setEndType] = useState<'never' | 'date' | 'count'>(
    entry.recurrenceRule?.endDate ? 'date' : entry.recurrenceRule?.count ? 'count' : 'never'
  );
  const [endDate, setEndDate] = useState(entry.recurrenceRule?.endDate || '');
  const [count, setCount] = useState(entry.recurrenceRule?.count || 10);
  const [error, setError] = useState('');

  const toggleDay = (idx: number) => {
    setDaysOfWeek(prev => (prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()));
  };

  const submit = () => {
    if (!name.trim()) { setError(t('rinkSchedule.nameRequired')); return; }
    if (endTime <= startTime) { setError(t('rinkSchedule.timeInvalid')); return; }
    if (isRecurring && frequency === 'weekly' && daysOfWeek.length === 0) {
      setError(t('rinkSchedule.daysRequired')); return;
    }
    const recurrenceRule: RecurrenceRule | undefined = isRecurring ? {
      frequency,
      interval,
      ...(frequency === 'weekly' && daysOfWeek.length > 0 ? { daysOfWeek } : {}),
      ...(endType === 'date' && endDate ? { endDate } : {}),
      ...(endType === 'count' && count ? { count } : {}),
    } : undefined;

    onSave({
      ...entry,
      hallId, name: name.trim(), date, startTime, endTime,
      room: room.trim() || undefined,
      isRecurring,
      ...(recurrenceRule ? { recurrenceRule } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-app-card border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-text-primary">{t('rinkSchedule.entryEditorTitle')}</h3>

        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.hall')}</label>
          <select value={hallId} onChange={(e) => setHallId(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm">
            {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.eventName')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            list="rink-schedule-team-names"
            placeholder={t('rinkSchedule.eventNamePlaceholder')}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm"
          />
          <datalist id="rink-schedule-team-names">
            {teamNames.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.start')}</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.end')}</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('rinkSchedule.room')}</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder={t('rinkSchedule.roomPlaceholder')}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary text-sm"
          />
          <p className="text-[10px] text-text-muted mt-1">{t('rinkSchedule.roomHint')}</p>
        </div>

        <div className="border border-white/10 rounded-lg p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-text-primary font-semibold">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            {t('rinkSchedule.repeatEvent')}
          </label>

          {isRecurring && (
            <div className="space-y-2 pl-1">
              <div className="grid grid-cols-2 gap-2">
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceRule['frequency'])} className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-text-primary text-xs">
                  <option value="daily">{t('rinkSchedule.freqDaily')}</option>
                  <option value="weekly">{t('rinkSchedule.freqWeekly')}</option>
                  <option value="monthly">{t('rinkSchedule.freqMonthly')}</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} value={interval} onChange={(e) => setIntervalVal(Math.max(1, Number(e.target.value)))} className="w-14 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-text-primary text-xs" />
                  <span className="text-[11px] text-text-muted">
                    {frequency === 'daily' ? t('rinkSchedule.unitDays') : frequency === 'monthly' ? t('rinkSchedule.unitMonths') : t('rinkSchedule.unitWeeks')}
                  </span>
                </div>
              </div>

              {frequency === 'weekly' && (
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`w-9 h-7 rounded-md text-[10px] font-semibold border ${daysOfWeek.includes(idx) ? 'bg-app-blue border-app-blue text-white' : 'bg-white/5 border-white/10 text-text-secondary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                {(['never', 'date', 'count'] as const).map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-[11px] text-text-secondary">
                    <input type="radio" name="rink-recur-end" checked={endType === opt} onChange={() => setEndType(opt)} />
                    {opt === 'never' ? t('rinkSchedule.endNever') : opt === 'date' ? t('rinkSchedule.endOnDate') : t('rinkSchedule.endAfterCount')}
                    {opt === 'date' && endType === 'date' && (
                      <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className="ml-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-text-primary text-[11px]" />
                    )}
                    {opt === 'count' && endType === 'count' && (
                      <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} className="ml-1 w-14 px-2 py-1 bg-white/5 border border-white/10 rounded text-text-primary text-[11px]" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm font-semibold bg-white/5 border border-white/10 rounded-lg text-text-secondary">
            {t('common.cancel')}
          </button>
          <button onClick={submit} className="flex-1 px-3 py-2 text-sm font-semibold bg-gradient-primary text-white rounded-lg shadow-button">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
