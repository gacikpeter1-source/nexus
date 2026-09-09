/**
 * Training Timer hub — club-scoped list of synced interval/stopwatch
 * sessions any staff member (trainer/assistant/clubOwner) can join, reached
 * from Tools. See types/index.ts's TrainingTimer doc comment for how the
 * sync works. Internal tool — no public link, staff-only per club.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { getClubTrainingTimers, deleteTrainingTimer } from '../../services/firebase/trainingTimers';
import type { Club, TrainingTimer } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

export default function TrainingTimerHub() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [timers, setTimers] = useState<TrainingTimer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isStaff) return;
    getUserClubs(user.id)
      .then(userClubs => {
        setClubs(userClubs);
        if (userClubs.length > 0) setSelectedClubId(userClubs[0].id!);
        else setLoading(false);
      })
      .catch(err => { console.error('TrainingTimerHub: load clubs failed', err); setLoading(false); });
  }, [user?.id, isStaff]);

  useEffect(() => {
    if (!selectedClubId) return;
    setLoading(true);
    getClubTrainingTimers(selectedClubId)
      .then(setTimers)
      .catch(err => console.error('TrainingTimerHub: load timers failed', err))
      .finally(() => setLoading(false));
  }, [selectedClubId]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('trainingTimer.confirmDelete'))) return;
    try {
      await deleteTrainingTimer(id);
      setTimers(prev => prev.filter(tm => tm.id !== id));
    } catch (err) {
      console.error('TrainingTimerHub: delete failed', err);
    }
  };

  if (!isStaff) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/" className="text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>
      </Container>
    );
  }

  const statusBadge = (status: TrainingTimer['status']) => {
    if (status === 'running') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-chart-cyan/20 text-chart-cyan animate-pulse">{t('trainingTimer.status.running')}</span>;
    if (status === 'paused') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-yellow-400/20 text-yellow-400">{t('trainingTimer.status.paused')}</span>;
    if (status === 'finished') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-white/10 text-text-muted">{t('trainingTimer.status.finished')}</span>;
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-white/10 text-text-muted">{t('trainingTimer.status.idle')}</span>;
  };

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('trainingTimer.title')}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{t('trainingTimer.subtitle')}</p>
          </div>
          <Link to="/tools" className="text-xs text-app-cyan hover:text-app-cyan/80">
            ← {t('tools.title')}
          </Link>
        </div>

        {clubs.length > 1 && (
          <select
            value={selectedClubId}
            onChange={e => setSelectedClubId(e.target.value)}
            className="px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          >
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">{t('trainingTimer.activeSessions')}</h2>
            {selectedClubId && (
              <Link
                to={`/tools/training-timer/new?clubId=${selectedClubId}`}
                className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover transition-all"
              >
                + {t('trainingTimer.create')}
              </Link>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>
          ) : timers.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('trainingTimer.noSessions')}</p>
          ) : (
            <div className="space-y-1.5">
              {timers.map(tm => (
                <div key={tm.id} className="flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg">
                  <Link to={`/tools/training-timer/${tm.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {tm.title || (tm.mode === 'stopwatch' ? t('trainingTimer.stopwatch') : t('trainingTimer.intervalsLabel', { sets: tm.sets, minutes: tm.workMinutes }))}
                      </span>
                      {statusBadge(tm.status)}
                    </div>
                    <div className="text-[10px] text-text-muted truncate mt-0.5">
                      {t('trainingTimer.createdBy', { name: tm.createdByName })}
                    </div>
                  </Link>
                  {user?.id === tm.createdBy && (
                    <button
                      onClick={() => handleDelete(tm.id)}
                      className="flex-shrink-0 text-text-muted hover:text-chart-pink px-1.5 py-1 text-[10px]"
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
