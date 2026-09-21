/**
 * Events Service
 * Manage calendar events in Firestore
 */

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  addDoc,
  Timestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  deleteField,
  runTransaction,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Event as CalendarEvent, EventResponseData } from '../../types';
import { NotificationManager } from '../notifications/NotificationManager';
import { expandEvents } from '../../utils/eventExpansion';
import { localDateStr } from '../../utils/dateUtils';
import { getTeamPlayerCards } from './playerCards';

// ── Goalie track helpers ────────────────────────────────────────────────
// A goalie RSVP is identified automatically from the responder's own
// PlayerCard.position on this event's team — no extra question asked at
// RSVP time. Only fetched when the event actually has a goalieLimit set,
// so events without it pay no extra cost.

export async function getGoalieAthleteIds(event: CalendarEvent): Promise<Set<string>> {
  if (event.goalieLimit == null || !event.clubId || !event.teamId) return new Set();
  try {
    const cards = await getTeamPlayerCards(event.clubId, event.teamId);
    return new Set(cards.filter(c => c.position === 'goalie').map(c => c.athleteId));
  } catch (err) {
    console.error('getGoalieAthleteIds: failed to load player cards', err);
    return new Set();
  }
}

/** Whether a given response (its own userId, or any of its forAthletes) is a goalie's. */
export function isGoalieResponse(userId: string, forAthletes: string[] | undefined, goalieIds: Set<string>): boolean {
  if (goalieIds.size === 0) return false;
  if (forAthletes && forAthletes.length > 0) return forAthletes.some(id => goalieIds.has(id));
  return goalieIds.has(userId);
}

/** Recomputes both confirmed counters from a responses map, splitting goalie vs everyone else. */
function computeConfirmedCounts(
  responses: Record<string, any> | undefined,
  goalieIds: Set<string>
): { confirmedCount: number; confirmedGoalieCount: number } {
  let confirmedCount = 0;
  let confirmedGoalieCount = 0;
  for (const [uid, r] of Object.entries(responses || {})) {
    if (r.response !== 'confirmed') continue;
    if (isGoalieResponse(uid, r.forAthletes, goalieIds)) confirmedGoalieCount++;
    else confirmedCount++;
  }
  return { confirmedCount, confirmedGoalieCount };
}

/**
 * Get event by ID
 */
export async function getEvent(eventId: string): Promise<CalendarEvent | null> {
  try {
    const eventDoc = await getDoc(doc(db, 'events', eventId));

    if (!eventDoc.exists()) {
      return null;
    }
    
    return { id: eventDoc.id, ...eventDoc.data() } as CalendarEvent;
    
  } catch (error) {
    console.error('❌ Error getting event:', error);
    throw error;
  }
}

/**
 * Update an existing event
 */
export async function updateEvent(eventId: string, eventData: Partial<CalendarEvent>, modifiedBy?: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    
    // Get existing event data for notification
    const existingEvent = await getEvent(eventId);
    
    // Clean undefined fields - use same logic as createEvent
    const cleanedData = Object.entries(eventData).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as any);
    
    // Add updatedAt timestamp
    const updateData = {
      ...cleanedData,
      updatedAt: Timestamp.now()
    };
    
    await updateDoc(eventRef, updateData);
    console.log('✅ Event updated successfully:', eventId);
    
    // 🔔 Send notification to participants
    if (existingEvent && modifiedBy) {
      try {
        // Determine what changed
        let changes = [];
        if (cleanedData.date && cleanedData.date !== existingEvent.date) {
          changes.push(`Date changed to ${cleanedData.date}`);
        }
        if (cleanedData.startTime && cleanedData.startTime !== existingEvent.startTime) {
          changes.push(`Time changed to ${cleanedData.startTime}`);
        }
        if (cleanedData.location && cleanedData.location !== existingEvent.location) {
          changes.push(`Location changed to ${cleanedData.location}`);
        }
        if (changes.length === 0) {
          changes.push('Event details updated');
        }
        
        await NotificationManager.onEventModified({
          eventId,
          eventData: { ...existingEvent, ...cleanedData },
          modifiedBy,
          changes: changes.join(', '),
        });
      } catch (notifError) {
        console.error('❌ Failed to send event modified notification:', notifError);
        // Don't fail the event update if notification fails
      }
    }
  } catch (error) {
    console.error('❌ Error updating event:', error);
    throw error;
  }
}

