import {
  Shake,
  ShakeIngredient,
  ShakeTiming,
  UserProfile,
  Ingredient,
} from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE } from '../data/ingredients';
import { calculateShakeNutrition } from './nutritionEngine';
import { getStoredStock, getStoredDislikedShakes, getStoredFavorites } from '../storage/storageAbstraction';
import { analyzeCompatibility } from './compatibilityEngine';
import { formatNormalizedUnit } from '../utils/unitConverter';
import { computeSemanticSimilarity } from './varietyEngine';

export interface ComposeOptions {
  targetCalories?: number;
  timing?: ShakeTiming;
  stockOnly?: boolean;
  userProfile?: UserProfile | null;
  excludedIngredientIds?: string[];
  preferredIngredientIds?: string[];
  recentShakes?: Shake[];
  shiftType?: 'morning' | 'evening' | 'off';
}

/**
 * Sensible portion bounds per category to prevent bizarre combinations and gigantic volume.
 */
function getCategoryBounds(ing: Ingredient): { min: number; max: number; default: number } {
  if (ing.category === 'dairy' || ing.shakeCompatibility === 'liquid' || ing.id === 'other_water') {
    return { min: 200, max: 400, default: 300 }; // Liquid for 2 portions
  }
  if (ing.category === 'fruits') {
    return { min: 80, max: 200, default: 130 };
  }
  if (ing.category === 'dried_fruits') {
    return { min: 20, max: 60, default: 35 };
  }
  if (ing.category === 'grains') {
    return { min: 30, max: 80, default: 50 };
  }
  if (ing.category === 'nuts') {
    return { min: 15, max: 50, default: 30 };
  }
  if (ing.category === 'sweeteners') {
    return { min: 15, max: 40, default: 25 };
  }
  if (ing.category === 'cocoa_extras') {
    return { min: 8, max: 25, default: 15 };
  }
  return { min: 10, max: 40, default: 20 };
}

/**
 * Deterministic Recipe Composition Engine (Single Shake / Day -> 2 Equal Portions).
 *
 * Requirements:
 * 1. Exactly 1 shake recipe generated per working day.
 * 2. Divided into 2 equal portions (Porsiyon 1, Porsiyon 2).
 * 3. Does not dump all stock in! Uses a balanced, clean 3-5 ingredient structure.
 * 4. Multi-objective optimization: taste, macros, volume, cost, variety, preferences.
 * 5. Explainable recipe reasons ("Bu shake neden seçildi?").
 */
