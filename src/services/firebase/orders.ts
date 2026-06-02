/**
 * Firebase Orders Service
 * Handles all order-related operations
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
  orderBy,
  Timestamp,
  writeBatch,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import type { Order, OrderResponse } from '../../types';

// ==================== Order CRUD ====================

/**
 * Create a new order
 */
export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'responseCount'>): Promise<string> {
  try {
    const ordersRef = collection(db, 'clubs', orderData.clubId, 'orders');
    
    const newOrder: Omit<Order, 'id'> = {
      ...orderData,
      responseCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(ordersRef, newOrder);
    return docRef.id;
  } catch (error) {
    console.error('Error creating order:', error);
    throw new Error('Failed to create order');
  }
}

/**
 * Get a single order by ID
 */
export async function getOrder(clubId: string, orderId: string): Promise<Order | null> {
  try {
    const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return null;
    }

    return {
      id: orderDoc.id,
      ...orderDoc.data(),
    } as Order;
  } catch (error) {
    console.error('Error getting order:', error);
    throw new Error('Failed to get order');
  }
}

/**
 * Get all orders for a club (filtered by role)
 */
export async function getClubOrders(clubId: string, _userId: string, userRole: string): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'clubs', clubId, 'orders');
    let q;

    // Club owners see all orders
    if (userRole === 'clubOwner') {
      q = query(ordersRef, orderBy('createdAt', 'desc'));
    }
    // Trainers/assistants see their team orders + club-wide orders
    else {
      q = query(ordersRef, orderBy('createdAt', 'desc'));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Order[];
  } catch (error) {
    console.error('Error getting club orders:', error);
    throw new Error('Failed to get orders');
  }
}

/**
 * Get orders for a specific team
 */
export async function getTeamOrders(clubId: string, teamId: string): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'clubs', clubId, 'orders');
    const q = query(
      ordersRef,
      where('teamId', '==', teamId),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Order[];
  } catch (error) {
    console.error('Error getting team orders:', error);
    throw new Error('Failed to get team orders');
  }
}

/**
 * Get orders that a user can respond to
 */
export async function getUserAvailableOrders(clubId: string, _userId: string, userTeamIds: string[]): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'clubs', clubId, 'orders');
    const snapshot = await getDocs(query(ordersRef, where('status', '==', 'active'), orderBy('deadline', 'asc')));

    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Order[];

    // Filter orders user can see
    return orders.filter(order => {
      // Club-wide orders
      if (order.targetAudience === 'club') return true;
      
      // Team-specific orders - check if user is in the team
      if (order.targetAudience === 'team' && order.teamId) {
        return userTeamIds.includes(order.teamId);
      }
      
      return false;
    });
  } catch (error) {
    console.error('Error getting user available orders:', error);
    throw new Error('Failed to get available orders');
  }
}

/**
 * Update an order
 */
export async function updateOrder(clubId: string, orderId: string, updates: Partial<Order>): Promise<void> {
  try {
    const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
    await updateDoc(orderRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating order:', error);
    throw new Error('Failed to update order');
  }
}

/**
 * Delete an order (and all its responses)
 */
export async function deleteOrder(clubId: string, orderId: string): Promise<void> {
  try {
    const batch = writeBatch(db);

    // Delete order
    const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
    batch.delete(orderRef);

    // Delete all responses
    const responsesRef = collection(db, 'clubs', clubId, 'orders', orderId, 'responses');
    const responsesSnapshot = await getDocs(responsesRef);
    responsesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  } catch (error) {
    console.error('Error deleting order:', error);
    throw new Error('Failed to delete order');
  }
}

/**
 * Subscribe to order updates (real-time)
 */
export function subscribeToOrder(
  clubId: string,
  orderId: string,
  callback: (order: Order | null) => void
): Unsubscribe {
  const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
  
  return onSnapshot(orderRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({
        id: snapshot.id,
        ...snapshot.data(),
      } as Order);
    } else {
      callback(null);
    }
  });
}

// ==================== Order Responses ====================

/**
 * Submit a response to an order
 */
export async function submitOrderResponse(
  clubId: string,
  orderId: string,
  responseData: Omit<OrderResponse, 'id' | 'submittedAt' | 'updatedAt'>
): Promise<string> {
  try {
    const responsesRef = collection(db, 'clubs', clubId, 'orders', orderId, 'responses');
    
    // Check if user already responded
    const existingQuery = query(responsesRef, where('userId', '==', responseData.userId));
    const existingSnapshot = await getDocs(existingQuery);

    if (!existingSnapshot.empty) {
      // Update existing response
      const existingDoc = existingSnapshot.docs[0];
      await updateDoc(existingDoc.ref, {
        ...responseData,
        updatedAt: Timestamp.now(),
      });
      return existingDoc.id;
    } else {
      // Create new response
      const newResponse: Omit<OrderResponse, 'id'> = {
        ...responseData,
        submittedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(responsesRef, newResponse);

      // Increment response count
      const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);
      if (orderDoc.exists()) {
        const currentCount = orderDoc.data().responseCount || 0;
        await updateDoc(orderRef, { responseCount: currentCount + 1 });
      }

      return docRef.id;
    }
  } catch (error) {
    console.error('Error submitting order response:', error);
    throw new Error('Failed to submit response');
  }
}

