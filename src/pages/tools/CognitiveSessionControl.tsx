/**
 * Cognitive Training — trainer's phone control view. Shows the timer, the
 * current task with its correct answer (no delay — unlike the TV's timed
 * reveal), and one big tap button per selected player to record who got it
 * right. See CLAUDE.md-level doc comments on CognitiveSession for the
 * overall design; only the creator (or club owner/admin) can control
 * playback or record results — see firestore.rules.
 *
 * Timing is computed purely from local clock math against session.startAt
 * (interval mode) or session.currentRoundStartAt (manual mode) — see
 * utils/cognitiveSessionPhases.ts — so this keeps ticking correctly
 * through a brief connectivity gap.
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToCognitiveSession,
  subscribeToCognitiveResults,
  startCognitiveSession,
  pauseCognitiveSession,
  resumeCognitiveSession,
  finishCognitiveSession,
  resetCognitiveSession,
  advanceCognitiveRound,
  recordCognitiveTaskResult,
  removeCognitiveTaskResult,
  fillDefaultTaskResults,
} from '../../services/firebase/cognitiveSessions';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import { resolveSessionPhase, resolveManualRoundPhase, formatClock, tasksPerRound, MANUAL_ROUND_TASK_BUFFER } from '../../utils/cognitiveSessionPhases';
import { getShareableOrigin } from '../../config/siteOrigin';
import type { CognitiveSession, CognitiveResultDoc, CognitiveTaskResult } from '../../types';

interface UndoEntry {
  athleteId: string;
  displayName: string;
  taskIndex: number;
  previousEntry?: CognitiveTaskResult;
}

export default function CognitiveSessionControl() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [session, setSession] = useState<CognitiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [results, setResults] = useState<Record<string, CognitiveResultDoc>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewTaskIndex, setReviewTaskIndex] = useState<number | null>(null);

  // Tap-grace bookkeeping — which task was active before this one, and when
  // the switch happened, so a tap shortly after still lands on the right task.
  const [previousTaskIndex, setPreviousTaskIndex] = useState<number | undefined>(undefined);
  const [taskChangedAt, setTaskChangedAt] = useState(0);
  const lastSeenTaskIndexRef = useRef<number | undefined>(undefined);
  const tappedForTaskRef = useRef<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeToCognitiveSession(sessionId, s => {
      setSession(s);
      setLoading(false);
    });
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeToCognitiveResults(sessionId, list => {
      setResults(Object.fromEntries(list.map(r => [r.athleteId, r])));
    });
    return unsub;
  }, [sessionId]);

  // Local tick — smooth countdown display, independent per device.
  useEffect(() => {
    if (!session || session.status !== 'running') return;
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, [session?.status]);

  const isCreator = user?.id === session?.createdBy;

  const live = session
    ? session.roundMode === 'manual'
      ? resolveManualRoundPhase(
          {
            roundSec: session.roundSec,
            taskDisplaySec: session.taskDisplaySec,
            countdownSec: session.countdownSec,
            answerRevealDelaySec: session.answerRevealDelaySec,
            answerRevealDurationSec: session.answerRevealDurationSec,
          },
          session,
          now
        )
      : resolveSessionPhase(
          {
            countdownSec: session.countdownSec,
            roundSec: session.roundSec,
            taskDisplaySec: session.taskDisplaySec,
            breakSec: session.breakSec,
            roundCount: session.roundCount,
            answerRevealDelaySec: session.answerRevealDelaySec,
            answerRevealDurationSec: session.answerRevealDurationSec,
          },
          session,
          now
        )
    : null;

  const phaseType = live ? (session!.roundMode === 'manual' ? (live as { phase: string }).phase : (live as { phase: { type: string } }).phase.type) : null;
  const liveTaskIndex = live?.taskIndex;
  const roundIndex = live
    ? session!.roundMode === 'manual'
      ? (live as { roundIndex?: number }).roundIndex
      : (live as { phase: { roundIndex?: number } }).phase.roundIndex
    : undefined;
  const clockSeconds = live
    ? session!.roundMode === 'manual'
      ? (live as { elapsedSec: number }).elapsedSec
      : (live as { remainingSec: number }).remainingSec
    : 0;

  // Fire-and-forget default-fill the moment the active task changes — only
  // the creator's own phone does this, to avoid duplicate fills if several
  // staff have the control page open at once.
  useEffect(() => {
    if (!session || !isCreator || liveTaskIndex === undefined) return;
    if (lastSeenTaskIndexRef.current === liveTaskIndex) return;
    const outgoingIndex = lastSeenTaskIndexRef.current;
    const outgoingTapped = tappedForTaskRef.current;
    lastSeenTaskIndexRef.current = liveTaskIndex;
    tappedForTaskRef.current = new Set();
    setPreviousTaskIndex(outgoingIndex);
    setTaskChangedAt(Date.now());

    if (outgoingIndex !== undefined) {
      const defaultCorrect = session.markingMode !== 'markCorrect';
      fillDefaultTaskResults(sessionId!, session.participants, outgoingIndex, outgoingTapped, defaultCorrect)
        .catch(err => console.error('CognitiveSessionControl: fillDefaultTaskResults failed', err));
    }
  }, [liveTaskIndex, session, isCreator, sessionId]);

  // Once finished, default the review pointer to the last task played.
  useEffect(() => {
    if (session?.status === 'finished' && reviewTaskIndex === null) {
      setReviewTaskIndex(lastSeenTaskIndexRef.current ?? 0);
    }
  }, [session?.status, reviewTaskIndex]);

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (!session || !sessionId || !live) {
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
  const tvUrl = `${getShareableOrigin()}/tv/cognitive/${sessionId}`;
  const isFinished = session.status === 'finished';
  const activeTaskIndex = isFinished ? reviewTaskIndex ?? 0 : liveTaskIndex;
  const currentTask = activeTaskIndex !== undefined ? session.plan[activeTaskIndex] : null;
  const tapValue = session.markingMode === 'markCorrect'; // tapping records this value; the default (untapped) is the opposite
  const perRound = session.roundMode === 'interval' ? tasksPerRound(session) : null;
  const taskIndexInRound = perRound && activeTaskIndex !== undefined ? activeTaskIndex % perRound : 0;

  // A round rotates through several tasks (interval mode) or is one
  // open-ended block (manual mode, segmented in MANUAL_ROUND_TASK_BUFFER
  // chunks) — the tap highlight stays lit across every task within the
  // current round so the trainer can see at a glance who's already been
  // tapped this round, and clears automatically once the round changes
  // (the new round's task indices never overlap the old one's).
  const roundTaskSize = session.roundMode === 'interval' ? perRound : MANUAL_ROUND_TASK_BUFFER;
  const roundStartIndex = roundTaskSize && activeTaskIndex !== undefined ? Math.floor(activeTaskIndex / roundTaskSize) * roundTaskSize : undefined;
  const roundEndIndexExclusive = roundStartIndex !== undefined && roundTaskSize ? roundStartIndex + roundTaskSize : undefined;

  const isHighlighted = (athleteId: string): boolean => {
    if (isFinished) {
      // Reviewing a finished session shows the exact task being reviewed, not a round aggregate.
      return results[athleteId]?.entries.find(e => e.taskIndex === activeTaskIndex)?.correct === tapValue;
    }
    if (roundStartIndex === undefined || roundEndIndexExclusive === undefined) return false;
    const entries = results[athleteId]?.entries || [];
    return entries.some(e => e.taskIndex >= roundStartIndex && e.taskIndex < roundEndIndexExclusive && e.correct === tapValue);
  };

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

  const handleTap = async (athleteId: string, displayName: string) => {
    if (!isCreator || currentTask === null) return;
    const graceMs = session.tapGraceSec * 1000;
    const useGrace = !isFinished && Date.now() - taskChangedAt < graceMs && previousTaskIndex !== undefined;
    const targetIndex = isFinished ? activeTaskIndex! : useGrace ? previousTaskIndex! : liveTaskIndex;
    if (targetIndex === undefined) return;

    const previousEntry = results[athleteId]?.entries.find(e => e.taskIndex === targetIndex);
    const isFlagged = previousEntry?.correct === tapValue;

    setUndoStack(prev => [...prev, { athleteId, displayName, taskIndex: targetIndex, previousEntry }].slice(-20));

    try {
      if (isFlagged) {
        await removeCognitiveTaskResult(sessionId, athleteId, targetIndex);
        tappedForTaskRef.current.delete(athleteId);
      } else {
        await recordCognitiveTaskResult(sessionId, athleteId, displayName, targetIndex, tapValue);
        if (!useGrace) tappedForTaskRef.current.add(athleteId);
      }
    } catch (err) {
      console.error('CognitiveSessionControl: tap failed', err);
    }
  };

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack(prev => prev.slice(0, -1));
    try {
      if (last.previousEntry) {
        await recordCognitiveTaskResult(sessionId, last.athleteId, last.displayName, last.taskIndex, last.previousEntry.correct);
      } else {
        await removeCognitiveTaskResult(sessionId, last.athleteId, last.taskIndex);
      }
    } catch (err) {
      console.error('CognitiveSessionControl: undo failed', err);
    }
  };

  const phaseLabel = () => {
    if (phaseType === 'countdown') return t('cognitiveTraining.phase.countdown');
    if (phaseType === 'break') return t('cognitiveTraining.phase.break');
    if (session.roundMode === 'manual') return t('cognitiveTraining.phase.manualRound', { index: (roundIndex ?? 0) + 1 });
    return t('cognitiveTraining.phase.interval', { index: (roundIndex ?? 0) + 1, total: session.roundCount });
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
          {!isFinished && (
            <>
              <p className="text-xs font-semibold text-text-muted uppercase">{phaseLabel()}</p>
              <p className="text-4xl font-black text-white">{formatClock(clockSeconds)}</p>
            </>
          )}
          {isFinished && <p className="text-lg font-black text-white">{t('cognitiveTraining.finished')}</p>}

          {isFinished && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                onClick={() => setReviewTaskIndex(i => Math.max(0, (i ?? 0) - 1))}
                disabled={(reviewTaskIndex ?? 0) <= 0}
                className="px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary disabled:opacity-30"
              >
                ←
              </button>
              <span className="text-[10px] text-text-muted">{t('cognitiveTraining.reviewingTask', { index: (reviewTaskIndex ?? 0) + 1 })}</span>
              <button
                onClick={() => setReviewTaskIndex(i => Math.min(session.plan.length - 1, (i ?? 0) + 1))}
                disabled={(reviewTaskIndex ?? 0) >= session.plan.length - 1}
                className="px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary disabled:opacity-30"
              >
                →
              </button>
            </div>
          )}

          {currentTask && game && (
            <div className="pt-2">
              {perRound && !isFinished && (
                <p className="text-[10px] text-text-muted mb-1">{t('cognitiveTraining.phase.task', { index: taskIndexInRound + 1, total: perRound })}</p>
              )}
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
                {session.roundMode === 'manual' && phaseType === 'round' && (
                  <button onClick={() => runAction(() => advanceCognitiveRound(sessionId))} disabled={actionLoading}
                    className="flex-1 px-4 py-2.5 bg-app-blue rounded-xl text-sm font-semibold text-white shadow-button disabled:opacity-50">
                    {t('cognitiveTraining.nextRound')}
                  </button>
                )}
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
            {isFinished && (
              <>
                <button onClick={() => runAction(() => resetCognitiveSession(sessionId))} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-primary disabled:opacity-50">
                  {t('cognitiveTraining.restart')}
                </button>
                <button
                  onClick={() => navigate(`/tools/cognitive-training/new?clubId=${session.clubId}&teamId=${session.teamId || ''}`)}
                  className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button"
                >
                  {t('cognitiveTraining.newSession')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Results — one big tap button per player */}
        {currentTask && session.participants.length > 0 && isCreator && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text-primary">{t('cognitiveTraining.results')}</h2>
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="text-[10px] font-semibold text-app-cyan disabled:opacity-30"
              >
                ↶ {t('cognitiveTraining.undo')}
              </button>
            </div>
            <p className="text-[10px] text-text-muted">
              {t(session.markingMode === 'markCorrect' ? 'cognitiveTraining.markingMode.markCorrectHint' : 'cognitiveTraining.markingMode.markIncorrectHint')}
            </p>
            <div className="space-y-1.5">
              {session.participants.map(p => {
                const isFlagged = isHighlighted(p.athleteId);
                return (
                  <button
                    key={p.athleteId}
                    onClick={() => handleTap(p.athleteId, p.displayName)}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-all ${
                      isFlagged
                        ? tapValue
                          ? 'bg-chart-cyan text-white'
                          : 'bg-chart-pink text-white'
                        : 'bg-app-secondary text-text-primary border border-white/10'
                    }`}
                  >
                    <span className="text-sm font-medium truncate">{p.displayName}{p.isGuest ? ` (${t('cognitiveTraining.guestLabel')})` : ''}</span>
                    <span className="flex-shrink-0 text-lg">{isFlagged ? (tapValue ? '✓' : '✗') : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
