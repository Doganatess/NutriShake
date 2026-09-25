import { DailyPlan, MealAnalysis, UserProfile } from '../types';
import { calculateDailyNutrition } from '../utils/nutritionEngine';
import { calculateMacroTargets, calculateRemainingMacros } from './macroEngine';

/** Single source of truth for the current day's calculated state. */
export function buildDailyState(
  profile: UserProfile,
  plan: DailyPlan | null,
  meals: MealAnalysis[]
) {
  const summary = calculateDailyNutrition(profile, plan, meals);
  const targets = calculateMacroTargets(profile);
  const remainingMacros = calculateRemainingMacros(targets, {
    protein: summary.consumedProtein,
    carbs: summary.consumedCarbs,
    fat: summary.consumedFat,
  });

  return {
    estimatedDailyNeed: summary.estimatedDailyNeed ?? profile.maintenanceCalories,
    goalAdjustmentKcal: summary.goalAdjustmentKcal ?? profile.goalSettings?.adjustmentKcal ?? 0,
    dailyTarget: summary.calorieGoal,
    consumedCalories: summary.consumedCalories,
    remainingCalories: summary.remainingCalories,
    macroTargets: targets,
    remainingMacros,
    meals,
    plan,
  };
}

export function getShakePlanningContext(profile: UserProfile, plan: DailyPlan | null, meals: MealAnalysis[]) {
  const state = buildDailyState(profile, plan, meals);
  return {
    dailyTarget: state.dailyTarget,
    consumedCalories: state.consumedCalories,
    remainingCalories: state.remainingCalories,
    remainingProtein: state.remainingMacros.protein,
    remainingCarbs: state.remainingMacros.carbs,
    remainingFat: state.remainingMacros.fat,
  };
}
