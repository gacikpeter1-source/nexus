/**
 * Firebase Service: Clubs
 * CRUD operations for clubs collection
 * Based on: docs/02-database-schema.md, docs/07-clubs-teams.md
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Club, Team } from '../../types';

// Generate unique club code (6 digits)
function generateClubCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate unique team ID
function generateTeamId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new club
 */
export async function createClub(clubData: {
  name: string;
  clubType: string;
  description?: string;
  ownerId: string;
  subscriptionActive: boolean;
  subscriptionType: 'voucher' | 'stripe' | 'trial';
  subscriptionExpiryDate?: string;
  voucherCode?: string;
}): Promise<string> {
  try {
    const clubRef = doc(collection(db, 'clubs'));
    const clubCode = generateClubCode();

    const newClub: Partial<Club> = {
      name: clubData.name,
      clubType: clubData.clubType,
      clubCode: clubCode,
      clubNumber: clubCode,
      description: clubData.description || '',
      createdBy: clubData.ownerId,
      superTrainer: clubData.ownerId,
      members: [clubData.ownerId],
      trainers: [clubData.ownerId],
      assistants: [],
      teams: [],
      subscriptionActive: clubData.subscriptionActive,
      subscriptionType: clubData.subscriptionType,
      subscriptionExpiryDate: clubData.subscriptionExpiryDate,
      voucherCode: clubData.voucherCode,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(clubRef, newClub);

    // Update user's ownedClubIds and clubIds
    const userRef = doc(db, 'users', clubData.ownerId);
    await updateDoc(userRef, {
      ownedClubIds: arrayUnion(clubRef.id),
      clubIds: arrayUnion(clubRef.id),
      role: 'clubOwner', // Promote to club owner
      isSuperTrainer: true,
      updatedAt: Timestamp.now(),
    });

    return clubRef.id;
  } catch (error) {
    console.error('Error creating club:', error);
    throw error;
  }
}

/**
 * Get club by ID
 */
export async function getClub(clubId: string): Promise<Club | null> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (clubDoc.exists()) {
      return {
        id: clubDoc.id,
        ...clubDoc.data(),
      } as Club;
    }

    return null;
  } catch (error) {
    console.error('Error getting club:', error);
    throw error;
  }
}

/**
 * Get clubs by user ID (clubs user is member of)
 */
export async function getUserClubs(userId: string): Promise<Club[]> {
  try {
    const clubsRef = collection(db, 'clubs');
    const q = query(clubsRef, where('members', 'array-contains', userId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Club[];
  } catch (error) {
    console.error('Error getting user clubs:', error);
    throw error;
  }
}

/**
 * Update club information
 */
export async function updateClub(
  clubId: string,
  updates: Partial<Club>
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    await updateDoc(clubRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating club:', error);
    throw error;
  }
}

/**
 * Delete club
 */
export async function deleteClub(clubId: string, ownerId: string): Promise<void> {
  try {
    // Delete club document
    const clubRef = doc(db, 'clubs', clubId);
    await deleteDoc(clubRef);

    // Remove from owner's ownedClubIds
    const userRef = doc(db, 'users', ownerId);
    await updateDoc(userRef, {
      ownedClubIds: arrayRemove(clubId),
      clubIds: arrayRemove(clubId),
      updatedAt: Timestamp.now(),
    });

    // TODO: Also remove from all members' clubIds
    // TODO: Delete related events, chats, etc.
  } catch (error) {
    console.error('Error deleting club:', error);
    throw error;
  }
}

/**
 * Create a team within a club
 */
export async function createTeam(
  clubId: string,
  teamData: {
    name: string;
    category?: string;
    description?: string;
    members?: string[];
    trainers?: string[];
  }
): Promise<string> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const teamId = generateTeamId();
    const newTeam: Team = {
      id: teamId,
      name: teamData.name,
      category: teamData.category || '',
      description: teamData.description || '',
      members: teamData.members || [],
      trainers: teamData.trainers || [],
      assistants: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(clubRef, {
      teams: arrayUnion(newTeam),
      updatedAt: Timestamp.now(),
    });

    return teamId;
  } catch (error) {
    console.error('Error creating team:', error);
    throw error;
  }
}

/**
 * Update team within a club
 */
export async function updateTeam(
  clubId: string,
  teamId: string,
  updates: Partial<Team>
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

    teams[teamIndex] = {
      ...teams[teamIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating team:', error);
    throw error;
  }
}

/**
 * Delete team from club
 */
export async function deleteTeam(clubId: string, teamId: string): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;
    const teams = (club.teams || []).filter(t => t.id !== teamId);

    await updateDoc(clubRef, {
      teams: teams,
      updatedAt: Timestamp.now(),
    });

    // TODO: Delete related events, attendance records, etc.
  } catch (error) {
    console.error('Error deleting team:', error);
    throw error;
  }
}

/**
 * Add member to club
 */
export async function addClubMember(
  clubId: string,
  userId: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    await updateDoc(clubRef, {
      members: arrayUnion(userId),
      updatedAt: Timestamp.now(),
    });

    // Add club to user's clubIds
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      clubIds: arrayUnion(clubId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error adding club member:', error);
    throw error;
  }
}

