/**
 * Training Timer — live synced view. Anyone who opens this URL sees the
 * same countdown (computed from the shared phaseStartedAt, see
 * utils/trainingTimerPhases.ts), but only the creator gets playback/config
 * controls. Any joined client (not just the creator) is responsible for
 * calling advanceTrainingTimerPhase once its own local clock says a phase
 * ran out — guarded server-side by a transaction, so it's safe even with
 * several viewers open at once.
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToTrainingTimer,
  startTrainingTimer,
  pauseTrainingTimer,
  resumeTrainingTimer,
  resetTrainingTimer,
  finishTrainingTimer,
  advanceTrainingTimerPhase,
  updateTrainingTimerConfig,
  joinTrainingTimer,
} from '../../services/firebase/trainingTimers';
import { buildPhases, computeLiveState, formatClock } from '../../utils/trainingTimerPhases';
import { unlockTrainingTimerAudio, playTrainingTimerWarning, playTrainingTimerAlarm } from '../../utils/trainingTimerAlarm';
import type { TrainingTimer, TrainingTimerMode } from '../../types';

export default function TrainingTimerView() {
  const { timerId } = useParams<{ timerId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [timer, setTimer] = useState<TrainingTimer | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [muted, setMuted] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEditConfig, setShowEditConfig] = useState(false);

  // Edit-config draft (idle + creator only)
  const [editMode, setEditMode] = useState<TrainingTimerMode>('intervals');
  const [editSets, setEditSets] = useState(4);
  const [editWorkMinutes, setEditWorkMinutes] = useState(13);
  const [editBreakMinutes, setEditBreakMinutes] = useState(1);
  const [editWarningMinutes, setEditWarningMinutes] = useState(2);
  const [editTitle, setEditTitle] = useState('');

  const lastAdvanceAttemptRef = useRef<number>(-1);
  const warnedPhaseIndexRef = useRef<number>(-1);
  const seenPhaseIndexRef = useRef<number>(-1);
  const seenStatusRef = useRef<TrainingTimer['status'] | null>(null);

  useEffect(() => {
    if (!timerId) return;
    const unsub = subscribeToTrainingTimer(timerId, tm => {
      setTimer(tm);
      setLoading(false);
      if (tm) {
        setEditMode(tm.mode);
        setEditSets(tm.sets);
        setEditWorkMinutes(tm.workMinutes);
        setEditBreakMinutes(tm.breakMinutes);
        setEditWarningMinutes(tm.warningMinutesBefore);
        setEditTitle(tm.title || '');
      }
    });
    return unsub;
  }, [timerId]);

  // Local tick — smooth countdown display, independent per device.
  useEffect(() => {
    if (!timer || timer.status !== 'running') return;
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, [timer?.status]);

  const live = timer ? computeLiveState(timer, now) : null;

  // Opening this page joins the session — this is the audience list the
  // Cloud Function pushes phase-change/warning notifications to, so a
  // trainer who's already left the app still gets alerted.
  useEffect(() => {
    if (!timer || !user || !timerId) return;
    if (timer.status === 'finished') return;
    if (timer.participantIds?.includes(user.id)) return;
    joinTrainingTimer(timerId, user.id).catch(err =>
      console.error('TrainingTimerView: join failed', err)
    );
  }, [timer?.id, timer?.status, timer?.participantIds, user?.id, timerId]);

  // Any joined client can advance a phase once it's actually run out —
  // guarded so it only fires once per phase (the transaction itself also
  // guards against duplicate/late calls from other devices).
  useEffect(() => {
    if (!timer || !live || !timerId) return;
    if (live.shouldAdvance && lastAdvanceAttemptRef.current !== live.phaseIndex) {
      lastAdvanceAttemptRef.current = live.phaseIndex;
      advanceTrainingTimerPhase(timerId, live.phaseIndex).catch(err =>
        console.error('TrainingTimerView: advance phase failed', err)
      );
    }
  }, [timer, live?.shouldAdvance, live?.phaseIndex, timerId]);

  // Alarm when Firestore's own phase/status actually changes — every
  // viewer hears it at the same server-confirmed moment, not each device
  // independently guessing from its own countdown.
  useEffect(() => {
    if (!timer) return;
    const phaseChanged = seenPhaseIndexRef.current !== -1 && seenPhaseIndexRef.current !== timer.currentPhaseIndex;
    const justFinished = seenStatusRef.current !== null && seenStatusRef.current !== 'finished' && timer.status === 'finished';
    if (!muted && (phaseChanged || justFinished)) playTrainingTimerAlarm();
    seenPhaseIndexRef.current = timer.currentPhaseIndex;
    seenStatusRef.current = timer.status;
  }, [timer?.currentPhaseIndex, timer?.status, muted]);

  // 2-minute (configurable) heads-up warning — a per-device threshold
  // crossing within the current phase, fired once per phase.
  useEffect(() => {
    if (!timer || !live || timer.status !== 'running' || live.phase.type !== 'work') return;
    const thresholdSec = timer.warningMinutesBefore * 60;
    if (thresholdSec > 0 && live.remainingSec <= thresholdSec && warnedPhaseIndexRef.current !== live.phaseIndex) {
      warnedPhaseIndexRef.current = live.phaseIndex;
      if (!muted) playTrainingTimerWarning();
    }
  }, [timer, live?.remainingSec, live?.phaseIndex, muted]);

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" /></div>
      </Container>
    );
  }

  if (!timer || !live) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('trainingTimer.notFound')}</h1>
          <Link to="/tools/training-timer" className="text-app-cyan hover:text-app-cyan/80">{t('trainingTimer.title')}</Link>
        </div>
      </Container>
    );
  }

  const isCreator = user?.id === timer.createdBy;
  const isStopwatch = timer.mode === 'stopwatch';

  const handleStart = async () => {
    unlockTrainingTimerAudio();
    setActionLoading(true);
    try { await startTrainingTimer(timer.id); } finally { setActionLoading(false); }
  };
  const handlePause = async () => {
    setActionLoading(true);
    try { await pauseTrainingTimer(timer.id); } finally { setActionLoading(false); }
  };
  const handleResume = async () => {
    unlockTrainingTimerAudio();
    setActionLoading(true);
    try { await resumeTrainingTimer(timer.id); } finally { setActionLoading(false); }
  };
  const handleReset = async () => {
    setActionLoading(true);
    try { await resetTrainingTimer(timer.id); } finally { setActionLoading(false); }
  };
  const handleFinish = async () => {
    setActionLoading(true);
    try { await finishTrainingTimer(timer.id); } finally { setActionLoading(false); }
  };
  const handleSaveConfig = async () => {
    setActionLoading(true);
    try {
      await updateTrainingTimerConfig(timer.id, {
        title: editTitle,
        mode: editMode,
        sets: editSets,
        workMinutes: editWorkMinutes,
        breakMinutes: editBreakMinutes,
        warningMinutesBefore: editWarningMinutes,
      });
      setShowEditConfig(false);
    } finally {
      setActionLoading(false);
    }
  };

  const phaseLabel = live.phase.type === 'stopwatch'
    ? t('trainingTimer.stopwatch')
    : live.phase.type === 'work'
    ? t('trainingTimer.setLabel', { current: live.phase.setNumber, total: timer.sets })
    : t('trainingTimer.breakLabel');

  const displaySeconds = isStopwatch ? live.elapsedSec : live.remainingSec;
  const phaseColor = live.phase.type === 'break' ? 'text-yellow-400' : 'text-app-cyan';

  return (
    <Container className="max-w-md py-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold text-text-primary truncate">
            {timer.title || t('trainingTimer.title')}
          </h1>
          <Link to="/tools/training-timer" className="text-xs text-app-cyan hover:text-app-cyan/80 flex-shrink-0">
            ← {t('trainingTimer.title')}
          </Link>
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-5 sm:p-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide ${phaseColor}`}>{phaseLabel}</span>
            <button onClick={() => setMuted(m => !m)} className="text-text-muted hover:text-text-primary text-sm" title={t('trainingTimer.mute')}>
              {muted ? '🔇' : '🔔'}
            </button>
          </div>

          <div className={`text-6xl sm:text-7xl font-bold tabular-nums ${phaseColor}`}>
            {isStopwatch ? formatClock(displaySeconds) : formatClock(displaySeconds)}
          </div>

          {!isStopwatch && (
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${live.phase.type === 'break' ? 'bg-yellow-400' : 'bg-app-cyan'}`}
                style={{ width: `${Math.min(100, (live.elapsedSec / live.phase.durationSec) * 100)}%` }}
              />
            </div>
          )}

          <p className="text-[10px] text-text-muted">
            {timer.status === 'idle' && t('trainingTimer.status.idle')}
            {timer.status === 'running' && t('trainingTimer.status.running')}
            {timer.status === 'paused' && t('trainingTimer.status.paused')}
            {timer.status === 'finished' && t('trainingTimer.finishedNote')}
          </p>

          {!isCreator && timer.status !== 'finished' && (
            <p className="text-[9px] text-text-muted">{t('trainingTimer.viewOnlyNote')}</p>
          )}

          {isCreator && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {timer.status === 'idle' && (
                <button onClick={handleStart} disabled={actionLoading} className="px-5 py-2 text-sm font-bold bg-gradient-primary text-white rounded-xl shadow-button disabled:opacity-50">
                  ▶ {t('trainingTimer.start')}
                </button>
              )}
              {timer.status === 'running' && (
                <>
                  <button onClick={handlePause} disabled={actionLoading} className="px-4 py-2 text-sm font-semibold bg-app-secondary border border-white/10 text-text-primary rounded-xl disabled:opacity-50">
                    ⏸ {t('trainingTimer.pause')}
                  </button>
                  <button onClick={handleFinish} disabled={actionLoading} className="px-4 py-2 text-sm font-semibold bg-chart-pink/10 border border-chart-pink/30 text-chart-pink rounded-xl disabled:opacity-50">
                    ⏹ {t('trainingTimer.end')}
                  </button>
                </>
              )}
              {timer.status === 'paused' && (
                <>
                  <button onClick={handleResume} disabled={actionLoading} className="px-4 py-2 text-sm font-bold bg-gradient-primary text-white rounded-xl shadow-button disabled:opacity-50">
                    ▶ {t('trainingTimer.resume')}
                  </button>
                  <button onClick={handleReset} disabled={actionLoading} className="px-4 py-2 text-sm font-semibold bg-app-secondary border border-white/10 text-text-primary rounded-xl disabled:opacity-50">
                    ↺ {t('trainingTimer.reset')}
                  </button>
                  <button onClick={handleFinish} disabled={actionLoading} className="px-4 py-2 text-sm font-semibold bg-chart-pink/10 border border-chart-pink/30 text-chart-pink rounded-xl disabled:opacity-50">
                    ⏹ {t('trainingTimer.end')}
                  </button>
                </>
              )}
              {timer.status === 'finished' && (
                <button onClick={handleReset} disabled={actionLoading} className="px-4 py-2 text-sm font-semibold bg-app-secondary border border-white/10 text-text-primary rounded-xl disabled:opacity-50">
                  ↺ {t('trainingTimer.restart')}
                </button>
              )}
            </div>
          )}
        </div>

        {!isStopwatch && (
          <div className="bg-app-card rounded-xl border border-white/10 p-3">
            <div className="flex flex-wrap gap-1.5">
              {buildPhases(timer).map((p, i) => (
                <span
                  key={i}
                  className={`px-2 py-1 text-[10px] font-semibold rounded ${
                    i === live.phaseIndex
                      ? (p.type === 'break' ? 'bg-yellow-400/20 text-yellow-400' : 'bg-app-cyan/20 text-app-cyan')
                      : i < live.phaseIndex
                      ? 'bg-white/5 text-text-muted line-through'
                      : 'bg-white/5 text-text-secondary'
                  }`}
                >
                  {p.type === 'work' ? t('trainingTimer.setChip', { n: p.setNumber }) : t('trainingTimer.breakChip')}
                </span>
              ))}
            </div>
          </div>
        )}

        {isCreator && timer.status === 'idle' && (
          <div className="bg-app-card rounded-xl border border-white/10 p-3 space-y-2">
            <button
              onClick={() => setShowEditConfig(v => !v)}
              className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
            >
              {showEditConfig ? '▲' : '▼'} {t('trainingTimer.editConfig')}
            </button>
            {showEditConfig && (
              <div className="space-y-2 pt-1">
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder={t('trainingTimer.titlePlaceholder')}
                  className="w-full px-2.5 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEditMode('intervals')}
                    className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border ${editMode === 'intervals' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary'}`}
                  >
                    {t('trainingTimer.intervals')}
                  </button>
                  <button
                    onClick={() => setEditMode('stopwatch')}
                    className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border ${editMode === 'stopwatch' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary'}`}
                  >
                    {t('trainingTimer.stopwatch')}
                  </button>
                </div>
                {editMode === 'intervals' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-text-muted">{t('trainingTimer.setsLabel')}</label>
                        <input type="number" min={1} max={20} value={editSets} onChange={e => setEditSets(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary" />
                      </div>
                      <div>
                        <label className="text-[9px] text-text-muted">{t('trainingTimer.workMinutesLabel')}</label>
                        <input type="number" min={1} max={120} value={editWorkMinutes} onChange={e => setEditWorkMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary" />
                      </div>
                      <div>
                        <label className="text-[9px] text-text-muted">{t('trainingTimer.breakMinutesLabel')}</label>
                        <input type="number" min={0} max={60} value={editBreakMinutes} onChange={e => setEditBreakMinutes(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-text-muted">{t('trainingTimer.warningMinutesLabel')}</label>
                      <input type="number" min={0} max={10} value={editWarningMinutes} onChange={e => setEditWarningMinutes(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary" />
                    </div>
                  </>
                )}
                <button
                  onClick={handleSaveConfig}
                  disabled={actionLoading}
                  className="w-full px-3 py-2 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
