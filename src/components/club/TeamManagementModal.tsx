/**
 * Team Management Modal
 * Mobile-first modal for managing team members and roles
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Team, User, TeamMemberRole } from '../../types';
import { getTeamMembers, updateTeamMemberRole, removeTeamMemberWithValidation, canDeleteTeam, getTrainerCount } from '../../services/firebase/teams';
import { updateTeam, deleteTeam } from '../../services/firebase/clubs';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface TeamManagementModalProps {
  clubId: string;
  team: Team;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  canManage: boolean; // Whether current user can manage this team
}

export default function TeamManagementModal({
  clubId,
  team,
  isOpen,
  onClose,
  onUpdate,
  canManage,
}: TeamManagementModalProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [members, setMembers] = useState<Array<{ userId: string; role: TeamMemberRole; user?: User }>>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Team editing state
  const [editMode, setEditMode] = useState(false);
  const [teamName, setTeamName] = useState(team.name);
  const [teamLogo, setTeamLogo] = useState(team.logoURL || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMembers();
    }
  }, [isOpen, team]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const teamMembers = getTeamMembers(team);
      
      // Load user data for each member
      const membersList = await Promise.all(
        Object.entries(teamMembers).map(async ([userId, memberData]) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            return {
              userId,
              role: memberData.role,
              user: userDoc.exists() ? { id: userId, ...userDoc.data() } as User : undefined,
            };
          } catch (error) {
            console.error(`Error loading user ${userId}:`, error);
            return { userId, role: memberData.role };
          }
        })
      );

      // Sort by role: trainers first, then assistants, then users
      membersList.sort((a, b) => {
        const roleOrder = { trainer: 0, assistant: 1, user: 2 };
        return roleOrder[a.role] - roleOrder[b.role];
      });

      setMembers(membersList);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: TeamMemberRole) => {
    if (!canManage || !user) return;

    setUpdating(true);
    try {
      await updateTeamMemberRole(clubId, team.id, userId, newRole, user.id);
      await loadMembers();
      onUpdate();
    } catch (error: any) {
      alert(error.message || 'Error updating role');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!canManage) return;

    const confirmed = confirm('Are you sure you want to remove this member from the team?');
    if (!confirmed) return;

    setUpdating(true);
    try {
      await removeTeamMemberWithValidation(clubId, team.id, userId);
      await loadMembers();
      onUpdate();
    } catch (error: any) {
      alert(error.message || 'Error removing member');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveTeamDetails = async () => {
    if (!canManage || !user) return;

    if (!teamName.trim()) {
      alert('Team name cannot be empty');
      return;
    }

    setSaving(true);
    try {
      await updateTeam(clubId, team.id, {
        name: teamName.trim(),
        logoURL: teamLogo.trim() || undefined,
      });
      
      setEditMode(false);
      onUpdate();
      alert('Team updated successfully!');
    } catch (error: any) {
      alert(error.message || 'Error updating team');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!canManage || !user) return;

    // Validate if team can be deleted
    const trainerCount = getTrainerCount(team);
    const canDelete = canDeleteTeam(team, user.id);

    if (!canDelete && trainerCount > 1) {
      alert('Cannot delete team: Multiple trainers exist. You can only delete a team if you are the only trainer.');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete team "${team.name}"?\n\n` +
      `This will remove ${members.length} member(s) and cannot be undone.`
    );
    
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteTeam(clubId, team.id);
      onUpdate();
      onClose();
      alert('Team deleted successfully!');
    } catch (error: any) {
      alert(error.message || 'Error deleting team');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden">
        <div className="bg-app-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary truncate">
                {team.name}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canManage && !editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Edit team"
                >
                  <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
                <p className="text-text-secondary">{t('common.loading')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Edit Team Form */}
                {editMode && canManage && (
                  <div className="bg-app-secondary rounded-xl p-3 sm:p-4 border border-app-blue/30 space-y-3 sm:space-y-4">
                    <h3 className="text-sm sm:text-base font-semibold text-text-primary">Edit Team Details</h3>
                    
                    {/* Team Name */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1 sm:mb-2">
                        Team Name *
                      </label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full px-3 py-2 text-sm sm:text-base bg-app-primary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                        placeholder="Enter team name..."
                      />
                    </div>

                    {/* Team Logo URL */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1 sm:mb-2">
                        Logo URL (optional)
                      </label>
                      <input
                        type="url"
                        value={teamLogo}
                        onChange={(e) => setTeamLogo(e.target.value)}
                        className="w-full px-3 py-2 text-sm sm:text-base bg-app-primary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                        placeholder="https://example.com/logo.png"
                      />
                      {teamLogo && (
                        <div className="mt-2">
                          <img 
                            src={teamLogo} 
                            alt="Team logo preview" 
                            className="w-16 h-16 rounded-lg object-cover border border-white/10"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTeamDetails}
                        disabled={saving}
                        className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => {
                          setEditMode(false);
                          setTeamName(team.name);
                          setTeamLogo(team.logoURL || '');
                        }}
                        disabled={saving}
                        className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-app-primary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all duration-300 font-semibold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Team Description */}
                {team.description && !editMode && (
                  <div className="bg-app-secondary rounded-xl p-3 sm:p-4 border border-white/10">
                    <p className="text-xs sm:text-sm text-text-secondary">{team.description}</p>
                  </div>
                )}

                {/* Members List */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-text-primary mb-3">
                    {t('clubs.members')} ({members.length})
                  </h3>

                  <div className="space-y-2">
                    {members.map(({ userId, role, user: memberUser }) => (
                      <div
                        key={userId}
                        className="bg-app-secondary rounded-xl p-2 sm:p-3 md:p-4 flex items-center gap-2 sm:gap-3 border border-white/10"
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                          {memberUser?.displayName?.charAt(0).toUpperCase() || '?'}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm md:text-base font-semibold text-text-primary truncate">
                            {memberUser?.displayName || userId}
                          </p>
                          <p className="text-[10px] sm:text-xs md:text-sm text-text-muted truncate">
                            {memberUser?.email || ''}
                          </p>
                        </div>

                        {/* Role Badge & Actions */}
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          {canManage ? (
                            <select
                              value={role}
                              onChange={(e) => handleRoleChange(userId, e.target.value as TeamMemberRole)}
                              disabled={updating || userId === user?.id}
                              className="px-1.5 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm bg-app-primary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue disabled:opacity-50"
                            >
                              <option value="trainer">Trainer</option>
                              <option value="assistant">Assistant</option>
                              <option value="user">User</option>
                            </select>
                          ) : (
                            <span className={`px-2 sm:px-3 py-1 text-xs font-semibold rounded-full ${
                              role === 'trainer' ? 'bg-chart-blue/20 text-chart-blue' :
                              role === 'assistant' ? 'bg-chart-purple/20 text-chart-purple' :
                              'bg-chart-cyan/20 text-chart-cyan'
                            }`}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </span>
                          )}

                          {canManage && userId !== user?.id && (
                            <button
                              onClick={() => handleRemoveMember(userId)}
                              disabled={updating}
                              className="p-1.5 sm:p-2 hover:bg-chart-pink/20 text-chart-pink rounded-lg transition-colors disabled:opacity-50"
                              title="Remove member"
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-app-blue/10 border border-app-blue/20 rounded-xl p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-text-secondary">
                    <strong className="text-app-cyan">Note:</strong> Teams must have at least one trainer. The last trainer cannot be demoted or removed.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 sm:p-4 md:p-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Delete Team Button (Left side) */}
            {canManage && !editMode && (
              <button
                onClick={handleDeleteTeam}
                disabled={saving}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-chart-pink/20 border border-chart-pink/50 text-chart-pink rounded-xl hover:bg-chart-pink/30 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed order-2 sm:order-1"
              >
                🗑️ Delete Team
              </button>
            )}
            
            {/* Close Button (Right side) */}
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold text-sm sm:text-base disabled:opacity-50 order-1 sm:order-2 sm:ml-auto"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

