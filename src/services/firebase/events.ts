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
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Event as CalendarEvent } from '../../types';

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
export async function updateEvent(eventId: string, eventData: Partial<CalendarEvent>): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    
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
  } catch (error) {
    console.error('❌ Error updating event:', error);
    throw error;
  }
}

// Placeholder functions for future implementation

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
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating event:', error);
    throw error;
  }
}

/**
 * RSVP to an event
 */
export async function rsvpToEvent(
  eventId: string,
  userId: string,
  response: 'confirmed' | 'declined' | 'maybe',
  message?: string
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const event = await getEvent(eventId);
    
    if (!event) {
      throw new Error('Event not found');
    }

    // Update the responses object
    const updatedResponses = {
      ...event.responses,
      [userId]: {
        response,
        timestamp: Timestamp.now(),
        message: message || ''
      }
    };

    // Calculate confirmed count
    const confirmedCount = Object.values(updatedResponses).filter(
      (r: any) => r.response === 'confirmed'
    ).length;

    await updateDoc(eventRef, {
      responses: updatedResponses,
      confirmedCount,
      updatedAt: Timestamp.now()
    });

    console.log('✅ RSVP updated:', eventId, userId, response);
  } catch (error) {
    console.error('❌ Error updating RSVP:', error);
    throw error;
  }
}

/**
 * Cancel RSVP to an event
 */
export async function cancelRsvp(eventId: string, userId: string): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const event = await getEvent(eventId);
    
    if (!event || !event.responses) {
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
  } catch (error) {
    console.error('❌ Error cancelling RSVP:', error);
    throw error;
  }
}

/**
 * Get user's RSVP status for an event
 */
export async function getUserRsvpStatus(eventId: string, userId: string): Promise<string | null> {
  try {
    const event = await getEvent(eventId);
    if (!event || !event.responses || !event.responses[userId]) {
      return null;
    }
    return event.responses[userId].response;
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
export async function deleteEvent(eventId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'events', eventId));
    console.log('✅ Event deleted:', eventId);
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
 * Promote next person from waitlist (when space becomes available)
 */
export async function promoteFromWaitlist(eventId: string): Promise<string | null> {
  try {
    const event = await getEvent(eventId);
    if (!event || !event.waitlist || event.waitlist.length === 0) {
      return null;
    }

    // Get first person in waitlist
    const nextUserId = event.waitlist[0];

    // Remove from waitlist and add to RSVP yes
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      waitlist: arrayRemove(nextUserId),
      rsvpYes: arrayUnion(nextUserId)
    });

    console.log('✅ User promoted from waitlist:', nextUserId);
    return nextUserId;
  } catch (error) {
    console.error('❌ Error promoting from waitlist:', error);
    throw error;
  }
}

// More event functions will be added in future phases
