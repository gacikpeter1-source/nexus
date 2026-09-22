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
 *  5b. syncLeagueSchedules           — Scheduled every 4 h (requires Blaze plan)
 *     Re-scrapes every enabled club.leagueScraperConfigs URL so results and
 *     newly-added games show up without anyone opening the app — same sync
 *     logic as the manual "Sync Now" button. A new own-team game gets an
 *     auto-created calendar event with a 1-day-before reminder (via function
 *     2, sendEventReminders) rather than an instant notification — a whole
 *     season can get synced in one run, so notifying immediately for every
 *     game would blast the team about fixtures months out.
 *
 *  9. promoteFromEventWaitlist       — Firestore trigger (free Spark plan OK)
 *     Fires on every write to `events/{id}`. When a participantLimit event
 *     has an open slot, nobody currently invited, and a non-empty waitlist,
 *     invites the next person (5-minute response window) via push + email.
 *
 *  10. expireEventWaitlistInvites    — Scheduled every 1 min (requires Blaze plan)
 *     Requeues anyone whose waitlist invite window lapsed without an
 *     answer — clearing pendingInvite lets function 9 invite the next
 *     person on its next trigger.
 *
 *  11. checkTrainingTimerPhases      — Scheduled every 1 min (requires Blaze plan)
 *     Server-side backstop for the Training Timer tool: advances any
 *     'running' timer whose current phase has actually run out (in case no
 *     joined client's tab is open to do it) and flags the "N minutes left"
 *     warning once per phase — both writes are picked up by function 12.
 *
 *  12. onTrainingTimerPhaseChange    — Firestore trigger (free Spark plan OK)
 *     Fires on every write to `trainingTimers/{id}`. Pushes a notification
 *     to every staff member who joined the session when the phase actually
 *     advances, the session finishes, or the warning flag above is set —
 *     so trainers get alerted even if they've closed the timer screen.
 *
 *  13. sendUnverifiedEmailReminders  — Scheduled daily (requires Blaze plan)
 *     One-time push reminding a real (non-child) account still unverified a
 *     day after signup to check inbox/spam for the verification email.
 *
 *  14. sendRegistrationInviteEmail   — Firestore trigger (free Spark plan OK)
 *     Tournament Registration, Phase 2: emails a club not yet on Nexus an
 *     invite with a no-login response link, when a registrationEntries doc
 *     is created with an email but no clubId.
 *
 *  15. getRegistrationEntryPublic / respondToRegistrationEntryPublic — Callable
 *     (on demand, from the public /registration-response/:entryId page)
 *     The no-login response flow for that email invite — token-verified via
 *     the Admin SDK, so no Firestore rule needs to allow anonymous access.
 *
 *  16. sendTournamentRegistrationReminders — Scheduled daily (requires Blaze plan)
 *     Reminds every still-pending registration entry 1 day before its
 *     registration's deadline — in-app for a Nexus club, email otherwise.
 *
 *  17. finalizeStandaloneTournamentStats — Callable (organizer-triggered)
 *     Phase 4: copies a standalone tournament's completed, linked-team
 *     matches into teamGameResults so each linked club's own Stats tab can
 *     show them — see StandaloneTournamentDetail's "Finalize & sync stats".
 *
 *  18. sendInventoryReturnReminders — Scheduled daily (requires Blaze plan)
 *     Notifies a club's staff about any inventory item past its return date
 *     that isn't marked returned yet — once per item (reminderSent guards
 *     repeats; clearing an item's return-role field or editing it resets it).
 *
 *  5c. Boxscore scraping (part of syncLeagueSchedules, function 5b)
 *     Once a league game is marked played, fetches its per-game detail page
 *     (detailUrl, discovered alongside the schedule scrape), parses goals/
 *     assists/penalties, matches each player by jersey number then name
 *     against the team's roster, and stores it as a pending review
 *     (boxscoreStatus/boxscoreReview) on the game doc. Nothing is credited
 *     to a player card until a trainer reviews and approves it from the
 *     Stats tab — see approveLeagueBoxscore in src/services/firebase/
 *     leagueSchedule.ts, a plain client-side Firestore write.
 *
 * Deploy:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUrgentTeamAlert = exports.onTrainingTimerPhaseChange = exports.checkTrainingTimerPhases = exports.expireEventWaitlistInvites = exports.promoteFromEventWaitlist = exports.sendInventoryReturnReminders = exports.finalizeStandaloneTournamentStats = exports.sendTournamentRegistrationReminders = exports.respondToRegistrationEntryPublic = exports.getRegistrationEntryPublic = exports.sendRegistrationInviteEmail = exports.sendTournamentCreatedEmail = exports.mirrorStandaloneTournamentPublicData = exports.mirrorTournamentPublicData = exports.sendUnverifiedEmailReminders = exports.adminVerifyUserEmail = exports.deleteUserAccount = exports.syncLeagueSchedules = exports.syncLeagueBoxscoresNow = exports.scrapeLeagueUrl = exports.sendNominationNoResponseAlerts = exports.sendOrderDeadlineReminders = exports.sendEventReminders = exports.sendPushOnNotificationCreated = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const cheerio = require("cheerio");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
const twilioAlerts_1 = require("./twilioAlerts");
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _k, _l;
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
                            clubId: String((_k = event['clubId']) !== null && _k !== void 0 ? _k : ''),
                            teamId: String((_l = event['teamId']) !== null && _l !== void 0 ? _l : ''),
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
                timeZone: EVENT_TIMEZONE,
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
/**
 * A stable id for a scraped game, built from what actually identifies it
 * (date, time, both team names) rather than its position on the page.
 * Position-based ids (a line/row/array index) silently change if the source
 * page's surrounding content shifts even slightly between scrapes — an ad,
 * a banner, an extra blank line — which makes syncLeagueSchedules' dedup
 * (by externalId) miss the existing record and create a duplicate calendar
 * event for a game that hasn't actually changed.
 */
function stableGameId(prefix, date, time, homeTeam, guestTeam) {
    const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    return `${prefix}-${slug(date)}-${slug(time)}-${slug(homeTeam)}-${slug(guestTeam)}`;
}
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
                    externalId: stableGameId('hlcana', date, time, cleanHomeTeam, cleanGuestTeam),
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
                    externalId: stableGameId('table', date, time || '00:00', homeTeam || 'unknown', guestTeam || 'unknown'),
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
            externalId: stableGameId('generic', dates[i], times[i], 'team1', 'team2'),
            homeTeam: 'Team 1',
            guestTeam: 'Team 2',
            date: dates[i],
            time: times[i],
            type: 'game',
        });
    }
    return games;
}
/**
 * Every "/zapas/{id}"-style match-detail link on a schedule page, in
 * document order, de-duplicated. Confirmed live: the page repeats the
 * most recent round's links a second time in a "latest results" widget
 * above the full schedule table, so a raw count is inflated by however
 * many games that widget shows — deduping (keeping first occurrence order)
 * strips that widget's copies back out, leaving exactly one link per game
 * in the same order the schedule table — and the text parser above — lists
 * them, which is what makes index-zipping the two lists together safe.
 */
function extractDetailUrls($, baseUrl) {
    const urls = [];
    $('a[href*="/zapas/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href)
            return;
        try {
            urls.push(new URL(href, baseUrl).toString());
        }
        catch (_a) {
            // malformed href — skip it rather than throw
        }
    });
    return Array.from(new Set(urls));
}
/**
 * Fetches and parses a league schedule URL into games — shared by the
 * on-demand callable below and the scheduled auto-sync further down.
 */
async function scrapeGamesFromUrl(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    let games = parseHlcanaPattern(bodyText);
    if (games.length === 0)
        games = parseTableFormat($);
    if (games.length === 0)
        games = parseGenericFormat(bodyText);
    // Only attach detail URLs when we're confident they line up 1:1 with the
    // parsed games — a mismatched count (page structure changed, an ad link
    // also matched, etc.) means we can't trust the pairing, so we'd rather
    // scrape no boxscores this round than attach a wrong one.
    const detailUrls = extractDetailUrls($, url);
    if (detailUrls.length === games.length) {
        games = games.map((g, i) => (Object.assign(Object.assign({}, g), { detailUrl: detailUrls[i] })));
    }
    return games;
}
/** Whether a scraped game involves the given team (home or guest side). */
function isOwnTeamGame(game, teamIdentifier) {
    const id = teamIdentifier.toLowerCase();
    return game.homeTeam.toLowerCase().includes(id) || game.guestTeam.toLowerCase().includes(id);
}
/** Which side the given team plays on. */
function getHomeOrAway(game, teamIdentifier) {
    return game.homeTeam.toLowerCase().includes(teamIdentifier.toLowerCase()) ? 'home' : 'away';
}
/**
 * hlcana.sk match-detail page, DOM-based extraction — verified against a
 * real fetched page (functions logs / session notes have the raw HTML).
 * $('body').text() collapses all whitespace between adjacent inline tags
 * (e.g. a team-name span directly followed by a jersey-number span becomes
 * one run-on string with no separator), so this reads specific elements by
 * class instead of trying to parse concatenated plain text.
 *
 * Per event, the page renders BOTH a mobile (class contains "lg:hidden")
 * and a desktop (class contains "hidden lg:flex") copy of the same time/
 * type/team header — only the mobile one is read here, to avoid double
 * counting. The badges row (one div per scorer/assist/penalized player) is
 * NOT duplicated.
 */
