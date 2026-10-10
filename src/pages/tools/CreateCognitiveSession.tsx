/**
 * Create Cognitive Training session — pick a training style, who's playing,
 * how rounds advance, and how the trainer will mark answers, then straight
 * into the live control view (CognitiveSessionControl).
 */

import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  createCognitiveSession,
  createCognitiveTemplate,
  getClubCognitiveTemplates,
  deleteCognitiveTemplate,
} from '../../services/firebase/cognitiveSessions';
import { getNominationCandidates, type NominationCandidate } from '../../services/firebase/nominations';
import { listCognitiveGames } from '../../cognitiveTraining/registry';
import type { CognitiveParticipant, CognitiveGroup, CognitiveTemplate } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const games = listCognitiveGames();

// Preset choices for round/break duration — a free-typed number of seconds
// isn't how a trainer thinks about this mid-practice.
const ROUND_OPTIONS_SEC = [10, 15, 30, 60, 120, 180, 300];
const BREAK_OPTIONS_SEC = [3, 5, 10, 15, 30, 60, 120, 180, 300];
// How long a single task stays on screen before the next one — several of
// these rotate back-to-back within one round.
const TASK_DISPLAY_OPTIONS_SEC = [1, 2, 3, 5, 10, 15, 20, 30];
const REVEAL_DELAY_OPTIONS_SEC = [1, 2, 3, 5, 10, 15, 20];
const REVEAL_DURATION_OPTIONS_SEC = [1, 2, 3, 5, 10];
const TAP_GRACE_OPTIONS_SEC = [0, 1, 2, 3, 5];

function formatDuration(sec: number): string {
  return sec < 60 ? `${sec}s` : `${sec / 60} min`;
}

const ROUND_COUNT_PRESETS = [5, 10, 15, 20, 30, 50];
type RoundCountMode = number | 'custom' | 'unlimited';

// The plan is always fully pre-generated for 'interval' mode, so "no limit"
// just means a practically-infinite pool of rounds rather than an actually
// unbounded one — each round itself already contains several rotating tasks.
const UNLIMITED_ROUND_COUNT = 300;

// Compact <select> styling shared by every dropdown on this page, with a
// custom white chevron (the native one renders black regardless of text
// color in most browsers).
const SELECT_CLASS = 'w-full mt-0.5 pl-2 pr-6 py-1 text-xs bg-app-secondary border border-white/10 rounded-md text-text-primary appearance-none';
const SELECT_STYLE: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='white' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.4rem center',
  backgroundSize: '0.75em',
};