/**
 * Create a single-occurrence override for a recurring event.
 * Steps:
 *  1. Add the occurrence date to the parent event's exceptions[] so it is
 *     skipped when the calendar generates recurring instances.
 *  2. Create a new standalone event document with the overridden data,
 *     linked back to the parent via parentEventId — carrying forward
 *     whoever had already responded to this occurrence (series-wide or via
 *     an occurrenceResponses override) so editing it doesn't silently wipe
 *     their RSVP, and notifying the same recipients an updateEvent() edit
 *     would (this path used to do neither).
 */
export async function createEventException(
  parentEventId: string,
  occurrenceDate: string,
  overrideData: Partial<CalendarEvent>,
  createdBy: string
): Promise<string> {
  try {
    const parentEvent = await getEvent(parentEventId);

    // 1. Mark the occurrence date as an exception on the parent event
    const parentRef = doc(db, 'events', parentEventId);
    await updateDoc(parentRef, {
      exceptions: arrayUnion(occurrenceDate),
      updatedAt: Timestamp.now(),
    });

    const carriedResponses = parentEvent ? getEffectiveResponses(parentEvent, occurrenceDate) : {};
    const responses = overrideData.responses || carriedResponses;
    const confirmedCount = Object.values(responses).filter(
      (r: any) => r.response === 'confirmed'
    ).length;

    // 2. Create the standalone override event
    const newEventData: any = {
      ...overrideData,
      date: occurrenceDate,
      parentEventId,
      isRecurring: false,
      exceptions: [],
      createdBy,
      responses,
      confirmedCount,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined and null recurrenceRule fields
    delete newEventData.recurrenceRule;
    const cleanData = Object.entries(newEventData).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {} as any);

    const newEventRef = await addDoc(collection(db, 'events'), cleanData);

    console.log('✅ Event exception created:', newEventRef.id, 'for parent:', parentEventId, 'on date:', occurrenceDate);

    // 3. Notify participants, same as a normal updateEvent() edit does.
    try {
      let changes: string[] = [];
      if (parentEvent) {
        if (cleanData.startTime && cleanData.startTime !== parentEvent.startTime) {
          changes.push(`Time changed to ${cleanData.startTime}`);
        }
        if (cleanData.location && cleanData.location !== parentEvent.location) {
          changes.push(`Location changed to ${cleanData.location}`);
        }
      }
      if (changes.length === 0) changes.push('Event details updated');

      await NotificationManager.onEventModified({
        eventId: newEventRef.id,
        eventData: cleanData,
        modifiedBy: createdBy,
        changes: changes.join(', '),
      });
    } catch (notifError) {
      console.error('❌ Failed to send event exception notification:', notifError);
    }

    return newEventRef.id;
  } catch (error) {
    console.error('❌ Error creating event exception:', error);
    throw error;
  }
}

/**
 * Cancel a single occurrence of a recurring event — the parent series and
 * every other occurrence are untouched.
 */
export async function deleteEventOccurrence(
  parentEventId: string,
  occurrenceDate: string,
  deletedBy: string
): Promise<void> {
  try {
    const parentEvent = await getEvent(parentEventId);
    if (!parentEvent) throw new Error('Event not found');

    // Mark the date as an exception so the recurrence expansion stops
    // generating a virtual occurrence for it.
    const parentRef = doc(db, 'events', parentEventId);
    await updateDoc(parentRef, {
      exceptions: arrayUnion(occurrenceDate),
      updatedAt: Timestamp.now(),
    });

    // If this occurrence was previously edited into its own standalone
    // override doc (createEventException), that's a separate events/ record
    // — marking the parent's exceptions alone doesn't remove it.
    const overrideSnap = await getDocs(
      query(
        collection(db, 'events'),
        where('parentEventId', '==', parentEventId),
        where('date', '==', occurrenceDate)
      )
    );
    await Promise.all(overrideSnap.docs.map(d => deleteDoc(d.ref)));

    console.log('✅ Event occurrence cancelled:', parentEventId, occurrenceDate);

    try {
      await NotificationManager.onEventDeleted({
        eventId: parentEventId,
        eventData: parentEvent,
        deletedBy,
        occurrenceDate,
      });
    } catch (notifError) {
      console.error('❌ Failed to send occurrence-cancelled notification:', notifError);
    }
  } catch (error) {
    console.error('❌ Error cancelling event occurrence:', error);
    throw error;
  }
}

