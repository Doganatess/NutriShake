import type { Request, Response } from 'express';
import { accountPublicView, authenticateAccount, createAccount, revokeSession } from '../src/server/accountStore.js';
import { clearSessionCookie, requireAccount, setSessionCookie } from '../src/server/authHttp.js';

function validCredentials(email: unknown, password: unknown): boolean {
  return typeof email === 'string' && email.trim().length >= 5 && typeof password === 'string' && password.length >= 8;
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const session = await requireAccount(req, res);
      if (!session) return;
      return res.status(200).json({ account: accountPublicView(session.account) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;

    if (action === 'logout') {
      const sessionCookie = (req.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith('nutrishake_session='))?.slice('nutrishake_session='.length);
      if (sessionCookie) await revokeSession(decodeURIComponent(sessionCookie));
      clearSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    if (action === 'signup') {
      if (!validCredentials(body.email, body.password)) {
        return res.status(400).json({ error: 'Geçerli bir e-posta ve en az 8 karakterli bir şifre girin.' });
      }
      const result = await createAccount(body.email, body.password);
      setSessionCookie(res, result.sessionToken);
      return res.status(201).json({ account: accountPublicView(result.account) });
    }

    if (action === 'login') {
      if (!validCredentials(body.email, body.password)) {
        return res.status(400).json({ error: 'Geçerli bir e-posta ve şifre girin.' });
      }
      const result = await authenticateAccount(body.email, body.password);
      if (!result) return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
      setSessionCookie(res, result.sessionToken);
      return res.status(200).json({ account: accountPublicView(result.account) });
    }

    return res.status(400).json({ error: 'Geçersiz account işlemi.' });
  } catch (error) {
    console.error('Account API error:', error);
    return res.status(503).json({ error: 'Hesap servisi şu anda yapılandırılmamış veya kullanılamıyor.' });
  }
}
