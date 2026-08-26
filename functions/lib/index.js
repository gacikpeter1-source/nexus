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
 *  4. sendNominationNoResponseAlerts — Scheduled every 30 min (requires Blaze plan)
 *     Once a nomination's deadline passes, alerts staff about primary-list
 *     athletes still pending — once per entry, never blocks staff edits.
 *
 *  5. scrapeLeagueUrl                — Callable (on demand, triggered from the UI)
 *     Fetches a league schedule page server-side (avoids the browser CORS
 *     wall a direct client-side fetch hits) and parses it into games.
 *
 * Deploy:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeLeagueUrl = exports.sendNominationNoResponseAlerts = exports.sendOrderDeadlineReminders = exports.sendEventReminders = exports.sendPushOnNotificationCreated = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const cheerio = require("cheerio");
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
    // Deduplicate tokens — stale rotated tokens may still be present from older clients
    const fcmTokens = [...new Set((_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) !== null && _b !== void 0 ? _b : [])];
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
    // Remove stale / invalid tokens and enforce 5-token cap
    const MAX_TOKENS = 5;
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
    const cleaned = fcmTokens.filter((t) => !invalidTokens.includes(t)).slice(-MAX_TOKENS);
    if (cleaned.length !== fcmTokens.length) {
        await db.doc(`users/${recipientId}`).update({ fcmTokens: cleaned });
        firebase_functions_1.logger.log(`Token cleanup: ${fcmTokens.length} → ${cleaned.length} for user ${recipientId}`);
    }
});
// ─────────────────────────────────────────────────────────────
// 2. Event reminders — every 15 minutes  (requires Blaze plan)
// ─────────────────────────────────────────────────────────────
exports.sendEventReminders = (0, scheduler_1.onSchedule)('every 15 minutes', async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
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
                        const clubData = clubDoc.data();
                        const teams = (_e = clubData['teams']) !== null && _e !== void 0 ? _e : [];
                        const team = teams.find((t) => t['id'] === event['teamId']);
                        if (team) {
                            // membersData is an object { userId: data } — use Object.keys()
                            // members is a legacy string array — use it directly
                            const teamMemberIds = team['membersData']
                                ? Object.keys(team['membersData'])
                                : Array.isArray(team['members']) ? team['members'] : [];
                            memberIds = [...new Set([...memberIds, ...teamMemberIds])];
                        }
                        // Club owner and club-level trainers always receive reminders
                        if (clubData['ownerId'])
                            memberIds.push(String(clubData['ownerId']));
                        if (clubData['superTrainer'])
                            memberIds.push(String(clubData['superTrainer']));
                        ((_f = clubData['trainers']) !== null && _f !== void 0 ? _f : []).forEach((id) => memberIds.push(id));
                        memberIds = [...new Set(memberIds)]; // deduplicate
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
                            clubId: String((_g = event['clubId']) !== null && _g !== void 0 ? _g : ''),
                            teamId: String((_h = event['teamId']) !== null && _h !== void 0 ? _h : ''),
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
// Runs daily at 08:00 UTC (09:00/10:00 SK depending on DST)
exports.sendOrderDeadlineReminders = (0, scheduler_1.onSchedule)('0 8 * * *', async () => {
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
            // Only orders whose deadline falls in the next 24 h
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
            // Filter out members who already submitted a response
            const responsesSnap = await db
                .collection('clubs')
                .doc(clubDoc.id)
                .collection('orders')
                .doc(orderDoc.id)
                .collection('responses')
                .get();
            const respondedIds = new Set(responsesSnap.docs
                .map((d) => d.data()['userId'])
                .filter(Boolean));
            memberIds = memberIds.filter((uid) => !respondedIds.has(uid));
            if (memberIds.length === 0)
                continue; // everyone already responded
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
            firebase_functions_1.logger.log(`Order "${order['title']}": reminded ${memberIds.length} non-responders (${respondedIds.size} already done)`);
        }
    }
    firebase_functions_1.logger.log(`Order deadline reminders: ${notifCount} notifications created`);
});
// ─────────────────────────────────────────────────────────────
// 4. sendNominationNoResponseAlerts — Scheduled every 30 min (requires Blaze plan)
//    Once a nomination's deadline passes, alerts staff about any primary-list
//    athlete still 'pending' — once per entry (noResponseAlertSent guards repeats).
//    This never blocks trainer/assistant edits — the deadline is purely informational.
// ─────────────────────────────────────────────────────────────
exports.sendNominationNoResponseAlerts = (0, scheduler_1.onSchedule)('*/30 * * * *', async () => {
    var _a, _b;
    const now = new Date();
    const clubsSnap = await db.collection('clubs').get();
    let notifCount = 0;
    for (const clubDoc of clubsSnap.docs) {
        const clubData = clubDoc.data();
        const teams = (_a = clubData['teams']) !== null && _a !== void 0 ? _a : [];
        const nominationsSnap = await db.collection('clubs').doc(clubDoc.id).collection('nominations').get();
        for (const nomDoc of nominationsSnap.docs) {
            const nomination = nomDoc.data();
            if (nomination['cancelled'])
                continue;
            const deadline = nomination['deadline'].toDate
                ? nomination['deadline'].toDate()
                : new Date(nomination['deadline']);
            if (deadline > now)
                continue; // deadline hasn't passed yet
            const primary = nomination['primary'] || {};
            const pendingUnalerted = Object.entries(primary).filter(([, entry]) => entry.status === 'pending' && !entry.noResponseAlertSent);
            if (pendingUnalerted.length === 0)
                continue;
            // Staff to notify: team-level trainers/assistants + club owner + club-level trainers
            const team = teams.find((t) => t['id'] === nomination['teamId']);
            const staffIds = new Set();
            if (team) {
                const membersData = ((_b = team['membersData']) !== null && _b !== void 0 ? _b : {});
                Object.entries(membersData).forEach(([uid, data]) => {
                    if (data.role === 'trainer' || data.role === 'assistant')
                        staffIds.add(uid);
                });
            }
            if (clubData['ownerId'])
                staffIds.add(clubData['ownerId']);
            (clubData['trainers'] || []).forEach((id) => staffIds.add(id));
            const batch = db.batch();
            const updatedPrimary = Object.assign({}, primary);
            for (const [athleteId, entryRaw] of pendingUnalerted) {
                const entry = entryRaw;
                for (const staffId of staffIds) {
                    const notifRef = db.collection('notifications').doc();
                    batch.set(notifRef, {
                        recipientId: staffId,
                        senderId: 'system',
                        type: 'nomination_no_response',
                        title: '⏰ No response',
                        body: `${entry.displayName} hasn't responded to "${nomination['title']}" and the deadline has passed.`,
                        data: {
                            nominationId: nomDoc.id,
                            clubId: clubDoc.id,
                            actionUrl: `/clubs/${clubDoc.id}/nominations/${nomDoc.id}`,
                        },
                        read: false,
                        createdAt: admin.firestore.Timestamp.now(),
                    });
                    notifCount++;
                }
                updatedPrimary[athleteId] = Object.assign(Object.assign({}, entry), { noResponseAlertSent: true });
            }
            batch.update(nomDoc.ref, { primary: updatedPrimary, updatedAt: admin.firestore.Timestamp.now() });
            await batch.commit();
            firebase_functions_1.logger.log(`Nomination "${nomination['title']}": alerted staff about ${pendingUnalerted.length} non-responders`);
        }
    }
    firebase_functions_1.logger.log(`Nomination no-response alerts: ${notifCount} notifications created`);
});
/**
 * hlcana.sk pattern: the page's visible text runs round / home team / score /
 * guest team / date / time in sequence for each match. Ported 1:1 from the
 * former client-side parser (src/services/leagueScraper.ts) — same regexes.
 */
