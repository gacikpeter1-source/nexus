/**
 * Notifications Page
 * Display user's push notifications with delete and mark as unread functionality
 * Includes swipe-to-delete gesture support
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import Container from '../components/layout/Container';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  updateDoc,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  type: string;
  title: string;
  body: string;
  data?: {
    actionUrl?: string;
    eventId?: string;
    teamId?: string;
    clubId?: string;
    [key: string]: any;
  };
  read: boolean;
  createdAt: Timestamp;
}

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Real-time listener for user's notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notificationsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
        
        setNotifications(notificationsList);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading notifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      try {
        await updateDoc(doc(db, 'notifications', notification.id), {
          read: true,
        });
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    // Navigate to action URL if provided
    if (notification.data?.actionUrl) {
      navigate(notification.data.actionUrl);
    }
  };

  const handleDelete = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleMarkAsUnread = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: false,
      });
    } catch (error) {
      console.error('Error marking notification as unread:', error);
    }
  };

  const handleTouchStart = (_e: React.TouchEvent, notificationId: string) => {
    setSwipingId(notificationId);
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipingId) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - e.currentTarget.getBoundingClientRect().left;
    
    if (deltaX < 0) {
      setSwipeOffset(Math.max(deltaX, -100));
    }
  };

  const handleTouchEnd = async (notificationId: string) => {
    if (swipeOffset < -60) {
      // Swipe threshold reached - delete notification
      await deleteDoc(doc(db, 'notifications', notificationId));
    }
    
    setSwipingId(null);
    setSwipeOffset(0);
  };

  const getNotificationIcon = (type: string) => {
    const icons: Record<string, string> = {
      event_reminder: '📅',
      team_update: '👥',
      join_request: '🙋',
      role_change: '👤',
      general: '📢',
      chat_message: '💬',
      waitlist_promotion: '⏫',
      club_announcement: '📢',
    };
    return icons[type] || '🔔';
  };

  const formatTimeAgo = (timestamp: Timestamp) => {
    const now = new Date();
    const date = timestamp.toDate();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return t('notifications.justNow');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('notifications.minutesAgo')}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('notifications.hoursAgo')}`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t('notifications.daysAgo')}`;
    
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <Container className="max-w-4xl">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary text-sm">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="max-w-4xl">
      <div className="space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
              🔔 {t('notifications.title')}
            </h1>
            {unreadCount > 0 && (
              <p className="text-xs sm:text-sm text-text-muted mt-1">
                {unreadCount} {t('notifications.unread')}
              </p>
            )}
          </div>
        </div>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div className="bg-app-card rounded-lg sm:rounded-xl border border-white/10 p-8 sm:p-12 text-center">
            <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🔔</div>
            <h3 className="text-base sm:text-lg font-semibold text-text-primary mb-2">
              {t('notifications.noNotifications')}
            </h3>
            <p className="text-xs sm:text-sm text-text-muted">
              {t('notifications.noNotificationsHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="relative overflow-hidden"
                onTouchStart={(e) => handleTouchStart(e, notification.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd(notification.id)}
              >
                {/* Swipe Background (Delete) */}
                <div className="absolute inset-0 bg-chart-pink flex items-center justify-end pr-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>

                {/* Notification Card */}
                <div
                  className={`bg-app-card rounded-lg border ${
                    notification.read ? 'border-white/10' : 'border-app-cyan/30 bg-app-cyan/5'
                  } transition-transform duration-200 cursor-pointer hover:border-app-cyan/50`}
                  style={{
                    transform: swipingId === notification.id ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                  }}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="text-2xl sm:text-3xl flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`text-sm sm:text-base font-semibold ${
                            notification.read ? 'text-text-primary' : 'text-app-cyan'
                          }`}>
                            {notification.title}
                          </h3>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-app-cyan rounded-full flex-shrink-0 mt-1"></div>
                          )}
                        </div>
                        
                        <p className="text-xs sm:text-sm text-text-secondary mb-2">
                          {notification.body}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] sm:text-xs text-text-muted">
                            {formatTimeAgo(notification.createdAt)}
                          </span>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            {notification.read && (
                              <button
                                onClick={(e) => handleMarkAsUnread(notification.id, e)}
                                className="text-[10px] sm:text-xs text-app-cyan hover:text-app-cyan/80 transition-colors font-medium"
                                title={t('notifications.markAsUnread')}
                              >
                                {t('notifications.markAsUnread')}
                              </button>
                            )}
                            <button
                              onClick={(e) => handleDelete(notification.id, e)}
                              className="p-1.5 hover:bg-chart-pink/20 rounded transition-colors"
                              title={t('notifications.delete')}
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Swipe Hint */}
        {notifications.length > 0 && (
          <div className="bg-app-secondary rounded-lg p-3 border border-white/10">
            <p className="text-[10px] sm:text-xs text-text-muted text-center">
              💡 {t('notifications.swipeHint')}
            </p>
          </div>
        )}
      </div>
    </Container>
  );
}
