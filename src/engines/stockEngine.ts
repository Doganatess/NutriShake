import {
  StockItem,
  StockTransaction,
  SupportedUnit,
  Shake,
  ShoppingItem,
} from '../types.js';
import { INGREDIENT_MAP, canonicalIngredientId } from '../data/ingredients.js';
import { normalizeToGramsOrMl, formatNormalizedUnit } from '../utils/unitConverter.js';
import {
  getStoredStock,
  saveStoredStock,
  getStoredStockTransactions,
  saveStockTransaction,
} from '../storage/storageAbstraction.js';

/**
 * Resolves the ACTUAL key under which an ingredient is stored in the stock object,
 * checking direct match, canonical ID match, and canonical-alias scan (in that order).
 * Returns null if the ingredient is not present in stock under any known alias.
 *
 * This must be used by every stock read/write path so that lookups behave consistently
 * with getAvailableStockGrams / validateRecipeStock — otherwise validation can say
 * "stock is sufficient" while the actual mutation silently no-ops on a key mismatch.
 */
export function resolveStockKey(
  stock: Record<string, any> | undefined | null,
  ingredientId: string
): string | null {
  if (!stock || !ingredientId) return null;
  if (stock[ingredientId]) return ingredientId;
  const canonical = canonicalIngredientId(ingredientId);
  if (stock[canonical]) return canonical;
  for (const key of Object.keys(stock)) {
    if (canonicalIngredientId(key) === canonical) return key;
  }
  return null;
}

/**
 * Gets a user's stock item by ingredient ID, checking canonical aliases.
 */
export function getStockItem(ingredientId: string, customStock?: Record<string, any>): StockItem | null {
  const stock = customStock || getStoredStock();
  const key = resolveStockKey(stock, ingredientId);
  return key ? (stock![key] as StockItem) : null;
}

/**
 * Returns available stock quantity in normalized grams/ml for an ingredient ID.
 * Returns 0 if item is not in stock or stock <= 0.
 */
export function getAvailableStockGrams(
  stock: Record<string, any> | undefined | null,
  ingredientId: string
): number {
  if (!stock || !ingredientId) return 0;
  const canonical = canonicalIngredientId(ingredientId);

  // 1. Direct canonical lookup
  if (stock[canonical]) {
    const item = stock[canonical];
    const val = item.normalizedGramsOrMl !== undefined ? item.normalizedGramsOrMl : item.amount;
    if (typeof val === 'number' && val > 0) return val;
  }

  // 2. Direct ingredientId lookup
  if (stock[ingredientId]) {
    const item = stock[ingredientId];
    const val = item.normalizedGramsOrMl !== undefined ? item.normalizedGramsOrMl : item.amount;
    if (typeof val === 'number' && val > 0) return val;
  }

  // 3. Scan all stock entries by canonical match
  for (const [key, item] of Object.entries(stock)) {
    if (canonicalIngredientId(key) === canonical) {
      const val = (item as any)?.normalizedGramsOrMl !== undefined ? (item as any).normalizedGramsOrMl : (item as any)?.amount;
      if (typeof val === 'number' && val > 0) return val;
    }
  }

  return 0;
}

/**
 * Calculates total calorie capacity of all shake-compatible items currently in user stock.
 */
