import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getClubSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
} from '../../services/firebase/seasons';
import type { Season } from '../../types';

interface SeasonManagementProps {
  clubId: string;
}

export default function SeasonManagement({ clubId }: SeasonManagementProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    isActive: false,
    description: '',
    notes: '',
  });

  useEffect(() => {
    loadSeasons();
  }, [clubId]);

  const loadSeasons = async () => {
    setLoading(true);
    try {
      const data = await getClubSeasons(clubId);
      setSeasons(data);
    } catch (error) {
      console.error('Error loading seasons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingSeason) {
        await updateSeason(editingSeason.id, formData);
        alert(t('clubs.settings.seasons.updateSuccess'));
      } else {
        await createSeason({
          ...formData,
          clubId,
          createdBy: user.id,
        });
        alert(t('clubs.settings.seasons.createSuccess'));
      }

      setShowForm(false);
      setEditingSeason(null);
      resetForm();
      loadSeasons();
    } catch (error) {
      console.error('Error saving season:', error);
      alert(editingSeason ? t('clubs.settings.seasons.updateError') : t('clubs.settings.seasons.createError'));
    }
  };

  const handleEdit = (season: Season) => {
    setEditingSeason(season);
    setFormData({
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      isActive: season.isActive,
      description: season.description || '',
      notes: season.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (seasonId: string) => {
    if (confirm(t('clubs.settings.seasons.confirmDelete'))) {
      try {
        await deleteSeason(seasonId);
        alert(t('clubs.settings.seasons.deleteSuccess'));
        loadSeasons();
      } catch (error) {
        console.error('Error deleting season:', error);
        alert(t('clubs.settings.seasons.deleteError'));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: '',
      endDate: '',
      isActive: false,
      description: '',
      notes: '',
    });
    setEditingSeason(null);
  };

  if (loading) {
    return <div className="text-center py-8 text-text-secondary">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{t('clubs.settings.seasons.title')}</h3>
          <p className="text-sm text-text-secondary mt-1">{t('clubs.settings.seasons.description')}</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
        >
          {showForm ? t('common.cancel') : t('clubs.settings.seasons.createSeason')}
        </button>
      </div>

      {/* Season Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-app-secondary border border-white/10 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.seasons.fields.name')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('clubs.settings.seasons.placeholders.name')}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.seasons.fields.startDate')}
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.seasons.fields.endDate')}
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-app-blue rounded border-gray-300 focus:ring-app-blue"
                />
                <span className="text-sm text-text-secondary">{t('clubs.settings.seasons.fields.isActive')}</span>
              </label>
              {formData.isActive && (
                <p className="text-xs text-chart-cyan mt-1">{t('clubs.settings.seasons.activeSeasonInfo')}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300"
          >
            {editingSeason ? t('common.update') : t('common.create')}
          </button>
        </form>
      )}

      {/* Seasons List */}
      {seasons.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-secondary mb-2">{t('clubs.settings.seasons.noSeasons')}</p>
          <p className="text-sm text-text-muted">{t('clubs.settings.seasons.noSeasonsDescription')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map((season) => (
            <div
              key={season.id}
              className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:border-app-blue transition-all"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-text-primary">{season.name}</h4>
                  {season.isActive && (
                    <span className="px-2 py-1 text-xs bg-chart-cyan text-white rounded-full font-semibold">
                      {t('clubs.settings.seasons.active')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-muted mt-1">
                  {t('clubs.settings.seasons.dateRange', { start: season.startDate, end: season.endDate })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(season)}
                  className="p-2 text-app-cyan hover:bg-white/5 rounded-lg transition-all"
                  title={t('common.edit')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(season.id)}
                  className="p-2 text-chart-pink hover:bg-white/5 rounded-lg transition-all"
                  title={t('common.delete')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


