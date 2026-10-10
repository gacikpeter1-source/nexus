/**
 * Cognitive Training — trainer-facing stats. Aggregates every session's
 * results subcollection for a club/team into a per-player summary (tasks,
 * incorrect, % success) — the detail (which task, which answer) is already
 * fully preserved in each session's plan + results, this just summarizes it.
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getClubCognitiveStats } from '../../services/firebase/cognitiveSessions';
import { getCognitiveGame } from '../../cognitiveTraining/registry';
import type { CognitiveSession, CognitiveResultDoc } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

interface AthleteSummary {
  athleteId: string;
  displayName: string;
  isGuest: boolean;
  sessionsPlayed: number;
  totalTasks: number;
  incorrect: number;
}

export default function CognitiveStatsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || '';
  const teamId = searchParams.get('teamId') || '';

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ session: CognitiveSession; results: CognitiveResultDoc[] }[]>([]);

  useEffect(() => {
    if (!clubId) return;
    setLoading(true);
    getClubCognitiveStats(clubId, teamId || undefined)
      .then(setData)
      .catch(err => console.error('CognitiveStatsPage: load failed', err))
      .finally(() => setLoading(false));
  }, [clubId, teamId]);

  if (!isStaff || !clubId) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/tools/cognitive-training" className="text-app-cyan hover:text-app-cyan/80">{t('cognitiveTraining.title')}</Link>
        </div>
      </Container>
    );
  }

  const summaries = new Map<string, AthleteSummary>();
  for (const { results } of data) {
    for (const r of results) {
      const existing = summaries.get(r.athleteId) || {
        athleteId: r.athleteId,
        displayName: r.displayName,
        isGuest: r.athleteId.startsWith('guest_'),
        sessionsPlayed: 0,
        totalTasks: 0,
        incorrect: 0,
      };
      existing.sessionsPlayed += 1;
      existing.totalTasks += r.entries.length;
      existing.incorrect += r.entries.filter(e => !e.correct).length;
      summaries.set(r.athleteId, existing);
    }
  }
  const sortedSummaries = Array.from(summaries.values()).sort((a, b) => {
    const pctA = a.totalTasks > 0 ? (a.totalTasks - a.incorrect) / a.totalTasks : 0;
    const pctB = b.totalTasks > 0 ? (b.totalTasks - b.incorrect) / b.totalTasks : 0;
    return pctB - pctA;
  });

  const sessionsWithResults = data.filter(d => d.results.length > 0).sort((a, b) => {
    const aTime = typeof a.session.createdAt === 'string' ? new Date(a.session.createdAt).getTime() : a.session.createdAt.toMillis();
    const bTime = typeof b.session.createdAt === 'string' ? new Date(b.session.createdAt).getTime() : b.session.createdAt.toMillis();
    return bTime - aTime;
  });

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-text-primary">{t('cognitiveTraining.statsTitle')}</h1>
          <Link to="/tools/cognitive-training" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('cognitiveTraining.title')}</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
          </div>
        ) : sortedSummaries.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center">
            <p className="text-sm text-text-muted">{t('cognitiveTraining.noStatsYet')}</p>
          </div>
        ) : (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-white/10">
                  <th className="py-2 pr-2 font-semibold">{t('cognitiveTraining.statsPlayer')}</th>
                  <th className="py-2 px-2 font-semibold text-right">{t('cognitiveTraining.statsSessions')}</th>
                  <th className="py-2 px-2 font-semibold text-right">{t('cognitiveTraining.statsTasks')}</th>
                  <th className="py-2 px-2 font-semibold text-right">{t('cognitiveTraining.statsIncorrect')}</th>
                  <th className="py-2 pl-2 font-semibold text-right">{t('cognitiveTraining.statsSuccess')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummaries.map(s => {
                  const pct = s.totalTasks > 0 ? Math.round(((s.totalTasks - s.incorrect) / s.totalTasks) * 100) : 0;
                  return (
                    <tr key={s.athleteId} className="border-b border-white/5 last:border-0">
                      <td className="py-2 pr-2 text-text-primary font-medium truncate max-w-[120px]">
                        {s.displayName}
                        {s.isGuest && <span className="ml-1 text-[9px] text-text-muted">({t('cognitiveTraining.guestLabel')})</span>}
                      </td>
                      <td className="py-2 px-2 text-text-secondary text-right">{s.sessionsPlayed}</td>
                      <td className="py-2 px-2 text-text-secondary text-right">{s.totalTasks}</td>
                      <td className="py-2 px-2 text-chart-pink text-right">{s.incorrect}</td>
                      <td className="py-2 pl-2 text-right font-semibold text-chart-cyan">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sessionsWithResults.length > 0 && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-1.5">
            <h2 className="text-sm font-bold text-text-primary mb-1">{t('cognitiveTraining.statsSessionsList')}</h2>
            {sessionsWithResults.map(({ session, results }) => {
              const game = getCognitiveGame(session.gameId);
              const date = typeof session.createdAt === 'string' ? new Date(session.createdAt) : session.createdAt.toDate();
              return (
                <Link
                  key={session.id}
                  to={`/tools/cognitive-training/${session.id}`}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 bg-app-secondary rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-text-primary truncate">{game ? t(game.nameKey) : session.gameId}</span>
                  <span className="flex-shrink-0 text-[10px] text-text-muted">{date.toLocaleDateString()} · {results.length} {t('cognitiveTraining.statsPlayer').toLowerCase()}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
