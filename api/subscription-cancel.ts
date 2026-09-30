import type { Request, Response } from 'express';
import { cancelSubscription } from '../src/server/iyzico.js';
import { updateEntitlement } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await requireAccount(req, res);
    if (!session) return;
    const subscriptionId = session.account.entitlement.subscriptionId;
    if (!subscriptionId || session.account.entitlement.provider !== 'iyzico') {
      return res.status(409).json({ error: 'Aktif iyzico aboneliği bulunamadı.' });
    }
    await cancelSubscription(subscriptionId);
    await updateEntitlement(session.account.id, {
      ...session.account.entitlement,
      plan: 'premium',
      status: 'active',
      provider: 'iyzico',
      cancelAtPeriodEnd: true,
    });
    return res.status(200).json({ ok: true, entitlement: session.account.entitlement });
  } catch (error) {
    console.error('Subscription cancel error:', error);
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Abonelik iptal edilemedi.' });
  }
}
