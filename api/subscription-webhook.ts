import type { Request, Response } from 'express';
import { updateEntitlement } from '../src/server/accountStore.js';
import type { ServerEntitlement } from '../src/server/accountStore.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.SUBSCRIPTION_WEBHOOK_SECRET;
  const supplied = String(req.headers['x-subscription-webhook-secret'] || '');
  if (!secret || supplied !== secret) return res.status(403).json({ error: 'Webhook doğrulaması başarısız.' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const userId = String(body.userId || '');
    const entitlement = body.entitlement as Partial<ServerEntitlement> | undefined;
    if (!userId || !entitlement?.plan || !entitlement.status) {
      return res.status(400).json({ error: 'userId ve entitlement.plan/status gerekli.' });
    }

    const next: ServerEntitlement = {
      plan: entitlement.plan,
      status: entitlement.status,
      trialStartedAt: entitlement.trialStartedAt,
      trialExpiresAt: entitlement.trialExpiresAt,
      expiresAt: entitlement.expiresAt,
      provider: entitlement.provider,
      productId: entitlement.productId,
      customerId: entitlement.customerId,
      subscriptionId: entitlement.subscriptionId,
      currentPeriodStart: entitlement.currentPeriodStart,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    };

    const account = await updateEntitlement(userId, next);
    return res.status(200).json({ ok: true, userId: account.id, entitlement: account.entitlement });
  } catch (error) {
    console.error('Subscription webhook error:', error);
    return res.status(503).json({ error: 'Subscription store şu anda yapılandırılmamış veya kullanılamıyor.' });
  }
}