/**
 * Remove member from club
 */
export async function removeClubMember(
  clubId: string,
  userId: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    await updateDoc(clubRef, {
      members: arrayRemove(userId),
      trainers: arrayRemove(userId),
      assistants: arrayRemove(userId),
      updatedAt: Timestamp.now(),
    });

    // Remove club from user's clubIds
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      clubIds: arrayRemove(clubId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error removing club member:', error);
    throw error;
  }
}

/**
 * Add member to team
 */
export async function addTeamMember(
  clubId: string,
  teamId: string,
  userId: string
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

    if (!teams[teamIndex].members.includes(userId)) {
      teams[teamIndex].members.push(userId);
      teams[teamIndex].updatedAt = new Date().toISOString();

      await updateDoc(clubRef, {
        teams: teams,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error adding team member:', error);
    throw error;
  }
}

/**
 * Remove member from team
 */
export async function removeTeamMember(
  clubId: string,
  teamId: string,
  userId: string
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
 * Add club-wide trainer
 * Club trainers have privileges across all teams
 */
export async function addClubTrainer(
  clubId: string,
  userId: string,
  addedBy: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    
    // Add to trainers array
    await updateDoc(clubRef, {
      trainers: arrayUnion(userId),
      members: arrayUnion(userId), // Also add to members
      updatedAt: Timestamp.now(),
    });

    // Update user's role if not already trainer/owner
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.role === 'user' || userData.role === 'assistant') {
        await updateDoc(userRef, {
          role: 'trainer',
          clubIds: arrayUnion(clubId),
          updatedAt: Timestamp.now(),
        });
      }
    }
  } catch (error) {
    console.error('Error adding club trainer:', error);
    throw error;
  }
}

/**
 * Remove club-wide trainer
 * Validates that trainer is not the last trainer in any team
 */
export async function removeClubTrainer(
  clubId: string,
  userId: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    const clubDoc = await getDoc(clubRef);

    if (!clubDoc.exists()) {
      throw new Error('Club not found');
    }

    const club = clubDoc.data() as Club;

    // Validate: Check if trainer is last trainer in any team
    const teams = club.teams || [];
    for (const team of teams) {
      const trainerCount = team.trainers.length;
      const isTrainerInTeam = team.trainers.includes(userId);
      
      if (isTrainerInTeam && trainerCount === 1) {
        throw new Error(`Cannot remove trainer: ${userId} is the last trainer in team "${team.name}". Promote another member first.`);
      }
    }

    // Remove from club trainers
    await updateDoc(clubRef, {
      trainers: arrayRemove(userId),
      updatedAt: Timestamp.now(),
    });

    // Remove from all teams
    const updatedTeams = teams.map(team => {
      if (team.trainers.includes(userId)) {
        return {
          ...team,
          trainers: team.trainers.filter(id => id !== userId),
          updatedAt: new Date().toISOString(),
        };
      }
      return team;
    });

    await updateDoc(clubRef, {
      teams: updatedTeams,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error removing club trainer:', error);
    throw error;
  }
}

/**
 * Get teams where user has specific role
 */
export function getUserTeamsWithRole(club: Club, userId: string, role: 'trainer' | 'assistant' | 'user'): string[] {
  const teams = club.teams || [];
  return teams
    .filter(team => {
      if (role === 'trainer') return team.trainers.includes(userId);
      if (role === 'assistant') return team.assistants.includes(userId);
      return team.members.includes(userId) && !team.trainers.includes(userId) && !team.assistants.includes(userId);
    })
    .map(team => team.name);
}

/**
 * Transfer club ownership
 */
export async function transferClubOwnership(
  clubId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<void> {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    
    // Update club
    await updateDoc(clubRef, {
      ownerId: newOwnerId,
      createdBy: newOwnerId,
      superTrainer: newOwnerId,
      trainers: arrayUnion(newOwnerId), // Ensure new owner is trainer
      updatedAt: Timestamp.now(),
    });

    // Update old owner
    const oldOwnerRef = doc(db, 'users', currentOwnerId);
    await updateDoc(oldOwnerRef, {
      ownedClubIds: arrayRemove(clubId),
      role: 'trainer', // Demote to trainer
      updatedAt: Timestamp.now(),
    });

    // Update new owner
    const newOwnerRef = doc(db, 'users', newOwnerId);
    await updateDoc(newOwnerRef, {
      ownedClubIds: arrayUnion(clubId),
      clubIds: arrayUnion(clubId),
      role: 'clubOwner', // Promote to owner
      isSuperTrainer: true,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error transferring club ownership:', error);
    throw error;
  }
}

/**
 * Search clubs by name (for join requests)
 */
export async function searchClubs(searchTerm: string): Promise<Club[]> {
  try {
    const clubsRef = collection(db, 'clubs');
    const querySnapshot = await getDocs(clubsRef);

    const clubs = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Club[];

    // Filter by name (case-insensitive)
    return clubs.filter(club => 
      club.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (error) {
    console.error('Error searching clubs:', error);
    throw error;
  }
}


