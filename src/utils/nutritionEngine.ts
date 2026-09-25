import { INGREDIENT_MAP, normalizeTurkish } from '../data/ingredients.js';
import { normalizeQuantityToGrams } from './unitConverter.js';
import { ShakeIngredient, DailyPlan, MealAnalysis, UserProfile, DailyNutritionSummary, DailyActivity } from '../types.js';
import { calculateMacroTargets } from '../engines/macroEngine.js';

/**
 * Normalizes Turkish characters and lowercases for accurate instant search.
 * Handles ç, ğ, ı, i, ö, ş, ü seamlessly.
 */
export function turkishNormalize(text: string): string {
  return normalizeTurkish(text);
}

/**
 * Calculates exact nutrition for a single ingredient item with unit support
 */
export function calculateIngredientNutrition(
  ingredientId: string,
  amountOrQuantity: number,
  unit?: string
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

  // Normalize quantity + unit to grams
  const normalizedGrams = unit && unit !== 'g' && unit !== 'ml'
    ? normalizeQuantityToGrams(ing, amountOrQuantity, unit)
    : Math.round(amountOrQuantity);

  const factor = normalizedGrams / 100;
  const fiberPer100g = ing.fiberPer100g || 0;

  // Exact cost calculation based on ingredient priceUnit (e.g. TL / kg, TL / L)
  let cost = 0;
  if (ing.estimatedPrice && ing.estimatedPrice > 0) {
    const unitStr = (ing.priceUnit || 'TL / kg').toLowerCase();
    let pricePerGram = 0;
    if (unitStr.includes('kg') || unitStr.includes('l') || unitStr.includes('litre')) {
      pricePerGram = ing.estimatedPrice / 1000;
    } else if (unitStr.includes('100g') || unitStr.includes('100 ml')) {
      pricePerGram = ing.estimatedPrice / 100;
    } else if (unitStr.includes('adet') || unitStr.includes('şişe') || unitStr.includes('tane')) {
      const servingGrams = ing.edibleWeight || ing.defaultServing || 100;
      pricePerGram = ing.estimatedPrice / servingGrams;
    } else {
      pricePerGram = ing.estimatedPrice / 1000;
    }
    cost = Math.round(normalizedGrams * pricePerGram * 10) / 10;
  }

  return {
    normalizedGrams,
    calories: Math.round(ing.caloriesPer100g * factor),
    protein: Math.round(ing.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(ing.carbsPer100g * factor * 10) / 10,
    fat: Math.round(ing.fatPer100g * factor * 10) / 10,
    fiber: Math.round(fiberPer100g * factor * 10) / 10,
    cost,
  };
}

/**
 * Deterministic engine: calculates exact total kcal, protein, carbs, fat, fiber,
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
    if (ing?.shakeCompatibility === 'liquid' || ing?.category === 'dairy') {
      totalVolumeMl += macros.normalizedGrams;
    } else {
      totalVolumeMl += Math.round(macros.normalizedGrams * 0.4); // solid displacement
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
  meals: MealAnalysis[],
  dailyActivity?: DailyActivity | null
): DailyNutritionSummary {
  let calorieGoal = profile?.calorieGoal || 2000;
  let estimatedDailyNeed = profile?.maintenanceCalories;
  let goalAdjustmentKcal = profile?.goalSettings?.adjustmentKcal ?? profile?.dailySurplusKcal ?? 0;
  if (profile && dailyActivity) {
    const pace = profile.goalSettings?.targetPaceUnit === 'kg_per_week'
      ? (profile.goalSettings.targetPace || 0) * 4.345
      : (profile.goalSettings?.targetPace ?? profile.monthlyWeightGoalKg ?? 0);
    const estimate = estimateCalorieNeeds(
      profile.currentWeight, profile.height, profile.targetWeight,
      {
        workMovement: dailyActivity.workMovement || profile.workMovement,
        sportType: dailyActivity.sportType || profile.sportType,
        sportDaysPerWeek: dailyActivity.sportDaysPerWeek ?? profile.sportDaysPerWeek,
        sportMinutesPerSession: dailyActivity.sportMinutesPerSession ?? profile.sportMinutesPerSession,
        sportIntensity: dailyActivity.sportIntensity || profile.sportIntensity,
        generalMovement: dailyActivity.generalMovement || profile.generalMovement,
        status: dailyActivity.status || 'normal',
      },
      profile.age, pace, profile.gender
    );
    estimatedDailyNeed = estimate.estimatedDailyNeed;
    goalAdjustmentKcal = estimate.goalAdjustmentKcal;
    calorieGoal = profile.isCustomCalorieGoal ? profile.calorieGoal : estimate.recommendedGoal;
  }

  const macroTargets = profile ? calculateMacroTargets(profile) : { protein: 100, carbs: 250, fat: 70 };
  const proteinGoal = macroTargets.protein;

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

  // Completed shakes total (portions 1 and 2 or whole shake)
  let completedShakeCalories = 0;
  let completedShakeProtein = 0;
  let completedShakeCarbs = 0;
  let completedShakeFat = 0;

  if (plan?.shakes) {
    for (const shake of plan.shakes) {
      if (shake.portion1Completed && shake.portion2Completed) {
        completedShakeCalories += shake.estimatedCalories || 0;
        completedShakeProtein += shake.protein || 0;
        completedShakeCarbs += shake.carbs || 0;
        completedShakeFat += shake.fat || 0;
      } else if (shake.portion1Completed || shake.portion2Completed) {
        // Exactly 50% for 1 portion
        const portionKcal = shake.portionCalories || Math.round((shake.estimatedCalories || 0) / 2);
        completedShakeCalories += portionKcal;
        completedShakeProtein += Math.round(((shake.protein || 0) / 2) * 10) / 10;
        completedShakeCarbs += Math.round(((shake.carbs || 0) / 2) * 10) / 10;
        completedShakeFat += Math.round(((shake.fat || 0) / 2) * 10) / 10;
      } else if (shake.isCompleted) {
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
    estimatedDailyNeed: estimatedDailyNeed || undefined,
    calorieGoal,
    consumedCalories,
    remainingCalories,
    consumedProtein,
    proteinGoal,
    consumedCarbs,
    consumedFat,
    targetProtein: macroTargets.protein,
    targetCarbs: macroTargets.carbs,
    targetFat: macroTargets.fat,
    goalAdjustmentKcal,
    analyzedMealCalories,
    completedShakeCalories,
    consumedShakeCalories: completedShakeCalories,
  };
}

export interface CalorieNeedsEstimate {
  bmrCalories: number;
  estimatedDailyNeed: number;
  maintenanceCalories: number;
  recommendedGoal: number;
  goalAdjustmentKcal: number;
  proteinGoal: number;
  dailyAdjustmentKcal: number;
  targetPaceKgPerWeek: number;
  projectionDisclaimer: string;
}

export interface CalorieNeedsActivityInput {
  workMovement?: UserProfile['workMovement'];
  sportType?: UserProfile['sportType'];
  sportDaysPerWeek?: number;
  sportMinutesPerSession?: number;
  sportIntensity?: UserProfile['sportIntensity'];
  generalMovement?: UserProfile['generalMovement'];
  status?: 'normal' | 'working' | 'off' | 'more_active' | 'less_active';
}

/**
 * Estimates BMR, maintenance energy and a goal-adjusted daily calorie target.
 *
 * New model:
 *   BMR -> work/general movement -> weekly sport contribution -> daily status -> goal adjustment
 *
 * The goal adjustment is derived from the selected target pace rather than a
 * hard-coded +5 kg/month assumption. It is capped to keep the generated target
 * from becoming an extreme automatic prescription.
 *
 * The fourth argument still accepts the legacy activityLevel string so existing
 * callers keep working during the migration. New callers should pass the
 * activity object instead.
 */
export function estimateCalorieNeeds(
  weightKg: number,
  heightCm: number,
  targetWeightKg: number,
  activity: UserProfile['activityLevel'] | CalorieNeedsActivityInput | undefined,
  age: number = 28,
  targetPace?: number,
  gender: UserProfile['gender'] = 'male'
): CalorieNeedsEstimate {
  const safeWeight = Math.max(1, weightKg);
  const safeHeight = Math.max(1, heightCm);
  const safeAge = Math.max(1, age);

  // Mifflin-St Jeor. Female/male constants are kept explicit instead of using
  // the previous gender-neutral +5 formula.
  const bmr =
    10 * safeWeight +
    6.25 * safeHeight -
    5 * safeAge +
    (gender === 'female' ? -161 : 5);

  const isLegacyActivity = typeof activity === 'string' || activity == null;

  const legacyMultipliers: Record<UserProfile['activityLevel'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725,
  };

  const workMultipliers: Record<NonNullable<UserProfile['workMovement']>, number> = {
    mostly_sitting: 1.2,
    some_walking: 1.35,
    mostly_standing_moving: 1.5,
    heavy_physical: 1.65,
  };

  const generalMultipliers: Record<NonNullable<UserProfile['generalMovement']>, number> = {
    mostly_home: 0.98,
    some_walking: 1,
    lots_of_walking: 1.05,
  };

  const sportMet: Record<NonNullable<UserProfile['sportType']>, number> = {
    none: 0,
    fitness_weights: 5,
    running: 8,
    walking: 3.5,
    cycling: 6,
    football: 7,
    basketball: 7,
    swimming: 6,
    tennis: 7,
    martial_arts: 8,
    pilates: 3,
    other: 5,
  };

  const intensityMultiplier: Record<NonNullable<UserProfile['sportIntensity']>, number> = {
    low: 0.85,
    medium: 1,
    high: 1.15,
  };

  let maintenance: number;

  if (isLegacyActivity) {
    const legacyLevel = (activity || 'light') as UserProfile['activityLevel'];
    maintenance = bmr * (legacyMultipliers[legacyLevel] || legacyMultipliers.light);
  } else {
    const input = activity as CalorieNeedsActivityInput;
    const workFactor = workMultipliers[input.workMovement || 'some_walking'];
    const generalFactor = generalMultipliers[input.generalMovement || 'some_walking'];

    // Work/general movement establish the daily baseline. Sport is then added
    // as a weekly-average net contribution so it is not double-counted.
    const baseline = bmr * workFactor * generalFactor;
    const days = Math.min(7, Math.max(0, input.sportDaysPerWeek || 0));
    const minutes = Math.min(240, Math.max(0, input.sportMinutesPerSession || 0));
    const met = sportMet[input.sportType || 'none'] || 0;
    const intensity = intensityMultiplier[input.sportIntensity || 'medium'];

    // Net exercise calories: remove the ~1 MET resting component because the
    // baseline already represents a full day of energy expenditure.
    const netSportKcalPerSession = met > 0
      ? Math.max(0, (met - 1) * 3.5 * safeWeight / 200 * minutes * intensity)
      : 0;
    const weeklySportKcal = netSportKcalPerSession * days;
    const dailySportKcal = weeklySportKcal / 7;

    maintenance = baseline + dailySportKcal;

    const status = input.status || 'normal';
    const statusMultiplier: Record<NonNullable<CalorieNeedsActivityInput['status']>, number> = {
      normal: 1,
      working: 1,
      off: 0.92,
      more_active: 1.08,
      less_active: 0.94,
    };
    maintenance *= statusMultiplier[status];
  }

  const maintenanceCalories = Math.max(1200, Math.round(maintenance));

  // Target pace is kg/month for the existing UI unless a weekly pace is passed
  // through a future caller. For now the legacy positional argument remains
  // interpreted as kg/month, but no default of +5 kg/month is used.
  const safeMonthlyPace = Math.min(2, Math.max(0, targetPace ?? 1));
  const targetPaceKgPerWeek = safeMonthlyPace / 4.345;

  let dailyAdjustmentKcal = 0;

  if (targetWeightKg > weightKg) {
    dailyAdjustmentKcal = Math.round((safeMonthlyPace * 7700) / 30);
  } else if (targetWeightKg < weightKg) {
    dailyAdjustmentKcal = -Math.round((safeMonthlyPace * 7700) / 30);
  }

  // Keep automatic targets within a controlled range. Users can still override
  // the final calorie goal through the existing custom-calorie setting.
  dailyAdjustmentKcal = Math.max(-750, Math.min(750, dailyAdjustmentKcal));

  const recommendedGoal = Math.max(
    1200,
    Math.round(maintenanceCalories + dailyAdjustmentKcal)
  );

  // Protein remains only a compatibility value here; the dedicated macro engine
  // will become the source of truth in the next phase.
  const proteinGoal = Math.round(safeWeight * 1.6);

  return {
    bmrCalories: Math.round(bmr),
    estimatedDailyNeed: maintenanceCalories,
    maintenanceCalories,
    recommendedGoal,
    proteinGoal,
    dailyAdjustmentKcal,
    targetPaceKgPerWeek: Math.round(targetPaceKgPerWeek * 100) / 100,
    projectionDisclaimer:
      'Kalori hedefi BMR, günlük hareketlilik ve spor verilerinden tahmin edilir. Kilo hedefi için kullanılan enerji ayarı seçilen hedef temposuna göre hesaplanır; sonuç tahmini bir günlük hedeftir, kesin enerji harcaması değildir.',
  };
}
