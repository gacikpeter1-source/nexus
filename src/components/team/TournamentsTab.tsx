import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getTeamTournaments } from '../../services/firebase/nominations';
import type { Nomination } from '../../types';

interface Props {
  clubId: string;
  teamId: string;
}

function earliestGameDate(n: Nomination): string {
  const dates = n.games.map(g => g.date).filter(Boolean).sort();
  return dates[0] || '';
}

export default function TournamentsTab({ clubId, teamId }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [clubId, teamId]);

  const load = async () => {
    setLoading(true);
    try {
      const all = await getTeamTournaments(clubId, teamId);
      setTournaments(
        all.sort((a, b) => earliestGameDate(b).localeCompare(earliestGameDate(a)))
      );
    } catch (err) {
      console.error('TournamentsTab: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('nominations.tournamentsTabLabel')}</h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <div className="text-2xl">🏆</div>
          <p className="text-xs text-text-secondary">{t('nominations.noTournaments')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tournaments.map(tour => {
            const date = earliestGameDate(tour);
            const confirmedCount = Object.values(tour.primary).filter(e => e.status === 'confirmed').length;
            const gamesWithScore = tour.games.filter(g => g.teamScore !== undefined && g.opponentScore !== undefined).length;
            return (
              <button
                key={tour.id}
                onClick={() => navigate(`/clubs/${clubId}/tournaments/${tour.id}`)}
                className="w-full text-left flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{tour.title}</div>
                  <div className="text-[10px] text-text-muted">
                    {date ? new Date(date + 'T00:00:00').toLocaleDateString() : t('nominations.dateTbd')}
                  </div>
                </div>
                <div className="flex-shrink-0 text-[10px] text-text-secondary text-right">
                  <div>{confirmedCount} {t('nominations.playedLabel')}</div>
                  <div className="text-text-muted">{gamesWithScore}/{tour.games.length} {t('nominations.scoresLabel')}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
