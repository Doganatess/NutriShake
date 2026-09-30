import { MealAnalysis, Shake, ShoppingItem, StockItem } from '../types';
import { INGREDIENT_MAP, canonicalIngredientId } from '../data/ingredients';
import { getStoredStock, getStoredStockTransactions } from '../storage/storageAbstraction';

/**
 * Formats grams or ml into friendly Turkish retail units.
 */
export function formatRetailQuantity(gramsOrMl: number, isLiquid: boolean): string {
  const safe = Math.max(0, Number(gramsOrMl) || 0);
  if (isLiquid) {
    if (safe >= 1000) return `${Math.round((safe / 1000) * 10) / 10} L`;
    return `${Math.round(safe)} ml`;
  }
  if (safe >= 1000) return `${Math.round((safe / 1000) * 10) / 10} kg`;
  return `${Math.round(safe)} g`;
}

type PriceLike = {
  purchasePrice?: number;
  purchaseUnit?: string;
  normalizedGramsOrMl?: number;
  amount?: number;
};

function normalizePriceUnit(unit?: string): string {
  return String(unit || '').toLowerCase().replace(/\s+/g, '');
}

function pricePerNormalizedUnit(item?: PriceLike): number {
  if (!item) return 0;
  const price = Number(item.purchasePrice || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const unit = normalizePriceUnit(item.purchaseUnit);
  if (unit.includes('kg')) return price / 1000;
  if (unit === 'l' || unit.includes('litre')) return price / 1000;
  if (unit.includes('100g') || unit.includes('100ml')) return price / 100;
  if (unit === 'g' || unit === 'ml') return price;
  const normalized = Number(item.normalizedGramsOrMl || item.amount || 0);
  return normalized > 0 ? price / normalized : 0;
}

function getActualPricePerNormalizedUnit(ingredientId: string): number {
  const canonical = canonicalIngredientId(ingredientId);
  const stock = getStoredStock();
  const stockKey = Object.keys(stock).find((key) => canonicalIngredientId(key) === canonical);
  const stockItem = stockKey ? stock[stockKey] : undefined;
  const direct = pricePerNormalizedUnit(stockItem as StockItem | undefined);
  if (direct > 0) return direct;

  const transactions = getStoredStockTransactions();
  const purchases = transactions
    .filter((tx: any) => tx?.type === 'purchase' && canonicalIngredientId(String(tx.ingredientId || '')) === canonical)
    .map((tx: any) => {
      const price = Number(tx.purchasePrice || 0);
      const amount = Number(tx.normalizedGramsOrMl || 0);
      return price > 0 && amount > 0 ? price / amount : 0;
    })
    .filter((value: number) => value > 0);

  if (purchases.length) return purchases[purchases.length - 1];

  const ing = INGREDIENT_MAP[canonical] || INGREDIENT_MAP[ingredientId];
  if (!ing) return 0;
  const referencePrice = Number(ing.estimatedPrice || 0);
  if (referencePrice <= 0) return 0;
  const unit = normalizePriceUnit(ing.priceUnit);
  if (unit.includes('kg') || unit === 'l' || unit.includes('litre')) return referencePrice / 1000;
  if (unit.includes('100g') || unit.includes('100ml')) return referencePrice / 100;
  if (unit.includes('adet') || unit.includes('tane') || unit.includes('şişe')) {
    const serving = Number(ing.edibleWeight || ing.defaultServing || 100);
    return serving > 0 ? referencePrice / serving : 0;
  }
  return referencePrice / 1000;
}

/**
 * Smart Shopping List Engine. The list is derived from planned shake quantities
 * minus the user's real pantry stock. Cost uses the user's purchase price when
 * available, then purchase history, then the ingredient reference price.
 */
export function generateShoppingList(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: MealAnalysis[]
): ShoppingItem[] & { items: ShoppingItem[]; totalEstimatedCost: number } {
  let shakes: Shake[] = [];
  let multiplier = 1;
  const existingCheckedIds: Set<string> = arg3 instanceof Set ? arg3 : new Set();

  const plannedMeals: MealAnalysis[] = Array.isArray(arg4) ? arg4 : [];

  if (Array.isArray(arg1)) {
    shakes = arg1;
    multiplier = typeof arg2 === 'number' ? Math.max(1, Math.min(7, arg2)) : 1;
  } else {
    const currentPlan = arg1;
    const savedPlans = arg2 || {};
    const daysScope = typeof arg3 === 'number' ? Math.max(1, Math.min(7, arg3)) : 3;

    if (currentPlan?.shakes) shakes.push(...currentPlan.shakes);
    Object.values(savedPlans).forEach((p: any) => {
      if (p && p.id !== currentPlan?.id && Array.isArray(p.shakes)) shakes.push(...p.shakes);
    });

    multiplier = 1;
    if (shakes.length === 1 && daysScope > 1) multiplier = daysScope;
  }

  const aggregatedMap: Record<string, { totalRequired: number }> = {};
  shakes.forEach((shake) => {
    shake.ingredients?.forEach((item) => {
      const canonicalId = canonicalIngredientId(item.ingredientId);
      const amount = Math.max(0, Number(item.normalizedGrams || item.amount || 0)) * multiplier;
      if (!amount) return;
      aggregatedMap[canonicalId] = aggregatedMap[canonicalId] || { totalRequired: 0 };
      aggregatedMap[canonicalId].totalRequired += amount;
    });
  });

  // Future planned meals participate in the same shopping calculation.
  // Historical meals are ignored by the caller, so the list remains actionable.
  plannedMeals.forEach((meal) => {
    meal.items?.forEach((item) => {
      if (!item.ingredientId || !item.amount) return;
      const canonicalId = canonicalIngredientId(item.ingredientId);
      const amount = Math.max(0, Number(item.amount) || 0);
      if (!amount) return;
      aggregatedMap[canonicalId] = aggregatedMap[canonicalId] || { totalRequired: 0 };
      aggregatedMap[canonicalId].totalRequired += amount;
    });
  });

  const stock = getStoredStock();
  const shoppingList: ShoppingItem[] = Object.entries(aggregatedMap).map(([canonicalId, data]) => {
    const ing = INGREDIENT_MAP[canonicalId];
    const stockKey = Object.keys(stock).find((key) => canonicalIngredientId(key) === canonicalId);
    const currentStock = Math.max(0, Number(stockKey ? stock[stockKey]?.normalizedGramsOrMl : 0) || 0);
    const neededAmount = Math.max(0, data.totalRequired - currentStock);
    const isLiquid = ing?.shakeCompatibility === 'liquid';
    const displayQuantity = formatRetailQuantity(neededAmount, !!isLiquid);
    const pricePerUnit = getActualPricePerNormalizedUnit(canonicalId);
    const estimatedCost = Math.round(neededAmount * pricePerUnit * 10) / 10;

    return {
      id: `shop_${canonicalId}`,
      ingredientId: canonicalId,
      name: ing?.name || canonicalId,
      category: ing?.category || 'others',
      categoryNameTr: ing?.categoryNameTr || 'Diğer',
      requiredAmount: Math.round(data.totalRequired),
      currentStock: Math.round(currentStock),
      neededAmount: Math.round(neededAmount),
      totalGrams: Math.round(data.totalRequired),
      totalGramsOrMl: Math.round(neededAmount),
      retailDisplay: neededAmount > 0 ? displayQuantity : 'Stok yeterli',
      displayQuantity: neededAmount > 0 ? displayQuantity : 'Stok yeterli',
      estimatedCost,
      checked: existingCheckedIds.has(`shop_${canonicalId}`),
      unit: isLiquid ? 'ml' : 'g',
    };
  }).filter((item) => item.neededAmount > 0);

  shoppingList.sort((a, b) => {
    if (a.category !== b.category) return (a.categoryNameTr || '').localeCompare(b.categoryNameTr || '', 'tr');
    return a.name.localeCompare(b.name, 'tr');
  });

  const totalEstimatedCost = Math.round(
    shoppingList.reduce((acc, item) => acc + (item.estimatedCost || 0), 0) * 10
  ) / 10;

  const result = shoppingList as ShoppingItem[] & { items: ShoppingItem[]; totalEstimatedCost: number };
  result.items = shoppingList;
  result.totalEstimatedCost = totalEstimatedCost;
  return result;
}
