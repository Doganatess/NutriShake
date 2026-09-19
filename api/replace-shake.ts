import type { Request, Response } from 'express';
import { replaceSingleShake } from '../src/server/geminiService.js';
import { DAILY_TARGET_KCAL } from '../src/constants/calorieTargets.js';
import { checkRateLimit, deduplicateRequest, getRequestClientKey } from '../src/server/aiProvider.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateKey = getRequestClientKey(req, 'replace-shake');
  if (!checkRateLimit(rateKey, 30)) {
    return res.status(429).json({ error: 'Çok fazla shake değiştirme isteği gönderildi. Lütfen biraz sonra tekrar deneyin.' });
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
    userStock,
  } = body;

  try {
    const replaceParams = {
      // FIX: previously defaulted to 500 kcal (a leftover from an old multi-shake-per-day
      // model) and never enforced a floor. Now it can never fall below DAILY_TARGET_KCAL.
      targetKcal: Math.max(DAILY_TARGET_KCAL, Number(targetKcal) || 0),
      currentShakeName: currentShakeName || 'Mevcut Shake',
      portionPreference: portionPreference || 'medium',
      mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
      allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
      forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
      otherShakesNames: Array.isArray(otherShakesNames) ? otherShakesNames : [],
      userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
      dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
      userStock: userStock && typeof userStock === 'object' ? userStock : undefined,
    };
    const cacheKey = `replace-shake:${JSON.stringify(replaceParams)}`;
    const newShake = await deduplicateRequest(cacheKey, () => replaceSingleShake(replaceParams));
    return res.status(200).json(newShake);
  } catch (error: unknown) {
    console.error('Vercel API error replacing shake:', error);
    const msg = error instanceof Error ? error.message : 'Shake değiştirilemedi';
    return res.status(500).json({
      error: 'Alternatif shake oluşturulamadı.',
      ...(process.env.NODE_ENV !== 'production' && { detail: msg }),
    });
  }
}
