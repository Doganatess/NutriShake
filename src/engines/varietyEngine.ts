import { Shake, Ingredient, ShakeIngredient } from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE } from '../data/ingredients';

export interface VarietyAnalysis {
  varietyScore: number; // 0 to 100
  recentIngredients: string[];
  frequentIngredients: { id: string; name: string; count: number }[];
  suggestedAlternatives: { category: string; suggestions: Ingredient[] }[];
  warningMessage?: string;
}

/**
 * Variety Engine (Requirement 31)
 * Analyzes historical shakes from past days to prevent repetitive ingredient fatigue.
 * Scores diversity and recommends fresh seasonal/regional alternatives.
 */
export function analyzeShakeVariety(
  targetShakeIngredients: string[],
  historicalShakes: Shake[]
): VarietyAnalysis {
  const frequencyMap: Record<string, number> = {};

  historicalShakes.forEach((shake) => {
    shake.ingredients.forEach((item) => {
      frequencyMap[item.ingredientId] = (frequencyMap[item.ingredientId] || 0) + 1;
    });
  });

  const frequentIngredients = Object.entries(frequencyMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, count]) => ({
      id,
      name: INGREDIENT_MAP[id]?.name || id,
      count,
    }));

  // Calculate repetition penalty for target shake
  let repeatedCount = 0;
  targetShakeIngredients.forEach((id) => {
    if (frequencyMap[id] && frequencyMap[id] >= 2) {
      repeatedCount++;
    }
  });

  const varietyScore = Math.max(20, Math.round(100 - repeatedCount * 22));

  // Suggest alternatives in unused categories
  const usedIds = new Set(Object.keys(frequencyMap).concat(targetShakeIngredients));

  const fruitAlternatives = INGREDIENTS_DATABASE.filter(
    (i) => i.category === 'fruits' && !usedIds.has(i.id)
  ).slice(0, 4);

  const sweetenerAlternatives = INGREDIENTS_DATABASE.filter(
    (i) => i.category === 'sweeteners' && !usedIds.has(i.id)
  ).slice(0, 3);

  const nutAlternatives = INGREDIENTS_DATABASE.filter(
    (i) => i.category === 'nuts' && !usedIds.has(i.id)
  ).slice(0, 3);

  const suggestedAlternatives = [
    { category: 'Farklı Meyveler', suggestions: fruitAlternatives },
    { category: 'Farklı Tatlandırıcılar (Pekmez / Bal / Reçel)', suggestions: sweetenerAlternatives },
    { category: 'Farklı Kuruyemişler', suggestions: nutAlternatives },
  ].filter((group) => group.suggestions.length > 0);

  let warningMessage: string | undefined;
  if (varietyScore < 50) {
    warningMessage = 'Son günlerde benzer malzemeler (özellikle muz veya süt) sık tekrarlandı. Çeşitlilik için alternatif meyve ve pekmezleri deneyebilirsiniz.';
  }

  return {
    varietyScore,
    recentIngredients: Object.keys(frequencyMap),
    frequentIngredients,
    suggestedAlternatives,
    warningMessage,
  };
}

/**
 * Calculates variety score across recent daily plans
 */
export function calculateVarietyScore(
  plans: any[],
  _days = 7
): { score: number; repeatedIngredients: string[] } {
  const counts: Record<string, number> = {};
  plans.forEach((p) => {
    if (p && Array.isArray(p.shakes)) {
      p.shakes.forEach((s: any) => {
        if (s && Array.isArray(s.ingredients)) {
          s.ingredients.forEach((item: any) => {
            counts[item.ingredientId] = (counts[item.ingredientId] || 0) + 1;
          });
        }
      });
    }
  });

  const repeated = Object.entries(counts)
    .filter(([, c]) => c >= 3)
    .map(([id]) => id);

  const uniqueCount = Object.keys(counts).length;
  const score = Math.min(100, Math.max(30, Math.round(uniqueCount * 8 - repeated.length * 5)));

  return {
    score: isNaN(score) ? 80 : score,
    repeatedIngredients: repeated,
  };
}

/**
 * Checks semantic recipe similarity between two shakes.
 * E.g. Banana + Milk + Oats + Molasses + Hazelnut vs
 *      Banana + Milk + Oats + Honey + Hazelnut
 * is semantically very similar (> 80%) because Honey and Molasses serve the exact same sweetener role.
 */
export function computeSemanticSimilarity(
  ingredientsA: (string | ShakeIngredient)[],
  ingredientsB: (string | ShakeIngredient)[]
): { similarity: number; isTooSimilar: boolean; explanation?: string } {
  const idsA = ingredientsA.map((i) => (typeof i === 'string' ? i : i.ingredientId));
  const idsB = ingredientsB.map((i) => (typeof i === 'string' ? i : i.ingredientId));

  if (idsA.length === 0 || idsB.length === 0) {
    return { similarity: 0, isTooSimilar: false };
  }

  let directMatches = 0;
  let semanticMatches = 0;

  const matchedB = new Set<string>();

  for (const a of idsA) {
    if (idsB.includes(a)) {
      directMatches++;
      matchedB.add(a);
      continue;
    }

    const ingA = INGREDIENT_MAP[a];
    if (!ingA) continue;

    // Check if an unmatched ingredient in B shares category and role (e.g. honey vs molasses)
    for (const b of idsB) {
      if (matchedB.has(b)) continue;
      const ingB = INGREDIENT_MAP[b];
      if (ingB && ingA.category === ingB.category && ingA.role === ingB.role) {
        semanticMatches += 0.8; // 80% semantic equivalence
        matchedB.add(b);
        break;
      }
    }
  }

  const maxLen = Math.max(idsA.length, idsB.length);
  const similarity = Math.round(((directMatches + semanticMatches) / maxLen) * 100) / 100;
  const isTooSimilar = similarity >= 0.75;

  let explanation: string | undefined;
  if (isTooSimilar) {
    explanation = `Önceki tarifle %${Math.round(similarity * 100)} oranında benzer (aynı temel iskelet). Çeşitlilik için alternatif bileşenler seçilmelidir.`;
  }

  return {
    similarity,
    isTooSimilar,
    explanation,
  };
}
