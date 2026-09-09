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
 * Deploy:
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as cheerio from 'cheerio';
import * as QRCode from 'qrcode';
import * as nodemailer from 'nodemailer';
import * as XLSX from 'xlsx';

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

    // Fully data-only — no top-level `notification`, and no `webpush.notification`
    // either. Both act as a browser/OS-level display hint that the push service can
    // auto-render on its own, *in addition to* the service worker's onBackgroundMessage
    // handler calling showNotification() itself — two independent display paths for
    // the same message, which is exactly why users were seeing every push twice.
    // The service worker (and the foreground handler) are the sole source of display,
    // built entirely from this data payload.
    const messages: admin.messaging.Message[] = fcmTokens.map((token) => ({
      token,
      data: dataPayload,
      webpush: {
        fcmOptions: { link: dataPayload['actionUrl'] ?? '/' },
      },
    }));

    const response = await fcm.sendEach(messages);
    logger.log(`Push: ${response.successCount}/${messages.length} OK → user ${recipientId}`);

    // Remove stale / invalid tokens and enforce 5-token cap
    const MAX_TOKENS = 5;
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

    const cleaned = fcmTokens.filter((t) => !invalidTokens.includes(t)).slice(-MAX_TOKENS);
    if (cleaned.length !== fcmTokens.length) {
      await db.doc(`users/${recipientId}`).update({ fcmTokens: cleaned });
      logger.log(`Token cleanup: ${fcmTokens.length} → ${cleaned.length} for user ${recipientId}`);
    }
  }
);

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
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
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
  }, {} as Record<string, string>);

  const readingAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  const offsetMs = readingAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

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

    const eventDateTime = zonedTimeToUtc(
      event['date'] as string,
      (event['startTime'] as string) ?? '09:00',
      EVENT_TIMEZONE
    );
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
        } else if (event['clubId'] && event['visibilityLevel'] === 'club') {
          // Club-wide event (no specific team) — remind every club member, matching
          // the recipient set used when the event was first created.
          const clubDoc = await db.doc(`clubs/${event['clubId']}`).get();
          if (clubDoc.exists) {
            const clubData = clubDoc.data()!;
            memberIds = [...new Set([...memberIds, ...((clubData['members'] as string[]) ?? [])])];
            if (clubData['ownerId']) memberIds.push(String(clubData['ownerId']));
            if (clubData['superTrainer']) memberIds.push(String(clubData['superTrainer']));
            (clubData['trainers'] as string[] ?? []).forEach((id: string) => memberIds.push(id));
            memberIds = [...new Set(memberIds)];
          }
        } else if (!event['clubId'] && !event['teamId'] && event['createdBy']) {
          // Personal event — nobody else is invited, so remind the creator.
          memberIds = [...new Set([...memberIds, String(event['createdBy'])])];
        }

        const timeLabel =
          minutesBefore < 60
            ? `${minutesBefore} minutes`
            : minutesBefore < 1440
            ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}`
            : `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? 's' : ''}`;

        // Body carries the event's actual clock time alongside the countdown —
        // the title only has the name, so without this the push gives no clue
        // *when* it starts, just how soon relative to now.
        const startTime = event['startTime'] as string | undefined;
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

// ─────────────────────────────────────────────────────────────
// 4. sendNominationNoResponseAlerts — Scheduled every 30 min (requires Blaze plan)
//    Once a nomination's deadline passes, alerts staff about any primary-list
//    athlete still 'pending' — once per entry (noResponseAlertSent guards repeats).
//    This never blocks trainer/assistant edits — the deadline is purely informational.
// ─────────────────────────────────────────────────────────────

export const sendNominationNoResponseAlerts = onSchedule('*/30 * * * *', async () => {
  const now = new Date();
  const clubsSnap = await db.collection('clubs').get();
  let notifCount = 0;

  for (const clubDoc of clubsSnap.docs) {
    const clubData = clubDoc.data();
    const teams: Array<Record<string, unknown>> = clubData['teams'] ?? [];

    const nominationsSnap = await db.collection('clubs').doc(clubDoc.id).collection('nominations').get();

    for (const nomDoc of nominationsSnap.docs) {
      const nomination = nomDoc.data();
      if (nomination['cancelled']) continue;

      const deadline: Date = nomination['deadline'].toDate
        ? nomination['deadline'].toDate()
        : new Date(nomination['deadline']);
      if (deadline > now) continue; // deadline hasn't passed yet

      const primary: Record<string, any> = nomination['primary'] || {};
      const pendingUnalerted = Object.entries(primary).filter(
        ([, entry]: [string, any]) => entry.status === 'pending' && !entry.noResponseAlertSent
      );
      if (pendingUnalerted.length === 0) continue;

      // Staff to notify: team-level trainers/assistants + club owner + club-level trainers
      const team = teams.find((t) => t['id'] === nomination['teamId']);
      const staffIds = new Set<string>();
      if (team) {
        const membersData = (team['membersData'] ?? {}) as Record<string, any>;
        Object.entries(membersData).forEach(([uid, data]) => {
          if (data.role === 'trainer' || data.role === 'assistant') staffIds.add(uid);
        });
      }
      if (clubData['ownerId']) staffIds.add(clubData['ownerId']);
      (clubData['trainers'] || []).forEach((id: string) => staffIds.add(id));

      const batch = db.batch();
      const updatedPrimary = { ...primary };

      for (const [athleteId, entryRaw] of pendingUnalerted) {
        const entry = entryRaw as any;
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
        updatedPrimary[athleteId] = { ...entry, noResponseAlertSent: true };
      }

      batch.update(nomDoc.ref, { primary: updatedPrimary, updatedAt: admin.firestore.Timestamp.now() });
      await batch.commit();
      logger.log(`Nomination "${nomination['title']}": alerted staff about ${pendingUnalerted.length} non-responders`);
    }
  }

  logger.log(`Nomination no-response alerts: ${notifCount} notifications created`);
});

// ─────────────────────────────────────────────────────────────
// 5. League schedule scraper (Callable — on demand from the UI)
// ─────────────────────────────────────────────────────────────

interface ScrapedGame {
  externalId: string;
  round?: string;
  homeTeam: string;
  guestTeam: string;
  date: string; // DD.MM.YYYY
  time: string; // HH:MM
  result?: string; // "3:2"
  location?: string;
  type: 'game';
}

/**
 * hlcana.sk pattern: the page's visible text runs round / home team / score /
 * guest team / date / time in sequence for each match. Ported 1:1 from the
 * former client-side parser (src/services/leagueScraper.ts) — same regexes.
 */
function parseHlcanaPattern(bodyText: string): ScrapedGame[] {
  const games: ScrapedGame[] = [];
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

        let result: string | undefined;
        const scoreMatch = separator.match(/^(\d+)\s*:\s*(\d+)$/);
        if (scoreMatch) result = `${scoreMatch[1]}:${scoreMatch[2]}`;

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
function parseTableFormat($: cheerio.CheerioAPI): ScrapedGame[] {
  const games: ScrapedGame[] = [];

  $('table').each((tableIndex, table) => {
    $(table)
      .find('tr')
      .each((rowIndex, row) => {
        const cells = $(row).find('td, th');
        if (cells.length < 3) return;

        const cellsText = cells.map((_, c) => $(c).text().trim()).get();

        let date = '';
        let time = '';
        let homeTeam = '';
        let guestTeam = '';
        let result: string | undefined;

        for (const text of cellsText) {
          if (text.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            date = text;
          } else if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = text.split('-');
            date = `${day}.${month}.${year}`;
          }
          if (text.match(/^\d{2}:\d{2}$/)) time = text;
          if (text.match(/^\d+\s*:\s*\d+$/)) result = text.replace(/\s/g, '');

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
function parseGenericFormat(bodyText: string): ScrapedGame[] {
  const games: ScrapedGame[] = [];
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

export const scrapeLeagueUrl = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in to scrape a league schedule.');
  }

  const url = request.data?.url;
  if (!url || typeof url !== 'string') {
    throw new HttpsError('invalid-argument', 'A url string is required.');
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new HttpsError('not-found', `The URL returned HTTP ${res.status}.`);
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('scrapeLeagueUrl: fetch failed', err);
    throw new HttpsError('unavailable', 'Could not reach that URL.');
  }

  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  let games = parseHlcanaPattern(bodyText);
  if (games.length === 0) games = parseTableFormat($);
  if (games.length === 0) games = parseGenericFormat(bodyText);

  logger.log(`scrapeLeagueUrl: found ${games.length} games at ${url}`);
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
export const deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const callerUid = request.auth.uid;
  const targetUserId = request.data?.userId;
  if (!targetUserId || typeof targetUserId !== 'string') {
    throw new HttpsError('invalid-argument', 'A userId string is required.');
  }

  const targetSnap = await db.collection('users').doc(targetUserId).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'User not found.');
  }
  const target = targetSnap.data()!;
  const isSelf = callerUid === targetUserId;

  let authorized = isSelf;
  if (!authorized) {
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const caller = callerSnap.exists ? callerSnap.data() : null;

    if (caller?.role === 'admin') {
      authorized = true;
    } else {
      const targetClubIds: string[] = target.clubIds || [];
      for (const clubId of targetClubIds) {
        const clubSnap = await db.collection('clubs').doc(clubId).get();
        if (!clubSnap.exists) continue;
        const club = clubSnap.data()!;
        if (
          club.ownerId === callerUid ||
          (club.trainers || []).includes(callerUid) ||
          (club.assistants || []).includes(callerUid)
        ) {
          authorized = true;
          break;
        }
      }
    }
  }

  if (!authorized) {
    throw new HttpsError('permission-denied', 'Not allowed to delete this account.');
  }
  if (!isSelf && target.role === 'admin') {
    throw new HttpsError('permission-denied', 'Cannot delete an admin account.');
  }

  // Remove from every club/team the user belongs to
  const clubIds: string[] = target.clubIds || [];
  for (const clubId of clubIds) {
    const clubRef = db.collection('clubs').doc(clubId);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(clubRef);
        if (!snap.exists) return;
        const club = snap.data()!;
        const updates: FirebaseFirestore.UpdateData<any> = {};

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
        const teams = (club.teams || []).map((team: any) => {
          let changed = false;
          const newTeam = { ...team };
          if (Array.isArray(team.members) && team.members.includes(targetUserId)) {
            newTeam.members = team.members.filter((id: string) => id !== targetUserId);
            changed = true;
          }
          if (team.membersData && team.membersData[targetUserId]) {
            const md = { ...team.membersData };
            delete md[targetUserId];
            newTeam.membersData = md;
            changed = true;
          }
          if (Array.isArray(team.trainers) && team.trainers.includes(targetUserId)) {
            newTeam.trainers = team.trainers.filter((id: string) => id !== targetUserId);
            changed = true;
          }
          if (Array.isArray(team.assistants) && team.assistants.includes(targetUserId)) {
            newTeam.assistants = team.assistants.filter((id: string) => id !== targetUserId);
            changed = true;
          }
          if (changed) teamsChanged = true;
          return newTeam;
        });
        if (teamsChanged) updates.teams = teams;

        if (Object.keys(updates).length > 0) {
          tx.update(clubRef, updates);
        }
      });
    } catch (err) {
      logger.error(`deleteUserAccount: cleanup failed for club ${clubId}`, err);
    }
  }

  // Parent being deleted — release their children (delete child if no parent remains)
  if (Array.isArray(target.childIds) && target.childIds.length > 0) {
    for (const childId of target.childIds) {
      const childRef = db.collection('users').doc(childId);
      const childSnap = await childRef.get();
      if (!childSnap.exists) continue;
      const child = childSnap.data()!;
      const remainingParents = (child.parentIds || []).filter((id: string) => id !== targetUserId);
      if (remainingParents.length === 0) {
        await childRef.delete().catch((err) => logger.error(`deleteUserAccount: child delete failed for ${childId}`, err));
      } else {
        await childRef.update({ parentIds: remainingParents }).catch((err) => logger.error(`deleteUserAccount: child update failed for ${childId}`, err));
      }
    }
  }

  // Child being deleted — detach from any remaining co-parents
  if (Array.isArray(target.parentIds) && target.parentIds.length > 0) {
    for (const parentId of target.parentIds) {
      await db.collection('users').doc(parentId)
        .update({ childIds: admin.firestore.FieldValue.arrayRemove(targetUserId) })
        .catch((err) => logger.error(`deleteUserAccount: parent update failed for ${parentId}`, err));
    }
  }

  await db.collection('users').doc(targetUserId).delete();

  await admin.auth().deleteUser(targetUserId).catch((err) => {
    logger.error('deleteUserAccount: auth delete failed', err);
  });

  logger.log(`deleteUserAccount: ${targetUserId} deleted by ${callerUid}`);
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
async function isStaleMirrorEvent(
  publicRef: FirebaseFirestore.DocumentReference,
  after: FirebaseFirestore.DocumentSnapshot | undefined
): Promise<boolean> {
  if (!after?.updateTime) return false;
  const existing = await publicRef.get();
  const existingSourceUpdateTime = existing.data()?._sourceUpdateTime as FirebaseFirestore.Timestamp | undefined;
  return !!existingSourceUpdateTime && existingSourceUpdateTime.toMillis() > after.updateTime.toMillis();
}

export const mirrorTournamentPublicData = onDocumentWritten(
  'clubs/{clubId}/nominations/{nominationId}',
  async (event) => {
    const nominationId = event.params.nominationId;
    const publicRef = db.doc(`tournamentPublic/${nominationId}`);
    const after = event.data?.after;

    // Firestore doesn't guarantee this trigger runs in write order for rapid
    // successive writes to the same document (e.g. staff assigning a rink,
    // then immediately marking a match live) — a slower invocation for an
    // OLDER write can finish after a faster one for a NEWER write and
    // clobber it with stale data. Guard with the source document's own
    // updateTime (its real write order) rather than an app-level timestamp,
    // which would only reflect when THIS function ran, not write order.
    if (await isStaleMirrorEvent(publicRef, after)) return;

    if (!after || !after.exists) {
      await publicRef.delete().catch(() => {});
      return;
    }

    const nomination = after.data();
    if (!nomination || nomination.kind !== 'tournament' || !nomination.bracket) {
      // Not a tournament, or no bracket set up yet — nothing safe to show publicly.
      await publicRef.delete().catch(() => {});
      return;
    }

    const publicData: Record<string, unknown> = {
      clubId: nomination.clubId,
      teamId: nomination.teamId,
      title: nomination.title,
      bracket: nomination.bracket,
      updatedAt: admin.firestore.Timestamp.now(),
      ...(after.updateTime ? { _sourceUpdateTime: after.updateTime } : {}),
    };
    if (nomination.favoriteTeamName) {
      publicData.favoriteTeamName = nomination.favoriteTeamName;
    }
    const firstGameLocation = Array.isArray(nomination.games) ? nomination.games[0]?.location : undefined;
    if (firstGameLocation) {
      publicData.location = firstGameLocation;
    }

    await publicRef.set(publicData);
  }
);

// ─────────────────────────────────────────────────────────────
// 7. Standalone (no-club) tournament mirror — same idea as function 6, but
//    the source is the top-level `tournaments` collection instead of a club
//    Nomination. Writes into the SAME tournamentPublic collection, keyed by
//    the same id, so the existing /tv/:id page needs no changes at all —
//    it doesn't know or care which kind of tournament it's showing.
// ─────────────────────────────────────────────────────────────

export const mirrorStandaloneTournamentPublicData = onDocumentWritten(
  'tournaments/{tournamentId}',
  async (event) => {
    const tournamentId = event.params.tournamentId;
    const publicRef = db.doc(`tournamentPublic/${tournamentId}`);
    const after = event.data?.after;

    // See mirrorTournamentPublicData above for why this ordering guard exists.
    if (await isStaleMirrorEvent(publicRef, after)) return;

    if (!after || !after.exists) {
      await publicRef.delete().catch(() => {});
      return;
    }

    const tournament = after.data();
    if (!tournament || (!tournament.bracket && !tournament.combatBracket)) {
      await publicRef.delete().catch(() => {});
      return;
    }

    const publicData: Record<string, unknown> = {
      title: tournament.title,
      updatedAt: admin.firestore.Timestamp.now(),
      ...(after.updateTime ? { _sourceUpdateTime: after.updateTime } : {}),
    };
    if (tournament.bracket) publicData.bracket = tournament.bracket;
    if (tournament.combatBracket) publicData.combatBracket = tournament.combatBracket;
    if (tournament.sport) publicData.sport = tournament.sport;
    if (tournament.location) {
      publicData.location = tournament.location;
    }

    await publicRef.set(publicData);
  }
);

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
function describeTeamSlot(ref: any, groups: any[]): string {
  if (!ref) return '';
  if (ref.type === 'manual') return ref.name || '';
  if (ref.override) return ref.override;
  if (ref.type === 'groupStanding') {
    const group = groups.find((g) => g.id === ref.group);
    return `${group?.name || ref.group || '?'}${ref.position ?? ''}`;
  }
  return ref.type === 'matchWinner' ? 'Winner TBD' : 'Loser TBD';
}

function buildScheduleWorkbookBuffer(bracket: any): Buffer {
  const groups = bracket?.groups || [];
  const groupName = (id?: string) => groups.find((g: any) => g.id === id)?.name || '';
  const matches = [...(bracket?.matches || [])].sort((a: any, b: any) => a.matchNumber - b.matchNumber);

  const rows: (string | number)[][] = [
    ['#', 'Group', 'Label', 'Start Time', 'Surface', 'Home', 'Away', 'Score'],
    ...matches.map((m: any) => [
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
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'tournament';
}

let cachedTransporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  }
  return cachedTransporter;
}

export const sendTournamentCreatedEmail = onDocumentCreated(
  'tournaments/{tournamentId}',
  async (event) => {
    const tournamentId = event.params.tournamentId;
    const tournament = event.data?.data();
    if (!tournament) return;

    // teamContacts (team name -> email), collected in the wizard's review
    // step — invites go out alongside the creator's own summary email below.
    const teamContacts: Record<string, string> =
      tournament.teamContacts && typeof tournament.teamContacts === 'object' ? tournament.teamContacts : {};
    const teamEntries = Object.entries(teamContacts).filter(([, email]) => typeof email === 'string' && email);
    if (!tournament.creatorEmail && teamEntries.length === 0) return;

    const transporter = getTransporter();
    if (!transporter) {
      logger.warn('sendTournamentCreatedEmail: GMAIL_USER/GMAIL_APP_PASSWORD not configured, skipping email');
      return;
    }

    const origin = typeof tournament.siteOrigin === 'string' && tournament.siteOrigin
      ? tournament.siteOrigin
      : null;
    if (!origin) {
      logger.warn(`sendTournamentCreatedEmail: no siteOrigin on tournament ${tournamentId}, skipping email`);
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

    let qrDataUrl: string;
    try {
      qrDataUrl = await QRCode.toDataURL(mobileUrl, { width: 300, margin: 1 });
    } catch (err) {
      logger.error('sendTournamentCreatedEmail: QR generation failed', err);
      return;
    }

    const title = typeof tournament.title === 'string' ? tournament.title : 'Tournament';
    const emailTag = typeof tournament.emailTag === 'string' ? tournament.emailTag.trim() : '';
    // Prefixed onto every subject below (creator's and each team's) so a tag
    // like "Christmas U9" is searchable in either inbox — not just the ones
    // it was specifically added for.
    const subjectPrefix = emailTag ? `[${emailTag}] ` : '';

    let scheduleBuffer: Buffer | null = null;
    try {
      scheduleBuffer = buildScheduleWorkbookBuffer(tournament.bracket);
    } catch (err) {
      logger.error('sendTournamentCreatedEmail: schedule workbook build failed', err);
    }

    const attachments = [
      {
        filename: 'qr-code.png',
        content: qrDataUrl.split(',')[1],
        encoding: 'base64' as const,
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
        logger.log(`sendTournamentCreatedEmail: sent to ${tournament.creatorEmail} for tournament ${tournamentId}`);
      } catch (err) {
        logger.error('sendTournamentCreatedEmail: send failed', err);
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
        logger.log(`sendTournamentCreatedEmail: team invite sent to ${teamEmail} (${teamName}) for tournament ${tournamentId}`);
      } catch (err) {
        logger.error(`sendTournamentCreatedEmail: team invite failed for ${teamName}`, err);
      }
    }
  }
);

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

async function isWaitlistNotificationEnabled(userId: string): Promise<boolean> {
  const userSnap = await db.doc(`users/${userId}`).get();
  if (!userSnap.exists) return false;
  const prefs = userSnap.data()?.notificationPreferences;
  if (!prefs) return true; // no customization yet → default enabled
  return prefs.waitlistPromotions !== false;
}

async function notifyWaitlistInvite(eventId: string, event: FirebaseFirestore.DocumentData, userId: string, expiresAt: string): Promise<void> {
  const title = typeof event.title === 'string' ? event.title : 'Event';
  const actionUrl = `/calendar/events/${eventId}`;

  if (!(await isWaitlistNotificationEnabled(userId))) return;

  await db.collection('notifications').add({
    recipientId: userId,
    senderId: 'system',
    type: 'waitlist_free_spot',
    title: '⏫ A spot opened up!',
    body: `A spot is open for "${title}" — respond within 5 minutes or it goes to the next person.`,
    data: { eventId, actionUrl },
    read: false,
    createdAt: admin.firestore.Timestamp.now(),
  });

  const transporter = getTransporter();
  if (!transporter) return;
  const userSnap = await db.doc(`users/${userId}`).get();
  const email = userSnap.data()?.email as string | undefined;
  if (!email || email.includes('@nexus.generated')) return; // child accounts have no real inbox

  const origin = typeof event.siteOrigin === 'string' ? event.siteOrigin : null;
  const linkHtml = origin
    ? `<p><a href="${origin}${actionUrl}">${origin}${actionUrl}</a></p>`
    : '<p>Open the Nexus app to respond.</p>';
  const expiresLocal = new Date(expiresAt).toISOString();

  try {
    await transporter.sendMail({
      from: `Nexus <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `A spot opened up for "${title}"`,
      html: `
        <p>A spot just opened up for "<strong>${title}</strong>".</p>
        <p>You're next on the waitlist — respond by <strong>${expiresLocal}</strong> (5 minutes) or it goes to the next person in line.</p>
        ${linkHtml}
      `,
    });
  } catch (err) {
    logger.error(`notifyWaitlistInvite: email failed for ${userId}`, err);
  }
}

