import { Shake, DailyPlan, UserProfile, ShakeTiming, DailyShake } from '../types';
import { composeThreeDistinctDailyShakes, composeDeterministicShake } from '../engines/recipeCompositionEngine';
import { validateMasterRecipe, validateAndSanitizeShake } from '../utils/recipeValidator';
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
 * with pure mathematical calculations from nutritionEngine & recipeValidator, checking all 12 rules.
 */
export class AiService {
  /**
   * Generates a daily shake plan.
   * If server API is accessible, attempts LLM suggestions;
   * Otherwise falls back gracefully to the deterministic engine producing at least 3 candidates.
   */
  static async generateDailyPlan(request: AiPlanRequest): Promise<DailyPlan> {
    const memoryContext = MemorySystem.getMemoryPromptContext();
    const stock = getStoredStock();
    const stockKeys = Object.keys(stock).filter((k) => (stock[k]?.normalizedGramsOrMl || 0) > 0);
    const targetKcal = Math.max(0, request.targetKcal || request.userProfile?.calorieGoal || 0);

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: request.date,
          dailyGoalKcal: targetKcal,
          shakeCount: request.shakeCount || 3,
          availableStockKeys: stockKeys,
          memoryContext,
          allergies: request.userProfile?.allergies || [],
        }),
      });

      if (response.ok) {
        const rawData = await response.json();
        const rawShakes = rawData.candidateShakes || rawData.shakes || [];
        if (Array.isArray(rawShakes) && rawShakes.length > 0) {
          const validCandidates: Shake[] = [];

          for (const raw of rawShakes) {
            const sanitized = validateAndSanitizeShake(raw, {
              targetKcal,
              userStock: stock,
            });

            if (sanitized.sanitizedShake) {
              const masterCheck = validateMasterRecipe(sanitized.sanitizedShake, {
                targetKcal,
                userStock: stock,
              });

              if (masterCheck.isValid) {
                validCandidates.push(sanitized.sanitizedShake);
              }
            }
          }

          if (validCandidates.length > 0) {
            const selectedShake = validCandidates[0];
            const portionKcal = selectedShake.portionCalories || Math.round(selectedShake.estimatedCalories / 2);

            const dailyShake: DailyShake = {
              id: selectedShake.id,
              name: selectedShake.name,
              ingredients: selectedShake.ingredients,
              totalNutrition: {
                calories: selectedShake.estimatedCalories,
                protein: selectedShake.protein,
                carbs: selectedShake.carbs,
                fat: selectedShake.fat,
                fiber: selectedShake.fiber,
              },
              portionCount: 2,
              portions: [
                {
                  portionNumber: 1,
                  name: '1. Öğün',
                  calories: portionKcal,
                  isCompleted: selectedShake.portion1Completed || false,
                },
                {
                  portionNumber: 2,
                  name: '2. Öğün',
                  calories: portionKcal,
                  isCompleted: selectedShake.portion2Completed || false,
                },
              ],
              instructions: selectedShake.instructions,
              preparationTimeMinutes: selectedShake.preparationTimeMinutes,
              whyChosenReasons: selectedShake.whyChosenReasons,
            };

            return {
              date: request.date,
              shakes: [selectedShake],
              dailyShake,
              candidateShakes: validCandidates,
              selectedShakeId: selectedShake.id,
              totalCalories: selectedShake.estimatedCalories,
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

    // Deterministic Fallback: Generates 3 distinct candidates, all strictly adhering to the 12 rules
    const candidates = composeThreeDistinctDailyShakes({
      targetCalories: targetKcal,
      timing: 'morning',
      userProfile: request.userProfile,
      stockOnly: stockKeys.length > 0,
    });

    const selectedShake = candidates[0];
    const portionKcal = selectedShake.portionCalories || Math.round(selectedShake.estimatedCalories / 2);

    const dailyShake: DailyShake = {
      id: selectedShake.id,
      name: selectedShake.name,
      ingredients: selectedShake.ingredients,
      totalNutrition: {
        calories: selectedShake.estimatedCalories,
        protein: selectedShake.protein,
        carbs: selectedShake.carbs,
        fat: selectedShake.fat,
        fiber: selectedShake.fiber,
      },
      portionCount: 2,
      portions: [
        {
          portionNumber: 1,
          name: '1. Öğün',
          calories: portionKcal,
          isCompleted: selectedShake.portion1Completed || false,
        },
        {
          portionNumber: 2,
          name: '2. Öğün',
          calories: portionKcal,
          isCompleted: selectedShake.portion2Completed || false,
        },
      ],
      instructions: selectedShake.instructions,
      preparationTimeMinutes: selectedShake.preparationTimeMinutes,
      whyChosenReasons: selectedShake.whyChosenReasons,
    };

    return {
      date: request.date,
      shakes: [selectedShake],
      dailyShake,
      candidateShakes: candidates,
      selectedShakeId: selectedShake.id,
      totalCalories: selectedShake.estimatedCalories,
      completedCalories: 0,
      isFullyCompleted: false,
      schemaVersion: 2,
    };
  }

  /**
   * Replaces or swaps a single shake with a fresh alternative satisfying all rules.
   */
  static async replaceSingleShake(
    targetKcal: number,
    timing: ShakeTiming,
    userProfile?: UserProfile | null
  ): Promise<Shake> {
    const candidates = composeThreeDistinctDailyShakes({
      targetCalories: Math.max(0, targetKcal || userProfile?.calorieGoal || 0),
      timing,
      userProfile,
    });
    return candidates[1] || candidates[0];
  }
}
