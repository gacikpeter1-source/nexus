/**
 * Parent-Child Account Management Service
 * Handles child account creation, parent linking, and relationship management
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User, ParentChildRelationship } from '../../types';

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
      clubIds: [],
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

/**
 * Request to link parent to existing child
 * Used for divorced/separated families
 * 
 * @param requestingParentId - Parent requesting link
 * @param childId - Child to link to
 * @param message - Optional message to existing parent
 * @returns Relationship request ID
 */
export async function createParentLinkRequest(
  requestingParentId: string,
  childId: string,
  message?: string
): Promise<string> {
  try {
    // Check if child exists
    const child = await getChild(childId);
    if (!child) {
      throw new Error('Child not found');
    }
    
    // Check if relationship already exists
    const existingQ = query(
      collection(db, 'parentChildRelationships'),
      where('parentId', '==', requestingParentId),
      where('childId', '==', childId)
    );
    const existingSnapshot = await getDocs(existingQ);
    
    if (!existingSnapshot.empty) {
      throw new Error('Relationship request already exists');
    }
    
    // Create relationship request
    const relationship: Omit<ParentChildRelationship, 'id'> = {
      parentId: requestingParentId,
      childId,
      requestedBy: requestingParentId,
      status: 'pending',
      message: message || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const relationshipRef = await addDoc(
      collection(db, 'parentChildRelationships'),
      relationship
    );
    
    console.log('✅ Parent link request created:', relationshipRef.id);
    return relationshipRef.id;
    
  } catch (error) {
    console.error('❌ Error creating parent link request:', error);
    throw error;
  }
}

/**
 * Get parent link requests for a child
 * 
 * @param childId - Child user ID
 * @returns Array of pending requests
 */
export async function getChildLinkRequests(childId: string): Promise<ParentChildRelationship[]> {
  try {
    const q = query(
      collection(db, 'parentChildRelationships'),
      where('childId', '==', childId),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ParentChildRelationship));
    
    return requests;
    
  } catch (error) {
    console.error('❌ Error getting child link requests:', error);
    throw error;
  }
}

/**
 * Approve parent link request
 * Adds parent to child's parentIds
 * 
 * @param relationshipId - Relationship request ID
 * @param approvingParentId - Parent approving the request
 */
export async function approveParentLinkRequest(
  relationshipId: string,
  approvingParentId: string
): Promise<void> {
  try {
    // Get relationship
    const relationshipRef = doc(db, 'parentChildRelationships', relationshipId);
    const relationshipDoc = await getDoc(relationshipRef);
    
    if (!relationshipDoc.exists()) {
      throw new Error('Relationship request not found');
    }
    
    const relationship = relationshipDoc.data() as ParentChildRelationship;
    
    // Update relationship status
    await updateDoc(relationshipRef, {
      status: 'approved',
      approvedBy: approvingParentId,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Add parent to child's parentIds
    const childRef = doc(db, 'users', relationship.childId);
    await updateDoc(childRef, {
      parentIds: arrayUnion(relationship.parentId),
      updatedAt: new Date().toISOString()
    });
    
    // Add child to parent's childIds
    const parentRef = doc(db, 'users', relationship.parentId);
    await updateDoc(parentRef, {
      childIds: arrayUnion(relationship.childId),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Parent link request approved:', relationshipId);
    
  } catch (error) {
    console.error('❌ Error approving parent link request:', error);
    throw error;
  }
}

/**
 * Reject parent link request
 * 
 * @param relationshipId - Relationship request ID
 * @param rejectingParentId - Parent rejecting the request
 * @param reason - Optional rejection reason
 */
export async function rejectParentLinkRequest(
  relationshipId: string,
  rejectingParentId: string,
  reason?: string
): Promise<void> {
  try {
    const relationshipRef = doc(db, 'parentChildRelationships', relationshipId);
    
    await updateDoc(relationshipRef, {
      status: 'rejected',
      rejectedBy: rejectingParentId,
      rejectionReason: reason || '',
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Parent link request rejected:', relationshipId);
    
  } catch (error) {
    console.error('❌ Error rejecting parent link request:', error);
    throw error;
  }
}

/**
 * Remove parent from child
 * Unlink parent-child relationship
 * 
 * @param parentId - Parent user ID
 * @param childId - Child user ID
 */
export async function removeParentFromChild(
  parentId: string,
  childId: string
): Promise<void> {
  try {
    // Check if this is the primary parent
    const child = await getChild(childId);
    if (child && child.managedByParentId === parentId) {
      // Cannot remove primary parent if child has no other parents
      if (!child.parentIds || child.parentIds.length <= 1) {
        throw new Error('Cannot remove primary parent. Child must have at least one parent.');
      }
    }
    
    // Remove parent from child's parentIds
    const childRef = doc(db, 'users', childId);
    await updateDoc(childRef, {
      parentIds: arrayRemove(parentId),
      updatedAt: new Date().toISOString()
    });
    
    // Remove child from parent's childIds
    const parentRef = doc(db, 'users', parentId);
    await updateDoc(parentRef, {
      childIds: arrayRemove(childId),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Parent removed from child:', parentId, childId);
    
  } catch (error) {
    console.error('❌ Error removing parent from child:', error);
    throw error;
  }
}

/**
 * Get children in a specific team
 * Used for event RSVP on behalf of children
 * 
 * @param parentId - Parent user ID
 * @param teamId - Team ID
 * @returns Array of children in the team
 */
export async function getChildrenInTeam(
  parentId: string,
  teamId: string
): Promise<User[]> {
  try {
    const children = await getParentChildren(parentId);
    
    // Filter children who are in the specified team
    const childrenInTeam = children.filter(child => 
      child.teamIds && child.teamIds.includes(teamId)
    );
    
    return childrenInTeam;
    
  } catch (error) {
    console.error('❌ Error getting children in team:', error);
    throw error;
  }
}