export function calculatePantryShakeCalorieCapacity(customStock?: Record<string, any>): {
  totalCalories: number;
  dailyUsableCalories: number;
  availableIngredientsCount: number;
  hasAllowedDairy: boolean;
  dairyCalories: number;
  details: { ingredientId: string; name: string; amount: number; calories: number; usableAmount: number; usableCalories: number }[];
} {
  const stock = customStock || getStoredStock();
  const ALLOWED_DAIRY = ['dairy_whole_milk', 'dairy_semi_skimmed_milk', 'dairy_village_yogurt', 'dairy_strained_yogurt'];
  let totalCalories = 0;
  let dailyUsableCalories = 0;
  let dairyCalories = 0;
  let hasAllowedDairy = false;
  const details: { ingredientId: string; name: string; amount: number; calories: number; usableAmount: number; usableCalories: number }[] = [];

  // Realistic upper bounds for a single day's shake recipe (split in 2 portions):
  const DAILY_MAX_PORTION_BY_CATEGORY: Record<string, number> = {
    dairy: 700, // max 700ml milk/yogurt
    grains: 350, // max 350g oats
    nuts: 300, // max 300g nuts/spreads total
    fruits: 350, // max 350g fruit total
    dried_fruits: 180, // max 180g dried fruit total
    sweeteners: 120, // max 120g honey/pekmez total
    cocoa_extras: 40, // max 40g cocoa/cacao total
  };

  for (const [id, item] of Object.entries(stock || {})) {
    const canonicalId = canonicalIngredientId(id);
    const ing = INGREDIENT_MAP[canonicalId] || INGREDIENT_MAP[id];
    const grams = (item as any)?.normalizedGramsOrMl !== undefined ? (item as any).normalizedGramsOrMl : (item as any)?.amount || 0;
    if (grams <= 0 || !ing) continue;

    // Filter out kefir, supplements, or non-shake items
    if (
      canonicalId.toLowerCase().includes('kefir') ||
      canonicalId.toLowerCase().includes('protein') ||
      canonicalId.toLowerCase().includes('supplement') ||
      canonicalId.toLowerCase().includes('whey')
    ) {
      continue;
    }

    const cals = Math.round((grams * (ing.caloriesPer100g || 0)) / 100);
    totalCalories += cals;

    // Calculate daily usable calories based on realistic single-day maximums
    const maxSingleIngDaily = DAILY_MAX_PORTION_BY_CATEGORY[ing.category] || 150;
    const usableGrams = Math.min(grams, maxSingleIngDaily);
    const usableCals = Math.round((usableGrams * (ing.caloriesPer100g || 0)) / 100);
    dailyUsableCalories += usableCals;

    if (ALLOWED_DAIRY.includes(canonicalId)) {
      hasAllowedDairy = true;
      dairyCalories += cals;
    }

    details.push({
      ingredientId: canonicalId,
      name: ing.name,
      amount: grams,
      calories: cals,
      usableAmount: usableGrams,
      usableCalories: usableCals,
    });
  }

  return {
    totalCalories,
    dailyUsableCalories,
    availableIngredientsCount: details.length,
    hasAllowedDairy,
    dairyCalories,
    details,
  };
}

/**
 * Gets user's available stock amount converted into normalized grams or ml.
 * If user does not have this ingredient in stock, returns 0.
 */
export function getStockAmountNormalized(ingredientId: string, customStock?: Record<string, any>): number {
  const stock = customStock || getStoredStock();
  return getAvailableStockGrams(stock, ingredientId);
}

/**
 * Checks whether user has enough stock for a specific requirement.
 */
export function hasSufficientStock(
  ingredientId: string,
  requiredAmountNormalized: number,
  customStock?: Record<string, any>
): boolean {
  if (requiredAmountNormalized <= 0) return true;
  const available = getStockAmountNormalized(ingredientId, customStock);
  return available >= requiredAmountNormalized;
}

/**
 * Validates whether all ingredients in a recipe can be fulfilled by current user stock.
 * Rule: Stok hiçbir zaman negatif olamaz. availableStock <= 0 veya amount > availableStock ise tarif KESİNLİKLE GEÇERSİZDİR.
 */