/**
 * Get all events for a specific club
 */
export async function getClubEvents(clubId: string): Promise<CalendarEvent[]> {
  try {
    console.log('🔍 Fetching events for clubId:', clubId);
    
    const q = query(
      collection(db, 'events'),
      where('clubId', '==', clubId)
    );
    
    const querySnapshot = await getDocs(q);
    const events = querySnapshot.docs.map(doc => {
      const data = doc.data();
      console.log('📄 Event found:', {
        id: doc.id,
        title: data.title,
        clubId: data.clubId,
        visibilityLevel: data.visibilityLevel
      });
      return {
        id: doc.id,
        ...data
      };
    }) as CalendarEvent[];

    console.log(`✅ Loaded ${events.length} events for club:`, clubId);
    return events;
  } catch (error) {
    console.error('❌ Error getting club events for', clubId, ':', error);
    throw error;
  }
}

/**
 * Every occurrence (including expanded recurring instances) of a team's
 * events within [from, to] — used by AttendTab (listing sessions to mark)
 * and StatsTab (deriving provisional attendance from RSVPs), so both work
 * from the exact same event set. Recurring events are fetched separately
 * (capped at 100) since one can recur far outside the [from, to] window
 * a plain date filter would otherwise miss its base document.
 */
export async function getTeamEventsInRange(
  clubId: string,
  teamId: string,
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  const [recentSnap, recurSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'events'),
      where('clubId', '==', clubId),
      where('date', '>=', localDateStr(from)),
      fsLimit(200)
    )),
    getDocs(query(
      collection(db, 'events'),
      where('clubId', '==', clubId),
      where('isRecurring', '==', true),
      fsLimit(100)
    )),
  ]);

  const map = new Map<string, CalendarEvent>();
  for (const snap of [recentSnap, recurSnap]) {
    for (const d of snap.docs) map.set(d.id, { id: d.id, ...d.data() } as CalendarEvent);
  }

  const base = Array.from(map.values()).filter(e => e.teamId === teamId);
  return expandEvents(base, from, to);
}

/**
 * Get all events created by or visible to a specific user
 */
