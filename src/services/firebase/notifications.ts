/**
 * Notification Service
 * Helper functions for creating and sending notifications
 */

import { collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';

export type NotificationType =
  | 'event_reminder'
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'team_update'
  | 'join_request'
  | 'role_change'
  | 'general'
  | 'chat_message'
  | 'team_chat_message'
  | 'waitlist_promotion'
  | 'club_announcement'
  | 'order_created'
  | 'order_deadline';

export interface NotificationData {
  recipientId: string;
  senderId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    teamId?: string;
    eventId?: string;
    clubId?: string;
    chatId?: string;
    actionUrl?: string;
    [key: string]: any;
  };
}

/**
 * Send notification to a single user
 * Creates notification document in Firestore
 * Note: Actual push notification sending requires Cloud Function
 */
export const sendNotification = async (params: NotificationData): Promise<void> => {
  try {
    // Check if recipient has notifications enabled
    const recipientDoc = await getDoc(doc(db, 'users', params.recipientId));
    if (!recipientDoc.exists()) {
      console.warn(`User ${params.recipientId} not found`);
      return;
    }

    const recipient = recipientDoc.data() as User;
    const notificationPrefs = recipient.notificationPreferences;

    // Must have at least one FCM token to deliver a push
    if (!recipient.fcmToken && (!recipient.fcmTokens || recipient.fcmTokens.length === 0)) {
      console.log(`User ${params.recipientId} has no FCM token — skipping push`);
      return;
    }

    // Check type-specific preferences (skip check if prefs not set — default to enabled)
    const typePreferenceMap: Record<NotificationType, keyof NonNullable<typeof notificationPrefs>> = {
      event_reminder: 'eventReminders',
      event_created: 'eventReminders',
      event_updated: 'eventReminders',
      event_deleted: 'eventReminders',
      team_update: 'teamUpdates',
      join_request: 'joinRequests',
      role_change: 'systemNotifications',
      general: 'systemNotifications',
      chat_message: 'chatMessages',
      team_chat_message: 'chatMessages',
      waitlist_promotion: 'waitlistPromotions',
      club_announcement: 'clubAnnouncements',
      order_created: 'systemNotifications',
      order_deadline: 'systemNotifications',
    };

    const preferenceKey = typePreferenceMap[params.type];
    if (notificationPrefs && preferenceKey && notificationPrefs[preferenceKey] === false) {
      console.log(`User ${params.recipientId} has disabled ${params.type} notifications`);
      return;
    }

    // Create notification document
    await addDoc(collection(db, 'notifications'), {
      recipientId: params.recipientId,
      senderId: params.senderId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data || {},
      read: false,
      createdAt: Timestamp.now(),
    });

    console.log(`✅ Notification created for user ${params.recipientId}`);

    // TODO: Call Cloud Function to send actual push notification
    // This would be implemented in Firebase Functions
    // Example: httpsCallable(functions, 'sendPushNotification')({ notificationId })
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    throw error;
  }
};

/**
 * Send notification to all members of a team
 */
export const sendTeamNotification = async (
  teamId: string,
  clubId: string,
  senderId: string,
  title: string,
  body: string,
  type: NotificationType = 'team_update',
  actionUrl?: string
): Promise<void> => {
  try {
    // Get club document to access team members
    const clubDoc = await getDoc(doc(db, 'clubs', clubId));
    if (!clubDoc.exists()) {
      console.warn(`Club ${clubId} not found`);
      return;
    }

    const clubData = clubDoc.data();
    const team = clubData.teams?.find((t: any) => t.id === teamId);
    
    if (!team) {
      console.warn(`Team ${teamId} not found in club ${clubId}`);
      return;
    }

    // Get all team member IDs
    const memberIds = Object.keys(team.members || {});

    // Send notification to each member (except sender)
    const notifications = memberIds
      .filter(memberId => memberId !== senderId)
      .map(recipientId =>
        sendNotification({
          recipientId,
          senderId,
          type,
          title,
          body,
          data: {
            teamId,
            clubId,
            actionUrl: actionUrl || `/clubs/${clubId}/teams/${teamId}`,
          },
        })
      );

    await Promise.allSettled(notifications);
    console.log(`✅ Sent team notification to ${notifications.length} members`);
  } catch (error) {
    console.error('❌ Error sending team notification:', error);
    throw error;
  }
};

