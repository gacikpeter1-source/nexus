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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-3 sm:space-y-4">
        {/* Header - Compact */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
              {t('clubs.list.title')}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-text-secondary">
              {t('clubs.list.subtitle')}
            </p>
          </div>

          {can(PERMISSIONS.CREATE_CLUB) && (
            <Link
              to="/clubs/create"
              className="w-full sm:w-auto px-4 sm:px-5 py-2 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-center"
            >
              {t('clubs.list.createButton')}
            </Link>
          )}
        </div>

        {/* Clubs Grid - Compact */}
        {clubs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {clubs.map((club) => (
              <Link
                key={club.id}
                to={`/clubs/${club.id}`}
                className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3 hover:border-app-blue hover:shadow-button transition-all duration-300"
              >
                {/* Club Header - Compact */}
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-text-primary mb-0.5 truncate">
                      {club.name}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-text-muted truncate">
                      {t(`clubs.types.${club.clubType}`)}
                    </p>
                  </div>
                  
                  {/* Subscription Status - Compact */}
                  {club.subscriptionActive ? (
                    <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold rounded-full bg-chart-cyan/20 text-chart-cyan whitespace-nowrap flex-shrink-0">
                      {t('clubs.status.active')}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold rounded-full bg-chart-pink/20 text-chart-pink whitespace-nowrap flex-shrink-0">
                      {t('clubs.status.expired')}
                    </span>
                  )}
                </div>

                {/* Stats - Compact */}
                <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-text-muted mb-2">
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>{club.members?.length || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>{club.teams?.length || 0} teams</span>
                  </div>
                </div>

                {/* Club Code - Compact */}
                <div className="pt-2 border-t border-white/10">
                  <p className="text-[9px] sm:text-[10px] text-text-muted truncate">
                    {t('clubs.clubCode')}: <span className="font-mono font-semibold text-app-cyan">{club.clubCode}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          /* Empty State - Compact */
          <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-6 sm:p-8 text-center">
            <svg
              className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-text-muted mb-3"
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
            <h3 className="text-sm sm:text-base font-medium text-text-primary mb-1">
              {t('clubs.list.noClubs')}
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary mb-4">
              {t('clubs.list.noClubsDescription')}
            </p>
            {can(PERMISSIONS.CREATE_CLUB) && (
              <Link
                to="/clubs/create"
                className="inline-flex items-center px-4 sm:px-5 py-2 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
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


