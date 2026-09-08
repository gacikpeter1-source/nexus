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
      responses: eventData.responses || {},
      waitlist: eventData.waitlist || [],
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
    
    // 🔔 Send notification to team/club members
    try {
      await NotificationManager.onEventCreated({
        eventId: docRef.id,
        eventData: cleanedEvent,
        createdBy: eventData.createdBy,
      });
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
 */
export async function rsvpToEvent(
  eventId: string,
  userId: string,
  response: 'confirmed' | 'declined' | 'maybe',
  message?: string,
  forAthletes?: string[],  // parent selecting specific children; omit = applies to all
  scope: 'single' | 'series' = 'series',
  occurrenceDate?: string
): Promise<{ waitlisted: boolean }> {
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

    const waitlisted = await runTransaction(db, async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists()) throw new Error('Event not found');
      const event = snap.data() as CalendarEvent;

      const alreadyConfirmed = event.responses?.[userId]?.response === 'confirmed';
      const currentConfirmed = Object.values(event.responses || {}).filter(
        (r: any) => r.response === 'confirmed'
      ).length;
      const isFull = !!event.participantLimit && currentConfirmed >= event.participantLimit;

      if (response === 'confirmed' && isFull && !alreadyConfirmed) {
        // No room — join the waitlist instead of confirming.
        const waitlist = Array.isArray(event.waitlist) ? event.waitlist : [];
        if (!waitlist.includes(userId)) {
          tx.update(eventRef, { waitlist: [...waitlist, userId], updatedAt: Timestamp.now() });
        }
        return true;
      }

      const updatedResponses = { ...event.responses, [userId]: responseData };
      const confirmedCount = Object.values(updatedResponses).filter(
        (r: any) => r.response === 'confirmed'
      ).length;
      const updates: Record<string, any> = {
        responses: updatedResponses,
        confirmedCount,
        updatedAt: Timestamp.now(),
      };

      // Answering for the whole series supersedes any single-occurrence override
      // left over for the date currently being viewed.
      if (event.isRecurring && occurrenceDate && event.occurrenceResponses?.[occurrenceDate]?.[userId]) {
        const clearedOccurrence = { ...event.occurrenceResponses[occurrenceDate] };
        delete clearedOccurrence[userId];
        updates.occurrenceResponses = { ...event.occurrenceResponses, [occurrenceDate]: clearedOccurrence };
      }
      // A non-'confirmed' response clears any waitlist spot the user held.
      if (response !== 'confirmed' && Array.isArray(event.waitlist) && event.waitlist.includes(userId)) {
        updates.waitlist = event.waitlist.filter(id => id !== userId);
      }

      tx.update(eventRef, updates);
      return false;
    });

    console.log('✅ RSVP updated:', eventId, userId, response, scope, waitlisted ? '(waitlisted)' : '');
    return { waitlisted };
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

    // Recalculate confirmed count
    const confirmedCount = Object.values(updatedResponses).filter(
      (r: any) => r.response === 'confirmed'
    ).length;

    await updateDoc(eventRef, {
      responses: updatedResponses,
      confirmedCount,
      updatedAt: Timestamp.now()
    });

    console.log('✅ RSVP cancelled:', eventId, userId);

    // Waitlist promotion on a freed slot is handled server-side by
    // promoteFromEventWaitlist (functions/src/index.ts), which reacts to
    // this confirmedCount drop — covers every path that can free a slot
    // (this cancel, a decline via rsvpToEvent, a staff removal), not just
    // this one call site.
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

/**
 * Respond to an active waitlist invite (pendingInvite) — the one-tap Yes/
 * Maybe/No a user reaches by opening the app from the "a spot opened up"
 * notification. 'confirmed' seats them; anything else records that answer
 * and releases the invite. Either way, clearing pendingInvite lets
 * promoteFromEventWaitlist (functions/src/index.ts) invite the next
 * candidate on its next trigger. Throws if the invite already expired or
 * was answered elsewhere — the caller should re-fetch and show that state.
 */
export async function respondToWaitlistInvite(
  eventId: string,
  userId: string,
  response: 'confirmed' | 'declined' | 'maybe'
): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists()) throw new Error('Event not found');
    const event = snap.data() as CalendarEvent;

    if (!event.pendingInvite || event.pendingInvite.userId !== userId) {
      throw new Error('No active invite for this user — it may have expired already.');
    }

    const responseData = { response, timestamp: Timestamp.now(), message: '' };
    const updatedResponses = { ...event.responses, [userId]: responseData };
    const updates: Record<string, any> = { pendingInvite: deleteField(), updatedAt: Timestamp.now() };

    if (response === 'confirmed') {
      const confirmedCount = Object.values(updatedResponses).filter(
        (r: any) => r.response === 'confirmed'
      ).length;
      updates.responses = updatedResponses;
      updates.confirmedCount = confirmedCount;
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
  const confirmedCount = Object.values(updatedResponses).filter(
    (r: any) => r.response === 'confirmed'
  ).length;
  const updates: Record<string, any> = { responses: updatedResponses, confirmedCount, updatedAt: Timestamp.now() };
  if (Array.isArray(event.waitlist) && event.waitlist.includes(targetUserId)) {
    updates.waitlist = event.waitlist.filter(id => id !== targetUserId);
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

// More event functions will be added in future phases
