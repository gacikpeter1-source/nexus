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
  if (req.method !== 'POST') return res.status(405).end();

  const sessionCookie = parseCookie(req.headers.cookie || '', '__nexus_session');
  if (!sessionCookie) return res.status(401).json({ error: 'No session cookie' });

  try {
    initAdmin();

    // Verify cookie and check it hasn't been revoked
    const decoded = await getAuth().verifySessionCookie(sessionCookie, true);

    // Mint a short-lived custom token so the client can sign in
    const customToken = await getAuth().createCustomToken(decoded.uid);

    res.status(200).json({ customToken });
  } catch (err) {
    // Cookie expired or revoked — clear it
    res.setHeader('Set-Cookie', '__nexus_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
    res.status(401).json({ error: 'Invalid session' });
  }
}
