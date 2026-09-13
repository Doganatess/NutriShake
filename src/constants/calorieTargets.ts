/**
 * Centralized Daily Calorie Target Constants
 * 
 * These values establish the fixed daily nutritional goal for the user's daily shake intake.
 * They override any profile-based (age/weight/activity) automatic calculations.
 * 
 * All recipe composition, AI prompt generation, validation, and planning engines
 * MUST use these constants, ensuring consistent behavior across:
 * - Daily plan generation (deterministic & AI-assisted)
 * - Single shake replacement
 * - Stock-based recipe scaling
 * - Weekly plan renewal
 */

/** 
 * DAILY_TARGET_KCAL: Fixed target daily shake calorie intake.
 * This is the approximate total calorie goal for a single daily shake (2 equal portions).
 * Overrides userProfile.calorieGoal and any BMR/TDEE calculations.
 */
export const DAILY_TARGET_KCAL = 3200;

/**
 * MIN_DAILY_TARGET_KCAL: Absolute minimum acceptable calorie floor.
 * No shake plan should fall below this threshold, even when stock is constrained.
 * Used to trigger fallback mechanisms and warnings rather than errors.
 */
export const MIN_DAILY_TARGET_KCAL = 2500;

/**
 * CALORIE_TOLERANCE_KCAL: Acceptable deviation from the daily target.
 * Shake total must be within [DAILY_TARGET_KCAL - TOLERANCE, DAILY_TARGET_KCAL + TOLERANCE].
 * Example: 3200 ± 300 = valid range [2900, 3500] kcal.
 */
export const CALORIE_TOLERANCE_KCAL = 300;

/**
 * Calculated calorie range for validation and composition.
 * Used in:
 * - Recipe validator (Rule 1: abs(shakeTotalKcal - dailyTargetKcal) <= 300)
 * - Gemini service prompts
 * - Planning engine
 * - Recipe composition loops
 */
export const MIN_ACCEPTABLE_KCAL = DAILY_TARGET_KCAL - CALORIE_TOLERANCE_KCAL; // 2900
export const MAX_ACCEPTABLE_KCAL = DAILY_TARGET_KCAL + CALORIE_TOLERANCE_KCAL; // 3500

/**
 * Single portion calories (50% split).
 * Used to validate portionCalories and calculate equal 50/50 division.
 */
export const TARGET_PORTION_KCAL = Math.round(DAILY_TARGET_KCAL / 2); // 1600

/**
 * Helper function: Get current daily target.
 * Always returns DAILY_TARGET_KCAL (ignores userProfile).
 * Provided for semantic clarity in code using this function.
 */
export function getDailyTargetKcal(): number {
  return DAILY_TARGET_KCAL;
}

/**
 * Helper function: Check if total calories are within acceptable range.
 * Used for validation across multiple engines.
 */
export function isCalorieWithinTolerance(totalKcal: number): boolean {
  return totalKcal >= MIN_ACCEPTABLE_KCAL && totalKcal <= MAX_ACCEPTABLE_KCAL;
}

/**
 * Helper function: Validate and suggest calorie deficit/surplus.
 * Used for warnings in UI and debug logging.
 */
export function getCalorieDeviation(totalKcal: number): { isValid: boolean; deficit: number; message: string } {
  if (isCalorieWithinTolerance(totalKcal)) {
    return { isValid: true, deficit: 0, message: 'Kalori hedefi içinde.' };
  }
  const deficit = DAILY_TARGET_KCAL - totalKcal;
  const message =
    deficit > 0
      ? `${Math.abs(deficit)} kcal açık (Hedef: ${DAILY_TARGET_KCAL}, Mevcut: ${totalKcal})`
      : `${Math.abs(deficit)} kcal fazla (Hedef: ${DAILY_TARGET_KCAL}, Mevcut: ${totalKcal})`;
  return { isValid: false, deficit, message };
}
