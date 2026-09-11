import { Shake, ShakeIngredient, Ingredient } from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE } from '../data/ingredients';

export interface CostOptimizationResult {
  totalEstimatedCost: number; // TL
  costPer100Kcal: number; // TL / 100 kcal
  costPer10gProtein: number; // TL / 10g protein
  economicAlternatives: {
    originalIngredient: Ingredient;
    alternativeIngredient: Ingredient;
    estimatedSavingsTL: number;
    savingsPercent: number;
    reason: string;
  }[];
}

/**
 * Cost Optimizer Engine (Requirement 28)
 * Computes realistic cost per shake and suggests economically optimized local alternatives
 * with matching nutritional profiles.
 */
export function optimizeShakeCost(shake: Shake): CostOptimizationResult {
  const totalCost = shake.estimatedCost || 0;
  const totalKcal = shake.estimatedCalories || 1;
  const totalProtein = shake.protein || 1;

  const costPer100Kcal = Math.round((totalCost / (totalKcal / 100)) * 10) / 10;
  const costPer10gProtein = Math.round((totalCost / (totalProtein / 10)) * 10) / 10;

  const economicAlternatives: CostOptimizationResult['economicAlternatives'] = [];

  shake.ingredients.forEach((item) => {
    const ing = INGREDIENT_MAP[item.ingredientId];
    if (!ing) return;

    // Example 1: Imported chia vs domestic flax seed (Keten tohumu)
    if (ing.id === 'chia_seeds') {
      const flax = INGREDIENT_MAP['flax_seeds'];
      if (flax) {
        economicAlternatives.push({
          originalIngredient: ing,
          alternativeIngredient: flax,
          estimatedSavingsTL: Math.round(((ing.estimatedPrice - flax.estimatedPrice) * (item.amount / 100)) * 10) / 10,
          savingsPercent: 45,
          reason: 'Keten tohumu, yerli üretim olup benzer omega-3 ve lif değerini daha ekonomik fiyata sağlar.',
        });
      }
    }

    // Example 2: Walnut / Cashew vs Roasted Hazelnut (Yerli Ordu Fındığı)
    if (ing.id === 'cashew_nuts') {
      const hazelnut = INGREDIENT_MAP['roasted_hazelnuts'];
      if (hazelnut) {
        economicAlternatives.push({
          originalIngredient: ing,
          alternativeIngredient: hazelnut,
          estimatedSavingsTL: Math.round(((ing.estimatedPrice - hazelnut.estimatedPrice) * (item.amount / 100)) * 10) / 10,
          savingsPercent: 35,
          reason: 'Ordu yerli kavrulmuş fındığı, ithal kajudan çok daha taze ve ekonomik bir yağ/mineral kaynağıdır.',
        });
      }
    }

    // Example 3: Honey vs Homemade/Village Molasses (Pekmez)
    if (ing.id === 'chestnut_honey') {
      const grapeMolasses = INGREDIENT_MAP['grape_molasses'];
      if (grapeMolasses) {
        economicAlternatives.push({
          originalIngredient: ing,
          alternativeIngredient: grapeMolasses,
          estimatedSavingsTL: Math.round(((ing.estimatedPrice - grapeMolasses.estimatedPrice) * (item.amount / 100)) * 10) / 10,
          savingsPercent: 60,
          reason: 'Geleneksel üzüm veya dut pekmezi, kestane balına kıyasla benzer demir ve enerji profilini çok daha bütçe dostu sunar.',
        });
      }
    }
  });

  return {
    totalEstimatedCost: Math.round(totalCost * 10) / 10,
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

export function getCostSavingSuggestions(ingredientIds: string[]): CostSavingTip[] {
  const tips: CostSavingTip[] = [];
  const idSet = new Set(ingredientIds);

  if (idSet.has('chia_seeds')) {
    tips.push({
      originalName: 'Chia Tohumu',
      alternativeName: 'Yerli Keten Tohumu',
      explanation: 'Benzer lif ve omega-3 profili sunar, yerli üretim olduğundan bütçenizi korur.',
    });
  }

  if (idSet.has('cashew_nuts') || idSet.has('walnuts')) {
    tips.push({
      originalName: 'İthal Kaju / Ceviz',
      alternativeName: 'Kavrulmuş Ordu Fındığı',
      explanation: 'Taze Karadeniz fındığı zengin E vitamini ve sağlıklı yağ profiliyle hem daha tazedir hem daha ekonomiktir.',
    });
  }

  if (idSet.has('chestnut_honey') || idSet.has('flower_honey')) {
    tips.push({
      originalName: 'Bal',
      alternativeName: 'Köy Pekmezi (Dut / Üzüm)',
      explanation: 'Geleneksel pekmez yüksek demir ve mineral içeriğiyle zenginleştirir ve daha uygun maliyetlidir.',
    });
  }

  return tips;
}
