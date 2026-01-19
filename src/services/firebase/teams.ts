/**
 * Firebase Service: Teams
 * Advanced team management with role-based permissions
 * Based on: docs/07-clubs-teams.md (Nexus)
 */

import {
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Club, Team, TeamMemberData, TeamMemberRole } from '../../types';

/**
 * Get team from club
 */
export async function getTeam(clubId: string, teamId: string): Promise<Team | null> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      return null;
    }

    const club = clubDoc.data() as Club;
    const team = club.teams?.find(t => t.id === teamId);

    return team || null;
  } catch (error) {
    console.error('Error getting team:', error);
    throw error;
  }
}

/**
 * Get team members with their roles
 * Returns enhanced member data if available, fallback to legacy format
 */
export function getTeamMembers(team: Team): { [userId: string]: TeamMemberData } {
  // Use new format if available
  if (team.membersData) {
    return team.membersData;
  }

  // Fallback: Convert legacy format to new format
  const membersData: { [userId: string]: TeamMemberData } = {};

  // Add trainers
  team.trainers?.forEach(userId => {
    membersData[userId] = {
      role: 'trainer',
      joinedAt: team.createdAt || new Date().toISOString(),
    };
  });

  // Add assistants
  team.assistants?.forEach(userId => {
    membersData[userId] = {
      role: 'assistant',
      joinedAt: team.createdAt || new Date().toISOString(),
    };
  });

  // Add regular members (exclude trainers and assistants)
  team.members?.forEach(userId => {
    if (!membersData[userId]) {
      membersData[userId] = {
        role: 'user',
        joinedAt: team.createdAt || new Date().toISOString(),
      };
    }
  });

  return membersData;
}

/**
 * Get team members by role
 */
export function getMembersByRole(team: Team, role: TeamMemberRole): string[] {
  const members = getTeamMembers(team);
  return Object.entries(members)
    .filter(([_, data]) => data.role === role)
    .map(([userId]) => userId);
}

/**
 * Get trainer count
 */
export function getTrainerCount(team: Team): number {
  return getMembersByRole(team, 'trainer').length;
}

/**
 * Check if user is trainer in team
 */
export function isTeamTrainer(team: Team, userId: string): boolean {
  const members = getTeamMembers(team);
  return members[userId]?.role === 'trainer';
}

/**
 * Check if user is assistant in team
 */
export function isTeamAssistant(team: Team, userId: string): boolean {
  const members = getTeamMembers(team);
  return members[userId]?.role === 'assistant';
}

/**
 * Check if user can delete team
 * Business Rule: Can delete if only 1 trainer exists OR user is the only trainer
 */
export function canDeleteTeam(team: Team, userId: string): boolean {
  const trainerCount = getTrainerCount(team);
  
  // Can delete if only 1 trainer (and user is that trainer)
  if (trainerCount === 1 && isTeamTrainer(team, userId)) {
    return true;
  }

  // Can delete if 2+ trainers (per updated rule)
  if (trainerCount >= 2) {
    return true;
  }

  return false;
}

/**
 * Check if user can leave team
 * Business Rule: Trainer can only leave if another trainer exists
 */
export function canLeaveTeam(team: Team, userId: string): boolean {
  const trainerCount = getTrainerCount(team);
  const isTrainer = isTeamTrainer(team, userId);

  // Non-trainers can always leave
  if (!isTrainer) {
    return true;
  }

  // Trainer can leave only if there's another trainer
  return trainerCount >= 2;
}

/**
 * Add member to team with role
 */
export async function addTeamMemberWithRole(
  clubId: string,
  teamId: string,
  userId: string,
  role: TeamMemberRole = 'user',
  addedBy: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = club.teams || [];
    const teamIndex = teams.findIndex(t => t.id === teamId);

    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    const team = teams[teamIndex];

    // Initialize membersData if not exists
    if (!team.membersData) {
      team.membersData = {};
    }

    // Add member with role
    team.membersData[userId] = {
      role,
      joinedAt: Timestamp.now(),
      addedBy,
    };

    // Update legacy arrays for backward compatibility
    if (!team.members.includes(userId)) {
      team.members.push(userId);
    }

    if (role === 'trainer' && !team.trainers.includes(userId)) {
      team.trainers.push(userId);
    } else if (role === 'assistant' && !team.assistants.includes(userId)) {
      team.assistants.push(userId);
    }

    team.updatedAt = new Date().toISOString();

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error adding team member with role:', error);
    throw error;
  }
}

/**
 * Update team member role
 */
