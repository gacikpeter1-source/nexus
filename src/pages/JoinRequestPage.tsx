/**
 * Join Request Page
 * User can request to join a club and team
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { createJoinRequest } from '../services/firebase/requests';
import type { Club } from '../types';

export default function JoinRequestPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllClubs();
  }, []);

  const loadAllClubs = async () => {
    try {
      const clubsSnapshot = await getDocs(collection(db, 'clubs'));
      const clubsData = clubsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Club[];
      setClubs(clubsData);
    } catch (error) {
      console.error('Error loading clubs:', error);
      setError(t('joinRequest.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError(t('joinRequest.notLoggedIn'));
      return;
    }

    if (!selectedClubId) {
      setError(t('joinRequest.selectClub'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createJoinRequest({
        userId: user.id,
        clubId: selectedClubId,
        teamId: selectedTeamId || undefined,
        inviteCode: inviteCode.trim() || undefined,
        message: message || undefined,
      });

      alert(t('joinRequest.success'));
      navigate('/');
    } catch (err: any) {
      console.error('Error creating join request:', err);
      setError(err.message || t('joinRequest.error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Filter clubs by search term
  const filteredClubs = clubs.filter(club =>
    club.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedClub = clubs.find(c => c.id === selectedClubId);
  const availableTeams = selectedClub?.teams || [];

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
    <Container className="max-w-2xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-text-primary">{t('joinRequest.title')}</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-6 space-y-6">
          {/* Search Clubs */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('joinRequest.searchClubs')}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('joinRequest.searchPlaceholder')}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          {/* Select Club */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('joinRequest.selectClub')} *
            </label>
            <select
              value={selectedClubId}
              onChange={(e) => {
                setSelectedClubId(e.target.value);
                setSelectedTeamId(''); // Reset team when club changes
              }}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              required
            >
              <option value="">{t('joinRequest.chooseClub')}</option>
              {filteredClubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name} ({t(`clubs.types.${club.clubType.toLowerCase()}`)})
                </option>
              ))}
            </select>
            {filteredClubs.length === 0 && searchTerm && (
              <p className="text-xs text-text-muted mt-1">{t('joinRequest.noClubsFound')}</p>
            )}
          </div>

          {/* Select Team (Optional) */}
          {selectedClubId && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('joinRequest.selectTeam')} ({t('common.optional')})
              </label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">{t('joinRequest.anyTeam')}</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {availableTeams.length === 0 && (
                <p className="text-xs text-text-muted mt-1">{t('joinRequest.noTeams')}</p>
              )}
            </div>
          )}

          {/* Invite Code (Optional) */}
          {selectedClubId && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('joinRequest.inviteCode')} ({t('common.optional')})
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={t('joinRequest.inviteCodePlaceholder')}
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue font-mono"
              />
              <p className="text-xs text-text-muted mt-1">{t('joinRequest.inviteCodeHelp')}</p>
            </div>
          )}

          {/* Message (Optional) */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('joinRequest.message')} ({t('common.optional')})
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t('joinRequest.messagePlaceholder')}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-chart-pink/20 border border-chart-pink/30 rounded-xl p-4">
              <p className="text-sm text-chart-pink font-medium">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedClubId}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('joinRequest.submitting') : t('joinRequest.submit')}
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="bg-app-blue/10 border border-app-blue/30 rounded-xl p-4">
          <p className="text-sm text-app-cyan">
            ℹ️ {t('joinRequest.info')}
          </p>
        </div>
      </div>
    </Container>
  );
}

