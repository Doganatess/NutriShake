import type { Request, Response } from 'express';
import { getUsage, consumeUsage } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

const LIMITS: Record<string, number> = {
  free_shake_weekly: 3,
  rewarded_ai_generation_daily: 3,
};

function getPeriod(feature: string): string {
  const now = new Date();
  if (feature.includes('weekly')) {
    const day = now.getUTCDay() || 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
    return monday.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await requireAccount(req, res);
    if (!session) return;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const feature = String(body.feature || req.query.feature || '');
    if (!LIMITS[feature]) return res.status(400).json({ error: 'Geçersiz kullanım özelliği.' });

    const period = getPeriod(feature);
    const premium = session.account.entitlement.plan === 'premium' && session.account.entitlement.status !== 'expired';

    if (req.method === 'GET') {
      const used = await getUsage(session.account.id, feature, period);
      return res.status(200).json({ feature, period, used, limit: premium ? null : LIMITS[feature], unlimited: premium });
    }

    if (req.method === 'POST' && body.action === 'consume') {
      if (premium) return res.status(200).json({ allowed: true, feature, period, used: await getUsage(session.account.id, feature, period), limit: null, unlimited: true });
      const result = await consumeUsage(session.account.id, feature, period, LIMITS[feature]);
      return res.status(result.allowed ? 200 : 429).json({ ...result, feature, period, unlimited: false });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Usage API error:', error);
    return res.status(503).json({ error: 'Kullanım servisi şu anda yapılandırılmamış veya kullanılamıyor.' });
  }
}
