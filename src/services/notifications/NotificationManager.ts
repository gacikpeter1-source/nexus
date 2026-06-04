/**
 * Centralized Notification Manager
 * Handles all notification triggers for events, join requests, chat, waitlist, etc.
 * Supports both in-app notifications and email notifications (future)
 */

import { collection, addDoc, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';
import { getTeamMembers } from '../firebase/teams';
import {
  sendEventCreatedNotification,
  sendEventUpdatedNotification,
  sendEventDeletedNotification,
  sendTeamChatNotification
} from '../firebase/notifications';

/**
 * Build the full recipient list for a team event:
 * - All team members (handles both membersData and legacy arrays via getTeamMembers)
 * - Club owner (has oversight of all teams)
 * - Club-level trainers (may not be explicitly added to individual teams)
 */
async function getTeamEventRecipients(clubId: string, teamId: string): Promise<string[]> {
  const clubDoc = await getDoc(doc(db, 'clubs', clubId));
  if (!clubDoc.exists()) return [];

  const clubData = clubDoc.data();
  const teams: any[] = clubData.teams || [];
  const team = teams.find((t: any) => t.id === teamId);

  const memberIds = new Set<string>();

  // Team members (all roles, both new and legacy formats)
  if (team) {
    const teamMembers = getTeamMembers(team);
    Object.keys(teamMembers).forEach(id => memberIds.add(id));
  }

  // Club owner always receives team event notifications
  if (clubData.ownerId) memberIds.add(clubData.ownerId);
  if (clubData.superTrainer) memberIds.add(clubData.superTrainer);

  // Club-level trainers (may not be in individual team's member list)
  (clubData.trainers || []).forEach((id: string) => memberIds.add(id));

  return Array.from(memberIds);
}

export type NotificationCategory =
  | 'event_created'
  | 'event_modified'
  | 'event_deleted'
  | 'event_reminder'
  | 'waitlist_free_spot'
  | 'waitlist_assigned'
  | 'event_removed'
  | 'event_swapped'
  | 'join_request_approved'
  | 'join_request_pending'
  | 'chat_message'
  | 'chat_mention'
  | 'chat_high_priority'
  | 'team_update'
  | 'club_announcement'
  | 'order_created'
  | 'order_deadline';

export class NotificationManager {
  /**
   * Check if user has notification enabled for specific category
   */
  private static async isNotificationEnabled(userId: string, category: NotificationCategory): Promise<boolean> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return false;

      const user = userDoc.data() as User;
      const prefs = user.notificationPreferences;

      // No preferences set means the user hasn't customised anything → default to enabled
      if (!prefs) return true;

      // Map categories to user preference fields
      const categoryMap: Record<NotificationCategory, keyof typeof prefs> = {
        event_created: 'eventCreated',
        event_modified: 'eventModified',
        event_deleted: 'eventDeleted',
        event_reminder: 'eventReminders',
        waitlist_free_spot: 'waitlistPromotions',
        waitlist_assigned: 'waitlistPromotions',
        event_removed: 'eventModified',
        event_swapped: 'eventModified',
        join_request_approved: 'joinRequests',
        join_request_pending: 'joinRequests',
        chat_message: 'chatMessages',
        chat_mention: 'chatMentions',
        chat_high_priority: 'chatHighPriority',
        team_update: 'teamUpdates',
        club_announcement: 'clubAnnouncements',
        order_created: 'systemNotifications',
        order_deadline: 'systemNotifications',
      };

      const prefKey = categoryMap[category];
      return prefs[prefKey] !== false; // Default to true if not set
    } catch (error) {
      console.error('Error checking notification preference:', error);
      return false;
    }
  }

  /**
   * Create notification record and trigger push/email
   */
  private static async createNotification(params: {
    recipientId: string;
    senderId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    data?: any;
    sendEmail?: boolean;
  }): Promise<void> {
    try {
      // Check if user has this notification type enabled
      const enabled = await this.isNotificationEnabled(params.recipientId, params.category);
      if (!enabled) {
        console.log(`Notification ${params.category} disabled for user ${params.recipientId}`);
        return;
      }

      // Create notification document
      await addDoc(collection(db, 'notifications'), {
        recipientId: params.recipientId,
        senderId: params.senderId,
        type: params.category,
        title: params.title,
        body: params.body,
        data: params.data || {},
        read: false,
        createdAt: Timestamp.now(),
      });

      // TODO: Email notification (if enabled and sendEmail = true)
      if (params.sendEmail) {
        // Will be implemented later
        // await sendEmailNotification(params);
      }

      console.log(`✅ Notification created: ${params.category} for user ${params.recipientId}`);
    } catch (error) {
      console.error('❌ Error creating notification:', error);
    }
  }

  // ========================================
  // EVENT NOTIFICATIONS
  // ========================================

  /**
   * Event Created - Notify team or club members
   */
  static async onEventCreated(params: {
    eventId: string;
    eventData: any;
    createdBy: string;
  }): Promise<void> {
    const { eventId, eventData, createdBy } = params;

    try {
      // Get team/club members to notify
      const clubDoc = await getDoc(doc(db, 'clubs', eventData.clubId));
      if (!clubDoc.exists()) return;

      const clubData = clubDoc.data();
      let memberIds: string[] = [];

      // Team event — include team members + club owner + club trainers
      if (eventData.teamId) {
        memberIds = await getTeamEventRecipients(eventData.clubId, eventData.teamId);
      }
      // Club event — notify all club members
      else if (eventData.visibilityLevel === 'club') {
        memberIds = clubData.members || [];
      }

      // Send notification to each member (except creator)
      const notifications = memberIds
        .filter(memberId => memberId !== createdBy)
        .map(recipientId =>
          sendEventCreatedNotification(
            recipientId,
            createdBy,
            eventData.title,
            eventId,
            eventData.clubId,
            eventData.teamId
          )
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event created notifications sent to ${notifications.length} members`);
    } catch (error) {
      console.error('❌ Error sending event created notifications:', error);
    }
  }

  /**
   * Event Modified - Notify ALL team/club members (not just those who RSVPd)
   */
  static async onEventModified(params: {
    eventId: string;
    eventData: any;
    modifiedBy: string;
    changes: string;
  }): Promise<void> {
    const { eventId, eventData, modifiedBy } = params;

    try {
      const rsvpIds = Object.keys(eventData.responses || {});
      let memberIds = [...rsvpIds];

      if (eventData.teamId && eventData.clubId) {
        const teamRecipients = await getTeamEventRecipients(eventData.clubId, eventData.teamId);
        memberIds = [...new Set([...memberIds, ...teamRecipients])];
      } else if (eventData.clubId) {
        const clubDoc = await getDoc(doc(db, 'clubs', eventData.clubId));
        if (clubDoc.exists()) {
          const clubMembers: string[] = clubDoc.data().members || [];
          memberIds = [...new Set([...memberIds, ...clubMembers])];
        }
      }

      const notifications = memberIds
        .filter(id => id !== modifiedBy)
        .map(recipientId =>
          sendEventUpdatedNotification(
            recipientId,
            modifiedBy,
            eventData.title,
            eventId,
            eventData.clubId,
            eventData.teamId
          )
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event modified notifications sent to ${notifications.length} members`);
    } catch (error) {
      console.error('❌ Error sending event modified notifications:', error);
    }
  }

  /**
   * Event Deleted - Notify ALL team/club members (not just those who RSVPd)
   */
  static async onEventDeleted(params: {
    eventId: string;
    eventData: any;
    deletedBy: string;
  }): Promise<void> {
    const { eventData, deletedBy } = params;

    try {
      const rsvpIds = Object.keys(eventData.responses || {});
      let memberIds = [...rsvpIds];

      if (eventData.teamId && eventData.clubId) {
        const teamRecipients = await getTeamEventRecipients(eventData.clubId, eventData.teamId);
        memberIds = [...new Set([...memberIds, ...teamRecipients])];
      } else if (eventData.clubId) {
        const clubDoc = await getDoc(doc(db, 'clubs', eventData.clubId));
        if (clubDoc.exists()) {
          const clubMembers: string[] = clubDoc.data().members || [];
          memberIds = [...new Set([...memberIds, ...clubMembers])];
        }
      }

      const notifications = memberIds
        .filter(id => id !== deletedBy)
        .map(recipientId =>
          sendEventDeletedNotification(
            recipientId,
            deletedBy,
            eventData.title,
            eventData.clubId,
            eventData.teamId
          )
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event deleted notifications sent to ${notifications.length} members`);
    } catch (error) {
      console.error('❌ Error sending event deleted notifications:', error);
    }
  }

  // ========================================
  // JOIN REQUEST NOTIFICATIONS
  // ========================================

  /**
   * Join Request Approved - Notify user
   */
  static async onJoinRequestApproved(params: {
    userId: string;
    clubId: string;
    teamId?: string;
    approvedBy: string;
    clubName: string;
    teamName?: string;
  }): Promise<void> {
    const { userId, clubId, teamId, approvedBy, clubName, teamName } = params;

    const message = teamName
      ? `Your request to join ${teamName} in ${clubName} has been approved!`
      : `Your request to join ${clubName} has been approved!`;

    await this.createNotification({
      recipientId: userId,
      senderId: approvedBy,
      category: 'join_request_approved',
      title: '✅ Request Approved',
      body: message,
      data: {
        clubId,
        teamId,
        actionUrl: teamId ? `/clubs/${clubId}/teams/${teamId}` : `/clubs/${clubId}`,
      },
      sendEmail: true,
    });
  }

  /**
   * Join Request Pending - Notify trainers
   */
  static async onJoinRequestPending(params: {
    userId: string;
    clubId: string;
    teamId?: string;
    userName: string;
    clubName: string;
    teamName?: string;
  }): Promise<void> {
    const { userId, clubId, teamId, userName, teamName } = params;

    try {
      // Get club trainers and owners
      const clubDoc = await getDoc(doc(db, 'clubs', clubId));
      if (!clubDoc.exists()) return;

      const clubData = clubDoc.data();
      const trainerIds = [...new Set([...(clubData.trainers || []), clubData.ownerId].filter(Boolean))];

      const message = teamName
        ? `${userName} wants to join ${teamName}`
        : `${userName} wants to join your club`;

      // Notify each trainer
      const notifications = trainerIds.map(recipientId =>
        this.createNotification({
          recipientId,
          senderId: userId,
          category: 'join_request_pending',
          title: '🙋 New Join Request',
          body: message,
          data: {
            clubId,
            teamId,
            actionUrl: `/clubs/${clubId}?tab=requests`,
          },
          sendEmail: true,
        })
      );

      await Promise.allSettled(notifications);
      console.log(`✅ Join request notifications sent to ${notifications.length} trainers`);
    } catch (error) {
      console.error('❌ Error sending join request notifications:', error);
    }
  }

  // ========================================
  // WAITLIST NOTIFICATIONS
  // ========================================

  /**
   * Waitlist Free Spot - Notify waitlist users
   */
  static async onWaitlistFreeSpot(params: {
    eventId: string;
    eventTitle: string;
    waitlistUserIds: string[];
    triggeredBy: string;
  }): Promise<void> {
    const { eventId, eventTitle, waitlistUserIds, triggeredBy } = params;

    const notifications = waitlistUserIds.map(recipientId =>
      this.createNotification({
        recipientId,
        senderId: triggeredBy,
        category: 'waitlist_free_spot',
        title: '⏫ Spot Available!',
        body: `A spot has opened up for "${eventTitle}". RSVP now!`,
        data: {
          eventId,
          actionUrl: `/calendar/events/${eventId}`,
        },
        sendEmail: true,
      })
    );

    await Promise.allSettled(notifications);
    console.log(`✅ Waitlist notifications sent to ${notifications.length} users`);
  }

  /**
   * Waitlist Assigned - User moved from waitlist to participant
   */
  static async onWaitlistAssigned(params: {
    userId: string;
    eventId: string;
    eventTitle: string;
    assignedBy: string;
  }): Promise<void> {
    const { userId, eventId, eventTitle, assignedBy } = params;

    await this.createNotification({
      recipientId: userId,
      senderId: assignedBy,
      category: 'waitlist_assigned',
      title: '🎉 You\'re In!',
      body: `You've been assigned a spot for "${eventTitle}"`,
      data: {
        eventId,
        actionUrl: `/calendar/events/${eventId}`,
      },
      sendEmail: true,
    });
  }

  // ========================================
  // CHAT NOTIFICATIONS
  // ========================================

  /**
   * Team Chat Message - Notify team members
   */
  static async onTeamChatMessage(params: {
    teamId: string;
    clubId: string;
    teamName: string;
    senderId: string;
    senderName: string;
    message: string;
  }): Promise<void> {
    const { teamId, clubId, teamName, senderId, senderName, message } = params;

    try {
      // Get team members
      const clubDoc = await getDoc(doc(db, 'clubs', clubId));
      if (!clubDoc.exists()) return;

      const clubData = clubDoc.data();
      const team = clubData.teams?.find((t: any) => t.id === teamId);
      if (!team) return;

      const memberIds = await getTeamEventRecipients(clubId, teamId);

      // Send notification to each member (except sender)
      const notifications = memberIds
        .filter((memberId: string) => memberId !== senderId)
        .map((recipientId: string) =>
          sendTeamChatNotification(
            recipientId,
            senderId,
            senderName,
            message,
            teamId,
            teamName,
            clubId
          )
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Chat notifications sent to ${notifications.length} team members`);
    } catch (error) {
      console.error('❌ Error sending chat notifications:', error);
    }
  }

  /**
   * Chat message — notify all participants except the sender.
   * Covers one-to-one, team and club chats from the chats collection.
   */
  static async onChatMessage(params: {
    chatId: string;
    chatName: string;
    senderId: string;
    senderName: string;
    message: string;
    recipientIds: string[]; // already excludes the sender
  }): Promise<void> {
    const { chatId, chatName, senderId, senderName, message, recipientIds } = params;
    if (recipientIds.length === 0) return;

    const preview = message.length > 80 ? message.substring(0, 80) + '…' : message;

    const notifications = recipientIds.map(recipientId =>
      this.createNotification({
        recipientId,
        senderId,
        category: 'chat_message',
        title: `💬 ${chatName || senderName}`,
        body: `${senderName}: ${preview}`,
        data: {
          chatId,
          actionUrl: `/chat/${chatId}`,
        },
      })
    );

    await Promise.allSettled(notifications);
    console.log(`✅ Chat message notifications sent to ${notifications.length} recipients`);
  }

  /**
   * New chat opened — notify participants when a team/club/group chat is created.
   * One-to-one chats are not announced; the first message notification covers it.
   */
  static async onChatCreated(params: {
    chatId: string;
    chatName: string;
    chatType: string;
    createdBy: string;
    creatorName: string;
    recipientIds: string[];
  }): Promise<void> {
    const { chatId, chatName, chatType, createdBy, creatorName, recipientIds } = params;

    // Only announce team/club/group chats — one-to-one is silent until first message
    if (chatType === 'oneToOne') return;
    if (recipientIds.length === 0) return;

    const notifications = recipientIds
      .filter(id => id !== createdBy)
      .map(recipientId =>
        this.createNotification({
          recipientId,
          senderId: createdBy,
          category: 'team_update',
          title: `💬 New chat: ${chatName}`,
          body: `${creatorName} opened a new conversation`,
          data: {
            chatId,
            actionUrl: `/chat/${chatId}`,
          },
        })
      );

    await Promise.allSettled(notifications);
    console.log(`✅ Chat created notifications sent to ${notifications.length} members`);
  }

  static async onChatMention(_params: {
    chatId: string;
    senderId: string;
    mentionedUserId: string;
    message: string;
  }): Promise<void> {
    // TODO: Implement in future
    console.log('Chat mention notification (not implemented yet)');
  }

  static async onChatHighPriority(_params: {
    chatId: string;
    senderId: string;
    message: string;
    recipientIds: string[];
  }): Promise<void> {
    // TODO: Implement for pinned messages
    console.log('Chat high priority notification (not implemented yet)');
  }

  // ========================================
  // ORDER NOTIFICATIONS
  // ========================================

  /**
   * Order Created — notify all recipients listed on the order
   */
  static async onOrderCreated(params: {
    orderId: string;
    clubId: string;
    teamId?: string;
    title: string;
    createdBy: string;
    recipientIds: string[];
  }): Promise<void> {
    const { orderId, clubId, teamId, title, createdBy, recipientIds } = params;

    const notifications = recipientIds
      .filter((id) => id !== createdBy)
      .map((recipientId) =>
        this.createNotification({
          recipientId,
          senderId: createdBy,
          category: 'order_created',
          title: '📋 New Order',
          body: `"${title}" — please respond`,
          data: {
            orderId,
            clubId,
            teamId,
            actionUrl: `/orders/${orderId}`,
          },
          sendEmail: false,
        })
      );

    await Promise.allSettled(notifications);
    console.log(`✅ Order created notifications sent to ${notifications.length} recipients`);
  }
}