function parseHlcanaBoxscore($) {
    const events = [];
    let periodLabel = '';
    const periodSel = 'div[class*="text-left"][class*="text-xl"]';
    const eventSel = 'div[class*="lg:px-8"][class*="lg:py-2"]';
    // Combined selector — css-select (cheerio's engine) returns matches in
    // document order, so walking this single list keeps each event under the
    // period header that actually precedes it on the page.
    $(`${periodSel}, ${eventSel}`).each((_, el) => {
        const $el = $(el);
        const cls = $el.attr('class') || '';
        if (cls.includes('text-xl')) {
            const m = $el.text().match(/(\d+\.\s*Tretina|Predĺženie|Nájazdy)/i);
            if (m)
                periodLabel = m[1];
            return;
        }
        const header = $el.find('div[class*="lg:hidden"][class*="justify-between"]').first();
        const headerParts = header.children().first().children();
        if (headerParts.length < 3)
            return;
        const time = headerParts.eq(0).text().trim();
        const typeDiv = headerParts.eq(1);
        const evType = typeDiv.contents().filter((_i, n) => n.type === 'text').text().trim();
        if (evType !== 'GÓL' && evType !== 'TREST')
            return;
        const teamFullName = headerParts.eq(2).find('span').first().text().trim();
        const badgeDivs = $el
            .find('div[class*="flex-row"][class*="justify-start"]')
            .first()
            .find('div[class*="font-semibold"][class*="gap-4"][class*="items-center"]');
        if (evType === 'GÓL') {
            const scorers = [];
            badgeDivs.each((_j, badgeEl) => {
                const $badge = $(badgeEl);
                const label = $badge.children().eq(0).text().trim();
                const valueText = $badge.children().eq(1).text().replace(/\s+/g, ' ').trim();
                const vm = valueText.match(/^#\s*(\d+)\s+(.+)$/);
                if (!vm)
                    return;
                scorers.push({ label, number: vm[1], name: vm[2].trim() });
            });
            const scorer = scorers.find((b) => b.label === 'G');
            if (scorer) {
                events.push({
                    kind: 'goal',
                    periodLabel,
                    time,
                    teamFullName,
                    scorer,
                    assists: scorers.filter((b) => b.label === 'A' || b.label === 'AA'),
                });
            }
            return;
        }
        // TREST (penalty) — value text is "#number Name - Infraction N min."
        const $badge = badgeDivs.first();
        const valueText = $badge.children().eq(1).text().replace(/\s+/g, ' ').trim();
        const full = valueText.match(/^#\s*(\d+)\s+(.+?)\s*-\s*(.+?)\s*(\d+)\s*min\.?\s*$/i);
        if (full) {
            events.push({
                kind: 'penalty',
                periodLabel,
                time,
                teamFullName,
                player: { number: full[1], name: full[2].trim() },
                infraction: full[3].trim(),
                minutes: parseInt(full[4], 10),
            });
            return;
        }
        // Fallback: at least get the player if the infraction/minutes shape doesn't match.
        const basic = valueText.match(/^#\s*(\d+)\s+(.+)$/);
        if (basic) {
            events.push({
                kind: 'penalty',
                periodLabel,
                time,
                teamFullName,
                player: { number: basic[1], name: basic[2].trim() },
                minutes: 2,
            });
        }
    });
    return events;
}
async function fetchBoxscore(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    return parseHlcanaBoxscore($);
}
function normalizeName(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
/**
 * Matches a scraped player reference to a Nexus athlete on the given roster.
 * Jersey number is preferred — it's unique per team and immune to spelling/
 * diacritics differences — falling back to a full-name match only when no
 * number match is found (or the roster has no jersey numbers recorded).
 */
function matchPlayer(ref, roster) {
    const num = parseInt(ref.number, 10);
    if (!isNaN(num)) {
        const byNumber = roster.filter((r) => r.jerseyNumber === num);
        if (byNumber.length === 1)
            return { athleteId: byNumber[0].athleteId, confidence: 'number' };
    }
    const scrapedName = normalizeName(ref.name);
    const byName = roster.filter((r) => normalizeName(r.displayName) === scrapedName);
    if (byName.length === 1)
        return { athleteId: byName[0].athleteId, confidence: 'name' };
    return {};
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
    let games;
    try {
        games = await scrapeGamesFromUrl(url);
    }
    catch (err) {
        firebase_functions_1.logger.error('scrapeLeagueUrl: fetch failed', err);
        throw new https_1.HttpsError('unavailable', 'Could not reach that URL.');
    }
    firebase_functions_1.logger.log(`scrapeLeagueUrl: found ${games.length} games at ${url}`);
    return { games };
});
// ─────────────────────────────────────────────────────────────
// 5b. League schedule auto-sync — periodic (requires Blaze plan)
// ─────────────────────────────────────────────────────────────
/**
 * Creates the calendar event for one of this team's own games, links it back
 * via eventId on the given leagueSchedule doc, and gives it a 1-day-before
 * reminder (sendEventReminders handles it from there) instead of an instant
 * notification — see syncLeagueSchedules' doc comment for why. Shared by
 * both the "brand new game" and "existing game missing its event" paths.
 * Returns true if an event was actually created.
 */
async function createLeagueGameEvent(gameRef, scrapedGame, isoDate, clubId, teamId, teamIdentifier) {
    const homeOrAway = getHomeOrAway(scrapedGame, teamIdentifier);
    const opponent = homeOrAway === 'home' ? scrapedGame.guestTeam : scrapedGame.homeTeam;
    const eventRef = db.collection('events').doc();
    await eventRef.set(Object.assign(Object.assign({ id: eventRef.id, title: `${scrapedGame.homeTeam} - ${scrapedGame.guestTeam}`, type: 'leagueGame', category: 'leagueGame', visibilityLevel: 'team', clubId,
        teamId, date: isoDate, startTime: scrapedGame.time, duration: 60, homeOrAway,
        opponent, homeTeam: scrapedGame.homeTeam, guestTeam: scrapedGame.guestTeam }, (scrapedGame.location !== undefined ? { location: scrapedGame.location } : {})), { createdBy: 'system', confirmedCount: 0, responses: {}, 
        // No instant "event created" notification for this one (see below) — a
        // whole season can get auto-synced in one run, covering fixtures months
        // out. This reminder is what actually notifies the team, timed to the
        // real game day via sendEventReminders rather than blasting on import.
        reminders: [{ id: crypto.randomUUID(), minutesBefore: 1440 }], createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() }));
    await gameRef.update({ eventId: eventRef.id });
    return true;
}
/**
 * Fetches this league game's boxscore, matches each goal/assist/penalty
 * against the team's roster (player card jersey numbers first, display name
 * as fallback), and stores the result as a pending review on the game doc —
 * never auto-credited. A trainer reviews and approves it from the Stats tab
 * before anything lands on a player card. Only ever runs once per game (no
 * existing boxscoreStatus) — a manual re-scrape isn't wired up yet.
 */
async function maybeGenerateBoxscoreReview(gameRef, clubId, teamId, teamIdentifier, scrapedGame) {
    var _a;
    if (!scrapedGame.detailUrl)
        return false;
    let rawEvents;
    try {
        rawEvents = await fetchBoxscore(scrapedGame.detailUrl);
    }
    catch (err) {
        firebase_functions_1.logger.error(`maybeGenerateBoxscoreReview: fetch failed for ${scrapedGame.detailUrl}`, err);
        return false;
    }
    if (rawEvents.length === 0)
        return false;
    // Only this team's own events matter for its player cards.
    const ownEvents = rawEvents.filter((e) => e.teamFullName.toLowerCase().includes(teamIdentifier.toLowerCase()));
    if (ownEvents.length === 0)
        return false;
    // Roster to match scraped names/numbers against: player cards (jersey
    // numbers) plus each athlete's display name.
    const cardsSnap = await db
        .collection('playerCards')
        .where('clubId', '==', clubId)
        .where('teamId', '==', teamId)
        .get();
    const roster = [];
    for (const cardDoc of cardsSnap.docs) {
        const card = cardDoc.data();
        const athleteId = card['athleteId'];
        if (!athleteId)
            continue;
        const userSnap = await db.collection('users').doc(athleteId).get();
        const displayName = ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a['displayName']) || '';
        if (!displayName)
            continue;
        roster.push({ athleteId, jerseyNumber: card['jerseyNumber'], displayName });
    }
    const goals = [];
    const penalties = [];
    for (const ev of ownEvents) {
        if (ev.kind === 'goal' && ev.scorer) {
            const scorerMatch = matchPlayer(ev.scorer, roster);
            goals.push({
                id: crypto.randomUUID(),
                periodLabel: ev.periodLabel,
                time: ev.time,
                scorer: Object.assign(Object.assign({ number: ev.scorer.number, name: ev.scorer.name }, (scorerMatch.athleteId ? { suggestedAthleteId: scorerMatch.athleteId } : {})), (scorerMatch.confidence ? { suggestedConfidence: scorerMatch.confidence } : {})),
                assists: (ev.assists || []).map((a) => {
                    const m = matchPlayer(a, roster);
                    return Object.assign(Object.assign({ number: a.number, name: a.name }, (m.athleteId ? { suggestedAthleteId: m.athleteId } : {})), (m.confidence ? { suggestedConfidence: m.confidence } : {}));
                }),
            });
        }
        else if (ev.kind === 'penalty' && ev.player) {
            const m = matchPlayer(ev.player, roster);
            penalties.push(Object.assign({ id: crypto.randomUUID(), periodLabel: ev.periodLabel, time: ev.time, player: Object.assign(Object.assign({ number: ev.player.number, name: ev.player.name }, (m.athleteId ? { suggestedAthleteId: m.athleteId } : {})), (m.confidence ? { suggestedConfidence: m.confidence } : {})), minutes: ev.minutes || 2 }, (ev.infraction ? { infraction: ev.infraction } : {})));
        }
    }
    if (goals.length === 0 && penalties.length === 0)
        return false;
    await gameRef.update({
        boxscoreStatus: 'pending_review',
        boxscoreReview: {
            scrapedAt: new Date().toISOString(),
            goals,
            penalties,
        },
    });
    return true;
}
/**
 * On-demand version of the boxscore step inside syncLeagueSchedules, for a
 * single team — lets a trainer trigger it from the League Schedule page's
 * "Sync Game Stats Now" button instead of waiting for the next 4-hour cron
 * run. Only processes played, own-team games that already have a detailUrl
 * and no boxscoreStatus yet (never re-scrapes one that's already pending
 * review, approved, or dismissed).
 */
async function runBoxscoreSyncForTeam(clubId, teamId) {
    var _a;
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists)
        throw new https_1.HttpsError('not-found', 'Club not found.');
    const club = clubSnap.data();
    const config = (_a = club['leagueScraperConfigs']) === null || _a === void 0 ? void 0 : _a[teamId];
    const teamIdentifier = config === null || config === void 0 ? void 0 : config['teamIdentifier'];
    const scraperUrl = config === null || config === void 0 ? void 0 : config['url'];
    if (!teamIdentifier || !scraperUrl) {
        throw new https_1.HttpsError('failed-precondition', 'No league scraper configured for this team.');
    }
    const gamesSnap = await db
        .collection('leagueSchedule')
        .where('clubId', '==', clubId)
        .where('teamId', '==', teamId)
        .where('isOwnTeam', '==', true)
        .where('status', '==', 'played')
        .get();
    // Existing games may predate detailUrl capture (only backfilled by the
    // 4-hour cron so far) — re-scrape the schedule now so this on-demand run
    // doesn't have to wait for that next cycle to pick up the missing link.
    const detailUrlByScrapedId = new Map();
    try {
        const freshGames = await scrapeGamesFromUrl(scraperUrl);
        for (const g of freshGames) {
            if (g.detailUrl)
                detailUrlByScrapedId.set(g.externalId, g.detailUrl);
        }
    }
    catch (err) {
        firebase_functions_1.logger.error(`runBoxscoreSyncForTeam: re-scrape failed for ${scraperUrl}`, err);
    }
    let reviewsGenerated = 0;
    let processed = 0;
    for (const gameDoc of gamesSnap.docs) {
        const data = gameDoc.data();
        if (data['boxscoreStatus'])
            continue;
        let detailUrl = data['detailUrl'];
        if (!detailUrl && data['scrapedId']) {
            detailUrl = detailUrlByScrapedId.get(data['scrapedId']);
            if (detailUrl)
                await gameDoc.ref.update({ detailUrl });
        }
        if (!detailUrl)
            continue;
        processed++;
        const scrapedGame = {
            externalId: data['scrapedId'] || gameDoc.id,
            homeTeam: data['homeTeam'],
            guestTeam: data['guestTeam'],
            date: data['date'],
            time: data['time'],
            type: 'game',
            detailUrl,
        };
        const generated = await maybeGenerateBoxscoreReview(gameDoc.ref, clubId, teamId, teamIdentifier, scrapedGame);
        if (generated)
            reviewsGenerated++;
    }
    firebase_functions_1.logger.log(`runBoxscoreSyncForTeam: club ${clubId} team ${teamId} — ${processed} checked, ${reviewsGenerated} reviews generated`);
    return { processed, reviewsGenerated };
}
exports.syncLeagueBoxscoresNow = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const clubId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.clubId;
    const teamId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.teamId;
    if (!clubId || !teamId || typeof clubId !== 'string' || typeof teamId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'clubId and teamId are required.');
    }
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists)
        throw new https_1.HttpsError('not-found', 'Club not found.');
    const club = clubSnap.data();
    const callerUid = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const callerRole = callerSnap.exists ? (_c = callerSnap.data()) === null || _c === void 0 ? void 0 : _c['role'] : undefined;
    const authorized = callerRole === 'admin' ||
        club['ownerId'] === callerUid ||
        ((_d = club['trainers']) !== null && _d !== void 0 ? _d : []).includes(callerUid) ||
        ((_e = club['assistants']) !== null && _e !== void 0 ? _e : []).includes(callerUid);
    if (!authorized) {
        throw new https_1.HttpsError('permission-denied', 'Only club staff can sync game stats.');
    }
    return runBoxscoreSyncForTeam(clubId, teamId);
});
/**
 * Re-scrapes every enabled league scraper config (club.leagueScraperConfigs)
 * so results/status stay current without anyone having to open the app and
 * tap "Sync Now" — mirrors src/services/firebase/leagueSchedule.ts's
 * syncScrapedGames, just with the Admin SDK instead of the client SDK.
 * Every 4 hours is a compromise between catching same-day results promptly
 * and not hammering third-party league sites.
 */
