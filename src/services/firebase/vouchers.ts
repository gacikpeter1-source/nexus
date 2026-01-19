/**
 * Firebase Service: Vouchers
 * Manage subscription voucher codes
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
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Voucher, SubscriptionPlan } from '../../types';

/**
 * Generate random voucher code
 */
function generateVoucherCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new voucher
 */
export async function createVoucher(data: {
  plan: SubscriptionPlan;
  duration?: number;
  isPermanent: boolean;
  maxUses: number;
  expirationDate?: string;
  description?: string;
  createdBy: string;
}): Promise<string> {
  try {
    const voucherRef = doc(collection(db, 'vouchers'));
    const code = generateVoucherCode();

    const newVoucher: any = {
      code,
      plan: data.plan,
      isPermanent: data.isPermanent,
      maxUses: data.maxUses,
      usedCount: 0,
      usedBy: [],
      status: 'active',
      expirationDate: data.expirationDate || '',
      description: data.description || '',
      createdBy: data.createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Only add duration if it's defined
    if (data.duration !== undefined) {
      newVoucher.duration = data.duration;
    }

    await setDoc(voucherRef, newVoucher);
    return voucherRef.id;
  } catch (error) {
    console.error('Error creating voucher:', error);
    throw error;
  }
}

/**
 * Get voucher by ID
 */
export async function getVoucher(voucherId: string): Promise<Voucher | null> {
  try {
    const voucherDoc = await getDoc(doc(db, 'vouchers', voucherId));
    
    if (!voucherDoc.exists()) {
      return null;
    }

    return {
      id: voucherDoc.id,
      ...voucherDoc.data(),
    } as Voucher;
  } catch (error) {
    console.error('Error getting voucher:', error);
    return null;
  }
}

/**
 * Get voucher by code
 */
export async function getVoucherByCode(code: string): Promise<Voucher | null> {
  try {
    const vouchersQuery = query(
      collection(db, 'vouchers'),
      where('code', '==', code.toUpperCase()),
      firestoreLimit(1)
    );
    
    const snapshot = await getDocs(vouchersQuery);
    
    if (snapshot.empty) {
      return null;
    }

    const voucherDoc = snapshot.docs[0];
    return {
      id: voucherDoc.id,
      ...voucherDoc.data(),
    } as Voucher;
  } catch (error) {
    console.error('Error getting voucher by code:', error);
    return null;
  }
}

/**
 * Get all vouchers
 */
export async function getAllVouchers(): Promise<Voucher[]> {
  try {
    const vouchersQuery = query(
      collection(db, 'vouchers'),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(vouchersQuery);
    
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as Voucher));
  } catch (error) {
    console.error('Error getting vouchers:', error);
    return [];
  }
}

/**
 * Redeem a voucher
 */
export async function redeemVoucher(data: {
  voucherId: string;
  userId: string;
  clubId?: string;
  note?: string;
}): Promise<boolean> {
  try {
    const voucherRef = doc(db, 'vouchers', data.voucherId);
    const voucherDoc = await getDoc(voucherRef);

    if (!voucherDoc.exists()) {
      throw new Error('Voucher not found');
    }

    const voucher = voucherDoc.data() as Voucher;

    // Validate voucher
    if (voucher.status !== 'active') {
      throw new Error('Voucher is not active');
    }

    if (voucher.usedCount >= voucher.maxUses) {
      throw new Error('Voucher has reached maximum uses');
    }

    if (voucher.expirationDate && new Date(voucher.expirationDate) < new Date()) {
      throw new Error('Voucher has expired');
    }

    // Check if user already used this voucher
    const alreadyUsed = voucher.usedBy.some(usage => usage.userId === data.userId);
    if (alreadyUsed) {
      throw new Error('User has already used this voucher');
    }

    // Redeem voucher
    await updateDoc(voucherRef, {
      usedCount: voucher.usedCount + 1,
      usedBy: [
        ...voucher.usedBy,
        {
          userId: data.userId,
          clubId: data.clubId,
          redeemedAt: new Date().toISOString(),
          note: data.note,
        },
      ],
      status: voucher.usedCount + 1 >= voucher.maxUses ? 'expired' : 'active',
      updatedAt: Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Error redeeming voucher:', error);
    throw error;
  }
}

/**
 * Update voucher status
 */
export async function updateVoucherStatus(
  voucherId: string,
  status: 'active' | 'expired' | 'disabled'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'vouchers', voucherId), {
      status,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating voucher status:', error);
    throw error;
  }
}

/**
 * Delete voucher
 */
export async function deleteVoucher(voucherId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'vouchers', voucherId));
  } catch (error) {
    console.error('Error deleting voucher:', error);
    throw error;
  }
}