export async function getUserEvents(userId: string): Promise<CalendarEvent[]> {
  try {
    // Get personal events created by user
    const q = query(
      collection(db, 'events'),
      where('createdBy', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const events = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CalendarEvent[];

    console.log(`✅ Loaded ${events.length} events for user:`, userId);
    return events;
  } catch (error) {
    console.error('❌ Error getting user events:', error);
    throw error;
  }
}

/**
 * Create a new event
 */
export async function createEvent(eventData: any): Promise<string> {
  try {
    // Prepare the event document
    const newEvent = {
      ...eventData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      confirmedCount: 0,
      confirmedGoalieCount: 0,
      responses: eventData.responses || {},
      waitlist: eventData.waitlist || [],
      goalieWaitlist: eventData.goalieWaitlist || [],
      // Read server-side (promoteFromEventWaitlist) to build a clickable
      // link in waitlist-invite emails — same pattern as standalone
      // tournaments' siteOrigin, since Cloud Functions don't know the
      // frontend's own URL otherwise.
      siteOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    };

    // Remove undefined fields (Firebase doesn't accept undefined)
    const cleanedEvent = Object.entries(newEvent).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as any);

    // Create the event document in Firestore
    const docRef = await addDoc(collection(db, 'events'), cleanedEvent);

    console.log('✅ Event created successfully:', docRef.id);

    // 🔔 Send notification to team/club members — skipped for auto-imported
    // league games, which can be created dozens at a time (a whole season
    // synced at once) covering dates months out. An instant notification per
    // game there means a burst of pushes for fixtures nobody needs to know
    // about yet; createLeagueGameEvent gives these a `reminders` entry
    // instead, so sendEventReminders notifies close to the actual game day.
    try {
      if (eventData.type !== 'leagueGame') {
        await NotificationManager.onEventCreated({
          eventId: docRef.id,
          eventData: cleanedEvent,
          createdBy: eventData.createdBy,
        });
      }
    } catch (notifError) {
      console.error('❌ Failed to send event created notification:', notifError);
      // Don't fail the event creation if notification fails
    }
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating event:', error);
    throw error;
  }
}

/**
 * Effective responses for one occurrence of an event: the series-wide `responses`
 * map, with any per-occurrence override in `occurrenceResponses[date]` taking
 * precedence per user. Pass no date (or the event's own base date) to just get
 * the series-wide responses, since a non-recurring event never has overrides.
 */
export function getEffectiveResponses(
  event: Pick<CalendarEvent, 'responses' | 'occurrenceResponses'>,
  occurrenceDate?: string | null
): { [userId: string]: EventResponseData } {
  const base = event.responses || {};
  const overrides = occurrenceDate ? event.occurrenceResponses?.[occurrenceDate] : undefined;
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/**
 * RSVP to an event.
 *
 * scope: 'series' (default) writes to the event's series-wide response, same as
 * every occurrence sharing one answer. 'single' writes only to occurrenceDate's
 * own override, leaving the series-wide response (and every other occurrence)
 * untouched — and clears any stale single-occurrence override for that same date
 * if the caller switches back to 'series' for it.
 *
 * Capacity is only enforced on the 'series' path, where confirmedCount is
 * actually tracked (a single-occurrence override never had capacity
 * semantics to begin with — occurrenceResponses isn't counted anywhere). A
 * 'confirmed' response on a full event is transactionally redirected onto
 * the waitlist instead of being written as confirmed — see the returned
 * `waitlisted` flag. Someone already confirmed can always re-submit
 * 'confirmed' (e.g. re-answering with a different forAthletes) without
 * being bumped onto their own waitlist.
 *
 * If the event has a goalieLimit, a response is routed onto the goalie
 * track instead — its own limit, confirmedGoalieCount, and waitlist,
 * entirely separate from the general ones above — whenever the responder
 * (or, for a parent, any of forAthletes) is a goalie on this team's
 * roster (PlayerCard.position). See `kind` in the return value.
 */
export async function rsvpToEvent(
  eventId: string,
  userId: string,
  response: 'confirmed' | 'declined' | 'maybe',
  message?: string,
  forAthletes?: string[],  // parent selecting specific children; omit = applies to all
  scope: 'single' | 'series' = 'series',
  occurrenceDate?: string
): Promise<{ waitlisted: boolean; kind?: 'general' | 'goalie' }> {
  try {
    const eventRef = doc(db, 'events', eventId);

    const responseData: Record<string, any> = {
      response,
      timestamp: Timestamp.now(),
      message: message || '',
    };
    if (forAthletes && forAthletes.length > 0) {
      responseData.forAthletes = forAthletes;
    }

    if (scope === 'single') {
      const event = await getEvent(eventId);
      if (!event) throw new Error('Event not found');
      if (!event.isRecurring || !occurrenceDate) {
        throw new Error('Single-occurrence scope requires a recurring event and occurrenceDate');
      }
      const updatedOccurrenceResponses = {
        ...event.occurrenceResponses,
        [occurrenceDate]: {
          ...event.occurrenceResponses?.[occurrenceDate],
          [userId]: responseData,
        },
      };
      await updateDoc(eventRef, {
        occurrenceResponses: updatedOccurrenceResponses,
        updatedAt: Timestamp.now(),
      });
      console.log('✅ RSVP updated:', eventId, userId, response, scope);
      return { waitlisted: false };
    }

    // Read once, outside the transaction, purely to know whether a goalie
    // roster lookup is even needed — the transaction re-reads the event
    // fresh for the actual capacity decision.
    const preEvent = await getEvent(eventId);
    const goalieIds = preEvent ? await getGoalieAthleteIds(preEvent) : new Set<string>();
    const isGoalie = isGoalieResponse(userId, forAthletes, goalieIds);

    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists()) throw new Error('Event not found');
      const event = snap.data() as CalendarEvent;

      const alreadyConfirmed = event.responses?.[userId]?.response === 'confirmed';
      const { confirmedCount: currentConfirmed, confirmedGoalieCount: currentGoalieConfirmed } =
        computeConfirmedCounts(event.responses, goalieIds);

      const isFull = isGoalie
        ? !!event.goalieLimit && currentGoalieConfirmed >= event.goalieLimit
        : !!event.participantLimit && currentConfirmed >= event.participantLimit;

      if (response === 'confirmed' && isFull && !alreadyConfirmed) {
        // No room on this track — join its waitlist instead of confirming.
        const waitlistField = isGoalie ? 'goalieWaitlist' : 'waitlist';
        const waitlist = Array.isArray(event[waitlistField]) ? event[waitlistField]! : [];
        if (!waitlist.includes(userId)) {
          tx.update(eventRef, { [waitlistField]: [...waitlist, userId], updatedAt: Timestamp.now() });
        }
        return { waitlisted: true, kind: isGoalie ? 'goalie' as const : 'general' as const };
      }

      const updatedResponses = { ...event.responses, [userId]: responseData };
      const { confirmedCount, confirmedGoalieCount } = computeConfirmedCounts(updatedResponses, goalieIds);
      const updates: Record<string, any> = {
        responses: updatedResponses,
        confirmedCount,
        confirmedGoalieCount,
        updatedAt: Timestamp.now(),
      };

      // Answering for the whole series supersedes any single-occurrence override
      // left over for the date currently being viewed.
      if (event.isRecurring && occurrenceDate && event.occurrenceResponses?.[occurrenceDate]?.[userId]) {
        const clearedOccurrence = { ...event.occurrenceResponses[occurrenceDate] };
        delete clearedOccurrence[userId];
        updates.occurrenceResponses = { ...event.occurrenceResponses, [occurrenceDate]: clearedOccurrence };
      }
      // A non-'confirmed' response clears any waitlist spot the user held —
      // on whichever track they were queued on.
      if (response !== 'confirmed') {
        if (Array.isArray(event.waitlist) && event.waitlist.includes(userId)) {
          updates.waitlist = event.waitlist.filter(id => id !== userId);
        }
        if (Array.isArray(event.goalieWaitlist) && event.goalieWaitlist.includes(userId)) {
          updates.goalieWaitlist = event.goalieWaitlist.filter(id => id !== userId);
        }
      }

      tx.update(eventRef, updates);
      return { waitlisted: false };
    });

    console.log('✅ RSVP updated:', eventId, userId, response, scope, result.waitlisted ? `(waitlisted, ${result.kind})` : '');
    return result;
  } catch (error) {
    console.error('❌ Error updating RSVP:', error);
    throw error;
  }
}

