/**
 * Notification Context
 * Manages push notification state, FCM token, and foreground messages
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { requestNotificationPermission, onForegroundMessage, hasNotificationPermission } from '../services/firebase/messaging';

interface NotificationContextType {
  fcmToken: string | null;
  hasPermission: boolean;
  unreadCount: number;
  activeChatId: string | null;       // chatId or teamId the user is currently viewing
  setActiveChatId: (id: string | null) => void;
  requestPermission: () => Promise<void>;
  incrementUnreadCount: () => void;
  resetUnreadCount: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Check permission status on mount
  useEffect(() => {
    setHasPermission(hasNotificationPermission());
  }, []);

  // Always refresh FCM token when user logs in (even if permission was already granted)
  // Tokens can go stale — refreshing on every login ensures delivery keeps working
  useEffect(() => {
    if (!user) return;

    const refreshToken = async () => {
      const token = await requestNotificationPermission(user.id);
      if (token) {
        setFcmToken(token);
        setHasPermission(true);
        console.log('✅ FCM token refreshed');
      }
    };

    refreshToken();
  }, [user?.id]); // re-run only when the logged-in user changes

  // Listen for foreground messages when user is logged in
  useEffect(() => {
    if (!user || !hasPermission) return;

    const unsubscribe = onForegroundMessage((payload) => {
      console.log('📩 Foreground notification received:', payload);

      // Suppress if user is currently viewing this chat/team
      const incomingChatId = payload.data?.chatId || payload.data?.teamId;
      if (incomingChatId && incomingChatId === activeChatId) {
        console.log('🔕 Suppressed notification — user is viewing this chat');
        return;
      }

      // Show browser notification (even in foreground)
      showBrowserNotification(payload);

      // Increment unread count
      setUnreadCount(prev => prev + 1);

      // Play sound (optional)
      playNotificationSound();

      // Update app badge if supported
      updateAppBadge(unreadCount + 1);
    });

    return unsubscribe;
  }, [user, hasPermission, unreadCount, activeChatId]);

  /**
   * Request notification permission
   */
  const requestPermissionAsync = useCallback(async () => {
    if (!user) {
      console.warn('Cannot request notification permission: user not logged in');
      return;
    }

    const token = await requestNotificationPermission(user.id);
    
    if (token) {
      setFcmToken(token);
      setHasPermission(true);
      console.log('✅ Notifications enabled');
    } else {
      setHasPermission(false);
      console.log('❌ Notifications disabled or not supported');
    }
  }, [user]);

  /**
   * Show browser notification
   */
  const showBrowserNotification = (payload: any) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = payload.notification?.title || 'NEXUS';
    const options = {
      body: payload.notification?.body || 'You have a new notification',
      icon: '/nexus-icon.svg',
      badge: '/favicon-96x96.png',
      tag: payload.data?.type || 'general',
      data: payload.data,
    };

    const notification = new Notification(title, options);

    // Handle click
    notification.onclick = () => {
      window.focus();
      notification.close();
      
      // Navigate based on type
      const data = payload.data || {};
      if (data.type === 'event_new' || data.type === 'event_modified') {
        window.location.href = data.eventId ? `/calendar/events/${data.eventId}` : '/calendar';
      } else if (data.type === 'chat_message') {
        window.location.href = data.chatId ? `/chat/${data.chatId}` : '/chat';
      } else if (data.click_action) {
        window.location.href = data.click_action;
      }
    };
  };

  /**
   * Play notification sound
   */
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3'); // Add notification sound to public folder
      audio.volume = 0.3;
      audio.play().catch(err => console.log('Cannot play sound:', err));
    } catch (error) {
      // Silently fail if sound not available
    }
  };

  /**
   * Update app badge count
   */
  const updateAppBadge = (count: number) => {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  };

  /**
   * Increment unread count
   */
  const incrementUnreadCount = useCallback(() => {
    setUnreadCount(prev => {
      const newCount = prev + 1;
      updateAppBadge(newCount);
      return newCount;
    });
  }, []);

  /**
   * Reset unread count
   */
  const resetUnreadCount = useCallback(() => {
    setUnreadCount(0);
    updateAppBadge(0);
  }, []);

  return (
    <NotificationContext.Provider value={{
      fcmToken,
      hasPermission,
      unreadCount,
      activeChatId,
      setActiveChatId,
      requestPermission: requestPermissionAsync,
      incrementUnreadCount,
      resetUnreadCount,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};


