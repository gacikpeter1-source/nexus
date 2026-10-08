/**
 * Create Cognitive Training session — pick a game + configure task/break
 * durations, then straight into the live control view
 * (CognitiveSessionControl).
 */

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createCognitiveSession } from '../../services/firebase/cognitiveSessions';
import { listCognitiveGames } from '../../cognitiveTraining/registry';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const games = listCognitiveGames();

// Preset choices for task/break duration — a free-typed number of seconds
// isn't how a trainer thinks about this mid-practice, so both dropdowns
// offer the same common intervals.
const DURATION_OPTIONS_SEC = [10, 30, 60, 120, 180, 300];

function formatDuration(sec: number): string {
  return sec < 60 ? `${sec}s` : `${sec / 60} min`;
}

// "Koľko stihne, toľko stihne" — no limit by default; a trainer who wants
// an exact count can still set one. 999 is just a practically-infinite
// pool so the plan-generation step (which always builds the full plan
// upfront) never runs out mid-session.
const UNLIMITED_TASK_COUNT = 999;

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
  const [taskDurationSec, setTaskDurationSec] = useState(30);
  const [breakDurationSec, setBreakDurationSec] = useState(10);
  const [unlimitedTasks, setUnlimitedTasks] = useState(false);
  const [taskCount, setTaskCount] = useState(10);
  const [countdownSec, setCountdownSec] = useState(3);
  const [creating, setCreating] = useState(false);

  // Lets the count/countdown fields go visually blank while being retyped
  // instead of snapping to a digit mid-edit (clamping on every keystroke
  // made it impossible to clear "10" and type "45") — same pattern as
  // CreateTrainingTimer.tsx's number fields.
  const [taskCountBlank, setTaskCountBlank] = useState(false);
  const [countdownBlank, setCountdownBlank] = useState(false);

  const selectedGame = games.find(g => g.id === gameId);

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

  const handleCreate = async () => {
    if (!user || !selectedGame) return;
    setCreating(true);
    try {
      const id = await createCognitiveSession({
        clubId,
        teamId,
        createdBy: user.id,
        createdByName: user.displayName,
        gameId: selectedGame.id,
        gameConfig,
        taskDurationSec,
        breakDurationSec,
        taskCount: unlimitedTasks ? UNLIMITED_TASK_COUNT : Math.max(1, taskCount),
        countdownSec: Math.max(0, countdownSec),
      });
      navigate(`/tools/cognitive-training/${id}`);
    } catch (err) {
      console.error('CreateCognitiveSession: create failed', err);
      alert(t('cognitiveTraining.createError'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('cognitiveTraining.create')}</h1>
          <Link to="/tools/cognitive-training" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('cognitiveTraining.title')}</Link>
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameLabel')}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {games.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleGameChange(g.id)}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                    gameId === g.id ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                  }`}
                >
                  {t(g.nameKey)}
                </button>
              ))}
            </div>
          </div>

          {selectedGame && (
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameConfigLabel')}</label>
              <div className="mt-1">
                <selectedGame.ConfigEditor value={gameConfig} onChange={setGameConfig} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskDurationLabel')}</label>
              <select
                value={taskDurationSec}
                onChange={e => setTaskDurationSec(Number(e.target.value))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              >
                {DURATION_OPTIONS_SEC.map(sec => (
                  <option key={sec} value={sec}>{formatDuration(sec)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.breakDurationLabel')}</label>
              <select
                value={breakDurationSec}
                onChange={e => setBreakDurationSec(Number(e.target.value))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              >
                <option value={0}>{t('cognitiveTraining.noBreak')}</option>
                {DURATION_OPTIONS_SEC.map(sec => (
                  <option key={sec} value={sec}>{formatDuration(sec)}</option>
                ))}
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
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            </div>
          </div>

          {/* Number of intervals (repetitions of the task/break cycle) — defaults to an exact count of 10; "no limit" is there for whoever wants it. */}
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskCountLabel')}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setUnlimitedTasks(true)}
                className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                  unlimitedTasks ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                }`}
              >
                {t('cognitiveTraining.unlimitedTasks')}
              </button>
              <button
                type="button"
                onClick={() => setUnlimitedTasks(false)}
                className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                  !unlimitedTasks ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                }`}
              >
                {t('cognitiveTraining.exactTaskCount')}
              </button>
            </div>
            {!unlimitedTasks && (
              <input
                type="number"
                min={1}
                max={200}
                value={taskCountBlank ? '' : taskCount}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { setTaskCountBlank(true); return; }
                  setTaskCountBlank(false);
                  setTaskCount(Math.max(1, Math.min(200, Number(raw) || 1)));
                }}
                onBlur={() => setTaskCountBlank(false)}
                className="w-full mt-2 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            )}
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
