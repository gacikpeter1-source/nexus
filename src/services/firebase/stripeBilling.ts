/**
 * Stripe billing — club owners paying for a subscription by card,
 * alongside the existing voucher-code path (SubscriptionManagement.tsx
 * has both). Checkout and billing management both happen on Stripe's own
 * hosted pages — this file only ever gets a URL back and redirects to
 * it; the app itself never touches card data or needs a publishable key.
 * See functions/src/index.ts's Stripe section for the actual logic.
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import type { StripePricesConfig, SubscriptionPlan } from '../../types';

const createCheckoutSessionFn = httpsCallable<{ clubId: string; plan: SubscriptionPlan }, { url: string }>(functions, 'createCheckoutSession');
const createBillingPortalSessionFn = httpsCallable<{ clubId: string }, { url: string }>(functions, 'createBillingPortalSession');

/** Which plans actually have a Stripe price configured yet — a plan with none just shows no Subscribe button. */
export async function getStripePrices(): Promise<Partial<Record<SubscriptionPlan, string>>> {
  const snap = await getDoc(doc(db, 'config', 'stripePrices'));
  if (!snap.exists()) return {};
  return (snap.data() as StripePricesConfig).prices || {};
}

/** Starts a Stripe Checkout session for the given plan and returns its hosted URL to redirect to. */
export async function startCheckout(clubId: string, plan: SubscriptionPlan): Promise<string> {
  const result = await createCheckoutSessionFn({ clubId, plan });
  return result.data.url;
}

/** Opens Stripe's hosted Billing Portal (cancel, update card, view invoices) for a club that already has a Stripe customer. */
export async function openBillingPortal(clubId: string): Promise<string> {
  const result = await createBillingPortalSessionFn({ clubId });
  return result.data.url;
}

/** Admin-only (see firestore.rules) — sets which Stripe Price id each plan's "Subscribe" button uses. */
export async function setStripePrices(prices: Partial<Record<SubscriptionPlan, string>>): Promise<void> {
  await setDoc(doc(db, 'config', 'stripePrices'), { prices, updatedAt: Timestamp.now() });
}