/**
 * Cancel RSVP to an event. Same scope rules as rsvpToEvent — 'single' only
 * removes occurrenceDate's own override, 'series' removes the series-wide answer.
 */
export async function cancelRsvp(
  eventId: string,
  userId: string,
  scope: 'single' | 'series' = 'series',
  occurrenceDate?: string
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const event = await getEvent(eventId);

    if (!event) {
      return;
    }

    if (scope === 'single' && event.isRecurring && occurrenceDate) {
      if (!event.occurrenceResponses?.[occurrenceDate]?.[userId]) return;
      const clearedOccurrence = { ...event.occurrenceResponses[occurrenceDate] };
      delete clearedOccurrence[userId];
      await updateDoc(eventRef, {
        occurrenceResponses: { ...event.occurrenceResponses, [occurrenceDate]: clearedOccurrence },
        updatedAt: Timestamp.now(),
      });
      console.log('✅ RSVP cancelled for occurrence:', eventId, occurrenceDate, userId);
      return;
    }

    if (!event.responses) {
      return;
    }

    // Remove user from responses
    const updatedResponses = { ...event.responses };
    delete updatedResponses[userId];

    // Recalculate both confirmed counters (goalie roster lookup only runs
    // when this event actually tracks a goalie limit — see getGoalieAthleteIds).
    const goalieIds = await getGoalieAthleteIds(event);
    const { confirmedCount, confirmedGoalieCount } = computeConfirmedCounts(updatedResponses, goalieIds);

    const updates: Record<string, any> = {
      responses: updatedResponses,
      confirmedCount,
      confirmedGoalieCount,
      updatedAt: Timestamp.now(),
    };
    if (Array.isArray(event.waitlist) && event.waitlist.includes(userId)) {
      updates.waitlist = event.waitlist.filter(id => id !== userId);
    }
    if (Array.isArray(event.goalieWaitlist) && event.goalieWaitlist.includes(userId)) {
      updates.goalieWaitlist = event.goalieWaitlist.filter(id => id !== userId);
    }

    await updateDoc(eventRef, updates);

    console.log('✅ RSVP cancelled:', eventId, userId);

    // Waitlist promotion on a freed slot is handled server-side by
    // promoteFromEventWaitlist (functions/src/index.ts), which reacts to
    // this confirmedCount/confirmedGoalieCount drop — covers every path
    // that can free a slot (this cancel, a decline via rsvpToEvent, a
    // staff removal), not just this one call site.
  } catch (error) {
    console.error('❌ Error cancelling RSVP:', error);
    throw error;
  }
}

