import { DailyPlan, Shake, UserProfile, MealAnalysis, DailyShake } from '../types';
import { composeThreeDistinctDailyShakes } from './recipeCompositionEngine';
import { getStoredProfile, saveDailyPlan } from '../storage/storageAbstraction';
import { buildDailyState } from './dailyPlanEngine';

export interface PlanOptions {
  date?: string;
  forceRegenerate?: boolean;
  meals?: MealAnalysis[];
}

/**
 * Shake planning is driven by the day's remaining need, not by a fixed shake
 * calorie constant. If meals are added, the remaining need changes and a newly
 * generated plan uses the new remaining amount.
 */
export function calculateOptimalDailyShakeKcal(
  userProfile?: UserProfile | null,
  remainingCalories?: number
): number {
  const profile = userProfile || getStoredProfile();
  if (!profile) return 0;
  const target = Number.isFinite(remainingCalories)
    ? Number(remainingCalories)
    : Math.max(0, Number(profile.calorieGoal) || 0);
  return Math.max(0, Math.round(target));
}

export function generateDailyPlan(
  targetDate: string,
  profile?: UserProfile | null,
  options: PlanOptions = {}
): DailyPlan {
  const userProfile = profile !== undefined ? profile : getStoredProfile();
  if (!userProfile) throw new Error('Kullanıcı profili bulunamadı.');

  const meals = (options.meals || []).filter((meal) => meal.date === targetDate);
  const currentPlan = null;
  const state = buildDailyState(userProfile, currentPlan, meals);
  const targetShakesKcal = calculateOptimalDailyShakeKcal(userProfile, state.remainingCalories);

  if (targetShakesKcal <= 0) {
    const emptyPlan: DailyPlan = {
      id: `plan_${targetDate}_${Date.now()}`,
      date: targetDate,
      title: 'Günün Planı',
      notes: 'Günlük enerji hedefi tüketimle karşılandı; yeni shake ihtiyacı yok.',
      estimatedDailyNeed: state.estimatedDailyNeed,
      goalAdjustmentKcal: state.goalAdjustmentKcal,
      targetCalories: state.dailyTarget,
      consumedCalories: state.consumedCalories,
      remainingCalories: state.remainingCalories,
      targetRemainingCalories: 0,
      macroTargets: state.macroTargets,
      shakes: [],
      candidateShakes: [],
      completedCalories: 0,
      totalCalories: 0,
      isFullyCompleted: true,
      schemaVersion: 3,
    };
    saveDailyPlan(emptyPlan);
    return emptyPlan;
  }

  const candidates = composeThreeDistinctDailyShakes({
    targetCalories: targetShakesKcal,
    timing: 'morning',
    userProfile,
  });

  if (!candidates.length) {
    throw new Error('Kalan ihtiyaca uygun stoklardan hazırlanabilir shake bulunamadı.');
  }

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
    portionNutrition: {
      calories: portionKcal,
      protein: selectedShake.protein / 2,
      carbs: selectedShake.carbs / 2,
      fat: selectedShake.fat / 2,
      fiber: selectedShake.fiber / 2,
    },
    portionCount: 2,
    portions: [
      { portionNumber: 1, name: '1. Öğün', calories: portionKcal, isCompleted: false },
      { portionNumber: 2, name: '2. Öğün', calories: portionKcal, isCompleted: false },
    ],
    instructions: selectedShake.instructions,
    preparationTimeMinutes: selectedShake.preparationTimeMinutes,
    whyChosenReasons: selectedShake.whyChosenReasons,
  };

  const plan: DailyPlan = {
    id: `plan_${targetDate}_${Date.now()}`,
    date: targetDate,
    title: 'Günün Shake Planı',
    notes: `${candidates.length} farklı geçerli alternatif tarif hazırlandı.`,
    estimatedDailyNeed: state.estimatedDailyNeed,
    goalAdjustmentKcal: state.goalAdjustmentKcal,
    targetCalories: state.dailyTarget,
    consumedCalories: state.consumedCalories,
    remainingCalories: state.remainingCalories,
    targetRemainingCalories: targetShakesKcal,
    macroTargets: state.macroTargets,
    shakes: candidates,
    dailyShake,
    candidateShakes: candidates,
    selectedShakeId: candidates.length === 1 ? selectedShake.id : undefined,
    totalCalories: selectedShake.estimatedCalories,
    completedCalories: 0,
    isFullyCompleted: false,
    schemaVersion: 3,
  };

  saveDailyPlan(plan);
  return plan;
}

/** Recalculates the day's state without mutating the recipe itself. */
export function rebalancePlanWithMeals(
  plan: DailyPlan,
  meals: MealAnalysis[],
  profile?: UserProfile | null
): DailyPlan {
  const userProfile = profile || getStoredProfile();
  if (!userProfile) return plan;
  const state = buildDailyState(userProfile, plan, meals);
  const updatedPlan: DailyPlan = {
    ...plan,
    estimatedDailyNeed: state.estimatedDailyNeed,
    goalAdjustmentKcal: state.goalAdjustmentKcal,
    targetCalories: state.dailyTarget,
    consumedCalories: state.consumedCalories,
    remainingCalories: state.remainingCalories,
    targetRemainingCalories: state.remainingCalories,
    macroTargets: state.macroTargets,
    updatedAt: new Date().toISOString(),
  };
  saveDailyPlan(updatedPlan);
  return updatedPlan;
}
