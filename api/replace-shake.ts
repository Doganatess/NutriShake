import type { Request, Response } from 'express';
import { replaceSingleShake } from '../src/server/geminiService';

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

  const {
    targetKcal,
    currentShakeName,
    portionPreference,
    mandatoryIngredientIds,
    allowedIngredientIds,
    forbiddenIngredientIds,
    otherShakesNames,
    userPreferences,
    dislikedShakeNames,
  } = body;

  try {
    const newShake = await replaceSingleShake({
      targetKcal: Number(targetKcal) || 500,
      currentShakeName: currentShakeName || 'Mevcut Shake',
      portionPreference: portionPreference || 'medium',
      mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
      allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
      forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
      otherShakesNames: Array.isArray(otherShakesNames) ? otherShakesNames : [],
      userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
      dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
    });
    return res.status(200).json(newShake);
  } catch (error: unknown) {
    console.error('Vercel API error replacing shake:', error);
    const msg = error instanceof Error ? error.message : 'Shake değiştirilemedi';
    return res.status(500).json({
      error: 'Alternatif shake oluşturulamadı.',
      detail: msg,
    });
  }
}