exports.syncLeagueSchedules = (0, scheduler_1.onSchedule)('0 */4 * * *', async () => {
    const clubsSnap = await db.collection('clubs').get();
    let gamesCreated = 0;
    let resultsUpdated = 0;
    let eventsCreated = 0;
    for (const clubDoc of clubsSnap.docs) {
        const clubId = clubDoc.id;
        const configs = clubDoc.data()['leagueScraperConfigs'];
        if (!configs)
            continue;
        for (const [teamId, config] of Object.entries(configs)) {
            if (!(config === null || config === void 0 ? void 0 : config.enabled) || !config.url || !config.teamIdentifier)
                continue;
            const teamIdentifier = config.teamIdentifier;
            try {
                const scrapedGames = await scrapeGamesFromUrl(config.url);
                for (const scrapedGame of scrapedGames) {
                    const [day, month, year] = scrapedGame.date.split('.');
                    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    let homeScore;
                    let guestScore;
                    if (scrapedGame.result) {
                        const [h, g] = scrapedGame.result.split(':').map((s) => parseInt(s.trim(), 10));
                        homeScore = h;
                        guestScore = g;
                    }
                    // new Date(isoDate) parses a date-only string as UTC midnight — for a
                    // Slovak game that's ~1-2 AM local on the game's own date, so the old
                    // check flipped to 'played' hours before the game actually happened,
                    // hours early enough to trigger a boxscore scrape against a page with
                    // no data yet. Compare against end-of-day in Slovak time instead —
                    // the same zonedTimeToUtc helper sendEventReminders already uses.
                    const status = new Date() > zonedTimeToUtc(isoDate, '23:59', EVENT_TIMEZONE) ? 'played' : 'upcoming';
                    const isOwnTeam = isOwnTeamGame(scrapedGame, teamIdentifier);
                    const existingSnap = await db
                        .collection('leagueSchedule')
                        .where('clubId', '==', clubId)
                        .where('scrapedId', '==', scrapedGame.externalId)
                        .limit(1)
                        .get();
                    if (!existingSnap.empty) {
                        const existingDoc = existingSnap.docs[0];
                        const prevResult = existingDoc.data()['result'];
                        const hasEvent = !!existingDoc.data()['eventId'];
                        const hasBoxscore = !!existingDoc.data()['boxscoreStatus'];
                        await existingDoc.ref.update(Object.assign(Object.assign(Object.assign(Object.assign({ status,
                            isOwnTeam, lastSyncedAt: new Date().toISOString(), updatedAt: admin.firestore.Timestamp.now() }, (scrapedGame.result !== undefined ? { result: scrapedGame.result } : {})), (homeScore !== undefined ? { homeScore } : {})), (guestScore !== undefined ? { guestScore } : {})), (scrapedGame.detailUrl !== undefined ? { detailUrl: scrapedGame.detailUrl } : {})));
                        if (scrapedGame.result && scrapedGame.result !== prevResult)
                            resultsUpdated++;
                        // Backfill: this game predates the auto-create-event feature (or
                        // a previous attempt failed) — give it a calendar event now.
                        if (isOwnTeam && !hasEvent) {
                            const created = await createLeagueGameEvent(existingDoc.ref, scrapedGame, isoDate, clubId, teamId, teamIdentifier);
                            if (created)
                                eventsCreated++;
                        }
                        if (isOwnTeam && status === 'played' && !hasBoxscore) {
                            await maybeGenerateBoxscoreReview(existingDoc.ref, clubId, teamId, teamIdentifier, scrapedGame);
                        }
                        continue;
                    }
                    const newGameRef = db.collection('leagueSchedule').doc();
                    await newGameRef.set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ id: newGameRef.id, clubId,
                        teamId,
                        isOwnTeam, homeTeam: scrapedGame.homeTeam, guestTeam: scrapedGame.guestTeam, date: isoDate, time: scrapedGame.time, status, source: 'scraped', scrapedId: scrapedGame.externalId, lastSyncedAt: new Date().toISOString(), createdBy: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, (scrapedGame.round !== undefined ? { round: scrapedGame.round } : {})), (scrapedGame.location !== undefined ? { location: scrapedGame.location } : {})), (scrapedGame.result !== undefined ? { result: scrapedGame.result } : {})), (homeScore !== undefined ? { homeScore } : {})), (guestScore !== undefined ? { guestScore } : {})), (scrapedGame.detailUrl !== undefined ? { detailUrl: scrapedGame.detailUrl } : {})));
                    gamesCreated++;
                    // Auto-create the calendar event for this team's own games only —
                    // same as a manual sync from the app (see leagueSchedule.ts).
                    if (isOwnTeam) {
                        const created = await createLeagueGameEvent(newGameRef, scrapedGame, isoDate, clubId, teamId, teamIdentifier);
                        if (created)
                            eventsCreated++;
                    }
                    if (isOwnTeam && status === 'played') {
                        await maybeGenerateBoxscoreReview(newGameRef, clubId, teamId, teamIdentifier, scrapedGame);
                    }
                }
                await clubDoc.ref.update({
                    [`leagueScraperConfigs.${teamId}.lastScrapedAt`]: new Date().toISOString(),
                });
            }
            catch (err) {
                firebase_functions_1.logger.error(`syncLeagueSchedules: failed for club ${clubId} team ${teamId}`, err);
            }
        }
    }
    firebase_functions_1.logger.log(`League auto-sync: ${gamesCreated} games created, ${resultsUpdated} results updated, ${eventsCreated} events created`);
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
/**
 * Admin-only: manually mark a user's email as verified — for a real member
 * who never received/found the verification email (spam filtering, a typo'd
 * inbox they can't access) and is stuck on the /verify-email gate. Firestore's
 * users/{id}.emailVerified is only a mirror the app reads for display (e.g.
 * the Admin Panel's Unverified Users list) — the actual gate in
 * ProtectedRoute checks the live Firebase Auth record, so that's the one
 * that has to change here for the fix to actually unblock the user.
 */
exports.adminVerifyUserEmail = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = callerSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    }
    const targetUserId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.userId;
    if (!targetUserId || typeof targetUserId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A userId string is required.');
    }
    await admin.auth().updateUser(targetUserId, { emailVerified: true });
    await db.collection('users').doc(targetUserId).update({
        emailVerified: true,
        updatedAt: admin.firestore.Timestamp.now(),
    });
    firebase_functions_1.logger.log(`adminVerifyUserEmail: ${targetUserId} verified by ${request.auth.uid}`);
    return { success: true };
});
/**
 * One-time push reminder for a real account (not a child/athlete profile —
 * see createChildAccount, which always leaves emailVerified: false with no
 * real Firebase Auth record to verify) that's still unverified a day after
 * signing up: check your inbox and spam folder for the verification email.
 * Sent at most once per account (verificationReminderSentAt gates it) so it
 * nudges without nagging — an admin can still manually verify a stuck user
 * from the Admin Panel regardless of whether this reminder went out.
 */
