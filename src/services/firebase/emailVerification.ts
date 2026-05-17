/**
 * Email Verification Service
 * Handles email verification, resending, and status sync
 */

import { 
  sendEmailVerification as firebaseSendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Send verification email to user
 * 
 * @param firebaseUser - Firebase Auth user
 * @returns Promise
 */
export async function sendVerificationEmail(firebaseUser: FirebaseUser): Promise<void> {
  try {
    await firebaseSendEmailVerification(firebaseUser);
    console.log('✅ Verification email sent to:', firebaseUser.email);
  } catch (error: any) {
    console.error('❌ Error sending verification email:', error);
    
    // Handle specific errors
    if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many requests. Please wait a few minutes before trying again.');
    }
    
    throw new Error('Failed to send verification email. Please try again.');
  }
}

/**
 * Check if user's email is verified and sync with Firestore
 * 
 * @param firebaseUser - Firebase Auth user
 * @returns Promise<boolean> - true if verified
 */
export async function checkAndSyncEmailVerification(
  firebaseUser: FirebaseUser
): Promise<boolean> {
  try {
    // Reload user data from Firebase Auth to get latest emailVerified status
    await firebaseUser.reload();
    
    const isVerified = firebaseUser.emailVerified;
    
    // Update Firestore if email is verified
    if (isVerified) {
      const userRef = doc(db, 'users', firebaseUser.uid);
      await updateDoc(userRef, {
        emailVerified: true,
        updatedAt: Timestamp.now(),
      });
      
      console.log('✅ Email verification synced to Firestore');
    }
    
    return isVerified;
  } catch (error) {
    console.error('❌ Error checking email verification:', error);
    return firebaseUser.emailVerified;
  }
}

/**
 * Force sync email verification status from Firebase Auth to Firestore
 * 
 * @param firebaseUser - Firebase Auth user
 */
export async function syncEmailVerificationStatus(
  firebaseUser: FirebaseUser
): Promise<void> {
  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    await updateDoc(userRef, {
      emailVerified: firebaseUser.emailVerified,
      updatedAt: Timestamp.now(),
    });
    
    console.log('✅ Email verification status synced:', firebaseUser.emailVerified);
  } catch (error) {
    console.error('❌ Error syncing email verification status:', error);
    throw error;
  }
}
