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
          {visibleGames.map(game => {
            // Games synced before own-team tagging shipped have no isOwnTeam
            // field at all — but back then the scraper only ever stored the
            // team's own games, so treat "missing" as "mine" (see LeagueSchedule.tsx).
            const mine = game.isOwnTeam !== false;
            const cancelled = game.status === 'cancelled';
            return (
              <div
                key={game.id}
                className={`flex flex-col gap-1 py-2 pr-3 pl-3 rounded-lg border-l-[3px] ${
                  mine ? 'border-l-app-cyan bg-app-cyan/10' : 'border-l-transparent bg-app-secondary border border-white/10'
                }`}
              >
                <div className={`text-center text-[10px] font-semibold uppercase tracking-wider ${mine ? 'text-app-cyan/80' : 'text-text-muted'}`}>
                  {new Date(game.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  {' · '}
                  {game.time}
                </div>
                <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
                  <div className={`text-xs sm:text-sm font-semibold text-right truncate ${mine ? 'text-text-primary' : 'text-text-secondary'} ${cancelled ? 'line-through opacity-60' : ''}`}>
                    {game.homeTeam}
                  </div>
                  {cancelled ? (
                    <div className="text-[10px] font-medium text-text-muted px-1.5 min-w-[52px] text-center">
                      {t('league.cancelled')}
                    </div>
                  ) : game.result ? (
                    <div className={`tabular-nums text-sm font-bold rounded-lg px-1.5 py-0.5 min-w-[52px] text-center ${mine ? 'text-app-cyan bg-app-cyan/15' : 'text-text-secondary'}`}>
                      {game.result.replace(':', ' : ')}
                    </div>
                  ) : (
                    <div className={`text-xs font-medium min-w-[52px] text-center ${mine ? 'text-app-cyan/80' : 'text-text-muted'}`}>
                      –
                    </div>
                  )}
                  <div className={`text-xs sm:text-sm font-semibold text-left truncate ${mine ? 'text-text-primary' : 'text-text-secondary'} ${cancelled ? 'line-through opacity-60' : ''}`}>
                    {game.guestTeam}
                  </div>
                </div>
                {game.round && (
                  <div className="text-center text-[10px] text-text-muted truncate">{game.round}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
