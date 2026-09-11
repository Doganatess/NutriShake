import { Shake, ShoppingItem } from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';

/**
 * Formats grams or ml into friendly Turkish retail units
 * e.g., 2500ml -> "2.5 L", 1200g -> "1.2 kg", 250g -> "250 g", 6 adet -> "6 adet"
 */
export function formatRetailQuantity(gramsOrMl: number, isLiquid: boolean): string {
  if (isLiquid) {
    if (gramsOrMl >= 1000) {
      const liters = Math.round((gramsOrMl / 1000) * 10) / 10;
      return `${liters} L`;
    }
    return `${Math.round(gramsOrMl)} ml`;
  }

  if (gramsOrMl >= 1000) {
    const kg = Math.round((gramsOrMl / 1000) * 10) / 10;
    return `${kg} kg`;
  }

  return `${Math.round(gramsOrMl)} g`;
}

/**
 * Smart Shopping List Engine (Requirement 29)
 * Aggregates ingredients from multiple shakes across 1, 3, or 7 days
 * into a consolidated market checklist with calculated estimated prices.
 */
export function generateShoppingList(
  arg1: any,
  arg2?: any,
  arg3?: any
): ShoppingItem[] & { items: ShoppingItem[]; totalEstimatedCost: number } {
  let shakes: Shake[] = [];
  let multiplier = 1;
  let existingCheckedIds: Set<string> = new Set();

  if (Array.isArray(arg1)) {
    shakes = arg1;
    multiplier = typeof arg2 === 'number' ? arg2 : 1;
    if (arg3 instanceof Set) existingCheckedIds = arg3;
  } else {
    // Called as (currentPlan, savedPlans, daysScope)
    const currentPlan = arg1;
    const savedPlans = arg2 || {};
    const daysScope = typeof arg3 === 'number' ? arg3 : 3;

    if (currentPlan && currentPlan.shakes) {
      shakes.push(...currentPlan.shakes);
    }

    const otherPlans = Object.values(savedPlans) as any[];
    otherPlans.forEach((p) => {
      if (p && p.id !== currentPlan?.id && p.shakes) {
        shakes.push(...p.shakes);
      }
    });

    if (daysScope > 1 && shakes.length > 0) {
      multiplier = Math.min(daysScope, 7);
    }
  }

  const aggregatedMap: Record<
    string,
    {
      totalGrams: number;
      totalCost: number;
    }
  > = {};

  shakes.forEach((shake) => {
    shake.ingredients?.forEach((item) => {
      const amount = (item.normalizedGrams || item.amount || 50) * multiplier;
      const ing = INGREDIENT_MAP[item.ingredientId];
      const cost = ing ? (ing.estimatedPrice * (amount / 100)) : 0;

      if (!aggregatedMap[item.ingredientId]) {
        aggregatedMap[item.ingredientId] = {
          totalGrams: amount,
          totalCost: cost,
        };
      } else {
        aggregatedMap[item.ingredientId].totalGrams += amount;
        aggregatedMap[item.ingredientId].totalCost += cost;
      }
    });
  });

  const shoppingList: ShoppingItem[] = Object.entries(aggregatedMap).map(([id, data]) => {
    const ing = INGREDIENT_MAP[id];
    const isLiquid = ing?.shakeCompatibility === 'liquid' || ing?.category === 'dairy';
    const displayQuantity = formatRetailQuantity(data.totalGrams, !!isLiquid);
    const grams = Math.round(data.totalGrams);

    return {
      id: `shop_${id}`,
      ingredientId: id,
      name: ing?.name || id,
      category: ing?.category || 'others',
      categoryNameTr: ing?.categoryNameTr || 'Diğer',
      requiredAmount: grams,
      currentStock: 0,
      neededAmount: grams,
      totalGrams: grams,
      retailDisplay: displayQuantity,
      displayQuantity,
      estimatedCost: Math.round(data.totalCost * 10) / 10,
      checked: existingCheckedIds.has(`shop_${id}`),
    };
  });

  // Sort by category and name
  shoppingList.sort((a, b) => {
    if (a.category !== b.category) {
      return (a.categoryNameTr || '').localeCompare(b.categoryNameTr || '', 'tr');
    }
    return a.name.localeCompare(b.name, 'tr');
  });

  const totalEstimatedCost = Math.round(
    shoppingList.reduce((acc, item) => acc + (item.estimatedCost || 0), 0) * 10
  ) / 10;

  const result = shoppingList as any;
  result.items = shoppingList;
  result.totalEstimatedCost = totalEstimatedCost;

  return result;
}
