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
exports.sendTournamentCreatedEmail = exports.mirrorStandaloneTournamentPublicData = exports.mirrorTournamentPublicData = exports.deleteUserAccount = exports.scrapeLeagueUrl = exports.sendNominationNoResponseAlerts = exports.sendOrderDeadlineReminders = exports.sendEventReminders = exports.sendPushOnNotificationCreated = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const cheerio = require("cheerio");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
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
    // Fully data-only — no top-level `notification`, and no `webpush.notification`
    // either. Both act as a browser/OS-level display hint that the push service can
    // auto-render on its own, *in addition to* the service worker's onBackgroundMessage
    // handler calling showNotification() itself — two independent display paths for
    // the same message, which is exactly why users were seeing every push twice.
    // The service worker (and the foreground handler) are the sole source of display,
    // built entirely from this data payload.
    const messages = fcmTokens.map((token) => {
        var _a;
        return ({
            token,
            data: dataPayload,
            webpush: {
                fcmOptions: { link: (_a = dataPayload['actionUrl']) !== null && _a !== void 0 ? _a : '/' },
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
// Events store `date` (YYYY-MM-DD) and `startTime` (HH:MM) as plain strings — the
// wall-clock values the creator picked, with no timezone attached. This app's users
// are all in Slovakia, so that wall-clock time always means this zone.
const EVENT_TIMEZONE = 'Europe/Bratislava';
/**
 * Convert a wall-clock date+time in `timeZone` to the correct UTC instant.
 * Node has no built-in "parse in this named zone" — `new Date(\`${date}T${time}\`)`
 * (no offset suffix) parses as local time *to the runtime*, and Cloud Functions run
 * in UTC by default. That silently treated "15:30" (meant as 15:30 in Slovakia) as
 * 15:30 UTC, sending every event reminder 1-2 hours late (the CET/CEST offset)
 * instead of on time.
 */
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    // Ask what wall-clock time `timeZone` would show for that guessed instant, then
    // correct by however far off that reading is from the guess itself.
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(utcGuess).reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
    }, {});
    const readingAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offsetMs = readingAsUtc - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs);
}
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
        const eventDateTime = zonedTimeToUtc(event['date'], (_b = event['startTime']) !== null && _b !== void 0 ? _b : '09:00', EVENT_TIMEZONE);
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
                else if (event['clubId'] && event['visibilityLevel'] === 'club') {
                    // Club-wide event (no specific team) — remind every club member, matching
                    // the recipient set used when the event was first created.
                    const clubDoc = await db.doc(`clubs/${event['clubId']}`).get();
                    if (clubDoc.exists) {
                        const clubData = clubDoc.data();
                        memberIds = [...new Set([...memberIds, ...((_g = clubData['members']) !== null && _g !== void 0 ? _g : [])])];
                        if (clubData['ownerId'])
                            memberIds.push(String(clubData['ownerId']));
                        if (clubData['superTrainer'])
                            memberIds.push(String(clubData['superTrainer']));
                        ((_h = clubData['trainers']) !== null && _h !== void 0 ? _h : []).forEach((id) => memberIds.push(id));
                        memberIds = [...new Set(memberIds)];
                    }
                }
                else if (!event['clubId'] && !event['teamId'] && event['createdBy']) {
                    // Personal event — nobody else is invited, so remind the creator.
                    memberIds = [...new Set([...memberIds, String(event['createdBy'])])];
                }
                const timeLabel = minutesBefore < 60
                    ? `${minutesBefore} minutes`
                    : minutesBefore < 1440
                        ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}`
                        : `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? 's' : ''}`;
                // Body carries the event's actual clock time alongside the countdown —
                // the title only has the name, so without this the push gives no clue
                // *when* it starts, just how soon relative to now.
                const startTime = event['startTime'];
                const body = startTime
                    ? `${startTime} — starting in ${timeLabel}`
                    : `Starting in ${timeLabel}`;
                const batch = db.batch();
                for (const userId of memberIds) {
                    const notifRef = db.collection('notifications').doc();
                    batch.set(notifRef, {
                        recipientId: userId,
                        senderId: 'system',
                        type: 'event_reminder',
                        title: `⏰ ${event['title']}`,
                        body,
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
// ==================== Delete User Account ====================
/**
 * Permanently delete a user account (Firebase Auth + Firestore doc), with
 * cleanup of club/team membership references and parent/child links.
 *
 * Allowed callers:
 *  - The user themselves (self-delete)
 *  - An admin (any account, except deleting another admin)
 *  - A club owner/trainer/assistant, but only for a target user who belongs
 *    to one of their own clubs (checked via the target's clubIds)
 */
exports.deleteUserAccount = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const callerUid = request.auth.uid;
    const targetUserId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.userId;
    if (!targetUserId || typeof targetUserId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A userId string is required.');
    }
    const targetSnap = await db.collection('users').doc(targetUserId).get();
    if (!targetSnap.exists) {
        throw new https_1.HttpsError('not-found', 'User not found.');
    }
    const target = targetSnap.data();
    const isSelf = callerUid === targetUserId;
    let authorized = isSelf;
    if (!authorized) {
        const callerSnap = await db.collection('users').doc(callerUid).get();
        const caller = callerSnap.exists ? callerSnap.data() : null;
        if ((caller === null || caller === void 0 ? void 0 : caller.role) === 'admin') {
            authorized = true;
        }
        else {
            const targetClubIds = target.clubIds || [];
            for (const clubId of targetClubIds) {
                const clubSnap = await db.collection('clubs').doc(clubId).get();
                if (!clubSnap.exists)
                    continue;
                const club = clubSnap.data();
                if (club.ownerId === callerUid ||
                    (club.trainers || []).includes(callerUid) ||
                    (club.assistants || []).includes(callerUid)) {
                    authorized = true;
                    break;
                }
            }
        }
    }
    if (!authorized) {
        throw new https_1.HttpsError('permission-denied', 'Not allowed to delete this account.');
    }
    if (!isSelf && target.role === 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Cannot delete an admin account.');
    }
    // Remove from every club/team the user belongs to
    const clubIds = target.clubIds || [];
    for (const clubId of clubIds) {
        const clubRef = db.collection('clubs').doc(clubId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(clubRef);
                if (!snap.exists)
                    return;
                const club = snap.data();
                const updates = {};
                if ((club.members || []).includes(targetUserId)) {
                    updates.members = admin.firestore.FieldValue.arrayRemove(targetUserId);
                }
                if ((club.trainers || []).includes(targetUserId)) {
                    updates.trainers = admin.firestore.FieldValue.arrayRemove(targetUserId);
                }
                if ((club.assistants || []).includes(targetUserId)) {
                    updates.assistants = admin.firestore.FieldValue.arrayRemove(targetUserId);
                }
                let teamsChanged = false;
                const teams = (club.teams || []).map((team) => {
                    let changed = false;
                    const newTeam = Object.assign({}, team);
                    if (Array.isArray(team.members) && team.members.includes(targetUserId)) {
                        newTeam.members = team.members.filter((id) => id !== targetUserId);
                        changed = true;
                    }
                    if (team.membersData && team.membersData[targetUserId]) {
                        const md = Object.assign({}, team.membersData);
                        delete md[targetUserId];
                        newTeam.membersData = md;
                        changed = true;
                    }
                    if (Array.isArray(team.trainers) && team.trainers.includes(targetUserId)) {
                        newTeam.trainers = team.trainers.filter((id) => id !== targetUserId);
                        changed = true;
                    }
                    if (Array.isArray(team.assistants) && team.assistants.includes(targetUserId)) {
                        newTeam.assistants = team.assistants.filter((id) => id !== targetUserId);
                        changed = true;
                    }
                    if (changed)
                        teamsChanged = true;
                    return newTeam;
                });
                if (teamsChanged)
                    updates.teams = teams;
                if (Object.keys(updates).length > 0) {
                    tx.update(clubRef, updates);
                }
            });
        }
        catch (err) {
            firebase_functions_1.logger.error(`deleteUserAccount: cleanup failed for club ${clubId}`, err);
        }
    }
    // Parent being deleted — release their children (delete child if no parent remains)
    if (Array.isArray(target.childIds) && target.childIds.length > 0) {
        for (const childId of target.childIds) {
            const childRef = db.collection('users').doc(childId);
            const childSnap = await childRef.get();
            if (!childSnap.exists)
                continue;
            const child = childSnap.data();
            const remainingParents = (child.parentIds || []).filter((id) => id !== targetUserId);
            if (remainingParents.length === 0) {
                await childRef.delete().catch((err) => firebase_functions_1.logger.error(`deleteUserAccount: child delete failed for ${childId}`, err));
            }
            else {
                await childRef.update({ parentIds: remainingParents }).catch((err) => firebase_functions_1.logger.error(`deleteUserAccount: child update failed for ${childId}`, err));
            }
        }
    }
    // Child being deleted — detach from any remaining co-parents
    if (Array.isArray(target.parentIds) && target.parentIds.length > 0) {
        for (const parentId of target.parentIds) {
            await db.collection('users').doc(parentId)
                .update({ childIds: admin.firestore.FieldValue.arrayRemove(targetUserId) })
                .catch((err) => firebase_functions_1.logger.error(`deleteUserAccount: parent update failed for ${parentId}`, err));
        }
    }
    await db.collection('users').doc(targetUserId).delete();
    await admin.auth().deleteUser(targetUserId).catch((err) => {
        firebase_functions_1.logger.error('deleteUserAccount: auth delete failed', err);
    });
    firebase_functions_1.logger.log(`deleteUserAccount: ${targetUserId} deleted by ${callerUid}`);
    return { success: true };
});
// ─────────────────────────────────────────────────────────────
// 6. Public tournament mirror — powers the no-login TV/scoreboard page.
//    Mirrors ONLY title + bracket (team names, scores, schedule) from a
//    tournament-kind Nomination into tournamentPublic/{nominationId},
//    which Firestore rules make world-readable. Deliberately never copies
//    primary/backlog/allRecipientIds/createdBy — those hold athlete and
//    parent identities and must stay behind auth on the real Nomination
//    document, which itself is never made publicly readable.
// ─────────────────────────────────────────────────────────────
exports.mirrorTournamentPublicData = (0, firestore_1.onDocumentWritten)('clubs/{clubId}/nominations/{nominationId}', async (event) => {
    var _a, _b;
    const nominationId = event.params.nominationId;
    const publicRef = db.doc(`tournamentPublic/${nominationId}`);
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!after || !after.exists) {
        await publicRef.delete().catch(() => { });
        return;
    }
    const nomination = after.data();
    if (!nomination || nomination.kind !== 'tournament' || !nomination.bracket) {
        // Not a tournament, or no bracket set up yet — nothing safe to show publicly.
        await publicRef.delete().catch(() => { });
        return;
    }
    const publicData = {
        clubId: nomination.clubId,
        teamId: nomination.teamId,
        title: nomination.title,
        bracket: nomination.bracket,
        updatedAt: admin.firestore.Timestamp.now(),
    };
    if (nomination.favoriteTeamName) {
        publicData.favoriteTeamName = nomination.favoriteTeamName;
    }
    const firstGameLocation = Array.isArray(nomination.games) ? (_b = nomination.games[0]) === null || _b === void 0 ? void 0 : _b.location : undefined;
    if (firstGameLocation) {
        publicData.location = firstGameLocation;
    }
    await publicRef.set(publicData);
});
// ─────────────────────────────────────────────────────────────
// 7. Standalone (no-club) tournament mirror — same idea as function 6, but
//    the source is the top-level `tournaments` collection instead of a club
//    Nomination. Writes into the SAME tournamentPublic collection, keyed by
//    the same id, so the existing /tv/:id page needs no changes at all —
//    it doesn't know or care which kind of tournament it's showing.
// ─────────────────────────────────────────────────────────────
exports.mirrorStandaloneTournamentPublicData = (0, firestore_1.onDocumentWritten)('tournaments/{tournamentId}', async (event) => {
    var _a;
    const tournamentId = event.params.tournamentId;
    const publicRef = db.doc(`tournamentPublic/${tournamentId}`);
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!after || !after.exists) {
        await publicRef.delete().catch(() => { });
        return;
    }
    const tournament = after.data();
    if (!tournament || !tournament.bracket) {
        await publicRef.delete().catch(() => { });
        return;
    }
    const publicData = {
        title: tournament.title,
        bracket: tournament.bracket,
        updatedAt: admin.firestore.Timestamp.now(),
    };
    if (tournament.location) {
        publicData.location = tournament.location;
    }
    await publicRef.set(publicData);
});
// ─────────────────────────────────────────────────────────────
// 8. sendTournamentCreatedEmail — fires once when a standalone tournament is
//    created. Builds the public /tv/{id} link + a QR code for it and emails
//    it to the creator directly over Gmail SMTP via nodemailer.
//
//    Sends via a plain Gmail app-password login rather than the Firebase
//    "Trigger Email" extension — that extension's Cloud Function deploy
//    failed on this project ("Database '(default)' does not exist in
//    region 'us-central1'", a known quirk with nam5 multi-region Firestore
//    databases + that extension's 2nd-gen trigger validation) even though
//    this project's own Firestore triggers deploy and fire fine in
//    us-central1 against the same database. Sending directly here sidesteps
//    the extension entirely.
//
//    Credentials (GMAIL_USER / GMAIL_APP_PASSWORD) come from
//    functions/.env.nexus-7f8f7 — a project-specific, git-ignored env file
//    (never committed), loaded automatically by firebase-functions v2 at
//    deploy time. Rotate the Gmail app password there if it's ever revoked.
// ─────────────────────────────────────────────────────────────
// Team-slot label for the schedule export — at tournament-creation time no
// match has been played yet, so a groupStanding/matchWinner/matchLoser slot
// never has a real result to resolve to; this only needs the same
// placeholder text the app itself shows for an unplayed slot (see
// resolveTeamRef in src/utils/tournamentBracket.ts), not the full
// recursive resolution logic.
function describeTeamSlot(ref, groups) {
    var _a;
    if (!ref)
        return '';
    if (ref.type === 'manual')
        return ref.name || '';
    if (ref.override)
        return ref.override;
    if (ref.type === 'groupStanding') {
        const group = groups.find((g) => g.id === ref.group);
        return `${(group === null || group === void 0 ? void 0 : group.name) || ref.group || '?'}${(_a = ref.position) !== null && _a !== void 0 ? _a : ''}`;
    }
    return ref.type === 'matchWinner' ? 'Winner TBD' : 'Loser TBD';
}
function buildScheduleWorkbookBuffer(bracket) {
    const groups = (bracket === null || bracket === void 0 ? void 0 : bracket.groups) || [];
    const groupName = (id) => { var _a; return ((_a = groups.find((g) => g.id === id)) === null || _a === void 0 ? void 0 : _a.name) || ''; };
    const matches = [...((bracket === null || bracket === void 0 ? void 0 : bracket.matches) || [])].sort((a, b) => a.matchNumber - b.matchNumber);
    const rows = [
        ['#', 'Group', 'Label', 'Start Time', 'Surface', 'Home', 'Away', 'Score'],
        ...matches.map((m) => [
            m.matchNumber,
            groupName(m.groupId),
            m.label || '',
            m.startTime || '',
            m.surface || '',
            describeTeamSlot(m.home, groups),
            describeTeamSlot(m.away, groups),
            m.homeScore !== undefined && m.awayScore !== undefined ? `${m.homeScore} : ${m.awayScore}` : '',
        ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Schedule');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
function sanitizeFilename(name) {
    return name.trim().replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'tournament';
}
let cachedTransporter = null;
function getTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass)
        return null;
    if (!cachedTransporter) {
        cachedTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    }
    return cachedTransporter;
}
exports.sendTournamentCreatedEmail = (0, firestore_1.onDocumentCreated)('tournaments/{tournamentId}', async (event) => {
    var _a;
    const tournamentId = event.params.tournamentId;
    const tournament = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!tournament || !tournament.creatorEmail)
        return;
    const transporter = getTransporter();
    if (!transporter) {
        firebase_functions_1.logger.warn('sendTournamentCreatedEmail: GMAIL_USER/GMAIL_APP_PASSWORD not configured, skipping email');
        return;
    }
    const origin = typeof tournament.siteOrigin === 'string' && tournament.siteOrigin
        ? tournament.siteOrigin
        : null;
    if (!origin) {
        firebase_functions_1.logger.warn(`sendTournamentCreatedEmail: no siteOrigin on tournament ${tournamentId}, skipping email`);
        return;
    }
    const tvUrl = `${origin}/tv/${tournamentId}`;
    let qrDataUrl;
    try {
        qrDataUrl = await QRCode.toDataURL(tvUrl, { width: 300, margin: 1 });
    }
    catch (err) {
        firebase_functions_1.logger.error('sendTournamentCreatedEmail: QR generation failed', err);
        return;
    }
    const title = typeof tournament.title === 'string' ? tournament.title : 'Tournament';
    let scheduleBuffer = null;
    try {
        scheduleBuffer = buildScheduleWorkbookBuffer(tournament.bracket);
    }
    catch (err) {
        firebase_functions_1.logger.error('sendTournamentCreatedEmail: schedule workbook build failed', err);
    }
    try {
        await transporter.sendMail({
            from: `Nexus <${process.env.GMAIL_USER}>`,
            to: tournament.creatorEmail,
            subject: `${title} — your tournament is ready`,
            html: `
          <p>Your tournament "<strong>${title}</strong>" has been created.</p>
          <p>Public live scoreboard link (no login needed):<br>
             <a href="${tvUrl}">${tvUrl}</a></p>
          ${scheduleBuffer ? '<p>The full match schedule is attached as an Excel file.</p>' : ''}
          <p>Scan to open on a phone or tablet:</p>
          <p><img src="cid:qrcode" width="200" height="200" alt="QR code" /></p>
        `,
            attachments: [
                {
                    filename: 'qr-code.png',
                    content: qrDataUrl.split(',')[1],
                    encoding: 'base64',
                    cid: 'qrcode',
                },
                ...(scheduleBuffer ? [{
                        filename: `${sanitizeFilename(title)}-schedule.xlsx`,
                        content: scheduleBuffer,
                    }] : []),
            ],
        });
        firebase_functions_1.logger.log(`sendTournamentCreatedEmail: sent to ${tournament.creatorEmail} for tournament ${tournamentId}`);
    }
    catch (err) {
        firebase_functions_1.logger.error('sendTournamentCreatedEmail: send failed', err);
    }
});
//# sourceMappingURL=index.js.map