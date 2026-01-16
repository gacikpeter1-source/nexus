/**
 * Clubs List Page
 * View all clubs user is member of
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { PERMISSIONS } from '../../constants/permissions';
import type { Club } from '../../types';

export default function ClubsList() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { can } = usePermissions();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadClubs();
    }
  }, [user]);

  const loadClubs = async () => {
    if (!user) return;

    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);
    } catch (error) {
      console.error('Error loading clubs:', error);
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

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t('clubs.list.title')}
            </h1>
            <p className="mt-2 text-gray-600">
              {t('clubs.list.subtitle')}
            </p>
          </div>

          {can(PERMISSIONS.CREATE_CLUB) && (
            <Link
              to="/clubs/create"
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
            >
              {t('clubs.list.createButton')}
            </Link>
          )}
        </div>

        {/* Clubs Grid */}
        {clubs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs.map((club) => (
              <Link
                key={club.id}
                to={`/clubs/${club.id}`}
                className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                {/* Club Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {club.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {t(`clubs.types.${club.clubType}`)}
                    </p>
                  </div>
                  
                  {/* Subscription Status */}
                  {club.subscriptionActive ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      {t('clubs.status.active')}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                      {t('clubs.status.expired')}
                    </span>
                  )}
                </div>

                {/* Description */}
                {club.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {club.description}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>{club.members?.length || 0} {t('clubs.stats.members')}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>{club.teams?.length || 0} {t('clubs.stats.teams')}</span>
                  </div>
                </div>

                {/* Club Code */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    {t('clubs.clubCode')}: <span className="font-mono font-semibold text-gray-900">{club.clubCode}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('clubs.list.noClubs')}
            </h3>
            <p className="text-gray-600 mb-6">
              {t('clubs.list.noClubsDescription')}
            </p>
            {can(PERMISSIONS.CREATE_CLUB) && (
              <Link
                to="/clubs/create"
                className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
              >
                {t('clubs.list.createButton')}
              </Link>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}

