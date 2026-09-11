import { INGREDIENT_MAP } from '../data/ingredients';
import { normalizeToGramsOrMl } from '../utils/unitConverter';
import {
  ShakeIngredient,
  DailyPlan,
  MealAnalysis,
  UserProfile,
  DailyNutritionSummary,
  SupportedUnit,
} from '../types';

/**
 * Calculates exact deterministic nutrition for a single ingredient item with unit normalization.
 */
export function calculateIngredientNutrition(
  ingredientId: string,
  amountOrQuantity: number,
  unit?: SupportedUnit | string
) {
  const ing = INGREDIENT_MAP[ingredientId];
  if (!ing || amountOrQuantity <= 0) {
    return {
      normalizedGrams: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      cost: 0,
    };
  }

  // Normalize quantity + unit to grams or ml using the master unit converter
  const normalizedGrams = normalizeToGramsOrMl(
    amountOrQuantity,
    (unit as SupportedUnit) || 'g',
    ing
  );

  const factor = normalizedGrams / 100;
  const fiberPer100g = ing.fiberPer100g || 0;
  const estimatedPricePer100g = (ing.estimatedPrice || 0) / 10; // TL per 100g

  return {
    normalizedGrams,
    calories: Math.round(ing.caloriesPer100g * factor),
    protein: Math.round(ing.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(ing.carbsPer100g * factor * 10) / 10,
    fat: Math.round(ing.fatPer100g * factor * 10) / 10,
    fiber: Math.round(fiberPer100g * factor * 10) / 10,
    cost: Math.round(estimatedPricePer100g * factor * 10) / 10,
  };
}

/**
 * Deterministic Engine: calculates exact total kcal, protein, carbs, fat, fiber,
 * estimated cost, and liquid volume for a list of ingredients in a shake recipe.
 */
export function calculateShakeNutrition(ingredients: ShakeIngredient[]) {
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;
  let totalCost = 0;
  let totalVolumeMl = 0;

  const enrichedIngredients: ShakeIngredient[] = ingredients.map((item) => {
    const rawAmount = item.quantity !== undefined ? item.quantity : item.amount;
    const itemUnit = item.unit || 'g';

    const macros = calculateIngredientNutrition(item.ingredientId, rawAmount, itemUnit);
    totalKcal += macros.calories;
    totalProtein += macros.protein;
    totalCarbs += macros.carbs;
    totalFat += macros.fat;
    totalFiber += macros.fiber;
    totalCost += macros.cost;

    const ing = INGREDIENT_MAP[item.ingredientId];
    if (
      ing?.shakeCompatibility === 'liquid' ||
      ing?.category === 'dairy' ||
      ing?.id === 'other_water' ||
      ing?.id === 'other_mineral_water'
    ) {
      totalVolumeMl += macros.normalizedGrams;
    } else {
      totalVolumeMl += Math.round(macros.normalizedGrams * 0.35); // Solid displacement factor
    }

    return {
      ...item,
      amount: macros.normalizedGrams,
      quantity: item.quantity !== undefined ? item.quantity : rawAmount,
      unit: itemUnit,
      normalizedGrams: macros.normalizedGrams,
      calculatedCalories: macros.calories,
      calculatedProtein: macros.protein,
      calculatedCarbs: macros.carbs,
      calculatedFat: macros.fat,
      calculatedFiber: macros.fiber,
      calculatedCost: macros.cost,
    };
  });

  return {
    calories: totalKcal,
    protein: Math.round(totalProtein * 10) / 10,
    carbs: Math.round(totalCarbs * 10) / 10,
    fat: Math.round(totalFat * 10) / 10,
    fiber: Math.round(totalFiber * 10) / 10,
    estimatedCost: Math.round(totalCost * 10) / 10,
    totalVolumeMl: Math.round(totalVolumeMl),
    ingredients: enrichedIngredients,
  };
}

/**
 * Calculates the daily summary:
 * Consumed = Completed Shakes + Analyzed Meals
 * Remaining = Daily Goal - Consumed
 */
export function calculateDailyNutrition(
  profile: UserProfile | null,
  plan: DailyPlan | null,
  meals: MealAnalysis[]
): DailyNutritionSummary {
  const calorieGoal = profile?.calorieGoal || 2000;
  const proteinGoal = profile?.proteinGoal || 100;

  // Analyzed meals total
  let analyzedMealCalories = 0;
  let analyzedMealProtein = 0;
  let analyzedMealCarbs = 0;
  let analyzedMealFat = 0;

  for (const meal of meals) {
    analyzedMealCalories += meal.estimatedCalories || 0;
    analyzedMealProtein += meal.protein || 0;
    analyzedMealCarbs += meal.carbs || 0;
    analyzedMealFat += meal.fat || 0;
  }

  // Completed shakes total
  let completedShakeCalories = 0;
  let completedShakeProtein = 0;
  let completedShakeCarbs = 0;
  let completedShakeFat = 0;

  if (plan?.shakes) {
    for (const shake of plan.shakes) {
      if (shake.isCompleted) {
        completedShakeCalories += shake.estimatedCalories || 0;
        completedShakeProtein += shake.protein || 0;
        completedShakeCarbs += shake.carbs || 0;
        completedShakeFat += shake.fat || 0;
      }
    }
  }

  const consumedCalories = analyzedMealCalories + completedShakeCalories;
  const consumedProtein = Math.round((analyzedMealProtein + completedShakeProtein) * 10) / 10;
  const consumedCarbs = Math.round((analyzedMealCarbs + completedShakeCarbs) * 10) / 10;
  const consumedFat = Math.round((analyzedMealFat + completedShakeFat) * 10) / 10;
  const remainingCalories = Math.max(0, calorieGoal - consumedCalories);

  return {
    calorieGoal,
    consumedCalories,
    remainingCalories,
    consumedProtein,
    proteinGoal,
    consumedCarbs,
    consumedFat,
    analyzedMealCalories,
    completedShakeCalories,
  };
}

export interface CalorieNeedsEstimate {
  maintenanceCalories: number;
  recommendedGoal: number;
  proteinGoal: number;
  monthlyWeightGoalKg: number;
  dailySurplusKcal: number;
  projectionDisclaimer: string;
}

/**
 * Scientific calorie estimation using Mifflin-St Jeor formula.
 * Targets core goal of +5 KG / month (~1250-1280 kcal/day caloric surplus).
 * Clear guidance that this is a projection / target, not a medical prescription.
 */
export function estimateCalorieNeeds(
  weightKg: number,
  heightCm: number,
  targetWeightKg: number,
  activityLevel: UserProfile['activityLevel'],
  age: number = 28,
  monthlyTargetKg: number = 5
): CalorieNeedsEstimate {
  // Base BMR estimate: 10 * W + 6.25 * H - 5 * A + 5
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  const activityMultipliers: Record<UserProfile['activityLevel'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725,
  };

  const maintenance = Math.round(bmr * (activityMultipliers[activityLevel] || 1.375));

  let goal = maintenance;
  let dailySurplus = 0;

  if (targetWeightKg > weightKg) {
    // Core Target: +5 KG / month -> ~1250 - 1283 kcal/day surplus (7700 kcal * 5 / 30)
    dailySurplus = Math.round((monthlyTargetKg * 7700) / 30);
    goal = maintenance + dailySurplus;
  } else if (targetWeightKg < weightKg) {
    dailySurplus = -400;
    goal = Math.max(1400, maintenance - 400);
  }

  // Protein estimate: ~1.8g per kg of body weight
  const proteinGoal = Math.round(weightKg * 1.8);

  return {
    maintenanceCalories: maintenance,
    recommendedGoal: goal,
    proteinGoal,
    monthlyWeightGoalKg: monthlyTargetKg,
    dailySurplusKcal: dailySurplus,
    projectionDisclaimer: 'Hedeflenen aylık artış: +5 kg (~1280 kcal/gün planlı kalori fazlası). Bu plan bir hedef ve bilimsel enerji projeksiyonudur; bireysel metabolizma hızınıza, vardiya temponuza ve günlük hareketliliğe bağlı olarak gerçek artış değişkenlik gösterebilir.',
  };
}
