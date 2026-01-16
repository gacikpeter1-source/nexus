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

export interface JoinRequest {
  id: string;
  userId: string;
  clubId: string;
  teamId?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  processedDate?: string;
  processedBy?: string;
  message?: string;
}

/**
 * Create a join request
 */
export async function createJoinRequest(data: {
  userId: string;
  clubId: string;
  teamId?: string;
  message?: string;
}): Promise<string> {
  try {
    const requestRef = doc(collection(db, 'requests'));

    const newRequest: Omit<JoinRequest, 'id'> = {
      userId: data.userId,
      clubId: data.clubId,
      teamId: data.teamId,
      status: 'pending',
      requestDate: new Date().toISOString(),
      message: data.message,
    };

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

    // Add user to club
    await addClubMember(request.clubId, request.userId);

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

