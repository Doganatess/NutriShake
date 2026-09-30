import type { Request, Response } from 'express';
import { retrieveSubscriptionCheckout } from '../src/server/iyzico.js';
import { updateEntitlement } from '../src/server/accountStore.js';

function redirectUrl(req: Request, status: string) {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${appUrl.replace(/\/$/, '')}/?subscription=${encodeURIComponent(status)}`;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const token = String(req.body?.token || req.query?.token || '');
    if (!token) return res.status(400).send('Ödeme tokenı bulunamadı.');

    const result = await retrieveSubscriptionCheckout(token);
    const data = result?.data || {};
    const conversationId = String(result?.conversationId || '');
    const match = conversationId.match(/^nutrishake:([^:]+):/);
    const userId = match?.[1] || null;

    // iyzico callback does not echo our internal user id reliably. The checkout
    // token is therefore only used to verify the payment here; entitlement
    // synchronization is completed by the signed subscription webhook.
    const successful = result?.status === 'success' && ['ACTIVE', 'PENDING'].includes(String(data?.subscriptionStatus || ''));
    if (successful && userId) {
      await updateEntitlement(userId, {
        plan: 'premium',
        status: 'active',
        provider: 'iyzico',
        productId: String(data?.pricingPlanReferenceCode || ''),
        customerId: String(data?.customerReferenceCode || ''),
        subscriptionId: String(data?.referenceCode || ''),
        currentPeriodStart: data?.startDate ? new Date(Number(data.startDate)).toISOString() : undefined,
        currentPeriodEnd: data?.endDate ? new Date(Number(data.endDate)).toISOString() : undefined,
      });
    }

    return res.redirect(303, redirectUrl(req, successful ? 'success' : 'failed'));
  } catch (error) {
    console.error('Subscription callback error:', error);
    return res.redirect(303, redirectUrl(req, 'failed'));
  }
}
