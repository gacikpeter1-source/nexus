/**
 * Individual-elimination bracket section (karate, taekwondo, kickboxing,
 * MMA, ...) — one or more independent divisions (e.g. weight classes),
 * each a single-elimination knockout of named participants. Parallel to
 * TournamentBracketSection (team-score), not a variant of it: match
 * outcomes here are a declared winner + method, not a score.
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { resolveCombatSlot, buildCombatDivisionMatches } from '../../utils/combatBracket';
import { parsePastedTeamNames, allSurfaces } from '../../utils/tournamentBracket';
import RinkManager from './RinkManager';
import type { CombatBracket, CombatDivision, CombatMatch, CombatMatchMethod, TournamentRink } from '../../types';

interface Props {
  bracket: CombatBracket;
  isStaff: boolean;
  sport?: string;
  onUpdateBracket: (bracket: CombatBracket) => Promise<void>;
}

const METHODS: CombatMatchMethod[] = ['decision', 'points', 'ko', 'tko', 'submission', 'dq', 'walkover'];

export default function CombatBracketSection({ bracket, isStaff, sport, onUpdateBracket }: Props) {
  const { t } = useLanguage();

  const [openDivisionId, setOpenDivisionId] = useState<string | null>(bracket.divisions[0]?.id || null);
  const [editingMatchKey, setEditingMatchKey] = useState<string | null>(null);
  const [pendingWinner, setPendingWinner] = useState<'home' | 'away' | null>(null);
  const [pendingMethod, setPendingMethod] = useState<CombatMatchMethod>('decision');
  const [saving, setSaving] = useState(false);

  const [showAddDivision, setShowAddDivision] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');
  const [newDivisionParticipants, setNewDivisionParticipants] = useState('');

  const [editingParticipantsId, setEditingParticipantsId] = useState<string | null>(null);
  const [participantsDraft, setParticipantsDraft] = useState('');

  const eliminationLabels = {
    bye: t('nominations.bracket.wizard.standaloneBye'),
    final: t('nominations.bracket.wizard.labelFinal'),
    semifinal: t('nominations.bracket.wizard.standaloneSemifinal'),
    quarterfinal: t('nominations.bracket.wizard.standaloneQuarterfinal'),
    roundOf: (n: number) => t('nominations.bracket.wizard.standaloneRoundOf', { n }),
  };

  const surfaceOptions = allSurfaces(bracket.rinks || []);

  const updateDivision = async (divisionId: string, update: (d: CombatDivision) => CombatDivision) => {
    setSaving(true);
    try {
      await onUpdateBracket({
        ...bracket,
        divisions: bracket.divisions.map(d => d.id === divisionId ? update(d) : d),
      });
    } catch (err) {
      console.error('CombatBracketSection: update failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const startEditResult = (matchId: string, match: CombatMatch) => {
    setEditingMatchKey(matchId);
    setPendingWinner(match.winner || null);
    setPendingMethod(match.method || 'decision');
  };

  const saveResult = async (division: CombatDivision, matchId: string) => {
    if (!pendingWinner) return;
    await updateDivision(division.id, d => ({
      ...d,
      matches: d.matches.map(m => {
        if (m.id !== matchId) return m;
        const updated: CombatMatch = { ...m, winner: pendingWinner, method: pendingMethod };
        delete updated.live; // finalizing ends the live status
        return updated;
      }),
    }));
    setEditingMatchKey(null);
  };

  const allCombatMatches = (): CombatMatch[] => bracket.divisions.flatMap(d => d.matches);

  const setMatchSurface = async (division: CombatDivision, matchId: string, surface: string) => {
    await updateDivision(division.id, d => ({
      ...d,
      matches: d.matches.map(m => {
        if (m.id !== matchId) return m;
        const updated: CombatMatch = { ...m };
        if (surface) updated.surface = surface;
        else delete updated.surface;
        return updated;
      }),
    }));
  };

  const toggleLive = async (division: CombatDivision, matchId: string, live: boolean) => {
    if (live) {
      const match = division.matches.find(m => m.id === matchId);
      if (match?.surface) {
        const conflicting = allCombatMatches().find(m => m.id !== matchId && m.live && m.surface === match.surface);
        if (conflicting && !confirm(t('nominations.bracket.confirmEarlyStart', { surface: match.surface }))) return;
      }
    }
    await updateDivision(division.id, d => ({
      ...d,
      matches: d.matches.map(m => {
        if (m.id !== matchId) return m;
        const updated: CombatMatch = { ...m };
        if (live) updated.live = true;
        else delete updated.live;
        return updated;
      }),
    }));
  };

  const bumpScore = async (division: CombatDivision, matchId: string, side: 'home' | 'away', delta: number) => {
    await updateDivision(division.id, d => ({
      ...d,
      matches: d.matches.map(m => {
        if (m.id !== matchId) return m;
        const next = Math.max(0, (side === 'home' ? m.homeScore : m.awayScore) || 0) + delta;
        return side === 'home' ? { ...m, homeScore: Math.max(0, next) } : { ...m, awayScore: Math.max(0, next) };
      }),
    }));
  };

  const clearResult = async (division: CombatDivision, matchId: string) => {
    await updateDivision(division.id, d => ({
      ...d,
      matches: d.matches.map(m => m.id === matchId ? { ...m, winner: undefined, method: undefined } : m),
    }));
    setEditingMatchKey(null);
  };

  const handleAddDivision = async () => {
    const name = newDivisionName.trim();
    const participants = parsePastedTeamNames(newDivisionParticipants);
    if (!name || participants.length < 2) return;
    setSaving(true);
    try {
      const newDivision: CombatDivision = {
        id: crypto.randomUUID(),
        name,
        participants,
        matches: buildCombatDivisionMatches(participants, eliminationLabels),
      };
      await onUpdateBracket({ ...bracket, divisions: [...bracket.divisions, newDivision] });
      setNewDivisionName('');
      setNewDivisionParticipants('');
      setShowAddDivision(false);
      setOpenDivisionId(newDivision.id);
    } catch (err) {
      console.error('CombatBracketSection: add division failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDivision = async (divisionId: string) => {
    if (!confirm(t('nominations.bracket.combatConfirmRemoveDivision'))) return;
    setSaving(true);
    try {
      await onUpdateBracket({ ...bracket, divisions: bracket.divisions.filter(d => d.id !== divisionId) });
    } catch (err) {
      console.error('CombatBracketSection: remove division failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const startEditParticipants = (division: CombatDivision) => {
    setEditingParticipantsId(division.id);
    setParticipantsDraft(division.participants.join('\n'));
  };

  const saveParticipants = async (division: CombatDivision) => {
    const participants = parsePastedTeamNames(participantsDraft);
    if (participants.length < 2) return;
    if (!confirm(t('nominations.bracket.combatConfirmRebracket'))) return;
    await updateDivision(division.id, d => ({
      ...d,
      participants,
      matches: buildCombatDivisionMatches(participants, eliminationLabels),
    }));
    setEditingParticipantsId(null);
  };

  const addRink = async (rink: TournamentRink) => {
    await onUpdateBracket({ ...bracket, rinks: [...(bracket.rinks || []), rink] });
  };
  const removeRink = async (rinkId: string) => {
    await onUpdateBracket({ ...bracket, rinks: (bracket.rinks || []).filter(r => r.id !== rinkId) });
  };

  const matchesByRound = (division: CombatDivision): CombatMatch[][] => {
    const rounds = Array.from(new Set(division.matches.map(m => m.round))).sort((a, b) => a - b);
    return rounds.map(round => division.matches.filter(m => m.round === round).sort((a, b) => a.matchNumber - b.matchNumber));
  };

  return (
    <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
      <div className="space-y-1.5">
        {bracket.divisions.map(division => {
          const isOpen = openDivisionId === division.id;
          const rounds = matchesByRound(division);
          const pendingCount = division.matches.filter(m => !m.winner).length;

          return (
            <div key={division.id} className="bg-app-secondary border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenDivisionId(isOpen ? null : division.id)}
                className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{division.name}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {t('nominations.bracket.combatParticipantsLabel', { count: division.participants.length })}
                    {pendingCount > 0 && ` · ${t('nominations.bracket.combatPendingMatches', { count: pendingCount })}`}
                  </div>
                </div>
                <span className="text-text-muted text-[10px] flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-white/5 p-2.5 space-y-3">
                  {rounds.map((roundMatches, ri) => (
                    <div key={ri} className="space-y-1.5">
                      {roundMatches[0] && (
                        <div className="text-[10px] font-semibold text-text-secondary uppercase">{roundMatches[0].label}</div>
                      )}
                      {roundMatches.map(m => {
                        const homeName = resolveCombatSlot(m.home, division.matches);
                        const awayName = resolveCombatSlot(m.away, division.matches);
                        const isEditing = editingMatchKey === m.id;
                        const isBye = m.method === 'walkover' && (homeName === eliminationLabels.bye || awayName === eliminationLabels.bye);

                        return (
                          <div key={m.id} className="bg-app-card border border-white/10 rounded-lg p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 text-xs">
                                <span className={m.winner === 'home' ? 'font-bold text-app-cyan' : 'text-text-primary'}>{homeName}</span>
                                <span className="text-text-muted mx-1">{t('nominations.bracket.combatVs')}</span>
                                <span className={m.winner === 'away' ? 'font-bold text-app-cyan' : 'text-text-primary'}>{awayName}</span>
                              </div>
                              {isStaff && !isBye && (
                                <button
                                  onClick={() => isEditing ? setEditingMatchKey(null) : startEditResult(m.id, m)}
                                  className="flex-shrink-0 text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
                                >
                                  {m.winner ? t('common.edit') : t('nominations.bracket.combatSetResult')}
                                </button>
                              )}
                            </div>

                            {m.winner && !isEditing && !isBye && (
                              <p className="text-[10px] text-text-muted mt-1">
                                {t(`nominations.bracket.combatMethods.${m.method}`)}
                              </p>
                            )}

                            {!m.winner && !isBye && (m.startTime || m.surface || m.live) && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {m.startTime && (
                                  <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-white/10 text-text-secondary tabular-nums">
                                    {m.startTime}
                                  </span>
                                )}
                                {m.surface && (
                                  <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-chart-cyan/20 text-chart-cyan">
                                    {m.surface}
                                  </span>
                                )}
                                {m.live && (
                                  <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-chart-pink/20 text-chart-pink animate-pulse">
                                    {t('nominations.bracket.live')}
                                  </span>
                                )}
                              </div>
                            )}

                            {isStaff && !isBye && !m.winner && (
                              <div className="flex items-center flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-white/5">
                                {surfaceOptions.length > 0 && (
                                  <select
                                    value={m.surface || ''}
                                    onChange={e => setMatchSurface(division, m.id, e.target.value)}
                                    className="px-1.5 py-0.5 text-[9px] bg-app-secondary border border-white/10 rounded text-text-primary"
                                  >
                                    <option value="">{t('nominations.bracket.noSurface')}</option>
                                    {surfaceOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                )}
                                <button
                                  onClick={() => toggleLive(division, m.id, true)}
                                  disabled={!!m.live}
                                  title={t('nominations.bracket.startedHint')}
                                  className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                                    m.live
                                      ? 'bg-chart-pink/20 text-chart-pink cursor-default'
                                      : 'bg-app-secondary border border-white/10 text-text-muted hover:text-chart-pink hover:border-chart-pink/40'
                                  }`}
                                >
                                  {t('nominations.bracket.started')}
                                </button>
                                <button
                                  onClick={() => toggleLive(division, m.id, false)}
                                  disabled={!m.live}
                                  title={t('nominations.bracket.endedHint')}
                                  className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                                    !m.live
                                      ? 'bg-white/10 text-text-secondary cursor-default'
                                      : 'bg-app-secondary border border-white/10 text-text-muted hover:text-text-primary hover:border-app-cyan/40'
                                  }`}
                                >
                                  {t('nominations.bracket.ended')}
                                </button>
                              </div>
                            )}

                            {m.live && (
                              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-white/5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-text-muted truncate max-w-[70px]">{homeName}</span>
                                  <button onClick={() => bumpScore(division, m.id, 'home', -1)} className="w-5 h-5 text-[10px] font-bold bg-app-secondary border border-white/10 rounded text-text-primary">−</button>
                                  <span className="w-4 text-center text-xs font-bold text-text-primary tabular-nums">{m.homeScore || 0}</span>
                                  <button onClick={() => bumpScore(division, m.id, 'home', 1)} className="w-5 h-5 text-[10px] font-bold bg-app-secondary border border-white/10 rounded text-text-primary">+</button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => bumpScore(division, m.id, 'away', -1)} className="w-5 h-5 text-[10px] font-bold bg-app-secondary border border-white/10 rounded text-text-primary">−</button>
                                  <span className="w-4 text-center text-xs font-bold text-text-primary tabular-nums">{m.awayScore || 0}</span>
                                  <button onClick={() => bumpScore(division, m.id, 'away', 1)} className="w-5 h-5 text-[10px] font-bold bg-app-secondary border border-white/10 rounded text-text-primary">+</button>
                                  <span className="text-[9px] text-text-muted truncate max-w-[70px]">{awayName}</span>
                                </div>
                              </div>
                            )}

                            {isEditing && (
                              <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5">
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => setPendingWinner('home')}
                                    className={`flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg border truncate ${
                                      pendingWinner === 'home' ? 'bg-app-cyan/20 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary'
                                    }`}
                                  >
                                    {homeName}
                                  </button>
                                  <button
                                    onClick={() => setPendingWinner('away')}
                                    className={`flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg border truncate ${
                                      pendingWinner === 'away' ? 'bg-app-cyan/20 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary'
                                    }`}
                                  >
                                    {awayName}
                                  </button>
                                </div>
                                <select
                                  value={pendingMethod}
                                  onChange={e => setPendingMethod(e.target.value as CombatMatchMethod)}
                                  className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                                >
                                  {METHODS.filter(m => m !== 'walkover').map(method => (
                                    <option key={method} value={method}>{t(`nominations.bracket.combatMethods.${method}`)}</option>
                                  ))}
                                </select>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => saveResult(division, m.id)}
                                    disabled={saving || !pendingWinner}
                                    className="flex-1 px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                                  >
                                    {t('common.save')}
                                  </button>
                                  {m.winner && (
                                    <button
                                      onClick={() => clearResult(division, m.id)}
                                      disabled={saving}
                                      className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-chart-pink rounded-lg"
                                    >
                                      {t('common.clear')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {isStaff && (
                    <div className="pt-1 border-t border-white/5 space-y-1.5">
                      {editingParticipantsId === division.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={participantsDraft}
                            onChange={e => setParticipantsDraft(e.target.value)}
                            rows={4}
                            className="w-full px-2.5 py-2 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary"
                          />
                          <p className="text-[9px] text-text-muted">{t('nominations.bracket.combatConfirmRebracket')}</p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveParticipants(division)}
                              className="px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg"
                            >
                              {t('common.save')}
                            </button>
                            <button
                              onClick={() => setEditingParticipantsId(null)}
                              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => startEditParticipants(division)}
                            className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
                          >
                            {t('nominations.bracket.combatEditParticipants')}
                          </button>
                          <button
                            onClick={() => handleRemoveDivision(division.id)}
                            className="text-[10px] text-text-muted hover:text-chart-pink"
                          >
                            {t('common.remove')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isStaff && (
        <div className="pt-1 border-t border-white/5">
          {showAddDivision ? (
            <div className="space-y-1.5">
              <input
                value={newDivisionName}
                onChange={e => setNewDivisionName(e.target.value)}
                placeholder={t('nominations.bracket.wizard.combatDivisionNamePlaceholder')}
                className="w-full px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
              <textarea
                value={newDivisionParticipants}
                onChange={e => setNewDivisionParticipants(e.target.value)}
                rows={3}
                placeholder={t('nominations.bracket.wizard.combatParticipantsPlaceholder')}
                className="w-full px-2.5 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleAddDivision}
                  disabled={saving || !newDivisionName.trim() || parsePastedTeamNames(newDivisionParticipants).length < 2}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
                <button
                  onClick={() => setShowAddDivision(false)}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddDivision(true)}
              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
            >
              + {t('nominations.bracket.wizard.combatAddDivision')}
            </button>
          )}
        </div>
      )}

      {isStaff && (
        <RinkManager rinks={bracket.rinks || []} sport={sport} onAdd={addRink} onRemove={removeRink} />
      )}
    </div>
  );
}
