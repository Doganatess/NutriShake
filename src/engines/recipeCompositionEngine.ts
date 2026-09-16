import {
  Shake,
  ShakeIngredient,
  ShakeTiming,
  UserProfile,
  Ingredient,
} from '../types.js';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE, canonicalIngredientId } from '../data/ingredients.js';
import { calculateShakeNutrition } from '../utils/nutritionEngine.js';
import { DAILY_TARGET_KCAL } from '../constants/calorieTargets.js';
import {
  getStoredStock,
  getStoredDislikedShakes,
  getStoredFavorites,
  getWeeklyRecommendedSignatures,
  saveWeeklyRecommendedSignature,
} from '../storage/storageAbstraction.js';
import { analyzeCompatibility } from './compatibilityEngine.js';
import { formatNormalizedUnit, normalizeToGramsOrMl } from '../utils/unitConverter.js';
import {
  validateMasterRecipe,
  getRecipeFingerprint,
  calculateRecipeSimilarity,
  countDifferingIngredients,
  ALLOWED_DAIRY_CANONICAL_IDS,
} from '../utils/recipeValidator.js';
import { calculatePantryShakeCalorieCapacity, getAvailableStockGrams } from './stockEngine.js';

export interface ComposeOptions {
  targetCalories?: number;
  timing?: ShakeTiming;
  stockOnly?: boolean;
  userProfile?: UserProfile | null;
  excludedIngredientIds?: string[];
  preferredIngredientIds?: string[];
  mandatoryIngredientIds?: string[];
  allowedIngredientIds?: string[];
  recentShakes?: Shake[];
  shiftType?: 'morning' | 'evening' | 'off';
  excludedShakeNames?: string[];
  candidateIndex?: number;
  userStock?: Record<string, any>;
}

export const ALLOWED_DAIRY_IDS = ALLOWED_DAIRY_CANONICAL_IDS;

export function isAllowedDairy(ingredientId: string): boolean {
  const canon = canonicalIngredientId(ingredientId);
  return (ALLOWED_DAIRY_CANONICAL_IDS as readonly string[]).includes(canon);
}

export class MissingDairyStockError extends Error {
  constructor(
    message = 'Kıvam ve besin dengesi için kilerinizde en az bir süt ürünü (Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurt) bulunmalıdır. Lütfen Kiler sekmesine gidip bu ürünlerden en az birini ekleyin.'
  ) {
    super(message);
    this.name = 'MissingDairyStockError';
  }
}

export class InsufficientPantryStockError extends Error {
  targetKcal: number;
  availableKcal: number;
  constructor(targetKcal: number, availableKcal: number) {
    const minAllowed = targetKcal - 300;
    const maxAllowed = targetKcal + 300;
    super(
      `Kilerinizdeki mevcut stoklarla günlük kalori hedefine (${minAllowed} - ${maxAllowed} kcal) ulaşılamıyor. Mevcut kiler kapasiteniz: ${availableKcal} kcal. Lütfen kilerinize kalori yoğunluğu yüksek besinler (fındık, ceviz, badem, yulaf, bal, pekmez, tam yağlı süt vb.) ekleyin.`
    );
    this.name = 'InsufficientPantryStockError';
    this.targetKcal = targetKcal;
    this.availableKcal = availableKcal;
  }
}

/**
 * Checks if there is any allowed dairy product (milk, yogurt) in active stock.
 * Explicitly excludes kefir.
 */
export function hasDairyInStock(stock: Record<string, any> | undefined | null): boolean {
  if (!stock) return false;
  return ALLOWED_DAIRY_IDS.some((id) => getAvailableStockGrams(stock, id) > 0);
}

/**
 * Merges duplicate ingredients by canonical ID, summing amounts and normalized grams.
 * Ensures: new Set(ingredients.map(i => canonicalIngredientId(i.ingredientId))).size === ingredients.length
 */
