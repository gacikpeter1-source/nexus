/**
 * Single Club View Page
 * View club details, teams, members
 * Mobile-first, dark theme design
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import TeamManagementModal from '../../components/club/TeamManagementModal';
import CreateTeamModal from '../../components/club/CreateTeamModal';
import JoinRequestsSection from '../../components/club/JoinRequestsSection';
import TrainersListSection from '../../components/club/TrainersListSection';
import { getClub } from '../../services/firebase/clubs';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Club, Team, User } from '../../types';

export default function ClubView() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useLanguage();
  const { isClubOwner, isTrainer: _isTrainer, user } = usePermissions();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'members' | 'trainers' | 'requests'>('overview');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [membersData, setMembersData] = useState<User[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (clubId && user) {
      loadClub();
    }
  }, [clubId, user]);

  useEffect(() => {
    if (activeTab === 'members' && club && club.members && club.members.length > 0) {
      loadMembersData();
    }
  }, [activeTab, club]);

  const loadClub = async () => {
    if (!clubId || !user) return;

    try {
      const clubData = await getClub(clubId);
      
      if (!clubData) {
        setLoading(false);
        return;
      }
      
      // Check permissions BEFORE setting club to prevent flash
      const userIsOwner = clubData.ownerId === user.id;
      const userIsTrainer = clubData.trainers?.includes(user.id);
      
      // If user is NOT owner or trainer, redirect immediately
      if (!userIsOwner && !userIsTrainer) {
        navigate(`/clubs/${clubId}/teams`, { replace: true });
        setLoading(false);
        return;
      }
      
      setClub(clubData);
    } catch (error) {
      console.error('Error loading club:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembersData = async () => {
    if (!club || !club.members) return;

    setLoadingMembers(true);
    try {
      const membersPromises = club.members.map(async (memberId) => {
        const userDoc = await getDoc(doc(db, 'users', memberId));
        if (userDoc.exists()) {
          return { id: userDoc.id, ...userDoc.data() } as User;
        }
        return null;
      });

      const members = await Promise.all(membersPromises);
      setMembersData(members.filter((m): m is User => m !== null));
    } catch (error) {
      console.error('Error loading members data:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleTeamClick = (team: Team) => {
    setSelectedTeam(team);
    setIsTeamModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsTeamModalOpen(false);
    setSelectedTeam(null);
  };

  const handleUpdateClub = () => {
    loadClub(); // Reload club data
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

  if (!club) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            {t('clubs.notFound.title')}
          </h2>
          <p className="text-text-secondary mb-6">{t('clubs.notFound.description')}</p>
          <Link
            to="/"
            className="px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold inline-block"
          >
            {t('clubs.notFound.backToClubs')}
          </Link>
        </div>
      </Container>
    );
  }

  const canManage = isClubOwner(club.id);

  return (
    <Container>
      <div className="space-y-2 sm:space-y-3">
        {/* Header Card - Compact */}
        <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
          {/* Mobile: Stack layout */}
          <div className="space-y-2">
            {/* Title, Badge & Action Buttons Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {/* Left: Logo + Name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Club Logo - Smaller */}
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
                
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg md:text-xl font-bold text-text-primary break-words">
                    {club.name}
                  </h1>
                  <p className="text-[10px] sm:text-xs text-text-muted capitalize">
                    {t(`clubs.types.${club.clubType.toLowerCase()}`)}
                  </p>
                </div>
              </div>

              {/* Right: Status Badge + Action Buttons (70% smaller) */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                {/* Status Badge */}
                <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 ${
                  club.subscriptionActive
                    ? 'bg-chart-cyan/20 text-chart-cyan'
                    : 'bg-chart-pink/20 text-chart-pink'
                }`}>
                  {club.subscriptionActive ? t('clubs.status.active') : t('clubs.status.expired')}
                </span>

                {/* Action Buttons - 70% Smaller */}
                {canManage && (
                  <>
                    <button
                      onClick={() => navigate(`/clubs/${clubId}/settings`)}
                      className="px-1.5 py-1 text-[8px] sm:text-[9px] bg-gradient-primary text-white rounded shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 font-medium whitespace-nowrap flex-shrink-0"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => navigate(`/calendar/create?clubId=${clubId}`)}
                      className="px-1.5 py-1 text-[8px] sm:text-[9px] bg-app-secondary border border-white/10 text-white rounded hover:bg-white/10 transition-all duration-300 font-medium whitespace-nowrap flex-shrink-0"
                    >
                      Create event
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Club Code - Compact */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <span className="text-[10px] sm:text-xs text-text-secondary whitespace-nowrap">
                {t('clubs.clubCode')}:
              </span>
              <code className="px-1.5 sm:px-2 py-0.5 bg-app-secondary border border-white/10 rounded text-app-cyan font-mono font-semibold text-[10px] sm:text-xs">
                {club.clubCode}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(club.clubCode)}
                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                title="Copy code"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs - Compact */}
        <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {(['overview', 'teams', 'trainers', 'requests', 'members'] as const).map((tab) => {
            // Hide requests tab if user can't manage
            if (tab === 'requests' && !canManage) return null;
            
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 text-[9px] sm:text-[10px] md:text-xs font-medium rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
                  activeTab === tab
                    ? 'bg-app-blue text-white shadow-button'
                    : 'bg-app-secondary text-text-secondary hover:bg-white/10'
                }`}
              >
                {t(`clubs.tabs.${tab}`)}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
            {/* Stats Card: Members - Compact */}
            <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold text-text-secondary">
                    {t('clubs.stats.members')}
                  </p>
                  <p className="mt-1 text-xl sm:text-2xl font-bold text-text-primary">
                    {club.members?.length || 0}
                  </p>
                </div>
                <div className="bg-chart-cyan/20 text-chart-cyan rounded-lg p-1.5 sm:p-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Stats Card: Teams - Compact */}
            <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold text-text-secondary">
                    {t('clubs.stats.teams')}
                  </p>
                  <p className="mt-1 text-xl sm:text-2xl font-bold text-text-primary">
                    {club.teams?.length || 0}
                  </p>
                </div>
                <div className="bg-chart-purple/20 text-chart-purple rounded-lg p-1.5 sm:p-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Stats Card: Trainers - Compact */}
            <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold text-text-secondary">
                    {t('clubs.stats.trainers')}
                  </p>
                  <p className="mt-1 text-xl sm:text-2xl font-bold text-text-primary">
                    {club.trainers?.length || 0}
                  </p>
                </div>
                <div className="bg-chart-blue/20 text-chart-blue rounded-lg p-1.5 sm:p-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="space-y-2 sm:space-y-2.5">
            {/* Create Team Button - Compact */}
            {canManage && (
              <div className="flex justify-end">
                <button
                  onClick={() => setIsCreateTeamModalOpen(true)}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
                >
                  + Create Team
                </button>
              </div>
            )}

            {club.teams && club.teams.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
                {club.teams.map((team) => (
                  <div
                    key={team.id}
                    className="bg-app-card shadow-card rounded-xl border border-white/10 p-2 sm:p-2.5 hover:border-app-blue transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <button
                        onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <h3 className="text-xs sm:text-sm font-semibold text-text-primary group-hover:text-app-cyan transition-colors truncate">
                          {team.name}
                        </h3>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="View Team"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted group-hover:text-app-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {canManage && (
                          <button
                            onClick={() => handleTeamClick(team)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Manage Team"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted group-hover:text-app-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] text-text-muted">
                      <span className="whitespace-nowrap">{team.trainers?.length || 0} Trainers</span>
                      <span>•</span>
                      <span className="whitespace-nowrap">{team.members?.length || 0} {t('clubs.members')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-6 sm:p-8 text-center">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-xs sm:text-sm text-text-secondary mb-3">{t('clubs.noTeams')}</p>
                {canManage && (
                  <button
                    onClick={() => setIsCreateTeamModalOpen(true)}
                    className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
                  >
                    + Create Your First Team
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trainers' && (
          <TrainersListSection 
            club={club} 
            onUpdate={handleUpdateClub}
            canManage={canManage}
          />
        )}

        {activeTab === 'requests' && canManage && (
          <JoinRequestsSection 
            club={club} 
            onUpdate={handleUpdateClub}
          />
        )}

        {activeTab === 'members' && (
          <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary mb-2 sm:mb-3">
              {t('clubs.membersList')} ({club.members?.length || 0})
            </h3>
            {loadingMembers ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto mb-2"></div>
                <p className="text-xs sm:text-sm text-text-secondary">Loading members...</p>
              </div>
            ) : membersData.length > 0 ? (
              <div className="space-y-1.5 sm:space-y-2">
                {membersData.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-app-secondary rounded-xl"
                  >
                    {member.photoURL ? (
                      <img
                        src={member.photoURL}
                        alt={member.displayName}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-app-blue flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                        {member.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                        {member.displayName}
                      </p>
                      <p className="text-[10px] sm:text-xs text-text-muted truncate">
                        {member.email}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs sm:text-sm text-text-secondary py-6 sm:py-8">
                {t('clubs.noMembers')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Team Management Modal */}
      {selectedTeam && (
        <TeamManagementModal
          clubId={club.id!}
          team={selectedTeam}
          isOpen={isTeamModalOpen}
          onClose={handleCloseModal}
          onUpdate={handleUpdateClub}
          canManage={canManage}
        />
      )}

      {/* Create Team Modal */}
      <CreateTeamModal
        clubId={club.id!}
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleUpdateClub}
      />
    </Container>
  );
}
