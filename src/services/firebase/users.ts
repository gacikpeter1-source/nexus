/**
 * User Management Service
 * Handles user data retrieval and updates
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';

/**
 * Get user by ID
 * 
 * @param userId - User ID
 * @returns User data or null if not found
 */
export async function getUser(userId: string): Promise<User | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    return {
      id: userDoc.id,
      ...userDoc.data()
    } as User;
    
  } catch (error) {
    console.error('❌ Error getting user:', error);
    throw error;
  }
}

/**
 * Get multiple users by IDs
 * 
 * @param userIds - Array of user IDs
 * @returns Array of users (skips non-existent users)
 */
export async function getUsers(userIds: string[]): Promise<User[]> {
  try {
    if (userIds.length === 0) return [];
    
    const users: User[] = [];
    
    // Fetch users in parallel
    const userPromises = userIds.map(id => getUser(id));
    const results = await Promise.all(userPromises);
    
    // Filter out null results
    results.forEach(user => {
      if (user) users.push(user);
    });
    
    return users;
    
  } catch (error) {
    console.error('❌ Error getting users:', error);
    throw error;
  }
}

/**
 * Update user profile
 * 
 * @param userId - User ID
 * @param updates - Fields to update
 */
export async function updateUser(
  userId: string,
  updates: Partial<User>
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ User updated:', userId);
    
  } catch (error) {
    console.error('❌ Error updating user:', error);
    throw error;
  }
}

/**
 * Get users by email
 * 
 * @param email - User email
 * @returns User or null
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const q = query(
      collection(db, 'users'),
      where('email', '==', email)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const userDoc = snapshot.docs[0];
    return {
      id: userDoc.id,
      ...userDoc.data()
    } as User;
    
  } catch (error) {
    console.error('❌ Error getting user by email:', error);
    throw error;
  }
}

/**
 * Search users by display name
 * 
 * @param searchTerm - Search term
 * @param limit - Max results
 * @returns Array of matching users
 */
export async function searchUsers(searchTerm: string, limit: number = 20): Promise<User[]> {
  try {
    // Note: This is a basic implementation
    // For production, consider using Algolia or similar for better search
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    const allUsers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
    // Filter by display name (case-insensitive)
    const searchLower = searchTerm.toLowerCase();
    const filtered = allUsers.filter(user => 
      user.displayName?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
    
    return filtered.slice(0, limit);
    
  } catch (error) {
    console.error('❌ Error searching users:', error);
    throw error;
  }
}

/**
 * Get users by role
 * 
 * @param role - User role
 * @returns Array of users with that role
 */
export async function getUsersByRole(role: string): Promise<User[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', role)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
  } catch (error) {
    console.error('❌ Error getting users by role:', error);
    throw error;
  }
}

/**
 * Get users by club membership
 * 
 * @param clubId - Club ID
 * @returns Array of users who are members
 */
export async function getClubUsers(clubId: string): Promise<User[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('clubIds', 'array-contains', clubId)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
  } catch (error) {
    console.error('❌ Error getting club users:', error);
    throw error;
  }
}