/**
 * Send notification to all trainers/owners of a club
 */
export const sendClubTrainersNotification = async (
  clubId: string,
  senderId: string,
  title: string,
  body: string,
  type: NotificationType = 'join_request',
  actionUrl?: string
): Promise<void> => {
  try {
    // Get club document
    const clubDoc = await getDoc(doc(db, 'clubs', clubId));
    if (!clubDoc.exists()) {
      console.warn(`Club ${clubId} not found`);
      return;
    }

    const clubData = clubDoc.data();
    const trainerIds = clubData.trainers || [];
    const ownerId = clubData.ownerId;

    // Combine owner and trainers
    const recipientIds = [...trainerIds, ownerId].filter(
      (id): id is string => !!id && id !== senderId
    );

    // Remove duplicates
    const uniqueRecipientIds = Array.from(new Set(recipientIds));

    // Send notification to each trainer/owner
    const notifications = uniqueRecipientIds.map(recipientId =>
      sendNotification({
        recipientId,
        senderId,
        type,
        title,
        body,
        data: {
          clubId,
          actionUrl: actionUrl || `/clubs/${clubId}`,
        },
      })
    );

    await Promise.allSettled(notifications);
    console.log(`✅ Sent notification to ${notifications.length} club trainers/owners`);
  } catch (error) {
    console.error('❌ Error sending club trainers notification:', error);
    throw error;
  }
};

/**
 * Send notification to all members of a club
 */
export const sendClubAnnouncementNotification = async (
  clubId: string,
  senderId: string,
  title: string,
  body: string,
  actionUrl?: string
): Promise<void> => {
  try {
    // Get all users who are members of this club
    const usersQuery = query(
      collection(db, 'users'),
      where('clubIds', 'array-contains', clubId)
    );

    const usersSnapshot = await getDocs(usersQuery);
    const memberIds = usersSnapshot.docs
      .map(doc => doc.id)
      .filter(id => id !== senderId);

    // Send notification to each member
    const notifications = memberIds.map(recipientId =>
      sendNotification({
        recipientId,
        senderId,
        type: 'club_announcement',
        title,
        body,
        data: {
          clubId,
          actionUrl: actionUrl || `/clubs/${clubId}`,
        },
      })
    );

    await Promise.allSettled(notifications);
    console.log(`✅ Sent club announcement to ${notifications.length} members`);
  } catch (error) {
    console.error('❌ Error sending club announcement:', error);
    throw error;
  }
};

/**
 * Send event reminder notification
 */
export const sendEventReminderNotification = async (
  eventId: string,
  teamId: string,
  clubId: string,
  senderId: string,
  eventTitle: string,
  eventDate: string,
  eventTime?: string
): Promise<void> => {
  const timeStr = eventTime ? ` at ${eventTime}` : '';
  await sendTeamNotification(
    teamId,
    clubId,
    senderId,
    '📅 Event Reminder',
    `${eventTitle} is coming up on ${eventDate}${timeStr}`,
    'event_reminder',
    `/calendar/events/${eventId}`
  );
};

/**
 * Send role change notification
 */
export const sendRoleChangeNotification = async (
  userId: string,
  senderId: string,
  newRole: string,
  teamName: string,
  clubId: string,
  teamId?: string
): Promise<void> => {
  await sendNotification({
    recipientId: userId,
    senderId,
    type: 'role_change',
    title: '👤 Role Updated',
    body: `You are now a ${newRole} in ${teamName}`,
    data: {
      clubId,
      teamId,
      actionUrl: teamId ? `/clubs/${clubId}/teams/${teamId}` : `/clubs/${clubId}`,
    },
  });
};

/**
 * Send join request notification to trainers
 */
export const sendJoinRequestNotification = async (
  clubId: string,
  senderId: string,
  userName: string,
  teamName?: string
): Promise<void> => {
  const message = teamName
    ? `${userName} wants to join ${teamName}`
    : `${userName} wants to join your club`;

  await sendClubTrainersNotification(
    clubId,
    senderId,
    '🙋 New Join Request',
    message,
    'join_request',
    `/clubs/${clubId}?tab=requests`
  );
};

