/**
 * Player Cards Service
 * One card per athlete (real user or child) per team — position, handedness,
 * jersey number, photo. Game stats (goals/assists/etc.) are computed from
 * Nomination data, not stored here.
 */

import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { PlayerCard, PlayerPosition, PlayerHandedness } from '../../types';

function cardId(teamId: string, athleteId: string): string {
  return `${teamId}_${athleteId}`;
}

export async function getTeamPlayerCards(clubId: string, teamId: string): Promise<PlayerCard[]> {
  const snap = await getDocs(
    query(
      collection(db, 'playerCards'),
      where('clubId', '==', clubId),
      where('teamId', '==', teamId)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlayerCard);
}

export interface PlayerCardUpdates {
  position?: PlayerPosition | null;
  handedness?: PlayerHandedness | null;
  jerseyNumber?: number | null;
  photoURL?: string | null;
  photoStoragePath?: string | null;
}

export async function upsertPlayerCard(
  clubId: string,
  teamId: string,
  athleteId: string,
  updates: PlayerCardUpdates,
  updatedBy: string
): Promise<void> {
  const payload: Record<string, any> = {
    clubId,
    teamId,
    athleteId,
    updatedAt: serverTimestamp(),
    updatedBy,
  };

  if (updates.position !== undefined) payload.position = updates.position;
  if (updates.handedness !== undefined) payload.handedness = updates.handedness;
  if (updates.jerseyNumber !== undefined) payload.jerseyNumber = updates.jerseyNumber;
  if (updates.photoURL !== undefined) payload.photoURL = updates.photoURL;
  if (updates.photoStoragePath !== undefined) payload.photoStoragePath = updates.photoStoragePath;

  await setDoc(doc(db, 'playerCards', cardId(teamId, athleteId)), payload, { merge: true });
}
