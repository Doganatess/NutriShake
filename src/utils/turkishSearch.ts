import { Ingredient } from '../types';

/**
 * Normalizes Turkish text for search:
 * - Lowercases with Turkish locale
 * - Replaces Turkish characters: ç->c, ğ->g, ı/i->i, ö->o, ş->s, ü->u
 * - Removes accents and punctuation
 */
export function normalizeTurkish(text: string): string {
  if (!text) return '';
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Checks if a target string matches a query using Turkish normalization
 */
export function matchesTurkish(target: string, query: string): boolean {
  if (!query) return true;
  if (!target) return false;
  const normTarget = normalizeTurkish(target);
  const normQuery = normalizeTurkish(query);
  return normTarget.includes(normQuery);
}

/**
 * Searches ingredients by name and aliases with Turkish character tolerance
 */
export function searchIngredients(
  query: string,
  ingredients: Ingredient[]
): Ingredient[] {
  const normQuery = normalizeTurkish(query);
  if (!normQuery) return ingredients;

  return ingredients.filter((ing) => {
    // Check main name
    if (normalizeTurkish(ing.name).includes(normQuery)) return true;

    // Check aliases
    if (
      ing.aliases &&
      ing.aliases.some((alias) => normalizeTurkish(alias).includes(normQuery))
    ) {
      return true;
    }

    // Check category name in Turkish
    if (
      ing.categoryNameTr &&
      normalizeTurkish(ing.categoryNameTr).includes(normQuery)
    ) {
      return true;
    }

    return false;
  });
}