/**
 * Send waitlist promotion notification
 */
export const sendWaitlistPromotionNotification = async (
  userId: string,
  senderId: string,
  eventTitle: string,
  eventId: string
): Promise<void> => {
  await sendNotification({
    recipientId: userId,
    senderId,
    type: 'waitlist_promotion',
    title: '⏫ Spot Available!',
    body: `A spot has opened up for "${eventTitle}". RSVP now!`,
    data: {
      eventId,
      actionUrl: `/calendar/events/${eventId}`,
    },
  });
};

// ==================== Multilingual Notification Helpers ====================

/**
 * Get user's language preference
 */
async function getUserLanguage(userId: string): Promise<'en' | 'sk'> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data() as User;
      return userData.language === 'sk' ? 'sk' : 'en';
    }
  } catch (error) {
    console.error('Error getting user language:', error);
  }
  return 'en'; // Default to English
}

/**
 * Send calendar event created notification
 */
export const sendEventCreatedNotification = async (
  recipientId: string,
  senderId: string,
  eventTitle: string,
  eventId: string,
  clubId?: string,
  teamId?: string
): Promise<void> => {
  const language = await getUserLanguage(recipientId);
  
  const titles = {
    en: '📅 New Event Created',
    sk: '📅 Nová udalosť vytvorená'
  };
  
  const bodies = {
    en: `New event: "${eventTitle}"`,
    sk: `Nová udalosť: "${eventTitle}"`
  };

  await sendNotification({
    recipientId,
    senderId,
    type: 'event_created',
    title: titles[language],
    body: bodies[language],
    data: {
      eventId,
      clubId,
      teamId,
      actionUrl: `/calendar/events/${eventId}`,
    },
  });
};

/**
 * Send calendar event updated notification
 */
export const sendEventUpdatedNotification = async (
  recipientId: string,
  senderId: string,
  eventTitle: string,
  eventId: string,
  clubId?: string,
  teamId?: string
): Promise<void> => {
  const language = await getUserLanguage(recipientId);
  
  const titles = {
    en: '📝 Event Updated',
    sk: '📝 Udalosť aktualizovaná'
  };
  
  const bodies = {
    en: `"${eventTitle}" has been updated`,
    sk: `"${eventTitle}" bola aktualizovaná`
  };

  await sendNotification({
    recipientId,
    senderId,
    type: 'event_updated',
    title: titles[language],
    body: bodies[language],
    data: {
      eventId,
      clubId,
      teamId,
      actionUrl: `/calendar/events/${eventId}`,
    },
  });
};

/**
 * Send calendar event deleted notification
 */
export const sendEventDeletedNotification = async (
  recipientId: string,
  senderId: string,
  eventTitle: string,
  clubId?: string,
  teamId?: string
): Promise<void> => {
  const language = await getUserLanguage(recipientId);
  
  const titles = {
    en: '🗑️ Event Cancelled',
    sk: '🗑️ Udalosť zrušená'
  };
  
  const bodies = {
    en: `"${eventTitle}" has been cancelled`,
    sk: `"${eventTitle}" bola zrušená`
  };

  await sendNotification({
    recipientId,
    senderId,
    type: 'event_deleted',
    title: titles[language],
    body: bodies[language],
    data: {
      clubId,
      teamId,
      actionUrl: '/calendar',
    },
  });
};

/**
 * Send team chat message notification
 */
export const sendTeamChatNotification = async (
  recipientId: string,
  senderId: string,
  senderName: string,
  message: string,
  teamId: string,
  teamName: string,
  clubId: string
): Promise<void> => {
  const language = await getUserLanguage(recipientId);
  
  const titles = {
    en: `💬 ${teamName}`,
    sk: `💬 ${teamName}`
  };
  
  const bodies = {
    en: `${senderName}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
    sk: `${senderName}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`
  };

  await sendNotification({
    recipientId,
    senderId,
    type: 'team_chat_message',
    title: titles[language],
    body: bodies[language],
    data: {
      teamId,
      clubId,
      actionUrl: `/clubs/${clubId}/teams/${teamId}?tab=chat`,
    },
  });
};

