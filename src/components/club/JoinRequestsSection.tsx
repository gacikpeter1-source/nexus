/**
 * Join Requests Section
 * Display and manage pending join requests for a club
 * Mobile-first design
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Club, User } from '../../types';
import { JoinRequest, getClubJoinRequests, approveJoinRequest, rejectJoinRequest } from '../../services/firebase/requests';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface JoinRequestsSectionProps {
  club: Club;
  onUpdate: () => void;
}

export default function JoinRequestsSection({ club, onUpdate }: JoinRequestsSectionProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [requests, setRequests] = useState<Array<JoinRequest & { user?: User; teamName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [club.id]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const clubRequests = await getClubJoinRequests(club.id!);
      
      // Load user data for each request
      const requestsWithUsers = await Promise.all(
        clubRequests.map(async (request) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', request.userId));
            const userData = userDoc.exists() ? { id: request.userId, ...userDoc.data() } as User : undefined;
            
            // Get team name if team request
            let teamName: string | undefined;
            if (request.teamId) {
              const team = club.teams?.find(t => t.id === request.teamId);
              teamName = team?.name;
            }

            return {
              ...request,
              user: userData,
              teamName,
            };
          } catch (error) {
            console.error(`Error loading user ${request.userId}:`, error);
            return request;
          }
        })
      );

      setRequests(requestsWithUsers);
    } catch (error) {
      console.error('Error loading join requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!user) return;

    setProcessing(requestId);
    try {
      await approveJoinRequest(requestId, user.id);
      await loadRequests();
      onUpdate();
    } catch (error: any) {
      alert(error.message || 'Error approving request');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;

    const confirmed = confirm('Are you sure you want to reject this join request?');
    if (!confirmed) return;

    setProcessing(requestId);
    try {
      await rejectJoinRequest(requestId, user.id);
      await loadRequests();
    } catch (error: any) {
      alert(error.message || 'Error rejecting request');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {t('clubs.joinRequests.title')}
        </h3>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-text-primary mb-4">
          {t('clubs.joinRequests.title')} (0)
        </h3>
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-text-secondary">
            {t('clubs.joinRequests.noRequests')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
      <h3 className="text-sm sm:text-base md:text-lg font-semibold text-text-primary mb-3 sm:mb-4">
        {t('clubs.joinRequests.title')} ({requests.length})
      </h3>

      <div className="space-y-2 sm:space-y-3 md:space-y-4">
        {requests.map((request) => (
          <div
            key={request.id}
            className="bg-app-secondary rounded-xl p-2 sm:p-3 md:p-4 border border-white/10"
          >
            {/* User Info */}
            <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                {request.user?.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm md:text-base font-semibold text-text-primary truncate">
                  {request.user?.displayName || request.userId}
                </p>
                <p className="text-[10px] sm:text-xs md:text-sm text-text-muted truncate">
                  {request.user?.email || ''}
                </p>
                
                {/* Request Type */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-text-secondary">
                    Wants to join:
                  </span>
                  {request.teamName ? (
                    <span className="px-2 py-0.5 bg-chart-purple/20 text-chart-purple text-xs font-semibold rounded-full">
                      Team: {request.teamName}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-chart-cyan/20 text-chart-cyan text-xs font-semibold rounded-full">
                      Club Only
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Invite Code */}
            {request.inviteCode && (
              <div className="mb-3 bg-app-primary rounded-lg p-2 sm:p-3 border border-white/10">
                <p className="text-xs text-text-muted mb-1">Invite Code:</p>
                <code className="text-sm sm:text-base text-app-cyan font-mono font-semibold">
                  {request.inviteCode}
                </code>
              </div>
            )}

            {/* Message */}
            {request.message && (
              <div className="mb-3 bg-app-primary rounded-lg p-2 sm:p-3 border border-white/10">
                <p className="text-xs text-text-muted mb-1">Message:</p>
                <p className="text-xs sm:text-sm text-text-secondary">
                  {request.message}
                </p>
              </div>
            )}

            {/* Request Date */}
            <p className="text-xs text-text-muted mb-3">
              Requested: {new Date(request.requestDate).toLocaleDateString()} {new Date(request.requestDate).toLocaleTimeString()}
            </p>

            {/* Actions */}
            <div className="flex gap-1.5 sm:gap-2">
              <button
                onClick={() => handleApprove(request.id)}
                disabled={processing === request.id}
                className="flex-1 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-[10px] sm:text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing === request.id ? (
                  <span className="flex items-center justify-center gap-1 sm:gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span className="hidden sm:inline">Processing...</span>
                  </span>
                ) : (
                  <>✓ {t('clubs.joinRequests.approve')}</>
                )}
              </button>
              
              <button
                onClick={() => handleReject(request.id)}
                disabled={processing === request.id}
                className="flex-1 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-app-primary border border-chart-pink/50 text-chart-pink rounded-lg hover:bg-chart-pink/10 transition-all duration-300 font-semibold text-[10px] sm:text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✗ {t('clubs.joinRequests.reject')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

