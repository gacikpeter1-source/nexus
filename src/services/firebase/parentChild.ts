/**
 * Parent-Child Account Management Service
 * Handles child account creation and co-parent linking (via invite code —
 * see generateParentInviteCode/redeemParentInviteCode below)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';

/**
 * Create a child subaccount
 * Child cannot login - managed by parent only
 * 
 * @param parentId - Parent user ID
 * @param childData - Child information
 * @returns Created child user ID
 */
export async function createChildAccount(
  parentId: string,
  childData: {
    displayName: string;
    dateOfBirth?: string;
    teamIds?: string[];    // explicit team assignments chosen by parent
    clubIds?: string[];    // derived from teamIds' clubs
    customFields?: Record<string, any>;
  }
): Promise<string> {
  try {
    // Generate unique child email (cannot be used for login)
    const childEmail = `child_${Date.now()}_${parentId}@nexus.generated`;

    // Create child user document
    const childUser = {
      email: childEmail,
      displayName: childData.displayName,
      dateOfBirth: childData.dateOfBirth || '',
      role: 'user',
      clubIds: childData.clubIds || [],
      teamIds: childData.teamIds || [],
      ownedClubIds: [],
      parentIds: [parentId],
      managedByParentId: parentId,
      customFields: childData.customFields || {},
      subscriptionStatus: 'active', // Inherits from parent
      emailVerified: false, // Always false for children
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Add to users collection
    const childRef = await addDoc(collection(db, 'users'), childUser);
    const childId = childRef.id;
    
    // Update child document with ID
    await updateDoc(childRef, { id: childId });
    
    // Update parent's childIds array
    const parentRef = doc(db, 'users', parentId);
    await updateDoc(parentRef, {
      childIds: arrayUnion(childId),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Child account created:', childId);
    return childId;
    
  } catch (error) {
    console.error('❌ Error creating child account:', error);
    throw error;
  }
}

/**
 * Get all children for a parent
 * 
 * @param parentId - Parent user ID
 * @returns Array of child users
 */
export async function getParentChildren(parentId: string): Promise<User[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('parentIds', 'array-contains', parentId)
    );
    
    const snapshot = await getDocs(q);
    
    const children = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as User));
    
    return children;
    
  } catch (error) {
    console.error('❌ Error getting parent children:', error);
    throw error;
  }
}

/**
 * Get child by ID
 * 
 * @param childId - Child user ID
 * @returns Child user or null
 */
export async function getChild(childId: string): Promise<User | null> {
  try {
    const childRef = doc(db, 'users', childId);
    const childDoc = await getDoc(childRef);
    
    if (!childDoc.exists()) {
      return null;
    }
    
    return {
      id: childDoc.id,
      ...childDoc.data()
    } as User;
    
  } catch (error) {
    console.error('❌ Error getting child:', error);
    throw error;
  }
}

/**
 * Update child profile
 * Only parent or admin can update
 * 
 * @param childId - Child user ID
 * @param updates - Fields to update
 */
export async function updateChildProfile(
  childId: string,
  updates: Partial<User>
): Promise<void> {
  try {
    const childRef = doc(db, 'users', childId);
    
    await updateDoc(childRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Child profile updated:', childId);
    
  } catch (error) {
    console.error('❌ Error updating child profile:', error);
    throw error;
  }
}

/**
 * Delete child account
 * Only parent or admin can delete
 * 
 * @param parentId - Parent user ID
 * @param childId - Child user ID
 */
export async function deleteChildAccount(
  parentId: string,
  childId: string
): Promise<void> {
  try {
    // Remove child from parent's childIds
    const parentRef = doc(db, 'users', parentId);
    await updateDoc(parentRef, {
      childIds: arrayRemove(childId),
      updatedAt: new Date().toISOString()
    });
    
    // Delete child user document
    const childRef = doc(db, 'users', childId);
    await deleteDoc(childRef);
    
    console.log('✅ Child account deleted:', childId);
    
  } catch (error) {
    console.error('❌ Error deleting child account:', error);
    throw error;
  }
}

// Charset avoids 0/O and 1/I to reduce read errors when typed manually
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a 6-character invite code that lets a second parent link to a child.
 * The code is stored in the parentInvites collection and expires after 48 hours.
 */
export async function generateParentInviteCode(
  parentId: string,
  childId: string,
  childName: string
): Promise<string> {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }

  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000));

  await setDoc(doc(db, 'parentInvites', code), {
    code,
    childId,
    childName,
    createdBy: parentId,
    createdAt: Timestamp.now(),
    expiresAt,
  });

  return code;
}

/**
 * Redeem an invite code. Links the redeeming parent to the child.
 * Throws a descriptive string error ('invalid_code' | 'code_already_used' |
 * 'code_expired' | 'own_code') so the UI can show the right message.
 */
export async function redeemParentInviteCode(
  code: string,
  redeemingParentId: string
): Promise<{ childId: string; childName: string }> {
  const inviteRef = doc(db, 'parentInvites', code.toUpperCase().trim());
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) throw new Error('invalid_code');

  const invite = inviteSnap.data();

  if (invite.usedBy) throw new Error('code_already_used');
  if ((invite.expiresAt as Timestamp).toDate() < new Date()) throw new Error('code_expired');
  if (invite.createdBy === redeemingParentId) throw new Error('own_code');

  // Link parent to child
  await updateDoc(doc(db, 'users', invite.childId), {
    parentIds: arrayUnion(redeemingParentId),
    updatedAt: new Date().toISOString(),
  });

  await updateDoc(doc(db, 'users', redeemingParentId), {
    childIds: arrayUnion(invite.childId),
    isParent: true,
    updatedAt: new Date().toISOString(),
  });

  // Mark code as used (don't delete — keeps audit trail)
  await updateDoc(inviteRef, {
    usedBy: redeemingParentId,
    usedAt: Timestamp.now(),
  });

  return { childId: invite.childId, childName: invite.childName };
}

