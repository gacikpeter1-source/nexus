/**
 * Rink Schedule — a club-wide ice-time/room schedule, managed separately from
 * the regular Calendar but published into it. One document per club
 * (doc id === clubId): the whole `halls`/`entries` set is replaced wholesale
 * on every save, matching how this schedule is actually maintained in
 * practice (re-uploaded/re-edited as a whole, not merged incrementally).
 *
 * Saving also (re)publishes every entry as a recurring calendar event: matched
 * by name to a real team when possible (so RSVP/attendance keeps working and
 * it shows on that team's own calendar), otherwise a club-wide event with no
 * team. Every previously auto-published event for this club is deleted and
 * recreated on each save — tagged `autoPublishedBy: 'rinkSchedule'` so this
 * cleanup never touches an event a trainer created by hand elsewhere.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Club, RinkHall, RinkSchedule, RinkScheduleEntry } from '../../types';

export async function getRinkSchedule(clubId: string): Promise<RinkSchedule | null> {
  const snap = await getDoc(doc(db, 'rinkSchedules', clubId));
  if (!snap.exists()) return null;
  return snap.data() as RinkSchedule;
}

function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

/** Case-insensitive match against the club's real teams — a miss is fine, the entry just publishes club-wide. */
function matchTeamId(name: string, club: Club): string | undefined {
  const target = name.trim().toLowerCase();
  const team = (club.teams || []).find(t => t.name.trim().toLowerCase() === target);
  return team?.id;
}

export async function saveRinkSchedule(
  club: Club,
  halls: RinkHall[],
  entries: Omit<RinkScheduleEntry, 'teamId' | 'eventId'>[],
  updatedBy: string
): Promise<void> {
  const clubId = club.id;
  const batch = writeBatch(db);

  // Remove every previously auto-published event for this club before
  // recreating — a wholesale replace, not an incremental merge.
  const staleSnap = await getDocs(
    query(
      collection(db, 'events'),
      where('clubId', '==', clubId),
      where('autoPublishedBy', '==', 'rinkSchedule')
    )
  );
  staleSnap.docs.forEach(d => batch.delete(d.ref));

  const publishedEntries: RinkScheduleEntry[] = entries.map(entry => {
    const teamId = matchTeamId(entry.name, club);
    const eventRef = doc(collection(db, 'events'));

    const hall = halls.find(h => h.id === entry.hallId);
    const description = hall ? `Rink schedule · ${hall.name}` : 'Rink schedule';

    batch.set(eventRef, {
      id: eventRef.id,
      title: entry.name,
      description,
      type: teamId ? 'team' : 'club',
      visibilityLevel: teamId ? 'team' : 'club',
      clubId,
      ...(teamId ? { teamId } : {}),
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      duration: Math.max(minutesBetween(entry.startTime, entry.endTime), 0),
      ...(entry.room ? { location: entry.room } : {}),
      isRecurring: entry.isRecurring,
      ...(entry.isRecurring && entry.recurrenceRule ? { recurrenceRule: entry.recurrenceRule } : {}),
      // Tags this as a rink-schedule-generated event: the next save's cleanup
      // query above only ever touches events carrying this flag, and the
      // per-event-created notification is skipped (see events.ts) since a
      // whole season can be published in one save.
      autoPublishedBy: 'rinkSchedule',
      rinkHallId: entry.hallId,
      createdBy: updatedBy,
      confirmedCount: 0,
      responses: {},
      waitlist: [],
      reminders: [{ id: crypto.randomUUID(), minutesBefore: 60 }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Firestore rejects an explicit `undefined` field value outright — omit
    // teamId entirely rather than setting it to undefined when unmatched.
    return { ...entry, ...(teamId ? { teamId } : {}), eventId: eventRef.id };
  });

  batch.set(doc(db, 'rinkSchedules', clubId), {
    clubId,
    clubName: club.name,
    ...(club.address ? { clubAddress: club.address } : {}),
    halls,
    entries: publishedEntries,
    updatedAt: Timestamp.now(),
    updatedBy,
  });

  await batch.commit();
}

/** Fill in (or change) just one entry's room, without touching anything else in the schedule or re-publishing events. */
export async function updateRinkScheduleEntryRoom(
  clubId: string,
  entryId: string,
  room: string
): Promise<void> {
  const schedule = await getRinkSchedule(clubId);
  if (!schedule) throw new Error('Rink schedule not found');

  const entries = schedule.entries.map(e => (e.id === entryId ? { ...e, room } : e));
  await setDoc(
    doc(db, 'rinkSchedules', clubId),
    { entries, updatedAt: Timestamp.now() },
    { merge: true }
  );

  const entry = entries.find(e => e.id === entryId);
  if (entry?.eventId) {
    await updateDoc(doc(db, 'events', entry.eventId), {
      location: room,
      updatedAt: Timestamp.now(),
    });
  }
}
