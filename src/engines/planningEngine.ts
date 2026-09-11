import { DailyPlan, Shake, UserProfile, MealAnalysis, DailyShake } from '../types';
import { composeDeterministicShake } from './recipeCompositionEngine';
import { getStoredProfile, saveDailyPlan } from '../storage/storageAbstraction';

export interface PlanOptions {
  date?: string;
  forceRegenerate?: boolean;
}

/**
 * Deterministic Planning Engine (1 Shake / Day -> 2 Equal Portions).
 *
 * Requirements:
 * 1. Exactly 1 shake recipe generated per day.
 * 2. Divided into 2 equal portions: 1. Öğün (50%) and 2. Öğün (50%).
 * 3. Tied to a single daily recipe ID / shake ID.
 * 4. Main meal calories are tracked separately and DO NOT shrink the shake plan.
 */
export function generateDailyPlan(
  targetDate: string,
  profile?: UserProfile | null,
  options: PlanOptions = {}
): DailyPlan {
  const userProfile = profile !== undefined ? profile : getStoredProfile();
  
  // Planned shake target: ~1000-1280 kcal total (~500-640 kcal per portion)
  // Aligns with the planned caloric surplus for gaining +5 KG / month
  const surplusTarget = userProfile?.dailySurplusKcal || 1250;
  const targetShakesKcal = Math.min(1400, Math.max(800, surplusTarget));

  // Compose exactly ONE master shake recipe for the day
  const singleShake = composeDeterministicShake({
    targetCalories: targetShakesKcal,
    timing: 'morning',
    userProfile,
  });

  const portionKcal = singleShake.portionCalories || Math.round(singleShake.estimatedCalories / 2);

  const dailyShake: DailyShake = {
    id: singleShake.id,
    name: singleShake.name,
    ingredients: singleShake.ingredients,
    totalNutrition: {
      calories: singleShake.estimatedCalories,
      protein: singleShake.protein,
      carbs: singleShake.carbs,
      fat: singleShake.fat,
      fiber: singleShake.fiber,
    },
    portionCount: 2,
    portions: [
      {
        portionNumber: 1,
        name: '1. Öğün',
        calories: portionKcal,
        isCompleted: singleShake.portion1Completed || false,
      },
      {
        portionNumber: 2,
        name: '2. Öğün',
        calories: portionKcal,
        isCompleted: singleShake.portion2Completed || false,
      },
    ],
    instructions: singleShake.instructions,
    preparationTimeMinutes: singleShake.preparationTimeMinutes,
    whyChosenReasons: singleShake.whyChosenReasons,
  };

  const plan: DailyPlan = {
    date: targetDate,
    shakes: [singleShake],
    dailyShake,
    totalCalories: singleShake.estimatedCalories,
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
