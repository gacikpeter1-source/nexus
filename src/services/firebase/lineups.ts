/**
 * Event Lineup Service
 * Save a trainer-built position/lane lineup onto an event.
 */

import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { EventLineup } from '../../types';

export async function saveEventLineup(
  eventId: string,
  lineup: Omit<EventLineup, 'updatedAt' | 'updatedBy'>,
  updatedBy: string
): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    lineup: {
      ...lineup,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    updatedAt: Timestamp.now(),
  });
}
