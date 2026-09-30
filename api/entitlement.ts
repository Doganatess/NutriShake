import type { Request, Response } from 'express';
import { accountPublicView } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await requireAccount(req, res);
    if (!session) return;
    return res.status(200).json({ entitlement: session.account.entitlement, account: accountPublicView(session.account) });
  } catch (error) {
    console.error('Entitlement API error:', error);
    return res.status(503).json({ error: 'Entitlement servisi şu anda kullanılamıyor.' });
  }
}
