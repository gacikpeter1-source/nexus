/**
 * Tournament bracket section: group standings + full match schedule
 * (group stage + playoffs), rendered on TournamentDetail.tsx.
 * Every team slot is editable free text for staff; auto-resolved
 * slots (group standing / match winner / match loser) can be
 * pinned to a fixed name and reset back to auto at any time.
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateNominationBracket, setNominationFavoriteTeam } from '../../services/firebase/nominations';
import { computeGroupStandings, resolveTeamRef, isOverridden, allTeams } from '../../utils/tournamentBracket';
import type { TournamentBracket, BracketMatch, BracketGroup } from '../../types';

interface Props {
  clubId: string;
  nominationId: string;
  bracket: TournamentBracket;
  isStaff: boolean;
  favoriteTeamName?: string; // persisted canonical pick (shared with every viewer + feeds Stats)
}

const favoriteTeamKey = (nominationId: string) => `nexus_favorite_team_${nominationId}`;

export default function TournamentBracketSection({ clubId, nominationId, bracket, isStaff, favoriteTeamName }: Props) {
  const { t } = useLanguage();

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [homeInput, setHomeInput] = useState('');
  const [awayInput, setAwayInput] = useState('');
  const [homeScoreInput, setHomeScoreInput] = useState('');
  const [awayScoreInput, setAwayScoreInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [favoriteTeam, setFavoriteTeam] = useState('');

  // Bracket structure builder (staff only) — add/remove groups and matches
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [matchGroupId, setMatchGroupId] = useState('');
  const [matchHome, setMatchHome] = useState('');
  const [matchAway, setMatchAway] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [matchLabelInput, setMatchLabelInput] = useState('');
  const [savingStructure, setSavingStructure] = useState(false);

  useEffect(() => {
    // The persisted, shared pick (set by staff) wins — falls back to this
    // viewer's own local pick when nobody has set one yet.
    if (favoriteTeamName) {
      setFavoriteTeam(favoriteTeamName);
      return;
    }
    try {
      setFavoriteTeam(localStorage.getItem(favoriteTeamKey(nominationId)) || '');
    } catch {
      // localStorage unavailable — filter just won't persist across visits
    }
  }, [nominationId, favoriteTeamName]);

  const handleFavoriteChange = (team: string) => {
    setFavoriteTeam(team);
    try {
      if (team) localStorage.setItem(favoriteTeamKey(nominationId), team);
      else localStorage.removeItem(favoriteTeamKey(nominationId));
    } catch {
      // localStorage unavailable — selection still works for this page view
    }
    // Staff picks are persisted so every viewer sees the same highlight and so
    // this tournament's games can be pulled into the team's Stats dashboards.
    if (isStaff) {
      setNominationFavoriteTeam(clubId, nominationId, team || null).catch(err =>
        console.error('TournamentBracketSection: failed to save favorite team', err)
      );
    }
  };

  const teams = allTeams(bracket);

  const groupName = (groupId?: string) => bracket.groups.find(g => g.id === groupId)?.name || '';

  const startEdit = (m: BracketMatch) => {
    setEditingMatchId(m.id);
    setHomeInput(resolveTeamRef(m.home, bracket));
    setAwayInput(resolveTeamRef(m.away, bracket));
    setHomeScoreInput(m.homeScore !== undefined ? String(m.homeScore) : '');
    setAwayScoreInput(m.awayScore !== undefined ? String(m.awayScore) : '');
  };

  const saveMatch = async (matchId: string) => {
    const match = bracket.matches.find(m => m.id === matchId);
    if (!match) return;

    setSaving(true);
    try {
      const newHomeName = homeInput.trim();
      const newAwayName = awayInput.trim();
      const homeScore = homeScoreInput === '' ? undefined : Number(homeScoreInput);
      const awayScore = awayScoreInput === '' ? undefined : Number(awayScoreInput);

      const updatedMatches = bracket.matches.map(m => {
        if (m.id !== matchId) return m;
        let home = m.home;
        let away = m.away;
        if (newHomeName && newHomeName !== resolveTeamRef(m.home, bracket)) {
          home = m.home.type === 'manual' ? { ...m.home, name: newHomeName } : { ...m.home, override: newHomeName };
        }
        if (newAwayName && newAwayName !== resolveTeamRef(m.away, bracket)) {
          away = m.away.type === 'manual' ? { ...m.away, name: newAwayName } : { ...m.away, override: newAwayName };
        }
        return {
          ...m,
          home,
          away,
          ...(homeScore === undefined || Number.isNaN(homeScore) ? {} : { homeScore }),
          ...(awayScore === undefined || Number.isNaN(awayScore) ? {} : { awayScore }),
        };
      });

      await updateNominationBracket(clubId, nominationId, { ...bracket, matches: updatedMatches });
      setEditingMatchId(null);
    } catch (err) {
      console.error('TournamentBracketSection: save failed', err);
      alert(t('nominations.errors.scoreSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetOverride = async (matchId: string, side: 'home' | 'away') => {
    const updatedMatches = bracket.matches.map(m => {
      if (m.id !== matchId) return m;
      const ref = { ...m[side] };
      delete ref.override;
      return { ...m, [side]: ref };
    });
    try {
      await updateNominationBracket(clubId, nominationId, { ...bracket, matches: updatedMatches });
    } catch (err) {
      console.error('TournamentBracketSection: reset override failed', err);
    }
  };

  // Every manual team name used anywhere in the bracket — offered as autocomplete
  // suggestions so staff don't retype (and typo) the same opponent name twice.
  const knownTeamNames = Array.from(new Set(
    bracket.matches
      .flatMap(m => [m.home, m.away])
      .filter(ref => ref.type === 'manual' && ref.name)
      .map(ref => ref.name as string)
  ));

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setSavingStructure(true);
    try {
      const newGroup: BracketGroup = { id: crypto.randomUUID(), name };
      await updateNominationBracket(clubId, nominationId, { ...bracket, groups: [...bracket.groups, newGroup] });
      setNewGroupName('');
      setShowAddGroup(false);
    } catch (err) {
      console.error('TournamentBracketSection: add group failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
    }
  };

  const removeGroup = async (groupId: string) => {
    if (bracket.matches.some(m => m.groupId === groupId)) {
      alert(t('nominations.errors.groupHasMatches'));
      return;
    }
    if (!confirm(t('nominations.bracket.confirmRemoveGroup'))) return;
    setSavingStructure(true);
    try {
      await updateNominationBracket(clubId, nominationId, { ...bracket, groups: bracket.groups.filter(g => g.id !== groupId) });
    } catch (err) {
      console.error('TournamentBracketSection: remove group failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
    }
  };

  const addMatch = async () => {
    const home = matchHome.trim();
    const away = matchAway.trim();
    if (!home || !away) return;
    setSavingStructure(true);
    try {
      const nextNumber = bracket.matches.length > 0 ? Math.max(...bracket.matches.map(m => m.matchNumber)) + 1 : 1;
      const newMatch: BracketMatch = {
        id: crypto.randomUUID(),
        matchNumber: nextNumber,
        ...(matchGroupId ? { groupId: matchGroupId } : {}),
        ...(matchLabelInput.trim() ? { label: matchLabelInput.trim() } : {}),
        ...(matchTime ? { startTime: matchTime } : {}),
        home: { type: 'manual', name: home },
        away: { type: 'manual', name: away },
      };
      await updateNominationBracket(clubId, nominationId, { ...bracket, matches: [...bracket.matches, newMatch] });
      setMatchHome('');
      setMatchAway('');
      setMatchTime('');
      setMatchLabelInput('');
      setMatchGroupId('');
      setShowAddMatch(false);
    } catch (err) {
      console.error('TournamentBracketSection: add match failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
    }
  };

  const removeMatch = async (matchId: string) => {
    if (!confirm(t('nominations.bracket.confirmRemoveMatch'))) return;
    try {
      await updateNominationBracket(clubId, nominationId, { ...bracket, matches: bracket.matches.filter(m => m.id !== matchId) });
    } catch (err) {
      console.error('TournamentBracketSection: remove match failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    }
  };

  const sortedMatches = [...bracket.matches].sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="space-y-4">
      {/* Favorite team filter — highlights matches (and standings row) for the selected team */}
      {teams.length > 0 && (
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-3 sm:p-4 flex items-center gap-2">
          <label className="text-xs font-semibold text-text-secondary whitespace-nowrap">{t('nominations.myTeam')}</label>
          <select
            value={favoriteTeam}
            onChange={e => handleFavoriteChange(e.target.value)}
            className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          >
            <option value="">{t('nominations.myTeamNone')}</option>
            {teams.map(team => <option key={team} value={team}>{team}</option>)}
          </select>
        </div>
      )}

      {/* Bracket builder (staff only) — add/remove groups and matches */}
      {isStaff && (
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-3 sm:p-4 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.manage')}</h2>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddGroup(v => !v)}
              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
            >
              + {t('nominations.bracket.addGroup')}
            </button>
            <button
              onClick={() => setShowAddMatch(v => !v)}
              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
            >
              + {t('nominations.bracket.addMatch')}
            </button>
          </div>

          {showAddGroup && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder={t('nominations.bracket.groupNamePlaceholder')}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
              <button
                onClick={addGroup}
                disabled={savingStructure || !newGroupName.trim()}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50 flex-shrink-0"
              >
                {t('common.save')}
              </button>
            </div>
          )}

          {bracket.groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {bracket.groups.map(g => (
                <span key={g.id} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-app-secondary border border-white/10 rounded-lg text-text-primary">
                  {t('nominations.group')} {g.name}
                  <button onClick={() => removeGroup(g.id)} className="text-text-muted hover:text-chart-pink">×</button>
                </span>
              ))}
            </div>
          )}

          {showAddMatch && (
            <div className="space-y-1.5 pt-1">
              <select
                value={matchGroupId}
                onChange={e => setMatchGroupId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              >
                <option value="">{t('nominations.bracket.noGroupPlayoff')}</option>
                {bracket.groups.map(g => <option key={g.id} value={g.id}>{t('nominations.group')} {g.name}</option>)}
              </select>
              <div className="flex items-center gap-1.5">
                <input
                  value={matchHome}
                  onChange={e => setMatchHome(e.target.value)}
                  list="bracket-team-names"
                  placeholder={t('nominations.bracket.homeTeam')}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <span className="text-text-muted text-xs flex-shrink-0">:</span>
                <input
                  value={matchAway}
                  onChange={e => setMatchAway(e.target.value)}
                  list="bracket-team-names"
                  placeholder={t('nominations.bracket.awayTeam')}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
              </div>
              <datalist id="bracket-team-names">
                {knownTeamNames.map(name => <option key={name} value={name} />)}
              </datalist>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={matchTime}
                  onChange={e => setMatchTime(e.target.value)}
                  className="px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
                />
                <input
                  value={matchLabelInput}
                  onChange={e => setMatchLabelInput(e.target.value)}
                  placeholder={t('nominations.bracket.matchLabelPlaceholder')}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
              </div>
              <button
                onClick={addMatch}
                disabled={savingStructure || !matchHome.trim() || !matchAway.trim()}
                className="w-full px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
              >
                {t('common.save')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Standings */}
      {bracket.groups.length > 0 && (
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-text-primary">{t('nominations.standings')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {bracket.groups.map(group => {
              const standings = computeGroupStandings(bracket, group.id);
              return (
                <div key={group.id} className="overflow-x-auto">
                  <h3 className="text-xs font-semibold text-app-cyan mb-1.5">{t('nominations.group')} {group.name}</h3>
                  <table className="w-full text-[10px] sm:text-xs">
                    <thead>
                      <tr className="text-text-muted">
                        <th className="text-left font-medium pb-1">{t('nominations.team')}</th>
                        <th className="w-6 pb-1">P</th>
                        <th className="w-6 pb-1">V</th>
                        <th className="w-6 pb-1">R</th>
                        <th className="w-6 pb-1">P</th>
                        <th className="w-8 pb-1">+/-</th>
                        <th className="w-6 pb-1">B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr
                          key={row.team}
                          className={
                            row.team === favoriteTeam
                              ? 'text-app-cyan font-bold bg-app-cyan/10'
                              : i === 0 ? 'text-text-primary font-semibold' : 'text-text-secondary'
                          }
                        >
                          <td className="truncate max-w-[100px]">{row.team}</td>
                          <td className="text-center">{row.played}</td>
                          <td className="text-center">{row.won}</td>
                          <td className="text-center">{row.drawn}</td>
                          <td className="text-center">{row.lost}</td>
                          <td className="text-center">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                          <td className="text-center font-bold">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule */}
      <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
        <h2 className="text-sm font-bold text-text-primary">{t('nominations.schedule')}</h2>
        <div className="space-y-1.5">
          {sortedMatches.map(m => {
            const home = resolveTeamRef(m.home, bracket);
            const away = resolveTeamRef(m.away, bracket);
            const isEditing = editingMatchId === m.id;
            const isFavoriteMatch = !!favoriteTeam && (home === favoriteTeam || away === favoriteTeam);

            return (
              <div
                key={m.id}
                className={`p-2 rounded-lg border ${
                  isFavoriteMatch
                    ? 'bg-app-cyan/10 border-app-cyan/40'
                    : 'bg-app-secondary border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-mono text-text-muted">#{m.matchNumber}</span>
                  {m.startTime && <span className="text-[9px] text-text-muted">{m.startTime}</span>}
                  {m.groupId && (
                    <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-chart-blue/20 text-chart-blue">
                      {groupName(m.groupId)}
                    </span>
                  )}
                  {m.label && (
                    <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-chart-purple/20 text-chart-purple">
                      {m.label}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    <input
                      value={homeInput}
                      onChange={e => setHomeInput(e.target.value)}
                      className="flex-1 min-w-[80px] px-1.5 py-1 text-xs bg-app-card border border-white/10 rounded text-text-primary"
                    />
                    <input
                      type="number"
                      value={homeScoreInput}
                      onChange={e => setHomeScoreInput(e.target.value)}
                      className="w-10 px-1 py-1 text-xs text-center bg-app-card border border-white/10 rounded text-text-primary"
                    />
                    <span className="text-text-muted text-xs">:</span>
                    <input
                      type="number"
                      value={awayScoreInput}
                      onChange={e => setAwayScoreInput(e.target.value)}
                      className="w-10 px-1 py-1 text-xs text-center bg-app-card border border-white/10 rounded text-text-primary"
                    />
                    <input
                      value={awayInput}
                      onChange={e => setAwayInput(e.target.value)}
                      className="flex-1 min-w-[80px] px-1.5 py-1 text-xs bg-app-card border border-white/10 rounded text-text-primary"
                    />
                    <button
                      onClick={() => saveMatch(m.id)}
                      disabled={saving}
                      className="px-2 py-1 text-[10px] font-semibold bg-gradient-primary text-white rounded disabled:opacity-50"
                    >
                      {t('common.save')}
                    </button>
                    <button
                      onClick={() => setEditingMatchId(null)}
                      className="px-2 py-1 text-[10px] bg-app-card border border-white/10 text-text-muted rounded"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`flex-1 min-w-0 truncate ${home === favoriteTeam ? 'text-app-cyan font-bold' : 'text-text-primary'}`}>
                      {home}
                      {isStaff && isOverridden(m.home) && (
                        <button onClick={() => resetOverride(m.id, 'home')} title={t('nominations.resetAuto')} className="ml-1 text-[9px] text-text-muted hover:text-app-cyan">↺</button>
                      )}
                    </span>
                    <span className="font-bold text-text-primary flex-shrink-0">
                      {m.homeScore !== undefined && m.awayScore !== undefined ? `${m.homeScore} : ${m.awayScore}` : '–'}
                    </span>
                    <span className={`flex-1 min-w-0 truncate text-right ${away === favoriteTeam ? 'text-app-cyan font-bold' : 'text-text-primary'}`}>
                      {isStaff && isOverridden(m.away) && (
                        <button onClick={() => resetOverride(m.id, 'away')} title={t('nominations.resetAuto')} className="mr-1 text-[9px] text-text-muted hover:text-app-cyan">↺</button>
                      )}
                      {away}
                    </span>
                    {isStaff && (
                      <>
                        <button
                          onClick={() => startEdit(m)}
                          className="flex-shrink-0 text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => removeMatch(m.id)}
                          className="flex-shrink-0 text-[10px] font-semibold text-text-muted hover:text-chart-pink"
                        >
                          {t('common.delete')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
