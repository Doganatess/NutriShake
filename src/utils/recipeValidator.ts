import { INGREDIENT_MAP, INGREDIENTS_DATABASE } from '../data/ingredients';
import { calculateShakeNutrition } from './nutritionEngine';
import { Shake, ShakeIngredient, PortionPreference } from '../types';

export interface RecipeValidationOptions {
  forbiddenIngredientIds?: string[];
  mandatoryIngredientIds?: string[];
  targetKcal?: number;
  kcalTolerancePercent?: number; // e.g. 25%
  portionPreference?: PortionPreference;
  dislikedShakeNames?: string[];
  existingShakeNames?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedShake?: Shake;
}

/**
 * Validates a candidate shake against nutrition rules, ingredient states,
 * and liquid/portion consistency constraints.
 */
export function validateAndSanitizeShake(
  shakeCandidate: Partial<Shake>,
  options: RecipeValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const forbiddenSet = new Set(options.forbiddenIngredientIds || []);
  const mandatorySet = new Set(options.mandatoryIngredientIds || []);

  if (!shakeCandidate.name || shakeCandidate.name.trim().length === 0) {
    errors.push('Tarif adı eksik veya geçersiz.');
  }

  // Duplicate / disliked check
  if (options.dislikedShakeNames && shakeCandidate.name) {
    const isDisliked = options.dislikedShakeNames.some(
      (n) => n.toLowerCase().trim() === shakeCandidate.name!.toLowerCase().trim()
    );
    if (isDisliked) {
      warnings.push(`"${shakeCandidate.name}" kullanıcının beğenmediği tariflerle eşleşti.`);
    }
  }

  const rawIngredients = shakeCandidate.ingredients || [];
  if (rawIngredients.length === 0) {
    errors.push('Tarifte en az bir malzeme bulunmalıdır.');
    return { isValid: false, errors, warnings };
  }

  // 1. Filter and validate ingredients
  const validIngredients: ShakeIngredient[] = [];

  for (const item of rawIngredients) {
    if (!item.ingredientId || !INGREDIENT_MAP[item.ingredientId]) {
      warnings.push(`Bilinmeyen malzeme ID'si (${item.ingredientId}) tariften temizlendi.`);
      continue;
    }

    if (forbiddenSet.has(item.ingredientId)) {
      warnings.push(
        `Yasaklı ürün listesindeki "${INGREDIENT_MAP[item.ingredientId]?.name}" tariften başarıyla temizlendi.`
      );
      continue;
    }

    const safeAmount = Math.max(1, item.quantity !== undefined ? item.quantity : (item.amount || 10));
    validIngredients.push({
      ingredientId: item.ingredientId,
      amount: safeAmount,
      quantity: safeAmount,
      unit: item.unit || INGREDIENT_MAP[item.ingredientId]?.defaultServingUnit || 'g',
    });
  }

  // If no ingredients remained after cleaning, inject safe staple ingredients
  if (validIngredients.length === 0) {
    const safeLiquidId = !forbiddenSet.has('milk_whole')
      ? 'milk_whole'
      : !forbiddenSet.has('milk_semi_skimmed')
      ? 'milk_semi_skimmed'
      : !forbiddenSet.has('water_natural')
      ? 'water_natural'
      : 'mineral_water';
    const safeFruitId = !forbiddenSet.has('banana') ? 'banana' : !forbiddenSet.has('apple_red') ? 'apple_red' : 'strawberry';
    const safeGrainId = !forbiddenSet.has('oats_fine') ? 'oats_fine' : 'oats_rolled';

    validIngredients.push(
      { ingredientId: safeLiquidId, amount: 250, quantity: 250, unit: 'ml' },
      { ingredientId: safeFruitId, amount: 100, quantity: 100, unit: 'g' },
      { ingredientId: safeGrainId, amount: 40, quantity: 40, unit: 'g' }
    );
    warnings.push('Tarif güvenli temel malzemelerle otomatik olarak dengelendi.');
  }

  // 2. Liquid balance check: A shake must have at least one liquid/drink/dairy or sufficient hydration
  const hasLiquid = validIngredients.some((ing) => {
    const def = INGREDIENT_MAP[ing.ingredientId];
    return (
      def?.shakeCompatibility === 'liquid' ||
      def?.category === 'dairy'
    );
  });

  if (!hasLiquid) {
    // Automatically inject whole milk, semi-skimmed milk or natural water fallback to prevent solid blender paste
    const safeLiquidId = !forbiddenSet.has('milk_whole')
      ? 'milk_whole'
      : !forbiddenSet.has('milk_semi_skimmed')
      ? 'milk_semi_skimmed'
      : !forbiddenSet.has('water_natural')
      ? 'water_natural'
      : 'mineral_water';

    validIngredients.unshift({
      ingredientId: safeLiquidId,
      amount: 200,
      quantity: 200,
      unit: 'ml',
    });
    warnings.push(`İçim kıvamı için temel sıvı (${INGREDIENT_MAP[safeLiquidId]?.name}) eklendi.`);
  }

  // 3. Check mandatory ingredients coverage
  for (const mandId of mandatorySet) {
    const present = validIngredients.some((item) => item.ingredientId === mandId);
    if (!present && INGREDIENT_MAP[mandId]) {
      // Add mandatory ingredient with default serving if missing
      const mandDef = INGREDIENT_MAP[mandId];
      validIngredients.push({
        ingredientId: mandId,
        amount: mandDef.defaultServing || 25,
        quantity: mandDef.defaultServing || 25,
        unit: mandDef.defaultServingUnit || 'g',
      });
      warnings.push(`Zorunlu seçilmiş "${mandDef.name}" tarife koruma amacıyla dahil edildi.`);
    }
  }

  // 4. Calculate exact nutrition through deterministic engine
  const nutrition = calculateShakeNutrition(validIngredients);

  // 5. Target calorie tolerance check (if specified)
  if (options.targetKcal && options.targetKcal > 0) {
    const tolerance = options.kcalTolerancePercent ? options.kcalTolerancePercent / 100 : 0.35;
    const minAcceptable = options.targetKcal * (1 - tolerance);
    const maxAcceptable = options.targetKcal * (1 + tolerance);

    if (nutrition.calories < minAcceptable || nutrition.calories > maxAcceptable) {
      warnings.push(
        `Tarif kalorisi (${nutrition.calories} kcal) hedef aralığın (${Math.round(minAcceptable)}-${Math.round(maxAcceptable)} kcal) dışında, ancak besin değerleri kesin olarak güncellendi.`
      );
    }
  }

  const sanitizedShake: Shake = {
    id: shakeCandidate.id || `shake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: shakeCandidate.name || 'Özel Besleyici Shake',
    description: shakeCandidate.description || '',
    ingredients: nutrition.ingredients,
    estimatedCalories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    fiber: nutrition.fiber,
    estimatedCost: nutrition.estimatedCost,
    totalVolumeMl: nutrition.totalVolumeMl,
    instructions:
      shakeCandidate.instructions ||
      'Tüm malzemeleri blendera koyun ve pürüzsüz homojen kıvam alana dek 45-60 saniye karıştırın.',
    preparationTimeMinutes: shakeCandidate.preparationTimeMinutes || 3,
    portionSize: options.portionPreference || shakeCandidate.portionSize || 'medium',
    isCompleted: !!shakeCandidate.isCompleted,
    completedAt: shakeCandidate.completedAt,
    isFavorite: !!shakeCandidate.isFavorite,
    isDisliked: !!shakeCandidate.isDisliked,
    createdAt: shakeCandidate.createdAt || new Date().toISOString(),
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedShake,
  };
}
