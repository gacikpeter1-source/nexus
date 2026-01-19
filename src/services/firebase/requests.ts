/**
 * Firebase Service: Join Requests
 * Handle club/team join requests
 * Based on: docs/02-database-schema.md
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
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { addClubMember } from './clubs';
import { addTeamMemberWithRole } from './teams';

export interface JoinRequest {
  id: string;
  userId: string;
  clubId: string;
  teamId?: string;
  inviteCode?: string; // Code provided by user to help trainer identify them
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  processedDate?: string;
  processedBy?: string;
  message?: string;
  type: 'club' | 'team'; // Distinguish between club-only and team join requests
}

/**
 * Create a join request
 */
export async function createJoinRequest(data: {
  userId: string;
  clubId: string;
  teamId?: string;
  inviteCode?: string;
  message?: string;
}): Promise<string> {
  try {
    // Check for existing pending request
    const existingRequests = await getUserJoinRequests(data.userId);
    const hasPendingRequest = existingRequests.some(
      req => req.clubId === data.clubId && 
             req.teamId === data.teamId && 
             req.status === 'pending'
    );

    if (hasPendingRequest) {
      throw new Error('You already have a pending request for this club/team');
    }

    const requestRef = doc(collection(db, 'requests'));

    // Build request object, only including defined fields
    const newRequest: any = {
      userId: data.userId,
      clubId: data.clubId,
      type: data.teamId ? 'team' : 'club',
      status: 'pending',
      requestDate: new Date().toISOString(),
    };

    // Only add optional fields if they have values
    if (data.teamId) {
      newRequest.teamId = data.teamId;
    }
    if (data.inviteCode) {
      newRequest.inviteCode = data.inviteCode;
    }
    if (data.message) {
      newRequest.message = data.message;
    }

    await setDoc(requestRef, {
      ...newRequest,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return requestRef.id;
  } catch (error) {
    console.error('Error creating join request:', error);
    throw error;
  }
}

/**
 * Get join requests for a club
 */
export async function getClubJoinRequests(clubId: string): Promise<JoinRequest[]> {
  try {
    const requestsRef = collection(db, 'requests');
    const q = query(
      requestsRef,
      where('clubId', '==', clubId),
      where('status', '==', 'pending')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as JoinRequest[];
  } catch (error) {
    console.error('Error getting club join requests:', error);
    throw error;
  }
}

/**
 * Get user's join requests
 */
export async function getUserJoinRequests(userId: string): Promise<JoinRequest[]> {
  try {
    const requestsRef = collection(db, 'requests');
    const q = query(requestsRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as JoinRequest[];
  } catch (error) {
    console.error('Error getting user join requests:', error);
    throw error;
  }
}

/**
 * Approve join request
 * Adds user to club and optionally to specific team
 */
export async function approveJoinRequest(
  requestId: string,
  approverId: string
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists()) {
      throw new Error('Request not found');
    }

    const request = requestDoc.data() as JoinRequest;

    // Add user to club (always)
    await addClubMember(request.clubId, request.userId);

    // If team specified, add to team with 'user' role
    if (request.teamId) {
      await addTeamMemberWithRole(
        request.clubId,
        request.teamId,
        request.userId,
        'user',
        approverId
      );
    }

    // Update request status
    await updateDoc(requestRef, {
      status: 'approved',
      processedDate: new Date().toISOString(),
      processedBy: approverId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error approving join request:', error);
    throw error;
  }
}

/**
 * Reject join request
 */
export async function rejectJoinRequest(
  requestId: string,
  rejectorId: string
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);

    await updateDoc(requestRef, {
      status: 'rejected',
      processedDate: new Date().toISOString(),
      processedBy: rejectorId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error rejecting join request:', error);
    throw error;
  }
}

/**
 * Cancel join request (by requester)
 */
export async function cancelJoinRequest(requestId: string): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    await deleteDoc(requestRef);
  } catch (error) {
    console.error('Error canceling join request:', error);
    throw error;
  }
}


