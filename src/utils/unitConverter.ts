import { Ingredient, SupportedUnit } from '../types';

/**
 * Standard unit normalization:
 * Converts any user quantity and unit into standard grams or milliliters.
 */
export function normalizeToGramsOrMl(
  amount: number,
  unit: SupportedUnit | string,
  ingredient?: Ingredient | null
): number {
  if (amount <= 0) return 0;

  const cleanUnit = (unit || 'g').trim().toLowerCase();

  // If ingredient has custom unit options, check there first
  if (ingredient && ingredient.units && ingredient.units.length > 0) {
    const custom = ingredient.units.find(
      (u) => u.unit.toLowerCase() === cleanUnit || u.label.toLowerCase() === cleanUnit
    );
    if (custom) {
      return amount * custom.grams;
    }
  }

  // Standard metric multipliers
  switch (cleanUnit) {
    case 'kg':
      return amount * 1000;
    case 'l':
    case 'litre':
      return amount * 1000;
    case 'g':
    case 'gram':
      return amount;
    case 'ml':
    case 'mililitre':
      return amount;

    // Piece fractions
    case 'adet':
    case 'tane':
      if (amount > 25) return amount; // Already normalized in grams
      return amount * (ingredient?.edibleWeight || 100);
    case '1/2 adet':
    case 'yarım adet':
      return amount * ((ingredient?.edibleWeight || 100) * 0.5);
    case '1/4 adet':
    case 'çeyrek adet':
      return amount * ((ingredient?.edibleWeight || 100) * 0.25);

    // Common household measures
    case 'dilim':
      return amount * (ingredient?.edibleWeight ? ingredient.edibleWeight * 0.35 : 30);
    case 'yemek kaşığı':
    case 'yk':
      // Denser items like honey/molasses/yogurt are ~20g; grains/cocoa ~10g
      if (ingredient?.category === 'sweeteners' || ingredient?.category === 'dairy') {
        return amount * 20;
      }
      return amount * 12;
    case 'tatlı kaşığı':
    case 'tk':
      return amount * (ingredient?.category === 'sweeteners' ? 10 : 6);
    case 'çay kaşığı':
    case 'çk':
      return amount * (ingredient?.category === 'sweeteners' ? 5 : 3);
    case 'porsiyon':
      return amount * (ingredient?.defaultServing || 100);

    default:
      return amount;
  }
}

/**
 * Backward compatibility alias for legacy callers (supports both (amount, unit, ing) and (ing, amount, unit))
 */
export function normalizeQuantityToGrams(
  arg1: any,
  arg2?: any,
  arg3?: any
): number {
  if (typeof arg1 === 'number') {
    return normalizeToGramsOrMl(arg1, arg2, arg3);
  }
  return normalizeToGramsOrMl(arg2, arg3, arg1);
}

/**
 * Formats a normalized gram/ml amount into the most natural Turkish unit for user display.
 */
export function formatNormalizedUnit(
  normalizedAmount: number,
  ingredient?: Ingredient | null,
  preferredUnit?: string
): { display: string; amount: number; unit: string } {
  if (!normalizedAmount || normalizedAmount <= 0) {
    return { display: '0 g', amount: 0, unit: 'g' };
  }

  const isLiquid =
    ingredient?.shakeCompatibility === 'liquid' ||
    ingredient?.category === 'dairy' ||
    ingredient?.category === 'others';

  // If ingredient is a fruit and has an edibleWeight, check if displaying as 'adet' makes sense
  if (
    ingredient?.category === 'fruits' &&
    ingredient.edibleWeight &&
    (!preferredUnit || preferredUnit === 'adet')
  ) {
    const pieces = Math.round((normalizedAmount / ingredient.edibleWeight) * 10) / 10;
    if (pieces >= 0.5) {
      return {
        display: `${pieces} adet`,
        amount: pieces,
        unit: 'adet',
      };
    }
  }

  // Kilogram for large dry weights
  if (!isLiquid && normalizedAmount >= 1000) {
    const kg = Math.round((normalizedAmount / 1000) * 100) / 100;
    return {
      display: `${kg} kg`,
      amount: kg,
      unit: 'kg',
    };
  }

  // Litre for liquids >= 1000 ml
  if (isLiquid && normalizedAmount >= 1000) {
    const litres = Math.round((normalizedAmount / 1000) * 100) / 100;
    return {
      display: `${litres} L`,
      amount: litres,
      unit: 'L',
    };
  }

  // Standard grams or ml
  if (isLiquid) {
    return {
      display: `${Math.round(normalizedAmount)} ml`,
      amount: Math.round(normalizedAmount),
      unit: 'ml',
    };
  }

  return {
    display: `${Math.round(normalizedAmount)} g`,
    amount: Math.round(normalizedAmount),
    unit: 'g',
  };
}
