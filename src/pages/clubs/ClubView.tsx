/**
 * Single Club View Page
 * View club details, teams, members
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { getClub } from '../../services/firebase/clubs';
import type { Club } from '../../types';

export default function ClubView() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useLanguage();
  const { isClubOwner, isTrainer } = usePermissions();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'members'>('overview');

  useEffect(() => {
    if (clubId) {
      loadClub();
    }
  }, [clubId]);

  const loadClub = async () => {
    if (!clubId) return;

    try {
      const clubData = await getClub(clubId);
      setClub(clubData);
    } catch (error) {
      console.error('Error loading club:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!club) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {t('clubs.notFound.title')}
          </h2>
          <p className="text-gray-600 mb-6">{t('clubs.notFound.description')}</p>
          <Link
            to="/clubs"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors inline-block"
          >
            {t('clubs.notFound.backToClubs')}
          </Link>
        </div>
      </Container>
    );
  }

  const canManage = isClubOwner(club.id);
  const canTrainOrAssist = isTrainer(club.id);

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{club.name}</h1>
                {club.subscriptionActive ? (
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                    {t('clubs.status.active')}
                  </span>
                ) : (
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                    {t('clubs.status.expired')}
                  </span>
                )}
              </div>
              <p className="text-gray-600 mb-4">{club.description}</p>
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <div>
                  <strong>{t('clubs.clubCode')}:</strong>{' '}
                  <span className="font-mono font-semibold text-gray-900">{club.clubCode}</span>
                </div>
                <div>
                  <strong>{t('clubs.type')}:</strong> {t(`clubs.types.${club.clubType}`)}
                </div>
              </div>
            </div>

            {canManage && (
              <button
                onClick={() => navigate(`/clubs/${club.id}/settings`)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.settings')}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('clubs.tabs.overview')}
              </button>
              <button
                onClick={() => setActiveTab('teams')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'teams'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('clubs.tabs.teams')} ({club.teams?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'members'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('clubs.tabs.members')} ({club.members?.length || 0})
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {t('clubs.overview.stats')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-primary mb-1">
                        {club.members?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('clubs.stats.totalMembers')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-primary mb-1">
                        {club.teams?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('clubs.stats.totalTeams')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-primary mb-1">
                        {club.trainers?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('clubs.stats.totalTrainers')}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {t('clubs.overview.subscription')}
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {club.subscriptionType === 'voucher' && t('clubs.subscription.voucher')}
                          {club.subscriptionType === 'stripe' && t('clubs.subscription.stripe')}
                          {club.subscriptionType === 'trial' && t('clubs.subscription.trial')}
                        </p>
                        {club.subscriptionExpiryDate && (
                          <p className="text-sm text-gray-600 mt-1">
                            {t('clubs.subscription.expiresOn')}: {new Date(club.subscriptionExpiryDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {club.subscriptionActive ? (
                        <span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                          {t('clubs.status.active')}
                        </span>
                      ) : (
                        <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                          {t('clubs.status.expired')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'teams' && (
              <div className="space-y-4">
                {canTrainOrAssist && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => alert(t('teams.create.comingSoon'))}
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
                    >
                      {t('teams.create.button')}
                    </button>
                  </div>
                )}

                {club.teams && club.teams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {club.teams.map((team) => (
                      <div
                        key={team.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors"
                      >
                        <h4 className="font-semibold text-gray-900 mb-2">{team.name}</h4>
                        {team.category && (
                          <p className="text-sm text-gray-600 mb-2">{team.category}</p>
                        )}
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{team.members.length} {t('teams.members')}</span>
                          <span>{team.trainers.length} {t('teams.trainers')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">{t('teams.noTeams')}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="space-y-4">
                {club.members && club.members.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {club.members.map((memberId) => (
                      <div key={memberId} className="py-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                            U
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{t('clubs.members.userPlaceholder')} {memberId.slice(0, 8)}</p>
                            <p className="text-sm text-gray-500">
                              {club.trainers?.includes(memberId) && t('roles.trainer')}
                              {club.assistants?.includes(memberId) && t('roles.assistant')}
                              {!club.trainers?.includes(memberId) && !club.assistants?.includes(memberId) && t('roles.user')}
                            </p>
                          </div>
                        </div>
                        {canManage && (
                          <button
                            onClick={() => alert(t('clubs.members.manageComingSoon'))}
                            className="text-sm text-primary hover:text-primary-600"
                          >
                            {t('common.manage')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">{t('clubs.members.noMembers')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}

