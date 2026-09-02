/**
 * Tournament bracket section: group standings + full match schedule
 * (group stage + playoffs), rendered on TournamentDetail.tsx.
 * Every team slot is editable free text for staff; auto-resolved
 * slots (group standing / match winner / match loser) can be
 * pinned to a fixed name and reset back to auto at any time.
 */

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateNominationBracket, setNominationFavoriteTeam } from '../../services/firebase/nominations';
import { computeGroupStandings, resolveTeamRef, isOverridden, allTeams, roundRobinPairs, allSurfaces } from '../../utils/tournamentBracket';
import { downloadTeamsTemplate, parseTeamsWorkbook } from '../../utils/tournamentExcel';
import type { TournamentBracket, BracketMatch, BracketGroup, BracketTeamRef, BracketTeamRefType, TournamentRink, RinkLayout } from '../../types';

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
  const [liveInput, setLiveInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favoriteTeam, setFavoriteTeam] = useState('');

  // Bracket structure builder (staff only) — add/remove groups and matches
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [matchGroupId, setMatchGroupId] = useState('');
  const [homeRef, setHomeRef] = useState<BracketTeamRef>({ type: 'manual', name: '' });
  const [awayRef, setAwayRef] = useState<BracketTeamRef>({ type: 'manual', name: '' });
  const [matchTime, setMatchTime] = useState('');
  const [matchLabelInput, setMatchLabelInput] = useState('');
  const [matchSurface, setMatchSurface] = useState('');
  const [savingStructure, setSavingStructure] = useState(false);

  // Rinks (staff only) — physical surfaces this tournament plays on
  const [showAddRink, setShowAddRink] = useState(false);
  const [newRinkName, setNewRinkName] = useState('');
  const [newRinkLayout, setNewRinkLayout] = useState<RinkLayout>('full');

  // Excel import — download a fill-in template, upload it back, preview before saving
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ newGroups: BracketGroup[]; newMatches: BracketMatch[] } | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

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
    setLiveInput(!!m.live);
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
        const updated: BracketMatch = {
          ...m,
          home,
          away,
          ...(homeScore === undefined || Number.isNaN(homeScore) ? {} : { homeScore }),
          ...(awayScore === undefined || Number.isNaN(awayScore) ? {} : { awayScore }),
        };
        // Never write `live: undefined` — Firestore rejects that — so drop
        // the key entirely rather than setting it false.
        if (liveInput) updated.live = true;
        else delete updated.live;
        return updated;
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

  const addRink = async () => {
    const name = newRinkName.trim();
    if (!name) return;
    setSavingStructure(true);
    try {
      const newRink: TournamentRink = { id: crypto.randomUUID(), name, layout: newRinkLayout };
      await updateNominationBracket(clubId, nominationId, { ...bracket, rinks: [...(bracket.rinks || []), newRink] });
      setNewRinkName('');
      setNewRinkLayout('full');
      setShowAddRink(false);
    } catch (err) {
      console.error('TournamentBracketSection: add rink failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
    }
  };

  const removeRink = async (rinkId: string) => {
    if (!confirm(t('nominations.bracket.confirmRemoveRink'))) return;
    setSavingStructure(true);
    try {
      await updateNominationBracket(clubId, nominationId, { ...bracket, rinks: (bracket.rinks || []).filter(r => r.id !== rinkId) });
    } catch (err) {
      console.error('TournamentBracketSection: remove rink failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
    }
  };

  const isRefValid = (ref: BracketTeamRef): boolean => {
    if (ref.type === 'manual') return !!ref.name?.trim();
    if (ref.type === 'groupStanding') return !!ref.group && !!ref.position;
    return !!ref.matchId; // matchWinner / matchLoser
  };

  const addMatch = async () => {
    if (!isRefValid(homeRef) || !isRefValid(awayRef)) return;
    setSavingStructure(true);
    try {
      const nextNumber = bracket.matches.length > 0 ? Math.max(...bracket.matches.map(m => m.matchNumber)) + 1 : 1;
      const newMatch: BracketMatch = {
        id: crypto.randomUUID(),
        matchNumber: nextNumber,
        ...(matchGroupId ? { groupId: matchGroupId } : {}),
        ...(matchLabelInput.trim() ? { label: matchLabelInput.trim() } : {}),
        ...(matchTime ? { startTime: matchTime } : {}),
        ...(matchSurface ? { surface: matchSurface } : {}),
        home: homeRef.type === 'manual' ? { type: 'manual', name: homeRef.name!.trim() } : homeRef,
        away: awayRef.type === 'manual' ? { type: 'manual', name: awayRef.name!.trim() } : awayRef,
      };
      await updateNominationBracket(clubId, nominationId, { ...bracket, matches: [...bracket.matches, newMatch] });
      setHomeRef({ type: 'manual', name: '' });
      setAwayRef({ type: 'manual', name: '' });
      setMatchTime('');
      setMatchLabelInput('');
      setMatchSurface('');
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

  const handleDownloadTemplate = () => {
    downloadTeamsTemplate({
      fileName: 'nexus_tournament_teams_template.xlsx',
      sheetName: t('nominations.bracket.excel.sheetTeams'),
      teamNameHeader: t('nominations.bracket.excel.colTeamName'),
      groupHeader: t('nominations.bracket.excel.colGroup'),
      exampleTeams: [
        ['HC Example A', 'A'],
        ['HC Example B', 'A'],
        ['HC Example C', 'B'],
        ['HC Example D', 'B'],
      ],
      instructionsSheetName: t('nominations.bracket.excel.sheetInstructions'),
      instructions: [
        t('nominations.bracket.excel.instr1'),
        t('nominations.bracket.excel.instr2'),
        t('nominations.bracket.excel.instr3'),
        t('nominations.bracket.excel.instr4'),
      ],
    }).catch(err => console.error('TournamentBracketSection: template download failed', err));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const rows = await parseTeamsWorkbook(file, t('nominations.bracket.excel.sheetTeams'));
      if (rows.length === 0) {
        alert(t('nominations.bracket.excel.noRows'));
        return;
      }

      const teamsByGroupName = new Map<string, string[]>();
      for (const row of rows) {
        const list = teamsByGroupName.get(row.group) || [];
        if (!list.includes(row.teamName)) list.push(row.teamName);
        teamsByGroupName.set(row.group, list);
      }

      const groupsByName = new Map(bracket.groups.map(g => [g.name, g]));
      const newGroups: BracketGroup[] = [];
      const newMatches: BracketMatch[] = [];
      let nextNumber = bracket.matches.length > 0 ? Math.max(...bracket.matches.map(m => m.matchNumber)) + 1 : 1;

      for (const [groupName, teamNames] of teamsByGroupName) {
        let group = groupsByName.get(groupName);
        if (!group) {
          group = { id: crypto.randomUUID(), name: groupName };
          groupsByName.set(groupName, group);
          newGroups.push(group);
        }

        // Skip pairs that already exist as a match in this group (either order) —
        // protects against accidentally re-importing the same file twice.
        const existingPairs = new Set(
          bracket.matches
            .filter(m => m.groupId === group!.id && m.home.type === 'manual' && m.away.type === 'manual')
            .map(m => [m.home.name, m.away.name].sort().join('__'))
        );

        for (const [a, b] of roundRobinPairs(teamNames)) {
          const key = [a, b].sort().join('__');
          if (existingPairs.has(key)) continue;
          newMatches.push({
            id: crypto.randomUUID(),
            matchNumber: nextNumber++,
            groupId: group.id,
            home: { type: 'manual', name: a },
            away: { type: 'manual', name: b },
          });
        }
      }

      setImportPreview({ newGroups, newMatches });
    } catch (err) {
      console.error('TournamentBracketSection: import parse failed', err);
      alert(t('nominations.bracket.excel.parseFailed'));
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setSavingStructure(true);
    try {
      await updateNominationBracket(clubId, nominationId, {
        groups: [...bracket.groups, ...importPreview.newGroups],
        matches: [...bracket.matches, ...importPreview.newMatches],
      });
      setImportPreview(null);
    } catch (err) {
      console.error('TournamentBracketSection: import save failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingStructure(false);
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
            <button
              onClick={handleDownloadTemplate}
              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg hover:border-app-cyan hover:text-app-cyan transition-colors"
            >
              {t('nominations.bracket.excel.downloadTemplate')}
            </button>
            <button
              onClick={() => excelFileInputRef.current?.click()}
              disabled={importing}
              className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg hover:border-app-cyan hover:text-app-cyan transition-colors disabled:opacity-50"
            >
              {importing ? t('common.loading') : t('nominations.bracket.excel.importButton')}
            </button>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelected}
              className="hidden"
            />
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

          {/* Rinks — physical surfaces this tournament plays on */}
          <div className="pt-1 border-t border-white/5">
            <div className="flex items-center justify-between pt-1.5">
              <h3 className="text-[10px] font-semibold text-text-secondary uppercase">{t('nominations.bracket.manageRinks')}</h3>
              <button
                onClick={() => setShowAddRink(v => !v)}
                className="px-2 py-1 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
              >
                + {t('nominations.bracket.addRink')}
              </button>
            </div>

            {showAddRink && (
              <div className="flex items-center gap-1.5 pt-1.5">
                <input
                  value={newRinkName}
                  onChange={e => setNewRinkName(e.target.value)}
                  placeholder={t('nominations.bracket.rinkNamePlaceholder')}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <select
                  value={newRinkLayout}
                  onChange={e => setNewRinkLayout(e.target.value as RinkLayout)}
                  className="px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
                >
                  <option value="full">{t('nominations.bracket.layouts.full')}</option>
                  <option value="halfCrossIce">{t('nominations.bracket.layouts.halfCrossIce')}</option>
                  <option value="thirdsCrossIce">{t('nominations.bracket.layouts.thirdsCrossIce')}</option>
                  <option value="halfLengthwise">{t('nominations.bracket.layouts.halfLengthwise')}</option>
                </select>
                <button
                  onClick={addRink}
                  disabled={savingStructure || !newRinkName.trim()}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50 flex-shrink-0"
                >
                  {t('common.save')}
                </button>
              </div>
            )}

            {(bracket.rinks || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {(bracket.rinks || []).map(r => (
                  <span key={r.id} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-app-secondary border border-white/10 rounded-lg text-text-primary">
                    {r.name} · {t(`nominations.bracket.layouts.${r.layout}`)}
                    <button onClick={() => removeRink(r.id)} className="text-text-muted hover:text-chart-pink">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

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
              <TeamRefPicker label={t('nominations.bracket.homeTeam')} value={homeRef} onChange={setHomeRef} bracket={bracket} />
              <TeamRefPicker label={t('nominations.bracket.awayTeam')} value={awayRef} onChange={setAwayRef} bracket={bracket} />
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
              {allSurfaces(bracket.rinks || []).length > 0 && (
                <select
                  value={matchSurface}
                  onChange={e => setMatchSurface(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                >
                  <option value="">{t('nominations.bracket.noSurface')}</option>
                  {allSurfaces(bracket.rinks || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button
                onClick={addMatch}
                disabled={savingStructure || !isRefValid(homeRef) || !isRefValid(awayRef)}
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
                    <label className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-text-secondary whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={liveInput}
                        onChange={e => setLiveInput(e.target.checked)}
                      />
                      {t('nominations.bracket.live')}
                    </label>
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

      {/* Excel import preview — confirm before writing new groups/matches */}
      {importPreview && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setImportPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-5 max-h-[80vh] overflow-y-auto">
              <h2 className="text-base font-bold text-text-primary mb-1">{t('nominations.bracket.excel.previewTitle')}</h2>
              <p className="text-xs text-text-secondary mb-3">
                {t('nominations.bracket.excel.previewSummary', {
                  groups: importPreview.newGroups.length,
                  matches: importPreview.newMatches.length,
                })}
              </p>
              <div className="space-y-1.5 mb-4">
                {importPreview.newMatches.map(m => (
                  <div key={m.id} className="text-xs text-text-primary bg-app-secondary rounded-lg px-2 py-1.5">
                    <span className="text-app-cyan font-semibold">
                      {[...bracket.groups, ...importPreview.newGroups].find(g => g.id === m.groupId)?.name}
                    </span>
                    {' · '}
                    {m.home.type === 'manual' ? m.home.name : ''} – {m.away.type === 'manual' ? m.away.name : ''}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  disabled={savingStructure}
                  className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmImport}
                  disabled={savingStructure}
                  className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
                >
                  {savingStructure ? t('common.saving') : t('nominations.bracket.excel.confirmImport')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── team-slot picker (used in the Add Match form) ───────────────────────────
// Lets staff choose what a match's home/away slot actually IS: a typed name,
// a group's Nth-place finisher, or the winner/loser of an earlier match —
// the latter two then resolve themselves automatically as results come in.
function TeamRefPicker({
  label, value, onChange, bracket,
}: {
  label: string;
  value: BracketTeamRef;
  onChange: (ref: BracketTeamRef) => void;
  bracket: TournamentBracket;
}) {
  const { t } = useLanguage();

  const changeType = (newType: BracketTeamRefType) => {
    if (newType === 'manual') onChange({ type: 'manual', name: '' });
    else if (newType === 'groupStanding') onChange({ type: 'groupStanding', group: bracket.groups[0]?.id, position: 1 });
    else onChange({ type: newType, matchId: bracket.matches[0]?.id });
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value.type}
        onChange={e => changeType(e.target.value as BracketTeamRefType)}
        className="px-1.5 py-1.5 text-[10px] bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
      >
        <option value="manual">{t('nominations.bracket.slotManual')}</option>
        {bracket.groups.length > 0 && <option value="groupStanding">{t('nominations.bracket.slotGroupStanding')}</option>}
        {bracket.matches.length > 0 && <option value="matchWinner">{t('nominations.bracket.slotMatchWinner')}</option>}
        {bracket.matches.length > 0 && <option value="matchLoser">{t('nominations.bracket.slotMatchLoser')}</option>}
      </select>

      {value.type === 'manual' && (
        <input
          value={value.name || ''}
          onChange={e => onChange({ type: 'manual', name: e.target.value })}
          list="bracket-team-names"
          placeholder={label}
          className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
        />
      )}

      {value.type === 'groupStanding' && (
        <>
          <select
            value={value.group || ''}
            onChange={e => onChange({ ...value, group: e.target.value })}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
          >
            {bracket.groups.map(g => <option key={g.id} value={g.id}>{t('nominations.group')} {g.name}</option>)}
          </select>
          <select
            value={value.position || 1}
            onChange={e => onChange({ ...value, position: Number(e.target.value) })}
            className="px-1.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(p => <option key={p} value={p}>{p}.</option>)}
          </select>
        </>
      )}

      {(value.type === 'matchWinner' || value.type === 'matchLoser') && (
        <select
          value={value.matchId || ''}
          onChange={e => onChange({ ...value, matchId: e.target.value })}
          className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
        >
          {bracket.matches.map(m => (
            <option key={m.id} value={m.id}>
              #{m.matchNumber} {resolveTeamRef(m.home, bracket)} – {resolveTeamRef(m.away, bracket)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
