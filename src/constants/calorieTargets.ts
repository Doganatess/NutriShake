/** Dynamic calorie validation helpers. No fixed daily calorie prescription exists. */
export const CALORIE_TOLERANCE_KCAL = 300;

export function getDailyTargetKcal(targetKcal?: number): number {
  return Number.isFinite(targetKcal) && (targetKcal as number) > 0
    ? Math.round(targetKcal as number)
    : 0;
}

export function isCalorieWithinTolerance(
  totalKcal: number,
  targetKcal: number,
  toleranceKcal: number = CALORIE_TOLERANCE_KCAL
): boolean {
  const target = getDailyTargetKcal(targetKcal);
  const tolerance = Math.max(0, toleranceKcal);
  return target > 0 && totalKcal >= target - tolerance && totalKcal <= target + tolerance;
}

export function getCalorieDeviation(
  totalKcal: number,
  targetKcal: number
): { isValid: boolean; deficit: number; message: string } {
  const target = getDailyTargetKcal(targetKcal);
  if (target <= 0) return { isValid: false, deficit: 0, message: 'Geçerli bir dinamik kalori hedefi bulunamadı.' };
  if (isCalorieWithinTolerance(totalKcal, target)) {
    return { isValid: true, deficit: 0, message: 'Kalori hedefi içinde.' };
  }
  const deficit = target - totalKcal;
  return {
    isValid: false,
    deficit,
    message: deficit > 0
      ? `${Math.abs(deficit)} kcal açık (Hedef: ${target}, Mevcut: ${totalKcal})`
      : `${Math.abs(deficit)} kcal fazla (Hedef: ${target}, Mevcut: ${totalKcal})`,
  };
}
