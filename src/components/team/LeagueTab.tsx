import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getTeamLeagueSchedule, type LeagueGame } from '../../services/firebase/leagueSchedule';
import { getClubSeasons } from '../../services/firebase/seasons';
import type { Season } from '../../types';

interface Props {
  clubId: string;
  teamId: string;
}

export default function LeagueTab({ clubId, teamId }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [games, setGames] = useState<LeagueGame[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [clubId, teamId]);

  const load = async () => {
    setLoading(true);
    try {
      const [schedule, clubSeasons] = await Promise.all([
        getTeamLeagueSchedule(teamId, clubId),
        getClubSeasons(clubId),
      ]);
      setGames(schedule.sort((a, b) => a.date.localeCompare(b.date)));
      setSeasons(clubSeasons);

      const todayStr = new Date().toISOString().split('T')[0];
      const defaultSeason =
        clubSeasons.find(s => s.isActive) ||
        clubSeasons.find(s => todayStr >= s.startDate && todayStr <= s.endDate);
      setSelectedSeasonId(defaultSeason?.id || 'all');
    } catch (err) {
      console.error('LeagueTab: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const visibleGames = useMemo(() => {
    if (selectedSeasonId === 'all') return games;
    const season = seasons.find(s => s.id === selectedSeasonId);
    if (!season) return games;
    return games.filter(g => g.date >= season.startDate && g.date <= season.endDate);
  }, [games, seasons, selectedSeasonId]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
          {t('league.title')}
        </h2>
        <div className="flex items-center gap-2">
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="px-2.5 py-1.5 bg-app-secondary border border-white/10 text-text-primary rounded-lg text-[11px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="all">{t('league.allSeasons')}</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}/league`)}
            className="px-3 py-1.5 bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all duration-300 font-semibold text-[11px] sm:text-xs whitespace-nowrap"
          >
            {t('league.openFullSchedule')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="text-center py-8 sm:py-12 space-y-2">
          <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs sm:text-sm font-semibold text-text-secondary">
            {t('league.noGames')}
          </p>
          <p className="text-[11px] sm:text-xs text-text-muted">
            {t('league.noGamesDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleGames.map(game => (
            <div
              key={game.id}
              className="flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg"
            >
              <div className="flex-shrink-0 text-[10px] sm:text-[11px] text-text-muted w-16 sm:w-20">
                <div>{new Date(game.date + 'T00:00:00').toLocaleDateString()}</div>
                <div>{game.time}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                  {game.homeTeam} — {game.guestTeam}
                </div>
                {game.round && (
                  <div className="text-[10px] text-text-muted truncate">{game.round}</div>
                )}
              </div>
              <div className="flex-shrink-0 text-right space-y-0.5">
                {game.result && (
                  <div className="text-xs sm:text-sm font-bold text-app-cyan">{game.result}</div>
                )}
                <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                  game.status === 'played' ? 'bg-chart-cyan/20 text-chart-cyan' :
                  game.status === 'upcoming' ? 'bg-chart-purple/20 text-chart-purple' :
                  'bg-text-muted/20 text-text-muted'
                }`}>
                  {t(`league.${game.status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
