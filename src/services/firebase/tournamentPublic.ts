/**
 * Public Tournament Mirror Service
 * Reads tournamentPublic/{nominationId} — a sanitized, world-readable copy
 * of a tournament's bracket, kept in sync by the mirrorTournamentPublicData
 * Cloud Function. Used only by the public, no-login TV/scoreboard page.
 */

import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { PublicTournament } from '../../types';

export function subscribeToPublicTournament(
  nominationId: string,
  callback: (data: PublicTournament | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'tournamentPublic', nominationId), snap => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as PublicTournament) : null);
  });
}
