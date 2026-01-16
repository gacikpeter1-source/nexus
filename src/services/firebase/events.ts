/**
 * Firebase Service: Events & Calendar
 * CRUD operations for events collection
 * Based on: docs/02-database-schema.md, docs/03-calendar-system.md
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { CalendarEvent } from '../../types';

/**
 * Create a new event
 */
export async function createEvent(eventData: {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: 'personal' | 'team' | 'club';
  clubId?: string;
  teamId?: string;
  createdBy: string;
  location?: string;
  rsvpRequired?: boolean;
  rsvpDeadline?: string;
  maxParticipants?: number;
  isRecurring?: boolean;
  recurrenceRule?: string;
  lockPeriodStart?: string;
  lockPeriodEnd?: string;
}): Promise<string> {
  try {
    const eventRef = doc(collection(db, 'events'));

    const newEvent: Partial<CalendarEvent> = {
      title: eventData.title,
      description: eventData.description || '',
      date: eventData.date,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      type: eventData.type,
      clubId: eventData.clubId,
      teamId: eventData.teamId,
      createdBy: eventData.createdBy,
      location: eventData.location,
      rsvpRequired: eventData.rsvpRequired || false,
      rsvpDeadline: eventData.rsvpDeadline,
      maxParticipants: eventData.maxParticipants,
      participants: [],
      rsvpYes: [],
      rsvpNo: [],
      rsvpMaybe: [],
      isRecurring: eventData.isRecurring || false,
      recurrenceRule: eventData.recurrenceRule,
      lockPeriodStart: eventData.lockPeriodStart,
      lockPeriodEnd: eventData.lockPeriodEnd,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(eventRef, newEvent);
    return eventRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

/**
 * Get event by ID
 */
export async function getEvent(eventId: string): Promise<CalendarEvent | null> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);

    if (eventDoc.exists()) {
      return {
        id: eventDoc.id,
        ...eventDoc.data(),
      } as CalendarEvent;
    }

    return null;
  } catch (error) {
    console.error('Error getting event:', error);
    throw error;
  }
}

/**
 * Get events for a club
 */
export async function getClubEvents(clubId: string): Promise<CalendarEvent[]> {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('clubId', '==', clubId),
      orderBy('date', 'asc')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as CalendarEvent[];
  } catch (error) {
    console.error('Error getting club events:', error);
    throw error;
  }
}

/**
 * Get events for a team
 */
export async function getTeamEvents(teamId: string): Promise<CalendarEvent[]> {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('teamId', '==', teamId),
      orderBy('date', 'asc')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as CalendarEvent[];
  } catch (error) {
    console.error('Error getting team events:', error);
    throw error;
  }
}

/**
 * Get personal events for a user
 */
export async function getUserEvents(userId: string): Promise<CalendarEvent[]> {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('createdBy', '==', userId),
      where('type', '==', 'personal'),
      orderBy('date', 'asc')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as CalendarEvent[];
  } catch (error) {
    console.error('Error getting user events:', error);
    throw error;
  }
}

/**
 * Get events by date range
 */
export async function getEventsByDateRange(
  clubId: string,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('clubId', '==', clubId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as CalendarEvent[];
  } catch (error) {
    console.error('Error getting events by date range:', error);
    throw error;
  }
}

/**
 * Update event
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

/**
 * Delete event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await deleteDoc(eventRef);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

/**
 * RSVP to event
 */
export async function rsvpToEvent(
  eventId: string,
  userId: string,
  response: 'yes' | 'no' | 'maybe'
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);

    if (!eventDoc.exists()) {
      throw new Error('Event not found');
    }

    // Remove user from all RSVP lists first
    const updates: any = {
      rsvpYes: arrayRemove(userId),
      rsvpNo: arrayRemove(userId),
      rsvpMaybe: arrayRemove(userId),
      updatedAt: Timestamp.now(),
    };

    await updateDoc(eventRef, updates);

    // Add to appropriate list
    const addUpdate: any = {
      updatedAt: Timestamp.now(),
    };

    if (response === 'yes') {
      addUpdate.rsvpYes = arrayUnion(userId);
      addUpdate.participants = arrayUnion(userId);
    } else if (response === 'no') {
      addUpdate.rsvpNo = arrayUnion(userId);
      addUpdate.participants = arrayRemove(userId);
    } else if (response === 'maybe') {
      addUpdate.rsvpMaybe = arrayUnion(userId);
    }

    await updateDoc(eventRef, addUpdate);
  } catch (error) {
    console.error('Error RSVP to event:', error);
    throw error;
  }
}

/**
 * Cancel RSVP
 */
export async function cancelRsvp(eventId: string, userId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      rsvpYes: arrayRemove(userId),
      rsvpNo: arrayRemove(userId),
      rsvpMaybe: arrayRemove(userId),
      participants: arrayRemove(userId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error canceling RSVP:', error);
    throw error;
  }
}

/**
 * Add participant to event
 */
export async function addParticipant(
  eventId: string,
  userId: string
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      participants: arrayUnion(userId),
      rsvpYes: arrayUnion(userId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    throw error;
  }
}

/**
 * Remove participant from event
 */
export async function removeParticipant(
  eventId: string,
  userId: string
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      participants: arrayRemove(userId),
      rsvpYes: arrayRemove(userId),
      rsvpNo: arrayRemove(userId),
      rsvpMaybe: arrayRemove(userId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    throw error;
  }
}

/**
 * Check if user has RSVP'd to event
 */
export async function getUserRsvpStatus(
  eventId: string,
  userId: string
): Promise<'yes' | 'no' | 'maybe' | null> {
  try {
    const event = await getEvent(eventId);
    if (!event) return null;

    if (event.rsvpYes?.includes(userId)) return 'yes';
    if (event.rsvpNo?.includes(userId)) return 'no';
    if (event.rsvpMaybe?.includes(userId)) return 'maybe';

    return null;
  } catch (error) {
    console.error('Error getting user RSVP status:', error);
    throw error;
  }
}

/**
 * Check if event is in lock period
 */
export function isEventLocked(calendarEvent: CalendarEvent): boolean {
  if (!calendarEvent.lockPeriodStart || !calendarEvent.lockPeriodEnd) return false;

  const now = new Date();
  const lockStart = new Date(calendarEvent.lockPeriodStart);
  const lockEnd = new Date(calendarEvent.lockPeriodEnd);

  return now >= lockStart && now <= lockEnd;
}

/**
 * Check if RSVP deadline has passed
 */
export function isRsvpDeadlinePassed(calendarEvent: CalendarEvent): boolean {
  if (!calendarEvent.rsvpDeadline) return false;

  const now = new Date();
  const deadline = new Date(calendarEvent.rsvpDeadline);

  return now > deadline;
}

/**
 * Check if event is full
 */
export function isEventFull(calendarEvent: CalendarEvent): boolean {
  if (!calendarEvent.maxParticipants) return false;

  return (calendarEvent.rsvpYes?.length || 0) >= calendarEvent.maxParticipants;
}

