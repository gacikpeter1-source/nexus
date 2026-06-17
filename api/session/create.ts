import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { idToken, rememberMe } = req.body as { idToken?: string; rememberMe?: boolean };
  if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

  try {
    initAdmin();

    // 14 days for "remember me", 1 hour otherwise
    const expiresInMs = rememberMe ? 14 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const maxAgeSeconds = expiresInMs / 1000;

    const sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn: expiresInMs });

    res.setHeader(
      'Set-Cookie',
      `__nexus_session=${sessionCookie}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}; Path=/`
    );
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('session/create error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
}
