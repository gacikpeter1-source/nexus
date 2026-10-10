/**
 * Cognitive Training — player/parent-facing stats. Unlike the trainer
 * page, this is open to any authenticated user (no staff gate) and only
 * ever shows the viewer's own results, or their linked children's — never
 * anyone else's, per the cognitiveSessions/results Firestore rules.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getCognitiveResultsForAthlete } from '../../services/firebase/cognitiveSessions';
import { getParentChildren } from '../../services/firebase/parentChild';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import type { CognitiveSession, CognitiveResultDoc } from '../../types';

interface Identity {
  id: string;
  displayName: string;
}

export default function MyCognitiveStats() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ session: CognitiveSession; result: CognitiveResultDoc }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const self: Identity = { id: user.id, displayName: user.displayName };
    const isParent = user.role === 'parent' || user.isParent === true;
    if (!isParent) {
      setIdentities([self]);
      setSelectedId(self.id);
      setLoading(false);
      return;
    }
    getParentChildren(user.id)
      .then(children => {
        const list = [self, ...children.map(c => ({ id: c.id, displayName: c.displayName || 'Unknown' }))];
        setIdentities(list);
        setSelectedId(list[list.length > 1 ? 1 : 0].id); // default to the first child if there is one
      })
      .catch(err => console.error('MyCognitiveStats: load children failed', err))
      .finally(() => setLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) return;
    setDataLoading(true);
    getCognitiveResultsForAthlete(selectedId)
      .then(setData)
      .catch(err => console.error('MyCognitiveStats: load results failed', err))
      .finally(() => setDataLoading(false));
  }, [selectedId]);

  if (!user) return null;

  const totalTasks = data.reduce((sum, d) => sum + d.result.entries.length, 0);
  const incorrect = data.reduce((sum, d) => sum + d.result.entries.filter(e => !e.correct).length, 0);
  const pct = totalTasks > 0 ? Math.round(((totalTasks - incorrect) / totalTasks) * 100) : 0;

  const sorted = [...data].sort((a, b) => {
    const aTime = typeof a.session.createdAt === 'string' ? new Date(a.session.createdAt).getTime() : a.session.createdAt.toMillis();
    const bTime = typeof b.session.createdAt === 'string' ? new Date(b.session.createdAt).getTime() : b.session.createdAt.toMillis();
    return bTime - aTime;
  });

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('cognitiveTraining.myStatsTitle')}</h1>
          <Link to="/" className="text-xs text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
          </div>
        ) : (
          <>
            {identities.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {identities.map(id => (
                  <button
                    key={id.id}
                    onClick={() => setSelectedId(id.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      selectedId === id.id ? 'bg-app-blue text-white border-app-blue' : 'bg-app-secondary text-text-secondary border-white/10'
                    }`}
                  >
                    {id.displayName}
                  </button>
                ))}
              </div>
            )}

            {dataLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
              </div>
            ) : data.length === 0 ? (
              <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center">
                <p className="text-sm text-text-muted">{t('cognitiveTraining.noStatsYet')}</p>
              </div>
            ) : (
              <>
                <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-black text-white">{data.length}</p>
                    <p className="text-[10px] text-text-muted">{t('cognitiveTraining.statsSessions')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{totalTasks}</p>
                    <p className="text-[10px] text-text-muted">{t('cognitiveTraining.statsTasks')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-chart-cyan">{pct}%</p>
                    <p className="text-[10px] text-text-muted">{t('cognitiveTraining.statsSuccess')}</p>
                  </div>
                </div>

                <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-1.5">
                  {sorted.map(({ session, result }) => {
                    const game = getCognitiveGame(session.gameId);
                    const date = typeof session.createdAt === 'string' ? new Date(session.createdAt) : session.createdAt.toDate();
                    const sessionIncorrect = result.entries.filter(e => !e.correct).length;
                    const sessionPct = result.entries.length > 0 ? Math.round(((result.entries.length - sessionIncorrect) / result.entries.length) * 100) : 0;
                    return (
                      <div key={session.id} className="flex items-center justify-between gap-2 px-2.5 py-2 bg-app-secondary rounded-lg">
                        <div className="min-w-0">
                          <p className="text-xs text-text-primary truncate">{game ? t(game.nameKey) : session.gameId}</p>
                          <p className="text-[10px] text-text-muted">{date.toLocaleDateString()} · {result.entries.length} {t('cognitiveTraining.statsTasks').toLowerCase()}</p>
                        </div>
                        <span className="flex-shrink-0 text-sm font-semibold text-chart-cyan">{sessionPct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Container>
  );
}
