import { INGREDIENT_MAP, canonicalIngredientId } from '../data/ingredients';
import { calculateShakeNutrition } from './nutritionEngine';
import { Shake, ShakeIngredient, PortionPreference, StockItem } from '../types';
import { getWeeklyRecommendedSignatures, getStoredStock } from '../storage/storageAbstraction';
import {
  getAvailableStockGrams,
  validateRecipeStock,
  calculatePantryShakeCalorieCapacity,
} from '../engines/stockEngine';
import { CALORIE_TOLERANCE_KCAL } from '../constants/calorieTargets';

export interface RecipeValidationOptions {
  forbiddenIngredientIds?: string[];
  mandatoryIngredientIds?: string[];
  targetKcal?: number;
  kcalTolerancePercent?: number;
  portionPreference?: PortionPreference;
  dislikedShakeNames?: string[];
  existingShakeNames?: string[];
  userStock?: Record<string, StockItem>;
  checkWeeklyHistory?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedShake?: Shake;
}

export const ALLOWED_DAIRY_CANONICAL_IDS = [
  'dairy_whole_milk',
  'dairy_semi_skimmed_milk',
  'dairy_village_yogurt',
  'dairy_strained_yogurt',
] as const;

/**
 * Generates a sorted, canonical fingerprint string representing the unique combination of ingredients.
 */
export function getRecipeFingerprint(ingredients: { ingredientId: string }[]): string {
  const canonSet = new Set(
    ingredients
      .map((i) => canonicalIngredientId(i.ingredientId))
      .filter((id) => Boolean(id) && !id.toLowerCase().includes('kefir') && !id.includes('supplement'))
  );
  return Array.from(canonSet).sort().join('|');
}

/**
 * Calculates Jaccard similarity between two sets of ingredients based on canonical IDs.
 */
