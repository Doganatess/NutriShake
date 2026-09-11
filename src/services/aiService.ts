import { Shake, DailyPlan, UserProfile, ShakeTiming } from '../types';
import { composeDeterministicShake } from '../engines/recipeCompositionEngine';
import { calculateShakeNutrition } from '../engines/nutritionEngine';
import { validateShakeRecipe } from '../engines/recipeValidator';
import { MemorySystem } from './memorySystem';
import { getStoredStock } from '../storage/storageAbstraction';

export interface AiPlanRequest {
  date: string;
  targetKcal: number;
  userProfile?: UserProfile | null;
  shakeCount?: number;
}

/**
 * Two-Layer AI Architecture:
 * Layer 1 (AI Suggestion): Creates creative Turkish names, timing concepts, and culinary ideas.
 * Layer 2 (Deterministic Validation & Nutrition): Overwrites ALL macros, kcal, and quantities
 * with pure mathematical calculations from nutritionEngine & recipeValidator.
 */
export class AiService {
  /**
   * Generates a daily shake plan.
   * If server API is accessible, attempts LLM suggestions;
   * Otherwise falls back gracefully to the deterministic engine.
   */
  static async generateDailyPlan(request: AiPlanRequest): Promise<DailyPlan> {
    const memoryContext = MemorySystem.getMemoryPromptContext();
    const stock = getStoredStock();
    const stockKeys = Object.keys(stock).filter((k) => (stock[k]?.normalizedGramsOrMl || 0) > 0);

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: request.date,
          dailyGoalKcal: request.targetKcal,
          shakeCount: request.shakeCount || 3,
          availableStockKeys: stockKeys,
          memoryContext,
          allergies: request.userProfile?.allergies || [],
        }),
      });

      if (response.ok) {
        const rawData = await response.json();
        if (rawData.shakes && Array.isArray(rawData.shakes)) {
          // LAYER 2: Deterministic Overwrite & Sanitization (1 shake per day -> 2 equal portions)
          const firstShakeRaw = rawData.shakes[0];
          if (firstShakeRaw) {
            const rawIngredients = firstShakeRaw.ingredients || [];
            const nutrition = calculateShakeNutrition(rawIngredients);
            const totalKcal = nutrition.calories;
            const portionKcal = Math.round(totalKcal / 2);

            const verifiedShake: Shake = {
              id: firstShakeRaw.id || `shake_${Date.now()}_0`,
              name: firstShakeRaw.name || 'Günün Dengeli Doğal Shake’i',
              description: firstShakeRaw.description || `Günün 2 eşit porsiyona ayrılmış tek shake tarifi (Porsiyon başı ${portionKcal} kcal).`,
              timing: 'morning',
              ingredients: nutrition.ingredients,
              estimatedCalories: totalKcal,
              protein: nutrition.protein,
              carbs: nutrition.carbs,
              fat: nutrition.fat,
              fiber: nutrition.fiber,
              estimatedCost: nutrition.estimatedCost,
              totalVolumeMl: nutrition.totalVolumeMl,
              instructions: firstShakeRaw.instructions || [
                'Tüm malzemeleri tek seferde blendere ekleyin.',
                'Yüksek devirde 50-60 saniye pürüzsüz kıvama gelene kadar çekin.',
                `Karışımı 2 EŞİT PORSIYONA (${portionKcal} kcal / porsiyon) bölün.`,
                '1. porsiyonu vardiya başında, 2. porsiyonu vardiya sonrası tüketin.',
              ],
              preparationTimeMinutes: 4,
              portionCount: 2,
              portionCalories: portionKcal,
              portionProtein: Math.round((nutrition.protein / 2) * 10) / 10,
              portionCarbs: Math.round((nutrition.carbs / 2) * 10) / 10,
              portionFat: Math.round((nutrition.fat / 2) * 10) / 10,
              portionFiber: Math.round((nutrition.fiber / 2) * 10) / 10,
              portion1Completed: false,
              portion2Completed: false,
              isCompleted: false,
              schemaVersion: 2,
              createdAt: new Date().toISOString(),
            };

            return {
              date: request.date,
              shakes: [verifiedShake],
              totalCalories: totalKcal,
              completedCalories: 0,
              isFullyCompleted: false,
              schemaVersion: 2,
            };
          }
        }
      }
    } catch (e) {
      console.warn('AI API call failed or offline, falling back to Deterministic Engine:', e);
    }

    // Deterministic Fallback: Exactly 1 single shake / day -> 2 equal portions
    const singleShake = composeDeterministicShake({
      targetCalories: request.targetKcal || 1000,
      timing: 'morning',
      userProfile: request.userProfile,
      stockOnly: stockKeys.length > 0,
    });

    return {
      date: request.date,
      shakes: [singleShake],
      totalCalories: singleShake.estimatedCalories,
      completedCalories: 0,
      isFullyCompleted: false,
      schemaVersion: 2,
    };
  }

  /**
   * Replaces or swaps a single shake with a fresh alternative.
   */
  static async replaceSingleShake(
    targetKcal: number,
    timing: ShakeTiming,
    userProfile?: UserProfile | null
  ): Promise<Shake> {
    return composeDeterministicShake({
      targetCalories: targetKcal,
      timing,
      userProfile,
    });
  }
}
