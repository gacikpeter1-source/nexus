/**
 * Admin User Management Service
 * Handles admin operations on user accounts
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';

export interface UnverifiedUser extends User {
  accountAge: number; // days since account creation
}

/**
 * Get all unverified users
 * 
 * @returns Array of unverified users with account age
 */
export async function getUnverifiedUsers(): Promise<UnverifiedUser[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('emailVerified', '==', false));
    
    const snapshot = await getDocs(q);
    
    const now = Date.now();
    const users: UnverifiedUser[] = [];
    
    snapshot.docs.forEach(docSnap => {
      const userData = docSnap.data() as User;
      
      // Calculate account age in days
      let createdAtDate: Date;
      if (userData.createdAt instanceof Timestamp) {
        createdAtDate = userData.createdAt.toDate();
      } else if (typeof userData.createdAt === 'string') {
        createdAtDate = new Date(userData.createdAt);
      } else {
        createdAtDate = new Date();
      }
      
      const ageInMs = now - createdAtDate.getTime();
      const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
      
      users.push({
        ...userData,
        id: docSnap.id,
        accountAge: ageInDays,
      });
    });
    
    // Sort by account age (oldest first)
    users.sort((a, b) => b.accountAge - a.accountAge);
    
    return users;
  } catch (error) {
    console.error('❌ Error fetching unverified users:', error);
    throw error;
  }
}

/**
 * Delete an unverified user account
 * Removes user from Firestore only (Firebase Auth account remains)
 * 
 * Note: Deleting Firebase Auth users requires Admin SDK (Cloud Functions)
 * This function only removes the Firestore document
 * 
 * @param userId - User ID to delete
 */
export async function deleteUnverifiedUser(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    
    console.log('✅ User deleted from Firestore:', userId);
    
    // Note: Firebase Auth account deletion requires Admin SDK
    // For now, we only delete the Firestore document
    // The Firebase Auth account will remain but won't be able to access the app
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    throw error;
  }
}

/**
 * Delete multiple unverified users
 * 
 * @param userIds - Array of user IDs to delete
 * @returns Number of successfully deleted users
 */
export async function deleteMultipleUnverifiedUsers(userIds: string[]): Promise<number> {
  let successCount = 0;
  
  for (const userId of userIds) {
    try {
      await deleteUnverifiedUser(userId);
      successCount++;
    } catch (error) {
      console.error(`Failed to delete user ${userId}:`, error);
    }
  }
  
  return successCount;
}

/**
 * Get count of unverified users
 * 
 * @returns Number of unverified users
 */
export async function getUnverifiedUsersCount(): Promise<number> {
  try {
    const users = await getUnverifiedUsers();
    return users.length;
  } catch (error) {
    console.error('❌ Error counting unverified users:', error);
    return 0;
  }
}

/**
 * Get unverified users older than X days
 * 
 * @param days - Minimum age in days
 * @returns Array of unverified users older than specified days
 */
export async function getUnverifiedUsersOlderThan(days: number): Promise<UnverifiedUser[]> {
  try {
    const allUnverified = await getUnverifiedUsers();
    return allUnverified.filter(user => user.accountAge >= days);
  } catch (error) {
    console.error('❌ Error filtering unverified users:', error);
    throw error;
  }
}
