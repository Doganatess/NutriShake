import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { grantRewardCredit, markRewardConversion } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

function verifyAyetSignature(details: Record<string, string>): boolean {
  const apiKey = process.env.AYET_PUBLISHER_API_KEY;
  if (!apiKey) return false;
  const source = [
    details.externalIdentifier || '',
    details.currency || '',
    details.conversionId || '',
    details.custom_1 || '',
    details.custom_2 || '',
    details.custom_3 || '',
    details.custom_4 || '',
    details.custom_5 || '',
  ].join('');
  const expected = createHmac('sha1', apiKey).update(source).digest('hex');
  const received = details.signature || '';
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await requireAccount(req, res);
    if (!session) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const details = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
    if (details.externalIdentifier !== session.account.id) return res.status(403).json({ error: 'Reward kullanıcı eşleşmesi başarısız.' });
    if (!verifyAyetSignature(details)) return res.status(403).json({ error: 'Reward imzası doğrulanamadı.' });
    if (details.status && details.status !== 'success') return res.status(400).json({ error: 'Reward tamamlanmamış.' });
    if (details.rewarded !== 'true' && details.rewarded !== '1') return res.status(400).json({ error: 'Reward doğrulanamadı.' });
    if (!details.conversionId) return res.status(400).json({ error: 'Reward conversionId gerekli.' });

    const firstDelivery = await markRewardConversion(session.account.id, details.conversionId);
    if (!firstDelivery) return res.status(200).json({ credits: 0, duplicate: true });
    const credits = await grantRewardCredit(session.account.id);
    return res.status(200).json({ credits });
  } catch (error) {
    console.error('Rewarded ad verification error:', error);
    return res.status(503).json({ error: 'Reward doğrulama servisi şu anda kullanılamıyor.' });
  }
}
