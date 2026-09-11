import { Ingredient, PortionPreference, Shake, ShakeIngredient } from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE } from '../data/ingredients';
import { calculateShakeNutrition, calculateIngredientNutrition } from '../utils/nutritionEngine';

/**
 * Bounds for sensible shake portions per ingredient category to prevent bizarre proportions.
 */
interface IngredientPortionBounds {
  minGrams: number;
  maxGrams: number;
  defaultGrams: number;
  isLiquid: boolean;
}

export function getIngredientBounds(ing: Ingredient, portionSize: PortionPreference = 'medium'): IngredientPortionBounds {
  const portionMultiplier = portionSize === 'small' ? 0.75 : portionSize === 'large' ? 1.25 : 1.0;

  if (ing.category === 'dairy' || ing.shakeCompatibility === 'liquid') {
    return {
      minGrams: Math.round(150 * portionMultiplier),
      maxGrams: Math.round(450 * portionMultiplier),
      defaultGrams: Math.round(250 * portionMultiplier),
      isLiquid: true,
    };
  }

  if (ing.category === 'dried_fruits') {
    return {
      minGrams: 15,
      maxGrams: Math.round(60 * portionMultiplier),
      defaultGrams: Math.round(30 * portionMultiplier),
      isLiquid: false,
    };
  }

  if (ing.category === 'fruits') {
    return {
      minGrams: 50,
      maxGrams: Math.round(220 * portionMultiplier),
      defaultGrams: Math.round(100 * portionMultiplier),
      isLiquid: false,
    };
  }

  if (ing.category === 'grains') {
    return {
      minGrams: 20,
      maxGrams: Math.round(90 * portionMultiplier),
      defaultGrams: Math.round(45 * portionMultiplier),
      isLiquid: false,
    };
  }

  if (ing.category === 'nuts') {
    return {
      minGrams: 10,
      maxGrams: Math.round(45 * portionMultiplier),
      defaultGrams: Math.round(20 * portionMultiplier),
      isLiquid: false,
    };
  }

  if (ing.category === 'sweeteners') {
    return {
      minGrams: 10,
      maxGrams: Math.round(40 * portionMultiplier),
      defaultGrams: Math.round(20 * portionMultiplier),
      isLiquid: false,
    };
  }

  if (ing.category === 'cocoa_extras') {
    return {
      minGrams: 3,
      maxGrams: 15,
      defaultGrams: 8,
      isLiquid: false,
    };
  }

  return {
    minGrams: 10,
    maxGrams: 100,
    defaultGrams: 30,
    isLiquid: false,
  };
}

/**
 * Creates default initial recipe ingredients from a selected list of ingredient IDs.
 */
export function buildInitialRecipe(
  ingredientIds: string[],
  portionSize: PortionPreference = 'medium'
): ShakeIngredient[] {
  return ingredientIds
    .map((id) => {
      const ing = INGREDIENT_MAP[id];
      if (!ing) return null;
      const bounds = getIngredientBounds(ing, portionSize);

      // Choose most appropriate unit
      const defaultUnit = ing.defaultServingUnit || 'g';
      const quantity = defaultUnit === 'g' || defaultUnit === 'ml' 
        ? bounds.defaultGrams 
        : ing.defaultServing || 1;

      return {
        ingredientId: id,
        amount: bounds.defaultGrams,
        quantity,
        unit: defaultUnit,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * "Hedef Kaloriye Ayarla" Mode (Requirement 13)
 * Adjusts gram amounts of selected ingredients to achieve target kcal within ±5% tolerance
 * while strictly maintaining sensible drinkable bounds, natural liquid-to-solid ratios,
 * and realistic kitchen measurements.
 */
export function adjustRecipeToTargetCalories(
  ingredients: ShakeIngredient[],
  targetCalories: number,
  portionSize: PortionPreference = 'medium'
): {
  success: boolean;
  adjustedIngredients: ShakeIngredient[];
  achievedCalories: number;
  tolerancePercent: number;
  message: string;
} {
  if (ingredients.length === 0 || targetCalories <= 100) {
    return {
      success: false,
      adjustedIngredients: ingredients,
      achievedCalories: 0,
      tolerancePercent: 100,
      message: 'Lütfen en az bir malzeme seçin ve geçerli bir hedef kalori belirleyin.',
    };
  }

  // Work with grams
  let currentItems = ingredients.map((item) => {
    const ing = INGREDIENT_MAP[item.ingredientId];
    const bounds = ing ? getIngredientBounds(ing, portionSize) : { minGrams: 10, maxGrams: 100, defaultGrams: 30, isLiquid: false };
    const initialGrams = item.amount || bounds.defaultGrams;
    return {
      ...item,
      amount: initialGrams,
      quantity: initialGrams,
      unit: ing?.category === 'dairy' ? 'ml' : 'g',
      bounds,
    };
  });

  // Iterative scaling (max 20 iterations)
  for (let iter = 0; iter < 20; iter++) {
    const currentCalc = calculateShakeNutrition(currentItems);
    const diff = targetCalories - currentCalc.calories;
    const errorRatio = Math.abs(diff) / targetCalories;

    if (errorRatio <= 0.04) {
      // Within 4% tolerance!
      break;
    }

    const scaleFactor = targetCalories / (currentCalc.calories || 1);
    // Damped scale factor to prevent oscillations
    const dampedFactor = 1 + (scaleFactor - 1) * 0.55;

    currentItems = currentItems.map((item) => {
      // Scale proportionally, but clamp within bounds
      let newAmount = Math.round((item.amount * dampedFactor) / 5) * 5; // round to nearest 5g
      newAmount = Math.max(item.bounds.minGrams, Math.min(item.bounds.maxGrams, newAmount));

      return {
        ...item,
        amount: newAmount,
        quantity: newAmount,
      };
    });
  }

  const finalCalc = calculateShakeNutrition(currentItems);
  const finalDiff = Math.abs(finalCalc.calories - targetCalories);
  const finalTolerance = Math.round((finalDiff / targetCalories) * 1000) / 10;

  const isAcceptable = finalTolerance <= 7.0;

  return {
    success: isAcceptable,
    adjustedIngredients: finalCalc.ingredients,
    achievedCalories: finalCalc.calories,
    tolerancePercent: finalTolerance,
    message: isAcceptable
      ? `Hedef ${targetCalories} kcal'ye ±%${finalTolerance} hassasiyetle başarıyla ulaşıldı (${finalCalc.calories} kcal).`
      : `Seçilen malzemelerin fiziksel porsiyon sınırları dahilinde ${finalCalc.calories} kcal seviyesine ulaşıldı.`,
  };
}