function parseHlcanaPattern(bodyText) {
    const games = [];
    const lines = bodyText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 3 && l !== 'Detail zápasu');
    for (let i = 0; i < lines.length - 5; i++) {
        const line = lines[i];
        if (line.match(/^\d+\.\s*kolo$/i)) {
            const round = line;
            const homeTeam = lines[i + 1];
            const separator = lines[i + 2];
            const guestTeam = lines[i + 3];
            const dateLine = lines[i + 4];
            const timeLine = lines[i + 5];
            const date = dateLine.replace(/\s*-\s*$/, '').trim();
            const time = timeLine.trim();
            if (date.match(/^\d{2}\.\d{2}\.\d{4}$/) && time.match(/^\d{2}:\d{2}$/)) {
                const cleanHomeTeam = homeTeam.length > 3 ? homeTeam.slice(0, -3).trim() : homeTeam;
                const cleanGuestTeam = guestTeam.length > 3 ? guestTeam.slice(0, -3).trim() : guestTeam;
                let result;
                const scoreMatch = separator.match(/^(\d+)\s*:\s*(\d+)$/);
                if (scoreMatch)
                    result = `${scoreMatch[1]}:${scoreMatch[2]}`;
                games.push({
                    externalId: `hlcana-${date}-${time}-${i}`.replace(/[\s:.]/g, '-'),
                    round,
                    homeTeam: cleanHomeTeam,
                    guestTeam: cleanGuestTeam,
                    date,
                    time,
                    result,
                    type: 'game',
                });
                i += 5;
            }
        }
    }
    return games;
}
/** Generic HTML-table parser — common league-site format. */
function parseTableFormat($) {
    const games = [];
    $('table').each((tableIndex, table) => {
        $(table)
            .find('tr')
            .each((rowIndex, row) => {
            const cells = $(row).find('td, th');
            if (cells.length < 3)
                return;
            const cellsText = cells.map((_, c) => $(c).text().trim()).get();
            let date = '';
            let time = '';
            let homeTeam = '';
            let guestTeam = '';
            let result;
            for (const text of cellsText) {
                if (text.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                    date = text;
                }
                else if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = text.split('-');
                    date = `${day}.${month}.${year}`;
                }
                if (text.match(/^\d{2}:\d{2}$/))
                    time = text;
                if (text.match(/^\d+\s*:\s*\d+$/))
                    result = text.replace(/\s/g, '');
                const vsMatch = text.match(/^(.+?)\s*(?:vs\.?|–|-)\s*(.+)$/i);
                if (vsMatch) {
                    homeTeam = vsMatch[1].trim();
                    guestTeam = vsMatch[2].trim();
                }
            }
            if (date && (homeTeam || guestTeam)) {
                games.push({
                    externalId: `table-${tableIndex}-${rowIndex}`,
                    homeTeam: homeTeam || 'Unknown',
                    guestTeam: guestTeam || 'Unknown',
                    date,
                    time: time || '00:00',
                    result,
                    type: 'game',
                });
            }
        });
    });
    return games;
}
/** Last-resort fallback: pair up any date/time text found on the page. */
function parseGenericFormat(bodyText) {
    const games = [];
    const dates = bodyText.match(/(\d{2}\.\d{2}\.\d{4})/g) || [];
    const times = bodyText.match(/(\d{2}:\d{2})/g) || [];
    const minLength = Math.min(dates.length, times.length);
    for (let i = 0; i < minLength; i++) {
        games.push({
            externalId: `generic-${i}`,
            homeTeam: 'Team 1',
            guestTeam: 'Team 2',
            date: dates[i],
            time: times[i],
            type: 'game',
        });
    }
    return games;
}
exports.scrapeLeagueUrl = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to scrape a league schedule.');
    }
    const url = (_a = request.data) === null || _a === void 0 ? void 0 : _a.url;
    if (!url || typeof url !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A url string is required.');
    }
    let html;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            throw new https_1.HttpsError('not-found', `The URL returned HTTP ${res.status}.`);
        }
        html = await res.text();
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        firebase_functions_1.logger.error('scrapeLeagueUrl: fetch failed', err);
        throw new https_1.HttpsError('unavailable', 'Could not reach that URL.');
    }
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    let games = parseHlcanaPattern(bodyText);
    if (games.length === 0)
        games = parseTableFormat($);
    if (games.length === 0)
        games = parseGenericFormat(bodyText);
    firebase_functions_1.logger.log(`scrapeLeagueUrl: found ${games.length} games at ${url}`);
    return { games };
});
//# sourceMappingURL=index.js.map