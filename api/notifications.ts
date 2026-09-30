import type { Request, Response } from 'express';
import { requireAccount } from '../src/server/authHttp.js';
import { saveNotificationSubscription, removeNotificationSubscription } from '../src/server/accountStore.js';

export default async function handler(req: Request, res: Response) {
  try {
    const session = await requireAccount(req, res);
    if (!session) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const action = req.body?.action;
    if (action === 'subscribe' && req.body?.subscription) {
      await saveNotificationSubscription(session.account.id, req.body.subscription);
      return res.status(200).json({ ok: true });
    }
    if (action === 'unsubscribe') {
      await removeNotificationSubscription(session.account.id);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Geçersiz bildirim işlemi.' });
  } catch (error) {
    console.error('[Notifications API]', error);
    return res.status(500).json({ error: 'Bildirim ayarı kaydedilemedi.' });
  }
}