export default function CreateCognitiveSession() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || '';
  const teamId = searchParams.get('teamId') || '';

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [gameConfig, setGameConfig] = useState<Record<string, unknown>>(games[0]?.defaultConfig || {});

  // Players — team roster (checkboxes, default all present) + guests.
  const [roster, setRoster] = useState<NominationCandidate[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<{ id: string; name: string }[]>([]);
  const [newGuestName, setNewGuestName] = useState('');

  // Optional grouping of the players above (e.g. squad 1 vs squad 2) —
  // membership is exclusive (toggling a player into one group removes
  // them from any other), and pruned automatically if a player is later
  // unchecked or a guest removed.
  const [groups, setGroups] = useState<CognitiveGroup[]>([]);
  const [groupMode, setGroupMode] = useState<'simultaneous' | 'alternating'>('simultaneous');

  // Round mode + timing
  const [roundMode, setRoundMode] = useState<'interval' | 'manual'>('interval');
  const [roundSec, setRoundSec] = useState(60);
  const [breakSec, setBreakSec] = useState(3);
  const [roundCountMode, setRoundCountMode] = useState<RoundCountMode>(10);
  const [customRoundCount, setCustomRoundCount] = useState(10);
  const [taskDisplaySec, setTaskDisplaySec] = useState(3);
  const [answerRevealDelaySec, setAnswerRevealDelaySec] = useState(2);
  const [answerRevealDurationSec, setAnswerRevealDurationSec] = useState(0); // 0 = never reveal on TV
  const [countdownSec, setCountdownSec] = useState(3);

  // Marking + tap behavior
  const [markingMode, setMarkingMode] = useState<'markCorrect' | 'markIncorrect'>('markIncorrect');
  const [tapGraceSec, setTapGraceSec] = useState(2);

  const [creating, setCreating] = useState(false);

  // Lets the custom-count/countdown fields go visually blank while being
  // retyped instead of snapping to a digit mid-edit (clamping on every
  // keystroke made it impossible to clear "10" and type "45") — same
  // pattern as CreateTrainingTimer.tsx's number fields.
  const [customRoundCountBlank, setCustomRoundCountBlank] = useState(false);
  const [countdownBlank, setCountdownBlank] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<CognitiveTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const selectedGame = games.find(g => g.id === gameId);

  useEffect(() => {
    if (!clubId || !teamId) return;
    setRosterLoading(true);
    getNominationCandidates(clubId, teamId)
      .then(candidates => {
        setRoster(candidates);
        setPresentIds(new Set(candidates.map(c => c.athleteId)));
      })
      .catch(err => console.error('CreateCognitiveSession: load roster failed', err))
      .finally(() => setRosterLoading(false));
  }, [clubId, teamId]);

  useEffect(() => {
    if (!clubId) return;
    getClubCognitiveTemplates(clubId).then(setTemplates).catch(err => console.error('CreateCognitiveSession: load templates failed', err));
  }, [clubId]);

  if (!isStaff || !clubId || !teamId) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/tools/cognitive-training" className="text-app-cyan hover:text-app-cyan/80">{t('cognitiveTraining.title')}</Link>
        </div>
      </Container>
    );
  }

  const handleGameChange = (id: string) => {
    setGameId(id);
    const game = games.find(g => g.id === id);
    setGameConfig(game?.defaultConfig || {});
  };

  const handleRoundCountChange = (raw: string) => {
    if (raw === 'custom' || raw === 'unlimited') { setRoundCountMode(raw); return; }
    setRoundCountMode(Number(raw));
  };

  const resolvedRoundCount = roundCountMode === 'unlimited'
    ? UNLIMITED_ROUND_COUNT
    : roundCountMode === 'custom'
      ? Math.max(1, customRoundCount)
      : roundCountMode;

  const togglePresent = (athleteId: string) => {
    setPresentIds(prev => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId); else next.add(athleteId);
      return next;
    });
  };

  const addGuest = () => {
    const name = newGuestName.trim();
    if (!name) return;
    // A synthetic, non-reusable id — never matches a real user, so it's
    // never queryable against any other session (guests only ever exist
    // within this one), yet still lets guest results live in the results
    // subcollection the same way a real athlete's do.
    const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setGuests(prev => [...prev, { id, name }]);
    setNewGuestName('');
  };

  const removeGuest = (id: string) => {
    setGuests(prev => prev.filter(g => g.id !== id));
  };

  const buildParticipants = (): CognitiveParticipant[] => [
    ...roster.filter(c => presentIds.has(c.athleteId)).map(c => ({ athleteId: c.athleteId, displayName: c.displayName, isGuest: false })),
    ...guests.map(g => ({ athleteId: g.id, displayName: g.name, isGuest: true })),
  ];

  // Prune group membership whenever a player is unchecked or a guest removed.
  useEffect(() => {
    const validIds = new Set(buildParticipants().map(p => p.athleteId));
    setGroups(prev => prev.map(g => ({ ...g, athleteIds: g.athleteIds.filter(id => validIds.has(id)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentIds, guests]);

  const addGroup = () => {
    const id = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setGroups(prev => [...prev, { id, name: t('cognitiveTraining.groupDefaultName', { index: prev.length + 1 }), athleteIds: [] }]);
  };

  const removeGroup = (id: string) => setGroups(prev => prev.filter(g => g.id !== id));

  const renameGroup = (id: string, name: string) => setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));

  // Exclusive membership — adding a player to this group removes them from
  // every other one, since "alternating" only makes sense if a player is
  // ever in exactly one group at a time.
  const toggleGroupMember = (groupId: string, athleteId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const already = g.athleteIds.includes(athleteId);
        return { ...g, athleteIds: already ? g.athleteIds.filter(id => id !== athleteId) : [...g.athleteIds, athleteId] };
      }
      return { ...g, athleteIds: g.athleteIds.filter(id => id !== athleteId) };
    }));
  };

  const applyTemplate = (template: CognitiveTemplate) => {
    setGameId(template.gameId);
    setGameConfig(template.gameConfig);
    setRoundMode(template.roundMode);
    setRoundSec(template.roundSec);
    setBreakSec(template.breakSec);
    setRoundCountMode(template.roundCount);
    setTaskDisplaySec(template.taskDisplaySec);
    setAnswerRevealDelaySec(template.answerRevealDelaySec);
    setAnswerRevealDurationSec(template.answerRevealDurationSec);
    setCountdownSec(template.countdownSec);
    setMarkingMode(template.markingMode);
    setTapGraceSec(template.tapGraceSec);
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const template = templates.find(tpl => tpl.id === id);
    if (template) applyTemplate(template);
  };

  const handleSaveTemplate = async () => {
    if (!user || !selectedGame) return;
    const name = prompt(t('cognitiveTraining.templateNamePrompt'));
    if (!name || !name.trim()) return;
    try {
      await createCognitiveTemplate({
        clubId,
        name: name.trim(),
        createdBy: user.id,
        gameId: selectedGame.id,
        gameConfig,
        roundMode,
        roundSec,
        roundCount: resolvedRoundCount,
        breakSec,
        taskDisplaySec,
        answerRevealDelaySec,
        answerRevealDurationSec,
        countdownSec,
        markingMode,
        tapGraceSec,
      });
      setTemplates(await getClubCognitiveTemplates(clubId));
      alert(t('cognitiveTraining.templateSaved'));
    } catch (err) {
      console.error('CreateCognitiveSession: save template failed', err);
      alert(t('cognitiveTraining.templateSaveFailed'));
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm(t('cognitiveTraining.confirmDeleteTemplate'))) return;
    try {
      await deleteCognitiveTemplate(clubId, id);
      setTemplates(prev => prev.filter(tpl => tpl.id !== id));
      if (selectedTemplateId === id) setSelectedTemplateId('');
    } catch (err) {
      console.error('CreateCognitiveSession: delete template failed', err);
    }
  };

  const handleCreate = async () => {
    if (!user || !selectedGame) return;
    const allSelected = buildParticipants();
    if (allSelected.length === 0) {
      alert(t('cognitiveTraining.noPlayersError'));
      return;
    }
    const nonEmptyGroups = groups.filter(g => g.athleteIds.length > 0);
    // Once any group exists, being present isn't enough on its own — a
    // player not placed in a group is presumed not actually at this
    // training and is left out of the exercise entirely, same as
    // unchecking them from the roster.
    const groupedAthleteIds = new Set(nonEmptyGroups.flatMap(g => g.athleteIds));
    const participants = nonEmptyGroups.length > 0
      ? allSelected.filter(p => groupedAthleteIds.has(p.athleteId))
      : allSelected;
    if (participants.length === 0) {
      alert(t('cognitiveTraining.noGroupedPlayersError'));
      return;
    }
    setCreating(true);
    try {
      const id = await createCognitiveSession({
        clubId,
        teamId,
        createdBy: user.id,
        createdByName: user.displayName,
        gameId: selectedGame.id,
        gameConfig,
        participants,
        ...(nonEmptyGroups.length > 0 ? { groups: nonEmptyGroups, groupMode } : {}),
        roundMode,
        roundSec: roundMode === 'interval' ? roundSec : taskDisplaySec,
        roundCount: roundMode === 'interval' ? resolvedRoundCount : 1,
        breakSec: roundMode === 'interval' ? breakSec : 0,
        taskDisplaySec,
        answerRevealDelaySec,
        answerRevealDurationSec,
        countdownSec: Math.max(0, countdownSec),
        markingMode,
        tapGraceSec,
      });
      navigate(`/tools/cognitive-training/${id}`);
    } catch (err) {
      console.error('CreateCognitiveSession: create failed', err);
      alert(t('cognitiveTraining.createError'));
    } finally {
      setCreating(false);
    }
  };

  const tasksPerRoundHint = Math.max(1, Math.floor(Math.max(taskDisplaySec, roundSec) / Math.max(1, taskDisplaySec)));
  const presentCount = roster.filter(c => presentIds.has(c.athleteId)).length + guests.length;
  const nonEmptyGroupsCount = groups.filter(g => g.athleteIds.length > 0).length;
  const groupedAthleteIdsForHint = new Set(groups.flatMap(g => g.athleteIds));
  const excludedPresentPlayers = nonEmptyGroupsCount > 0 ? buildParticipants().filter(p => !groupedAthleteIdsForHint.has(p.athleteId)) : [];

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('cognitiveTraining.create')}</h1>
          <Link to="/tools/cognitive-training" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('cognitiveTraining.title')}</Link>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-3 sm:p-4 space-y-2">
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.loadTemplate')}</label>
            <div className="flex gap-1.5">
              <select
                value={selectedTemplateId}
                onChange={e => handleSelectTemplate(e.target.value)}
                className={SELECT_CLASS}
                style={SELECT_STYLE}
              >
                <option value="">{t('cognitiveTraining.noTemplateSelected')}</option>
                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </select>
              {selectedTemplateId && (
                <button
                  onClick={() => handleDeleteTemplate(selectedTemplateId)}
                  className="flex-shrink-0 px-2 text-[10px] text-text-muted hover:text-chart-pink"
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameLabel')}</label>
            <select
              value={gameId}
              onChange={e => handleGameChange(e.target.value)}
              className={SELECT_CLASS}
              style={SELECT_STYLE}
            >
              {games.map(g => (
                <option key={g.id} value={g.id}>{t(g.nameKey)}</option>
              ))}
            </select>
          </div>

          {selectedGame && (
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameConfigLabel')}</label>
              <div className="mt-1">
                <selectedGame.ConfigEditor value={gameConfig} onChange={setGameConfig} />
              </div>
            </div>
          )}

          {/* Players */}
          <div className="space-y-2">
            <label className="text-[10px] text-text-muted">
              {t('cognitiveTraining.playersLabel')} ({presentCount})
            </label>
            {rosterLoading ? (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {roster.map(c => (
                  <label key={c.athleteId} className="flex items-center gap-2 px-2 py-1.5 bg-app-secondary rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={presentIds.has(c.athleteId)}
                      onChange={() => togglePresent(c.athleteId)}
                      className="flex-shrink-0 accent-app-cyan"
                    />
                    <span className="text-xs text-text-primary truncate">{c.displayName}</span>
                  </label>
                ))}
                {guests.map(g => (
                  <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 bg-app-secondary rounded-lg">
                    <span className="flex-1 text-xs text-text-primary truncate">{g.name}</span>
                    <span className="flex-shrink-0 text-[9px] text-text-muted">{t('cognitiveTraining.guestLabel')}</span>
                    <button onClick={() => removeGuest(g.id)} className="flex-shrink-0 text-text-muted hover:text-chart-pink text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newGuestName}
                onChange={e => setNewGuestName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }}
                placeholder={t('cognitiveTraining.guestNamePlaceholder')}
                className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted"
              />
              <button
                onClick={addGuest}
                disabled={!newGuestName.trim()}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg disabled:opacity-40"
              >
                {t('cognitiveTraining.addGuest')}
              </button>
            </div>
          </div>

          {/* Groups — optional squad split, drawn from the players selected above */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.groupsLabel')}</label>
              <button onClick={addGroup} disabled={presentCount === 0} className="text-[10px] font-semibold text-app-cyan disabled:opacity-40">
                + {t('cognitiveTraining.addGroup')}
              </button>
            </div>
            {groups.length === 0 ? (
              <p className="text-[10px] text-text-muted italic">{t('cognitiveTraining.noGroupsHint')}</p>
            ) : (
              <>
                <div className="space-y-2">
                  {groups.map(g => (
                    <div key={g.id} className="bg-app-secondary border border-white/10 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={g.name}
                          onChange={e => renameGroup(g.id, e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-app-card border border-white/10 rounded-md text-text-primary"
                        />
                        <span className="flex-shrink-0 text-[10px] text-text-muted">{g.athleteIds.length}</span>
                        <button onClick={() => removeGroup(g.id)} className="flex-shrink-0 text-text-muted hover:text-chart-pink text-xs px-1">✕</button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {buildParticipants().map(p => {
                          const checked = g.athleteIds.includes(p.athleteId);
                          return (
                            <button
                              key={p.athleteId}
                              onClick={() => toggleGroupMember(g.id, p.athleteId)}
                              className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                                checked ? 'bg-app-cyan/15 border-app-cyan text-app-cyan' : 'bg-app-card border-white/10 text-text-secondary'
                              }`}
                            >
                              {p.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted">{t('cognitiveTraining.ungroupedHint')}</p>
                {excludedPresentPlayers.length > 0 && (
                  <p className="text-[10px] text-chart-orange">
                    {t('cognitiveTraining.ungroupedExcludedNames', { names: excludedPresentPlayers.map(p => p.displayName).join(', ') })}
                  </p>
                )}
              </>
            )}

            {groups.filter(g => g.athleteIds.length > 0).length >= 2 && (
              <div>
                <label className="text-[10px] text-text-muted">{t('cognitiveTraining.groupModeLabel')}</label>
                <div className="flex gap-2 mt-1">
                  {(['simultaneous', 'alternating'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setGroupMode(mode)}
                      className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                        groupMode === mode ? 'bg-app-blue text-white border-app-blue' : 'bg-app-secondary text-text-secondary border-white/10'
                      }`}
                    >
                      {t(`cognitiveTraining.groupMode.${mode}`)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted mt-1.5">{t(`cognitiveTraining.groupModeHint.${groupMode}`)}</p>
              </div>
            )}
          </div>

          {/* Round mode */}
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.roundModeLabel')}</label>
            <div className="flex gap-2 mt-1">
              {(['interval', 'manual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setRoundMode(mode)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                    roundMode === mode ? 'bg-app-blue text-white border-app-blue' : 'bg-app-secondary text-text-secondary border-white/10'
                  }`}
                >
                  {t(`cognitiveTraining.roundMode.${mode}`)}
                </button>
              ))}
            </div>
            {roundMode === 'manual' && (
              <p className="text-[10px] text-text-muted mt-1.5">{t('cognitiveTraining.manualModeHint')}</p>
            )}
          </div>

          {roundMode === 'interval' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted">{t('cognitiveTraining.roundLabel')}</label>
                  <select value={roundSec} onChange={e => setRoundSec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
                    {ROUND_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{formatDuration(sec)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">{t('cognitiveTraining.breakLabel')}</label>
                  <select value={breakSec} onChange={e => setBreakSec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
                    <option value={0}>{t('cognitiveTraining.noBreak')}</option>
                    {BREAK_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{formatDuration(sec)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-text-muted">{t('cognitiveTraining.roundCountLabel')}</label>
                <select
                  value={String(roundCountMode)}
                  onChange={e => handleRoundCountChange(e.target.value)}
                  className={SELECT_CLASS}
                  style={SELECT_STYLE}
                >
                  {ROUND_COUNT_PRESETS.map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="custom">{t('cognitiveTraining.customTaskCount')}</option>
                  <option value="unlimited">{t('cognitiveTraining.unlimitedTasks')}</option>
                </select>
                {roundCountMode === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={customRoundCountBlank ? '' : customRoundCount}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { setCustomRoundCountBlank(true); return; }
                      setCustomRoundCountBlank(false);
                      setCustomRoundCount(Math.max(1, Math.min(500, Number(raw) || 1)));
                    }}
                    onBlur={() => setCustomRoundCountBlank(false)}
                    className="w-full mt-1.5 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-md text-text-primary"
                  />
                )}
              </div>
            </>
          )}

          {/* Task timing (both round modes) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskDisplayLabel')}</label>
              <select value={taskDisplaySec} onChange={e => setTaskDisplaySec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
                {TASK_DISPLAY_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{formatDuration(sec)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.countdownLabel')}</label>
              <input
                type="number"
                min={0}
                max={10}
                value={countdownBlank ? '' : countdownSec}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { setCountdownBlank(true); return; }
                  setCountdownBlank(false);
                  setCountdownSec(Math.max(0, Math.min(10, Number(raw) || 0)));
                }}
                onBlur={() => setCountdownBlank(false)}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-md text-text-primary"
              />
            </div>
          </div>
          {roundMode === 'interval' && (
            <p className="text-[10px] text-text-muted -mt-2">
              {t('cognitiveTraining.tasksPerRoundHint', { count: tasksPerRoundHint })}
            </p>
          )}

          {/* Answer reveal on TV */}
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.answerRevealLabel')}</label>
            <div className="grid grid-cols-2 gap-2 mt-0.5">
              <select value={answerRevealDurationSec} onChange={e => setAnswerRevealDurationSec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
                <option value={0}>{t('cognitiveTraining.answerRevealNever')}</option>
                {REVEAL_DURATION_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{formatDuration(sec)}</option>)}
              </select>
              {answerRevealDurationSec > 0 && (
                <select value={answerRevealDelaySec} onChange={e => setAnswerRevealDelaySec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
                  {REVEAL_DELAY_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{t('cognitiveTraining.afterDuration', { duration: formatDuration(sec) })}</option>)}
                </select>
              )}
            </div>
            {answerRevealDurationSec > 0 && (
              <p className="text-[10px] text-text-muted mt-1">
                {t('cognitiveTraining.answerRevealHint', { delay: formatDuration(answerRevealDelaySec), duration: formatDuration(answerRevealDurationSec) })}
              </p>
            )}
          </div>

          {/* Marking mode */}
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.markingModeLabel')}</label>
            <div className="flex gap-2 mt-1">
              {(['markIncorrect', 'markCorrect'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setMarkingMode(mode)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                    markingMode === mode ? 'bg-app-blue text-white border-app-blue' : 'bg-app-secondary text-text-secondary border-white/10'
                  }`}
                >
                  {t(`cognitiveTraining.markingMode.${mode}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.tapGraceLabel')}</label>
            <select value={tapGraceSec} onChange={e => setTapGraceSec(Number(e.target.value))} className={SELECT_CLASS} style={SELECT_STYLE}>
              {TAP_GRACE_OPTIONS_SEC.map(sec => <option key={sec} value={sec}>{sec === 0 ? t('cognitiveTraining.noGrace') : formatDuration(sec)}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveTemplate}
              disabled={!selectedGame}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-app-secondary border border-white/10 text-text-primary rounded-lg disabled:opacity-50"
            >
              {t('cognitiveTraining.saveAsTemplate')}
            </button>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !selectedGame}
            className="w-full px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('cognitiveTraining.createButton')}
          </button>
        </div>
      </div>
    </Container>
  );
}
