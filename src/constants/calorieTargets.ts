/**
 * Dynamic calorie-target compatibility helpers.
 *
 * IMPORTANT:
 * The application no longer uses a fixed 3200 kcal daily target.
 * The real daily target comes from nutritionEngine.ts and the user's profile.
 *
 * These exports remain temporarily so older callers do not break while the
 * remaining engines are migrated to the dynamic target model.
 */

/**
 * Compatibility fallback only.
 * New code MUST pass the calculated profile/daily target explicitly.
 */
export const DAILY_TARGET_KCAL = 2000;

/**
 * Minimum fallback used only when an older caller has no usable profile target.
 * It is not a user's daily calorie prescription.
 */
export const MIN_DAILY_TARGET_KCAL = 2000;

/**
 * Shake target tolerance. The actual target is supplied dynamically by the
 * calorie/planning engine.
 */
export const CALORIE_TOLERANCE_KCAL = 300;

/**
 * Legacy range exports retained for compatibility with older validators.
 * These are based on the compatibility fallback only. New validation should
 * use the actual target passed into the validator.
 */
export const MIN_ACCEPTABLE_KCAL = DAILY_TARGET_KCAL - CALORIE_TOLERANCE_KCAL;
export const MAX_ACCEPTABLE_KCAL = DAILY_TARGET_KCAL + CALORIE_TOLERANCE_KCAL;

/**
 * Compatibility portion value. New plans calculate 50% from the actual
 * generated shake total; this value must not be used for new planning logic.
 */
export const TARGET_PORTION_KCAL = Math.round(DAILY_TARGET_KCAL / 2);

/**
 * Returns the compatibility fallback only.
 * Prefer passing the calculated daily target from nutritionEngine/planningEngine.
 */
export function getDailyTargetKcal(targetKcal?: number): number {
  if (Number.isFinite(targetKcal) && (targetKcal as number) > 0) {
    return Math.round(targetKcal as number);
  }

  return DAILY_TARGET_KCAL;
}

/**
 * Checks a calorie total against a supplied dynamic target.
 * If no target is supplied, the compatibility fallback is used.
 */
export function isCalorieWithinTolerance(
  totalKcal: number,
  targetKcal?: number,
  toleranceKcal: number = CALORIE_TOLERANCE_KCAL
): boolean {
  const target = getDailyTargetKcal(targetKcal);
  const tolerance = Math.max(0, toleranceKcal);

  return (
    totalKcal >= target - tolerance &&
    totalKcal <= target + tolerance
  );
}

/**
 * Returns deviation relative to the actual target supplied by the caller.
 */
export function getCalorieDeviation(
  totalKcal: number,
  targetKcal?: number
): { isValid: boolean; deficit: number; message: string } {
  const target = getDailyTargetKcal(targetKcal);

  if (isCalorieWithinTolerance(totalKcal, target)) {
    return {
      isValid: true,
      deficit: 0,
      message: 'Kalori hedefi iÃ§inde.',
    };
  }

  const deficit = target - totalKcal;
  const message =
    deficit > 0
      ? `${Math.abs(deficit)} kcal aÃ§Ä±k (Hedef: ${target}, Mevcut: ${totalKcal})`
      : `${Math.abs(deficit)} kcal fazla (Hedef: ${target}, Mevcut: ${totalKcal})`;

  return {
    isValid: false,
    deficit,
    message,
  };
}
