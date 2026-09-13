import { DailyPlan, Shake, UserProfile, MealAnalysis, DailyShake } from '../types';
import { composeThreeDistinctDailyShakes, composeDeterministicShake } from './recipeCompositionEngine';
import { getStoredProfile, saveDailyPlan } from '../storage/storageAbstraction';

export interface PlanOptions {
  date?: string;
  forceRegenerate?: boolean;
}

/**
 * Calculates optimal daily shake calories.
 * Strictly adheres to Rule 1:
 * abs(shakeTotalKcal - dailyTargetKcal) <= 300 kcal.
 *
 * Example:
 * Total Daily Goal: 3623 kcal
 * Daily Shake Total Target: 3623 kcal (Acceptable range: 3323 - 3923 kcal)
 *   Portion 1 (50%): ~1800 kcal
 *   Portion 2 (50%): ~1800 kcal
 *
 * Main meal calories are tracked independently and are NOT subtracted from the shake target.
 */
export function calculateOptimalDailyShakeKcal(userProfile?: UserProfile | null): number {
  if (!userProfile) return 3623;
  return userProfile.calorieGoal || 3623;
}

/**
 * Deterministic Planning Engine (1 Active Shake / Day -> 2 Equal Portions, with at least 3 candidates).
 *
 * Requirements:
 * 1. Produces at least 3 distinct candidates satisfying all 12 rules.
 * 2. Selected master recipe is divided into 2 equal portions: 1. Öğün (50%) and 2. Öğün (50%).
 * 3. Ties candidateShakes and selectedShakeId to the plan.
 * 4. Main meal calories are tracked separately and DO NOT shrink the shake plan.
 */
export function generateDailyPlan(
  targetDate: string,
  profile?: UserProfile | null,
  options: PlanOptions = {}
): DailyPlan {
  const userProfile = profile !== undefined ? profile : getStoredProfile();
  
  // Planned shake target matches dailyTargetKcal: 3623 kcal (+-300 kcal)
  const targetShakesKcal = calculateOptimalDailyShakeKcal(userProfile);

  // Compose at least 3 distinct candidates
  const candidates = composeThreeDistinctDailyShakes({
    targetCalories: targetShakesKcal,
    timing: 'morning',
    userProfile,
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

  const plan: DailyPlan = {
    id: `plan_${targetDate}_${Date.now()}`,
    date: targetDate,
    title: 'Günün Doğal Shake Planı',
    notes: `${candidates.length} farklı geçerli alternatif tarif hazırlandı (her biri 2 eşit porsiyon).`,
    shakes: candidates,
    dailyShake,
    candidateShakes: candidates,
    selectedShakeId: selectedShake.id,
    totalCalories: selectedShake.estimatedCalories,
    completedCalories: 0,
    isFullyCompleted: false,
    schemaVersion: 2,
  };

  saveDailyPlan(plan);
  return plan;
}

/**
 * Re-evaluates completion states of the daily plan when a meal is logged.
 * Rule: Ana öğün kalorisi shake planının haftalık hedefinden düşülmez.
 * Shake planı kalori hedefinin temel yapıtaşı olarak sabit kalır.
 */
export function rebalancePlanWithMeals(
  plan: DailyPlan,
  meals: MealAnalysis[],
  profile?: UserProfile | null
): DailyPlan {
  // Shakes are NOT reduced or changed when meals are consumed.
  // We simply recalculate completedCalories from portions drunk.
  let completedCalories = 0;
  let isFullyCompleted = false;

  if (plan.dailyShake) {
    const p1 = plan.dailyShake.portions[0]?.isCompleted ? plan.dailyShake.portions[0].calories : 0;
    const p2 = plan.dailyShake.portions[1]?.isCompleted ? plan.dailyShake.portions[1].calories : 0;
    completedCalories = p1 + p2;
    isFullyCompleted = plan.dailyShake.portions[0]?.isCompleted && plan.dailyShake.portions[1]?.isCompleted;
  } else if (plan.shakes && plan.shakes.length > 0) {
    completedCalories = plan.shakes.reduce((sum, s) => sum + (s.isCompleted ? s.estimatedCalories : 0), 0);
    isFullyCompleted = plan.shakes.every((s) => s.isCompleted);
  }

  const updatedPlan: DailyPlan = {
    ...plan,
    completedCalories,
    isFullyCompleted,
  };

  saveDailyPlan(updatedPlan);
  return updatedPlan;
}
