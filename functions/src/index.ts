/**
 * Nexus Firebase Cloud Functions
 *
 * Three functions:
 *  1. sendPushOnNotificationCreated  – Firestore trigger (works on free Spark plan)
 *     Fires whenever a document is written to the `notifications` collection.
 *     Reads the recipient's FCM tokens and delivers the push notification.
 *
 *  2. sendEventReminders             – Scheduled every 15 min (requires Blaze plan)
 *     Finds events whose reminders are due, creates notification documents
 *     (which triggers function 1 automatically).
 *
 *  3. sendOrderDeadlineReminders     – Scheduled daily (requires Blaze plan)
 *     Finds orders whose deadline falls within the next 24 h, notifies members.
 *
 * Deploy:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();
const fcm = admin.messaging();

// ─────────────────────────────────────────────────────────────
// 1. Push notification delivery (Spark plan OK)
// ─────────────────────────────────────────────────────────────

export const sendPushOnNotificationCreated = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    if (!notification) return null;

    const { recipientId, title, body, data, type } = notification;
    if (!recipientId || !title) return null;

    // Load recipient's FCM tokens
    const userDoc = await db.doc(`users/${recipientId}`).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data()!;
    const fcmTokens: string[] = userData.fcmTokens || [];
    if (fcmTokens.length === 0) {
      functions.logger.log(`No FCM tokens for user ${recipientId}`);
      return null;
    }

    // Build FCM messages — one per token (sendEach handles multi-device)
    const dataPayload: Record<string, string> = {
      notificationId: context.params.notificationId,
      type: type || 'general',
    };

    // FCM data values must be strings
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) dataPayload[k] = String(v);
      });
    }

    const messages: admin.messaging.Message[] = fcmTokens.map((token) => ({
      token,
      notification: { title: String(title), body: String(body || '') },
      data: dataPayload,
      webpush: {
        notification: {
          icon: '/apple-touch-icon.png',
          badge: '/favicon-96x96.png',
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          link: dataPayload.actionUrl || '/',
        },
      },
      apns: {
        payload: {
          aps: { badge: 1, sound: 'default' },
        },
      },
    }));

    const response = await fcm.sendEach(messages);
    functions.logger.log(
      `Push sent: ${response.successCount}/${messages.length} OK for user ${recipientId}`
    );

    // Remove tokens that are no longer valid
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(fcmTokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const cleaned = fcmTokens.filter((t) => !invalidTokens.includes(t));
      await db.doc(`users/${recipientId}`).update({ fcmTokens: cleaned });
      functions.logger.log(`Removed ${invalidTokens.length} stale tokens for user ${recipientId}`);
    }

    return null;
  });

// ─────────────────────────────────────────────────────────────
// 2. Event reminders — runs every 15 minutes (requires Blaze)
// ─────────────────────────────────────────────────────────────

export const sendEventReminders = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = new Date();
    // Look at events up to 7 days ahead
    const lookAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];
    const aheadStr = lookAhead.toISOString().split('T')[0];

    const eventsSnap = await db
      .collection('events')
      .where('date', '>=', todayStr)
      .where('date', '<=', aheadStr)
      .get();

    let remindersCreated = 0;

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data();
      const reminders: any[] = event.reminders || [];
      if (reminders.length === 0) continue;

      const eventDateTimeStr = `${event.date}T${event.startTime || '09:00'}:00`;
      const eventDateTime = new Date(eventDateTimeStr);

      let anyUpdated = false;
      const updatedReminders = [...reminders];

      for (let i = 0; i < updatedReminders.length; i++) {
        const reminder = updatedReminders[i];
        if (reminder.sent) continue;

        const reminderTime = new Date(
          eventDateTime.getTime() - reminder.minutesBefore * 60 * 1000
        );
        const diffMs = reminderTime.getTime() - now.getTime();

        // Fire if reminder is due within the ±15-min window
        if (diffMs >= -15 * 60 * 1000 && diffMs <= 15 * 60 * 1000) {
          // Collect recipients: confirmed RSVPs + all team members
          const confirmedIds = Object.entries(event.responses || {})
            .filter(([, r]: [string, any]) => r.response === 'confirmed')
            .map(([uid]) => uid);

          let memberIds = [...confirmedIds];

          if (event.teamId && event.clubId) {
            const clubDoc = await db.doc(`clubs/${event.clubId}`).get();
            if (clubDoc.exists) {
              const teams: any[] = clubDoc.data()!.teams || [];
              const team = teams.find((t: any) => t.id === event.teamId);
              if (team) {
                const teamMemberIds = Object.keys(team.membersData || team.members || {});
                memberIds = [...new Set([...memberIds, ...teamMemberIds])];
              }
            }
          }

          const timeStr =
            reminder.minutesBefore < 60
              ? `${reminder.minutesBefore} minutes`
              : reminder.minutesBefore < 1440
              ? `${Math.round(reminder.minutesBefore / 60)} hour${reminder.minutesBefore >= 120 ? 's' : ''}`
              : `${Math.round(reminder.minutesBefore / 1440)} day${reminder.minutesBefore >= 2880 ? 's' : ''}`;

          // Create a notification per recipient (function 1 delivers each as a push)
          const batch = db.batch();
          for (const userId of memberIds) {
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
              recipientId: userId,
              senderId: 'system',
              type: 'event_reminder',
              title: `⏰ ${event.title}`,
              body: `Starting in ${timeStr}`,
              data: {
                eventId: eventDoc.id,
                clubId: event.clubId || '',
                teamId: event.teamId || '',
                actionUrl: `/calendar/events/${eventDoc.id}`,
              },
              read: false,
              createdAt: admin.firestore.Timestamp.now(),
            });
          }
          await batch.commit();

          updatedReminders[i] = {
            ...reminder,
            sent: true,
            sentAt: admin.firestore.Timestamp.now(),
          };
          anyUpdated = true;
          remindersCreated += memberIds.length;
        }
      }

      if (anyUpdated) {
        await eventDoc.ref.update({ reminders: updatedReminders });
      }
    }

    functions.logger.log(`Event reminders: created ${remindersCreated} notifications`);
    return null;
  });

// ─────────────────────────────────────────────────────────────
// 3. Order deadline reminders — runs once a day (requires Blaze)
// ─────────────────────────────────────────────────────────────

export const sendOrderDeadlineReminders = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const clubsSnap = await db.collection('clubs').get();
    let notifCount = 0;

    for (const clubDoc of clubsSnap.docs) {
      const ordersSnap = await db
        .collection('clubs')
        .doc(clubDoc.id)
        .collection('orders')
        .where('status', '==', 'active')
        .get();

      for (const orderDoc of ordersSnap.docs) {
        const order = orderDoc.data();
        if (!order.deadline) continue;

        const deadline: Date = order.deadline.toDate
          ? order.deadline.toDate()
          : new Date(order.deadline);

        if (deadline <= now || deadline > in24h) continue;

        // Collect recipients
        let memberIds: string[] = [];
        const clubData = clubDoc.data();

        if (order.targetAudience === 'team' && order.teamId) {
          const team = (clubData.teams || []).find((t: any) => t.id === order.teamId);
          if (team) {
            memberIds = Object.keys(team.membersData || {});
          }
        } else {
          memberIds = clubData.members || [];
        }

        const deadlineStr = deadline.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const batch = db.batch();
        for (const userId of memberIds) {
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, {
            recipientId: userId,
            senderId: 'system',
            type: 'order_deadline',
            title: '⏰ Order Deadline Soon',
            body: `"${order.title}" — deadline ${deadlineStr}`,
            data: {
              orderId: orderDoc.id,
              clubId: clubDoc.id,
              actionUrl: `/orders/${orderDoc.id}`,
            },
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }
        await batch.commit();
        notifCount += memberIds.length;
      }
    }

    functions.logger.log(`Order deadline reminders: created ${notifCount} notifications`);
    return null;
  });
