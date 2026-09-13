/**
 * @deprecated BU DOSYA ESKİ KOPYADIR (DEPRECATED).
 * Aktif ve güncel validator: src/utils/recipeValidator.ts dosyasındaki validateMasterRecipe ve validateAndSanitizeShake fonksiyonlarıdır.
 * Geriye dönük uyumluluk için bu dosya korunmakta olup yeni geliştirmelerde src/utils/recipeValidator.ts kullanılmalıdır.
 */

import { Shake, ShakeIngredient, UserProfile } from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';
import { validateRecipeStock } from './stockEngine';
import { calculateShakeNutrition } from './nutritionEngine';
import { analyzeCompatibility } from './compatibilityEngine';
import { mergeDuplicateIngredients } from './recipeCompositionEngine';

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
 * 1. Base requirements (liquid or creamy dairy base)
 * 2. User available stock (No negative stock allowed)
 * 3. Allergen warnings (compared with user profile)
 * 4. Realistic nutritional bounds
 */
export function validateShakeRecipe(
  rawIngredients: ShakeIngredient[],
  profile?: UserProfile | null,
  options: { checkStock?: boolean } = { checkStock: true }
): RecipeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ingredients = mergeDuplicateIngredients(rawIngredients || []);

  // 1. Ingredients must not be empty
  if (!ingredients || ingredients.length === 0) {
    errors.push('Tarifte en az bir malzeme bulunmalıdır.');
  }

  // 2. Consistency & Texture Rule: Must have at least one allowed dairy item
  // Sadece şu 4 seçenek kabul edilir: Tam yağlı süt, Yarım yağlı süt, Köy yoğurdu, Süzme yoğurt. Kefir YOK!
  const ALLOWED_DAIRY = ['dairy_whole_milk', 'dairy_semi_skimmed_milk', 'dairy_village_yogurt', 'dairy_strained_yogurt'];
  const hasDairy = ingredients.some((item) => ALLOWED_DAIRY.includes(item.ingredientId));

  if (!hasDairy && ingredients.length > 0) {
    errors.push('Kıvam ve besin dengesi için tarifte en az bir süt ürünü (Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurt) bulunmalıdır.');
  }

  // Explicit ban on kefir and supplements
  const hasKefir = ingredients.some((item) => item.ingredientId.toLowerCase().includes('kefir'));
  if (hasKefir) {
    errors.push('Kefir bu programda süt ürünü olarak kabul edilmemektedir. Lütfen Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurt tercih edin.');
  }

  const hasSupplement = ingredients.some((item) => {
    return item.ingredientId.includes('protein') || item.ingredientId.includes('supplement') || item.ingredientId.includes('whey');
  });
  if (hasSupplement) {
    errors.push('Takviye veya protein tozu kullanımı bu programda kabul edilmemektedir. Sadece doğal besinler kullanılabilir.');
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
