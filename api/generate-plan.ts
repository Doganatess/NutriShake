import type { Request, Response } from 'express';
import { generateDailyShakePlan } from '../src/server/geminiService';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
  } = req.body;

  try {
    const plan = await generateDailyShakePlan({
      date: date || new Date().toISOString().split('T')[0],
      dailyGoalKcal: Number(dailyGoalKcal) || 2000,
      consumedMealsKcal: Number(consumedMealsKcal) || 0,
      remainingKcalNeeded: Number(remainingKcalNeeded) || 800,
      shakeCount: Math.min(2, Math.max(1, Number(shakeCount) || 1)),
      portionPreference: portionPreference || 'medium',
      mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
      allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
      forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
      userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
      dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
      favoriteShakeNames: Array.isArray(favoriteShakeNames) ? favoriteShakeNames : [],
    });
    return res.status(200).json(plan);
  } catch (error: unknown) {
    console.error('Vercel API error generating plan:', error);
    const msg = error instanceof Error ? error.message : 'Plan oluşturulamadı';
    return res.status(500).json({
      error: 'Günlük shake planı oluşturulamadı.',
      detail: msg,
    });
  }
}
