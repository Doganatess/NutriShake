import type { Request, Response } from 'express';
import { analyzeMealWithVision } from '../src/server/geminiService.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  } else if (!body) {
    body = {};
  }

  const { imageBase64, mimeType, mealName, userNotes } = body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Görsel verisi eksik.' });
  }

  try {
    const result = await analyzeMealWithVision({
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      mealName,
      userNotes,
    });
    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error('Vercel API error analyzing meal:', error);
    const msg = error instanceof Error ? error.message : 'Öğün analizi hatası';
    return res.status(500).json({
      error: 'Fotoğraftan öğün analiz edilemedi.',
      detail: msg,
    });
  }
}
