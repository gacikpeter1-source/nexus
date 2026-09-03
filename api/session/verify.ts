import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  return cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='))
    ?.slice(name.length + 1);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Everything (including the cookie check) is wrapped, and every response
  // path is a definite status + JSON body — this endpoint is polled by
  // every logged-out page load (see AuthContext.tsx), so it must never
  // bubble up an unhandled exception as a raw 500.
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const sessionCookie = parseCookie(req.headers.cookie || '', '__nexus_session');
    if (!sessionCookie) return res.status(401).json({ error: 'No session cookie' });

    initAdmin();

    // Verify cookie and check it hasn't been revoked
    const decoded = await getAuth().verifySessionCookie(sessionCookie, true);

    // Mint a short-lived custom token so the client can sign in
    const customToken = await getAuth().createCustomToken(decoded.uid);

    res.status(200).json({ customToken });
  } catch (err) {
    console.error('session/verify error:', err);
    // Cookie expired/revoked, or something else went wrong — either way,
    // clear it and make the client fall through to the normal login page
    // rather than get stuck retrying a broken session.
    res.setHeader('Set-Cookie', '__nexus_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
    res.status(401).json({ error: 'Invalid session' });
  }
}