export async function updateTeamMemberRole(
  clubId: string,
  teamId: string,
  userId: string,
  newRole: TeamMemberRole,
  updatedBy: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = club.teams || [];
    const teamIndex = teams.findIndex(t => t.id === teamId);

    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    const team = teams[teamIndex];

    // Validate: Cannot demote last trainer
    if (isTeamTrainer(team, userId) && getTrainerCount(team) === 1 && newRole !== 'trainer') {
      throw new Error('Cannot demote the last trainer. Promote another member first or delete the team.');
    }

    // Initialize membersData if not exists
    if (!team.membersData) {
      team.membersData = {};
    }

    // Update role
    if (team.membersData[userId]) {
      team.membersData[userId].role = newRole;
    } else {
      team.membersData[userId] = {
        role: newRole,
        joinedAt: Timestamp.now(),
        addedBy: updatedBy,
      };
    }

    // Update legacy arrays
    team.trainers = team.trainers.filter(id => id !== userId);
    team.assistants = team.assistants.filter(id => id !== userId);

    if (newRole === 'trainer') {
      team.trainers.push(userId);
    } else if (newRole === 'assistant') {
      team.assistants.push(userId);
    }

    team.updatedAt = new Date().toISOString();

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating team member role:', error);
    throw error;
  }
}

/**
 * Remove member from team (with validation)
 */
export async function removeTeamMemberWithValidation(
  clubId: string,
  teamId: string,
  userId: string
): Promise<void> {
  try {
    const team = await getTeam(clubId, teamId);

    if (!team) {
      throw new Error('Team not found');
    }

    // Validate: Cannot remove if user cannot leave
    if (!canLeaveTeam(team, userId)) {
      throw new Error('Cannot remove the last trainer. Promote another member to trainer first.');
    }

    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = club.teams || [];
    const teamIndex = teams.findIndex(t => t.id === teamId);

    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    // Remove from membersData
    if (teams[teamIndex].membersData) {
      delete teams[teamIndex].membersData[userId];
    }

    // Remove from legacy arrays
    teams[teamIndex].members = teams[teamIndex].members.filter(id => id !== userId);
    teams[teamIndex].trainers = teams[teamIndex].trainers.filter(id => id !== userId);
    teams[teamIndex].assistants = teams[teamIndex].assistants.filter(id => id !== userId);
    teams[teamIndex].updatedAt = new Date().toISOString();

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    throw error;
  }
}

/**
 * Update team member profile
 */
export async function updateTeamMemberProfile(
  clubId: string,
  teamId: string,
  userId: string,
  profileData: {
    position?: string;
    customFields?: { [key: string]: any };
  }
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = club.teams || [];
    const teamIndex = teams.findIndex(t => t.id === teamId);

    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    const team = teams[teamIndex];

    // Initialize membersData if not exists
    if (!team.membersData) {
      team.membersData = {};
    }

    // Initialize member if not exists
    if (!team.membersData[userId]) {
      team.membersData[userId] = {
        role: 'user',
        joinedAt: Timestamp.now(),
      };
    }

    // Update profile
    team.membersData[userId].teamProfile = {
      position: profileData.position,
      customFields: profileData.customFields,
    };

    team.updatedAt = new Date().toISOString();

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating team member profile:', error);
    throw error;
  }
}

/**
 * Update team custom field definitions
 */
export async function updateTeamCustomFields(
  clubId: string,
  teamId: string,
  customFieldDefinitions: Team['customFieldDefinitions']
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = club.teams || [];
    const teamIndex = teams.findIndex(t => t.id === teamId);

    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    teams[teamIndex].customFieldDefinitions = customFieldDefinitions;
    teams[teamIndex].updatedAt = new Date().toISOString();

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating team custom fields:', error);
    throw error;
  }
}

/**
 * Get all teams user is member of (across all clubs)
 */
export async function getUserTeams(userId: string, clubIds: string[]): Promise<Array<Team & { clubId: string; clubName: string }>> {
  try {
    const teams: Array<Team & { clubId: string; clubName: string }> = [];

    for (const clubId of clubIds) {
      const clubRef = doc(db, 'clubs', clubId);
      const clubDoc = await getDoc(clubRef);

      if (clubDoc.exists()) {
        const club = clubDoc.data() as Club;
        
        // Filter teams where user is a member
        const userTeams = (club.teams || []).filter(team => {
          const members = getTeamMembers(team);
          return !!members[userId];
        });

        // Add club context
        userTeams.forEach(team => {
          teams.push({
            ...team,
            clubId: club.id!,
            clubName: club.name,
          });
        });
      }
    }

    return teams;
  } catch (error) {
    console.error('Error getting user teams:', error);
    throw error;
  }
}


