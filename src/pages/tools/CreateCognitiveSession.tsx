/**
 * Create Cognitive Training session — pick a training style + configure
 * interval timing, then straight into the live control view
 * (CognitiveSessionControl).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createCognitiveSession } from '../../services/firebase/cognitiveSessions';
import { listCognitiveGames } from '../../cognitiveTraining/registry';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const games = listCognitiveGames();

// Preset choices for interval/break duration — a free-typed number of
// seconds isn't how a trainer thinks about this mid-practice.
const INTERVAL_OPTIONS_SEC = [10, 15, 30, 60, 120, 180, 300];
const BREAK_OPTIONS_SEC = [3, 5, 10, 15, 30, 60, 120, 180, 300];
// How long a single task stays on screen before the next one — several of
// these rotate back-to-back within one interval.
const TASK_DISPLAY_OPTIONS_SEC = [1, 2, 3, 5, 10, 15, 20, 30];

function formatDuration(sec: number): string {
  return sec < 60 ? `${sec}s` : `${sec / 60} min`;
}

const INTERVAL_COUNT_PRESETS = [5, 10, 15, 20, 30, 50];
type IntervalCountMode = number | 'custom' | 'unlimited';

// The plan is always fully pre-generated, so "no limit" just means a
// practically-infinite pool of intervals rather than an actually-unbounded
// one — each interval itself already contains several rotating tasks.
const UNLIMITED_INTERVAL_COUNT = 300;

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
  const [intervalSec, setIntervalSec] = useState(60);
  const [taskDisplaySec, setTaskDisplaySec] = useState(3);
  const [breakSec, setBreakSec] = useState(3);
  const [intervalCountMode, setIntervalCountMode] = useState<IntervalCountMode>(10);
  const [customIntervalCount, setCustomIntervalCount] = useState(10);
  const [countdownSec, setCountdownSec] = useState(3);
  const [creating, setCreating] = useState(false);

  // Lets the custom-count/countdown fields go visually blank while being
  // retyped instead of snapping to a digit mid-edit (clamping on every
  // keystroke made it impossible to clear "10" and type "45") — same
  // pattern as CreateTrainingTimer.tsx's number fields.
  const [customIntervalCountBlank, setCustomIntervalCountBlank] = useState(false);
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

  const handleIntervalCountChange = (raw: string) => {
    if (raw === 'custom' || raw === 'unlimited') { setIntervalCountMode(raw); return; }
    setIntervalCountMode(Number(raw));
  };

  const resolvedIntervalCount = intervalCountMode === 'unlimited'
    ? UNLIMITED_INTERVAL_COUNT
    : intervalCountMode === 'custom'
      ? Math.max(1, customIntervalCount)
      : intervalCountMode;

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
        intervalSec,
        taskDisplaySec,
        breakSec,
        intervalCount: resolvedIntervalCount,
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.intervalLabel')}</label>
              <select
                value={intervalSec}
                onChange={e => setIntervalSec(Number(e.target.value))}
                className={SELECT_CLASS}
                style={SELECT_STYLE}
              >
                {INTERVAL_OPTIONS_SEC.map(sec => (
                  <option key={sec} value={sec}>{formatDuration(sec)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskDisplayLabel')}</label>
              <select
                value={taskDisplaySec}
                onChange={e => setTaskDisplaySec(Number(e.target.value))}
                className={SELECT_CLASS}
                style={SELECT_STYLE}
              >
                {TASK_DISPLAY_OPTIONS_SEC.map(sec => (
                  <option key={sec} value={sec}>{formatDuration(sec)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.breakLabel')}</label>
              <select
                value={breakSec}
                onChange={e => setBreakSec(Number(e.target.value))}
                className={SELECT_CLASS}
                style={SELECT_STYLE}
              >
                <option value={0}>{t('cognitiveTraining.noBreak')}</option>
                {BREAK_OPTIONS_SEC.map(sec => (
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
                className="w-full mt-0.5 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-md text-text-primary"
              />
            </div>
          </div>
          <p className="text-[10px] text-text-muted -mt-2">
            {t('cognitiveTraining.tasksPerIntervalHint', { count: Math.max(1, Math.floor(Math.max(taskDisplaySec, intervalSec) / Math.max(1, taskDisplaySec))) })}
          </p>

          {/* Number of intervals (training cycles) */}
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.intervalCountLabel')}</label>
            <select
              value={String(intervalCountMode)}
              onChange={e => handleIntervalCountChange(e.target.value)}
              className={SELECT_CLASS}
              style={SELECT_STYLE}
            >
              {INTERVAL_COUNT_PRESETS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="custom">{t('cognitiveTraining.customTaskCount')}</option>
              <option value="unlimited">{t('cognitiveTraining.unlimitedTasks')}</option>
            </select>
            {intervalCountMode === 'custom' && (
              <input
                type="number"
                min={1}
                max={500}
                value={customIntervalCountBlank ? '' : customIntervalCount}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { setCustomIntervalCountBlank(true); return; }
                  setCustomIntervalCountBlank(false);
                  setCustomIntervalCount(Math.max(1, Math.min(500, Number(raw) || 1)));
                }}
                onBlur={() => setCustomIntervalCountBlank(false)}
                className="w-full mt-1.5 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-md text-text-primary"
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
