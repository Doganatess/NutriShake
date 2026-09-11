import {
  StockItem,
  StockTransaction,
  SupportedUnit,
  Shake,
  ShoppingItem,
} from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';
import { normalizeToGramsOrMl, formatNormalizedUnit } from '../utils/unitConverter';
import {
  getStoredStock,
  saveStoredStock,
  getStoredStockTransactions,
  saveStockTransaction,
} from '../storage/storageAbstraction';

/**
 * Gets a user's stock item by ingredient ID.
 */
export function getStockItem(ingredientId: string): StockItem | null {
  const stock = getStoredStock();
  return stock[ingredientId] || null;
}

/**
 * Gets user's available stock amount converted into normalized grams or ml.
 * If user does not have this ingredient in stock, returns 0.
 */
export function getStockAmountNormalized(ingredientId: string): number {
  const item = getStockItem(ingredientId);
  if (!item || item.amount <= 0) return 0;
  return item.normalizedGramsOrMl || 0;
}

/**
 * Checks whether user has enough stock for a specific requirement.
 */
export function hasSufficientStock(
  ingredientId: string,
  requiredAmountNormalized: number
): boolean {
  if (requiredAmountNormalized <= 0) return true;
  const available = getStockAmountNormalized(ingredientId);
  return available >= requiredAmountNormalized;
}

/**
 * Validates whether all ingredients in a recipe can be fulfilled by current user stock.
 * Rule: Stok hiçbir zaman negatif olamaz. Tarifin ihtiyacı stoktan fazla ise tarif geçersizdir.
 */
export function validateRecipeStock(
  ingredients: { ingredientId: string; amount: number }[]
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

  for (const item of ingredients) {
    const available = getStockAmountNormalized(item.ingredientId);
    if (available < item.amount) {
      const deficit = item.amount - available;
      const ing = INGREDIENT_MAP[item.ingredientId];
      const formatted = formatNormalizedUnit(deficit, ing);

      missing.push({
        ingredientId: item.ingredientId,
        ingredientName: ing?.name || item.ingredientId,
        requiredNormalized: item.amount,
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
 */
export function removeStockItem(ingredientId: string): void {
  const stock = getStoredStock();
  if (stock[ingredientId]) {
    delete stock[ingredientId];
    saveStoredStock(stock);
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
    const current = stock[item.ingredientId];
    if (current) {
      const remainingNorm = Math.max(0, current.normalizedGramsOrMl - item.amount);
      const ing = INGREDIENT_MAP[item.ingredientId];
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
    const current = stock[item.ingredientId];
    if (current) {
      const remainingNorm = Math.max(0, current.normalizedGramsOrMl - item.amount);
      const ing = INGREDIENT_MAP[item.ingredientId];
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
    const current = stock[item.ingredientId];
    const ing = INGREDIENT_MAP[item.ingredientId];

    if (current) {
      const restoredNorm = current.normalizedGramsOrMl + item.amount;
      const formatted = formatNormalizedUnit(restoredNorm, ing, current.unit);
      current.normalizedGramsOrMl = restoredNorm;
      current.amount = formatted.amount;
      current.updatedAt = new Date().toISOString();
    } else {
      const formatted = formatNormalizedUnit(item.amount, ing);
      stock[item.ingredientId] = {
        ingredientId: item.ingredientId,
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