export function composeDeterministicShake(options: ComposeOptions = {}): Shake {
  const targetKcal = options.targetCalories || 1000; // Default 1000 kcal total (500 kcal per portion)
  const timing = options.timing || 'morning';
  const stock = getStoredStock();
  const stockOnly = options.stockOnly !== false;
  const dislikedList = getStoredDislikedShakes();
  const favorites = getStoredFavorites();

  // 1. Candidate ingredients pool
  let candidates: Ingredient[] = INGREDIENTS_DATABASE.filter((ing) => {
    // Exclude savoury or non-shake items
    if (ing.shakeCompatibility === 'topping' && ing.category === 'others') return false;
    return true;
  });

  if (stockOnly) {
    const stockKeys = Object.keys(stock).filter((k) => (stock[k]?.normalizedGramsOrMl || 0) > 0);
    if (stockKeys.length > 0) {
      candidates = candidates.filter((ing) => stockKeys.includes(ing.id));
    }
  }

  // Filter excluded ingredients
  if (options.excludedIngredientIds && options.excludedIngredientIds.length > 0) {
    candidates = candidates.filter((c) => !options.excludedIngredientIds?.includes(c.id));
  }

  // Filter user forbidden ingredients
  if (options.userProfile?.forbiddenIngredientIds && options.userProfile.forbiddenIngredientIds.length > 0) {
    candidates = candidates.filter((c) => !options.userProfile!.forbiddenIngredientIds.includes(c.id));
  }

  // Filter user allergen ingredients
  if (options.userProfile?.allergies && options.userProfile.allergies.length > 0) {
    candidates = candidates.filter((c) => {
      if (!c.allergens) return true;
      return !c.allergens.some((a) =>
        options.userProfile!.allergies!.some((ua) =>
          a.toLowerCase().includes(ua.toLowerCase()) || ua.toLowerCase().includes(a.toLowerCase())
        )
      );
    });
  }

  // 2. Select Liquid Base (Exactly 1: Whole Milk, Semi-Skimmed, Yogurt, Water)
  let liquidBase = candidates.find(
    (c) => c.category === 'dairy' || c.shakeCompatibility === 'liquid' || c.shakeCompatibility === 'base'
  );
  if (!liquidBase) {
    liquidBase = INGREDIENT_MAP['dairy_whole_milk'] || INGREDIENT_MAP['other_water'];
  }

  // 3. Select Body / Fruit (1 item)
  // Check user preferences / favorites / variety
  const recentIngredientIds = new Set<string>();
  if (options.recentShakes) {
    options.recentShakes.forEach((s) => s.ingredients.forEach((i) => recentIngredientIds.add(i.ingredientId)));
  }

  const fruits = candidates.filter((c) => c.category === 'fruits' || c.category === 'dried_fruits');
  let fruit = fruits.find((f) => !recentIngredientIds.has(f.id));
  if (!fruit && fruits.length > 0) fruit = fruits[0];
  if (!fruit) fruit = INGREDIENT_MAP['fruit_banana'] || INGREDIENT_MAP['fruit_apple'];

  // 4. Select Sustained Energy / Grain (Yulaf / Yulaf Unu)
  const grains = candidates.filter((c) => c.category === 'grains');
  let grain = grains.find((g) => g.id === 'grain_oats') || grains[0];

  // 5. Select Flavor / Calorie Booster (Nuts OR Sweetener OR Cocoa)
  // DO NOT use all of them! Select at most 1-2 based on variety and compatibility
  const selectedExtras: Ingredient[] = [];

  const nuts = candidates.filter((c) => c.category === 'nuts');
  const sweeteners = candidates.filter((c) => c.category === 'sweeteners');
  const cocoaExtras = candidates.filter((c) => c.category === 'cocoa_extras');

  // Check if yesterday used sweeteners; if so, prefer nuts or cocoa today for variety
  const usedSweetenerRecently = options.recentShakes?.some((s) =>
    s.ingredients.some((i) => INGREDIENT_MAP[i.ingredientId]?.category === 'sweeteners')
  );

  if (nuts.length > 0) {
    selectedExtras.push(nuts[0]);
  }

  if (usedSweetenerRecently && cocoaExtras.length > 0) {
    selectedExtras.push(cocoaExtras[0]);
  } else if (sweeteners.length > 0) {
    selectedExtras.push(sweeteners[0]);
  } else if (cocoaExtras.length > 0) {
    selectedExtras.push(cocoaExtras[0]);
  }

  // Assemble clean selection (max 4-5 items total)
  const selected: { ing: Ingredient; grams: number }[] = [];

  if (liquidBase) {
    selected.push({ ing: liquidBase, grams: getCategoryBounds(liquidBase).default });
  }
  if (fruit) {
    selected.push({ ing: fruit, grams: getCategoryBounds(fruit).default });
  }
  if (grain) {
    selected.push({ ing: grain, grams: getCategoryBounds(grain).default });
  }
  selectedExtras.slice(0, 2).forEach((extra) => {
    selected.push({ ing: extra, grams: getCategoryBounds(extra).default });
  });

  // 6. Check Semantic Similarity with recent shakes
  if (options.recentShakes && options.recentShakes.length > 0) {
    const lastShake = options.recentShakes[0];
    const similarityResult = computeSemanticSimilarity(
      selected.map((s) => s.ing.id),
      lastShake.ingredients
    );

    // If too similar and we have alternatives, swap an extra
    if (similarityResult.isTooSimilar) {
      if (selectedExtras.length > 0 && cocoaExtras.length > 0 && !selected.some((s) => s.ing.id === cocoaExtras[0].id)) {
        selected.pop();
        selected.push({ ing: cocoaExtras[0], grams: getCategoryBounds(cocoaExtras[0]).default });
      }
    }
  }

  // 7. Multi-objective scaling towards targetCalories (2 portions total)
  let currentNutrition = calculateShakeNutrition(
    selected.map((s) => ({ ingredientId: s.ing.id, amount: s.grams, unit: 'g' }))
  );

  const diff = targetKcal - currentNutrition.calories;
  if (Math.abs(diff) > 40) {
    const scaleFactor = Math.max(0.7, Math.min(1.4, targetKcal / currentNutrition.calories));
    for (const item of selected) {
      // Don't blow up cocoa powder volume
      if (item.ing.category === 'cocoa_extras') continue;
      // If scaling up, scale calorie-dense ingredients (nuts, oats, sweeteners) more than liquid
      if (scaleFactor > 1 && (item.ing.category === 'nuts' || item.ing.category === 'sweeteners' || item.ing.category === 'grains')) {
        item.grams = Math.round(item.grams * (scaleFactor * 1.1));
      } else {
        item.grams = Math.round(item.grams * scaleFactor);
      }
    }
  }

  // Build final ingredients
  const shakeIngredients: ShakeIngredient[] = selected.map((s) => {
    const formatted = formatNormalizedUnit(s.grams, s.ing);
    return {
      ingredientId: s.ing.id,
      amount: s.grams,
      quantity: formatted.amount,
      unit: formatted.unit,
      normalizedGrams: s.grams,
      calculatedCalories: 0,
      calculatedProtein: 0,
      calculatedCarbs: 0,
      calculatedFat: 0,
    };
  });

  const finalNutrition = calculateShakeNutrition(shakeIngredients);
  const compatibility = analyzeCompatibility(shakeIngredients);

  // Equal 2 Portions Calculation
  const totalCalories = finalNutrition.calories;
  const portionCalories = Math.round(totalCalories / 2);
  const portionProtein = Math.round((finalNutrition.protein / 2) * 10) / 10;
  const portionCarbs = Math.round((finalNutrition.carbs / 2) * 10) / 10;
  const portionFat = Math.round((finalNutrition.fat / 2) * 10) / 10;
  const portionFiber = Math.round((finalNutrition.fiber / 2) * 10) / 10;

  // Naming
  const mainFruitName = fruit?.name.replace(/ \(.*\)/, '') || 'Enerji';
  const extraName = selectedExtras[0]?.name.replace(/ \(.*\)/, '') || '';
  const name = extraName ? `${mainFruitName}li & ${extraName}li Çift Porsiyon Shake` : `${mainFruitName}li Doğal Günlük Shake`;

  // Explainable Recipe ("Bu shake neden seçildi?")
  const whyChosenReasons: string[] = [
    'Mevcut kiler stoklarınıza tam uyumlu',
    `Haftalık kalori havuzunu dengede tutar (Toplam ${totalCalories} kcal, porsiyon başı ${portionCalories} kcal)`,
    'Aşırı hacim yapmayan yüksek kalori yoğunluğu ile rahat tüketilir',
    `${selected.length} seçkin malzemeyle pratik ve sindirimi kolay formülasyon`,
    compatibility.detectedSynergies[0] || 'Lezzet ve makro uyumu yüksek bileşenler bir araya getirildi',
  ];

  return {
    id: `shake_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    description: `Günün 2 eşit porsiyona ayrılmış tek shake tarifi (Porsiyon başı ${portionCalories} kcal).`,
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
      `Hazırladığınız karışımı 2 EŞİT PORSIYONA (${portionCalories} kcal / porsiyon) bölün.`,
      '1. porsiyonu vardiya başlangıcında / iş yerinde tüketin.',
      '2. porsiyonu buzdolabında muhafaza edip vardiya sonrası / acıkınca tüketin.',
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
}
