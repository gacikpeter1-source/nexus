/**
 * Create / Edit Child Account Page
 * Parents create or edit athlete (child) subaccounts and assign them to teams.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { createChildAccount, updateChildProfile } from '../services/firebase/parentChild';
import type { User } from '../types';
import { localDateStr } from '../utils/dateUtils';

interface TeamOption {
  clubId: string;
  clubName: string;
  teamId: string;
  teamName: string;
}

export default function CreateChild() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { childId } = useParams<{ childId: string }>();
  const isEditMode = Boolean(childId);

  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const [availableTeams, setAvailableTeams] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [error, setError] = useState('');

  // Load available teams from parent's clubs
  useEffect(() => {
    if (user) loadAvailableTeams();
  }, [user?.id]);

  // In edit mode, pre-fill form with existing child data
  useEffect(() => {
    if (isEditMode && childId) loadChildData(childId);
  }, [childId]);

  const loadAvailableTeams = async () => {
    if (!user?.clubIds || user.clubIds.length === 0) {
      setTeamsLoading(false);
      return;
    }
    try {
      const results: TeamOption[] = [];
      for (const clubId of user.clubIds) {
        const clubSnap = await getDoc(doc(db, 'clubs', clubId));
        if (!clubSnap.exists()) continue;
        const club = clubSnap.data();
        for (const team of club.teams || []) {
          // Include teams where this parent is a member or trainer
          const memberIds = new Set<string>([
            ...(Array.isArray(team.members) ? team.members : []),
            ...Object.keys(team.membersData || {}),
            ...(team.trainers || []),
          ]);
          if (memberIds.has(user.id)) {
            results.push({ clubId, clubName: club.name, teamId: team.id, teamName: team.name });
          }
        }
      }
      setAvailableTeams(results);
    } catch (err) {
      console.error('CreateChild: error loading teams', err);
    } finally {
      setTeamsLoading(false);
    }
  };

  const loadChildData = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) {
        const child = snap.data() as User;
        setDisplayName(child.displayName || '');
        setDateOfBirth((child as any).dateOfBirth || '');
        setSelectedTeamIds(child.teamIds || []);
      }
    } catch (err) {
      console.error('CreateChild: error loading child', err);
    } finally {
      setInitialLoading(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  // Derive clubIds from selected teams
  const deriveClubIds = (): string[] => {
    const ids = new Set<string>();
    for (const t of availableTeams) {
      if (selectedTeamIds.includes(t.teamId)) ids.add(t.clubId);
    }
    return Array.from(ids);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError(t('parent.nameRequired')); return; }

    setLoading(true);
    setError('');
    try {
      if (isEditMode && childId) {
        await updateChildProfile(childId, {
          displayName: displayName.trim(),
          dateOfBirth,
          teamIds: selectedTeamIds,
          clubIds: deriveClubIds(),
        } as any);
      } else {
        await createChildAccount(user!.id, {
          displayName: displayName.trim(),
          dateOfBirth,
          teamIds: selectedTeamIds,
          clubIds: deriveClubIds(),
        });
      }
      navigate('/profile');
    } catch (err) {
      console.error('CreateChild: submit error', err);
      setError(t('parent.createChildError'));
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="py-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {isEditMode ? t('common.edit') + ' — ' + displayName : t('parent.addChild')}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 space-y-6">
          {error && (
            <div className="bg-chart-pink/10 border border-chart-pink/30 rounded-xl p-4 text-chart-pink text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2">
              {t('parent.childName')} <span className="text-chart-pink">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('parent.childNamePlaceholder')}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue transition-all"
              required
            />
            <p className="mt-1 text-sm text-text-muted">{t('parent.childNameHint')}</p>
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2">
              {t('parent.dateOfBirth')}
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
              max={localDateStr()}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue transition-all"
            />
            <p className="mt-1 text-sm text-text-muted">{t('parent.dateOfBirthHint')}</p>
          </div>

          {/* Team Selection */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              {t('parent.selectTeams')}
            </label>
            <p className="text-xs text-text-muted mb-3">{t('parent.selectTeamsHint')}</p>

            {teamsLoading ? (
              <div className="flex items-center gap-2 py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                <span className="text-sm text-text-muted">{t('common.loading')}</span>
              </div>
            ) : availableTeams.length === 0 ? (
              <p className="text-sm text-text-muted py-2">{t('parent.noTeamsAvailable')}</p>
            ) : (
              <div className="space-y-2">
                {availableTeams.map(({ clubName, teamId, teamName }) => (
                  <label key={teamId} className="flex items-center gap-3 p-3 bg-app-secondary rounded-xl border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(teamId)}
                      onChange={() => toggleTeam(teamId)}
                      className="w-4 h-4 accent-app-cyan flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{teamName}</p>
                      <p className="text-xs text-text-muted">{clubName}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Info box — only on create */}
          {!isEditMode && (
            <div className="bg-app-cyan/10 border border-app-cyan/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-app-cyan mb-2">{t('parent.importantNote')}</h3>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li className="flex items-start gap-2"><span className="text-app-cyan">•</span>{t('parent.childCannotLogin')}</li>
                <li className="flex items-start gap-2"><span className="text-app-cyan">•</span>{t('parent.childManagedByParent')}</li>
                <li className="flex items-start gap-2"><span className="text-app-cyan">•</span>{t('parent.childRsvpByParent')}</li>
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex-1 px-6 py-3 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all font-semibold"
            >
              {loading ? t('common.loading') : isEditMode ? t('common.save') : t('parent.createChild')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}