exports.sendUnverifiedEmailReminders = (0, scheduler_1.onSchedule)('0 9 * * *', async () => {
    const usersSnap = await db.collection('users').where('emailVerified', '==', false).get();
    const now = Date.now();
    const batch = db.batch();
    let sent = 0;
    for (const userDoc of usersSnap.docs) {
        const u = userDoc.data();
        if (u['managedByParentId'])
            continue; // child/athlete profile, not a real account
        if (u['verificationReminderSentAt'])
            continue; // already reminded once
        const createdAtRaw = u['createdAt'];
        const createdAtDate = (createdAtRaw === null || createdAtRaw === void 0 ? void 0 : createdAtRaw.toDate) ? createdAtRaw.toDate() : new Date(createdAtRaw);
        if (isNaN(createdAtDate.getTime()) || now - createdAtDate.getTime() < 24 * 60 * 60 * 1000)
            continue;
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
            recipientId: userDoc.id,
            senderId: 'system',
            type: 'verify_email_reminder',
            title: '📧 Confirm your email',
            body: 'Check your inbox (and spam/junk folder) for the verification email from Nexus, then tap the link to finish signing up.',
            data: { actionUrl: '/verify-email' },
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
        });
        batch.update(userDoc.ref, { verificationReminderSentAt: admin.firestore.Timestamp.now() });
        sent++;
    }
    if (sent > 0)
        await batch.commit();
    firebase_functions_1.logger.log(`Unverified email reminders: ${sent} sent`);
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
/**
 * True if `after` is an out-of-order (stale) trigger event for a mirror
 * that already reflects a newer write — compares each event's own
 * `updateTime` (Firestore's authoritative record of when that document
 * version was written) against the `_sourceUpdateTime` the mirror last
 * stored. Firestore's onDocumentWritten trigger doesn't guarantee
 * in-order execution for rapid successive writes to the same document, so
 * without this a slow invocation for an older write can finish after a
 * fast one for a newer write and silently overwrite it with stale data.
 */
