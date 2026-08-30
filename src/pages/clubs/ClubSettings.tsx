/**
 * Club Settings Page
 * - General club information
 * - Season management
 * - Custom member fields
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getClub, deleteClub } from '../../services/firebase/clubs';
import type { Club } from '../../types';
import GeneralSettings from '../../components/club/GeneralSettings';
import SeasonManagement from '../../components/club/SeasonManagement';
import CustomFieldsManagement from '../../components/club/CustomFieldsManagement';

type Tab = 'general' | 'seasons' | 'customFields';

export default function ClubSettings() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadClub();
    }
  }, [clubId]);

  const handleDeleteClub = async () => {
    if (!club) return;
    const confirmed = window.confirm(
      `${t('clubs.settings.danger.confirmDelete')}\n\n"${club.name}"`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteClub(club.id!, club.ownerId);
      navigate('/clubs');
    } catch (error) {
      console.error('Error deleting club:', error);
      alert(t('clubs.settings.danger.deleteError'));
      setDeleting(false);
    }
  };

  const loadClub = async () => {
    if (!clubId) return;

    setLoading(true);
    try {
      const clubData = await getClub(clubId);
      setClub(clubData);
    } catch (error) {
      console.error('Error loading club:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check permission
  if (!user || !club) {
    return null;
  }

  // Only club owners (or admins) can access settings
  const canAccess = club.createdBy === user.id || club.ownerId === user.id || user.role === 'admin';

  if (!canAccess) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            {t('common.error')}
          </h2>
          <p className="text-text-secondary mb-6">
            You don't have permission to access club settings
          </p>
          <button
            onClick={() => navigate(`/clubs/${clubId}`)}
            className="px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            {t('common.back')}
          </button>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!club) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            {t('clubs.notFound.title')}
          </h2>
          <p className="text-text-secondary mb-6">
            {t('clubs.notFound.description')}
          </p>
          <button
            onClick={() => navigate('/clubs')}
            className="px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            {t('clubs.notFound.backToClubs')}
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">{t('clubs.settings.title')}</h1>
          </div>

          <button
            onClick={() => navigate(`/clubs/${clubId}`)}
            className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
          >
            {t('common.back')}
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex-1 px-6 py-4 font-semibold transition-all duration-300 ${
                activeTab === 'general'
                  ? 'bg-gradient-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {t('clubs.settings.tabs.general')}
            </button>
            <button
              onClick={() => setActiveTab('seasons')}
              className={`flex-1 px-6 py-4 font-semibold transition-all duration-300 ${
                activeTab === 'seasons'
                  ? 'bg-gradient-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {t('clubs.settings.tabs.seasons')}
            </button>
            <button
              onClick={() => setActiveTab('customFields')}
              className={`flex-1 px-6 py-4 font-semibold transition-all duration-300 ${
                activeTab === 'customFields'
                  ? 'bg-gradient-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {t('clubs.settings.tabs.customFields')}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'general' && (
              <GeneralSettings club={club} onUpdate={loadClub} />
            )}
            {activeTab === 'seasons' && (
              <SeasonManagement clubId={club.id!} />
            )}
            {activeTab === 'customFields' && (
              <CustomFieldsManagement club={club} onUpdate={loadClub} />
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-app-card shadow-card rounded-2xl border border-chart-pink/30 p-6 space-y-3">
          <h3 className="text-lg font-semibold text-chart-pink">{t('clubs.settings.danger.title')}</h3>
          <p className="text-sm text-text-secondary">{t('clubs.settings.danger.description')}</p>
          <button
            onClick={handleDeleteClub}
            disabled={deleting}
            className="px-6 py-3 bg-chart-pink/10 border border-chart-pink text-chart-pink rounded-xl hover:bg-chart-pink/20 transition-all duration-300 font-semibold disabled:opacity-50"
          >
            {deleting ? t('common.loading') : t('clubs.settings.danger.deleteButton')}
          </button>
        </div>
      </div>
    </Container>
  );
}

