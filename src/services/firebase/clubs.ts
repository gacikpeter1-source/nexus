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

