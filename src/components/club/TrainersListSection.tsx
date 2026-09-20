/**
 * Trainers List Section
 * Display club-wide trainers with their team assignments
 * Mobile-first design
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Club, User } from '../../types';
import { getUserTeamsWithRole, removeClubTrainer, addClubTrainer } from '../../services/firebase/clubs';
import { getClubUsers } from '../../services/firebase/users';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface TrainersListSectionProps {
  club: Club;
  onUpdate: () => void;
  canManage: boolean; // Whether current user can manage trainers
}

export default function TrainersListSection({ club, onUpdate, canManage }: TrainersListSectionProps) {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const [trainers, setTrainers] = useState<Array<{ userId: string; user?: User; teams: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);

  // Candidates are restricted to users already a member of THIS club
  // (clubIds array-contains club.id) — never the whole Nexus user base.
  // Showing people from other clubs in this picker would leak their
  // name/email across club boundaries.
  const [clubMembers, setClubMembers] = useState<User[]>([]);
  const [loadingClubMembers, setLoadingClubMembers] = useState(false);

  useEffect(() => {
    loadTrainers();
  }, [club]);

  useEffect(() => {
    if (!showAddModal || !club.id) return;
    let cancelled = false;
    setLoadingClubMembers(true);
    getClubUsers(club.id)
      .then(users => {
        if (!cancelled) setClubMembers(users.filter(u => !(u as any).managedByParentId));
      })
      .catch(error => {
        console.error('Error loading club members:', error);
        if (!cancelled) setSearchError(t('clubs.trainers.errors.searchFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingClubMembers(false);
      });
    return () => { cancelled = true; };
  }, [showAddModal, club.id]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) {
      setSearchResults([]);
      if (!loadingClubMembers) setSearchError('');
      return;
    }

    const filtered = clubMembers.filter(
      u =>
        u.id !== club.ownerId &&
        !(club.trainers || []).includes(u.id) &&
        (u.displayName?.toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term))
    ).slice(0, 8);

    setSearchResults(filtered);
    if (!loadingClubMembers) {
      setSearchError(filtered.length === 0 ? t('clubs.trainers.errors.notFound') : '');
    }
  }, [searchTerm, clubMembers, loadingClubMembers, club.ownerId, club.trainers]);

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

  const resetAddModal = () => {
    setShowAddModal(false);
    setSearchTerm('');
    setSearchError('');
    setSearchResults([]);
    setFoundUser(null);
  };

  const handleSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setFoundUser(null);
  };

  const handleSelectUser = (user: User) => {
    setFoundUser(user);
    setSearchResults([]);
    setSearchTerm(user.displayName || user.email || '');
  };

  const handleAddTrainer = async () => {
    if (!foundUser || !currentUser) return;
    setAdding(true);
    try {
      await addClubTrainer(club.id!, foundUser.id, currentUser.id);
      resetAddModal();
      await loadTrainers();
      onUpdate();
    } catch (error: any) {
      setSearchError(error?.message || t('clubs.trainers.errors.addFailed'));
    } finally {
      setAdding(false);
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
            onClick={() => setShowAddModal(true)}
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

      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={resetAddModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-5">
              <h2 className="text-base font-bold text-text-primary mb-1">{t('clubs.trainers.addTitle')}</h2>
              <p className="text-xs text-text-secondary mb-4">{t('clubs.trainers.addDescription')}</p>

              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => handleSearchTermChange(e.target.value)}
                  placeholder={t('clubs.trainers.searchPlaceholder')}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
                {loadingClubMembers && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-app-cyan/30 border-t-app-cyan rounded-full animate-spin"></div>
                )}

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-app-secondary border border-white/10 rounded-xl shadow-2xl overflow-hidden z-10 max-h-56 overflow-y-auto">
                    {searchResults.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-app-card transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {u.displayName?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{u.displayName}</p>
                          <p className="text-xs text-text-muted truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {searchError && searchResults.length === 0 && (
                <p className="text-xs text-chart-pink mt-2">{searchError}</p>
              )}

              {foundUser && (
                <div className="mt-3 bg-app-secondary rounded-xl p-3 border border-app-cyan/30 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {foundUser.displayName?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{foundUser.displayName}</p>
                    <p className="text-xs text-text-muted truncate">{foundUser.email}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={resetAddModal}
                  disabled={adding}
                  className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleAddTrainer}
                  disabled={!foundUser || adding}
                  className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
                >
                  {adding ? t('common.saving') : t('clubs.trainers.addButton')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

