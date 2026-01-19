/**
 * Trainers List Section
 * Display club-wide trainers with their team assignments
 * Mobile-first design
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Club, User } from '../../types';
import { getUserTeamsWithRole, removeClubTrainer } from '../../services/firebase/clubs';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface TrainersListSectionProps {
  club: Club;
  onUpdate: () => void;
  canManage: boolean; // Whether current user can manage trainers
}

export default function TrainersListSection({ club, onUpdate, canManage }: TrainersListSectionProps) {
  const { t } = useLanguage();
  const [trainers, setTrainers] = useState<Array<{ userId: string; user?: User; teams: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadTrainers();
  }, [club]);

  const loadTrainers = async () => {
    setLoading(true);
    try {
      const trainersList = await Promise.all(
        (club.trainers || []).map(async (trainerId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', trainerId));
            const userData = userDoc.exists() ? { id: trainerId, ...userDoc.data() } as User : undefined;
            
            // Get teams where this trainer is a trainer
            const teams = getUserTeamsWithRole(club, trainerId, 'trainer');

            return {
              userId: trainerId,
              user: userData,
              teams,
            };
          } catch (error) {
            console.error(`Error loading trainer ${trainerId}:`, error);
            return {
              userId: trainerId,
              teams: [],
            };
          }
        })
      );

      setTrainers(trainersList);
    } catch (error) {
      console.error('Error loading trainers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTrainer = async (trainerId: string) => {
    const confirmed = confirm('Are you sure you want to remove this trainer? They will be removed from all teams.');
    if (!confirmed) return;

    setRemoving(trainerId);
    try {
      await removeClubTrainer(club.id!, trainerId);
      await loadTrainers();
      onUpdate();
    } catch (error: any) {
      alert(error.message || 'Error removing trainer');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {t('clubs.trainers.title')}
        </h3>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
        <h3 className="text-sm sm:text-base md:text-lg font-semibold text-text-primary">
          {t('clubs.trainers.title')} ({trainers.length})
        </h3>
        
        {canManage && (
          <button
            className="px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs md:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold whitespace-nowrap"
          >
            + Add
          </button>
        )}
      </div>

      {trainers.length === 0 ? (
        <div className="text-center py-6 sm:py-8">
          <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-xs sm:text-sm text-text-secondary">No trainers assigned</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainers.map(({ userId, user: trainerUser, teams }) => (
            <div
              key={userId}
              className="bg-app-secondary rounded-xl p-2 sm:p-3 md:p-4 border border-white/10"
            >
              <div className="flex items-start gap-2 sm:gap-3">
                {/* Avatar */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                  {trainerUser?.displayName?.charAt(0).toUpperCase() || '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm md:text-base font-semibold text-text-primary truncate">
                    {trainerUser?.displayName || userId}
                  </p>
                  <p className="text-[10px] sm:text-xs md:text-sm text-text-muted truncate mb-1 sm:mb-2">
                    {trainerUser?.email || ''}
                  </p>
                  
                  {/* Teams Badge */}
                  {teams.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-text-muted">Teams:</span>
                      {teams.map((teamName, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-chart-blue/20 text-chart-blue text-xs font-semibold rounded-full"
                        >
                          {teamName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                {canManage && userId !== club.ownerId && (
                  <button
                    onClick={() => handleRemoveTrainer(userId)}
                    disabled={removing === userId}
                    className="p-2 hover:bg-chart-pink/20 text-chart-pink rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Remove trainer"
                  >
                    {removing === userId ? (
                      <div className="w-5 h-5 border-2 border-chart-pink/30 border-t-chart-pink rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 bg-app-blue/10 border border-app-blue/20 rounded-xl p-3">
        <p className="text-xs text-text-secondary">
          <strong className="text-app-cyan">Note:</strong> Club trainers have privileges across all teams. They can manage team members and create events.
        </p>
      </div>
    </div>
  );
}