/**
 * Get user's RSVP status for an event (optionally for one specific occurrence).
 */
export async function getUserRsvpStatus(
  eventId: string,
  userId: string,
  occurrenceDate?: string | null
): Promise<string | null> {
  try {
    const event = await getEvent(eventId);
    if (!event) return null;
    const effective = getEffectiveResponses(event, occurrenceDate);
    if (!effective[userId]) {
      return null;
    }
    return effective[userId].response;
  } catch (error) {
    console.error('❌ Error getting RSVP status:', error);
    return null;
  }
}

/**
 * Check if event is locked (within lock period)
 */
export function isEventLocked(event: CalendarEvent): boolean {
  if (!event.lockPeriod || !event.lockPeriod.enabled) {
    return false;
  }

  const now = new Date();
  const eventDateTime = new Date(event.date);
  
  if (event.startTime) {
    const [hours, minutes] = event.startTime.split(':').map(Number);
    eventDateTime.setHours(hours, minutes);
  }

  const minutesUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60);
  return minutesUntilEvent <= event.lockPeriod.minutesBefore && minutesUntilEvent >= 0;
}

/**
 * Check if RSVP deadline has passed
 */
export function isRsvpDeadlinePassed(event: CalendarEvent): boolean {
  if (!event.rsvpDeadline) {
    return false;
  }

  const now = new Date();
  const deadline = new Date(event.rsvpDeadline);
  return now > deadline;
}

/**
 * Check if event is full
 */
export function isEventFull(event: CalendarEvent): boolean {
  if (!event.participantLimit) {
    return false;
  }

  return (event.confirmedCount || 0) >= event.participantLimit;
}

/** Goalie-track counterpart to isEventFull. */
export function isGoalieSlotFull(event: CalendarEvent): boolean {
  if (!event.goalieLimit) {
    return false;
  }
  return (event.confirmedGoalieCount || 0) >= event.goalieLimit;
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string, deletedBy?: string): Promise<void> {
  try {
    // Get event data before deleting for notification
    const eventData = await getEvent(eventId);
    
    await deleteDoc(doc(db, 'events', eventId));
    console.log('✅ Event deleted:', eventId);
    
    // 🔔 Send notification to participants
    if (eventData && deletedBy) {
      try {
        await NotificationManager.onEventDeleted({
          eventId,
          eventData,
          deletedBy,
        });
      } catch (notifError) {
        console.error('❌ Failed to send event deleted notification:', notifError);
        // Don't fail the deletion if notification fails
      }
    }
  } catch (error) {
    console.error('❌ Error deleting event:', error);
    throw error;
  }
}

// ==================== Waitlist Functions ====================

/**
 * Join event waitlist
 */
