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
import type { Order, OrderField, OrderFieldPriceTier, OrderFieldFreeUnitTier, OrderResponse } from '../../types';
import { PHOTO_PRODUCT_SIZES, PHOTO_PRODUCT_NO_SIZE_KEY } from '../../types';
import { NotificationManager } from '../notifications/NotificationManager';

export interface OrderResponseColumn {
  id: string;
  header: string;
  getValue: (response: OrderResponse) => string;
}

/**
 * Total price for a given quantity, from a sheet of "at least this many ->
 * this total price" breakpoints. Finds the highest tier the quantity reaches,
 * derives that tier's per-unit rate (price/minQty), and applies it to the
 * whole quantity — so a single flat-rate tier behaves as simple unit pricing,
 * and several tiers reproduce a volume-discount price sheet exactly at each
 * printed breakpoint (e.g. 16 -> 16€, 32 -> 28€, 48 -> 38€, 64 -> 47€).
 */
export function priceForTiers(tiers: OrderFieldPriceTier[] | undefined, qty: number): number {
  if (!tiers || tiers.length === 0 || !qty || qty <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let matched = sorted[0];
  for (const tier of sorted) {
    if (qty >= tier.minQty) matched = tier;
  }
  if (!matched.minQty) return 0;
  return qty * (matched.price / matched.minQty);
}

/** Whether any field on this order has pricing configured at all. */
export function orderHasPricing(fields: OrderField[]): boolean {
  return fields.some((f) => (f.sizePrices && Object.keys(f.sizePrices).length > 0) || (f.priceTiers && f.priceTiers.length > 0));
}

/**
 * How many units are free, given the linked field's quantity — the highest
 * tier the quantity reaches (e.g. 32 sport cards -> 1 free, 48 -> 2 free).
 * Below the first tier's minQty, nothing is free.
 */
export function freeUnitsForTiers(tiers: OrderFieldFreeUnitTier[] | undefined, triggerQty: number): number {
  if (!tiers || tiers.length === 0 || !triggerQty || triggerQty <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let freeUnits = 0;
  for (const tier of sorted) {
    if (triggerQty >= tier.minQty) freeUnits = tier.freeUnits;
  }
  return freeUnits;
}

export interface OrderResponseSummaryLine {
  label: string;
  value: string;
  price?: number;
}

/**
 * Total ordered quantity for one field in one response — a plain number
 * field's value, or the sum across all sizes (or the single qty) of a
 * 'photoProduct' field. Used to evaluate a discount condition that depends
 * on whether another field in the same response was ordered at all.
 */
export function getFieldQuantity(fields: OrderField[], response: OrderResponse, fieldId: string): number {
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return 0;
  const raw = response.responses[fieldId];
  if (field.type === 'number') return Number(raw) || 0;
  if (field.type === 'photoProduct') {
    if (!raw || typeof raw !== 'object') return 0;
    return Object.values(raw as Record<string, any>).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
  }
  return 0;
}

/**
 * Compact, non-empty-only view of one response — one line per answered
 * field (a 'photoProduct' field contributes one line per sized quantity
 * actually ordered), each with its computed price when the field has
 * pricing configured. A 'photoProduct' field's sizePrices switch to its
 * discountSizePrices for any respondent whose discountIfFieldId quantity is
 * above zero (e.g. cheaper posters for anyone who also ordered sport
 * cards). Used by the "Your Response" card and can be reused anywhere a
 * short order summary is needed.
 */
export function getOrderResponseSummaryLines(fields: OrderField[], response: OrderResponse): OrderResponseSummaryLine[] {
  const lines: OrderResponseSummaryLine[] = [];

  for (const field of fields) {
    if (field.type === 'heading') continue;
    const raw = response.responses[field.id];

    if (field.type === 'photoProduct') {
      if (!raw || typeof raw !== 'object') continue;
      const sizes = field.options && field.options.length > 0
        ? PHOTO_PRODUCT_SIZES.filter((size) => field.options!.includes(size))
        : null;
      if (sizes) {
        const useDiscount = !!field.discountIfFieldId && getFieldQuantity(fields, response, field.discountIfFieldId) > 0;
        for (const size of sizes) {
          const qty = Number(raw[size]) || 0;
          if (qty <= 0) continue;
          const unitPrice = useDiscount ? (field.discountSizePrices?.[size] ?? field.sizePrices?.[size]) : field.sizePrices?.[size];

          // Free-unit bonus — e.g. ordering enough sport cards makes some of
          // this size's units free. Capped at the quantity actually ordered.
          let freeUnits = 0;
          if (field.freeUnitsSize === size && field.freeUnitsIfFieldId && field.freeUnitsTiers?.length) {
            const triggerQty = getFieldQuantity(fields, response, field.freeUnitsIfFieldId);
            freeUnits = Math.min(qty, freeUnitsForTiers(field.freeUnitsTiers, triggerQty));
          }
          const chargedQty = qty - freeUnits;

          lines.push({
            label: `${field.label} — ${size}`,
            value: freeUnits > 0 ? `${qty}× (${freeUnits} free)` : `${qty}×`,
            price: unitPrice !== undefined ? chargedQty * unitPrice : undefined,
          });
        }
      } else {
        const qty = Number(raw[PHOTO_PRODUCT_NO_SIZE_KEY]) || 0;
        if (qty <= 0) continue;
        lines.push({
          label: field.label,
          value: `${qty}×`,
          price: field.priceTiers?.length ? priceForTiers(field.priceTiers, qty) : undefined,
        });
      }
      continue;
    }

    if (raw === undefined || raw === null || raw === '') continue;
    const price = field.type === 'number' && field.priceTiers?.length
      ? priceForTiers(field.priceTiers, Number(raw))
      : undefined;
    lines.push({ label: field.label, value: String(raw), price });
  }

  return lines;
}

/** Sum of every priced line in a response — the total the respondent owes. */
export function getOrderResponseTotal(fields: OrderField[], response: OrderResponse): number {
  return getOrderResponseSummaryLines(fields, response).reduce((sum, line) => sum + (line.price || 0), 0);
}

/**
 * Expands an order's fields into display/export columns — one column per
 * field, except 'photoProduct', which becomes one column per enabled size
 * (or a single column if it has none) so each poster format lands in its own
 * spreadsheet column instead of one unreadable combined cell. Skips
 * 'heading' fields entirely since they never carry a value. Shared by
 * exportOrderToCSV and OrderDetail's response table so both stay in sync.
 */
export function getOrderResponseColumns(fields: OrderField[]): OrderResponseColumn[] {
  const columns: OrderResponseColumn[] = [];
  const asString = (v: any) => (v !== undefined && v !== null && v !== '' ? String(v) : '');

  for (const field of fields) {
    if (field.type === 'heading') continue;

    if (field.type === 'photoProduct') {
      const sizes = field.options && field.options.length > 0
        ? PHOTO_PRODUCT_SIZES.filter(size => field.options!.includes(size))
        : null;
      if (sizes) {
        for (const size of sizes) {
          columns.push({
            id: `${field.id}__${size}`,
            header: `${field.label} — ${size}`,
            getValue: (response) => asString(response.responses[field.id]?.[size]),
          });
        }
      } else {
        columns.push({
          id: field.id,
          header: field.label,
          getValue: (response) => asString(response.responses[field.id]?.[PHOTO_PRODUCT_NO_SIZE_KEY]),
        });
      }
      continue;
    }

    columns.push({
      id: field.id,
      header: field.label,
      getValue: (response) => asString(response.responses[field.id]),
    });
  }

  return columns;
}

// ==================== Order CRUD ====================

// The field editor clears an optional number/text property (min/max/step/
// helpText) by setting it to `undefined` rather than deleting the key —
// Firestore's client SDK throws on an explicit `undefined` anywhere in a
// write (ignoreUndefinedProperties isn't set), which previously failed the
// whole order creation with no document written at all. Plain-data objects
// only (no Timestamps), so a JSON round-trip safely drops those keys.
function stripUndefinedFields(fields: OrderField[]): OrderField[] {
  return fields.map(field => JSON.parse(JSON.stringify(field)));
}

/**
 * Create a new order
 */
export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'responseCount'>): Promise<string> {
  try {
    const ordersRef = collection(db, 'clubs', orderData.clubId, 'orders');

    const newOrder: Omit<Order, 'id'> = {
      ...orderData,
      fields: stripUndefinedFields(orderData.fields),
      responseCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(ordersRef, newOrder);

    // 🔔 Notify recipients about the new order
    try {
      const clubDoc = await getDoc(doc(db, 'clubs', orderData.clubId));
      if (clubDoc.exists()) {
        const clubData = clubDoc.data();
        let recipientIds: string[] = [];

        if (orderData.targetAudience === 'team' && orderData.teamId) {
          const team = (clubData.teams || []).find((t: any) => t.id === orderData.teamId);
          if (team) {
            recipientIds = Object.keys(team.membersData || {});
          }
        } else {
          recipientIds = clubData.members || [];
        }

        await NotificationManager.onOrderCreated({
          orderId: docRef.id,
          clubId: orderData.clubId,
          teamId: orderData.teamId,
          title: orderData.title,
          createdBy: orderData.createdBy,
          recipientIds,
        });
      }
    } catch (notifError) {
      console.error('❌ Failed to send order created notification:', notifError);
      // Don't fail the order creation if notification fails
    }

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
 * Get all orders visible to a user with their response status.
 * Returns active orders (responded or not) + any past order the user responded to.
 * Used by regular members on the Orders page.
 */
export async function getUserOrdersWithStatus(
  clubId: string,
  userId: string,
  userTeamIds: string[]
): Promise<Array<{ order: Order; response: OrderResponse | null }>> {
  try {
    const ordersRef = collection(db, 'clubs', clubId, 'orders');
    const snapshot = await getDocs(query(ordersRef, orderBy('deadline', 'desc')));

    const visibleOrders = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }) as Order)
      .filter(order => {
        if (order.targetAudience === 'club') return true;
        if (order.targetAudience === 'team' && order.teamId) {
          return userTeamIds.includes(order.teamId);
        }
        return false;
      });

    // Parallel-fetch the user's response for each visible order
    const results = await Promise.all(
      visibleOrders.map(async (order) => {
        const response = await getUserResponse(clubId, order.id!, userId);
        return { order, response };
      })
    );

    // Show active orders (to respond / edit) + any order where user responded (evidence)
    return results.filter(({ order, response }) =>
      order.status === 'active' || response !== null
    );
  } catch (error) {
    console.error('Error getting user orders with status:', error);
    throw new Error('Failed to get orders');
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
      ...(updates.fields ? { fields: stripUndefinedFields(updates.fields) } : {}),
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
    const columns = getOrderResponseColumns(order.fields);
    const hasPricing = orderHasPricing(order.fields);

    // Create CSV headers
    const headers = ['User Name', 'User Email', 'Submitted At', ...columns.map(c => c.header), ...(hasPricing ? ['Total (€)'] : [])];

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

      columns.forEach(column => {
        row.push(column.getValue(response));
      });

      if (hasPricing) {
        row.push(getOrderResponseTotal(order.fields, response).toFixed(2));
      }

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
