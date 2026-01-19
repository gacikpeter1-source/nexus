/**
 * League Schedule Page
 * Configure scraper and sync league games
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getClub } from '../services/firebase/clubs';
import { getTeamLeagueSchedule } from '../services/firebase/leagueSchedule';
import { scrapeLeagueSchedule, filterGamesByTeam, type ScrapedGame } from '../services/leagueScraper';
import ScraperConfigModal from '../components/league/ScraperConfigModal';
import GamePreviewModal from '../components/league/GamePreviewModal';
import type { Club, Team } from '../types';

export default function LeagueSchedule() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { t } = useLanguage();
  
  const [club, setClub] = useState<Club | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [scrapedGames, setScrapedGames] = useState<ScrapedGame[]>([]);
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
      
      // Get league schedule
      const schedule = await getTeamLeagueSchedule(teamId!);
      setGames(schedule);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleTestScraper(url: string, teamIdentifier: string) {
    try {
      setScraping(true);
      
      // Scrape URL
      const allGames = await scrapeLeagueSchedule(url);
      
      // Filter by team
      const teamGames = filterGamesByTeam(allGames, teamIdentifier);
      
      setScrapedGames(teamGames);
      setShowConfigModal(false);
      setShowPreviewModal(true);
      
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              {t('league.title')} - {team.name}
            </h1>
          </div>
          
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            {scraperConfig ? t('league.reconfigure') : t('league.configure')}
          </button>
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
              {t('league.schedule')} ({games.length})
            </h2>
          </div>
          
          {games.length === 0 ? (
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-app-secondary">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.date')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.time')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.homeTeam')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.guestTeam')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.result')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase">{t('league.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {games.map(game => (
                    <tr key={game.id} className="hover:bg-app-secondary/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                        {new Date(game.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                        {game.time}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-primary font-medium">
                        {game.homeTeam}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-primary font-medium">
                        {game.guestTeam}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-app-cyan">
                        {game.result || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          game.status === 'played' ? 'bg-chart-cyan/20 text-chart-cyan' :
                          game.status === 'upcoming' ? 'bg-chart-purple/20 text-chart-purple' :
                          'bg-text-muted/20 text-text-muted'
                        }`}>
                          {t(`league.${game.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