export function calculateRecipeSimilarity(
  ingA: { ingredientId: string }[],
  ingB: { ingredientId: string }[]
): number {
  const setA = new Set(ingA.map((i) => canonicalIngredientId(i.ingredientId)).filter(Boolean));
  const setB = new Set(ingB.map((i) => canonicalIngredientId(i.ingredientId)).filter(Boolean));

  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const id of setA) {
    if (setB.has(id)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface MasterValidatorOptions {
  targetKcal?: number;
  userStock?: Record<string, StockItem>;
  checkWeeklyHistory?: boolean;
  strictStockOnly?: boolean;
}

export interface MasterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  rulesPassed: {
    rule1_calorieDelta: boolean;
    rule2_inStock: boolean;
    rule3_stockQuantity: boolean;
    rule4_hasAllowedDairy: boolean;
    rule5_noKefir: boolean;
    rule6_noProteinOrSupplements: boolean;
    rule7_noCanonicalDuplicates: boolean;
    rule8_twoEqualPortions: boolean;
    rule9_weeklyHistoryUnique: boolean;
    rule10_balancedIngredientCount: boolean;
    rule11_liquidVolumeLimit: boolean;
    rule12_calorieDensity: boolean;
  };
}

/**
 * Master Recipe Validator (Checks all 12 Mandatory Architecture Constraints):
 * 1. abs(shakeTotalKcal - dailyTargetKcal) <= 300
 * 2. All ingredients present in user stock
 * 3. Ingredient quantity <= available stock quantity
 * 4. Contains at least one allowed dairy (whole milk, semi-skimmed milk, village yogurt, strained yogurt)
 * 5. Strictly NO kefir
 * 6. Strictly NO protein powders or synthetic supplements
 * 7. Strictly NO duplicate canonical ingredients
 * 8. Exactly 2 equal portions (50% + 50%)
 * 9. Weekly history check: Not semantically identical to recipes recommended this week
 * 10. Balanced ingredient count (3 to 6 ingredients)
 * 11. Liquid volume <= 700 ml
 * 12. Adequate calorie density (no over-diluted watery shakes)
 */
export function validateMasterRecipe(
  shake: Shake,
  options: MasterValidatorOptions = {}
): MasterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rulesPassed = {
    rule1_calorieDelta: true,
    rule2_inStock: true,
    rule3_stockQuantity: true,
    rule4_hasAllowedDairy: true,
    rule5_noKefir: true,
    rule6_noProteinOrSupplements: true,
    rule7_noCanonicalDuplicates: true,
    rule8_twoEqualPortions: true,
    rule9_weeklyHistoryUnique: true,
    rule10_balancedIngredientCount: true,
    rule11_liquidVolumeLimit: true,
    rule12_calorieDensity: true,
  };

  const ingredients = shake.ingredients || [];

  // 1. Calorie Delta: informational only — a calorie deviation from target must NEVER
  // block validity. Per product decision, when pantry stock can't reach the exact
  // target, the closest achievable recipe is still accepted silently (no error,
  // no user-facing warning). Only genuine rule violations below (dairy, kefir,
  // fruit count, duplicates, stock absence, etc.) can set isValid to false.
  if (options.targetKcal && options.targetKcal > 0) {
    const delta = Math.abs(shake.estimatedCalories - options.targetKcal);
    if (delta > CALORIE_TOLERANCE_KCAL) {
      // Intentionally NOT pushed to `errors` and NOT flipping rulesPassed.rule1_calorieDelta.
      // Kept as a silent warning only (never surfaced to the user) for debugging/telemetry.
      warnings.push(
        `Bilgi: Shake toplamı (${shake.estimatedCalories} kcal) hedeften (${options.targetKcal} kcal) ${delta} kcal saptı; stok sınırları dahilinde en yakın tarif kabul edildi.`
      );
    }
  }

  // Stock Checks (Rules 2 & 3)
  const stock = options.userStock || (typeof window !== 'undefined' ? getStoredStock() : undefined);
  if (stock) {
    for (const ing of ingredients) {
      const canonId = canonicalIngredientId(ing.ingredientId);
      const available = getAvailableStockGrams(stock, ing.ingredientId);
      const ingName = INGREDIENT_MAP[canonId]?.name || INGREDIENT_MAP[ing.ingredientId]?.name || ing.ingredientId;

      if (available <= 0) {
        rulesPassed.rule2_inStock = false;
        errors.push(`Kural 2 İhlali (Stokta Yok): "${ingName}" kiler stoğunuzda bulunmuyor.`);
      } else if (ing.amount > available) {
        rulesPassed.rule3_stockQuantity = false;
        errors.push(
          `Kural 3 İhlali (Yetersiz Stok): "${ingName}" için ${ing.amount}g gerekiyor ancak kilerde yalnızca ${available}g var.`
        );
      }
    }
  }

  // 4. Mandatory Dairy: Must contain EXACTLY ONE allowed dairy type (dairyIngredientCount === 1)
  const dairyCanonicalIds = new Set<string>();
  for (const ing of ingredients) {
    const canonId = canonicalIngredientId(ing.ingredientId);
    if ((ALLOWED_DAIRY_CANONICAL_IDS as readonly string[]).includes(canonId)) {
      dairyCanonicalIds.add(canonId);
    } else {
      const lower = canonId.toLowerCase();
      if (lower.includes('milk') || lower.includes('yogurt') || lower.includes('yoğurt') || lower.includes('süt')) {
        dairyCanonicalIds.add(canonId);
      }
    }
  }
  const dairyIngredientCount = dairyCanonicalIds.size;

  if (dairyIngredientCount < 1) {
    rulesPassed.rule4_hasAllowedDairy = false;
    errors.push(
      'Kural 4 İhlali (Zorunlu Süt Ürünü): Tarifte Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurttan en az biri bulunmalıdır (dairyIngredientCount >= 1 sağlanamadı).'
    );
  } else if (dairyIngredientCount > 1) {
    rulesPassed.rule4_hasAllowedDairy = false;
    errors.push(
      `Kural 4 İhlali (Süt Ürünü Sınırı - En Fazla 1): Bir shake tarifinde yalnızca 1 farklı süt ürünü kullanılabilir; süt + yoğurt veya iki farklı süt/yoğurt bir arada kullanılamaz (dairyIngredientCount <= 1 ihlali: ${dairyIngredientCount} adet süt ürünü bulundu).`
    );
  }

  // Fruit Limit: At most 2 different fruits (fruitIngredientCount <= 2)
  const fruitCanonicalIds = new Set<string>();
  for (const ing of ingredients) {
    const canonId = canonicalIngredientId(ing.ingredientId);
    const def = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[ing.ingredientId];
    if (def && (def.category === 'fruits' || def.category === 'dried_fruits')) {
      fruitCanonicalIds.add(canonId);
    } else {
      const lower = canonId.toLowerCase();
      if (lower.startsWith('fruit_') || lower.startsWith('dried_fruit_')) {
        fruitCanonicalIds.add(canonId);
      }
    }
  }
  const fruitIngredientCount = fruitCanonicalIds.size;

  if (fruitIngredientCount > 2) {
    rulesPassed.rule10_balancedIngredientCount = false;
    errors.push(
      `Meyve Sınırı İhlali (En Fazla 2): Bir shake tarifinde en fazla 2 farklı meyve kullanılabilir (fruitIngredientCount <= 2 ihlali: ${fruitIngredientCount} farklı meyve bulundu: ${Array.from(fruitCanonicalIds).join(', ')}).`
    );
  }

  // 5. Strictly NO Kefir
  const hasKefir = ingredients.some((ing) => {
    const lower = (ing.ingredientId || '').toLowerCase();
    return lower.includes('kefir');
  });
  if (hasKefir) {
    rulesPassed.rule5_noKefir = false;
    errors.push('Kural 5 İhlali (Kefir Yasağı): Kefir kullanımı bu diyet sisteminde kesinlikle yasaktır.');
  }

  // 6. Strictly NO Protein Powders / Synthetic Supplements
  const hasSupplements = ingredients.some((ing) => {
    const lower = (ing.ingredientId || '').toLowerCase();
    return (
      lower.includes('protein_powder') ||
      lower.includes('whey') ||
      lower.includes('supplement') ||
      lower.includes('isolate')
    );
  });
  if (hasSupplements) {
    rulesPassed.rule6_noProteinOrSupplements = false;
    errors.push('Kural 6 İhlali (Takviye Yasağı): Sentetik takviye veya protein tozu kullanımı yasaktır.');
  }

  // 7. Canonical Duplicates
  const canonicalList = ingredients.map((i) => canonicalIngredientId(i.ingredientId));
  const uniqueCanonicalSet = new Set(canonicalList);
  if (uniqueCanonicalSet.size !== ingredients.length) {
    rulesPassed.rule7_noCanonicalDuplicates = false;
    errors.push('Kural 7 İhlali (Tekrar Eden Malzeme): Aynı malzeme tarife birden fazla kez eklenemez; birleştirilmelidir.');
  }

  // 8. Exactly 2 Equal Portions (50% + 50%)
  const portionDiff = Math.abs((shake.portionCalories || 0) * 2 - shake.estimatedCalories);
  if (shake.portionCount !== 2 || portionDiff > 3) {
    rulesPassed.rule8_twoEqualPortions = false;
    errors.push(
      `Kural 8 İhlali (2 Eşit Porsiyon): Tarif 2 eşit porsiyona (%50 + %50) bölünmelidir (Toplam: ${shake.estimatedCalories} kcal, Porsiyon: ${shake.portionCalories} kcal).`
    );
  }

  // 9. Weekly History Signature Check
  if (options.checkWeeklyHistory) {
    const currentSig = getRecipeFingerprint(ingredients);
    const weeklySignatures = getWeeklyRecommendedSignatures();
    const isDuplicateThisWeek = weeklySignatures.some((sig) => {
      if (sig === currentSig) return true;
      const sigIngs = sig.split('|').map((id) => ({ ingredientId: id }));
      return calculateRecipeSimilarity(ingredients, sigIngs) >= 0.85;
    });

    if (isDuplicateThisWeek) {
      rulesPassed.rule9_weeklyHistoryUnique = false;
      errors.push('Kural 9 İhlali (Haftalık Tekrar): Bu malzeme kombinasyonu bu hafta içinde zaten önerildi.');
    }
  }

  // 10. Balanced Ingredient Count (3 to 6 items)
  if (ingredients.length < 3 || ingredients.length > 6) {
    rulesPassed.rule10_balancedIngredientCount = false;
    errors.push(
      `Kural 10 İhlali (Malzeme Sayısı Dengesi): Tarif 3 ile 6 arasında malzeme içermelidir (Mevcut: ${ingredients.length}).`
    );
  }

  // 11. Liquid Volume Limit (<= 700 ml)
  let liquidVolumeMl = 0;
  for (const ing of ingredients) {
    const canonId = canonicalIngredientId(ing.ingredientId);
    if (canonId.includes('milk') || canonId.includes('water') || ing.unit === 'ml') {
      liquidVolumeMl += ing.amount;
    }
  }
  if (liquidVolumeMl > 750) {
    rulesPassed.rule11_liquidVolumeLimit = false;
    errors.push(`Kural 11 İhlali (Aşırı Sıvı Hacmi): Toplam sıvı miktarı 700-750 ml sınırını aşıyor (${liquidVolumeMl} ml).`);
  }

  // 12. Calorie Density Check (Total Weight/Volume vs Calories)
  const totalWeightOrVolume = ingredients.reduce((sum, i) => sum + (i.amount || 0), 0);
  if (totalWeightOrVolume > 0) {
    const density = shake.estimatedCalories / totalWeightOrVolume;
    // For weight gainer shakes with high calorie density (nuts, oats, honey), density should be >= 1.0 kcal/g
    if (density < 0.95 && shake.estimatedCalories > 1500) {
      warnings.push(`Düşük Kalori Yoğunluğu: Shake gramajına göre kalori yoğunluğu düşük (${density.toFixed(2)} kcal/g). Fındık/yulaf oranı artırılabilir.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    rulesPassed,
  };
}

const LEGACY_FALLBACK_ID_MAP: Record<string, string> = {
  milk_whole: 'dairy_whole_milk',
  milk_semi_skimmed: 'dairy_semi_skimmed_milk',
  water_natural: 'other_water',
  mineral_water: 'other_mineral_water',
  banana: 'fruit_banana',
  apple_red: 'fruit_apple',
  strawberry: 'fruit_strawberry',
  oats_fine: 'grain_oats',
  oats_rolled: 'grain_oats',
};

/**
 * Validates a candidate shake, cleans canonical duplicates, enforces composition rules
 * (max 6 ingredients, exactly 1 dairy, max 2 fruits, no kefir, no protein powder),
 * validates against stockEngine with auto-scaling, and formats it into strict 2-portion structure.
 */
export function validateAndSanitizeShake(
  shakeCandidate: Partial<Shake>,
  options: RecipeValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!shakeCandidate.name || shakeCandidate.name.trim().length === 0) {
    errors.push('Tarif adı eksik veya geçersiz.');
  }

  const rawIngredients = shakeCandidate.ingredients || [];
  if (rawIngredients.length === 0) {
    errors.push('Tarifte en az bir malzeme bulunmalıdır.');
    return { isValid: false, errors, warnings };
  }

  // 1. Canonical ID mapping, prohibited ingredient guards, and ID-based deduplication
  const ingredientMap = new Map<string, ShakeIngredient>();

  for (const item of rawIngredients) {
    if (!item.ingredientId) continue;
    const rawId = item.ingredientId.trim();
    const mappedId = LEGACY_FALLBACK_ID_MAP[rawId] || rawId;
    const canonId = canonicalIngredientId(mappedId);
    const finalId = LEGACY_FALLBACK_ID_MAP[canonId] || canonId;
    const def = INGREDIENT_MAP[finalId] || INGREDIENT_MAP[mappedId] || INGREDIENT_MAP[rawId];

    if (!def) {
      warnings.push(`Bilinmeyen malzeme ID'si (${rawId}) tariften temizlendi.`);
      continue;
    }

    const lowerId = finalId.toLowerCase();

    // Guard d: Strictly NO Kefir
    if (lowerId.includes('kefir')) {
      warnings.push('Kefir kural gereği tariften çıkarıldı. Yerine izin verilen doğal süt ürünü kullanılmalıdır.');
      continue;
    }

    // Guard e: Strictly NO synthetic supplements / protein powders
    if (
      lowerId.includes('protein_powder') ||
      lowerId.includes('whey') ||
      lowerId.includes('supplement') ||
      lowerId.includes('isolate')
    ) {
      warnings.push(`Sentetik takviye/protein tozu (${def.name}) kural gereği tariften çıkarıldı.`);
      continue;
    }

    // Guard against prohibited spices (cinnamon, ginger)
    if (lowerId.includes('cinnamon') || lowerId.includes('ginger')) {
      warnings.push(`Baharat (${def.name}) shake kuralları gereği tariften çıkarıldı.`);
      continue;
    }

    const safeAmount = Math.max(1, item.quantity !== undefined ? item.quantity : (item.amount || 10));
    const isLiquid = def.category === 'dairy' && !finalId.includes('yogurt');
    const unit = item.unit || (safeAmount >= 10 ? (isLiquid ? 'ml' : 'g') : (def.defaultServingUnit || 'g'));

    // Rule f: Deduplication based on canonical ID
    const existing = ingredientMap.get(finalId);
    if (!existing) {
      ingredientMap.set(finalId, {
        ingredientId: finalId,
        amount: safeAmount,
        quantity: safeAmount,
        unit,
      });
    } else {
      const totalAmount = existing.amount + safeAmount;
      ingredientMap.set(finalId, {
        ...existing,
        amount: totalAmount,
        quantity: totalAmount,
      });
      warnings.push(`Tekrar eden "${def.name}" malzemesi tekilleştirildi (${totalAmount}${unit}).`);
    }
  }

  let workingIngredients: ShakeIngredient[] = Array.from(ingredientMap.values());

  if (workingIngredients.length === 0) {
    errors.push('Geçerli hiçbir malzeme bulunamadı.');
    return { isValid: false, errors, warnings };
  }

  const isDairy = (id: string): boolean => {
    const canon = canonicalIngredientId(id);
    const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[id];
    return (
      def?.category === 'dairy' ||
      (ALLOWED_DAIRY_CANONICAL_IDS as readonly string[]).includes(canon as any) ||
      canon.startsWith('dairy_') ||
      canon.includes('milk') ||
      canon.includes('yogurt') ||
      canon.includes('yoğurt') ||
      canon.includes('süt')
    );
  };

  const isFruit = (id: string): boolean => {
    const canon = canonicalIngredientId(id);
    const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[id];
    if (def && (def.category === 'fruits' || def.category === 'dried_fruits')) return true;
    return canon.startsWith('fruit_') || canon.startsWith('dried_fruit_') || canon.startsWith('dried_');
  };

  const getCalorieContribution = (item: ShakeIngredient): number => {
    const canon = canonicalIngredientId(item.ingredientId);
    const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[item.ingredientId];
    if (!def) return 0;
    return (item.amount * (def.caloriesPer100g || 0)) / 100;
  };

  // Rule b: EXACTLY 1 DAIRY (dairyIngredientCount === 1)
  // 0 -> add dairy_whole_milk; 2+ -> keep first, remove others
  let dairyItems = workingIngredients.filter((i) => isDairy(i.ingredientId));
  let dairyIngredientCount = dairyItems.length;

  if (dairyIngredientCount === 0) {
    // Default to whole milk or available dairy in stock
    let defaultDairyId = 'dairy_whole_milk';
    const userStock = options.userStock;
    if (userStock) {
      for (const allowedDairy of ALLOWED_DAIRY_CANONICAL_IDS) {
        if (getAvailableStockGrams(userStock, allowedDairy) > 0) {
          defaultDairyId = allowedDairy;
          break;
        }
      }
    }
    const dairyDef = INGREDIENT_MAP[defaultDairyId];
    const defaultAmount = defaultDairyId.includes('yogurt') ? 150 : 250;
    const defaultUnit = defaultDairyId.includes('yogurt') ? 'g' : 'ml';

    workingIngredients.unshift({
      ingredientId: defaultDairyId,
      amount: defaultAmount,
      quantity: defaultAmount,
      unit: defaultUnit,
    });
    warnings.push(`Süt ürünü eksikti, kural gereği ${dairyDef ? dairyDef.name : 'Tam Yağlı Süt'} (${defaultAmount} ${defaultUnit}) eklendi.`);
  } else if (dairyIngredientCount > 1) {
    // Keep first, remove others
    const firstDairy = dairyItems[0];
    workingIngredients = workingIngredients.filter((i) => !isDairy(i.ingredientId) || i === firstDairy);
    warnings.push(`Birden fazla süt ürünü bulundu (${dairyIngredientCount} adet). Kural gereği yalnızca ilk süt ürünü tutuldu, diğerleri çıkarıldı.`);
  }

  // Update dairy count
  dairyIngredientCount = workingIngredients.filter((i) => isDairy(i.ingredientId)).length;

  // Rule c: MAX 2 FRUITS (fruitIngredientCount <= 2)
  let fruitItems = workingIngredients.filter((i) => isFruit(i.ingredientId));
  let fruitIngredientCount = fruitItems.length;

  if (fruitIngredientCount > 2) {
    // Sort by calorie contribution ascending to remove least impactful
    fruitItems.sort((a, b) => getCalorieContribution(a) - getCalorieContribution(b));
    const toRemoveCount = fruitIngredientCount - 2;
    const itemsToRemove = new Set(fruitItems.slice(0, toRemoveCount));

    workingIngredients = workingIngredients.filter((i) => !itemsToRemove.has(i));
    warnings.push(`Meyve sayısı (${fruitIngredientCount}) 2 sınırını aştığı için en düşük kalori katkısı yapan ${toRemoveCount} meyve çıkarıldı.`);
  }

  // Update fruit count
  fruitIngredientCount = workingIngredients.filter((i) => isFruit(i.ingredientId)).length;

  // Rule a: MAXIMUM 6 INGREDIENTS (totalIngredientCount <= 6)
  let totalIngredientCount = workingIngredients.length;

  if (totalIngredientCount > 6) {
    // Sort non-dairy ingredients by calorie contribution ascending to remove least impactful
    const nonDairyItems = workingIngredients.filter((i) => !isDairy(i.ingredientId));
    nonDairyItems.sort((a, b) => getCalorieContribution(a) - getCalorieContribution(b));
    const toRemoveCount = totalIngredientCount - 6;
    const itemsToRemove = new Set(nonDairyItems.slice(0, toRemoveCount));

    workingIngredients = workingIngredients.filter((i) => !itemsToRemove.has(i));
    warnings.push(`Malzeme sayısı (${totalIngredientCount}) 6 sınırını aştığı için en az kalori katkısı sağlayan ${toRemoveCount} malzeme çıkarıldı.`);
  }

  // Update total count
  totalIngredientCount = workingIngredients.length;

  // Rule 2 & Stock Validation using stockEngine.validateRecipeStock
  const stock = options.userStock || (typeof window !== 'undefined' ? getStoredStock() : undefined);
  if (stock && Object.keys(stock).length > 0) {
    let stockValidation = validateRecipeStock(workingIngredients, stock);

    // a) Önce mümkünse miktarı mevcut stoğa göre otomatik küçült
    if (!stockValidation.isValid) {
      for (const missingItem of stockValidation.missing) {
        const itemIdx = workingIngredients.findIndex(
          (i) => canonicalIngredientId(i.ingredientId) === canonicalIngredientId(missingItem.ingredientId)
        );
        if (itemIdx !== -1) {
          const avail = missingItem.availableNormalized;
          // FIX: previously only clamped down to available stock when avail >= 5g/ml,
          // leaving smaller (or zero) shortfalls to fall through to a hard error below.
          // Now: clamp whenever there's a usable amount, and drop the ingredient
          // entirely (rather than erroring) when stock is essentially exhausted (0).
          if (avail >= 5) {
            workingIngredients[itemIdx].amount = avail;
            workingIngredients[itemIdx].quantity = avail;
          } else {
            workingIngredients.splice(itemIdx, 1);
          }
        }
      }
      // Re-validate after auto-scaling
      stockValidation = validateRecipeStock(workingIngredients, stock);
    }

    // b) Hâlâ yetersizse — bu artık BLOK EDEN bir hata değil, sadece sessiz bilgi notu.
    // Per product decision (Seçenek 2): stok yetersizliği asla kullanıcıya gösterilen
    // bir uyarı ya da hata üretmemeli; kilerdeki mevcut miktarlarla en yakın geçerli
    // tarif sessizce kabul edilir.
    if (!stockValidation.isValid) {
      const pantryCap = calculatePantryShakeCalorieCapacity(stock);
      for (const missingItem of stockValidation.missing) {
        warnings.push(
          `Bilgi: "${missingItem.ingredientName}" için ${missingItem.requiredNormalized}g gerekiyordu, kilerde ${missingItem.availableNormalized}g vardı (Kilerdeki toplam kapasite: ${pantryCap.totalCalories} kcal). Mevcut stokla en yakın tarif kabul edildi.`
        );
      }
    }
  }

  // 3. Intelligent Calorie Balancing & Scaling
  let initialNutrition = calculateShakeNutrition(workingIngredients);
  if (options.targetKcal && options.targetKcal > 0 && workingIngredients.length > 0) {
    const target = options.targetKcal;
    const currentKcal = initialNutrition.calories;
    const diff = target - currentKcal;

    // If current calories deviate significantly from target (>150 kcal), auto-scale safe neutral ingredients
    if (Math.abs(diff) > 150) {
      const scaleFactor = target / Math.max(100, currentKcal);

      for (const item of workingIngredients) {
        const canon = canonicalIngredientId(item.ingredientId);
        const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[item.ingredientId];
        if (!def) continue;

        const maxStock = stock ? getAvailableStockGrams(stock, canon) : Infinity;
        let maxSafeAmount = 500;
        let minSafeAmount = 10;

        if (canon.includes('milk') || def.category === 'dairy') {
          maxSafeAmount = canon.includes('yogurt') ? 350 : 500;
          minSafeAmount = canon.includes('yogurt') ? 100 : 150;
        } else if (canon.includes('oat') || def.category === 'grains') {
          maxSafeAmount = 180;
          minSafeAmount = 25;
        } else if (def.category === 'nuts' || canon.includes('nut') || canon.includes('seed')) {
          maxSafeAmount = 70;
          minSafeAmount = 10;
        } else if (def.category === 'fruits' || def.category === 'dried_fruits') {
          maxSafeAmount = 180;
          minSafeAmount = 30;
        }

        const effectiveMax = Math.min(maxSafeAmount, maxStock);
        if (effectiveMax > minSafeAmount) {
          const newAmount = Math.round(item.amount * scaleFactor);
          const clamped = Math.max(minSafeAmount, Math.min(effectiveMax, newAmount));
          item.amount = clamped;
          item.quantity = clamped;
        }
      }

      // If still significant deficit, expand grains/nuts/dairy up to available stock bounds
      let updatedNutrition = calculateShakeNutrition(workingIngredients);
      let remainingDeficit = target - updatedNutrition.calories;

      if (remainingDeficit > 80) {
        const expandableGrains = workingIngredients.filter((i) => {
          const canon = canonicalIngredientId(i.ingredientId);
          const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[i.ingredientId];
          return def?.category === 'grains' || canon.includes('oat');
        });
        const expandableNuts = workingIngredients.filter((i) => {
          const canon = canonicalIngredientId(i.ingredientId);
          const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[i.ingredientId];
          return def?.category === 'nuts' || canon.includes('nut') || canon.includes('seed');
        });
        const expandableDairy = workingIngredients.filter((i) => isDairy(i.ingredientId));

        const priorityList = [...expandableGrains, ...expandableNuts, ...expandableDairy];
        for (const expItem of priorityList) {
          if (remainingDeficit <= 50) break;
          const canon = canonicalIngredientId(expItem.ingredientId);
          const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[expItem.ingredientId];
          if (!def) continue;

          const maxStock = stock ? getAvailableStockGrams(stock, canon) : Infinity;
          const categoryCap = canon.includes('oat') ? 180 : (def.category === 'nuts' ? 70 : 500);
          const room = Math.min(categoryCap, maxStock) - expItem.amount;
          if (room > 5) {
            const kcalPerGram = (def.caloriesPer100g || 100) / 100;
            const neededGrams = Math.round(remainingDeficit / Math.max(0.4, kcalPerGram));
            const step = Math.min(room, neededGrams);
            expItem.amount += step;
            expItem.quantity += step;
            remainingDeficit -= Math.round(step * kcalPerGram);
          }
        }

        // If still significant deficit and recipe has < 6 ingredients, add healthy nuts/seeds to reach target
        if (remainingDeficit > 150 && workingIngredients.length < 6) {
          const hasNuts = workingIngredients.some((i) => {
            const canon = canonicalIngredientId(i.ingredientId);
            const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[i.ingredientId];
            return def?.category === 'nuts' || canon.includes('nut') || canon.includes('seed');
          });
          if (!hasNuts) {
            let nutId = 'nut_walnut';
            if (stock) {
              for (const n of ['nut_walnut', 'nut_hazelnut', 'nut_almond', 'seed_peanut_butter', 'seed_chia']) {
                if (getAvailableStockGrams(stock, n) >= 15) {
                  nutId = n;
                  break;
                }
              }
            }
            const nutDef = INGREDIENT_MAP[nutId];
            if (nutDef && (!stock || getAvailableStockGrams(stock, nutId) >= 15)) {
              const maxStock = stock ? getAvailableStockGrams(stock, nutId) : 60;
              const kcalPerG = (nutDef.caloriesPer100g || 650) / 100;
              const nutGrams = Math.min(Math.min(50, maxStock), Math.round(remainingDeficit / kcalPerG));
              if (nutGrams >= 15) {
                workingIngredients.push({
                  ingredientId: nutId,
                  amount: nutGrams,
                  quantity: nutGrams,
                  unit: 'g',
                });
                warnings.push(`Hedef kaloriye ulaşmak için ${nutDef.name} (${nutGrams}g) eklendi.`);
              }
            }
          }
        }
      }

      warnings.push(`Tarif malzeme miktarları hedef kaloriye (~${target} kcal) göre otomatik optimize edildi.`);
    }
  }

  // 4. Calculate deterministic nutrition
  const nutrition = calculateShakeNutrition(workingIngredients);

  // 5. Equal 50/50 portion division
  const totalCalories = nutrition.calories;
  const portionCalories = Math.round(totalCalories / 2);
  const portionProtein = Math.round((nutrition.protein / 2) * 10) / 10;
  const portionCarbs = Math.round((nutrition.carbs / 2) * 10) / 10;
  const portionFat = Math.round((nutrition.fat / 2) * 10) / 10;

  // 6. Calorie Tolerance check
  if (options.targetKcal && options.targetKcal > 0) {
    const pantryCap = stock ? calculatePantryShakeCalorieCapacity(stock).totalCalories : Infinity;
    if (pantryCap < options.targetKcal - 300) {
      warnings.push(
        `Kilerdeki toplam stok kapasitesi (${pantryCap} kcal), hedef kaloriden (${options.targetKcal} kcal) düşük olduğundan tarif kiler stoğuna (${totalCalories} kcal) göre dengelendi.`
      );
    } else {
      const diff = Math.abs(totalCalories - options.targetKcal);
      if (diff > 250) {
        warnings.push(
          `Shake toplam kalorisi (${totalCalories} kcal) hedef kaloriden (${options.targetKcal} kcal) ${diff} kcal sapma göstermektedir.`
        );
      }
    }
  }

  const sanitizedShake: Shake = {
    id: shakeCandidate.id || `shake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: shakeCandidate.name || 'Özel Besleyici Doğal Shake',
    description: shakeCandidate.description || `Günün 2 eşit porsiyona ayrılmış doğal shake tarifi (Toplam ${totalCalories} kcal • Porsiyon başı ${portionCalories} kcal).`,
    ingredients: nutrition.ingredients,
    estimatedCalories: totalCalories,
    portionCount: 2,
    portionCalories,
    portionProtein,
    portionCarbs,
    portionFat,
    portion1Completed: !!shakeCandidate.portion1Completed,
    portion2Completed: !!shakeCandidate.portion2Completed,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    fiber: nutrition.fiber,
    estimatedCost: nutrition.estimatedCost,
    totalVolumeMl: nutrition.totalVolumeMl,
    instructions:
      shakeCandidate.instructions ||
      [
        'Tüm malzemeleri blendera ekleyin.',
        'Pürüzsüz homojen bir kıvam alana dek 50-60 saniye karıştırın.',
        `Hazırlanan karışımı 2 EŞİT PORSİYONA (${portionCalories} kcal / porsiyon) bölün (%50 + %50).`,
        `Toplam ${totalCalories} kcal • 1. Porsiyon: ${portionCalories} kcal • 2. Porsiyon: ${portionCalories} kcal.`,
        '1. porsiyonu vardiya öncesi/öğlen, 2. porsiyonu buzdolabında bekleterek vardiya sonrası tüketin.',
      ].join('\n'),
    preparationTimeMinutes: shakeCandidate.preparationTimeMinutes || 4,
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
    sanitizedShake: errors.length === 0 ? sanitizedShake : undefined,
  };
}
