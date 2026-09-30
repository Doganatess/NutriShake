import type { Request, Response } from 'express';
import { initializeSubscriptionCheckout } from '../src/server/iyzico.js';
import { requireAccount } from '../src/server/authHttp.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await requireAccount(req, res);
    if (!session) return;
    if (session.account.entitlement.plan === 'premium' && session.account.entitlement.status === 'active') {
      return res.status(409).json({ error: 'Hesabınız zaten Premium.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = String(body.name || '').trim();
    const surname = String(body.surname || '').trim();
    const gsmNumber = String(body.gsmNumber || '').trim();
    if (!name || !surname || !gsmNumber) {
      return res.status(400).json({ error: 'Ödeme için ad, soyad ve telefon numarası gerekli.' });
    }

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${appUrl.replace(/\/$/, '')}/api/subscription-callback`;
    const result = await initializeSubscriptionCheckout({
      email: session.account.email,
      name,
      surname,
      gsmNumber,
      callbackUrl,
      userId: session.account.id,
    });

    return res.status(200).json({
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      conversationId: result.conversationId,
    });
  } catch (error) {
    console.error('Subscription checkout error:', error);
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Ödeme başlatılamadı.' });
  }
}
