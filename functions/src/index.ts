/**
 * Nexus Firebase Cloud Functions — v2 API
 *
 *  1. sendPushOnNotificationCreated  — Firestore trigger (free Spark plan OK)
 *     Fires on every new document in `notifications/`.
 *     Reads the recipient's FCM tokens and delivers the push notification.
 *
 *  2. sendEventReminders             — Scheduled every 15 min (requires Blaze plan)
 *     Finds events whose reminders are due, creates notification documents
 *     which triggers function 1.
 *
 *  3. sendOrderDeadlineReminders     — Scheduled daily (requires Blaze plan)
 *     Finds orders whose deadline falls within the next 24 h and notifies members.
 *
 * Deploy:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();
const fcm = admin.messaging();

// ─────────────────────────────────────────────────────────────
// 1. Push notification delivery  (Spark plan OK)
// ─────────────────────────────────────────────────────────────

export const sendPushOnNotificationCreated = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notification = snap.data();
    if (!notification) return;

    const { recipientId, title, body, data, type } = notification;
    if (!recipientId || !title) return;

    // Load recipient FCM tokens
    const userDoc = await db.doc(`users/${recipientId}`).get();
    if (!userDoc.exists) return;

    // Deduplicate tokens — stale rotated tokens may still be present from older clients
    const fcmTokens: string[] = [...new Set<string>(userDoc.data()?.fcmTokens ?? [])];
    if (fcmTokens.length === 0) {
      logger.log(`No FCM tokens for user ${recipientId}`);
      return;
    }

    // FCM data values must all be strings
    // title + body go into data so the foreground handler can read them
    const dataPayload: Record<string, string> = {
      notificationId: event.params.notificationId,
      type: String(type ?? 'general'),
      title: String(title),
      body: String(body ?? ''),
    };
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null) dataPayload[k] = String(v);
      }
    }

    // Data-only approach: NO top-level `notification` field.
    // A top-level `notification` causes the browser to auto-display the notification
    // AND the service worker also displays it → duplicate notifications.
    // Instead we put display config only in webpush.notification so the service
    // worker has full control over display in background, and the foreground handler
    // reads title/body from the data payload.
    const messages: admin.messaging.Message[] = fcmTokens.map((token) => ({
      token,
      data: dataPayload,
      webpush: {
        notification: {
          title: String(title),
          body: String(body ?? ''),
          icon: '/apple-touch-icon.png',
          badge: '/favicon-96x96.png',
        },
        fcmOptions: { link: dataPayload['actionUrl'] ?? '/' },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
            alert: { title: String(title), body: String(body ?? '') },
          },
        },
      },
    }));

    const response = await fcm.sendEach(messages);
    logger.log(`Push: ${response.successCount}/${messages.length} OK → user ${recipientId}`);

    // Remove stale / invalid tokens
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
      logger.log(`Removed ${invalidTokens.length} stale tokens for user ${recipientId}`);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// 2. Event reminders — every 15 minutes  (requires Blaze plan)
// ─────────────────────────────────────────────────────────────

export const sendEventReminders = onSchedule('every 15 minutes', async () => {
  const now = new Date();
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
    const reminders: Array<Record<string, unknown>> = event['reminders'] ?? [];
    if (reminders.length === 0) continue;

    const eventDateTime = new Date(`${event['date']}T${event['startTime'] ?? '09:00'}:00`);
    let anyUpdated = false;
    const updatedReminders = [...reminders];

    for (let i = 0; i < updatedReminders.length; i++) {
      const reminder = updatedReminders[i];
      if (reminder['sent']) continue;

      const minutesBefore = Number(reminder['minutesBefore'] ?? 0);
      const reminderTime = new Date(eventDateTime.getTime() - minutesBefore * 60 * 1000);
      const diffMs = reminderTime.getTime() - now.getTime();

      if (diffMs >= -15 * 60 * 1000 && diffMs <= 15 * 60 * 1000) {
        // Collect recipients: confirmed RSVPs + all team members
        const responses = event['responses'] ?? {};
        const confirmedIds = Object.entries(responses)
          .filter(([, r]) => (r as Record<string, unknown>)['response'] === 'confirmed')
          .map(([uid]) => uid);

        let memberIds = [...confirmedIds];

        if (event['teamId'] && event['clubId']) {
          const clubDoc = await db.doc(`clubs/${event['clubId']}`).get();
          if (clubDoc.exists) {
            const clubData = clubDoc.data()!;
            const teams: Array<Record<string, unknown>> = clubData['teams'] ?? [];
            const team = teams.find((t) => t['id'] === event['teamId']);

            if (team) {
              // membersData is an object { userId: data } — use Object.keys()
              // members is a legacy string array — use it directly
              const teamMemberIds: string[] = team['membersData']
                ? Object.keys(team['membersData'] as Record<string, unknown>)
                : Array.isArray(team['members']) ? (team['members'] as string[]) : [];
              memberIds = [...new Set([...memberIds, ...teamMemberIds])];
            }

            // Club owner and club-level trainers always receive reminders
            if (clubData['ownerId']) memberIds.push(String(clubData['ownerId']));
            if (clubData['superTrainer']) memberIds.push(String(clubData['superTrainer']));
            (clubData['trainers'] as string[] ?? []).forEach((id: string) => memberIds.push(id));

            memberIds = [...new Set(memberIds)]; // deduplicate
          }
        }

        const timeLabel =
          minutesBefore < 60
            ? `${minutesBefore} minutes`
            : minutesBefore < 1440
            ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}`
            : `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? 's' : ''}`;

        const batch = db.batch();
        for (const userId of memberIds) {
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, {
            recipientId: userId,
            senderId: 'system',
            type: 'event_reminder',
            title: `⏰ ${event['title']}`,
            body: `Starting in ${timeLabel}`,
            data: {
              eventId: eventDoc.id,
              clubId: String(event['clubId'] ?? ''),
              teamId: String(event['teamId'] ?? ''),
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

  logger.log(`Event reminders: ${remindersCreated} notifications created`);
});

// ─────────────────────────────────────────────────────────────
// 3. Order deadline reminders — daily  (requires Blaze plan)
// ─────────────────────────────────────────────────────────────

// Runs daily at 08:00 UTC (09:00/10:00 SK depending on DST)
export const sendOrderDeadlineReminders = onSchedule('0 8 * * *', async () => {
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
      if (!order['deadline']) continue;

      const deadline: Date = order['deadline'].toDate
        ? order['deadline'].toDate()
        : new Date(order['deadline']);

      // Only orders whose deadline falls in the next 24 h
      if (deadline <= now || deadline > in24h) continue;

      const clubData = clubDoc.data();
      let memberIds: string[] = [];

      if (order['targetAudience'] === 'team' && order['teamId']) {
        const teams: Array<Record<string, unknown>> = clubData['teams'] ?? [];
        const team = teams.find((t) => t['id'] === order['teamId']);
        if (team) {
          memberIds = Object.keys((team['membersData'] ?? {}) as Record<string, unknown>);
        }
      } else {
        memberIds = clubData['members'] ?? [];
      }

      // Filter out members who already submitted a response
      const responsesSnap = await db
        .collection('clubs')
        .doc(clubDoc.id)
        .collection('orders')
        .doc(orderDoc.id)
        .collection('responses')
        .get();

      const respondedIds = new Set(
        responsesSnap.docs
          .map((d) => d.data()['userId'] as string)
          .filter(Boolean)
      );
      memberIds = memberIds.filter((uid) => !respondedIds.has(uid));

      if (memberIds.length === 0) continue; // everyone already responded

      const deadlineStr = deadline.toLocaleDateString('sk-SK', {
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
          title: '⏰ Termín objednávky sa blíži',
          body: `"${String(order['title'])}" — termín ${deadlineStr}`,
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
      logger.log(
        `Order "${order['title']}": reminded ${memberIds.length} non-responders (${respondedIds.size} already done)`
      );
    }
  }

  logger.log(`Order deadline reminders: ${notifCount} notifications created`);
});
