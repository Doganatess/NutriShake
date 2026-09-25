import { Shake, Ingredient } from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';
import { canonicalIngredientId } from '../data/ingredients';
import { getStoredStock, getStoredStockTransactions } from '../storage/storageAbstraction';
import { resolveStockKey } from './stockEngine';

export interface CostOptimizationResult {
  totalEstimatedCost: number;
  costPer100Kcal: number;
  costPer10gProtein: number;
  economicAlternatives: {
    originalIngredient: Ingredient;
    alternativeIngredient: Ingredient;
    estimatedSavingsTL: number;
    savingsPercent: number;
    reason: string;
  }[];
}

type StockPriceLike = {
  purchasePrice?: number;
  price?: number;
  unitPrice?: number;
  pricePerUnit?: number;
  purchaseUnit?: string;
  priceUnit?: string;
  amount?: number;
  normalizedGramsOrMl?: number;
};

function normalizePriceUnit(unit?: string): string {
  return String(unit || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * Converts a purchase price into TL per normalized gram/ml.
 * Supports common stock-price shapes without requiring a new UI field.
 * If no real user purchase price exists, returns 0 so the caller can fall back
 * to the ingredient database's reference estimate.
 */
function stockPricePerNormalizedUnit(item: StockPriceLike | undefined): number {
  if (!item) return 0;

  const rawPrice = Number(
    item.purchasePrice ?? item.unitPrice ?? item.pricePerUnit ?? item.price ?? 0
  );
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;

  const unit = normalizePriceUnit(item.purchaseUnit || item.priceUnit);

  if (unit.includes('kg')) return rawPrice / 1000;
  if (unit.includes('100g') || unit.includes('100ml')) return rawPrice / 100;
  if (unit === 'g' || unit === 'gram' || unit === 'gramm') return rawPrice;
  if (unit === 'ml' || unit === 'millilitre' || unit === 'milliliter') return rawPrice;

  if (unit.includes('l') && !unit.includes('100')) return rawPrice / 1000;

  // For adet/tane/şişe, infer the normalized size of the purchased stock item.
  const normalizedAmount = Number(item.normalizedGramsOrMl ?? item.amount ?? 0);
  if (normalizedAmount > 0) return rawPrice / normalizedAmount;

  return 0;
}

function ingredientReferencePricePerGram(ingredient: Ingredient): number {
  const price = Number(ingredient.estimatedPrice || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  const unit = normalizePriceUnit(ingredient.priceUnit || 'TL/kg');
  if (unit.includes('kg') || unit === 'l' || unit.includes('litre')) return price / 1000;
  if (unit.includes('100g') || unit.includes('100ml')) return price / 100;

  const serving = Number(ingredient.edibleWeight || ingredient.defaultServing || 100);
  if (unit.includes('adet') || unit.includes('tane') || unit.includes('şişe')) {
    return serving > 0 ? price / serving : 0;
  }

  return price / 1000;
}

/**
 * Determines the real cost per normalized gram/ml for one ingredient.
 * Priority:
 * 1. User stock purchase price, when available.
 * 2. Purchase transaction price, when available in transaction history.
 * 3. Ingredient database reference estimate.
 */
function getActualPricePerGram(ingredient: Ingredient): number {
  const canonical = canonicalIngredientId(ingredient.id);
  const stock = getStoredStock();
  const stockKey = resolveStockKey(stock, canonical);

  if (stockKey) {
    const stockItem = stock[stockKey] as StockPriceLike;
    const stockPrice = stockPricePerNormalizedUnit(stockItem);
    if (stockPrice > 0) return stockPrice;
  }

  const transactions = getStoredStockTransactions();
  const purchases = (transactions || [])
    .filter((tx: any) =>
      tx?.type === 'purchase' && canonicalIngredientId(String(tx.ingredientId || '')) === canonical
    )
    .map((tx: any) => {
      const price = Number(tx.purchasePrice ?? tx.price ?? tx.totalPrice ?? 0);
      const amount = Number(tx.normalizedGramsOrMl ?? 0);
      return price > 0 && amount > 0 ? price / amount : 0;
    })
    .filter((value: number) => value > 0);

  if (purchases.length > 0) {
    // Most recent usable purchase price is the best representation of the user's
    // current cost when transaction history contains explicit purchase prices.
    return purchases[purchases.length - 1];
  }

  return ingredientReferencePricePerGram(ingredient);
}

function calculateShakeActualCost(shake: Shake): number {
  return shake.ingredients.reduce((sum, item) => {
    const ingredientId = canonicalIngredientId(item.ingredientId);
    const ingredient = INGREDIENT_MAP[ingredientId] || INGREDIENT_MAP[item.ingredientId];
    if (!ingredient) return sum;

    const pricePerGram = getActualPricePerGram(ingredient);
    if (pricePerGram <= 0) return sum;

    return sum + pricePerGram * Math.max(0, Number(item.amount || 0));
  }, 0);
}

/**
 * Calculates actual shake cost using the user's stock purchase price when one
 * exists, otherwise the ingredient database reference price.
 */
export function optimizeShakeCost(shake: Shake): CostOptimizationResult {
  const totalCost = calculateShakeActualCost(shake);
  const totalKcal = Math.max(1, Number(shake.estimatedCalories || 0));
  const totalProtein = Math.max(1, Number(shake.protein || 0));

  const costPer100Kcal = Math.round((totalCost / (totalKcal / 100)) * 100) / 100;
  const costPer10gProtein = Math.round((totalCost / (totalProtein / 10)) * 100) / 100;

  // Do not invent fixed savings percentages. Alternatives are informational only;
  // their savings are calculated from the same current pricing model.
  const economicAlternatives: CostOptimizationResult['economicAlternatives'] = [];

  shake.ingredients.forEach((item) => {
    const original = INGREDIENT_MAP[canonicalIngredientId(item.ingredientId)] || INGREDIENT_MAP[item.ingredientId];
    if (!original) return;

    const alternativeIds: string[] = [];
    if (original.id === 'chia_seeds') alternativeIds.push('flax_seeds');
    if (original.id === 'cashew_nuts') alternativeIds.push('roasted_hazelnuts');
    if (original.id === 'chestnut_honey' || original.id === 'flower_honey') alternativeIds.push('grape_molasses');

    for (const alternativeId of alternativeIds) {
      const alternative = INGREDIENT_MAP[alternativeId];
      if (!alternative) continue;

      const originalPrice = getActualPricePerGram(original);
      const alternativePrice = getActualPricePerGram(alternative);
      if (originalPrice <= 0 || alternativePrice <= 0 || alternativePrice >= originalPrice) continue;

      const savings = (originalPrice - alternativePrice) * Math.max(0, Number(item.amount || 0));
      const savingsPercent = originalPrice > 0 ? (savings / (originalPrice * Math.max(0.0001, Number(item.amount || 0)))) * 100 : 0;

      economicAlternatives.push({
        originalIngredient: original,
        alternativeIngredient: alternative,
        estimatedSavingsTL: Math.round(savings * 100) / 100,
        savingsPercent: Math.round(savingsPercent * 10) / 10,
        reason: 'Mevcut fiyat verisine göre daha düşük maliyetli alternatif.',
      });
    }
  });

  return {
    totalEstimatedCost: Math.round(totalCost * 100) / 100,
    costPer100Kcal,
    costPer10gProtein,
    economicAlternatives,
  };
}

export interface CostSavingTip {
  originalName: string;
  alternativeName: string;
  explanation: string;
}

/**
 * Returns neutral cost-saving alternatives without claiming a fixed percentage.
 */
export function getCostSavingSuggestions(ingredientIds: string[]): CostSavingTip[] {
  const tips: CostSavingTip[] = [];
  const idSet = new Set(ingredientIds.map((id) => canonicalIngredientId(id)));

  if (idSet.has('chia_seeds')) {
    tips.push({
      originalName: 'Chia Tohumu',
      alternativeName: 'Keten Tohumu',
      explanation: 'Fiyatı mevcut stok/fiyat verisine göre daha düşükse maliyeti azaltmak için değerlendirilebilir.',
    });
  }

  if (idSet.has('cashew_nuts') || idSet.has('walnuts')) {
    tips.push({
      originalName: 'Kaju / Ceviz',
      alternativeName: 'Kavrulmuş Fındık',
      explanation: 'Mevcut fiyat verisine göre daha düşük maliyetli ise ekonomik alternatif olarak değerlendirilebilir.',
    });
  }

  if (idSet.has('chestnut_honey') || idSet.has('flower_honey')) {
    tips.push({
      originalName: 'Bal',
      alternativeName: 'Pekmez',
      explanation: 'Mevcut fiyat verisine göre daha düşük maliyetli ise ekonomik alternatif olarak değerlendirilebilir.',
    });
  }

  return tips;
}
