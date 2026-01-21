/**
 * useNotifications Hook
 * Handles FCM token registration, permission requests, and notification settings
 */

import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, messaging as messagingPromise } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface NotificationSettings {
  enabled: boolean;
  eventReminders: boolean;
  chatMessages: boolean;
  teamUpdates: boolean;
  clubAnnouncements: boolean;
  joinRequests: boolean;
  waitlistPromotions: boolean;
  systemNotifications: boolean;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    eventReminders: true,
    chatMessages: true,
    teamUpdates: true,
    clubAnnouncements: true,
    joinRequests: true,
    waitlistPromotions: true,
    systemNotifications: true,
  });

  // Check current permission status on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Load user notification settings
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.id));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.notificationPreferences) {
            setSettings({
              enabled: Notification.permission === 'granted' && !!data.fcmToken,
              ...data.notificationPreferences,
            });
          }
        }
      } catch (err) {
        console.error('Error loading notification settings:', err);
      }
    };

    loadSettings();
  }, [user]);

  // Listen for foreground messages (when app is open)
  useEffect(() => {
    if (!user || permission !== 'granted') return;

    let unsubscribe: (() => void) | null = null;

    messagingPromise.then((messaging) => {
      if (!messaging) {
        console.warn('Firebase Messaging not supported in this browser');
        return;
      }

      unsubscribe = onMessage(messaging, (payload) => {
        console.log('📩 Foreground message received:', payload);
        
        // Show notification when app is open
        if (payload.notification) {
          const { title, body } = payload.notification;
          
          // Create browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title || 'Nexus Notification', {
              body: body || '',
              icon: '/apple-touch-icon.png',
              badge: '/favicon-96x96.png',
              data: payload.data,
              tag: payload.data?.type || 'general',
            });

            // Handle notification click
            notification.onclick = () => {
              window.focus();
              notification.close();
              
              const data = payload.data || {};
              if (data.actionUrl) {
                window.location.href = data.actionUrl;
              }
            };
          }
        }
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, permission]);

  // Request notification permission
  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser');
      return false;
    }

    try {
      setLoading(true);
      setError(null);

      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission === 'granted') {
        await registerToken();
        return true;
      } else {
        setError('Notification permission denied');
        return false;
      }
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request notification permission');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Register FCM token
  const registerToken = async (): Promise<void> => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const messaging = await messagingPromise;
      if (!messaging) {
        throw new Error('Firebase Messaging not supported');
      }

      // Get FCM token
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey || vapidKey === 'placeholder-vapid-key') {
        throw new Error('VAPID key not configured. Please add VITE_FIREBASE_VAPID_KEY to .env.local');
      }

      const token = await getToken(messaging, { vapidKey });
      setFcmToken(token);

      // Save token to Firestore
      await updateDoc(doc(db, 'users', user.id), {
        fcmToken: token,
        lastTokenUpdate: new Date().toISOString(),
      });

      console.log('✅ FCM Token registered:', token);
    } catch (err: any) {
      console.error('❌ Error registering token:', err);
      
      if (err.code === 'messaging/permission-blocked') {
        setError('Notifications are blocked. Please enable them in browser settings.');
      } else if (err.message?.includes('VAPID')) {
        setError('Notification setup incomplete. Please contact support.');
      } else {
        setError('Failed to register device for notifications');
      }
    } finally {
      setLoading(false);
    }
  };

  // Update notification settings
  const updateSettings = async (newSettings: Partial<NotificationSettings>): Promise<void> => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      // Save to Firestore (excluding 'enabled' which is derived from permission)
      const { enabled, ...preferences } = updatedSettings;
      await updateDoc(doc(db, 'users', user.id), {
        notificationPreferences: preferences,
      });

      console.log('✅ Notification settings updated');
    } catch (err) {
      console.error('❌ Error updating settings:', err);
      setError('Failed to update notification settings');
    } finally {
      setLoading(false);
    }
  };

  // Enable notifications (request permission + register token)
  const enableNotifications = async (): Promise<boolean> => {
    const granted = await requestPermission();
    if (granted) {
      await updateSettings({ enabled: true });
    }
    return granted;
  };

  // Disable notifications
  const disableNotifications = async (): Promise<void> => {
    await updateSettings({ enabled: false });
  };

  return {
    permission,
    fcmToken,
    error,
    loading,
    settings,
    requestPermission,
    registerToken,
    updateSettings,
    enableNotifications,
    disableNotifications,
  };
};

