/**
 * App owner's own contact QR — shown on every standalone tournament's TV
 * board (see TournamentTV.tsx), not something individual clubs configure.
 * World-readable (the TV board needs no login), admin-only to write.
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { CommercialQrConfig } from '../../types';

export async function getCommercialQrConfig(): Promise<CommercialQrConfig | null> {
  const snap = await getDoc(doc(db, 'config', 'commercialQr'));
  return snap.exists() ? (snap.data() as CommercialQrConfig) : null;
}

/** Admin-only (see firestore.rules). */
export async function setCommercialQrConfig(config: { enabled: boolean; phone: string; label: string }): Promise<void> {
  await setDoc(doc(db, 'config', 'commercialQr'), { ...config, updatedAt: Timestamp.now() });
}
