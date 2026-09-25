import type { Request, Response } from 'express';
import { generateDailyShakePlan, generateDeterministicDailyPlan } from '../src/server/geminiService.js';
import { checkRateLimit, deduplicateRequest, getRequestClientKey } from '../src/server/aiProvider.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateKey = getRequestClientKey(req, 'generate-plan');
  if (!checkRateLimit(rateKey, 20)) {
    return res.status(429).json({ error: 'Çok fazla plan oluşturma isteği gönderildi. Lütfen biraz sonra tekrar deneyin.' });
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
    date,
    dailyGoalKcal,
    consumedMealsKcal,
    remainingKcalNeeded,
    shakeCount,
    portionPreference,
    mandatoryIngredientIds,
    allowedIngredientIds,
    forbiddenIngredientIds,
    userPreferences,
    dislikedShakeNames,
    favoriteShakeNames,
    userStock,
  } = body;

  const planParams = {
    date: date || new Date().toISOString().split('T')[0],
    // Daily goal is the whole-day target; remainingKcalNeeded is the shake planner input.
    dailyGoalKcal: Math.max(0, Number(dailyGoalKcal) || 0),
    consumedMealsKcal: Number(consumedMealsKcal) || 0,
    remainingKcalNeeded: Math.max(0, Number(remainingKcalNeeded) || 0),
    shakeCount: Math.min(2, Math.max(1, Number(shakeCount) || 1)),
    portionPreference: portionPreference || 'medium',
    mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
    allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
    forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
    userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
    dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
    favoriteShakeNames: Array.isArray(favoriteShakeNames) ? favoriteShakeNames : [],
    userStock: userStock && typeof userStock === 'object' ? userStock : undefined,
    remainingProtein: Number.isFinite(Number(body.remainingProtein)) ? Math.max(0, Number(body.remainingProtein)) : undefined,
    remainingCarbs: Number.isFinite(Number(body.remainingCarbs)) ? Math.max(0, Number(body.remainingCarbs)) : undefined,
    remainingFat: Number.isFinite(Number(body.remainingFat)) ? Math.max(0, Number(body.remainingFat)) : undefined,
  };

  try {
    const cacheKey = `generate-plan:${JSON.stringify(planParams)}`;
    const plan = await deduplicateRequest(cacheKey, () => generateDailyShakePlan(planParams));
    return res.status(200).json(plan);
  } catch (error: unknown) {
    console.warn('[API generate-plan] AI plan generation failed or returned non-JSON, switching to deterministic fallback:', error);
    try {
      const fallbackPlan = generateDeterministicDailyPlan(planParams);
      return res.status(200).json(fallbackPlan);
    } catch (fallbackError: unknown) {
      console.error('Deterministic fallback also failed in API:', fallbackError);
      const msg = fallbackError instanceof Error ? fallbackError.message : 'Plan oluşturulamadı';
      return res.status(500).json({
        error: 'Günlük shake planı oluşturulamadı.',
        ...(process.env.NODE_ENV !== 'production' && { detail: msg }),
      });
    }
  }
}