export const promoteFromEventWaitlist = onDocumentWritten(
  'events/{eventId}',
  async (event) => {
    const eventId = event.params.eventId;
    const after = event.data?.after;
    if (!after?.exists) return;

    const data = after.data();
    if (!data || !data.participantLimit) return;

    const confirmedCount = typeof data.confirmedCount === 'number' ? data.confirmedCount : 0;
    const hasPendingInvite = !!data.pendingInvite;
    const waitlist: string[] = Array.isArray(data.waitlist) ? data.waitlist : [];
    const openSlots = data.participantLimit - confirmedCount - (hasPendingInvite ? 1 : 0);
    if (openSlots <= 0 || hasPendingInvite || waitlist.length === 0) return;

    const eventRef = db.doc(`events/${eventId}`);
    const invited = await db.runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      const fresh = snap.data();
      if (!fresh) return null;
      const freshWaitlist: string[] = Array.isArray(fresh.waitlist) ? fresh.waitlist : [];
      if (fresh.pendingInvite || freshWaitlist.length === 0) return null; // already handled by a concurrent run

      const nextUserId = freshWaitlist[0];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + WAITLIST_INVITE_WINDOW_MS).toISOString();
      tx.update(eventRef, {
        waitlist: freshWaitlist.slice(1),
        pendingInvite: { userId: nextUserId, invitedAt: now.toISOString(), expiresAt },
      });
      return { userId: nextUserId, expiresAt };
    });

    if (invited) {
      await notifyWaitlistInvite(eventId, data, invited.userId, invited.expiresAt);
      logger.log(`promoteFromEventWaitlist: invited ${invited.userId} for event ${eventId}, expires ${invited.expiresAt}`);
    }
  }
);