async function isStaleMirrorEvent(publicRef, after) {
    var _a;
    if (!(after === null || after === void 0 ? void 0 : after.updateTime))
        return false;
    const existing = await publicRef.get();
    const existingSourceUpdateTime = (_a = existing.data()) === null || _a === void 0 ? void 0 : _a._sourceUpdateTime;
    return !!existingSourceUpdateTime && existingSourceUpdateTime.toMillis() > after.updateTime.toMillis();
}
exports.mirrorTournamentPublicData = (0, firestore_1.onDocumentWritten)('clubs/{clubId}/nominations/{nominationId}', async (event) => {
    var _a, _b;
    const nominationId = event.params.nominationId;
    const publicRef = db.doc(`tournamentPublic/${nominationId}`);
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    // Firestore doesn't guarantee this trigger runs in write order for rapid
    // successive writes to the same document (e.g. staff assigning a rink,
    // then immediately marking a match live) — a slower invocation for an
    // OLDER write can finish after a faster one for a NEWER write and
    // clobber it with stale data. Guard with the source document's own
    // updateTime (its real write order) rather than an app-level timestamp,
    // which would only reflect when THIS function ran, not write order.
    if (await isStaleMirrorEvent(publicRef, after))
        return;
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
    const publicData = Object.assign({ clubId: nomination.clubId, teamId: nomination.teamId, title: nomination.title, bracket: nomination.bracket, updatedAt: admin.firestore.Timestamp.now() }, (after.updateTime ? { _sourceUpdateTime: after.updateTime } : {}));
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
    // See mirrorTournamentPublicData above for why this ordering guard exists.
    if (await isStaleMirrorEvent(publicRef, after))
        return;
    if (!after || !after.exists) {
        await publicRef.delete().catch(() => { });
        return;
    }
    const tournament = after.data();
    if (!tournament || (!tournament.bracket && !tournament.combatBracket)) {
        await publicRef.delete().catch(() => { });
        return;
    }
    const publicData = Object.assign({ title: tournament.title, updatedAt: admin.firestore.Timestamp.now() }, (after.updateTime ? { _sourceUpdateTime: after.updateTime } : {}));
    if (tournament.bracket)
        publicData.bracket = tournament.bracket;
    if (tournament.combatBracket)
        publicData.combatBracket = tournament.combatBracket;
    if (tournament.sport)
        publicData.sport = tournament.sport;
    if (tournament.location) {
        publicData.location = tournament.location;
    }
    if (tournament.backgroundImageUrl)
        publicData.backgroundImageUrl = tournament.backgroundImageUrl;
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
// The app's own domain, for building links inside emails these functions
// send. Prefers SITE_ORIGIN (a fixed, configured value — set once here
// rather than trusted per-record) over a document's stored siteOrigin,
// which was captured from window.location.origin at creation time and so
// would still point at a retired domain for any record created before one.
// See CreateStandaloneTournament/CreateEvent — those still write
// siteOrigin too, purely as a fallback for as long as SITE_ORIGIN is unset.
function getCanonicalOrigin(storedOrigin) {
    if (process.env.SITE_ORIGIN)
        return process.env.SITE_ORIGIN;
    return typeof storedOrigin === 'string' && storedOrigin ? storedOrigin : null;
}
exports.sendTournamentCreatedEmail = (0, firestore_1.onDocumentCreated)('tournaments/{tournamentId}', async (event) => {
    var _a;
    const tournamentId = event.params.tournamentId;
    const tournament = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!tournament)
        return;
    // teamContacts (team name -> email), collected in the wizard's review
    // step — invites go out alongside the creator's own summary email below.
    const teamContacts = tournament.teamContacts && typeof tournament.teamContacts === 'object' ? tournament.teamContacts : {};
    const teamEntries = Object.entries(teamContacts).filter(([, email]) => typeof email === 'string' && email);
    if (!tournament.creatorEmail && teamEntries.length === 0)
        return;
    const transporter = getTransporter();
    if (!transporter) {
        firebase_functions_1.logger.warn('sendTournamentCreatedEmail: GMAIL_USER/GMAIL_APP_PASSWORD not configured, skipping email');
        return;
    }
    const origin = getCanonicalOrigin(tournament.siteOrigin);
    if (!origin) {
        firebase_functions_1.logger.warn(`sendTournamentCreatedEmail: no siteOrigin on tournament ${tournamentId}, skipping email`);
        return;
    }
    // Mobile page (a normal scrolling page) is the link/QR emailed by
    // default — the TV board is a deliberate separate choice for casting to
    // an actual screen, so it's only mentioned as a secondary link below.
    const mobileUrl = `${origin}/tournament/${tournamentId}`;
    const tvUrl = `${origin}/tv/${tournamentId}`;
    // Short numeric code, much easier to type by hand into a smart TV than
    // the full tvUrl above — set in the same write as the rest of the
    // tournament doc (see createStandaloneTournament) so it's always
    // present by the time this trigger runs.
    const shortCode = typeof tournament.shortCode === 'string' ? tournament.shortCode : '';
    const tvShortUrl = shortCode ? `${origin}/t/${shortCode}` : '';
    const tvLinkHtml = tvShortUrl
        ? `<a href="${tvShortUrl}">${tvShortUrl}</a> (code: <strong>${shortCode}</strong> — easy to type by hand on a smart TV)`
        : `<a href="${tvUrl}">${tvUrl}</a>`;
    let qrDataUrl;
    try {
        qrDataUrl = await QRCode.toDataURL(mobileUrl, { width: 300, margin: 1 });
    }
    catch (err) {
        firebase_functions_1.logger.error('sendTournamentCreatedEmail: QR generation failed', err);
        return;
    }
    const title = typeof tournament.title === 'string' ? tournament.title : 'Tournament';
    const emailTag = typeof tournament.emailTag === 'string' ? tournament.emailTag.trim() : '';
    // Prefixed onto every subject below (creator's and each team's) so a tag
    // like "Christmas U9" is searchable in either inbox — not just the ones
    // it was specifically added for.
    const subjectPrefix = emailTag ? `[${emailTag}] ` : '';
    let scheduleBuffer = null;
    try {
        scheduleBuffer = buildScheduleWorkbookBuffer(tournament.bracket);
    }
    catch (err) {
        firebase_functions_1.logger.error('sendTournamentCreatedEmail: schedule workbook build failed', err);
    }
    const attachments = [
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
    ];
    if (tournament.creatorEmail) {
        try {
            await transporter.sendMail({
                from: `Nexus <${process.env.GMAIL_USER}>`,
                to: tournament.creatorEmail,
                subject: `${subjectPrefix}${title} — your tournament is ready`,
                html: `
            <p>Your tournament "<strong>${title}</strong>" has been created.</p>
            <p>Public live scoreboard link (no login needed):<br>
               <a href="${mobileUrl}">${mobileUrl}</a></p>
            <p>Casting to an actual TV or big screen? Use the board view instead:<br>
               ${tvLinkHtml}</p>
            ${scheduleBuffer ? '<p>The full match schedule is attached as an Excel file.</p>' : ''}
            <p>Scan to open on a phone or tablet:</p>
            <p><img src="cid:qrcode" width="200" height="200" alt="QR code" /></p>
          `,
                attachments,
            });
            firebase_functions_1.logger.log(`sendTournamentCreatedEmail: sent to ${tournament.creatorEmail} for tournament ${tournamentId}`);
        }
        catch (err) {
            firebase_functions_1.logger.error('sendTournamentCreatedEmail: send failed', err);
        }
    }
    // Each team gets its own email, addressed to only that one team — never
    // CC'd/BCC'd together, so no team sees another team's address.
    for (const [teamName, teamEmail] of teamEntries) {
        try {
            await transporter.sendMail({
                from: `Nexus <${process.env.GMAIL_USER}>`,
                to: teamEmail,
                subject: `${subjectPrefix}${title} — tournament invitation for ${teamName}`,
                html: `
            <p><strong>${teamName}</strong> has been entered into "<strong>${title}</strong>".</p>
            <p>Public live scoreboard & schedule (no login needed):<br>
               <a href="${mobileUrl}">${mobileUrl}</a></p>
            <p>Casting to an actual TV or big screen? Use the board view instead:<br>
               ${tvLinkHtml}</p>
            ${scheduleBuffer ? '<p>The full match schedule is attached as an Excel file.</p>' : ''}
            <p>Scan to open on a phone or tablet:</p>
            <p><img src="cid:qrcode" width="200" height="200" alt="QR code" /></p>
          `,
                attachments,
            });
            firebase_functions_1.logger.log(`sendTournamentCreatedEmail: team invite sent to ${teamEmail} (${teamName}) for tournament ${tournamentId}`);
        }
        catch (err) {
            firebase_functions_1.logger.error(`sendTournamentCreatedEmail: team invite failed for ${teamName}`, err);
        }
    }
});
// ─────────────────────────────────────────────────────────────
// 8b. Tournament Registration — Phase 2: email invites for clubs not yet on
//     Nexus, a no-login response page for them, and a deadline reminder.
//
//     A registrationEntries doc with no clubId but an email is exactly the
//     "invited a club that isn't on Nexus" case (see CreateTournamentRegistration
//     / TournamentRegistrationDetail's manual add-by-name-and-email path).
//     The response link deliberately lands on a real page with a real
//     button (src/pages/RegistrationResponse.tsx) rather than acting the
//     moment the link is opened — corporate/email security scanners
//     auto-prefetch links in inboxes, which would otherwise silently accept
//     or decline the invite before a human ever sees it.
// ─────────────────────────────────────────────────────────────
function registrationResponseUrl(origin, entryId, token) {
    return `${origin}/registration-response/${entryId}?token=${token}`;
}
exports.sendRegistrationInviteEmail = (0, firestore_1.onDocumentCreated)('registrationEntries/{entryId}', async (event) => {
    var _a;
    const entryId = event.params.entryId;
    const entry = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!entry)
        return;
    // Only for clubs not yet on Nexus — a real Nexus club gets an in-app
    // notification instead (NotificationManager.onTournamentRegistrationInvite).
    if (entry['clubId'] || !entry['email'])
        return;
    const transporter = getTransporter();
    if (!transporter) {
        firebase_functions_1.logger.warn('sendRegistrationInviteEmail: GMAIL_USER/GMAIL_APP_PASSWORD not configured, skipping email');
        return;
    }
    const registrationId = entry['registrationId'];
    const registrationSnap = await db.collection('tournamentRegistrations').doc(registrationId).get();
    const registration = registrationSnap.data();
    if (!registration)
        return;
    const origin = getCanonicalOrigin(registration['siteOrigin']);
    if (!origin) {
        firebase_functions_1.logger.warn(`sendRegistrationInviteEmail: no siteOrigin on registration ${registrationId}, skipping email`);
        return;
    }
    const title = typeof registration['title'] === 'string' ? registration['title'] : 'Tournament';
    const category = typeof registration['category'] === 'string' ? registration['category'] : '';
    // new Date(`${date}T23:59:59`) with no offset parses as the runtime's
    // local time (UTC for Cloud Functions), not Slovak time — use the same
    // zonedTimeToUtc helper the event-reminder timezone fix already relies on.
    const deadline = registration['deadline']
        ? zonedTimeToUtc(registration['deadline'], '23:59', EVENT_TIMEZONE)
        : null;
    const responseUrl = registrationResponseUrl(origin, entryId, entry['token']);
    try {
        await transporter.sendMail({
            from: `Nexus <${process.env.GMAIL_USER}>`,
            to: entry['email'],
            subject: `Tournament invite: ${title}`,
            html: `
          <p>You've been invited to register <strong>${entry['clubName']}</strong> for "<strong>${title}</strong>"${category ? ` (${category})` : ''}.</p>
          ${deadline ? `<p>Please respond by <strong>${deadline.toLocaleDateString()}</strong>.</p>` : ''}
          <p><a href="${responseUrl}" style="display:inline-block;padding:10px 20px;background:#0066FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Respond to this invite</a></p>
          <p style="font-size:12px;color:#888;margin-top:24px;">Sent via Nexus, a free club &amp; team management app. <a href="${origin}/welcome">Learn more</a></p>
        `,
        });
        firebase_functions_1.logger.log(`sendRegistrationInviteEmail: sent to ${entry['email']} for registration ${registrationId}`);
    }
    catch (err) {
        firebase_functions_1.logger.error('sendRegistrationInviteEmail: send failed', err);
    }
});
async function loadRegistrationEntryWithToken(entryId, token) {
    const entryRef = db.collection('registrationEntries').doc(entryId);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) {
        throw new https_1.HttpsError('not-found', 'This invite could not be found.');
    }
    const entry = entrySnap.data();
    if (entry['token'] !== token) {
        throw new https_1.HttpsError('permission-denied', 'This invite link is invalid.');
    }
    return { entryRef, entry };
}
exports.getRegistrationEntryPublic = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    const entryId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.entryId;
    const token = (_b = request.data) === null || _b === void 0 ? void 0 : _b.token;
    if (!entryId || !token || typeof entryId !== 'string' || typeof token !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'entryId and token are required.');
    }
    const { entry } = await loadRegistrationEntryWithToken(entryId, token);
    const registrationSnap = await db.collection('tournamentRegistrations').doc(entry['registrationId']).get();
    const registration = registrationSnap.data();
    if (!registration) {
        throw new https_1.HttpsError('not-found', 'This registration could not be found.');
    }
    return {
        entry: Object.assign({ clubName: entry['clubName'], status: entry['status'] }, (entry['squadName'] ? { squadName: entry['squadName'] } : {})),
        registration: Object.assign(Object.assign(Object.assign({ title: registration['title'] }, (registration['category'] ? { category: registration['category'] } : {})), (registration['sport'] ? { sport: registration['sport'] } : {})), { deadline: registration['deadline'], status: registration['status'] }),
    };
});
exports.respondToRegistrationEntryPublic = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    const entryId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.entryId;
    const token = (_b = request.data) === null || _b === void 0 ? void 0 : _b.token;
    const status = (_c = request.data) === null || _c === void 0 ? void 0 : _c.status;
    const squadName = (_d = request.data) === null || _d === void 0 ? void 0 : _d.squadName;
    if (!entryId || !token || typeof entryId !== 'string' || typeof token !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'entryId and token are required.');
    }
    if (status !== 'accepted' && status !== 'declined') {
        throw new https_1.HttpsError('invalid-argument', 'status must be "accepted" or "declined".');
    }
    if (status === 'accepted' && (!squadName || typeof squadName !== 'string' || !squadName.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'squadName is required to accept.');
    }
    const { entryRef, entry } = await loadRegistrationEntryWithToken(entryId, token);
    const now = admin.firestore.Timestamp.now();
    await entryRef.update(Object.assign(Object.assign({ status }, (status === 'accepted' ? { squadName: squadName.trim() } : {})), { respondedAt: now, updatedAt: now }));
    // Best-effort in-app notification to the organizer — mirrors
    // NotificationManager.onTournamentRegistrationResponse's shape exactly,
    // written directly since this callable runs outside the client SDK.
    try {
        const registrationSnap = await db.collection('tournamentRegistrations').doc(entry['registrationId']).get();
        const registration = registrationSnap.data();
        if (registration === null || registration === void 0 ? void 0 : registration['createdBy']) {
            const body = status === 'accepted'
                ? `${entry['clubName']} accepted your invite to "${registration['title']}".`
                : `${entry['clubName']} declined your invite to "${registration['title']}".`;
            await db.collection('notifications').add({
                recipientId: registration['createdBy'],
                senderId: 'system',
                type: 'tournament_registration',
                title: '🏆 Tournament registration',
                body,
                data: { actionUrl: `/tools/tournaments/registrations/${entry['registrationId']}` },
                read: false,
                createdAt: now,
            });
        }
    }
    catch (err) {
        firebase_functions_1.logger.error('respondToRegistrationEntryPublic: notification failed', err);
    }
    return { ok: true };
});
// ─────────────────────────────────────────────────────────────
// 8c. sendTournamentRegistrationReminders — Scheduled daily (requires Blaze plan)
//     Reminds every still-pending entry 1 day before its registration's
//     deadline: an in-app notification for a real Nexus club, a reminder
//     email for an email-only (not-yet-on-Nexus) one. reminderSent guards
//     against sending twice.
// ─────────────────────────────────────────────────────────────
exports.sendTournamentRegistrationReminders = (0, scheduler_1.onSchedule)('0 8 * * *', async () => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const registrationsSnap = await db.collection('tournamentRegistrations').where('status', '==', 'open').get();
    let remindedCount = 0;
    for (const registrationDoc of registrationsSnap.docs) {
        const registration = registrationDoc.data();
        if (!registration['deadline'])
            continue;
        // Same fix as sendRegistrationInviteEmail above — parse the deadline as
        // 23:59 Slovak time, not UTC, so this daily reminder's "due within the
        // next 24h" window lines up with when the deadline actually falls locally.
        const deadline = zonedTimeToUtc(registration['deadline'], '23:59', EVENT_TIMEZONE);
        if (deadline <= now || deadline > in24h)
            continue;
        const entriesSnap = await db
            .collection('registrationEntries')
            .where('registrationId', '==', registrationDoc.id)
            .where('status', '==', 'pending')
            .get();
        const pendingEntries = entriesSnap.docs.filter((d) => !d.data()['reminderSent']);
        if (pendingEntries.length === 0)
            continue;
        const origin = getCanonicalOrigin(registration['siteOrigin']);
        const transporter = getTransporter();
        for (const entryDoc of pendingEntries) {
            const entry = entryDoc.data();
            try {
                if (entry['clubId']) {
                    const clubSnap = await db.collection('clubs').doc(entry['clubId']).get();
                    const clubData = clubSnap.data();
                    if (clubData) {
                        const recipientIds = [...new Set([...(clubData['trainers'] || []), clubData['ownerId']].filter(Boolean))];
                        const batch = db.batch();
                        for (const recipientId of recipientIds) {
                            const notifRef = db.collection('notifications').doc();
                            batch.set(notifRef, {
                                recipientId,
                                senderId: 'system',
                                type: 'tournament_registration',
                                title: '⏰ Tournament registration deadline approaching',
                                body: `"${registration['title']}" — respond by ${deadline.toLocaleDateString()}.`,
                                data: { actionUrl: `/tools/tournaments/registrations/${registrationDoc.id}` },
                                read: false,
                                createdAt: admin.firestore.Timestamp.now(),
                            });
                        }
                        await batch.commit();
                    }
                }
                else if (entry['email'] && transporter && origin) {
                    const responseUrl = registrationResponseUrl(origin, entryDoc.id, entry['token']);
                    await transporter.sendMail({
                        from: `Nexus <${process.env.GMAIL_USER}>`,
                        to: entry['email'],
                        subject: `Reminder: ${registration['title']} — registration closes soon`,
                        html: `
              <p>Just a reminder — the invite for <strong>${entry['clubName']}</strong> to "<strong>${registration['title']}</strong>" closes on <strong>${deadline.toLocaleDateString()}</strong>.</p>
              <p><a href="${responseUrl}" style="display:inline-block;padding:10px 20px;background:#0066FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Respond to this invite</a></p>
              <p style="font-size:12px;color:#888;margin-top:24px;">Sent via Nexus, a free club &amp; team management app. <a href="${origin}/welcome">Learn more</a></p>
            `,
                    });
                }
                await entryDoc.ref.update({ reminderSent: true });
                remindedCount++;
            }
            catch (err) {
                firebase_functions_1.logger.error(`sendTournamentRegistrationReminders: failed for entry ${entryDoc.id}`, err);
            }
        }
    }
    firebase_functions_1.logger.log(`Tournament registration reminders: ${remindedCount} entries reminded`);
});
function fnTeamsInGroup(bracket, groupId) {
    const seen = [];
    for (const m of bracket.matches || []) {
        if (m.groupId !== groupId)
            continue;
        for (const ref of [m.home, m.away]) {
            if (ref.type === 'manual' && ref.name && !seen.includes(ref.name))
                seen.push(ref.name);
        }
    }
    return seen;
}
function fnComputeGroupStandings(bracket, groupId) {
    const rows = new Map();
    const ensure = (team) => {
        let row = rows.get(team);
        if (!row) {
            row = { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
            rows.set(team, row);
        }
        return row;
    };
    for (const team of fnTeamsInGroup(bracket, groupId))
        ensure(team);
    for (const m of bracket.matches || []) {
        if (m.groupId !== groupId)
            continue;
        if (m.home.type !== 'manual' || m.away.type !== 'manual' || !m.home.name || !m.away.name)
            continue;
        if (m.homeScore === undefined || m.awayScore === undefined)
            continue;
        if (m.live)
            continue;
        const home = ensure(m.home.name);
        const away = ensure(m.away.name);
        home.played++;
        away.played++;
        home.goalsFor += m.homeScore;
        home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore;
        away.goalsAgainst += m.homeScore;
        if (m.homeScore > m.awayScore) {
            home.won++;
            home.points += 2;
            away.lost++;
        }
        else if (m.homeScore < m.awayScore) {
            away.won++;
            away.points += 2;
            home.lost++;
        }
        else {
            home.drawn++;
            away.drawn++;
            home.points += 1;
            away.points += 1;
        }
    }
    for (const row of rows.values())
        row.goalDiff = row.goalsFor - row.goalsAgainst;
    const baseCompare = (a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team);
    const list = Array.from(rows.values()).sort(baseCompare);
    for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        if (a.points !== b.points)
            continue;
        const prevTied = i > 0 && list[i - 1].points === a.points;
        const nextTied = i + 2 < list.length && list[i + 2].points === b.points;
        if (prevTied || nextTied)
            continue;
        const h2h = (bracket.matches || []).find((m) => m.groupId === groupId &&
            m.home.type === 'manual' && m.away.type === 'manual' &&
            m.homeScore !== undefined && m.awayScore !== undefined &&
            ((m.home.name === a.team && m.away.name === b.team) ||
                (m.home.name === b.team && m.away.name === a.team)));
        if (!h2h || h2h.homeScore === h2h.awayScore)
            continue;
        const aIsHome = h2h.home.name === a.team;
        const aWon = aIsHome ? h2h.homeScore > h2h.awayScore : h2h.awayScore > h2h.homeScore;
        if (!aWon) {
            list[i] = b;
            list[i + 1] = a;
        }
    }
    return list;
}
function fnResolveTeamRef(ref, bracket) {
    var _a, _b;
    if (ref.type === 'manual')
        return ref.name || '';
    if (ref.override)
        return ref.override;
    if (ref.type === 'groupStanding') {
        const group = (bracket.groups || []).find((g) => g.id === ref.group);
        const placeholder = `${(group === null || group === void 0 ? void 0 : group.name) || ref.group || '?'}${(_a = ref.position) !== null && _a !== void 0 ? _a : ''}`;
        if (!group || !ref.position)
            return placeholder;
        const standings = fnComputeGroupStandings(bracket, group.id);
        return ((_b = standings[ref.position - 1]) === null || _b === void 0 ? void 0 : _b.team) || placeholder;
    }
    const match = (bracket.matches || []).find((m) => m.id === ref.matchId);
    if (!match || match.homeScore === undefined || match.awayScore === undefined) {
        return ref.type === 'matchWinner' ? 'Winner TBD' : 'Loser TBD';
    }
    if (match.homeScore === match.awayScore)
        return 'TBD';
    const homeTeam = fnResolveTeamRef(match.home, bracket);
    const awayTeam = fnResolveTeamRef(match.away, bracket);
    const homeWon = match.homeScore > match.awayScore;
    return ref.type === 'matchWinner' ? (homeWon ? homeTeam : awayTeam) : (homeWon ? awayTeam : homeTeam);
}
exports.finalizeStandaloneTournamentStats = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to finalize stats.');
    }
    const tournamentId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.tournamentId;
    if (!tournamentId || typeof tournamentId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'tournamentId is required.');
    }
    const tSnap = await db.collection('tournaments').doc(tournamentId).get();
    if (!tSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Tournament not found.');
    }
    const tournament = tSnap.data();
    if (tournament['creatorId'] !== request.auth.uid) {
        const requesterSnap = await db.collection('users').doc(request.auth.uid).get();
        const requester = requesterSnap.data();
        const isAdminUser = (requester === null || requester === void 0 ? void 0 : requester['role']) === 'admin' || (requester === null || requester === void 0 ? void 0 : requester['isSuperAdmin']) === true;
        if (!isAdminUser) {
            throw new https_1.HttpsError('permission-denied', 'Only the tournament organizer can finalize stats.');
        }
    }
    const linkedTeams = tournament['linkedTeams'] || {};
    const bracket = tournament['bracket'];
    if (Object.keys(linkedTeams).length === 0 || !bracket) {
        return { synced: 0 };
    }
    const createdAt = tournament['createdAt'];
    const date = (createdAt === null || createdAt === void 0 ? void 0 : createdAt.toDate) ? createdAt.toDate().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    let synced = 0;
    for (const m of bracket.matches || []) {
        if (m.homeScore === undefined || m.awayScore === undefined || m.live)
            continue;
        const homeName = fnResolveTeamRef(m.home, bracket);
        const awayName = fnResolveTeamRef(m.away, bracket);
        const homeLink = linkedTeams[homeName];
        const awayLink = linkedTeams[awayName];
        // Internal scrimmage — both sides are the same club's own squads — never
        // counts toward either side's stats.
        if (homeLink && awayLink && homeLink.clubId === awayLink.clubId)
            continue;
        const sides = [
            { link: homeLink, us: m.homeScore, them: m.awayScore, opponent: awayName },
            { link: awayLink, us: m.awayScore, them: m.homeScore, opponent: homeName },
        ];
        for (const side of sides) {
            if (!((_b = side.link) === null || _b === void 0 ? void 0 : _b.teamId))
                continue; // club-only link — nothing to credit a team's stats with
            const outcome = side.us > side.them ? 'win' : side.us < side.them ? 'loss' : 'draw';
            const ref = db.collection('teamGameResults').doc(`${tournamentId}_${m.id}_${side.link.teamId}`);
            batch.set(ref, Object.assign(Object.assign({ clubId: side.link.clubId, teamId: side.link.teamId, tournamentId, tournamentTitle: tournament['title'] || '', matchId: m.id, opponent: side.opponent, teamScore: side.us, opponentScore: side.them, outcome,
                date }, (tournament['sport'] ? { sport: tournament['sport'] } : {})), { updatedAt: now }));
            synced++;
        }
    }
    await batch.commit();
    await db.collection('tournaments').doc(tournamentId).update({ statsFinalizedAt: now });
    firebase_functions_1.logger.log(`finalizeStandaloneTournamentStats: synced ${synced} team-game results for tournament ${tournamentId}`);
    return { synced };
});
// ─────────────────────────────────────────────────────────────
// 18. sendInventoryReturnReminders — Scheduled daily (requires Blaze plan)
//     inventoryItems denormalizes returnDate/returned out of its per-item
//     `values` map (see services/firebase/inventory.ts) specifically so this
//     scan never needs to know any inventory's field schema — just filters
//     `returned == false` (a plain equality query, no composite index) and
//     checks returnDate in JS.
// ─────────────────────────────────────────────────────────────
exports.sendInventoryReturnReminders = (0, scheduler_1.onSchedule)('0 8 * * *', async () => {
    var _a;
    const today = new Date().toISOString().slice(0, 10);
    const itemsSnap = await db.collection('inventoryItems').where('returned', '==', false).get();
    const overdue = itemsSnap.docs.filter(d => {
        const data = d.data();
        return typeof data['returnDate'] === 'string' && data['returnDate'] <= today && !data['reminderSent'];
    });
    if (overdue.length === 0)
        return;
    const clubCache = new Map();
    let remindedCount = 0;
    for (const itemDoc of overdue) {
        const item = itemDoc.data();
        const clubId = item['clubId'];
        try {
            if (!clubCache.has(clubId)) {
                const clubSnap = await db.collection('clubs').doc(clubId).get();
                clubCache.set(clubId, clubSnap.data());
            }
            const clubData = clubCache.get(clubId);
            if (!clubData)
                continue;
            const inventorySnap = await db.collection('inventories').doc(item['inventoryId']).get();
            const inventoryName = ((_a = inventorySnap.data()) === null || _a === void 0 ? void 0 : _a['name']) || 'Inventory';
            const recipientIds = [...new Set([
                    ...(clubData['trainers'] || []),
                    ...(clubData['assistants'] || []),
                    clubData['ownerId'],
                ].filter(Boolean))];
            const batch = db.batch();
            for (const recipientId of recipientIds) {
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    recipientId,
                    senderId: 'system',
                    type: 'inventory_overdue',
                    title: '📦 Overdue return',
                    body: `An item in "${inventoryName}" was due back on ${item['returnDate']} and isn't marked returned yet.`,
                    data: { actionUrl: `/tools/inventory/${item['inventoryId']}` },
                    read: false,
                    createdAt: admin.firestore.Timestamp.now(),
                });
            }
            await batch.commit();
            await itemDoc.ref.update({ reminderSent: true });
            remindedCount++;
        }
        catch (err) {
            firebase_functions_1.logger.error(`sendInventoryReturnReminders: failed for item ${itemDoc.id}`, err);
        }
    }
    firebase_functions_1.logger.log(`Inventory return reminders: ${remindedCount} items reminded`);
});
// ─────────────────────────────────────────────────────────────
// 9-10. Event waitlist cascade — a participantLimit event's waitlist is a
//    single-file FIFO queue: at most one invite is ever "live" at a time.
//    When a slot frees (someone cancels/declines, or staff raises the
//    limit), function 9 invites whoever is first in line with a 5-minute
//    response window; if they accept/decline via respondToWaitlistInvite
//    (services/firebase/events.ts) or that window lapses (function 10),
//    the next write naturally invites whoever is now first. Staff can
//    always confirm someone directly (addParticipantManually) — that
//    bypasses this cascade and the limit entirely.
// ─────────────────────────────────────────────────────────────
const WAITLIST_INVITE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
async function isWaitlistNotificationEnabled(userId) {
    var _a;
    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists)
        return false;
    const prefs = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.notificationPreferences;
    if (!prefs)
        return true; // no customization yet → default enabled
    return prefs.waitlistPromotions !== false;
}
async function notifyWaitlistInvite(eventId, event, userId, expiresAt, isGoalie = false) {
    var _a;
    const title = typeof event.title === 'string' ? event.title : 'Event';
    const actionUrl = `/calendar/events/${eventId}`;
    const spotLabel = isGoalie ? 'A goalie spot' : 'A spot';
    if (!(await isWaitlistNotificationEnabled(userId)))
        return;
    await db.collection('notifications').add({
        recipientId: userId,
        senderId: 'system',
        type: 'waitlist_free_spot',
        title: '⏫ A spot opened up!',
        body: `${spotLabel} is open for "${title}" — respond within 5 minutes or it goes to the next person.`,
        data: { eventId, actionUrl },
        read: false,
        createdAt: admin.firestore.Timestamp.now(),
    });
    const transporter = getTransporter();
    if (!transporter)
        return;
    const userSnap = await db.doc(`users/${userId}`).get();
    const email = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.email;
    if (!email || email.includes('@nexus.generated'))
        return; // child accounts have no real inbox
    const origin = getCanonicalOrigin(event.siteOrigin);
    const linkHtml = origin
        ? `<p><a href="${origin}${actionUrl}">${origin}${actionUrl}</a></p>`
        : '<p>Open the Nexus app to respond.</p>';
    // Was raw new Date(expiresAt).toISOString() — a UTC string like
    // "2026-09-22T18:23:00.000Z" shown straight in the email despite being
    // named "Local". Format it as an actual Slovak-local time instead.
    const expiresLocal = new Date(expiresAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: EVENT_TIMEZONE,
    });
    try {
        await transporter.sendMail({
            from: `Nexus <${process.env.GMAIL_USER}>`,
            to: email,
            subject: `A spot opened up for "${title}"`,
            html: `
        <p>${spotLabel} just opened up for "<strong>${title}</strong>".</p>
        <p>You're next on the waitlist — respond by <strong>${expiresLocal}</strong> (5 minutes) or it goes to the next person in line.</p>
        ${linkHtml}
      `,
        });
    }
    catch (err) {
        firebase_functions_1.logger.error(`notifyWaitlistInvite: email failed for ${userId}`, err);
    }
}
const GENERAL_TRACK = {
    limitField: 'participantLimit',
    confirmedField: 'confirmedCount',
    waitlistField: 'waitlist',
    pendingInviteField: 'pendingInvite',
    isGoalie: false,
};
const GOALIE_TRACK = {
    limitField: 'goalieLimit',
    confirmedField: 'confirmedGoalieCount',
    waitlistField: 'goalieWaitlist',
    pendingInviteField: 'goaliePendingInvite',
    isGoalie: true,
};
/**
 * Promotes the next waitlisted user for one track (general or goalie) of an
 * event, if a slot is actually open and no invite is already live on that
 * track. The two tracks are fully independent — a freed general slot never
 * checks the goalie waitlist and vice versa.
 */
