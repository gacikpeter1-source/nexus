/**
 * Scraper Configuration Modal
 * Configure league scraper for a team
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateClub } from '../../services/firebase/clubs';
import type { Club, Team } from '../../types';
import type { ScraperConfig } from '../../services/leagueScraper';

interface Props {
  club: Club;
  team: Team;
  existingConfig?: ScraperConfig;
  onTest: (url: string, teamIdentifier: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export default function ScraperConfigModal({
  club,
  team,
  existingConfig,
  onTest,
  onClose,
  loading
}: Props) {
  const { t } = useLanguage();
  
  const [url, setUrl] = useState(existingConfig?.url || '');
  const [teamIdentifier, setTeamIdentifier] = useState(existingConfig?.teamIdentifier || team.name);
  const [saving, setSaving] = useState(false);

  async function handleTest() {
    if (!url || !teamIdentifier) {
      alert(t('league.fillRequired'));
      return;
    }
    
    await onTest(url, teamIdentifier);
  }

  async function handleSave() {
    try {
      setSaving(true);
      
      // Save config to club document
      await updateClub(club.id, {
        [`leagueScraperConfigs.${team.id}`]: {
          url,
          teamIdentifier,
          enabled: true,
          lastScrapedAt: new Date().toISOString()
        }
      });
      
      alert(t('league.configSaved'));
      onClose();
      
    } catch (error) {
      console.error('Error saving config:', error);
      alert(t('league.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-app-card border border-white/10 rounded-2xl shadow-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text-primary">
              {t('league.configureTitle')}
            </h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-app-cyan text-3xl font-bold transition-colors"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-text-secondary">{team.name}</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* URL Input */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2">
              {t('league.websiteUrl')} <span className="text-chart-pink">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hlcana.sk/zapasy"
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
            />
            <p className="mt-1 text-sm text-text-muted">
              {t('league.websiteUrlHint')}
            </p>
          </div>

          {/* Team Identifier */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2">
              {t('league.teamIdentifier')} <span className="text-chart-pink">*</span>
            </label>
            <input
              type="text"
              value={teamIdentifier}
              onChange={(e) => setTeamIdentifier(e.target.value)}
              placeholder="HK Myslava"
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
            />
            <p className="mt-1 text-sm text-text-muted">
              {t('league.teamIdentifierHint')}
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-chart-purple/10 border border-chart-purple/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-chart-purple mb-2">
              {t('league.corsWarning')}
            </h3>
            <p className="text-sm text-text-secondary">
              {t('league.corsWarningDesc')}
            </p>
          </div>

          {/* Example */}
          <div className="bg-app-secondary border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-app-cyan mb-3">
              {t('league.example')}
            </h3>
            <div className="text-sm text-text-secondary space-y-2">
              <div className="flex items-start">
                <span className="w-2 h-2 rounded-full bg-app-blue mr-3 mt-1.5"></span>
                <div><strong className="text-text-primary">{t('league.url')}:</strong> https://hlcana.sk/zapasy</div>
              </div>
              <div className="flex items-start">
                <span className="w-2 h-2 rounded-full bg-chart-cyan mr-3 mt-1.5"></span>
                <div><strong className="text-text-primary">{t('league.teamIdentifier')}:</strong> HK Myslava</div>
              </div>
            </div>
          </div>
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
            onClick={handleTest}
            disabled={!url || !teamIdentifier || loading}
            className="flex-1 px-6 py-3 bg-app-blue text-white rounded-xl hover:bg-app-blue/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-app-blue transition-all duration-300 font-semibold"
          >
            {loading ? t('league.testing') : t('league.testScraper')}
          </button>
          
          <button
            onClick={handleSave}
            disabled={!url || !teamIdentifier || saving}
            className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300 font-semibold"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