export async function joinWaitlist(eventId: string, userId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      waitlist: arrayUnion(userId)
    });
    console.log('✅ User added to waitlist:', userId);
  } catch (error) {
    console.error('❌ Error joining waitlist:', error);
    throw error;
  }
}

/**
 * Leave event waitlist
 */
export async function leaveWaitlist(eventId: string, userId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      waitlist: arrayRemove(userId)
    });
    console.log('✅ User removed from waitlist:', userId);
  } catch (error) {
    console.error('❌ Error leaving waitlist:', error);
    throw error;
  }
}

/**
 * Get user's waitlist position (1-indexed)
 */
export function getWaitlistPosition(event: CalendarEvent, userId: string): number | null {
  if (!event.waitlist || event.waitlist.length === 0) {
    return null;
  }

  const index = event.waitlist.indexOf(userId);
  return index >= 0 ? index + 1 : null;
}

/**
 * Check if user is on waitlist
 */
export function isUserOnWaitlist(event: CalendarEvent, userId: string): boolean {
  return event.waitlist?.includes(userId) || false;
}

/** Leave the goalie waitlist — see leaveWaitlist above for the general-track version. */
export async function leaveGoalieWaitlist(eventId: string, userId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      goalieWaitlist: arrayRemove(userId)
    });
    console.log('✅ User removed from goalie waitlist:', userId);
  } catch (error) {
    console.error('❌ Error leaving goalie waitlist:', error);
    throw error;
  }
}

/** Goalie-track counterpart to getWaitlistPosition. */
export function getGoalieWaitlistPosition(event: CalendarEvent, userId: string): number | null {
  if (!event.goalieWaitlist || event.goalieWaitlist.length === 0) {
    return null;
  }
  const index = event.goalieWaitlist.indexOf(userId);
  return index >= 0 ? index + 1 : null;
}

/**
 * Respond to an active waitlist invite (pendingInvite or, on the goalie
 * track, goaliePendingInvite) — the one-tap Yes/Maybe/No a user reaches by
 * opening the app from the "a spot opened up" notification. 'confirmed'
 * seats them; anything else records that answer and releases the invite.
 * Either way, clearing the invite field lets promoteFromEventWaitlist
 * (functions/src/index.ts) invite the next candidate on its next trigger.
 * Throws if the invite already expired or was answered elsewhere — the
 * caller should re-fetch and show that state.
 */
export async function respondToWaitlistInvite(
  eventId: string,
  userId: string,
  response: 'confirmed' | 'declined' | 'maybe'
): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  const preEvent = await getEvent(eventId);
  const goalieIds = preEvent ? await getGoalieAthleteIds(preEvent) : new Set<string>();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists()) throw new Error('Event not found');
    const event = snap.data() as CalendarEvent;

    const isGoalieInvite = event.goaliePendingInvite?.userId === userId;
    const isGeneralInvite = event.pendingInvite?.userId === userId;
    if (!isGoalieInvite && !isGeneralInvite) {
      throw new Error('No active invite for this user — it may have expired already.');
    }

    const responseData = { response, timestamp: Timestamp.now(), message: '' };
    const updatedResponses = { ...event.responses, [userId]: responseData };
    const updates: Record<string, any> = {
      [isGoalieInvite ? 'goaliePendingInvite' : 'pendingInvite']: deleteField(),
      updatedAt: Timestamp.now(),
    };

    if (response === 'confirmed') {
      const { confirmedCount, confirmedGoalieCount } = computeConfirmedCounts(updatedResponses, goalieIds);
      updates.responses = updatedResponses;
      updates.confirmedCount = confirmedCount;
      updates.confirmedGoalieCount = confirmedGoalieCount;
    } else {
      // Declined/maybe on their invited slot — record the answer, don't
      // requeue them; they said no to this specific opening.
      updates.responses = updatedResponses;
    }

    tx.update(eventRef, updates);
  });
  console.log('✅ Waitlist invite answered:', eventId, userId, response);
}

/**
 * Staff directly confirming someone, bypassing the waitlist and any
 * participantLimit — "add as many as needed manually." Removes them from
 * the waitlist if they happened to be on it.
 */
