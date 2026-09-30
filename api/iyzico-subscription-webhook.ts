import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAccountBySubscription, updateEntitlement } from '../src/server/accountStore.js';

function validSignature(req: Request, body: Record<string, unknown>): boolean {
  const merchantId = process.env.IYZICO_MERCHANT_ID;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  const supplied = String(req.headers['x-iyz-signature-v3'] || '');
  if (!merchantId || !secretKey || !supplied) return false;
  const message = merchantId + secretKey + String(body.iyziEventType || '') + String(body.subscriptionReferenceCode || '') + String(body.orderReferenceCode || '') + String(body.customerReferenceCode || '');
  const expected = createHmac('sha256', secretKey).update(message).digest('hex');
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (!validSignature(req, body)) return res.status(403).json({ error: 'iyzico webhook imzası doğrulanamadı.' });

    const subscriptionId = String(body.subscriptionReferenceCode || '');
    const account = await getAccountBySubscription(subscriptionId);
    if (!account) return res.status(200).json({ ok: true, ignored: true });

    const eventType = String(body.iyziEventType || '');
    const success = eventType === 'subscription.order.success';
    const failure = eventType === 'subscription.order.failure';
    if (!success && !failure) return res.status(200).json({ ok: true, ignored: true });

    await updateEntitlement(account.id, {
      ...account.entitlement,
      plan: success ? 'premium' : 'free',
      status: success ? 'active' : 'expired',
      provider: 'iyzico',
      customerId: String(body.customerReferenceCode || account.entitlement.customerId || ''),
      subscriptionId,
      expiresAt: success ? account.entitlement.expiresAt : new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('iyzico subscription webhook error:', error);
    return res.status(503).json({ error: 'iyzico webhook işlenemedi.' });
  }
}
