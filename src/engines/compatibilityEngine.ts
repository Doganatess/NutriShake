import { Ingredient, ShakeIngredient } from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';

export interface CompatibilityReport {
  score: number; // 0 to 100
  harmonyRating: 'mükemmel' | 'dengeli' | 'uyumsuz' | 'dikkat';
  warnings: string[];
  tips: string[];
  detectedSynergies: string[];
  dominantTaste: string;
  predictedTexture: 'akışkan' | 'ideal kadifemsi' | 'koyu puding' | 'çok katı';
}

/**
 * Evaluates ingredient compatibility, flavor profile balance, and texture synergy.
 */
export function analyzeCompatibility(ingredients: ShakeIngredient[]): CompatibilityReport {
  const warnings: string[] = [];
  const tips: string[] = [];
  const synergies: string[] = [];

  const ingObjects = ingredients
    .map((i) => ({ ...i, details: INGREDIENT_MAP[i.ingredientId] }))
    .filter((i) => !!i.details);

  if (ingObjects.length === 0) {
    return {
      score: 100,
      harmonyRating: 'dengeli',
      warnings: [],
      tips: ['En az bir sıvı baz (ör. Tam Yağlı Süt) ve bir ana malzeme ekleyin.'],
      detectedSynergies: [],
      dominantTaste: 'nötr',
      predictedTexture: 'akışkan',
    };
  }

  // 1. Check Liquid Base presence
  const liquidBase = ingObjects.find(
    (i) =>
      i.details?.shakeCompatibility === 'liquid' ||
      i.details?.category === 'dairy' ||
      i.ingredientId === 'other_water'
  );

  let totalLiquidMl = 0;
  let totalDenseGrams = 0;

  for (const item of ingObjects) {
    if (
      item.details?.shakeCompatibility === 'liquid' ||
      item.details?.id === 'dairy_whole_milk' ||
      item.details?.id === 'dairy_semi_skimmed_milk' ||
      item.details?.id === 'other_water'
    ) {
      totalLiquidMl += item.amount;
    } else if (
      item.details?.category === 'grains' ||
      item.details?.shakeCompatibility === 'thickener'
    ) {
      totalDenseGrams += item.amount;
    }
  }

  if (!liquidBase || totalLiquidMl < 100) {
    warnings.push('Sıvı baz yetersiz! Blenderın rahat çekmesi için en az 150-200 ml süt veya su ekleyin.');
  }

  // 2. Texture prediction
  let predictedTexture: CompatibilityReport['predictedTexture'] = 'ideal kadifemsi';
  if (totalLiquidMl > 0 && totalDenseGrams / totalLiquidMl > 0.45) {
    predictedTexture = 'çok katı';
    warnings.push('Yulaf veya katı tahıl oranı yüksek; shake bekledikçe aşırı koyulaşabilir.');
    tips.push('Daha rahat içim için 50-100 ml süt veya su ilave edebilirsiniz.');
  } else if (totalLiquidMl > 0 && totalDenseGrams / totalLiquidMl > 0.25) {
    predictedTexture = 'koyu puding';
  } else if (totalLiquidMl >= 250 && totalDenseGrams < 20) {
    predictedTexture = 'akışkan';
  }

  // 3. Known synergistic flavor combinations
  const ids = ingObjects.map((i) => i.ingredientId);

  // Cocoa + Hazelnut (Fındık + Kakao)
  if (
    (ids.includes('nut_hazelnut') || ids.includes('nut_hazelnut_ground')) &&
    ids.includes('extra_cocoa_powder')
  ) {
    synergies.push('Fındık ve Kakao: Doğal ev yapımı Türk fındık kreması (sağlıklı Nutella) uyumu!');
  }

  // Banana + Oats + Milk (Muz + Yulaf + Süt)
  if (
    ids.includes('fruit_banana') &&
    (ids.includes('grain_oats') || ids.includes('grain_oat_flour')) &&
    (ids.includes('dairy_whole_milk') || ids.includes('dairy_semi_skimmed_milk'))
  ) {
    synergies.push('Muz, Yulaf ve Süt: Kusursuz tok tutucu altın antrenman & kahvaltı bazı.');
  }

  // Fig + Walnut (İncir + Ceviz)
  if (
    (ids.includes('fruit_fig') || ids.includes('dried_fig')) &&
    ids.includes('nut_walnut')
  ) {
    synergies.push('İncir ve Ceviz: Geleneksel Ege tatlısı lezzeti ve yüksek Omega-3.');
  }

  // Molasses + Tahini / Milk (Pekmez + Süt)
  if (
    (ids.includes('molasses_grape') || ids.includes('molasses_mulberry') || ids.includes('molasses_carob')) &&
    (ids.includes('dairy_whole_milk') || ids.includes('dairy_semi_skimmed_milk'))
  ) {
    synergies.push('Pekmez ve Süt: Zengin demir, kalsiyum ve doğal enerji köprüsü.');
  }

  // 4. Taste Clash / Curdling warnings
  // High citrus/acid with warm milk
  const hasSourOrAcid = ingObjects.some(
    (i) =>
      i.ingredientId === 'fruit_lemon' ||
      i.ingredientId === 'fruit_sour_cherry' ||
      i.ingredientId === 'jam_sour_cherry'
  );
  const hasMilk = ingObjects.some((i) => i.details?.category === 'dairy');

  if (hasSourOrAcid && hasMilk && ids.includes('fruit_lemon')) {
    warnings.push('Yoğun limon asidi sütü kesebilir. Yoğurtla veya su bazıyla tüketmeniz tavsiye edilir.');
  }

  // Sweetener balance
  const sweetenerCount = ingObjects.filter((i) => i.details?.category === 'sweeteners').length;
  if (sweetenerCount > 2) {
    warnings.push('Birden fazla tatlandırıcı (reçel, bal, pekmez) eklenmiş. Şeker yükünü azaltmak için teke indirmeniz önerilir.');
  }

  // Calculate score
  let score = 95;
  if (warnings.length > 0) score -= warnings.length * 15;
  if (synergies.length > 0) score += Math.min(10, synergies.length * 5);
  score = Math.max(20, Math.min(100, score));

  let harmonyRating: CompatibilityReport['harmonyRating'] = 'dengeli';
  if (score >= 90) harmonyRating = 'mükemmel';
  else if (score >= 70) harmonyRating = 'dengeli';
  else if (score >= 50) harmonyRating = 'dikkat';
  else harmonyRating = 'uyumsuz';

  // Dominant taste profile
  const tastes = ingObjects.map((i) => i.details?.tasteProfile).filter(Boolean);
  const dominantTaste = tastes[0] || 'dengeli';

  return {
    score,
    harmonyRating,
    warnings,
    tips,
    detectedSynergies: synergies,
    dominantTaste,
    predictedTexture,
  };
}
