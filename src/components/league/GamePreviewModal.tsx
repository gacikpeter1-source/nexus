/**
 * Game Preview Modal
 * Show scraped games and allow selection for syncing
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { syncScrapedGames } from '../../services/firebase/leagueSchedule';
import type { ScrapedGame } from '../../services/leagueScraper';

interface Props {
  games: ScrapedGame[];
  clubId: string;
  teamId: string;
  onClose: () => void;
  onSyncComplete: () => void;
}

export default function GamePreviewModal({
  games,
  clubId,
  teamId,
  onClose,
  onSyncComplete
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [selectedGames, setSelectedGames] = useState<string[]>(
    games.map(g => g.externalId)
  );
  const [syncing, setSyncing] = useState(false);

  function toggleGame(externalId: string) {
    if (selectedGames.includes(externalId)) {
      setSelectedGames(selectedGames.filter(id => id !== externalId));
    } else {
      setSelectedGames([...selectedGames, externalId]);
    }
  }

  function toggleAll() {
    if (selectedGames.length === games.length) {
      setSelectedGames([]);
    } else {
      setSelectedGames(games.map(g => g.externalId));
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      
      // Filter selected games
      const gamesToSync = games.filter(g => selectedGames.includes(g.externalId));
      
      // Sync to database
      const result = await syncScrapedGames(
        gamesToSync,
        clubId,
        teamId,
        user!.id
      );
      
      alert(
        t('league.syncSuccess')
          .replace('{{created}}', result.created.toString())
          .replace('{{updated}}', result.updated.toString())
      );
      onSyncComplete();
      
    } catch (error) {
      console.error('Sync error:', error);
      alert(t('league.syncFailed'));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-app-card border border-white/10 rounded-2xl shadow-card max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">
                {t('league.previewTitle')}
              </h2>
              <p className="mt-1 text-text-secondary">
                {t('league.previewSubtitle').replace('{{count}}', games.length.toString())}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-app-cyan text-3xl font-bold transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {games.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                {t('league.noGamesFound')}
              </h3>
              <p className="text-text-secondary">
                {t('league.noGamesFoundDesc')}
              </p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGames.length === games.length}
                    onChange={toggleAll}
                    className="w-5 h-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
                  />
                  <span className="font-semibold text-text-primary">
                    {t('league.selectAll')} ({selectedGames.length}/{games.length})
                  </span>
                </label>
                
                <div className="text-sm text-text-secondary">
                  {t('league.selectedCount').replace('{{count}}', selectedGames.length.toString())}
                </div>
              </div>

              {/* Games Table */}
              <div className="border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-app-secondary">
                    <tr>
                      <th className="w-12 px-4 py-3"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                        {t('league.date')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                        {t('league.time')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                        {t('league.homeTeam')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                        {t('league.guestTeam')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                        {t('league.result')}
                      </th>
                      {games.some(g => g.round) && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">
                          {t('league.round')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {games.map(game => (
                      <tr
                        key={game.externalId}
                        className={`hover:bg-app-secondary transition-colors ${
                          selectedGames.includes(game.externalId) ? 'bg-app-blue/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedGames.includes(game.externalId)}
                            onChange={() => toggleGame(game.externalId)}
                            className="w-5 h-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-text-primary">
                          {game.date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-text-primary">
                          {game.time}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary">
                          {game.homeTeam}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary">
                          {game.guestTeam}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-text-primary">
                          {game.result || '-'}
                        </td>
                        {games.some(g => g.round) && (
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                            {game.round || '-'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
          >
            {t('common.cancel')}
          </button>
          
          <button
            onClick={handleSync}
            disabled={selectedGames.length === 0 || syncing}
            className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300 font-semibold"
          >
            {syncing 
              ? t('league.syncing') 
              : t('league.syncGames').replace('{{count}}', selectedGames.length.toString())
            }
          </button>
        </div>
      </div>
    </div>
  );
}

