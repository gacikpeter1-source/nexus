/**
 * Cognitive Training — trainer's phone control view. Shows the same
 * countdown + current task as the public TV (CognitiveSessionTV), plus the
 * correct answer and a per-athlete correct/incorrect tap to build up
 * results. Only the creator (or the club owner/admin) can control
 * playback — see firestore.rules.
 *
 * The countdown is computed purely from local clock math against
 * session.startAt (see utils/cognitiveSessionPhases.ts) — no further
 * communication is needed once the plan and startAt are known, so this
 * keeps ticking correctly through a brief connectivity gap.
 */

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToCognitiveSession,
  startCognitiveSession,
  pauseCognitiveSession,
  resumeCognitiveSession,
  finishCognitiveSession,
  resetCognitiveSession,
  recordCognitiveTaskResult,
} from '../../services/firebase/cognitiveSessions';
// Reused as-is — a generic club+team roster resolver (children replace
// their parent, same rule as AttendTab/StatsTab); nothing nomination-
// specific about what it returns (athleteId + displayName).
import { getNominationCandidates, type NominationCandidate } from '../../services/firebase/nominations';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import { resolveSessionPhase, formatClock, tasksPerInterval } from '../../utils/cognitiveSessionPhases';
import { getShareableOrigin } from '../../config/siteOrigin';
import type { CognitiveSession } from '../../types';

