/**
 * Event Lineup
 * Trainer-built position/lane lineup for a team event, built from the
 * event's confirmed RSVPs. Anyone who can see the event can view it here;
 * team staff (assistant/trainer/clubOwner/admin) can edit and save it.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { getEvent, getEffectiveResponses } from '../../services/firebase/events';
import { saveEventLineup } from '../../services/firebase/lineups';
import { getTeamPlayerCards } from '../../services/firebase/playerCards';
import { getUsers } from '../../services/firebase/users';
import {
  HOCKEY_COLUMNS,
  VOLLEYBALL_COLUMNS,
  columnsForSport,
  emptyLane,
  FOOTBALL_FORMATIONS,
  buildFootballSlots,
} from '../../utils/lineupPositions';
import type { Event as CalendarEvent, EventLineup as EventLineupData, LineupSport } from '../../types';

type RosterPlayer = { id: string; name: string; jerseyNumber?: number };
type LaneRecord = Record<string, string | null>;

type SearchTarget =
  | { kind: 'lane'; laneIndex: number; col: string; colLabelKey: string }
  | { kind: 'goalie'; goalieIndex: number }
  | { kind: 'pitchSlot'; slotId: string; labelKey: string };

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

export default function EventLineup() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const occurrenceDate = searchParams.get('date');
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hasRole } = usePermissions();

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [sport, setSport] = useState<LineupSport>('hockey');
  const [hockeyLanes, setHockeyLanes] = useState<LaneRecord[]>([emptyLane(HOCKEY_COLUMNS)]);
  const [hockeyGoalies, setHockeyGoalies] = useState<(string | null)[]>([null]);
  const [volleyLanes, setVolleyLanes] = useState<LaneRecord[]>([emptyLane(VOLLEYBALL_COLUMNS)]);
  const [footballFormation, setFootballFormation] = useState('4-3-3');
  const [footballAssign, setFootballAssign] = useState<LaneRecord>({});

  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const canEdit = !!user && hasRole('assistant');

  useEffect(() => {
    if (eventId) load(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const ev = await getEvent(id);
      if (!ev) { setLoading(false); return; }
      setEvent(ev);

      if (ev.clubId && ev.teamId) {
        const responses = getEffectiveResponses(ev, occurrenceDate);
        const athleteIds = new Set<string>();
        Object.entries(responses).forEach(([userId, r]) => {
          if (r.response !== 'confirmed') return;
          if (r.forAthletes && r.forAthletes.length > 0) {
            r.forAthletes.forEach(id => athleteIds.add(id));
          } else {
            athleteIds.add(userId);
          }
        });

        const [users, cards] = await Promise.all([
          getUsers(Array.from(athleteIds)),
          getTeamPlayerCards(ev.clubId, ev.teamId),
        ]);
        const cardByAthlete = new Map(cards.map(c => [c.athleteId, c]));
        const rosterList: RosterPlayer[] = users
          .map(u => ({ id: u.id, name: u.displayName, jerseyNumber: cardByAthlete.get(u.id)?.jerseyNumber }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setRoster(rosterList);
      }

      if (ev.lineup) {
        setSport(ev.lineup.sport);
        if (ev.lineup.sport === 'football') {
          setFootballFormation(ev.lineup.formation || '4-3-3');
          setFootballAssign((ev.lineup.assign as LaneRecord) || {});
        } else if (ev.lineup.sport === 'hockey') {
          setHockeyLanes(ev.lineup.lanes && ev.lineup.lanes.length > 0 ? (ev.lineup.lanes as unknown as LaneRecord[]) : [emptyLane(HOCKEY_COLUMNS)]);
          setHockeyGoalies(ev.lineup.goalies && ev.lineup.goalies.length > 0 ? ev.lineup.goalies : [null]);
        } else {
          setVolleyLanes(ev.lineup.lanes && ev.lineup.lanes.length > 0 ? (ev.lineup.lanes as unknown as LaneRecord[]) : [emptyLane(VOLLEYBALL_COLUMNS)]);
        }
      }
    } catch (error) {
      console.error('Error loading event lineup:', error);
    } finally {
      setLoading(false);
    }
  };

  // ---- helpers scoped to the currently selected sport ----
  const getLanes = (): LaneRecord[] => (sport === 'hockey' ? hockeyLanes : volleyLanes);
  const setLanes = (updater: (prev: LaneRecord[]) => LaneRecord[]) => {
    if (sport === 'hockey') setHockeyLanes(updater);
    else setVolleyLanes(updater);
  };

  function playerAtTarget(target: SearchTarget): string | null {
    if (target.kind === 'pitchSlot') return footballAssign[target.slotId] || null;
    if (target.kind === 'goalie') return hockeyGoalies[target.goalieIndex] || null;
    return getLanes()[target.laneIndex]?.[target.col] || null;
  }

  function findAssignedLabel(playerId: string): string | null {
    if (sport === 'football') {
      for (const k of Object.keys(footballAssign)) {
        if (footballAssign[k] === playerId) {
          const slot = buildFootballSlots(footballFormation).find(s => s.id === k);
          return slot ? t(slot.labelKey) : null;
        }
      }
      return null;
    }
    if (sport === 'hockey') {
      const gi = hockeyGoalies.indexOf(playerId);
      if (gi !== -1) return hockeyGoalies.length > 1 ? t('lineup.goalieN', { n: gi + 1 }) : t('lineup.goalie');
    }
    const cols = columnsForSport(sport);
    const lanes = getLanes();
    for (let i = 0; i < lanes.length; i++) {
      for (const c of cols) {
        if (lanes[i][c.key] === playerId) {
          const laneLabel = sport === 'hockey' ? t('lineup.lane', { n: i + 1 }) : t('lineup.rotation', { n: i + 1 });
          return `${laneLabel} · ${t(c.labelKey)}`;
        }
      }
    }
    return null;
  }

  function assignPlayer(target: SearchTarget, playerId: string) {
    if (target.kind === 'pitchSlot') {
      setFootballAssign(prev => {
        const next: LaneRecord = {};
        Object.entries(prev).forEach(([k, v]) => { if (v !== playerId) next[k] = v; });
        next[target.slotId] = playerId;
        return next;
      });
      return;
    }

    setLanes(prev => {
      const next = prev.map(lane => {
        const copy: LaneRecord = { ...lane };
        Object.keys(copy).forEach(k => { if (copy[k] === playerId) copy[k] = null; });
        return copy;
      });
      if (target.kind === 'lane') next[target.laneIndex] = { ...next[target.laneIndex], [target.col]: playerId };
      return next;
    });

    if (sport === 'hockey') {
      setHockeyGoalies(prev => {
        const next = prev.map(g => (g === playerId ? null : g));
        if (target.kind === 'goalie') next[target.goalieIndex] = playerId;
        return next;
      });
    }
  }

  function clearTarget(target: SearchTarget) {
    if (target.kind === 'pitchSlot') {
      setFootballAssign(prev => { const next = { ...prev }; delete next[target.slotId]; return next; });
    } else if (target.kind === 'lane') {
      setLanes(prev => prev.map((lane, i) => (i === target.laneIndex ? { ...lane, [target.col]: null } : lane)));
    } else {
      setHockeyGoalies(prev => prev.map((g, i) => (i === target.goalieIndex ? null : g)));
    }
  }

  function addLane() { setLanes(prev => [...prev, emptyLane(columnsForSport(sport))]); }
  function removeLane(i: number) { setLanes(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))); }
  function addGoalie() { setHockeyGoalies(prev => [...prev, null]); }
  function removeGoalie(i: number) { setHockeyGoalies(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))); }

  function handleFormationChange(next: string) {
    setFootballFormation(next);
    const validIds = new Set(buildFootballSlots(next).map(s => s.id));
    setFootballAssign(prev => {
      const out: LaneRecord = {};
      Object.entries(prev).forEach(([k, v]) => { if (validIds.has(k)) out[k] = v; });
      return out;
    });
  }

  function assignedIdsCurrent(): Set<string> {
    const out = new Set<string>();
    if (sport === 'football') {
      Object.values(footballAssign).forEach(v => { if (v) out.add(v); });
    } else {
      getLanes().forEach(lane => Object.values(lane).forEach(v => { if (v) out.add(v); }));
      if (sport === 'hockey') hockeyGoalies.forEach(g => { if (g) out.add(g); });
    }
    return out;
  }

  const assignedIds = assignedIdsCurrent();
  const freeRoster = roster.filter(p => !assignedIds.has(p.id));

  let total = 0, filled = 0;
  if (sport === 'football') {
    const slots = buildFootballSlots(footballFormation);
    total = slots.length;
    filled = slots.filter(s => footballAssign[s.id]).length;
  } else {
    const cols = columnsForSport(sport);
    const lanes = getLanes();
    lanes.forEach(lane => cols.forEach(c => { if (lane[c.key]) filled++; }));
    total = lanes.length * cols.length;
    if (sport === 'hockey') { total += hockeyGoalies.length; filled += hockeyGoalies.filter(Boolean).length; }
  }

  function openSearch(target: SearchTarget) {
    if (!canEdit) return;
    setSearchTarget(target);
    setSearchQuery('');
  }

  async function handleSave() {
    if (!event || !user) return;
    setSaving(true);
    try {
      let payload: Omit<EventLineupData, 'updatedAt' | 'updatedBy'>;
      if (sport === 'football') {
        payload = { sport: 'football', formation: footballFormation, assign: footballAssign };
      } else if (sport === 'hockey') {
        payload = { sport: 'hockey', lanes: hockeyLanes as any, goalies: hockeyGoalies };
      } else {
        payload = { sport: 'volleyball', lanes: volleyLanes as any };
      }
      await saveEventLineup(event.id, payload, user.id);
      setToast(t('lineup.saved'));
    } catch (error) {
      console.error('Error saving lineup:', error);
      setToast(t('lineup.saveError'));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(''), 3500);
    }
  }

  const backLink = eventId ? (occurrenceDate ? `/calendar/events/${eventId}?date=${occurrenceDate}` : `/calendar/events/${eventId}`) : '/calendar';

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-app-cyan mx-auto mb-3"></div>
          <p className="text-sm text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-lg font-bold text-text-primary mb-3">{t('events.detail.notFound')}</h2>
          <Link to="/calendar" className="inline-block px-4 py-2 text-xs bg-gradient-primary text-white rounded-lg shadow-button font-semibold">
            {t('events.detail.backToCalendar')}
          </Link>
        </div>
      </Container>
    );
  }

  if (!event.teamId || !event.clubId) {
    return (
      <Container className="max-w-2xl">
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6 text-center">
          <p className="text-sm text-text-secondary mb-4">{t('lineup.noTeamEvent')}</p>
          <Link to={backLink} className="inline-block px-4 py-2 text-xs bg-app-secondary border border-white/10 text-text-primary rounded-lg font-semibold">
            {t('common.back')}
          </Link>
        </div>
      </Container>
    );
  }

  const eventDateLabel = new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    + (event.startTime ? ` · ${event.startTime}` : '');

  const laneRowLabel = (i: number) => (sport === 'hockey' ? t('lineup.lane', { n: i + 1 }) : t('lineup.rotation', { n: i + 1 }));

  return (
    <Container className="max-w-2xl">
      <div className="space-y-3 sm:space-y-4 pb-8">
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5">
          <Link to={backLink} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors mb-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back')}
          </Link>

          <h1 className="text-lg font-bold text-text-primary">{event.title}</h1>
          <p className="text-xs text-text-secondary mb-3">{eventDateLabel}</p>

          {canEdit && (
            <div className="mb-3">
              <label className="block text-xs text-text-muted mb-1">{t('lineup.sport')}</label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value as LineupSport)}
                className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="hockey">{t('lineup.sportOptions.hockey')}</option>
                <option value="football">{t('lineup.sportOptions.football')}</option>
                <option value="volleyball">{t('lineup.sportOptions.volleyball')}</option>
              </select>
            </div>
          )}

          {sport === 'football' && canEdit && (
            <div className="mb-3">
              <label className="block text-xs text-text-muted mb-1">{t('lineup.formation')}</label>
              <select
                value={footballFormation}
                onChange={(e) => handleFormationChange(e.target.value)}
                className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                {FOOTBALL_FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span><span className="text-chart-cyan">●</span> {t('lineup.assigned')} <b className="text-text-primary tabular-nums">{filled}</b>/<b className="text-text-primary tabular-nums">{total}</b></span>
            <span><span className="text-app-blue">●</span> {t('lineup.unassigned')} <b className="text-text-primary tabular-nums">{freeRoster.length}</b></span>
          </div>

          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-3 px-4 py-2.5 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '…' : `💾 ${t('lineup.save')}`}
            </button>
          )}
        </div>

        {sport === 'football' ? (
          <div className="relative bg-app-secondary shadow-card rounded-2xl border border-white/10 overflow-hidden" style={{ aspectRatio: '3 / 4' }}>
            <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full">
              <rect x="6" y="6" width="288" height="388" rx="6" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
              <line x1="6" y1="200" x2="294" y2="200" stroke="rgba(255,255,255,.10)" strokeWidth="1.5" />
              <circle cx="150" cy="200" r="36" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1.5" />
              <rect x="80" y="6" width="140" height="50" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
              <rect x="80" y="344" width="140" height="50" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
            </svg>
            {buildFootballSlots(footballFormation).map((s) => {
              const pid = footballAssign[s.id];
              const p = pid ? roster.find(r => r.id === pid) : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSearch({ kind: 'pitchSlot', slotId: s.id, labelKey: s.labelKey })}
                  disabled={!canEdit}
                  className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 disabled:cursor-default"
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  aria-label={`${t(s.labelKey)}${p ? `, ${p.name}` : `, ${t('lineup.openPosition')}`}`}
                >
                  <span className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${p ? 'border-app-cyan bg-app-card' : 'border-dashed border-white/25 bg-app-card/60'}`}>
                    {p ? (
                      <span className="text-sm font-bold text-text-primary tabular-nums">{p.jerseyNumber ?? initials(p.name)}</span>
                    ) : (
                      <span className="text-text-muted text-lg font-light">+</span>
                    )}
                  </span>
                  <span className="text-[9px] font-semibold text-text-secondary max-w-[60px] truncate">{p ? p.name.split(' ')[0] : ''}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-3 sm:p-4">
            {sport === 'hockey' && (
              <div className="space-y-2 mb-3">
                {hockeyGoalies.map((gid, gi) => {
                  const p = gid ? roster.find(r => r.id === gid) : null;
                  return (
                    <div key={gi} className="flex items-center gap-3 bg-app-secondary rounded-xl px-3 py-2 border border-white/10">
                      <span className="flex-1 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                        {hockeyGoalies.length > 1 ? t('lineup.goalieN', { n: gi + 1 }) : t('lineup.goalie')}
                      </span>
                      <button
                        type="button"
                        onClick={() => openSearch({ kind: 'goalie', goalieIndex: gi })}
                        disabled={!canEdit}
                        className="flex items-center gap-2 disabled:cursor-default"
                      >
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${p ? 'border-app-cyan bg-app-primary' : 'border-dashed border-white/25 bg-app-primary'}`}>
                          {p ? <span className="text-xs font-bold text-text-primary tabular-nums">{p.jerseyNumber ?? initials(p.name)}</span> : <span className="text-text-muted text-base font-light">+</span>}
                        </span>
                        {p && <span className="text-xs font-medium text-text-primary">{p.name.split(' ')[0]}</span>}
                      </button>
                      {canEdit && hockeyGoalies.length > 1 && (
                        <button type="button" onClick={() => removeGoalie(gi)} className="text-text-muted hover:text-chart-pink text-xs px-1" aria-label={t('lineup.removeGoalie', { n: gi + 1 })}>✕</button>
                      )}
                    </div>
                  );
                })}
                {canEdit && (
                  <button type="button" onClick={addGoalie} className="w-full text-xs font-semibold uppercase tracking-wide text-text-muted border border-dashed border-white/15 rounded-lg py-2 hover:border-app-cyan hover:text-app-cyan transition-colors">
                    {t('lineup.addGoalie')}
                  </button>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="border-collapse w-full min-w-max">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-app-secondary border-b border-white/10 px-2 py-2 w-16"></th>
                    {columnsForSport(sport).map(c => (
                      <th key={c.key} className="bg-app-secondary border-b border-white/10 px-1 py-2 text-[10px] font-bold uppercase tracking-wide text-text-secondary text-center w-20">
                        {t(c.labelKey)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getLanes().map((lane, i) => (
                    <tr key={i}>
                      <td className="sticky left-0 z-10 bg-app-secondary border-r border-b border-white/10 px-2 py-2 text-xs font-bold text-text-primary">
                        <div className="flex items-center justify-between gap-1">
                          <span>{laneRowLabel(i)}</span>
                          {canEdit && getLanes().length > 1 && (
                            <button type="button" onClick={() => removeLane(i)} className="text-text-muted hover:text-chart-pink" aria-label={t('lineup.removeLane', { n: i + 1 })}>✕</button>
                          )}
                        </div>
                      </td>
                      {columnsForSport(sport).map(c => {
                        const pid = lane[c.key];
                        const p = pid ? roster.find(r => r.id === pid) : null;
                        return (
                          <td key={c.key} className="border-b border-white/10 px-1 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openSearch({ kind: 'lane', laneIndex: i, col: c.key, colLabelKey: c.labelKey })}
                              disabled={!canEdit}
                              className="flex flex-col items-center gap-0.5 mx-auto disabled:cursor-default"
                              aria-label={`${laneRowLabel(i)} ${t(c.labelKey)}${p ? `, ${p.name}` : `, ${t('lineup.openPosition')}`}`}
                            >
                              <span className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${p ? 'border-app-cyan bg-app-primary' : 'border-dashed border-white/25 bg-app-primary'}`}>
                                {p ? <span className="text-[11px] font-bold text-text-primary tabular-nums">{p.jerseyNumber ?? initials(p.name)}</span> : <span className="text-text-muted text-sm font-light">+</span>}
                              </span>
                              {p && <span className="text-[8.5px] font-semibold text-text-secondary max-w-[54px] truncate">{p.name.split(' ')[0]}</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <button type="button" onClick={addLane} className="w-full mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted border border-dashed border-white/15 rounded-lg py-2.5 hover:border-app-cyan hover:text-app-cyan transition-colors">
                {t('lineup.addLane')}
              </button>
            )}
          </div>
        )}

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            {t('lineup.confirmedUnassigned')} ({freeRoster.length})
          </h3>
          {freeRoster.length === 0 ? (
            <p className="text-xs text-text-muted">{t('lineup.allAssigned')}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {freeRoster.map(p => (
                <div key={p.id} className="flex-shrink-0 flex items-center gap-2 bg-app-secondary border border-white/10 rounded-full pl-1 pr-3 py-1">
                  <span className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {initials(p.name)}
                  </span>
                  <span className="text-xs font-medium text-text-primary whitespace-nowrap">{p.name}</span>
                  {p.jerseyNumber != null && <span className="text-[10px] text-text-muted font-bold tabular-nums">#{p.jerseyNumber}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setSearchTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-app-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl p-4 max-h-[78vh] flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    {searchTarget.kind === 'goalie'
                      ? (hockeyGoalies.length > 1 ? t('lineup.goalieN', { n: searchTarget.goalieIndex + 1 }) : t('lineup.goalie'))
                      : searchTarget.kind === 'pitchSlot'
                      ? t(searchTarget.labelKey)
                      : `${laneRowLabel(searchTarget.laneIndex)} · ${t(searchTarget.colLabelKey)}`}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {(() => {
                      const cur = playerAtTarget(searchTarget);
                      const p = cur ? roster.find(r => r.id === cur) : null;
                      return p ? p.name : t('lineup.openPosition');
                    })()}
                  </p>
                </div>
                <button onClick={() => setSearchTarget(null)} className="text-text-muted hover:text-text-primary flex-shrink-0" aria-label={t('common.close')}>✕</button>
              </div>

              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('lineup.searchPlaceholder')}
                className="w-full px-3 py-2 mb-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              />

              {playerAtTarget(searchTarget) && (
                <button
                  type="button"
                  onClick={() => { clearTarget(searchTarget); setSearchTarget(null); }}
                  className="w-full mb-2 px-3 py-2 text-xs font-semibold bg-chart-pink/10 border border-chart-pink/40 text-chart-pink rounded-lg"
                >
                  {t('lineup.clearPosition')}
                </button>
              )}

              <div className="space-y-1.5 overflow-y-auto">
                {roster
                  .filter(p => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                  .map(p => {
                    const where = findAssignedLabel(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { assignPlayer(searchTarget, p.id); setSearchTarget(null); }}
                        className="w-full flex items-center gap-2.5 p-2 bg-app-secondary rounded-lg hover:border-app-cyan border border-transparent text-left"
                      >
                        <span className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {initials(p.name)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold text-text-primary truncate">
                            {p.name} {p.jerseyNumber != null && <span className="text-text-muted font-bold tabular-nums">#{p.jerseyNumber}</span>}
                          </span>
                          <span className="block text-[10px] text-text-muted truncate">
                            {where ? t('lineup.playingAt', { where }) : t('lineup.free')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                {roster.filter(p => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).length === 0 && (
                  <p className="text-center text-xs text-text-muted py-4">{t('lineup.noResults')}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] max-w-[90%] bg-app-card border border-white/20 rounded-xl px-4 py-3 shadow-2xl text-xs sm:text-sm text-text-primary text-center">
          {toast}
        </div>
      )}
    </Container>
  );
}
