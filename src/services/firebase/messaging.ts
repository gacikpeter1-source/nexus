/**
 * Firebase Cloud Messaging Service
 * Handles push notification token registration and foreground messages
 */

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

let messaging: any = null;

// Initialize messaging (only if supported)
const initMessaging = async () => {
  if (messaging) return messaging;
  
  const supported = await isSupported();
  if (supported) {
    messaging = getMessaging();
  }
  return messaging;
};

/**
 * VAPID Key from Firebase Console
 * Get from: Project Settings → Cloud Messaging → Web Push certificates
 * 
 * TODO: Generate VAPID key in Firebase Console and add to .env.local:
 * VITE_FIREBASE_VAPID_KEY=your-vapid-key-here
 */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Request notification permission and get FCM token
 * Saves token to user's Firestore document
 * 
 * @param userId - User ID to save token for
 * @returns FCM token or null if permission denied
 */
export async function requestNotificationPermission(userId: string): Promise<string | null> {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.warn('❌ Notifications not supported in this browser');
      return null;
    }

    // Check if FCM is supported
    const messagingInstance = await initMessaging();
    if (!messagingInstance) {
      console.warn('❌ Firebase Messaging not supported');
      return null;
    }

    // Check current permission
    let permission = Notification.permission;
    
    // Request permission if not granted
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    
    if (permission !== 'granted') {
      console.warn('❌ Notification permission denied');
      return null;
    }

    console.log('✅ Notification permission granted');

    // Check if VAPID key is configured
    if (!VAPID_KEY) {
      console.warn('⚠️ VAPID key not configured. Add VITE_FIREBASE_VAPID_KEY to .env.local');
      console.log('Get VAPID key from: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates');
      return null;
    }

    // Get FCM token
    const token = await getToken(messagingInstance, { vapidKey: VAPID_KEY });
    
    if (!token) {
      console.warn('❌ No FCM token received');
      return null;
    }

    console.log('✅ FCM Token received:', token.substring(0, 20) + '...');

    // Save token to Firestore
    await saveTokenToFirestore(userId, token);
    
    return token;
    
  } catch (error) {
    console.error('❌ Error getting notification permission:', error);
    return null;
  }
}

// localStorage key is user-scoped so multi-account devices work correctly
const fcmStorageKey = (userId: string) => `nexus_fcm_token_${userId}`;

/**
 * Save FCM token to user document.
 * Tracks the previously registered token for this browser in localStorage.
 * When the token rotates, the old entry is replaced rather than accumulated,
 * preventing the same device from collecting multiple valid tokens and causing
 * duplicate push notifications.
 */
const MAX_FCM_TOKENS = 5;

async function saveTokenToFirestore(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const previousToken = localStorage.getItem(fcmStorageKey(userId));

    if (previousToken === token) {
      // Token unchanged — skip the write entirely
      return;
    }

    // Always do a full read so we can deduplicate and enforce the cap
    const userSnap = await getDoc(userRef);
    const existing: string[] = userSnap.data()?.fcmTokens ?? [];

    if (previousToken) {
      // Token rotated — swap old for new
      const updated = existing.filter((t) => t !== previousToken);
      if (!updated.includes(token)) updated.push(token);
      await updateDoc(userRef, {
        fcmTokens: updated.slice(-MAX_FCM_TOKENS),
        lastTokenUpdate: new Date().toISOString(),
      });
    } else {
      // No localStorage entry (new device, cleared storage, etc.)
      if (existing.includes(token)) {
        // Token already registered — just sync localStorage and bail
        localStorage.setItem(fcmStorageKey(userId), token);
        return;
      }
      // New token — add it, trimming oldest if over the cap
      const updated = [...existing, token].slice(-MAX_FCM_TOKENS);
      await updateDoc(userRef, {
        fcmTokens: updated,
        lastTokenUpdate: new Date().toISOString(),
      });
    }

    localStorage.setItem(fcmStorageKey(userId), token);
    console.log('✅ FCM token saved to Firestore');

  } catch (error) {
    console.error('❌ Error saving FCM token to Firestore:', error);
    throw error;
  }
}

/**
 * Listen for foreground messages (app open)
 * 
 * @param callback - Function to call when message received
 * @returns Unsubscribe function
 */
export function onForegroundMessage(callback: (payload: any) => void): () => void {
  const setupListener = async () => {
    const messagingInstance = await initMessaging();
    if (!messagingInstance) return () => {};
    
    return onMessage(messagingInstance, (payload) => {
      console.log('📩 Foreground message received:', payload);
      callback(payload);
    });
  };
  
  let unsubscribe: (() => void) | null = null;
  setupListener().then(unsub => {
    unsubscribe = unsub;
  });
  
  return () => {
    if (unsubscribe) unsubscribe();
  };
}

/**
 * Remove FCM token from user on logout
 * 
 * @param userId - User ID
 * @param token - FCM token to remove
 */
export async function removeToken(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const currentTokens = userDoc.data().fcmTokens || [];
      const updatedTokens = currentTokens.filter((t: string) => t !== token);
      await updateDoc(userRef, { fcmTokens: updatedTokens });
    }

    // Clear localStorage so a fresh token is registered on next login
    localStorage.removeItem(fcmStorageKey(userId));
    console.log('✅ FCM token removed from Firestore');
  } catch (error) {
    console.error('❌ Error removing FCM token:', error);
  }
}

/**
 * Check if notification permission is granted
 * 
 * @returns true if permission granted
 */
export function hasNotificationPermission(): boolean {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

/**
 * Get current notification permission status
 * 
 * @returns 'granted', 'denied', or 'default'
 */
export function getNotificationPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}


