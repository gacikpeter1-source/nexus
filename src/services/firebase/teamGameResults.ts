/**
 * Read-only client access to teamGameResults — games copied out of a linked
 * standalone tournament by finalizeStandaloneTournamentStats (Cloud
 * Functions). Written server-side only (Admin SDK); see firestore.rules.
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { TeamGameResult } from '../../types';

export async function getTeamGameResults(clubId: string, teamId: string): Promise<TeamGameResult[]> {
  const q = query(
    collection(db, 'teamGameResults'),
    where('clubId', '==', clubId),
    where('teamId', '==', teamId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamGameResult));
}
