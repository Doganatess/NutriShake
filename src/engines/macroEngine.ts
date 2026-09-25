import { GoalType, MacroTargets, UserProfile } from '../types';

/** Deterministic macro engine. AI never decides daily macro targets. */
export function calculateMacroTargets(
  profile: Pick<UserProfile, 'currentWeight' | 'goal' | 'calorieGoal' | 'macroTargets'>
): MacroTargets {
  const weight = Math.max(1, Number(profile.currentWeight) || 1);
  const calories = Math.max(0, Number(profile.calorieGoal) || 0);

  if (profile.macroTargets &&
      profile.macroTargets.protein > 0 &&
      profile.macroTargets.fat > 0 &&
      profile.macroTargets.carbs >= 0) {
    return { ...profile.macroTargets };
  }

  const proteinPerKg: Record<GoalType, number> = {
    gain_weight: 1.6,
    lose_weight: 1.9,
    maintain: 1.6,
    maintain_weight: 1.6,
  };
  const fatRatio: Record<GoalType, number> = {
    gain_weight: 0.28,
    lose_weight: 0.25,
    maintain: 0.27,
    maintain_weight: 0.27,
  };

  const protein = Math.round(weight * proteinPerKg[profile.goal]);
  const fat = Math.round((calories * fatRatio[profile.goal]) / 9);
  const carbCalories = Math.max(0, calories - protein * 4 - fat * 9);
  const carbs = Math.round(carbCalories / 4);

  return { protein, carbs, fat };
}

export function calculateRemainingMacros(
  targets: MacroTargets,
  consumed: { protein?: number; carbs?: number; fat?: number }
): MacroTargets {
  return {
    protein: Math.max(0, Math.round((targets.protein - (consumed.protein || 0)) * 10) / 10),
    carbs: Math.max(0, Math.round((targets.carbs - (consumed.carbs || 0)) * 10) / 10),
    fat: Math.max(0, Math.round((targets.fat - (consumed.fat || 0)) * 10) / 10),
  };
}
