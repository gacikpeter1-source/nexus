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
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import type { User } from '../../types';

const deleteUserAccountFn = httpsCallable<{ userId: string }, { success: boolean }>(functions, 'deleteUserAccount');

/**
 * Permanently delete a user's account (Firebase Auth + Firestore doc, with
 * club/team membership cleanup) via the deleteUserAccount Cloud Function.
 *
 * Allowed: the user themselves, an admin, or a club owner/trainer/assistant
 * deleting a member of their own club — enforced server-side.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await deleteUserAccountFn({ userId });
}

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