/**
 * Get a user's response to an order
 */
export async function getUserResponse(
  clubId: string,
  orderId: string,
  userId: string
): Promise<OrderResponse | null> {
  try {
    const responsesRef = collection(db, 'clubs', clubId, 'orders', orderId, 'responses');
    const q = query(responsesRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as OrderResponse;
  } catch (error) {
    console.error('Error getting user response:', error);
    throw new Error('Failed to get response');
  }
}

/**
 * Get all responses for an order
 */
export async function getOrderResponses(clubId: string, orderId: string): Promise<OrderResponse[]> {
  try {
    const responsesRef = collection(db, 'clubs', clubId, 'orders', orderId, 'responses');
    const snapshot = await getDocs(responsesRef);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as OrderResponse[];
  } catch (error) {
    console.error('Error getting order responses:', error);
    throw new Error('Failed to get responses');
  }
}

/**
 * Subscribe to order responses (real-time)
 */
export function subscribeToOrderResponses(
  clubId: string,
  orderId: string,
  callback: (responses: OrderResponse[]) => void
): Unsubscribe {
  const responsesRef = collection(db, 'clubs', clubId, 'orders', orderId, 'responses');
  
  return onSnapshot(responsesRef, (snapshot) => {
    const responses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as OrderResponse[];
    callback(responses);
  });
}

/**
 * Delete a response
 */
export async function deleteOrderResponse(
  clubId: string,
  orderId: string,
  responseId: string
): Promise<void> {
  try {
    const responseRef = doc(db, 'clubs', clubId, 'orders', orderId, 'responses', responseId);
    await deleteDoc(responseRef);

    // Decrement response count
    const orderRef = doc(db, 'clubs', clubId, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);
    if (orderDoc.exists()) {
      const currentCount = orderDoc.data().responseCount || 0;
      await updateDoc(orderRef, { responseCount: Math.max(0, currentCount - 1) });
    }
  } catch (error) {
    console.error('Error deleting response:', error);
    throw new Error('Failed to delete response');
  }
}

// ==================== File Upload ====================

/**
 * Upload a file for an order response
 */
export async function uploadOrderFile(
  clubId: string,
  orderId: string,
  userId: string,
  file: File
): Promise<string> {
  try {
    const timestamp = Date.now();
    const fileName = `${userId}_${timestamp}_${file.name}`;
    const storageRef = ref(storage, `clubs/${clubId}/orders/${orderId}/files/${fileName}`);

    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  } catch (error) {
    console.error('Error uploading order file:', error);
    throw new Error('Failed to upload file');
  }
}

/**
 * Delete an order file
 */
export async function deleteOrderFile(fileURL: string): Promise<void> {
  try {
    const fileRef = ref(storage, fileURL);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Error deleting order file:', error);
    // Don't throw error if file doesn't exist
  }
}

// ==================== CSV Export ====================

/**
 * Export order responses to CSV
 */
export function exportOrderToCSV(order: Order, responses: OrderResponse[]): string {
  try {
    // Create CSV headers
    const headers = ['User Name', 'User Email', 'Submitted At'];
    order.fields.forEach(field => {
      headers.push(field.label);
    });

    // Create CSV rows
    const rows = responses.map(response => {
      const row = [
        response.userName || '',
        response.userEmail || '',
        response.submittedAt ? new Date(
          typeof response.submittedAt === 'string' 
            ? response.submittedAt 
            : response.submittedAt.toDate()
        ).toLocaleString() : '',
      ];

      order.fields.forEach(field => {
        const value = response.responses[field.id];
        row.push(value !== undefined && value !== null ? String(value) : '');
      });

      return row;
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw new Error('Failed to export to CSV');
  }
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== Helper Functions ====================

/**
 * Check if order deadline has passed
 */
export function isOrderExpired(order: Order): boolean {
  const deadline = typeof order.deadline === 'string' 
    ? new Date(order.deadline) 
    : order.deadline.toDate();
  return new Date() > deadline;
}

/**
 * Get users who haven't responded (requires team member list)
 */
export function getNonResponders(
  teamMembers: Array<{ id: string; displayName: string }>,
  responses: OrderResponse[]
): Array<{ id: string; displayName: string }> {
  const responderIds = new Set(responses.map(r => r.userId));
  return teamMembers.filter(member => !responderIds.has(member.id));
}
