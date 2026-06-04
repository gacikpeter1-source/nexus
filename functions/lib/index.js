"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderDeadlineReminders = exports.sendEventReminders = exports.sendPushOnNotificationCreated = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
admin.initializeApp();
const db = admin.firestore();
const fcm = admin.messaging();
// ─────────────────────────────────────────────────────────────
// 1. Push notification delivery  (Spark plan OK)
// ─────────────────────────────────────────────────────────────
exports.sendPushOnNotificationCreated = (0, firestore_1.onDocumentCreated)('notifications/{notificationId}', async (event) => {
    var _a, _b;
    const snap = event.data;
    if (!snap)
        return;
    const notification = snap.data();
    if (!notification)
        return;
    const { recipientId, title, body, data, type } = notification;
    if (!recipientId || !title)
        return;
    // Load recipient FCM tokens
    const userDoc = await db.doc(`users/${recipientId}`).get();
    if (!userDoc.exists)
        return;
    const fcmTokens = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) !== null && _b !== void 0 ? _b : [];
    if (fcmTokens.length === 0) {
        firebase_functions_1.logger.log(`No FCM tokens for user ${recipientId}`);
        return;
    }
    // FCM data values must all be strings
    // title + body go into data so the foreground handler can read them
    const dataPayload = {
        notificationId: event.params.notificationId,
        type: String(type !== null && type !== void 0 ? type : 'general'),
        title: String(title),
        body: String(body !== null && body !== void 0 ? body : ''),
    };
    if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
            if (v !== undefined && v !== null)
                dataPayload[k] = String(v);
        }
    }
    // Data-only approach: NO top-level `notification` field.
    // A top-level `notification` causes the browser to auto-display the notification
    // AND the service worker also displays it → duplicate notifications.
    // Instead we put display config only in webpush.notification so the service
    // worker has full control over display in background, and the foreground handler
    // reads title/body from the data payload.
    const messages = fcmTokens.map((token) => {
        var _a;
        return ({
            token,
            data: dataPayload,
            webpush: {
                notification: {
                    title: String(title),
                    body: String(body !== null && body !== void 0 ? body : ''),
                    icon: '/apple-touch-icon.png',
                    badge: '/favicon-96x96.png',
                },
                fcmOptions: { link: (_a = dataPayload['actionUrl']) !== null && _a !== void 0 ? _a : '/' },
            },
            apns: {
                payload: {
                    aps: {
                        badge: 1,
                        sound: 'default',
                        alert: { title: String(title), body: String(body !== null && body !== void 0 ? body : '') },
                    },
                },
            },
        });
    });
    const response = await fcm.sendEach(messages);
    firebase_functions_1.logger.log(`Push: ${response.successCount}/${messages.length} OK → user ${recipientId}`);
    // Remove stale / invalid tokens
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
        var _a, _b;
        if (!resp.success) {
            const code = (_b = (_a = resp.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : '';
            if (code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token') {
                invalidTokens.push(fcmTokens[idx]);
            }
        }
    });
    if (invalidTokens.length > 0) {
        const cleaned = fcmTokens.filter((t) => !invalidTokens.includes(t));
        await db.doc(`users/${recipientId}`).update({ fcmTokens: cleaned });
        firebase_functions_1.logger.log(`Removed ${invalidTokens.length} stale tokens for user ${recipientId}`);
    }
});
// ─────────────────────────────────────────────────────────────
// 2. Event reminders — every 15 minutes  (requires Blaze plan)
// ─────────────────────────────────────────────────────────────
exports.sendEventReminders = (0, scheduler_1.onSchedule)('every 15 minutes', async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
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
        const reminders = (_a = event['reminders']) !== null && _a !== void 0 ? _a : [];
        if (reminders.length === 0)
            continue;
        const eventDateTime = new Date(`${event['date']}T${(_b = event['startTime']) !== null && _b !== void 0 ? _b : '09:00'}:00`);
        let anyUpdated = false;
        const updatedReminders = [...reminders];
        for (let i = 0; i < updatedReminders.length; i++) {
            const reminder = updatedReminders[i];
            if (reminder['sent'])
                continue;
            const minutesBefore = Number((_c = reminder['minutesBefore']) !== null && _c !== void 0 ? _c : 0);
            const reminderTime = new Date(eventDateTime.getTime() - minutesBefore * 60 * 1000);
            const diffMs = reminderTime.getTime() - now.getTime();
            if (diffMs >= -15 * 60 * 1000 && diffMs <= 15 * 60 * 1000) {
                // Collect recipients: confirmed RSVPs + all team members
                const responses = (_d = event['responses']) !== null && _d !== void 0 ? _d : {};
                const confirmedIds = Object.entries(responses)
                    .filter(([, r]) => r['response'] === 'confirmed')
                    .map(([uid]) => uid);
                let memberIds = [...confirmedIds];
                if (event['teamId'] && event['clubId']) {
                    const clubDoc = await db.doc(`clubs/${event['clubId']}`).get();
                    if (clubDoc.exists) {
                        const teams = (_f = (_e = clubDoc.data()) === null || _e === void 0 ? void 0 : _e['teams']) !== null && _f !== void 0 ? _f : [];
                        const team = teams.find((t) => t['id'] === event['teamId']);
                        if (team) {
                            const membersData = ((_h = (_g = team['membersData']) !== null && _g !== void 0 ? _g : team['members']) !== null && _h !== void 0 ? _h : {});
                            memberIds = [...new Set([...memberIds, ...Object.keys(membersData)])];
                        }
                    }
                }
                const timeLabel = minutesBefore < 60
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
                            clubId: String((_j = event['clubId']) !== null && _j !== void 0 ? _j : ''),
                            teamId: String((_k = event['teamId']) !== null && _k !== void 0 ? _k : ''),
                            actionUrl: `/calendar/events/${eventDoc.id}`,
                        },
                        read: false,
                        createdAt: admin.firestore.Timestamp.now(),
                    });
                }
                await batch.commit();
                updatedReminders[i] = Object.assign(Object.assign({}, reminder), { sent: true, sentAt: admin.firestore.Timestamp.now() });
                anyUpdated = true;
                remindersCreated += memberIds.length;
            }
        }
        if (anyUpdated) {
            await eventDoc.ref.update({ reminders: updatedReminders });
        }
    }
    firebase_functions_1.logger.log(`Event reminders: ${remindersCreated} notifications created`);
});
// ─────────────────────────────────────────────────────────────
// 3. Order deadline reminders — daily  (requires Blaze plan)
// ─────────────────────────────────────────────────────────────
exports.sendOrderDeadlineReminders = (0, scheduler_1.onSchedule)('every 24 hours', async () => {
    var _a, _b, _c;
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
            if (!order['deadline'])
                continue;
            const deadline = order['deadline'].toDate
                ? order['deadline'].toDate()
                : new Date(order['deadline']);
            if (deadline <= now || deadline > in24h)
                continue;
            const clubData = clubDoc.data();
            let memberIds = [];
            if (order['targetAudience'] === 'team' && order['teamId']) {
                const teams = (_a = clubData['teams']) !== null && _a !== void 0 ? _a : [];
                const team = teams.find((t) => t['id'] === order['teamId']);
                if (team) {
                    memberIds = Object.keys(((_b = team['membersData']) !== null && _b !== void 0 ? _b : {}));
                }
            }
            else {
                memberIds = (_c = clubData['members']) !== null && _c !== void 0 ? _c : [];
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
                    body: `"${String(order['title'])}" — deadline ${deadlineStr}`,
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
    firebase_functions_1.logger.log(`Order deadline reminders: ${notifCount} notifications created`);
});
//# sourceMappingURL=index.js.map