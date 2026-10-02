import type { DailyPlan, MealAnalysis, UserProfile } from '../../types.js';
import { getShakePlanningContext as buildShakePlanningContext } from '../../engines/dailyPlanEngine.js';

/** Application-facing adapter for the existing shake-planning context builder. */
export function getShakePlanningContext(input: {
  profile: UserProfile;
  plan: DailyPlan | null;
  meals: MealAnalysis[];
}) {
  return buildShakePlanningContext(input.profile, input.plan, input.meals);
}
