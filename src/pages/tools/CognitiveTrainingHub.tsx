/**
 * Cognitive Training hub — club/team-scoped list of sessions, reached from
 * Tools. See types/index.ts's CognitiveSession doc comment for how the
 * TV/phone sync works. Internal entry point — staff-only per club; the TV
 * page itself (CognitiveSessionTV) is the public, no-login one.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { subscribeToClubCognitiveSessions, deleteCognitiveSession } from '../../services/firebase/cognitiveSessions';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import type { Club, CognitiveSession } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

export default function CognitiveTrainingHub() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [sessions, setSessions] = useState<CognitiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isStaff) return;
    getUserClubs(user.id)
      .then(userClubs => {
        setClubs(userClubs);
        if (userClubs.length > 0) {
          setSelectedClubId(userClubs[0].id!);
          setSelectedTeamId(userClubs[0].teams?.[0]?.id || '');
        } else {
          setLoading(false);
        }
      })
      .catch(err => { console.error('CognitiveTrainingHub: load clubs failed', err); setLoading(false); });
  }, [user?.id, isStaff]);

  const selectedClub = clubs.find(c => c.id === selectedClubId);

  // Live, not a one-time fetch — a session another trainer just started
  // shows up here immediately, no reload needed.
  useEffect(() => {
    if (!selectedClubId) return;
    setLoading(true);
    const unsub = subscribeToClubCognitiveSessions(selectedClubId, list => {
      setSessions(list);
      setLoading(false);
    });
    return unsub;
  }, [selectedClubId]);

  const visibleSessions = selectedTeamId ? sessions.filter(s => s.teamId === selectedTeamId) : sessions;

  const statusOrder: Record<CognitiveSession['status'], number> = { running: 0, paused: 1, idle: 2, finished: 3 };
  const sortedSessions = [...visibleSessions].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('cognitiveTraining.confirmDelete'))) return;
    try {
      await deleteCognitiveSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('CognitiveTrainingHub: delete failed', err);
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

  const statusBadge = (status: CognitiveSession['status']) => {
    if (status === 'running') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-chart-cyan/20 text-chart-cyan animate-pulse">{t('cognitiveTraining.status.running')}</span>;
    if (status === 'paused') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-yellow-400/20 text-yellow-400">{t('cognitiveTraining.status.paused')}</span>;
    if (status === 'finished') return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-white/10 text-text-muted">{t('cognitiveTraining.status.finished')}</span>;
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-white/10 text-text-muted">{t('cognitiveTraining.status.idle')}</span>;
  };

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('cognitiveTraining.title')}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{t('cognitiveTraining.subtitle')}</p>
          </div>
          <Link to="/tools" className="text-xs text-app-cyan hover:text-app-cyan/80">
            ← {t('tools.title')}
          </Link>
        </div>

        <div className="flex gap-2 flex-wrap">
          {clubs.length > 1 && (
            <select
              value={selectedClubId}
              onChange={e => {
                setSelectedClubId(e.target.value);
                setSelectedTeamId(clubs.find(c => c.id === e.target.value)?.teams?.[0]?.id || '');
              }}
              className="px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {selectedClub && selectedClub.teams.length > 1 && (
            <select
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              className="px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              {selectedClub.teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          )}
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">{t('cognitiveTraining.activeSessions')}</h2>
            {selectedClubId && selectedTeamId && (
              <Link
                to={`/tools/cognitive-training/new?clubId=${selectedClubId}&teamId=${selectedTeamId}`}
                className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover transition-all"
              >
                + {t('cognitiveTraining.create')}
              </Link>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>
          ) : sortedSessions.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('cognitiveTraining.noSessions')}</p>
          ) : (
            <div className="space-y-1.5">
              {sortedSessions.map(s => {
                const game = getCognitiveGame(s.gameId);
                return (
                  <div key={s.id} className="flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg">
                    <Link to={`/tools/cognitive-training/${s.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {game ? t(game.nameKey) : s.gameId}
                        </span>
                        {statusBadge(s.status)}
                      </div>
                      <div className="text-[10px] text-text-muted truncate mt-0.5">
                        {t('cognitiveTraining.createdBy', { name: s.createdByName })}
                      </div>
                    </Link>
                    {user?.id === s.createdBy && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="flex-shrink-0 text-text-muted hover:text-chart-pink px-1.5 py-1 text-[10px]"
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
