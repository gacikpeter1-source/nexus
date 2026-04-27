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
              {t('notifications.title')}
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

                {/* Notification Card - Compact Inline */}
                <div
                  className={`bg-app-card rounded-lg border ${
                    notification.read ? 'border-white/10' : 'border-app-blue/30 bg-app-blue/5'
                  } transition-transform duration-200 cursor-pointer hover:border-app-blue/50`}
                  style={{
                    transform: swipingId === notification.id ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                  }}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="px-3 py-2 sm:px-4 sm:py-2.5">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* Unread Indicator Dot */}
                      {!notification.read && (
                        <div className="w-2 h-2 bg-app-blue rounded-full flex-shrink-0"></div>
                      )}
                      {notification.read && (
                        <div className="w-2 h-2 flex-shrink-0"></div>
                      )}

                      {/* Title */}
                      <h3 className={`text-xs sm:text-sm font-semibold truncate flex-1 min-w-0 ${
                        notification.read ? 'text-text-primary' : 'text-app-blue'
                      }`}>
                        {notification.title}
                      </h3>

                      {/* Time */}
                      <span className="text-[10px] sm:text-xs text-text-muted flex-shrink-0">
                        {formatTimeAgo(notification.createdAt)}
                      </span>

                      {/* Sender */}
                      <span className="text-[10px] sm:text-xs text-text-secondary flex-shrink-0 hidden sm:block">
                        {notification.senderId === 'system' ? 'System' : notification.senderId}
                      </span>

                      {/* Read Status Badge */}
                      <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        notification.read 
                          ? 'bg-app-secondary text-text-muted' 
                          : 'bg-app-blue/20 text-app-blue'
                      }`}>
                        {notification.read ? t('notifications.read') : t('notifications.unread')}
                      </span>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {notification.read && (
                          <button
                            onClick={(e) => handleMarkAsUnread(notification.id, e)}
                            className="p-1 hover:bg-app-blue/20 rounded transition-colors"
                            title={t('notifications.markAsUnread')}
                          >
                            <svg className="w-3.5 h-3.5 text-app-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(notification.id, e)}
                          className="p-1 hover:bg-chart-pink/20 rounded transition-colors"
                          title={t('notifications.delete')}
                        >
                          <svg className="w-3.5 h-3.5 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Body text on second line if needed */}
                    {notification.body && (
                      <p className="text-[10px] sm:text-xs text-text-secondary mt-1 ml-5 line-clamp-1">
                        {notification.body}
                      </p>
                    )}
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