export const expireEventWaitlistInvites = onSchedule('every 1 minutes', async () => {
  const nowIso = new Date().toISOString();
  const snap = await db.collection('events').where('pendingInvite.expiresAt', '<=', nowIso).get();
  if (snap.empty) return;

  for (const docSnap of snap.docs) {
    const eventRef = docSnap.ref;
    const expiredUserId = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(eventRef);
      const data = fresh.data();
      if (!data?.pendingInvite || data.pendingInvite.expiresAt > nowIso) return null; // already answered or refreshed
      const userId = data.pendingInvite.userId as string;
      const waitlist: string[] = Array.isArray(data.waitlist) ? data.waitlist : [];
      tx.update(eventRef, {
        waitlist: [...waitlist, userId], // requeued at the back — missed this opening, still eligible for the next
        pendingInvite: admin.firestore.FieldValue.delete(),
      });
      return userId;
    });

    if (expiredUserId) {
      logger.log(`expireEventWaitlistInvites: invite for ${expiredUserId} lapsed on event ${docSnap.id}, requeued`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 11-12. Training Timer — server-side phase advance + push notifications
// ─────────────────────────────────────────────────────────────
// Mirrors src/utils/trainingTimerPhases.ts's buildPhases()/computeLiveState()
// on the client — kept as a small standalone copy here since functions/ is a
// separate TS project from src/. Keep the two in sync if the phase math ever
// changes.

interface TrainingTimerPhase {
  type: 'work' | 'break' | 'stopwatch';
  durationSec: number;
  setNumber?: number;
}

function buildTrainingTimerPhases(timer: FirebaseFirestore.DocumentData): TrainingTimerPhase[] {
  if (timer.mode === 'stopwatch') return [{ type: 'stopwatch', durationSec: 0 }];
  const phases: TrainingTimerPhase[] = [];
  const sets = Math.max(1, timer.sets || 1);
  const workSec = Math.max(1, timer.workMinutes || 1) * 60;
  const breakSec = Math.max(0, timer.breakMinutes || 0) * 60;
  for (let i = 1; i <= sets; i++) {
    phases.push({ type: 'work', durationSec: workSec, setNumber: i });
    if (i < sets && breakSec > 0) phases.push({ type: 'break', durationSec: breakSec });
  }
  return phases;
}

async function isTrainingTimerNotificationEnabled(userId: string): Promise<boolean> {
  const userSnap = await db.doc(`users/${userId}`).get();
  if (!userSnap.exists) return false;
  const prefs = userSnap.data()?.notificationPreferences;
  if (!prefs) return true; // no customization yet → default enabled
  return prefs.teamUpdates !== false;
}

// Server-side backstop: a joined client normally calls advanceTrainingTimerPhase
// itself the moment a phase runs out (see src/services/firebase/trainingTimers.ts),
// but that only happens if someone still has the timer screen open. This check
// keeps a session moving — and the "N minutes left" warning firing — even if
// every trainer has put their phone away.
export const checkTrainingTimerPhases = onSchedule('every 1 minutes', async () => {
  const snap = await db.collection('trainingTimers').where('status', '==', 'running').get();
  if (snap.empty) return;

  const nowMs = Date.now();
  for (const docSnap of snap.docs) {
    const timer = docSnap.data();
    if (timer.mode === 'stopwatch' || !timer.phaseStartedAt) continue;

    const phases = buildTrainingTimerPhases(timer);
    const phaseIndex = Math.min(Math.max(0, timer.currentPhaseIndex || 0), phases.length - 1);
    const phase = phases[phaseIndex];
    const elapsedSec = Math.max(0, (nowMs - new Date(timer.phaseStartedAt).getTime()) / 1000);
    const remainingSec = phase.durationSec - elapsedSec;

    const warnThresholdSec = (timer.warningMinutesBefore || 0) * 60;
    if (
      phase.type === 'work' &&
      warnThresholdSec > 0 &&
      remainingSec <= warnThresholdSec &&
      remainingSec > 0 &&
      timer.warningSentPhaseIndex !== phaseIndex
    ) {
      await docSnap.ref.update({ warningSentPhaseIndex: phaseIndex, updatedAt: admin.firestore.Timestamp.now() });
      continue; // one write per tick per timer — a possible phase-out is handled next minute
    }

    if (remainingSec <= 0) {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(docSnap.ref);
        const freshData = fresh.data();
        if (!freshData || freshData.status !== 'running' || freshData.currentPhaseIndex !== phaseIndex) return;
        const nextIndex = phaseIndex + 1;
        if (nextIndex >= phases.length) {
          tx.update(docSnap.ref, { status: 'finished', pausedAt: null, updatedAt: admin.firestore.Timestamp.now() });
        } else {
          tx.update(docSnap.ref, {
            currentPhaseIndex: nextIndex,
            phaseStartedAt: new Date().toISOString(),
            warningSentPhaseIndex: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      });
    }
  }
});

export const onTrainingTimerPhaseChange = onDocumentWritten(
  'trainingTimers/{timerId}',
  async (event) => {
    const timerId = event.params.timerId;
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before?.exists || !after?.exists) return; // ignore create/delete

    const b = before.data()!;
    const a = after.data()!;

    const participantIds: string[] = Array.isArray(a.participantIds) ? a.participantIds : [];
    if (participantIds.length === 0) return;

    const phaseChanged = a.currentPhaseIndex !== b.currentPhaseIndex && a.status === 'running';
    const justFinished = a.status === 'finished' && b.status !== 'finished';
    const warningJustSent =
      a.warningSentPhaseIndex != null && a.warningSentPhaseIndex !== b.warningSentPhaseIndex && a.status === 'running';

    if (!phaseChanged && !justFinished && !warningJustSent) return;

    const sessionTitle = typeof a.title === 'string' && a.title ? a.title : 'Training timer';
    const actionUrl = `/tools/training-timer/${timerId}`;
    const phases = buildTrainingTimerPhases(a);

    let title = `⏱ ${sessionTitle}`;
    let body = '';

    if (warningJustSent) {
      const phase = phases[Math.min(a.warningSentPhaseIndex, phases.length - 1)];
      body = phase?.setNumber
        ? `${a.warningMinutesBefore} min left in set ${phase.setNumber}`
        : `${a.warningMinutesBefore} min left`;
    } else if (justFinished) {
      body = 'Training session finished';
    } else {
      const phase = phases[Math.min(a.currentPhaseIndex, phases.length - 1)];
      body = phase?.type === 'break'
        ? 'Break started'
        : `Set ${phase?.setNumber} of ${a.sets} started`;
    }

    for (const uid of participantIds) {
      if (!(await isTrainingTimerNotificationEnabled(uid))) continue;
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
  }
);