async function tryPromoteWaitlistTrack(eventRef, data, track) {
    const limit = data[track.limitField];
    if (!limit)
        return null;
    const confirmed = typeof data[track.confirmedField] === 'number' ? data[track.confirmedField] : 0;
    const hasPendingInvite = !!data[track.pendingInviteField];
    const waitlist = Array.isArray(data[track.waitlistField]) ? data[track.waitlistField] : [];
    const openSlots = limit - confirmed - (hasPendingInvite ? 1 : 0);
    if (openSlots <= 0 || hasPendingInvite || waitlist.length === 0)
        return null;
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef);
        const fresh = snap.data();
        if (!fresh)
            return null;
        const freshWaitlist = Array.isArray(fresh[track.waitlistField]) ? fresh[track.waitlistField] : [];
        if (fresh[track.pendingInviteField] || freshWaitlist.length === 0)
            return null; // already handled by a concurrent run
        const nextUserId = freshWaitlist[0];
        const now = new Date();
        const expiresAt = new Date(now.getTime() + WAITLIST_INVITE_WINDOW_MS).toISOString();
        tx.update(eventRef, {
            [track.waitlistField]: freshWaitlist.slice(1),
            [track.pendingInviteField]: { userId: nextUserId, invitedAt: now.toISOString(), expiresAt },
        });
        return { userId: nextUserId, expiresAt };
    });
}
exports.promoteFromEventWaitlist = (0, firestore_1.onDocumentWritten)('events/{eventId}', async (event) => {
    var _a;
    const eventId = event.params.eventId;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const data = after.data();
    if (!data)
        return;
    const eventRef = db.doc(`events/${eventId}`);
    const generalInvite = await tryPromoteWaitlistTrack(eventRef, data, GENERAL_TRACK);
    if (generalInvite) {
        await notifyWaitlistInvite(eventId, data, generalInvite.userId, generalInvite.expiresAt, false);
        firebase_functions_1.logger.log(`promoteFromEventWaitlist: invited ${generalInvite.userId} for event ${eventId}, expires ${generalInvite.expiresAt}`);
    }
    const goalieInvite = await tryPromoteWaitlistTrack(eventRef, data, GOALIE_TRACK);
    if (goalieInvite) {
        await notifyWaitlistInvite(eventId, data, goalieInvite.userId, goalieInvite.expiresAt, true);
        firebase_functions_1.logger.log(`promoteFromEventWaitlist: invited goalie ${goalieInvite.userId} for event ${eventId}, expires ${goalieInvite.expiresAt}`);
    }
});
async function expireTrackInvites(track) {
    const nowIso = new Date().toISOString();
    const snap = await db.collection('events').where(`${track.pendingInviteField}.expiresAt`, '<=', nowIso).get();
    if (snap.empty)
        return;
    for (const docSnap of snap.docs) {
        const eventRef = docSnap.ref;
        const expiredUserId = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(eventRef);
            const data = fresh.data();
            const pendingInvite = data === null || data === void 0 ? void 0 : data[track.pendingInviteField];
            if (!pendingInvite || pendingInvite.expiresAt > nowIso)
                return null; // already answered or refreshed
            const userId = pendingInvite.userId;
            const waitlist = Array.isArray(data === null || data === void 0 ? void 0 : data[track.waitlistField]) ? data[track.waitlistField] : [];
            tx.update(eventRef, {
                [track.waitlistField]: [...waitlist, userId], // requeued at the back — missed this opening, still eligible for the next
                [track.pendingInviteField]: admin.firestore.FieldValue.delete(),
            });
            return userId;
        });
        if (expiredUserId) {
            firebase_functions_1.logger.log(`expireEventWaitlistInvites: ${track.isGoalie ? 'goalie ' : ''}invite for ${expiredUserId} lapsed on event ${docSnap.id}, requeued`);
        }
    }
}
exports.expireEventWaitlistInvites = (0, scheduler_1.onSchedule)('every 1 minutes', async () => {
    await expireTrackInvites(GENERAL_TRACK);
    await expireTrackInvites(GOALIE_TRACK);
});
function buildTrainingTimerPhases(timer) {
    if (timer.mode === 'stopwatch')
        return [{ type: 'stopwatch', durationSec: 0 }];
    const phases = [];
    const sets = Math.max(1, timer.sets || 1);
    const workSec = Math.max(1, timer.workMinutes || 1) * 60;
    const breakSec = Math.max(0, timer.breakMinutes || 0) * 60;
    for (let i = 1; i <= sets; i++) {
        phases.push({ type: 'work', durationSec: workSec, setNumber: i });
        if (i < sets && breakSec > 0)
            phases.push({ type: 'break', durationSec: breakSec });
    }
    return phases;
}
// Walks forward from the timer's last confirmed anchor to the phase that
// should be active at nowMs, jumping across as many boundaries as elapsed
// time demands — lets this cron catch a long-stalled timer (nobody's phone
// open for a while) back up to the correct phase in a single write, instead
// of one step per 1-minute tick.
function resolveTrainingTimerPhase(timer, nowMs) {
    const phases = buildTrainingTimerPhases(timer);
    const startIndex = Math.min(Math.max(0, timer.currentPhaseIndex || 0), phases.length - 1);
    if (timer.status === 'finished') {
        return { phaseIndex: startIndex, phaseStartedAt: timer.phaseStartedAt || new Date(nowMs).toISOString(), finished: true };
    }
    if (timer.mode === 'stopwatch' || timer.status !== 'running' || !timer.phaseStartedAt) {
        return { phaseIndex: startIndex, phaseStartedAt: timer.phaseStartedAt || new Date(nowMs).toISOString(), finished: false };
    }
    let boundary = new Date(timer.phaseStartedAt).getTime();
    let elapsedMs = nowMs - boundary;
    let index = startIndex;
    while (index < phases.length) {
        const durationMs = phases[index].durationSec * 1000;
        if (elapsedMs < durationMs) {
            return { phaseIndex: index, phaseStartedAt: new Date(boundary).toISOString(), finished: false };
        }
        elapsedMs -= durationMs;
        boundary += durationMs;
        index += 1;
    }
    return { phaseIndex: phases.length - 1, phaseStartedAt: new Date(boundary).toISOString(), finished: true };
}
async function isTrainingTimerNotificationEnabled(userId) {
    var _a;
    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists)
        return false;
    const prefs = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.notificationPreferences;
    if (!prefs)
        return true; // no customization yet → default enabled
    return prefs.teamUpdates !== false;
}
// Server-side backstop: a joined client normally calls syncTrainingTimerPhase
// itself the moment local math says a phase ran out (see
// src/services/firebase/trainingTimers.ts), but that only happens if someone
// still has the timer screen open. This check keeps a session moving — and
// the "N minutes left" warning firing — even if every trainer has put their
// phone away, catching it up by however many phases were missed rather than
// one step per tick.
exports.checkTrainingTimerPhases = (0, scheduler_1.onSchedule)('every 1 minutes', async () => {
    const snap = await db.collection('trainingTimers').where('status', '==', 'running').get();
    if (snap.empty)
        return;
    const nowMs = Date.now();
    for (const docSnap of snap.docs) {
        const timer = docSnap.data();
        if (timer.mode === 'stopwatch' || !timer.phaseStartedAt)
            continue;
        const phases = buildTrainingTimerPhases(timer);
        const phaseIndex = Math.min(Math.max(0, timer.currentPhaseIndex || 0), phases.length - 1);
        const phase = phases[phaseIndex];
        const elapsedSec = Math.max(0, (nowMs - new Date(timer.phaseStartedAt).getTime()) / 1000);
        const remainingSec = phase.durationSec - elapsedSec;
        const warnThresholdSec = (timer.warningMinutesBefore || 0) * 60;
        if (phase.type === 'work' &&
            warnThresholdSec > 0 &&
            remainingSec <= warnThresholdSec &&
            remainingSec > 0 &&
            timer.warningSentPhaseIndex !== phaseIndex) {
            await docSnap.ref.update({ warningSentPhaseIndex: phaseIndex, updatedAt: admin.firestore.Timestamp.now() });
            continue; // one write per tick per timer — a possible phase-out is handled next minute
        }
        if (remainingSec <= 0) {
            await db.runTransaction(async (tx) => {
                const fresh = await tx.get(docSnap.ref);
                const freshData = fresh.data();
                if (!freshData || freshData.status !== 'running')
                    return;
                const resolved = resolveTrainingTimerPhase(freshData, nowMs);
                if (resolved.finished) {
                    tx.update(docSnap.ref, { status: 'finished', pausedAt: null, updatedAt: admin.firestore.Timestamp.now() });
                }
                else if (resolved.phaseIndex !== freshData.currentPhaseIndex) {
                    tx.update(docSnap.ref, {
                        currentPhaseIndex: resolved.phaseIndex,
                        phaseStartedAt: resolved.phaseStartedAt,
                        warningSentPhaseIndex: admin.firestore.FieldValue.delete(),
                        updatedAt: admin.firestore.Timestamp.now(),
                    });
                }
            });
        }
    }
});
exports.onTrainingTimerPhaseChange = (0, firestore_1.onDocumentWritten)('trainingTimers/{timerId}', async (event) => {
    var _a, _b;
    const timerId = event.params.timerId;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before;
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after;
    if (!(before === null || before === void 0 ? void 0 : before.exists) || !(after === null || after === void 0 ? void 0 : after.exists))
        return; // ignore create/delete
    const b = before.data();
    const a = after.data();
    const participantIds = Array.isArray(a.participantIds) ? a.participantIds : [];
    if (participantIds.length === 0)
        return;
    const phaseChanged = a.currentPhaseIndex !== b.currentPhaseIndex && a.status === 'running';
    const justFinished = a.status === 'finished' && b.status !== 'finished';
    const warningJustSent = a.warningSentPhaseIndex != null && a.warningSentPhaseIndex !== b.warningSentPhaseIndex && a.status === 'running';
    if (!phaseChanged && !justFinished && !warningJustSent)
        return;
    const sessionTitle = typeof a.title === 'string' && a.title ? a.title : 'Training timer';
    const actionUrl = `/tools/training-timer/${timerId}`;
    const phases = buildTrainingTimerPhases(a);
    let title = `⏱ ${sessionTitle}`;
    let body = '';
    if (warningJustSent) {
        const phase = phases[Math.min(a.warningSentPhaseIndex, phases.length - 1)];
        body = (phase === null || phase === void 0 ? void 0 : phase.setNumber)
            ? `${a.warningMinutesBefore} min left in set ${phase.setNumber}`
            : `${a.warningMinutesBefore} min left`;
    }
    else if (justFinished) {
        body = 'Training session finished';
    }
    else {
        const phase = phases[Math.min(a.currentPhaseIndex, phases.length - 1)];
        body = (phase === null || phase === void 0 ? void 0 : phase.type) === 'break'
            ? 'Break started'
            : `Set ${phase === null || phase === void 0 ? void 0 : phase.setNumber} of ${a.sets} started`;
    }
    for (const uid of participantIds) {
        if (!(await isTrainingTimerNotificationEnabled(uid)))
            continue;
        await db.collection('notifications').add({
            recipientId: uid,
            senderId: 'system',
            type: 'training_timer',
            title,
            body,
            data: { timerId, actionUrl },
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
        });
    }
});
/**
 * sendUrgentTeamAlert — trainer/assistant/club-owner-only callable that
 * texts (and optionally calls) every opted-in team member with a phone
 * number on file. Voice calls always speak a fixed "check the app" line
 * (see twilioAlerts.ts) rather than the actual message text.
 *
 * Allowed callers: that team's own trainers/assistants, the owning club's
 * owner/trainers/assistants, or an admin — same shape of check as
 * deleteUserAccount above, scoped to one club/team instead of a user's
 * clubIds list.
 */
