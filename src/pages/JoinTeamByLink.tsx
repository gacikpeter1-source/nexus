/**
 * Join Team By Link Page
 * Handles QR code/link-based team join requests
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Container from '../components/layout/Container';
import { requestToJoinTeam } from '../services/firebase/teams';
import { getTeam } from '../services/firebase/teams';
import type { Team } from '../types';

export default function JoinTeamByLink() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const teamId = searchParams.get('teamId');
  const clubId = searchParams.get('clubId');

  useEffect(() => {
    if (!teamId || !clubId) {
      setError('Invalid join link - missing team or club information');
      setLoading(false);
      return;
    }

    if (!user) {
      // Store the intended destination and redirect to login
      sessionStorage.setItem('redirectAfterLogin', window.location.href);
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    loadTeamAndJoin();
  }, [user, teamId, clubId]);

  const loadTeamAndJoin = async () => {
    if (!user || !teamId || !clubId) return;

    try {
      // Load team details
      const teamData = await getTeam(clubId, teamId);
      if (!teamData) {
        setError('Team not found');
        setLoading(false);
        return;
      }

      setTeam(teamData);

      // Check if user is already a member
      if (teamData.members?.includes(user.id)) {
        setError('You are already a member of this team');
        setLoading(false);
        return;
      }

      // Check if user already has a pending request
      if (teamData.joinRequests?.some((req: any) => req.userId === user.id && req.status === 'pending')) {
        setError('You already have a pending join request for this team');
        setLoading(false);
        return;
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading team:', err);
      setError('Failed to load team information');
      setLoading(false);
    }
  };

  const handleJoinRequest = async () => {
    if (!user || !teamId || !clubId) return;

    setProcessing(true);
    setError('');

    try {
      await requestToJoinTeam(clubId, teamId, user.id);
      setSuccess(true);
      
      // Redirect to team page after a short delay
      setTimeout(() => {
        navigate(`/clubs/${clubId}/teams/${teamId}`);
      }, 2000);
    } catch (err: any) {
      console.error('Error requesting to join team:', err);
      setError(err.message || 'Failed to send join request');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Container className="max-w-2xl py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading team information...</p>
        </div>
      </Container>
    );
  }

  if (success) {
    return (
      <Container className="max-w-2xl py-8">
        <div className="bg-app-card rounded-2xl border border-white/10 p-6 text-center">
          <div className="w-16 h-16 bg-chart-cyan/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-chart-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Join Request Sent!</h2>
          <p className="text-text-secondary mb-4">
            Your request to join <span className="font-semibold text-text-primary">{team?.name}</span> has been sent to the team trainers.
          </p>
          <p className="text-sm text-text-muted">Redirecting you to the team page...</p>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="max-w-2xl py-8">
        <div className="bg-app-card rounded-2xl border border-white/10 p-6">
          <div className="w-16 h-16 bg-chart-pink/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2 text-center">Unable to Join</h2>
          <p className="text-text-secondary text-center mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
            >
              Go Home
            </button>
            {clubId && (
              <button
                onClick={() => navigate(`/clubs/${clubId}`)}
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
              >
                View Club
              </button>
            )}
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-8">
      <div className="bg-app-card rounded-2xl border border-white/10 p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-app-blue/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-app-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Join Team</h2>
          <p className="text-text-secondary">You've been invited to join</p>
        </div>

        {team && (
          <div className="bg-app-secondary border border-white/10 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-text-primary mb-1">{team.name}</h3>
            {team.description && (
              <p className="text-sm text-text-secondary mb-2">{team.description}</p>
            )}
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{team.members?.length || 0} members</span>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleJoinRequest}
            disabled={processing}
            className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Sending Request...' : 'Request to Join'}
          </button>
        </div>
      </div>
    </Container>
  );
}
