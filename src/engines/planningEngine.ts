import { DailyPlan, Shake, UserProfile, MealAnalysis, DailyShake } from '../types';
import { composeThreeDistinctDailyShakes, composeDeterministicShake } from './recipeCompositionEngine';
import { getStoredProfile, saveDailyPlan } from '../storage/storageAbstraction';

export interface PlanOptions {
  date?: string;
  forceRegenerate?: boolean;
}

/**
 * Calculates the daily shake target from the user's calculated daily energy target.
 *
 * The daily calorie target belongs to the whole-day nutrition model. The shake
 * is intentionally kept slightly below that target so it is not forced to equal
 * the entire day's calories. Main meals and other real consumption remain
 * separately tracked by the daily nutrition system.
 *
 * Rule: keep the generated daily shake 200–300 kcal below the daily target.
 * A 250 kcal gap is used as the deterministic midpoint.
 */
export function calculateOptimalDailyShakeKcal(userProfile?: UserProfile | null): number {
  const dailyTarget = Math.round(
    Number(userProfile?.calorieGoal || userProfile?.maintenanceCalories || 0)
  );

  if (!Number.isFinite(dailyTarget) || dailyTarget <= 0) return 0;

  const gapKcal = 250;
  const target = dailyTarget - gapKcal;

  // Never turn a valid daily target into a zero/negative shake target.
  // No legacy 2500/3200 kcal floor is applied here.
  return Math.max(300, Math.round(target));
}

/**
 * Deterministic Planning Engine (1 Active Shake / Day -> 2 Equal Portions, with at least 3 candidates).
 *
 * Requirements:
 * 1. Produces at least 3 distinct candidates satisfying all 12 rules.
 * 2. Selected master recipe is divided into 2 equal portions: 1. Öğün (50%) and 2. Öğün (50%).
 * 3. Ties candidateShakes and selectedShakeId to the plan.
 * 4. Main meal calories are tracked separately; they do not mutate the selected shake recipe.
 * 5. The shake target is derived from the user's daily calorie target, not a fixed 3200 kcal constant.
 */
export function generateDailyPlan(
  targetDate: string,
  profile?: UserProfile | null,
  options: PlanOptions = {}
): DailyPlan {
  const userProfile = profile !== undefined ? profile : getStoredProfile();
  
  // Shake target is derived from the calculated daily target and kept ~250 kcal below it.
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
    // FIX: previously auto-selected the first candidate here, so the user never
    // actually got to choose between the 3 generated alternatives — TodayView just
    // silently tracked shakes[0]. Leaving this unset means TodayView shows a picker
    // when there's more than one candidate, and the user's choice is what gets saved.
    selectedShakeId: candidates.length === 1 ? selectedShake.id : undefined,
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
 * Meal calories do not mutate the already-generated shake recipe.
 * The daily nutrition engine separately tracks meals + completed shake portions.
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
