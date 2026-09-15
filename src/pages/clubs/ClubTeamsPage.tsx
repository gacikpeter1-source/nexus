/**
 * Club Teams Selection Page
 * Shows teams where user is a member - Mobile-first design
 * Regular members see this instead of ClubView
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import Container from '../../components/layout/Container';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { createJoinRequest, getUserJoinRequests } from '../../services/firebase/requests';
import type { Team, Club } from '../../types';

export default function ClubTeamsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTeamIds, setPendingTeamIds] = useState<string[]>([]);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
  const [joinTeamError, setJoinTeamError] = useState('');

  useEffect(() => {
    if (clubId && user) {
      loadClubTeams();
    }
  }, [clubId, user]);

  const loadClubTeams = async () => {
    if (!clubId || !user) return;

    try {
      setLoading(true);

      // Load club
      const clubDoc = await getDoc(doc(db, 'clubs', clubId));
      if (!clubDoc.exists()) {
        throw new Error('Club not found');
      }

      const clubData = { id: clubDoc.id, ...clubDoc.data() } as Club;
      setClub(clubData);

      // Filter teams where user is a member — handle both membersData (new) and members (legacy)
      const teams = clubData.teams?.filter(team => {
        const memberIds = team.membersData
          ? Object.keys(team.membersData)
          : Array.isArray(team.members) ? team.members : [];
        return memberIds.includes(user.id) ||
          team.trainers?.includes(user.id) ||
          team.assistants?.includes(user.id);
      }) || [];

      setUserTeams(teams);

      // Own pending join requests for this club, so already-requested
      // teams show as "pending" instead of being requestable again.
      const myRequests = await getUserJoinRequests(user.id);
      setPendingTeamIds(
        myRequests
          .filter(r => r.clubId === clubId && r.status === 'pending' && r.teamId)
          .map(r => r.teamId!)
      );
    } catch (error) {
      console.error('Error loading club teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestJoinTeam = async (teamId: string) => {
    if (!user || !clubId) return;

    setJoiningTeamId(teamId);
    setJoinTeamError('');
    try {
      await createJoinRequest({ userId: user.id, clubId, teamId });
      setPendingTeamIds(prev => [...prev, teamId]);
    } catch (err: any) {
      setJoinTeamError(err.message || t('joinRequest.error'));
    } finally {
      setJoiningTeamId(null);
    }
  };

  if (loading) {
    return (
      <Container>
        <div className="text-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-app-cyan mx-auto mb-3 sm:mb-4"></div>
          <p className="text-xs sm:text-sm text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!club) {
    return (
      <Container>
        <div className="text-center py-8 sm:py-12">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary mb-3 sm:mb-4">
            {t('clubs.notFound.title')}
          </h2>
          <button
            onClick={() => navigate('/')}
            className="px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            {t('common.backToDashboard')}
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-2 sm:space-y-3">
        {/* Compact Header */}
        <div className="bg-app-card rounded-lg sm:rounded-xl border border-white/10 p-2 sm:p-3">
          {/* Breadcrumb */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors text-[10px] sm:text-xs mb-2"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.backToDashboard')}
          </button>

          {/* Compact Club Info */}
          <div className="flex items-center gap-2">
            {club.logoURL ? (
              <img
                src={club.logoURL}
                alt={club.name}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border-2 border-white/10 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0">
                {club.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-text-primary truncate">
                {club.name}
              </h1>
              <p className="text-[10px] sm:text-xs text-text-secondary">
                {t('clubs.selectYourTeam')}
              </p>
            </div>

            <button
              onClick={() => { setJoinTeamError(''); setTeamSearch(''); setShowJoinTeamModal(true); }}
              className="flex-shrink-0 px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs bg-app-secondary text-text-primary rounded-lg border border-white/10 hover:bg-white/5 transition-all font-semibold"
            >
              {t('teams.joinAnotherTeam')}
            </button>
          </div>
        </div>

        {/* Teams List - Inline Stats */}
        {userTeams.length > 0 ? (
          <div className="space-y-2">
            {userTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}
                className="relative w-full overflow-hidden rounded-lg sm:rounded-xl border border-white/10 hover:border-app-cyan/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-button text-left group"
              >
                {/* Background Image Overlay */}
                {team.backgroundImageURL && (
                  <div 
                    className="absolute inset-0 bg-cover bg-center opacity-10 group-hover:opacity-15 transition-opacity"
                    style={{ backgroundImage: `url(${team.backgroundImageURL})` }}
                  />
                )}
                
                {/* Gradient Overlay for better text readability */}
                <div className="absolute inset-0 bg-gradient-to-r from-app-card/95 via-app-card/90 to-app-card/80" />
                
                {/* Content */}
                <div className="relative flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3">
                  {/* Team Logo */}
                  {team.logoURL ? (
                    <img
                      src={team.logoURL}
                      alt={team.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover border-2 border-white/10 group-hover:border-app-cyan/50 transition-colors flex-shrink-0 shadow-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0 group-hover:scale-105 transition-transform shadow-lg">
                      {team.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Team Name & Category */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-text-primary truncate group-hover:text-app-cyan transition-colors">
                      {team.name}
                    </h3>
                    {team.category && (
                      <p className="text-[10px] sm:text-xs text-text-muted truncate">
                        {team.category}
                      </p>
                    )}
                  </div>

                  {/* Inline Stats */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-app-blue flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-xs sm:text-sm font-semibold text-text-primary">
                        {team.trainers?.length || 0}
                      </span>
                    </div>
                    
                    <div className="w-px h-5 bg-white/20"></div>
                    
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chart-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="text-xs sm:text-sm font-semibold text-text-primary">
                        {team.members?.length || 0}
                      </span>
                    </div>
                  </div>

                  {/* Arrow Icon */}
                  <svg className="w-5 h-5 text-app-cyan flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-app-card rounded-lg sm:rounded-xl border border-white/10 p-6 sm:p-8 text-center">
            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-sm sm:text-base font-bold text-text-primary mb-2">
              {t('teams.noTeamsFound')}
            </h3>
            <p className="text-xs text-text-secondary mb-3">
              {t('teams.notMemberOfAnyTeam')}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => { setJoinTeamError(''); setTeamSearch(''); setShowJoinTeamModal(true); }}
                className="px-4 py-2 text-xs bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
              >
                {t('teams.joinTeam')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 text-xs bg-app-secondary text-text-primary rounded-lg border border-white/10 hover:bg-white/5 transition-all font-semibold"
              >
                {t('common.backToDashboard')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Join a team modal */}
      {showJoinTeamModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setShowJoinTeamModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-text-primary">{t('teams.joinTeamModalTitle')}</h2>
                <button onClick={() => setShowJoinTeamModal(false)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>

              <input
                type="text"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder={t('teams.searchTeamPlaceholder')}
                autoFocus
                className="w-full px-3 py-2 mb-3 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              />

              {joinTeamError && (
                <p className="text-xs text-chart-pink mb-3">{joinTeamError}</p>
              )}

              {(() => {
                const joinedTeamIds = new Set(userTeams.map(t => t.id));
                const candidateTeams = (club.teams || [])
                  .filter(t => !joinedTeamIds.has(t.id))
                  .filter(t => t.name.toLowerCase().includes(teamSearch.trim().toLowerCase()));

                if (candidateTeams.length === 0) {
                  return (
                    <p className="text-center text-sm text-text-secondary py-4">
                      {t('teams.noOtherTeamsAvailable')}
                    </p>
                  );
                }

                return (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {candidateTeams.map((team) => {
                      const isPending = pendingTeamIds.includes(team.id);
                      return (
                        <div key={team.id} className="flex items-center gap-2.5 p-2 bg-app-secondary rounded-lg">
                          {team.logoURL ? (
                            <img src={team.logoURL} alt={team.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {team.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-text-primary truncate">{team.name}</p>
                            {team.category && (
                              <p className="text-[10px] text-text-muted truncate">{team.category}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRequestJoinTeam(team.id)}
                            disabled={isPending || joiningTeamId === team.id}
                            className="px-3 py-1 text-xs bg-gradient-primary text-white rounded-lg font-semibold disabled:opacity-50 flex-shrink-0"
                          >
                            {isPending ? t('teams.requestPending') : (joiningTeamId === team.id ? '…' : t('teams.requestToJoin'))}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </Container>
  );
}

