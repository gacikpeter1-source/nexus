/**
 * Public, unauthenticated TV page for a Cognitive Training session — meant
 * to run full-screen on a laptop/TV at practice. No login, no sidebar.
 *
 * Reads ONLY cognitiveSessionsPublic/{id} (see types/index.ts's
 * CognitiveSessionPublic doc comment) — never the correctAnswer-carrying
 * private document. The countdown is computed purely from local clock math
 * against startAt (see utils/cognitiveSessionPhases.ts), so this keeps
 * ticking correctly through a brief connectivity gap; it only needs a
 * live connection to notice a status change (start/pause/resume/finish).
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscribeToCognitiveSessionPublic } from '../../services/firebase/cognitiveSessions';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import { resolveSessionPhase, formatClock } from '../../utils/cognitiveSessionPhases';
import type { CognitiveSessionPublic } from '../../types';

export default function CognitiveSessionTV() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { t } = useLanguage();

  const [session, setSession] = useState<CognitiveSessionPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeToCognitiveSessionPublic(sessionId, s => {
      setSession(s);
      setLoading(false);
    });
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, []);

  // Keep the screen from sleeping while this page is open — best-effort,
  // silently does nothing on a browser without Wake Lock support, and is
  // re-requested on visibility change since the OS releases it whenever the
  // tab is backgrounded (e.g. the TV's browser chrome briefly takes focus).
  useEffect(() => {
    let released = false;
    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
        }
      } catch {
        // Not supported, or the page isn't visible yet — harmless to skip.
      }
    };
    requestLock();
    const onVisibilityChange = () => {
      if (!released && document.visibilityState === 'visible' && !wakeLockRef.current) requestLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const requestFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-app-cyan" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center">
        <p className="text-text-muted text-lg">{t('cognitiveTraining.notFound')}</p>
      </div>
    );
  }

  const game = getCognitiveGame(session.gameId);
  const fontScale = session.fontScale || 1;

  if (session.status === 'idle') {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center" onClick={requestFullscreen}>
        <p className="text-text-muted text-xl">{t('cognitiveTraining.waitingForStart')}</p>
      </div>
    );
  }

  const live = resolveSessionPhase(
    { countdownSec: session.countdownSec, intervalSec: session.intervalSec, taskDisplaySec: session.taskDisplaySec, breakSec: session.breakSec, intervalCount: session.intervalCount },
    session,
    now
  );

  if (live.finished || session.status === 'finished') {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center">
        <p className="text-white text-5xl font-black">{t('cognitiveTraining.finished')}</p>
      </div>
    );
  }

  const isBreak = live.phase.type === 'break';
  const isCountdown = live.phase.type === 'countdown';
  const currentTask = live.phase.type === 'interval' && live.taskIndex !== undefined
    ? session.tasks.find(task => task.taskIndex === live.taskIndex)
    : null;

  const bgClass = isBreak ? 'bg-chart-orange' : isCountdown ? 'bg-app-secondary' : 'bg-app-primary';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center gap-6 transition-colors duration-500 ${bgClass}`} onClick={requestFullscreen}>
      <div className="text-white font-black tabular-nums" style={{ fontSize: '10vh' }}>
        {formatClock(live.remainingSec)}
      </div>

      {isCountdown && (
        <div className="text-white font-black" style={{ fontSize: '30vh' }}>
          {Math.ceil(live.remainingSec)}
        </div>
      )}

      {isBreak && (
        <div className="text-white font-black" style={{ fontSize: '12vh' }}>
          {t('cognitiveTraining.phase.break')}
        </div>
      )}

      {currentTask && game && (
        <div style={{ transform: `scale(${fontScale})`, transformOrigin: 'center' }} className="flex items-center justify-center">
          <game.TaskViewTV content={currentTask.content} />
        </div>
      )}
    </div>
  );
}
