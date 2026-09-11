/**
 * League Schedule Page
 * Configure scraper and sync league games
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getClub, updateClub } from '../services/firebase/clubs';
import { getTeamLeagueSchedule } from '../services/firebase/leagueSchedule';
import { getClubSeasons } from '../services/firebase/seasons';
import { scrapeLeagueSchedule, type ScrapedGame } from '../services/leagueScraper';
import ScraperConfigModal from '../components/league/ScraperConfigModal';
import GamePreviewModal from '../components/league/GamePreviewModal';
import type { Club, Team, Season } from '../types';

export default function LeagueSchedule() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [club, setClub] = useState<Club | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [scrapedGames, setScrapedGames] = useState<ScrapedGame[]>([]);
  const [scrapedTeamIdentifier, setScrapedTeamIdentifier] = useState('');
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    loadData();
  }, [clubId, teamId]);

  async function loadData() {
    try {
      setLoading(true);

      // Get club
      const clubData = await getClub(clubId!);
      if (!clubData) return;
      setClub(clubData);

      // Find team
      const teamData = clubData.teams.find(t => t.id === teamId);
      if (!teamData) return;
      setTeam(teamData);

      // Get league schedule + club seasons
      const [schedule, clubSeasons] = await Promise.all([
        getTeamLeagueSchedule(teamId!, clubId!),
        getClubSeasons(clubId!),
      ]);
      setGames(schedule);
      setSeasons(clubSeasons);

      const todayStr = new Date().toISOString().split('T')[0];
      const defaultSeason =
        clubSeasons.find(s => s.isActive) ||
        clubSeasons.find(s => todayStr >= s.startDate && todayStr <= s.endDate);
      setSelectedSeasonId(defaultSeason?.id || 'all');

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  const visibleGames = useMemo(() => {
    if (selectedSeasonId === 'all') return games;
    const season = seasons.find(s => s.id === selectedSeasonId);
    if (!season) return games;
    return games.filter(g => g.date >= season.startDate && g.date <= season.endDate);
  }, [games, seasons, selectedSeasonId]);

  async function handleTestScraper(url: string, teamIdentifier: string) {
    try {
      setScraping(true);

      // Scrape URL — keep every game from the league page, not just this
      // team's, so the rest can be kept as evidence (standings, opponent
      // head-to-head). GamePreviewModal tags and pre-selects the own-team ones.
      const allGames = await scrapeLeagueSchedule(url);

      setScrapedGames(allGames);
      setScrapedTeamIdentifier(teamIdentifier);
      setShowConfigModal(false);
      setShowPreviewModal(true);

      // Keep "Last scraped" accurate for a saved config re-run via "Sync Now".
      if (club?.leagueScraperConfigs?.[teamId!]) {
        await updateClub(clubId!, {
          [`leagueScraperConfigs.${teamId}.lastScrapedAt`]: new Date().toISOString(),
        });
      }

    } catch (error: any) {
      console.error('Scraper error:', error);
      
      if (error.message?.includes('CORS_ERROR')) {
        alert(t('league.corsError'));
      } else {
        alert(t('league.scrapeError'));
      }
    } finally {
      setScraping(false);
    }
  }

  if (loading) {
    return (
      <Container>
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!club || !team) {
    return (
      <Container>
        <div className="py-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('league.notFound')}</h1>
        </div>
      </Container>
    );
  }

  const scraperConfig = club.leagueScraperConfigs?.[teamId!] as {
    url: string;
    teamIdentifier: string;
    enabled: boolean;
    lastScrapedAt?: string;
  } | undefined;

  return (
    <Container>
      <div className="py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              {t('league.title')} - {team.name}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {seasons.length > 0 && (
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="px-4 py-3 bg-app-secondary border border-white/10 text-text-primary rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="all">{t('league.allSeasons')}</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}`)}
              className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('common.back')}
            </button>

            {scraperConfig && (
              <button
                onClick={() => handleTestScraper(scraperConfig.url, scraperConfig.teamIdentifier)}
                disabled={scraping}
                className="px-6 py-3 bg-app-secondary border border-app-cyan/30 text-app-cyan rounded-xl hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold"
              >
                {scraping ? t('league.testing') : t('league.syncNow')}
              </button>
            )}

            <button
              onClick={() => setShowConfigModal(true)}
              className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
            >
              {scraperConfig ? t('league.reconfigure') : t('league.configure')}
            </button>
          </div>
        </div>

        {/* Current Config */}
        {scraperConfig && (
          <div className="bg-app-card border border-app-cyan/30 rounded-2xl p-4 mb-8 shadow-card">
            <h3 className="font-semibold text-app-cyan mb-2">
              {t('league.configured')}
            </h3>
            <div className="text-sm text-text-secondary space-y-1">
              <div><strong className="text-text-primary">{t('league.url')}:</strong> {scraperConfig.url}</div>
              <div><strong className="text-text-primary">{t('league.teamIdentifier')}:</strong> {scraperConfig.teamIdentifier}</div>
              {scraperConfig.lastScrapedAt && (
                <div><strong className="text-text-primary">{t('league.lastScraped')}:</strong> {new Date(scraperConfig.lastScrapedAt).toLocaleString()}</div>
              )}
            </div>
          </div>
        )}

        {/* Games List */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold text-text-primary">
              {t('league.schedule')} ({visibleGames.length})
            </h2>
          </div>

          {visibleGames.length === 0 ? (
            <div className="p-12 text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                {t('league.noGames')}
              </h3>
              <p className="text-text-secondary mb-6">
                {t('league.noGamesDescription')}
              </p>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
              >
                {t('league.configureNow')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleGames.map(game => {
                // Games synced before this feature shipped have no isOwnTeam field at
                // all — but back then the scraper only ever stored the team's own
                // games, so treat "missing" as "mine" and only an explicit false
                // (a newly-synced other-league game) as not highlighted.
                const mine = game.isOwnTeam !== false;
                const cancelled = game.status === 'cancelled';
                return (
                  <div
                    key={game.id}
                    className={`flex flex-col gap-1 py-2.5 pr-4 pl-[18px] border-l-[3px] border-b border-b-white/5 last:border-b-0 ${
                      mine ? 'border-l-app-cyan bg-app-cyan/10' : 'border-l-transparent'
                    }`}
                  >
                    <div className={`text-center text-[11px] font-semibold uppercase tracking-wider ${mine ? 'text-app-cyan/80' : 'text-text-muted'}`}>
                      {new Date(game.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}
                      {game.time}
                    </div>
                    <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2.5">
                      <div className={`text-sm font-semibold text-right truncate ${mine ? 'text-text-primary' : 'text-text-secondary'} ${cancelled ? 'line-through opacity-60' : ''}`}>
                        {game.homeTeam}
                      </div>
                      {cancelled ? (
                        <div className="text-xs font-medium text-text-muted px-2 min-w-[64px] text-center">
                          {t('league.cancelled')}
                        </div>
                      ) : game.result ? (
                        <div className={`tabular-nums text-base font-bold rounded-lg px-2 py-0.5 min-w-[64px] text-center ${mine ? 'text-app-cyan bg-app-cyan/15' : 'text-text-secondary'}`}>
                          {game.result.replace(':', ' : ')}
                        </div>
                      ) : (
                        <div className={`text-sm font-medium min-w-[64px] text-center ${mine ? 'text-app-cyan/80' : 'text-text-muted'}`}>
                          –
                        </div>
                      )}
                      <div className={`text-sm font-semibold text-left truncate ${mine ? 'text-text-primary' : 'text-text-secondary'} ${cancelled ? 'line-through opacity-60' : ''}`}>
                        {game.guestTeam}
                      </div>
                    </div>
                    {game.round && (
                      <div className="text-center text-[10.5px] text-text-muted">{game.round}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modals */}
        {showConfigModal && (
          <ScraperConfigModal
            club={club}
            team={team}
            existingConfig={scraperConfig}
            onTest={handleTestScraper}
            onClose={() => setShowConfigModal(false)}
            loading={scraping}
          />
        )}
        
        {showPreviewModal && (
          <GamePreviewModal
            games={scrapedGames}
            clubId={clubId!}
            teamId={teamId!}
            teamIdentifier={scrapedTeamIdentifier}
            onClose={() => setShowPreviewModal(false)}
            onSyncComplete={() => {
              setShowPreviewModal(false);
              loadData();
            }}
          />
        )}
      </div>
    </Container>
  );
}

