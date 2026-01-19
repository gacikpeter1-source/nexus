/**
 * Dashboard Page
 * Main landing page after login - Shows user's clubs
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getUserClubs } from '../services/firebase/clubs';
import type { Club } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

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
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/clubs/create')}
            className="px-3 py-1.5 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-medium whitespace-nowrap"
          >
            ➕ {t('dashboard.actions.createClub')}
          </button>
          <button
            onClick={() => navigate('/join-request')}
            className="px-3 py-1.5 text-xs sm:text-sm bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all duration-300 font-medium whitespace-nowrap"
          >
            🔗 {t('dashboard.actions.joinClub')}
          </button>
        </div>

        {/* Clubs Grid */}
        {clubs.length === 0 ? (
          <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-6 sm:p-8 text-center">
            <p className="text-base sm:text-lg text-text-primary mb-1">{t('dashboard.noClubs')}</p>
            <p className="text-xs sm:text-sm text-text-secondary">{t('dashboard.noClubsHint')}</p>
          </div>
        ) : (
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-text-primary mb-2 sm:mb-3">
              {t('dashboard.yourClubs')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  to={`/clubs/${club.id}`}
                  className="bg-app-card shadow-card rounded-xl border border-white/10 p-3 sm:p-4 hover:border-app-blue hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Club Logo/Icon - Smaller */}
                    {club.logoURL ? (
                      <img
                        src={club.logoURL}
                        alt={club.name}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-app-blue flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white text-base sm:text-xl font-bold shadow-button flex-shrink-0">
                        {club.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Club Name */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-text-primary truncate group-hover:text-app-cyan transition-colors">
                        {club.name}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-text-muted truncate">
                        {t(`clubs.types.${club.clubType.toLowerCase()}`)}
                      </p>
                    </div>

                    {/* Arrow Icon - Smaller */}
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted group-hover:text-app-cyan group-hover:translate-x-0.5 transition-all flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
