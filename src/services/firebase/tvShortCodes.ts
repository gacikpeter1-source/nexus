/**
 * Short numeric codes that stand in for the long /tv/{tournamentId} URL —
 * meant to be typed by hand into a smart TV's on-screen keyboard, often by
 * someone with no Nexus account at all (a barista, rink staff). /t/:code
 * (TvShortLink.tsx) resolves the code and redirects to the real board.
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 8;

function randomCode(): string {
  const min = 10 ** (CODE_LENGTH - 1);
  const max = 10 ** CODE_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/**
 * Mint a new short code for a tournament, retrying on the very unlikely
 * chance of a collision with an existing one.
 */
export async function createTvShortCode(tournamentId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    const ref = doc(db, 'tvShortCodes', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, { tournamentId, createdAt: Timestamp.now() });
    return code;
  }
  throw new Error('Failed to generate a unique TV short code — please try again');
}

/** Look up the tournament a short code points to (null if it doesn't exist). */
export async function resolveTvShortCode(code: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'tvShortCodes', code));
  if (!snap.exists()) return null;
  return (snap.data().tournamentId as string) || null;
}