exports.sendUrgentTeamAlert = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!(0, twilioAlerts_1.isTwilioConfigured)()) {
        throw new https_1.HttpsError('failed-precondition', 'SMS/voice alerts are not configured yet.');
    }
    const callerUid = request.auth.uid;
    const clubId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.clubId;
    const teamId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.teamId;
    const message = typeof ((_c = request.data) === null || _c === void 0 ? void 0 : _c.message) === 'string' ? request.data.message.trim() : '';
    const sendSms = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.sendSms) !== false;
    const sendCall = ((_e = request.data) === null || _e === void 0 ? void 0 : _e.sendCall) === true;
    if (!clubId || !teamId || typeof clubId !== 'string' || typeof teamId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'clubId and teamId are required.');
    }
    if (!message) {
        throw new https_1.HttpsError('invalid-argument', 'A non-empty message is required.');
    }
    if (!sendSms && !sendCall) {
        throw new https_1.HttpsError('invalid-argument', 'At least one of sendSms/sendCall must be true.');
    }
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists)
        throw new https_1.HttpsError('not-found', 'Club not found.');
    const club = clubSnap.data();
    const teams = (_f = club['teams']) !== null && _f !== void 0 ? _f : [];
    const team = teams.find((t) => t['id'] === teamId);
    if (!team)
        throw new https_1.HttpsError('not-found', 'Team not found.');
    const teamTrainers = Array.isArray(team['trainers']) ? team['trainers'] : [];
    const teamAssistants = Array.isArray(team['assistants']) ? team['assistants'] : [];
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const caller = callerSnap.exists ? callerSnap.data() : null;
    const authorized = (caller === null || caller === void 0 ? void 0 : caller.role) === 'admin' ||
        club['ownerId'] === callerUid ||
        ((_g = club['trainers']) !== null && _g !== void 0 ? _g : []).includes(callerUid) ||
        ((_h = club['assistants']) !== null && _h !== void 0 ? _h : []).includes(callerUid) ||
        teamTrainers.includes(callerUid) ||
        teamAssistants.includes(callerUid);
    if (!authorized) {
        throw new https_1.HttpsError('permission-denied', 'Only club/team staff can send an urgent alert.');
    }
    const memberIds = team['membersData']
        ? Object.keys(team['membersData'])
        : Array.isArray(team['members']) ? team['members'] : [];
    const recipientIds = [...new Set([...memberIds, ...teamTrainers, ...teamAssistants])];
    if (recipientIds.length === 0) {
        return { smsSent: 0, smsFailed: 0, callsSent: 0, callsFailed: 0, skippedNoConsent: 0 };
    }
    // Re-fetch every recipient's own user doc server-side rather than trusting
    // anything the client might claim about phone numbers or consent.
    const userRefs = recipientIds.map((id) => db.collection('users').doc(id));
    const userSnaps = await db.getAll(...userRefs);
    let smsSent = 0, smsFailed = 0, callsSent = 0, callsFailed = 0, skippedNoConsent = 0;
    for (const snap of userSnaps) {
        if (!snap.exists)
            continue;
        const u = snap.data();
        const phone = typeof u.phoneNumber === 'string' ? u.phoneNumber.trim() : '';
        if (!phone || u.urgentAlertsOptIn !== true) {
            skippedNoConsent++;
            continue;
        }
        const language = u.language === 'en' ? 'en' : 'sk';
        if (sendSms) {
            try {
                await (0, twilioAlerts_1.sendAlertSms)(phone, message);
                smsSent++;
            }
            catch (err) {
                firebase_functions_1.logger.error('sendUrgentTeamAlert: SMS failed', { userId: snap.id, err });
                smsFailed++;
            }
        }
        if (sendCall) {
            try {
                await (0, twilioAlerts_1.makeAlertCall)(phone, language);
                callsSent++;
            }
            catch (err) {
                firebase_functions_1.logger.error('sendUrgentTeamAlert: call failed', { userId: snap.id, err });
                callsFailed++;
            }
        }
    }
    return { smsSent, smsFailed, callsSent, callsFailed, skippedNoConsent };
});
//# sourceMappingURL=index.js.map