export default function CognitiveSessionControl() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [session, setSession] = useState<CognitiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [athletes, setAthletes] = useState<NominationCandidate[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeToCognitiveSession(sessionId, s => {
      setSession(s);
      setLoading(false);
    });
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    if (!session?.clubId || !session.teamId) return;
    getNominationCandidates(session.clubId, session.teamId)
      .then(setAthletes)
      .catch(err => console.error('CognitiveSessionControl: load athletes failed', err));
  }, [session?.clubId, session?.teamId]);

  // Local tick — smooth countdown display, independent per device.
  useEffect(() => {
    if (!session || session.status !== 'running') return;
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, [session?.status]);

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (!session || !sessionId) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('cognitiveTraining.notFound')}</h1>
          <Link to="/tools/cognitive-training" className="text-app-cyan hover:text-app-cyan/80">{t('cognitiveTraining.title')}</Link>
        </div>
      </Container>
    );
  }

  const game = getCognitiveGame(session.gameId);
  const isCreator = user?.id === session.createdBy;

  const live = resolveSessionPhase(
    { countdownSec: session.countdownSec, intervalSec: session.intervalSec, taskDisplaySec: session.taskDisplaySec, breakSec: session.breakSec, intervalCount: session.intervalCount },
    session,
    now
  );
  const currentTask = live.phase.type === 'interval' && live.taskIndex !== undefined ? session.plan[live.taskIndex] : null;
  const perInterval = tasksPerInterval(session);
  const taskIndexInInterval = live.taskIndex !== undefined ? live.taskIndex % perInterval : 0;
  const tvUrl = `${getShareableOrigin()}/tv/cognitive/${sessionId}`;

  const runAction = async (action: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await action();
    } catch (err) {
      console.error('CognitiveSessionControl: action failed', err);
    } finally {
      setActionLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const myResultForCurrentTask = (athleteId: string): boolean | null => {
    if (!currentTask) return null;
    const entry = session.results?.[athleteId]?.find(r => r.taskIndex === currentTask.taskIndex);
    return entry ? entry.correct : null;
  };

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary truncate">{game ? t(game.nameKey) : session.gameId}</h1>
          <Link to="/tools/cognitive-training" className="text-xs text-app-cyan hover:text-app-cyan/80 flex-shrink-0">← {t('cognitiveTraining.title')}</Link>
        </div>

        {/* TV link */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-3 space-y-2">
          <p className="text-[10px] text-text-muted">{t('cognitiveTraining.tvLinkHint')}</p>
          <div className="flex gap-2">
            <p className="flex-1 min-w-0 text-xs text-text-primary break-all font-mono bg-app-secondary rounded-lg px-2.5 py-2">{tvUrl}</p>
            <button onClick={copyLink} className="flex-shrink-0 px-3 py-2 text-xs font-semibold bg-white/5 border border-white/10 rounded-lg text-text-secondary">
              {copied ? t('common.copied') : t('common.copyLink')}
            </button>
          </div>
        </div>

        {/* Live state */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 text-center space-y-2">
          <p className="text-xs font-semibold text-text-muted uppercase">
            {live.phase.type === 'countdown' && t('cognitiveTraining.phase.countdown')}
            {live.phase.type === 'break' && t('cognitiveTraining.phase.break')}
            {live.phase.type === 'interval' && t('cognitiveTraining.phase.interval', { index: (live.phase.intervalIndex ?? 0) + 1, total: session.intervalCount })}
          </p>
          <p className="text-4xl font-black text-white">{formatClock(live.remainingSec)}</p>

          {currentTask && game && (
            <div className="pt-2">
              <p className="text-[10px] text-text-muted mb-1">{t('cognitiveTraining.phase.task', { index: taskIndexInInterval + 1, total: perInterval })}</p>
              <game.TaskViewTrainer content={currentTask.content} answer={currentTask.correctAnswer} />
            </div>
          )}
        </div>

        {/* Playback controls — creator only */}
        {isCreator && (
          <div className="flex gap-2">
            {session.status === 'idle' && (
              <button onClick={() => runAction(() => startCognitiveSession(sessionId))} disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button disabled:opacity-50">
                {t('cognitiveTraining.start')}
              </button>
            )}
            {session.status === 'running' && (
              <>
                <button onClick={() => runAction(() => pauseCognitiveSession(sessionId))} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-primary disabled:opacity-50">
                  {t('cognitiveTraining.pause')}
                </button>
                <button onClick={() => runAction(() => finishCognitiveSession(sessionId))} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-chart-pink/10 border border-chart-pink/30 text-chart-pink rounded-xl text-sm font-semibold disabled:opacity-50">
                  {t('cognitiveTraining.finish')}
                </button>
              </>
            )}
            {session.status === 'paused' && (
              <>
                <button onClick={() => runAction(() => resumeCognitiveSession(sessionId))} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button disabled:opacity-50">
                  {t('cognitiveTraining.resume')}
                </button>
                <button onClick={() => runAction(() => finishCognitiveSession(sessionId))} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-chart-pink/10 border border-chart-pink/30 text-chart-pink rounded-xl text-sm font-semibold disabled:opacity-50">
                  {t('cognitiveTraining.finish')}
                </button>
              </>
            )}
            {session.status === 'finished' && (
              <button onClick={() => runAction(() => resetCognitiveSession(sessionId))} disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-primary disabled:opacity-50">
                {t('cognitiveTraining.restart')}
              </button>
            )}
          </div>
        )}

        {/* Results — correct/incorrect per athlete for the current task */}
        {currentTask && athletes.length > 0 && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
            <h2 className="text-sm font-bold text-text-primary">{t('cognitiveTraining.results')}</h2>
            <div className="space-y-1.5">
              {athletes.map(a => {
                const mark = myResultForCurrentTask(a.athleteId);
                return (
                  <div key={a.athleteId} className="flex items-center justify-between gap-2 bg-app-secondary rounded-lg px-2.5 py-1.5">
                    <span className="text-xs font-medium text-text-primary truncate">{a.displayName}</span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => recordCognitiveTaskResult(sessionId, a.athleteId, currentTask.taskIndex, true)}
                        className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                          mark === true ? 'bg-chart-cyan text-white' : 'bg-chart-cyan/10 text-chart-cyan border border-chart-cyan/30 hover:bg-chart-cyan/20'
                        }`}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => recordCognitiveTaskResult(sessionId, a.athleteId, currentTask.taskIndex, false)}
                        className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                          mark === false ? 'bg-chart-pink text-white' : 'bg-chart-pink/10 text-chart-pink border border-chart-pink/30 hover:bg-chart-pink/20'
                        }`}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
