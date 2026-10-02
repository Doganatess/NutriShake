export type {
  DailyNutritionSummary,
  UserProfile,
  DailyPlan,
  MealAnalysis,
  DailyActivity,
} from '../../types.js';

/** A computed view of daily intake; values are estimates, not medical advice. */
export interface DailyNutritionSnapshot {
  dailyTarget: number;
  estimatedDailyNeed?: number;
  goalAdjustmentKcal: number;
  consumedCalories: number;
  remainingCalories: number;
  consumedProtein: number;
  consumedCarbs: number;
  consumedFat: number;
}
