import { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  addGameGoalEvent,
  removeGameGoalEvent,
  addGamePenaltyEvent,
  removeGamePenaltyEvent,
  addGoalieToGame,
  addGoalieStatTick,
  removeGoalieFromGame,
} from '../../services/firebase/nominations';
import type { NominationGame } from '../../types';

interface RosterPlayer {
  athleteId: string;
  displayName: string;
}

interface Props {
  clubId: string;
  nominationId: string;
  game: NominationGame;
  roster: RosterPlayer[];
  onClose: () => void;
}

type Section = 'goals' | 'penalties' | 'goalie';
const PENALTY_MINUTES = [2, 5, 10];

function nameOf(roster: RosterPlayer[], athleteId: string): string {
  return roster.find(p => p.athleteId === athleteId)?.displayName || athleteId;
}

function PlayerPicker({
  roster,
  excludeIds = [],
  onPick,
  placeholder,
}: {
  roster: RosterPlayer[];
  excludeIds?: string[];
  onPick: (athleteId: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter(p => !excludeIds.includes(p.athleteId))
      .filter(p => !q || p.displayName.toLowerCase().includes(q));
  }, [roster, excludeIds, search]);

  return (
    <div className="space-y-1.5">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-app-blue"
      />
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {results.map(p => (
          <button
            key={p.athleteId}
            onClick={() => onPick(p.athleteId)}
            className="px-2.5 py-1.5 text-[11px] font-medium bg-app-card border border-white/10 rounded-lg text-text-primary hover:border-app-cyan transition-colors"
          >
            {p.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GameStatsModal({ clubId, nominationId, game, roster, onClose }: Props) {
  const { t } = useLanguage();
  const [section, setSection] = useState<Section>('goals');
  const [busy, setBusy] = useState(false);

  // Goal composer state
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [assistIds, setAssistIds] = useState<string[]>([]);

  // Penalty composer state
  const [penaltyPlayerId, setPenaltyPlayerId] = useState<string | null>(null);

  const goalEvents = game.goalEvents || [];
  const penaltyEvents = game.penaltyEvents || [];
  const goalieStats = game.goalieStats || [];

  const resetGoalComposer = () => {
    setScorerId(null);
    setAssistIds([]);
  };

  const saveGoal = async () => {
    if (!scorerId) return;
    setBusy(true);
    try {
      await addGameGoalEvent(clubId, nominationId, game.id, scorerId, assistIds);
      resetGoalComposer();
    } catch (err) {
      console.error('GameStatsModal: addGameGoalEvent failed', err);
      alert(t('gameStats.errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const deleteGoal = async (eventId: string) => {
    setBusy(true);
    try {
      await removeGameGoalEvent(clubId, nominationId, game.id, eventId);
    } catch (err) {
      console.error('GameStatsModal: removeGameGoalEvent failed', err);
    } finally {
      setBusy(false);
    }
  };

  const savePenalty = async (minutes: number) => {
    if (!penaltyPlayerId) return;
    setBusy(true);
    try {
      await addGamePenaltyEvent(clubId, nominationId, game.id, penaltyPlayerId, minutes);
      setPenaltyPlayerId(null);
    } catch (err) {
      console.error('GameStatsModal: addGamePenaltyEvent failed', err);
      alert(t('gameStats.errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const deletePenalty = async (eventId: string) => {
    setBusy(true);
    try {
      await removeGamePenaltyEvent(clubId, nominationId, game.id, eventId);
    } catch (err) {
      console.error('GameStatsModal: removeGamePenaltyEvent failed', err);
    } finally {
      setBusy(false);
    }
  };

  const addGoalie = async (athleteId: string) => {
    setBusy(true);
    try {
      await addGoalieToGame(clubId, nominationId, game.id, athleteId);
    } catch (err) {
      console.error('GameStatsModal: addGoalie failed', err);
    } finally {
      setBusy(false);
    }
  };

  const tickGoalie = async (athleteId: string, kind: 'save' | 'goalAgainst') => {
    setBusy(true);
    try {
      await addGoalieStatTick(clubId, nominationId, game.id, athleteId, kind);
    } catch (err) {
      console.error('GameStatsModal: addGoalieStatTick failed', err);
    } finally {
      setBusy(false);
    }
  };

  const removeGoalie = async (athleteId: string) => {
    setBusy(true);
    try {
      await removeGoalieFromGame(clubId, nominationId, game.id, athleteId);
    } catch (err) {
      console.error('GameStatsModal: removeGoalieFromGame failed', err);
    } finally {
      setBusy(false);
    }
  };

  const availableGoaliePicks = roster.filter(p => !goalieStats.some(g => g.athleteId === p.athleteId));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 z-50" onClick={onClose}>
      <div
        className="bg-app-card rounded-2xl border border-white/10 shadow-card max-w-md w-full max-h-[88vh] overflow-y-auto p-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text-primary">{t('gameStats.title')}</h3>
            <p className="text-[11px] text-text-muted">
              {game.opponent || t('nominations.opponentTbd')} · {new Date(game.date + 'T00:00:00').toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">✕</button>
        </div>

        {/* Section switcher */}
        <div className="flex gap-1.5">
          {(['goals', 'penalties', 'goalie'] as Section[]).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                section === s ? 'bg-app-blue text-white' : 'bg-app-secondary text-text-secondary hover:bg-white/10'
              }`}
            >
              {t(`gameStats.tabs.${s}`)}
            </button>
          ))}
        </div>

        {/* Goals */}
        {section === 'goals' && (
          <div className="space-y-3">
            <div className="bg-app-secondary border border-white/10 rounded-xl p-3 space-y-2">
              {!scorerId ? (
                <>
                  <p className="text-[11px] font-semibold text-text-secondary">{t('gameStats.selectScorer')}</p>
                  <PlayerPicker roster={roster} onPick={setScorerId} placeholder={t('gameStats.searchPlaceholder')} />
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-text-secondary">
                    ⚽ {nameOf(roster, scorerId)}
                  </p>
                  <p className="text-[11px] font-semibold text-text-secondary">{t('gameStats.selectAssists')}</p>
                  {assistIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {assistIds.map(id => (
                        <span key={id} className="px-2 py-1 text-[10px] bg-app-card border border-white/10 rounded-lg text-text-primary flex items-center gap-1">
                          {nameOf(roster, id)}
                          <button onClick={() => setAssistIds(a => a.filter(x => x !== id))} className="text-text-muted hover:text-chart-pink">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  {assistIds.length < 2 && (
                    <PlayerPicker
                      roster={roster}
                      excludeIds={[scorerId, ...assistIds]}
                      onPick={id => setAssistIds(a => [...a, id])}
                      placeholder={t('gameStats.searchPlaceholder')}
                    />
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveGoal}
                      disabled={busy}
                      className="flex-1 px-3 py-2 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                    >
                      {t('gameStats.saveGoal')}
                    </button>
                    <button
                      onClick={resetGoalComposer}
                      className="px-3 py-2 text-xs bg-app-card border border-white/10 text-text-muted rounded-lg"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              {goalEvents.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-2">{t('gameStats.noGoalsYet')}</p>
              ) : (
                goalEvents.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between gap-2 p-2 bg-app-secondary border border-white/10 rounded-lg">
                    <div className="text-xs text-text-primary min-w-0">
                      <span className="font-semibold">⚽ {nameOf(roster, ev.scorerId)}</span>
                      {ev.assistIds && ev.assistIds.length > 0 && (
                        <span className="text-text-muted"> — {t('gameStats.assistedBy')} {ev.assistIds.map(id => nameOf(roster, id)).join(', ')}</span>
                      )}
                    </div>
                    <button onClick={() => deleteGoal(ev.id)} className="text-text-muted hover:text-chart-pink text-xs flex-shrink-0">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Penalties */}
        {section === 'penalties' && (
          <div className="space-y-3">
            <div className="bg-app-secondary border border-white/10 rounded-xl p-3 space-y-2">
              {!penaltyPlayerId ? (
                <>
                  <p className="text-[11px] font-semibold text-text-secondary">{t('gameStats.selectPlayer')}</p>
                  <PlayerPicker roster={roster} onPick={setPenaltyPlayerId} placeholder={t('gameStats.searchPlaceholder')} />
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-text-secondary">
                    🟨 {nameOf(roster, penaltyPlayerId)} — {t('gameStats.selectMinutes')}
                  </p>
                  <div className="flex gap-2">
                    {PENALTY_MINUTES.map(m => (
                      <button
                        key={m}
                        onClick={() => savePenalty(m)}
                        disabled={busy}
                        className="flex-1 py-2 text-xs font-bold bg-app-card border border-white/10 rounded-lg text-text-primary hover:border-app-cyan disabled:opacity-50"
                      >
                        {m}'
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPenaltyPlayerId(null)}
                    className="w-full px-3 py-1.5 text-[11px] bg-app-card border border-white/10 text-text-muted rounded-lg"
                  >
                    {t('common.cancel')}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              {penaltyEvents.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-2">{t('gameStats.noPenaltiesYet')}</p>
              ) : (
                penaltyEvents.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between gap-2 p-2 bg-app-secondary border border-white/10 rounded-lg">
                    <span className="text-xs text-text-primary">🟨 {nameOf(roster, ev.athleteId)} — {ev.minutes}'</span>
                    <button onClick={() => deletePenalty(ev.id)} className="text-text-muted hover:text-chart-pink text-xs flex-shrink-0">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Goalie */}
        {section === 'goalie' && (
          <div className="space-y-3">
            {goalieStats.map(g => {
              const shots = g.saves + g.goalsAgainst;
              const savePct = shots > 0 ? ((g.saves / shots) * 100).toFixed(0) : '0';
              return (
                <div key={g.athleteId} className="bg-app-secondary border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary">🥅 {nameOf(roster, g.athleteId)}</span>
                    <button onClick={() => removeGoalie(g.athleteId)} className="text-text-muted hover:text-chart-pink text-xs">✕</button>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {g.saves} {t('goalie.saves').toLowerCase()} · {g.goalsAgainst} {t('gameStats.goalsAgainst').toLowerCase()} · {savePct}% {t('goalie.savePct')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => tickGoalie(g.athleteId, 'save')}
                      disabled={busy}
                      className="py-2.5 rounded-lg border-2 border-green-500 bg-green-500/10 text-green-500 font-bold text-[11px] disabled:opacity-50"
                    >
                      🧤 {t('goalie.save')}
                    </button>
                    <button
                      onClick={() => tickGoalie(g.athleteId, 'goalAgainst')}
                      disabled={busy}
                      className="py-2.5 rounded-lg border-2 border-red-500 bg-red-500/10 text-red-500 font-bold text-[11px] disabled:opacity-50"
                    >
                      🚨 {t('gameStats.goalAgainst')}
                    </button>
                  </div>
                </div>
              );
            })}

            {availableGoaliePicks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-text-secondary">{t('gameStats.addGoalie')}</p>
                <PlayerPicker roster={availableGoaliePicks} onPick={addGoalie} placeholder={t('gameStats.searchPlaceholder')} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
