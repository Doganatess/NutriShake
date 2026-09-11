import { Ingredient, IngredientCategory } from '../../types';
import { FRUITS } from './fruits';
import { DRIED_FRUITS } from './driedFruits';
import { DAIRY } from './dairy';
import { GRAINS } from './grains';
import { SWEETENERS } from './sweeteners';
import { COCOA_EXTRAS } from './cocoaExtras';
import { NUTS } from './nuts';
import { OTHERS } from './others';
import { normalizeTurkish, searchIngredients as baseSearchIngredients } from '../../utils/turkishSearch';

export { normalizeTurkish };

/**
 * Searches ingredients with Turkish character tolerance, defaulting to master database
 */
export function searchIngredients(
  query: string,
  ingredients?: Ingredient[]
): Ingredient[] {
  return baseSearchIngredients(query, ingredients || INGREDIENTS_DATABASE);
}

/**
 * Authentic Turkish & Regional (Ordu / Ünye / Karadeniz) Master Ingredient Database.
 * Strictly organized into 8 master categories.
 * Contains ZERO supplements, protein powders, peanut butter, or seeds.
 */
export const INGREDIENTS_DATABASE: Ingredient[] = [
  ...FRUITS,
  ...DRIED_FRUITS,
  ...DAIRY,
  ...GRAINS,
  ...SWEETENERS,
  ...COCOA_EXTRAS,
  ...NUTS,
  ...OTHERS,
];

/**
 * Fast lookup map indexed by unique ingredient ID
 */
export const INGREDIENT_MAP: Record<string, Ingredient> = INGREDIENTS_DATABASE.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<string, Ingredient>
);

// Map common shorthand aliases for robust backwards-compatibility & AI tolerance
const ALIAS_MAP: Record<string, string> = {
  milk_whole: 'dairy_whole_milk',
  milk_semi_skimmed: 'dairy_semi_skimmed_milk',
  yogurt_strained: 'dairy_strained_yogurt',
  yogurt_village: 'dairy_village_yogurt',
  banana: 'fruit_banana',
  apple_red: 'fruit_apple',
  strawberry: 'fruit_strawberry',
  blueberry_fresh: 'fruit_blueberry',
  fig_fresh: 'fruit_fig',
  mulberry_fresh: 'fruit_mulberry',
  oats_fine: 'grain_oats',
  oats_rolled: 'grain_oats',
  oat_flour: 'grain_oat_flour',
  hazelnut_roasted: 'nut_hazelnut',
  walnut: 'nut_walnut',
  almond: 'nut_almond',
  fig_dried: 'dried_fig',
  water_natural: 'other_water',
  cinnamon_ground: 'other_cinnamon',
  grape_molasses: 'molasses_grape',
  mulberry_molasses: 'molasses_mulberry',
  carob_molasses: 'molasses_carob',
};

for (const [alias, realId] of Object.entries(ALIAS_MAP)) {
  if (INGREDIENT_MAP[realId]) {
    INGREDIENT_MAP[alias] = INGREDIENT_MAP[realId];
  }
}

/**
 * The 8 Master Categories with display metadata
 */
export const INGREDIENT_CATEGORIES: { id: IngredientCategory | 'all'; nameTr: string; icon: string }[] = [
  { id: 'all', nameTr: 'Tümü', icon: '✨' },
  { id: 'fruits', nameTr: 'Meyveler', icon: '🍎' },
  { id: 'dried_fruits', nameTr: 'Kuru Meyveler', icon: '🍇' },
  { id: 'dairy', nameTr: 'Süt Ürünleri', icon: '🥛' },
  { id: 'grains', nameTr: 'Tahıllar', icon: '🌾' },
  { id: 'sweeteners', nameTr: 'Tatlandırıcılar', icon: '🍯' },
  { id: 'cocoa_extras', nameTr: 'Kakao ve Shake Ekstraları', icon: '🍫' },
  { id: 'nuts', nameTr: 'Kuruyemişler', icon: '🌰' },
  { id: 'others', nameTr: 'Diğer', icon: '💧' },
];

/**
 * Helper to get ingredients by category
 */
export function getIngredientsByCategory(category: IngredientCategory | 'all'): Ingredient[] {
  if (category === 'all') return INGREDIENTS_DATABASE;
  return INGREDIENTS_DATABASE.filter((item) => item.category === category);
}

/**
 * Helper to find ingredient by ID or name alias
 */
export function findIngredient(idOrName: string): Ingredient | undefined {
  if (!idOrName) return undefined;
  if (INGREDIENT_MAP[idOrName]) return INGREDIENT_MAP[idOrName];

  const norm = normalizeTurkish(idOrName);
  return INGREDIENTS_DATABASE.find(
    (ing) =>
      normalizeTurkish(ing.name) === norm ||
      ing.aliases.some((a) => normalizeTurkish(a) === norm)
  );
}
