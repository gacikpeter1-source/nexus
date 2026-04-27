/**
 * Centralized Notification Manager
 * Handles all notification triggers for events, join requests, chat, waitlist, etc.
 * Supports both in-app notifications and email notifications (future)
 */

import { collection, addDoc, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from '../../types';

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
  | 'club_announcement';

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
      
      if (!prefs) return false;

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

      // Team event - notify team members
      if (eventData.teamId && clubData.teams) {
        const team = clubData.teams.find((t: any) => t.id === eventData.teamId);
        if (team) {
          memberIds = Object.keys(team.members || {});
        }
      }
      // Club event - notify all club members
      else if (eventData.visibilityLevel === 'club') {
        // Get all users who are members of this club
        memberIds = clubData.members || [];
      }

      // Send notification to each member (except creator)
      const notifications = memberIds
        .filter(memberId => memberId !== createdBy)
        .map(recipientId =>
          this.createNotification({
            recipientId,
            senderId: createdBy,
            category: 'event_created',
            title: '📅 New Event Created',
            body: `"${eventData.title}" on ${eventData.date}${eventData.startTime ? ` at ${eventData.startTime}` : ''}`,
            data: {
              eventId,
              actionUrl: `/calendar/events/${eventId}`,
            },
            sendEmail: true,
          })
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event created notifications sent to ${notifications.length} members`);
    } catch (error) {
      console.error('❌ Error sending event created notifications:', error);
    }
  }

  /**
   * Event Modified - Notify all participants
   */
  static async onEventModified(params: {
    eventId: string;
    eventData: any;
    modifiedBy: string;
    changes: string; // Description of what changed
  }): Promise<void> {
    const { eventId, eventData, modifiedBy, changes } = params;

    try {
      // Get all users who RSVPed to this event
      const responses = eventData.responses || {};
      const participantIds = Object.keys(responses);

      // Send notification to each participant (except modifier)
      const notifications = participantIds
        .filter(participantId => participantId !== modifiedBy)
        .map(recipientId =>
          this.createNotification({
            recipientId,
            senderId: modifiedBy,
            category: 'event_modified',
            title: '✏️ Event Updated',
            body: `"${eventData.title}" has been updated: ${changes}`,
            data: {
              eventId,
              actionUrl: `/calendar/events/${eventId}`,
            },
            sendEmail: true,
          })
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event modified notifications sent to ${notifications.length} participants`);
    } catch (error) {
      console.error('❌ Error sending event modified notifications:', error);
    }
  }

  /**
   * Event Deleted - Notify all participants
   */
  static async onEventDeleted(params: {
    eventId: string;
    eventData: any;
    deletedBy: string;
  }): Promise<void> {
    const { eventData, deletedBy } = params;

    try {
      // Get all users who RSVPed to this event
      const responses = eventData.responses || {};
      const participantIds = Object.keys(responses);

      // Send notification to each participant (except deleter)
      const notifications = participantIds
        .filter(participantId => participantId !== deletedBy)
        .map(recipientId =>
          this.createNotification({
            recipientId,
            senderId: deletedBy,
            category: 'event_deleted',
            title: '🗑️ Event Cancelled',
            body: `"${eventData.title}" on ${eventData.date} has been cancelled`,
            data: {
              actionUrl: '/calendar',
            },
            sendEmail: true,
          })
        );

      await Promise.allSettled(notifications);
      console.log(`✅ Event deleted notifications sent to ${notifications.length} participants`);
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
      const trainerIds = [...(clubData.trainers || []), clubData.ownerId].filter(Boolean);

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
  // CHAT NOTIFICATIONS (Placeholder)
  // ========================================

  static async onChatMessage(_params: {
    chatId: string;
    senderId: string;
    message: string;
    recipientIds: string[];
  }): Promise<void> {
    // TODO: Implement in Phase 5
    console.log('Chat message notification (not implemented yet)');
  }

  static async onChatMention(_params: {
    chatId: string;
    senderId: string;
    mentionedUserId: string;
    message: string;
  }): Promise<void> {
    // TODO: Implement in Phase 5
    console.log('Chat mention notification (not implemented yet)');
  }

  static async onChatHighPriority(_params: {
    chatId: string;
    senderId: string;
    message: string;
    recipientIds: string[];
  }): Promise<void> {
    // TODO: Implement in Phase 5
    console.log('Chat high priority notification (not implemented yet)');
  }
}