export async function addParticipantManually(
  eventId: string,
  targetUserId: string,
  addedBy: string
): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  const event = await getEvent(eventId);
  if (!event) throw new Error('Event not found');

  const updatedResponses = {
    ...event.responses,
    [targetUserId]: { response: 'confirmed' as const, timestamp: Timestamp.now(), message: '', respondedBy: addedBy },
  };
  const goalieIds = await getGoalieAthleteIds(event);
  const { confirmedCount, confirmedGoalieCount } = computeConfirmedCounts(updatedResponses, goalieIds);
  const updates: Record<string, any> = { responses: updatedResponses, confirmedCount, confirmedGoalieCount, updatedAt: Timestamp.now() };
  if (Array.isArray(event.waitlist) && event.waitlist.includes(targetUserId)) {
    updates.waitlist = event.waitlist.filter(id => id !== targetUserId);
  }
  if (Array.isArray(event.goalieWaitlist) && event.goalieWaitlist.includes(targetUserId)) {
    updates.goalieWaitlist = event.goalieWaitlist.filter(id => id !== targetUserId);
  }

  await updateDoc(eventRef, updates);
  console.log('✅ Participant added manually:', eventId, targetUserId, 'by', addedBy);

  try {
    await NotificationManager.onWaitlistAssigned({
      userId: targetUserId,
      eventId,
      eventTitle: event.title,
      assignedBy: addedBy,
    });
  } catch (notifError) {
    console.error('❌ Failed to send manual-add notification:', notifError);
  }
}

/**
 * Staff override: demote a confirmed participant back onto the waitlist
 * (their own track — general or goalie, detected the same way as everywhere
 * else). Queued at the back, same as anyone else joining the waitlist.
 */
export async function moveConfirmedToWaitlist(eventId: string, targetUserId: string, movedBy: string): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  const event = await getEvent(eventId);
  if (!event) throw new Error('Event not found');

  const existing = event.responses?.[targetUserId];
  if (!existing || existing.response !== 'confirmed') return;

  const goalieIds = await getGoalieAthleteIds(event);
  const isGoalie = isGoalieResponse(targetUserId, existing.forAthletes, goalieIds);
  const waitlistField = isGoalie ? 'goalieWaitlist' : 'waitlist';

  const updatedResponses = { ...event.responses };
  delete updatedResponses[targetUserId];
  const { confirmedCount, confirmedGoalieCount } = computeConfirmedCounts(updatedResponses, goalieIds);

  const currentWaitlist = Array.isArray(event[waitlistField]) ? event[waitlistField]! : [];
  const updates: Record<string, any> = {
    responses: updatedResponses,
    confirmedCount,
    confirmedGoalieCount,
    updatedAt: Timestamp.now(),
  };
  if (!currentWaitlist.includes(targetUserId)) {
    updates[waitlistField] = [...currentWaitlist, targetUserId];
  }

  await updateDoc(eventRef, updates);
  console.log('✅ Participant moved to waitlist:', eventId, targetUserId, 'by', movedBy);

  try {
    await NotificationManager.onMovedToWaitlistByStaff({
      userId: targetUserId,
      eventId,
      eventTitle: event.title,
      movedBy,
    });
  } catch (notifError) {
    console.error('❌ Failed to send moved-to-waitlist notification:', notifError);
  }

  // A freed confirmed slot is picked up server-side by promoteFromEventWaitlist,
  // same as any other path that drops confirmedCount/confirmedGoalieCount.
}

/**
 * Staff override: remove a participant from the event entirely (not on
 * either waitlist afterwards either — a clean slate, same as cancelRsvp).
 */
export async function removeParticipantByStaff(eventId: string, targetUserId: string, removedBy: string): Promise<void> {
  const event = await getEvent(eventId);
  await cancelRsvp(eventId, targetUserId);
  if (!event) return;

  try {
    await NotificationManager.onRemovedFromEvent({
      userId: targetUserId,
      eventId,
      eventTitle: event.title,
      removedBy,
    });
  } catch (notifError) {
    console.error('❌ Failed to send removed-from-event notification:', notifError);
  }
}

// More event functions will be added in future phases