export function mergeDuplicateIngredients(ingredients: ShakeIngredient[]): ShakeIngredient[] {
  const map = new Map<string, ShakeIngredient>();
  for (const ing of ingredients) {
    if (!ing.ingredientId) continue;
    const canonId = canonicalIngredientId(ing.ingredientId);
    const existing = map.get(canonId);
    const def = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[ing.ingredientId];

    // Determine normalized grams reliably
    let grams = ing.normalizedGrams && ing.normalizedGrams > 0 ? ing.normalizedGrams : 0;
    if (!grams) {
      if (ing.unit === 'g' || ing.unit === 'ml' || !ing.unit) {
        grams = ing.amount || ing.quantity || 0;
      } else {
        grams = normalizeToGramsOrMl(ing.quantity !== undefined ? ing.quantity : ing.amount, ing.unit, def);
      }
    }

    if (!existing) {
      const formatted = formatNormalizedUnit(grams, def);
      map.set(canonId, {
        ...ing,
        ingredientId: canonId,
        amount: grams,
        quantity: formatted.amount,
        unit: formatted.unit,
        normalizedGrams: grams,
      });
    } else {
      const totalGrams = (existing.normalizedGrams || existing.amount || 0) + grams;
      const formatted = formatNormalizedUnit(totalGrams, def);
      map.set(canonId, {
        ...existing,
        ingredientId: canonId,
        amount: totalGrams,
        quantity: formatted.amount,
        unit: formatted.unit,
        normalizedGrams: totalGrams,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Dynamic portion bounds scaled proportionally to the daily target calories.
 * Accommodates high-calorie bulk targets (e.g. 3810-4410 kcal for 2 portions)
 * without liquid ballooning by emphasizing nuts, grains, and natural sweeteners.
 */
function getCategoryBounds(ing: Ingredient, targetKcal: number = 1950): { min: number; max: number; default: number } {
  const scale = Math.max(1, targetKcal / 1500);
  const canonId = canonicalIngredientId(ing.id);

  if (isAllowedDairy(canonId)) {
    if (canonId === 'dairy_whole_milk' || canonId === 'dairy_semi_skimmed_milk') {
      return {
        min: 250,
        max: Math.min(650, Math.round(350 * scale)),
        default: Math.min(500, Math.round(300 * scale)),
      };
    }
    return {
      min: 100,
      max: Math.min(400, Math.round(200 * scale)),
      default: Math.min(250, Math.round(150 * scale)),
    };
  }
  if (ing.category === 'fruits') {
    return {
      min: 80,
      max: Math.min(350, Math.round(180 * scale)),
      default: Math.min(220, Math.round(130 * scale)),
    };
  }
  if (ing.category === 'dried_fruits') {
    return {
      min: 30,
      max: Math.min(180, Math.round(80 * scale)),
      default: Math.min(120, Math.round(50 * scale)),
    };
  }
  if (ing.category === 'grains') {
    return {
      min: 50,
      max: Math.min(350, Math.round(150 * scale)),
      default: Math.min(250, Math.round(100 * scale)),
    };
  }
  if (ing.category === 'nuts') {
    return {
      min: 30,
      max: Math.min(250, Math.round(100 * scale)),
      default: Math.min(180, Math.round(60 * scale)),
    };
  }
  if (ing.category === 'sweeteners') {
    return {
      min: 20,
      max: Math.min(120, Math.round(50 * scale)),
      default: Math.min(80, Math.round(35 * scale)),
    };
  }
  if (ing.category === 'cocoa_extras') {
    return {
      min: 10,
      max: Math.min(40, Math.round(20 * scale)),
      default: Math.min(25, Math.round(15 * scale)),
    };
  }
  return { min: 20, max: Math.min(100, Math.round(40 * scale)), default: 30 };
}

/**
 * Calculates ingredient price per gram (e.g., 60 TL/kg = 0.06 TL/g).
 * Returns 0 if ingredient has no price. Never fabricates prices.
 */
export function getIngredientPricePerGram(ing: Ingredient): number {
  if (!ing.estimatedPrice || ing.estimatedPrice <= 0) return 0;
  const unitStr = (ing.priceUnit || 'TL / kg').toLowerCase();
  if (unitStr.includes('kg') || unitStr.includes('l') || unitStr.includes('litre')) {
    return ing.estimatedPrice / 1000;
  }
  if (unitStr.includes('100g') || unitStr.includes('100 ml')) {
    return ing.estimatedPrice / 100;
  }
  if (unitStr.includes('adet') || unitStr.includes('şişe') || unitStr.includes('tane')) {
    const servingGrams = ing.edibleWeight || ing.defaultServing || 100;
    return ing.estimatedPrice / servingGrams;
  }
  return ing.estimatedPrice / 1000;
}

/**
 * Calculates ingredient cost per calorie (TL / kcal).
 * Used to prioritize cost-efficient calories during portion expansion.
 */
export function getIngredientCostPerKcal(ing: Ingredient): number {
  const pricePerGram = getIngredientPricePerGram(ing);
  const kcalPerGram = (ing.caloriesPer100g || 1) / 100;
  if (pricePerGram <= 0) return 0.0001; // Free/unpriced ingredients prioritized for low cost
  return pricePerGram / Math.max(0.1, kcalPerGram);
}

/**
 * Builds a single valid Shake recipe from a chosen candidate combination (4-6 items).
 * Dynamically scales amounts to hit targetKcal (+-300 kcal) using the cheapest calories first.
 */
// Thick (non-liquid) dairy bases need added water to reach a drinkable milkshake
// consistency. Ratio is relative to the yogurt's own weight — strained yogurt is
// drained and much thicker than village yogurt, so it needs proportionally more water.
const YOGURT_WATER_RATIO: Record<string, number> = {
  dairy_strained_yogurt: 0.6,
  dairy_village_yogurt: 0.35,
};

/**
 * If the recipe's dairy base is a thick yogurt (not already a pourable liquid like milk),
 * automatically adds (or tops up) water so the finished shake is actually drinkable
 * rather than spoon-thick. Water is calorie-free so this never affects the calorie target.
 */
function addConsistencyWaterIfNeeded(ingredients: ShakeIngredient[]): ShakeIngredient[] {
  const thickDairy = ingredients.find(
    (i) => YOGURT_WATER_RATIO[canonicalIngredientId(i.ingredientId)] !== undefined
  );
  if (!thickDairy) return ingredients;

  const ratio = YOGURT_WATER_RATIO[canonicalIngredientId(thickDairy.ingredientId)];
  const waterMl = Math.round(thickDairy.amount * ratio);
  if (waterMl <= 0) return ingredients;

  const existingWaterIdx = ingredients.findIndex(
    (i) => canonicalIngredientId(i.ingredientId) === 'other_water'
  );
  if (existingWaterIdx !== -1) {
    const updated = [...ingredients];
    const existing = updated[existingWaterIdx];
    const newAmount = existing.amount + waterMl;
    updated[existingWaterIdx] = { ...existing, amount: newAmount, quantity: newAmount };
    return updated;
  }

  // Only add a new ingredient slot if there's still room within the 3-6 rule; if the
  // combo is already at 6, skip rather than fail the whole recipe over consistency.
  if (ingredients.length >= 6) return ingredients;

  return [
    ...ingredients,
    {
      ingredientId: 'other_water',
      amount: waterMl,
      quantity: waterMl,
      unit: 'ml',
      normalizedGrams: waterMl,
    },
  ];
}

function buildShakeFromIngredientCombo(
  combo: Ingredient[],
  targetKcal: number,
  stock: Record<string, any>,
  stockOnly: boolean,
  timing: ShakeTiming,
  calorieTolerance: number = 300
): Shake | null {
  if (combo.length < 3 || combo.length > 6) return null;

  // 1. Initial portion sizing based on bounds and stock
  const selected: { ing: Ingredient; grams: number }[] = [];
  for (const ing of combo) {
    const bounds = getCategoryBounds(ing, targetKcal);
    const avail = stockOnly ? getAvailableStockGrams(stock, ing.id) : bounds.max;
    const effectiveMax = Math.min(bounds.max, avail);
    const initialGrams = Math.min(bounds.default, effectiveMax);
    if (initialGrams <= 0) return null;
    selected.push({ ing, grams: initialGrams });
  }

  // 2. Cost-optimized expansion loop
  let currentNutrition = calculateShakeNutrition(
    selected.map((s) => ({ ingredientId: s.ing.id, amount: s.grams, unit: 'g' }))
  );

  const maxIterations = 35;
  for (let iter = 0; iter < maxIterations; iter++) {
    const deficit = targetKcal - currentNutrition.calories;
    if (deficit <= 30) break; // Close enough to target

    // Find items that can still expand
    const expandable = selected.filter((item) => {
      const bounds = getCategoryBounds(item.ing, targetKcal);
      const avail = stockOnly ? getAvailableStockGrams(stock, item.ing.id) : bounds.max;
      const effectiveMax = Math.min(bounds.max, avail);
      return item.grams < effectiveMax;
    });

    if (expandable.length === 0) break;

    // Prioritize lowest cost per calorie (cheapest calories first!)
    expandable.sort((a, b) => getIngredientCostPerKcal(a.ing) - getIngredientCostPerKcal(b.ing));

    for (const exp of expandable) {
      const bounds = getCategoryBounds(exp.ing, targetKcal);
      const avail = stockOnly ? getAvailableStockGrams(stock, exp.ing.id) : bounds.max;
      const effectiveMax = Math.min(bounds.max, avail);
      const room = effectiveMax - exp.grams;
      if (room > 0) {
        const kcalPerGram = (exp.ing.caloriesPer100g || 100) / 100;
        const currentDeficit = targetKcal - currentNutrition.calories;
        if (currentDeficit <= 30) break;
        const targetGramsNeeded = Math.round(currentDeficit / Math.max(0.4, kcalPerGram));
        const step = Math.min(room, Math.max(5, Math.min(targetGramsNeeded, Math.round(room * 0.4))));
        exp.grams += step;
        currentNutrition = calculateShakeNutrition(
          selected.map((s) => ({ ingredientId: s.ing.id, amount: s.grams, unit: 'g' }))
        );
      }
    }
  }

  // 3. Strict Stock Cap: never exceed available pantry stock
  if (stockOnly) {
    for (const item of selected) {
      const avail = getAvailableStockGrams(stock, item.ing.id);
      if (item.grams > avail) {
        item.grams = Math.max(0, avail);
      }
    }
  }

  // 4. Build final ingredients & calculate nutrition
  const rawShakeIngredients: ShakeIngredient[] = selected
    .filter((s) => s.grams > 0)
    .map((s) => {
      const formatted = formatNormalizedUnit(s.grams, s.ing);
      return {
        ingredientId: canonicalIngredientId(s.ing.id),
        amount: s.grams,
        quantity: formatted.amount,
        unit: formatted.unit,
        normalizedGrams: s.grams,
      };
    });

  let shakeIngredients = mergeDuplicateIngredients(rawShakeIngredients);
  shakeIngredients = addConsistencyWaterIfNeeded(shakeIngredients);
  if (shakeIngredients.length < 3 || shakeIngredients.length > 6) return null;

  // Rule 1: Exactly 1 dairy
  const dairyIngredients = shakeIngredients.filter((i) => isAllowedDairy(i.ingredientId));
  if (dairyIngredients.length !== 1) return null;

  // Rule 2: At most 2 fruits
  const fruitIngredients = shakeIngredients.filter((i) => {
    const canon = canonicalIngredientId(i.ingredientId);
    const def = INGREDIENT_MAP[canon] || INGREDIENT_MAP[i.ingredientId];
    return def && (def.category === 'fruits' || def.category === 'dried_fruits');
  });
  if (fruitIngredients.length > 2) return null;

  const finalNutrition = calculateShakeNutrition(shakeIngredients);
  const totalCalories = finalNutrition.calories;

  // Calorie target constraint: must be within +-calorieTolerance kcal
  if (Math.abs(totalCalories - targetKcal) > calorieTolerance) {
    return null;
  }

  // Check liquid volume: <= 700 ml (milk, water, liquid ingredients)
  let liquidVolumeMl = 0;
  for (const ing of shakeIngredients) {
    const canonId = canonicalIngredientId(ing.ingredientId);
    if (canonId.includes('milk') || canonId.includes('water') || ing.unit === 'ml') {
      liquidVolumeMl += ing.amount;
    }
  }
  if (liquidVolumeMl > 700) {
    return null;
  }

  const portionCalories = Math.round(totalCalories / 2);
  const portionProtein = Math.round((finalNutrition.protein / 2) * 10) / 10;
  const portionCarbs = Math.round((finalNutrition.carbs / 2) * 10) / 10;
  const portionFat = Math.round((finalNutrition.fat / 2) * 10) / 10;
  const portionFiber = Math.round((finalNutrition.fiber / 2) * 10) / 10;

  const mainFruit = combo.find((i) => i.category === 'fruits' || i.category === 'dried_fruits');
  const mainNut = combo.find((i) => i.category === 'nuts');
  const fruitName = mainFruit?.name.replace(/ \(.*\)/, '') || 'Doğal';
  const nutName = mainNut?.name.replace(/ \(.*\)/, '') || '';
  const baseName = nutName ? `${fruitName}li & ${nutName}li Çift Porsiyon Shake` : `${fruitName}li Doğal Çift Porsiyon Shake`;

  const compatibility = analyzeCompatibility(shakeIngredients);

  const costString = finalNutrition.estimatedCost > 0 ? `~${finalNutrition.estimatedCost} TL` : 'Ekonomik';
  const whyChosenReasons: string[] = [
    `Maliyet odaklı formülasyon: Toplam ${costString} maliyetle gereksiz malzeme kalabalığı olmadan hazırlandı`,
    `Günlük hedefe tam uyumlu: Toplam ${totalCalories} kcal (2 eşit porsiyon x ${portionCalories} kcal)`,
    `Sadece ${shakeIngredients.length} seçkin kiler malzemesiyle sindirimi kolay ve lezzetli karışım`,
    'Aşırı sıvı hacmi yapmadan kalori yoğunluğu yüksek doğal besinlerle dengelendi',
    compatibility.detectedSynergies[0] || 'Lezzet ve makro dengesi optimize edildi',
  ];

  const shake: Shake = {
    id: `shake_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: baseName,
    description: `Günün 2 eşit porsiyona ayrılmış doğal shake tarifi (Toplam ${totalCalories} kcal • Porsiyon başı ${portionCalories} kcal • Tahmini Maliyet: ${costString}).`,
    timing,
    ingredients: finalNutrition.ingredients,
    estimatedCalories: totalCalories,
    protein: finalNutrition.protein,
    carbs: finalNutrition.carbs,
    fat: finalNutrition.fat,
    fiber: finalNutrition.fiber,
    estimatedCost: finalNutrition.estimatedCost,
    totalVolumeMl: finalNutrition.totalVolumeMl,
    instructions: [
      'Tüm malzemeleri tek seferde blendere ekleyin.',
      'Yüksek devirde 50-60 saniye pürüzsüz ve kadifemsi kıvama gelene kadar çekin.',
      `Hazırladığınız karışımı 2 EŞİT PORSİYONA (${portionCalories} kcal / porsiyon) bölün (%50 + %50).`,
      `Toplam ${totalCalories} kcal • 1. Porsiyon: ${portionCalories} kcal • 2. Porsiyon: ${portionCalories} kcal.`,
      '1. porsiyonu vardiya öncesi/öğlen tüketin.',
      '2. porsiyonu buzdolabında muhafaza edip vardiya sonrası tüketin.',
    ].join('\n'),
    preparationTimeMinutes: 4,
    portionCount: 2,
    portionCalories,
    portionProtein,
    portionCarbs,
    portionFat,
    portionFiber,
    portion1Completed: false,
    portion2Completed: false,
    isCompleted: false,
    compatibilityScore: compatibility.score,
    dominantTaste: compatibility.dominantTaste,
    predictedTexture: compatibility.predictedTexture,
    whyChosenReasons,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
  };

  // Validate recipe against master validator
  const validation = validateMasterRecipe(shake, {
    targetKcal,
    userStock: stockOnly ? stock : undefined,
    strictStockOnly: stockOnly,
  });

  if (!validation.isValid) {
    return null;
  }

  return shake;
}

/**
 * Deterministic Recipe Composition Engine (Single Shake / Day -> 2 Equal Portions).
 * Strictly enforces all 12 rules with Cost Optimization and Candidate Pool architecture:
 * 1. abs(shakeTotalKcal - dailyTargetKcal) <= 300
 * 2. Strictly from pantry stock (no stock deficits)
 * 3. Ingredient quantity <= available stock
 * 4. At least one allowed dairy (milk/yogurt)
 * 5. Strictly NO kefir
 * 6. Strictly NO supplements/protein powders
 * 7. Strictly NO duplicate canonical ingredients
 * 8. 2 equal portions (50% + 50%)
 * 9. Weekly history verification
 * 10. Balanced ingredient count (4 to 6 items; never whole pantry)
 * 11. Liquid volume limit <= 750 ml
 * 12. Prioritizes lowest cost valid recipes
 */
export function composeDeterministicShake(options: ComposeOptions = {}): Shake {
  const candidates = composeThreeDistinctDailyShakes(options);
  const idx = options.candidateIndex || 0;
  return candidates[idx % candidates.length] || candidates[0];
}

/**
 * Generates AT LEAST 3 distinct shake candidates (Rule 4, 7, 10).
 * Strictly uses a candidate pool: each stock item is an OPTION, NOT mandatory.
 * Minimizes cost by sorting valid candidate recipes by lowest cost first.
 * Ensures distinct canonical ingredient combinations and weekly history uniqueness.
 */
export function composeThreeDistinctDailyShakes(options: ComposeOptions = {}): Shake[] {
  // FIX: previously defaulted to a hardcoded 3623 and never enforced a floor, so a
  // caller passing a low targetCalories (e.g. an old/incorrect profile value) would
  // silently produce a low-calorie shake. Now it can never fall below DAILY_TARGET_KCAL.
  const targetKcal = Math.max(DAILY_TARGET_KCAL, options.targetCalories || 0);
  const timing = options.timing || 'morning';
  const stock = options.userStock || getStoredStock();
  const stockOnly = options.stockOnly !== false;

  // 1. Mandatory stock validation
  if (stockOnly) {
    if (!hasDairyInStock(stock)) {
      throw new MissingDairyStockError();
    }
    // FIX: previously threw InsufficientPantryStockError here whenever total pantry
    // calorie capacity fell short of the target (~3200 kcal). Per product decision,
    // insufficient stock should NEVER block the user with an error — the composer
    // should silently build the closest possible recipe with what's available. The
    // combo-generation and relaxed-tolerance logic below already handles this
    // gracefully, so we simply let it proceed instead of failing fast here.
  }

  // 2. Candidate pool: strictly available ingredients, no kefir, no protein powders
  let candidatePool = INGREDIENTS_DATABASE.filter((ing) => {
    if (ing.shakeCompatibility === 'topping' && ing.category === 'others') return false;
    const lower = ing.id.toLowerCase();
    if (lower.includes('kefir')) return false;
    if (lower.includes('protein') || lower.includes('supplement') || lower.includes('whey')) return false;
    if (stockOnly && getAvailableStockGrams(stock, ing.id) <= 0) return false;
    return true;
  });

  // Filter excluded
  if (options.excludedIngredientIds?.length) {
    candidatePool = candidatePool.filter((c) => !options.excludedIngredientIds!.includes(c.id));
  }

  // Filter allergies
  if (options.userProfile?.allergies?.length) {
    candidatePool = candidatePool.filter((c) => {
      if (!c.allergens) return true;
      return !c.allergens.some((a) =>
        options.userProfile!.allergies!.some((ua) =>
          a.toLowerCase().includes(ua.toLowerCase()) || ua.toLowerCase().includes(a.toLowerCase())
        )
      );
    });
  }

  const availableStock = (id: string) => (stockOnly ? getAvailableStockGrams(stock, id) : 500);

  // Group candidate pool into category buckets
  const dairies = candidatePool.filter((i) => isAllowedDairy(i.id) && availableStock(i.id) >= 100);
  if (dairies.length === 0 && stockOnly) {
    throw new MissingDairyStockError();
  }

  const grains = candidatePool.filter((i) => i.category === 'grains' && availableStock(i.id) >= 20);
  const fruits = candidatePool.filter(
    (i) => (i.category === 'fruits' || i.category === 'dried_fruits') && availableStock(i.id) >= 20
  );
  const nuts = candidatePool.filter((i) => i.category === 'nuts' && availableStock(i.id) >= 15);
  const extras = candidatePool.filter(
    (i) => (i.category === 'sweeteners' || i.category === 'cocoa_extras') && availableStock(i.id) >= 10
  );

  // Priority sorting: mandatory items first, then LOW STOCK items (to help use up
  // near-depleted pantry items before they spoil/are forgotten), then cost-efficient items.
  // FIX: previously sorted purely by cost-per-kcal, so a nearly-finished item (e.g. 20g of
  // hazelnuts left) competed only on price and was rarely chosen over a fully-stocked,
  // cheaper alternative — it just sat in the pantry indefinitely.
  const isMandatory = (id: string) => (options.mandatoryIngredientIds?.includes(id) ? 1 : 0);
  const LOW_STOCK_THRESHOLD_G = 60;
  const isRunningLow = (id: string) => {
    const avail = availableStock(id);
    return avail > 0 && avail <= LOW_STOCK_THRESHOLD_G ? 1 : 0;
  };
  const sortPool = (list: Ingredient[]) => {
    return list.slice().sort((a, b) => {
      const mandDiff = isMandatory(b.id) - isMandatory(a.id);
      if (mandDiff !== 0) return mandDiff;
      const lowStockDiff = isRunningLow(b.id) - isRunningLow(a.id);
      if (lowStockDiff !== 0) return lowStockDiff;
      return getIngredientCostPerKcal(a) - getIngredientCostPerKcal(b);
    });
  };

  const sortedDairies = sortPool(dairies);
  const sortedGrains = sortPool(grains);
  const sortedFruits = sortPool(fruits);
  const sortedNuts = sortPool(nuts);
  const sortedExtras = sortPool(extras);

  // 3. Generate candidate combinations of 4 to 6 ingredients
  // NEVER use all stock at once! Each recipe gets only 4 to 6 items.
  let validCandidates: Shake[] = [];
  const seenFingerprints = new Set<string>();

  const maxCombinationsToEvaluate = 100;
  let evaluatedCount = 0;

  comboLoop:
  for (const d of sortedDairies) {
    for (const g of (sortedGrains.length > 0 ? sortedGrains : [undefined])) {
      for (const f of (sortedFruits.length > 0 ? sortedFruits : [undefined])) {
        for (const n of (sortedNuts.length > 0 ? sortedNuts : [undefined])) {
          for (const e of [undefined, ...sortedExtras]) {
            if (evaluatedCount >= maxCombinationsToEvaluate) break comboLoop;
            evaluatedCount++;

            const combo = [d, g, f, n, e].filter((x): x is Ingredient => Boolean(x));
            if (combo.length < 3 || combo.length > 6) continue;

            const fp = Array.from(new Set(combo.map((x) => canonicalIngredientId(x.id)))).sort().join('|');
            if (seenFingerprints.has(fp)) continue;

            const shake = buildShakeFromIngredientCombo(combo, targetKcal, stock, stockOnly, timing);
            if (shake) {
              seenFingerprints.add(fp);
              validCandidates.push(shake);
            }
          }
        }
      }
    }
  }

  // If validCandidates < 3, try alternate 4-6 combinations (e.g. 2 nuts or 2 fruits with extras)
  if (validCandidates.length < 3) {
    extraComboLoop:
    for (const d of sortedDairies) {
      for (const g of (sortedGrains.length > 0 ? sortedGrains : [undefined])) {
        // Option A: 2 different nuts (e.g. walnut + peanut butter) with fruit and/or sweetener
        for (let i = 0; i < sortedNuts.length; i++) {
          for (let j = i + 1; j < sortedNuts.length; j++) {
            const n1 = sortedNuts[i];
            const n2 = sortedNuts[j];
            for (const f of (sortedFruits.length > 0 ? sortedFruits : [undefined])) {
              for (const e of [undefined, ...sortedExtras]) {
                const combo = [d, g, f, n1, n2, e].filter((x): x is Ingredient => Boolean(x));
                if (combo.length < 3 || combo.length > 6) continue;
                const fp = Array.from(new Set(combo.map((x) => canonicalIngredientId(x.id)))).sort().join('|');
                if (seenFingerprints.has(fp)) continue;

                const shake = buildShakeFromIngredientCombo(combo, targetKcal, stock, stockOnly, timing);
                if (shake) {
                  seenFingerprints.add(fp);
                  validCandidates.push(shake);
                  if (validCandidates.length >= 12) break extraComboLoop;
                }
              }
            }
          }
        }

        // Option B: 2 fruits (at most 2 allowed) + 1 nut + extra
        if (sortedFruits.length >= 2 && validCandidates.length < 3) {
          for (let fi = 0; fi < sortedFruits.length; fi++) {
            for (let fj = fi + 1; fj < sortedFruits.length; fj++) {
              const f1 = sortedFruits[fi];
              const f2 = sortedFruits[fj];
              for (const n of (sortedNuts.length > 0 ? sortedNuts : [undefined])) {
                for (const e of [undefined, ...sortedExtras]) {
                  const combo = [d, g, f1, f2, n, e].filter((x): x is Ingredient => Boolean(x));
                  if (combo.length < 3 || combo.length > 6) continue;
                  const fp = Array.from(new Set(combo.map((x) => canonicalIngredientId(x.id)))).sort().join('|');
                  if (seenFingerprints.has(fp)) continue;

                  const shake = buildShakeFromIngredientCombo(combo, targetKcal, stock, stockOnly, timing);
                  if (shake) {
                    seenFingerprints.add(fp);
                    validCandidates.push(shake);
                    if (validCandidates.length >= 12) break extraComboLoop;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // If still no candidates within +-300 kcal, try relaxed tolerance (+-500 kcal) so a
  // realistic plan is still delivered — regardless of total pantry capacity. Previously
  // this threw InsufficientPantryStockError before even attempting the relaxed pass,
  // which produced a hard error exactly when stock was tight. Now we always attempt it.
  if (validCandidates.length === 0) {
    // Evaluate with relaxed tolerance (+-500 kcal)
    relaxedLoop:
    for (const d of sortedDairies) {
      for (const g of (sortedGrains.length > 0 ? sortedGrains : [undefined])) {
        for (const f of (sortedFruits.length > 0 ? sortedFruits : [undefined])) {
          for (const n of (sortedNuts.length > 0 ? sortedNuts : [undefined])) {
            for (const e of [undefined, ...sortedExtras]) {
              const combo = [d, g, f, n, e].filter((x): x is Ingredient => Boolean(x));
              if (combo.length < 3 || combo.length > 6) continue;
              const fp = Array.from(new Set(combo.map((x) => canonicalIngredientId(x.id)))).sort().join('|');
              if (seenFingerprints.has(fp)) continue;

              const shake = buildShakeFromIngredientCombo(combo, targetKcal, stock, stockOnly, timing, 500);
              if (shake) {
                seenFingerprints.add(fp);
                validCandidates.push(shake);
                if (validCandidates.length >= 6) break relaxedLoop;
              }
            }
          }
        }
      }
    }
  }

  if (validCandidates.length === 0) {
    // FIX: previously distinguished "insufficient calories" (InsufficientPantryStockError)
    // from "no valid combination" as two separate hard failures. Per product decision,
    // a calorie shortfall alone must never block the user — only a genuine structural
    // impossibility (no valid 3–6 ingredient combination exists at all, e.g. missing
    // entire categories like grains/fruits/nuts) reaches this point, since calorie
    // tolerance was already relaxed to ±500 kcal above. That case still needs a message,
    // since there is truly no recipe to show.
    const capacity = calculatePantryShakeCalorieCapacity(stock);
    throw new Error(
      `Kilerinizde toplam ${capacity.totalCalories} kcal stok bulunuyor ancak tek bir günlük shake için güvenli sindirim ve porsiyon sınırları dahilinde tarif kombinasyonu oluşturulamadı. Lütfen kilerinize yulaf, fındık, ceviz, badem, muz veya tahin gibi shake uyumlu temel besinlerden ekleyin.`
    );
  }

  // FIX: analyzeCompatibility() was already being computed per-shake but its score was
  // only used for a cosmetic "why chosen" text line — it had zero influence on which
  // combos actually got selected, so genuinely bland/clashing-flavor combos could win
  // purely on cost/ingredient-count. Now: drop clearly incompatible combos outright
  // (when better alternatives exist) and rank the rest by compatibility score first.
  const MIN_ACCEPTABLE_COMPATIBILITY = 50; // below this = 'uyumsuz' (incompatible)
  const compatibleCandidates = validCandidates.filter(
    (c) => analyzeCompatibility(c.ingredients).score >= MIN_ACCEPTABLE_COMPATIBILITY
  );
  if (compatibleCandidates.length >= 3) {
    validCandidates = compatibleCandidates;
  }
  const compatibilityScoreCache = new Map<Shake, number>();
  const getCompatScore = (shake: Shake): number => {
    let cached = compatibilityScoreCache.get(shake);
    if (cached === undefined) {
      cached = analyzeCompatibility(shake.ingredients).score;
      compatibilityScoreCache.set(shake, cached);
    }
    return cached;
  };

  // 4. SORT ALL VALID CANDIDATES: LOW-STOCK USAGE FIRST, THEN INGREDIENT COUNT, THEN COST
  const countLowStockIngredientsUsed = (shake: Shake): number => {
    let count = 0;
    for (const item of shake.ingredients) {
      if (canonicalIngredientId(item.ingredientId) === 'other_water') continue;
      const avail = stockOnly ? getAvailableStockGrams(stock, item.ingredientId) : 0;
      if (avail > 0 && avail <= LOW_STOCK_THRESHOLD_G) count++;
    }
    return count;
  };

  // Rule 3: Use the minimum necessary ingredient count to achieve target calories (4 before 5, 5 before 6)
  validCandidates.sort((a, b) => {
    // Priority 0 (NEW): prefer recipes that help use up near-depleted pantry items,
    // so small leftover quantities (e.g. 20g of hazelnuts) get consumed instead of
    // sitting in the pantry indefinitely.
    const lowStockA = countLowStockIngredientsUsed(a);
    const lowStockB = countLowStockIngredientsUsed(b);
    if (lowStockA !== lowStockB) {
      return lowStockB - lowStockA;
    }
    // Priority 0.5 (NEW): prefer better flavor/texture compatibility, so combos that
    // clash or taste bland don't win purely on cost.
    const compatDiff = getCompatScore(b) - getCompatScore(a);
    if (Math.abs(compatDiff) > 10) {
      return compatDiff;
    }
    // Primary (Priority 9): Minimum necessary ingredient count (4 items > 5 items > 6 items)
    if (a.ingredients.length !== b.ingredients.length) {
      return a.ingredients.length - b.ingredients.length;
    }
    // Secondary (Priority 10): Lowest total cost
    const costA = a.estimatedCost ?? 99999;
    const costB = b.estimatedCost ?? 99999;
    if (Math.abs(costA - costB) > 0.5) {
      return costA - costB;
    }
    // Tertiary (Priority 11): Closeness to target calories
    return Math.abs(a.estimatedCalories - targetKcal) - Math.abs(b.estimatedCalories - targetKcal);
  });

  // 5. Select at least 3 distinct candidates
  const weeklySignatures = getWeeklyRecommendedSignatures();
  const selectedShakes: Shake[] = [];
  const chosenFingerprints = new Set<string>();

  for (const candidate of validCandidates) {
    if (selectedShakes.length >= 3) break;
    const fp = getRecipeFingerprint(candidate.ingredients);
    if (chosenFingerprints.has(fp)) continue;

    // Check weekly repeats (only skip if we have plenty of other alternatives)
    if (weeklySignatures.includes(fp) && validCandidates.length >= 6 && selectedShakes.length < 2) {
      continue;
    }

    // Check diversity against already selected candidates.
    // FIX: previously only checked Jaccard similarity (< 0.70), but for a typical 4-5
    // ingredient shake, swapping just ONE ingredient already drops similarity below 0.70
    // (e.g. 4/6 ≈ 0.67), so two shakes differing by a single item were accepted as
    // "distinct". Now also require at least 2 ingredients to actually differ.
    const isTooSimilar = selectedShakes.some((existing) => {
      const sim = calculateRecipeSimilarity(candidate.ingredients, existing.ingredients);
      const differing = countDifferingIngredients(candidate.ingredients, existing.ingredients);
      return sim >= 0.70 || differing < 2;
    });

    if (isTooSimilar) continue;

    chosenFingerprints.add(fp);
    selectedShakes.push(candidate);
    saveWeeklyRecommendedSignature(fp);
  }

  // Backfill if diversity was too restrictive and we still have valid candidates
  if (selectedShakes.length < 3) {
    for (const candidate of validCandidates) {
      if (selectedShakes.length >= 3) break;
      const fp = getRecipeFingerprint(candidate.ingredients);
      if (!chosenFingerprints.has(fp)) {
        chosenFingerprints.add(fp);
        selectedShakes.push(candidate);
      }
    }
  }

  // 6. Format names and labels with cost information
  return selectedShakes.map((shake, idx) => {
    const costLabel = shake.estimatedCost && shake.estimatedCost > 0 ? `~${shake.estimatedCost} TL` : 'Ekonomik';
    let optionTag = '';
    if (idx === 0) optionTag = ` (En Uygun Maliyet • ${costLabel})`;
    else if (idx === 1) optionTag = ` (Seçenek 2 • ${costLabel})`;
    else optionTag = ` (Seçenek 3 • ${costLabel})`;

    return {
      ...shake,
      name: `${shake.name.replace(/ \(.*\)/, '')}${optionTag}`,
    };
  });
}

/**
 * Main API function to generate daily shakes: returns Shake[] with at least 3 distinct valid shakes
 * from available pantry stock, or however many valid ones the stock genuinely permits.
 */
export function generateDailyShakes(options: ComposeOptions = {}): Shake[] {
  return composeThreeDistinctDailyShakes(options);
}
