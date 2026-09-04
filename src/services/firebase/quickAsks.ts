/**
 * Firebase Quick Ask Service
 * A one-question, real-time ask to a team (e.g. "who can attend training
 * right now?") — see QuickAsk in types/index.ts for why this is separate
 * from Orders.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { QuickAsk, QuickAskChoice } from '../../types';
import { NotificationManager } from '../notifications/NotificationManager';

/**
 * Create a quick ask and notify every team member (data-only push, same
 * pipeline as every other notification — see NotificationManager).
 */
export async function createQuickAsk(data: {
  clubId: string;
  teamId: string;
  createdBy: string;
  creatorName: string;
  question: string;
}): Promise<string> {
  const ref = collection(db, 'clubs', data.clubId, 'quickAsks');

  const newQuickAsk: Omit<QuickAsk, 'id'> = {
    clubId: data.clubId,
    teamId: data.teamId,
    createdBy: data.createdBy,
    creatorName: data.creatorName,
    question: data.question,
    status: 'open',
    responses: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(ref, newQuickAsk);

  try {
    await NotificationManager.onQuickAskCreated({
      quickAskId: docRef.id,
      clubId: data.clubId,
      teamId: data.teamId,
      question: data.question,
      createdBy: data.createdBy,
    });
  } catch (err) {
    console.error('Failed to send quick ask notification:', err);
    // Don't fail creation if the notification fails
  }

  return docRef.id;
}

/** Real-time single quick ask (question + all responses so far). */
export function subscribeToQuickAsk(
  clubId: string,
  quickAskId: string,
  callback: (quickAsk: QuickAsk | null) => void
): Unsubscribe {
  const ref = doc(db, 'clubs', clubId, 'quickAsks', quickAskId);
  return onSnapshot(ref, snapshot => {
    callback(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as QuickAsk) : null);
  });
}

/** Real-time list of a team's quick asks, most recent first. */
export function subscribeToTeamQuickAsks(
  clubId: string,
  teamId: string,
  callback: (quickAsks: QuickAsk[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'clubs', clubId, 'quickAsks'),
    where('teamId', '==', teamId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as QuickAsk));
  });
}

/** Cast/change the caller's own response — only their own key in `responses` changes. */
export async function respondToQuickAsk(
  clubId: string,
  quickAskId: string,
  userId: string,
  choice: QuickAskChoice
): Promise<void> {
  const ref = doc(db, 'clubs', clubId, 'quickAsks', quickAskId);
  await updateDoc(ref, {
    [`responses.${userId}`]: { choice, respondedAt: Timestamp.now() },
    updatedAt: Timestamp.now(),
  });
}

export async function setQuickAskStatus(
  clubId: string,
  quickAskId: string,
  status: QuickAsk['status']
): Promise<void> {
  const ref = doc(db, 'clubs', clubId, 'quickAsks', quickAskId);
  await updateDoc(ref, { status, updatedAt: Timestamp.now() });
}

export async function deleteQuickAsk(clubId: string, quickAskId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'quickAsks', quickAskId));
}
