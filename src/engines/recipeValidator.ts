import { Shake, ShakeIngredient, UserProfile } from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';
import { validateRecipeStock } from './stockEngine';
import { calculateShakeNutrition } from './nutritionEngine';
import { analyzeCompatibility } from './compatibilityEngine';

export interface RecipeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingStock: {
    ingredientId: string;
    ingredientName: string;
    requiredNormalized: number;
    availableNormalized: number;
    deficitNormalized: number;
    retailDisplayDeficit: string;
  }[];
  nutrition: ReturnType<typeof calculateShakeNutrition>;
  compatibility: ReturnType<typeof analyzeCompatibility>;
}

/**
 * Validates a shake recipe against strict constraints:
 * 1. Base requirements (liquid or creamy base)
 * 2. User available stock (No negative stock allowed)
 * 3. Allergen warnings (compared with user profile)
 * 4. Realistic nutritional bounds
 */
export function validateShakeRecipe(
  ingredients: ShakeIngredient[],
  profile?: UserProfile | null,
  options: { checkStock?: boolean } = { checkStock: true }
): RecipeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Ingredients must not be empty
  if (!ingredients || ingredients.length === 0) {
    errors.push('Tarifte en az bir malzeme bulunmalıdır.');
  }

  // 2. Base check: Must have at least one liquid or base
  const hasBase = ingredients.some((item) => {
    const ing = INGREDIENT_MAP[item.ingredientId];
    return (
      ing?.shakeCompatibility === 'liquid' ||
      ing?.shakeCompatibility === 'base' ||
      ing?.category === 'dairy' ||
      item.ingredientId === 'other_water' ||
      item.ingredientId === 'other_mineral_water'
    );
  });

  if (!hasBase && ingredients.length > 0) {
    errors.push('Tarifte blender için uygun bir sıvı veya yoğurt bazı (ör. Süt, Yoğurt veya Su) bulunmalıdır.');
  }

  // 3. Stock verification (if checkStock is enabled)
  let missingStock: RecipeValidationResult['missingStock'] = [];
  if (options.checkStock) {
    const stockCheck = validateRecipeStock(
      ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        amount: i.amount || (i.quantity ? i.quantity : 0),
      }))
    );

    if (!stockCheck.isValid) {
      missingStock = stockCheck.missing;
      const deficitNames = missingStock.map((m) => `${m.ingredientName} (${m.retailDisplayDeficit} eksik)`).join(', ');
      errors.push(`Stok yetersiz! Eksik malzemeler: ${deficitNames}. Lütfen kilerinizi güncelleyin veya miktarı azaltın.`);
    }
  }

  // 4. Allergen check against user profile
  if (profile?.allergies && profile.allergies.length > 0) {
    for (const item of ingredients) {
      const ing = INGREDIENT_MAP[item.ingredientId];
      if (ing?.allergens) {
        for (const allergen of ing.allergens) {
          const matched = profile.allergies.some(
            (userAllergen) =>
              allergen.toLowerCase().includes(userAllergen.toLowerCase()) ||
              userAllergen.toLowerCase().includes(allergen.toLowerCase())
          );
          if (matched) {
            errors.push(`Alerjen Uyarısı: ${ing.name} içeriğinde bildirdiğiniz alerjen (${allergen}) bulunmaktadır!`);
          }
        }
      }
    }
  }

  // 5. Calculate nutrition and bounds
  const nutrition = calculateShakeNutrition(ingredients);
  if (nutrition.calories > 1500) {
    warnings.push(`Tarif kalorisi (${nutrition.calories} kcal) tek bir shake için çok yüksek.`);
  }

  // 6. Compatibility report
  const compatibility = analyzeCompatibility(ingredients);
  warnings.push(...compatibility.warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    missingStock,
    nutrition,
    compatibility,
  };
}
