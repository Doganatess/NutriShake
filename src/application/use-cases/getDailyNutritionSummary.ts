import type { DailyActivity, DailyPlan, MealAnalysis, UserProfile } from '../../types.js';
import { calculateDailyNutrition } from '../../utils/nutritionEngine.js';

/**
 * Application use case for the daily nutrition summary.
 * Keeps UI components out of the calculation engine while retaining the existing
 * deterministic nutrition implementation as the source of truth.
 */
export function getDailyNutritionSummary(input: {
  profile: UserProfile | null;
  plan: DailyPlan | null;
  meals: MealAnalysis[];
  activity?: DailyActivity | null;
}) {
  return calculateDailyNutrition(input.profile, input.plan, input.meals, input.activity);
}