export function validateRecipeStock(
  ingredients: { ingredientId: string; amount: number }[],
  customStock?: Record<string, any>
): {
  isValid: boolean;
  missing: {
    ingredientId: string;
    ingredientName: string;
    requiredNormalized: number;
    availableNormalized: number;
    deficitNormalized: number;
    retailDisplayDeficit: string;
  }[];
} {
  const missing: {
    ingredientId: string;
    ingredientName: string;
    requiredNormalized: number;
    availableNormalized: number;
    deficitNormalized: number;
    retailDisplayDeficit: string;
  }[] = [];

  const stock = customStock || getStoredStock();

  for (const item of ingredients) {
    // Tap water is a free kitchen utility, not a tracked pantry item — never flag it
    // as missing/insufficient stock (see recipeValidator.ts's matching exemption).
    if (canonicalIngredientId(item.ingredientId) === 'other_water') continue;

    const available = getAvailableStockGrams(stock, item.ingredientId);
    const needed = item.amount || 0;

    if (available <= 0 || available < needed) {
      const deficit = available <= 0 ? needed : needed - available;
      const canonId = canonicalIngredientId(item.ingredientId);
      const ing = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[item.ingredientId];
      const formatted = formatNormalizedUnit(deficit, ing);

      missing.push({
        ingredientId: item.ingredientId,
        ingredientName: ing?.name || item.ingredientId,
        requiredNormalized: needed,
        availableNormalized: available,
        deficitNormalized: deficit,
        retailDisplayDeficit: formatted.display,
      });
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Adds or replenishes stock for an ingredient.
 * Logs a transaction for historical auditing: önceki stok + alınan = kalan.
 */
export function addOrReplenishStock(
  ingredientId: string,
  amount: number,
  unit: SupportedUnit | string,
  note?: string
): StockItem {
  const stock = getStoredStock();
  const ing = INGREDIENT_MAP[ingredientId];
  const addedNormalized = normalizeToGramsOrMl(amount, unit, ing);

  const existing = stock[ingredientId];
  const previousNormalized = existing ? existing.normalizedGramsOrMl : 0;
  const newNormalized = previousNormalized + addedNormalized;

  const updatedItem: StockItem = {
    ingredientId,
    amount: existing ? existing.amount + amount : amount,
    unit,
    normalizedGramsOrMl: newNormalized,
    updatedAt: new Date().toISOString(),
  };

  stock[ingredientId] = updatedItem;
  saveStoredStock(stock);

  // Log transaction
  const tx: StockTransaction = {
    id: `tx_add_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ingredientId,
    type: 'purchase',
    amount,
    unit,
    normalizedGramsOrMl: addedNormalized,
    date: new Date().toISOString().split('T')[0],
    note: note || 'Stok eklendi / satın alındı',
    createdAt: new Date().toISOString(),
  };
  saveStockTransaction(tx);

  return updatedItem;
}

/**
 * Updates stock amount directly (e.g. user counts their kitchen pantry).
 */
export function setExactStock(
  ingredientId: string,
  amount: number,
  unit: SupportedUnit | string
): StockItem {
  const stock = getStoredStock();
  const ing = INGREDIENT_MAP[ingredientId];
  const normalized = normalizeToGramsOrMl(amount, unit, ing);

  const updatedItem: StockItem = {
    ingredientId,
    amount,
    unit,
    normalizedGramsOrMl: Math.max(0, normalized),
    updatedAt: new Date().toISOString(),
  };

  stock[ingredientId] = updatedItem;
  saveStoredStock(stock);

  const tx: StockTransaction = {
    id: `tx_adj_${Date.now()}`,
    ingredientId,
    type: 'adjustment',
    amount,
    unit,
    normalizedGramsOrMl: normalized,
    date: new Date().toISOString().split('T')[0],
    note: 'Kullanıcı kiler sayımı düzenlemesi',
    createdAt: new Date().toISOString(),
  };
  saveStockTransaction(tx);

  return updatedItem;
}

/**
 * Removes an ingredient from stock completely.
 * Removes both raw and canonical key matches to guarantee stock <= 0.
 */
export function removeStockItem(ingredientId: string): void {
  if (!ingredientId) return;
  const stock = getStoredStock();
  const canonId = canonicalIngredientId(ingredientId);

  delete stock[ingredientId];
  delete stock[canonId];

  for (const key of Object.keys(stock)) {
    if (key === ingredientId || key === canonId || canonicalIngredientId(key) === canonId) {
      delete stock[key];
    }
  }

  saveStoredStock(stock);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('nutrishake-stock-changed', {
        detail: { deletedId: ingredientId, canonicalId: canonId },
      })
    );
  }
}

/**
 * Consumes stock when a shake is marked as completed (drunk).
 * Prevents negative stock. If stock is insufficient, returns error.
 */
export function consumeStockForShake(
  shake: Shake,
  dateString?: string
): { success: boolean; error?: string } {
  const stockValidation = validateRecipeStock(
    shake.ingredients.map((i) => ({ ingredientId: i.ingredientId, amount: i.amount }))
  );

  if (!stockValidation.isValid) {
    const missingNames = stockValidation.missing.map((m) => m.ingredientName).join(', ');
    return {
      success: false,
      error: `Yetersiz stok! Eksik malzemeler: ${missingNames}. Stok negatif olamaz.`,
    };
  }

  const stock = getStoredStock();
  const today = dateString || new Date().toISOString().split('T')[0];

  for (const item of shake.ingredients) {
    const key = resolveStockKey(stock, item.ingredientId);
    const current = key ? stock[key] : null;
    if (current) {
      const remainingNorm = Math.max(0, current.normalizedGramsOrMl - item.amount);
      const canonId = canonicalIngredientId(item.ingredientId);
      const ing = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[item.ingredientId];
      const formatted = formatNormalizedUnit(remainingNorm, ing, current.unit);

      current.normalizedGramsOrMl = remainingNorm;
      current.amount = formatted.amount;
      current.updatedAt = new Date().toISOString();

      // Log transaction
      const tx: StockTransaction = {
        id: `tx_con_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: item.ingredientId,
        type: 'consume',
        amount: -item.amount,
        unit: 'g',
        normalizedGramsOrMl: -item.amount,
        date: today,
        relatedShakeId: shake.id,
        note: `Tarif tüketildi: ${shake.name}`,
        createdAt: new Date().toISOString(),
      };
      saveStockTransaction(tx);
    }
  }

  saveStoredStock(stock);
  return { success: true };
}

/**
 * Deducts recipe ingredients from stock safely, never going negative.
 */
export function deductRecipeStock(
  ingredients: { ingredientId: string; amount: number }[],
  note?: string
): void {
  const stock = getStoredStock();
  const today = new Date().toISOString().split('T')[0];

  for (const item of ingredients) {
    const key = resolveStockKey(stock, item.ingredientId);
    const current = key ? stock[key] : null;
    if (current) {
      const remainingNorm = Math.max(0, current.normalizedGramsOrMl - item.amount);
      const canonId = canonicalIngredientId(item.ingredientId);
      const ing = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[item.ingredientId];
      const formatted = formatNormalizedUnit(remainingNorm, ing, current.unit);

      current.normalizedGramsOrMl = remainingNorm;
      current.amount = formatted.amount;
      current.updatedAt = new Date().toISOString();

      const tx: StockTransaction = {
        id: `tx_con_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: item.ingredientId,
        type: 'consume',
        amount: -item.amount,
        unit: current.unit,
        normalizedGramsOrMl: -item.amount,
        date: today,
        note: note || 'Tarif tüketimi',
        createdAt: new Date().toISOString(),
      };
      saveStockTransaction(tx);
    }
  }

  saveStoredStock(stock);
}

/**
 * Reverts consumed stock if a shake is unmarked (un-completed).
 */
export function revertStockForShake(shake: Shake): void {
  const stock = getStoredStock();
  const today = new Date().toISOString().split('T')[0];

  for (const item of shake.ingredients) {
    const key = resolveStockKey(stock, item.ingredientId);
    const current = key ? stock[key] : null;
    const canonId = canonicalIngredientId(item.ingredientId);
    const ing = INGREDIENT_MAP[canonId] || INGREDIENT_MAP[item.ingredientId];

    if (current) {
      const restoredNorm = current.normalizedGramsOrMl + item.amount;
      const formatted = formatNormalizedUnit(restoredNorm, ing, current.unit);
      current.normalizedGramsOrMl = restoredNorm;
      current.amount = formatted.amount;
      current.updatedAt = new Date().toISOString();
    } else {
      const formatted = formatNormalizedUnit(item.amount, ing);
      stock[canonId] = {
        ingredientId: canonId,
        amount: formatted.amount,
        unit: formatted.unit as SupportedUnit,
        normalizedGramsOrMl: item.amount,
        updatedAt: new Date().toISOString(),
      };
    }

    const tx: StockTransaction = {
      id: `tx_rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ingredientId: item.ingredientId,
      type: 'adjustment',
      amount: item.amount,
      unit: 'g',
      normalizedGramsOrMl: item.amount,
      date: today,
      relatedShakeId: shake.id,
      note: `Geri alındı: ${shake.name}`,
      createdAt: new Date().toISOString(),
    };
    saveStockTransaction(tx);
  }

  saveStoredStock(stock);
}

/**
 * Consumes 50% of the daily recipe stock when 1 portion (1. Öğün or 2. Öğün) is drunk.
 * Ensures stock never drops below 0 and transactions are clearly audited.
 */
export function consumeStockForPortion(
  shake: Shake,
  portionNumber: 1 | 2
): { success: boolean; error?: string } {
  const halfIngredients = shake.ingredients.map((item) => ({
    ingredientId: item.ingredientId,
    amount: Math.round(item.amount / 2),
  }));

  const validation = validateRecipeStock(halfIngredients);
  if (!validation.isValid) {
    const missingNames = validation.missing.map((m) => m.ingredientName).join(', ');
    return {
      success: false,
      error: `Yetersiz stok! ${portionNumber}. Öğün için eksik: ${missingNames}.`,
    };
  }

  deductRecipeStock(
    halfIngredients,
    `Shake ${portionNumber}. Öğün tüketildi (%50 porsiyon): ${shake.name}`
  );

  return { success: true };
}

/**
 * Reverts 50% of the recipe stock if a portion is unmarked.
 */
export function revertStockForPortion(shake: Shake, portionNumber: 1 | 2): void {
  const halfShake: Shake = {
    ...shake,
    ingredients: shake.ingredients.map((i) => ({
      ...i,
      amount: Math.round(i.amount / 2),
    })),
  };
  revertStockForShake(halfShake);
}

/**
 * Calculates shopping deficit:
 * Formula: Alışveriş Listesi = Gerekli - Mevcut Stok (Sadece eksik miktar gösterilir).
 * If user already has enough in stock, deficit is 0 and it won't appear in the shopping list!
 */
export function calculateShoppingDeficit(
  plannedRequirements: { ingredientId: string; totalGramsOrMl: number }[]
): ShoppingItem[] {
  const result: ShoppingItem[] = [];

  for (const req of plannedRequirements) {
    const currentStock = getStockAmountNormalized(req.ingredientId);
    const deficit = req.totalGramsOrMl - currentStock;

    if (deficit > 0) {
      const ing = INGREDIENT_MAP[req.ingredientId];
      const formatted = formatNormalizedUnit(deficit, ing);
      const estPrice = ing ? Math.round((deficit / 100) * ing.estimatedPrice) : 0;

      result.push({
        id: `shop_${req.ingredientId}`,
        ingredientId: req.ingredientId,
        name: ing?.name || req.ingredientId,
        category: ing?.category || 'others',
        categoryNameTr: ing?.categoryNameTr || 'Diğer',
        requiredAmount: req.totalGramsOrMl,
        currentStock,
        neededAmount: deficit,
        retailDisplay: formatted.display,
        estimatedCost: Math.max(10, estPrice),
        checked: false,
      });
    }
  }

  return result;
}
