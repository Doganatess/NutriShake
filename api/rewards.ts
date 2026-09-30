import type { Request, Response } from 'express';
import { consumeRewardCredit, getRewardCredits, grantRewardCredit } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const session = await requireAccount(req, res);
      if (!session) return;
      return res.status(200).json({ credits: await getRewardCredits(session.account.id) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'consume') {
      const session = await requireAccount(req, res);
      if (!session) return;
      return res.status(200).json({ credits: await consumeRewardCredit(session.account.id) });
    }

    if (body.action === 'grant') {
      const secret = process.env.REWARD_WEBHOOK_SECRET;
      const supplied = String(req.headers['x-reward-verification'] || '');
      if (!secret || supplied !== secret) return res.status(403).json({ error: 'Ödül doğrulaması başarısız.' });
      const userId = String(body.userId || '');
      if (!userId) return res.status(400).json({ error: 'userId gerekli.' });
      return res.status(200).json({ credits: await grantRewardCredit(userId) });
    }

    return res.status(400).json({ error: 'Geçersiz reward işlemi.' });
  } catch (error) {
    console.error('Rewards API error:', error);
    return res.status(503).json({ error: 'Reward servisi şu anda yapılandırılmamış veya kullanılamıyor.' });
  }
}
