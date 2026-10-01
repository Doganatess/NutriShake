import type { Request, Response } from 'express';
import { getAccount, getUserIdFromSession } from './accountStore.js';

const COOKIE_NAME = 'nutrishake_session';

export function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`);
}

function assertSameOrigin(req: Request, res: Response): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const origin = String(req.headers.origin || '');
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  const hostOrigin = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  if (!origin) return true;
  const allowed = new Set([configured, hostOrigin].filter(Boolean));
  if (allowed.has(origin)) return true;
  res.status(403).json({ error: 'İstek kaynağı doğrulanamadı.' });
  return false;
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function requireAccount(req: Request, res: Response) {
  if (!assertSameOrigin(req, res)) return null;
  const cookie = getCookie(req, COOKIE_NAME);
  if (!cookie) {
    res.status(401).json({ error: 'Oturum gerekli.' });
    return null;
  }
  const userId = await getUserIdFromSession(cookie);
  if (!userId) {
    res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
    return null;
  }
  const account = await getAccount(userId);
  if (!account) {
    res.status(401).json({ error: 'Hesap bulunamadı.' });
    return null;
  }
  return { account, sessionCookie: cookie };
}
