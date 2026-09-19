import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import {
  analyzeMealMultiVision,
  checkRateLimit,
  deduplicateRequest,
  getRequestClientKey,
} from '../src/server/aiProvider.js';

const MAX_IMAGES = 4;
const MAX_BASE64_CHARS_PER_IMAGE = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateKey = getRequestClientKey(req, 'analyze-meal');
  if (!checkRateLimit(rateKey, 10)) {
    return res.status(429).json({ error: 'Çok fazla öğün analizi isteği gönderildi. Lütfen biraz sonra tekrar deneyin.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  } else if (!body || typeof body !== 'object') {
    body = {};
  }

  const images = Array.isArray(body.photos) && body.photos.length > 0
    ? body.photos.map((data: unknown) => ({ base64: String(data || ''), mimeType: 'image/jpeg' }))
    : body.imageBase64
      ? [{ base64: String(body.imageBase64), mimeType: String(body.mimeType || 'image/jpeg') }]
      : [];

  if (images.length === 0) {
    return res.status(400).json({ error: 'Görsel verisi eksik.' });
  }
  if (images.length > MAX_IMAGES) {
    return res.status(400).json({ error: `En fazla ${MAX_IMAGES} görsel gönderilebilir.` });
  }
  if (images.some((image) => !ALLOWED_MIME_TYPES.has(image.mimeType))) {
    return res.status(400).json({ error: 'Desteklenmeyen görsel formatı. JPEG, PNG veya WebP kullanın.' });
  }
  if (images.some((image) => image.base64.length === 0 || image.base64.length > MAX_BASE64_CHARS_PER_IMAGE)) {
    return res.status(413).json({ error: 'Görsel boyutu çok büyük.' });
  }

  const requestFingerprint = createHash('sha256')
    .update(JSON.stringify({
      images,
      mealName: body.mealName || '',
      userNotes: body.userNotes || '',
    }))
    .digest('hex');
  const requestKey = `meal:${requestFingerprint}`;

  try {
    const result = await deduplicateRequest(requestKey, () => analyzeMealMultiVision({
      images,
      mealName: typeof body.mealName === 'string' ? body.mealName.slice(0, 200) : undefined,
      userNotes: typeof body.userNotes === 'string' ? body.userNotes.slice(0, 1000) : undefined,
    }));
    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error('Vercel API error analyzing meal:', error);
    return res.status(500).json({
      error: 'Fotoğraftan öğün analiz edilemedi.',
      ...(process.env.NODE_ENV !== 'production' && {
        detail: error instanceof Error ? error.message : 'Öğün analizi hatası',
      }),
    });
  }
}
