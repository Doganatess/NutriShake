import { GoogleGenAI, Type } from '@google/genai';
import { INGREDIENTS_DATABASE, INGREDIENT_MAP } from '../data/ingredients.js';
import { calculateShakeNutrition } from '../utils/nutritionEngine.js';
import {
  validateAndSanitizeShake,
  getRecipeFingerprint,
  calculateRecipeSimilarity,
} from '../utils/recipeValidator.js';
import { PortionPreference, Shake, DailyPlan } from '../types.js';
import { composeThreeDistinctDailyShakes, composeDeterministicShake } from '../engines/recipeCompositionEngine.js';
import { getAvailableStockGrams, calculatePantryShakeCalorieCapacity } from '../engines/stockEngine.js';
import { DAILY_TARGET_KCAL, CALORIE_TOLERANCE_KCAL } from '../constants/calorieTargets.js';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY sistem ortam değişkeni tanımlı değil. Lütfen Settings > Secrets panelinden anahtarınızı kontrol edin.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Executes a Gemini model call with automatic fallback from gemini-3.8-flash to
 * gemini-3.1-flash-lite when the primary model experiences high demand (503),
 * transient rate limits (429), or capacity spikes.
 */
async function callWithModelFallback<T>(
  action: (model: string) => Promise<T>
): Promise<T> {
  const primaryModel = 'gemini-3.8-flash';
  const fallbackModel = 'gemini-3.1-flash-lite';

  try {
    return await action(primaryModel);
  } catch (err: unknown) {
    const errorStr = String(err).toLowerCase();
    const isModelUnavailable =
      errorStr.includes('503') ||
      errorStr.includes('high demand') ||
      errorStr.includes('unavailable') ||
      errorStr.includes('429') ||
      errorStr.includes('resource_exhausted') ||
      errorStr.includes('rate') ||
      errorStr.includes('overloaded');

    if (isModelUnavailable) {
      console.warn(`[Gemini] Model ${primaryModel} yoğun/meşgul (503/429). Yedek model ${fallbackModel} devreye alınıyor...`);
      return await action(fallbackModel);
    }
    throw err;
  }
}

/**
 * Retries an async action up to maxRetries on transient errors
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const errorStr = String(err).toLowerCase();
      // Retry on network or transient errors
      if (errorStr.includes('429') || errorStr.includes('rate') || errorStr.includes('timeout') || errorStr.includes('503') || errorStr.includes('fetch')) {
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Maksimum deneme sayısına ulaşıldı.');
}

// -------------------------------------------------------------
// DETERMINISTIC RECIPE TEMPLATES (Guaranteed Zero-Downtime Whole-Food Pool)
// -------------------------------------------------------------
interface TemplateDef {
  name: string;
  description: string;
  ingredients: { ingredientId: string; amount: number; unit: string }[];
  instructions: string;
  prepTime: number;
}

const DETERMINISTIC_RECIPE_TEMPLATES: TemplateDef[] = [
  {
    name: 'Ordu Fındıklı & Muzlu Güç Shake',
    description: 'Kavrulmuş Ordu fındığı, yerli muz, tam yağlı süt, yulaf ve yayla çiçek balı ile yüksek enerjili doğal karışım.',
    ingredients: [
      { ingredientId: 'dairy_whole_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'fruit_banana', amount: 120, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 40, unit: 'g' },
      { ingredientId: 'nut_hazelnut', amount: 25, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 15, unit: 'g' },
    ],
    instructions: 'Fındıkları ve yulafı blendera alıp önce hafifçe çekin. Ardından süt, muz ve balı ilave edip 45 saniye pürüzsüz kıvama gelene kadar karıştırın.',
    prepTime: 3,
  },
  {
    name: 'Likapa & Süzme Yoğurtlu Yayla Shake',
    description: 'Doğu Karadeniz yaylalarının meşhur likapası (yaban mersini), süzme yoğurt, ceviz ve yulaf ile antioksidan deposu.',
    ingredients: [
      { ingredientId: 'dairy_strained_yogurt', amount: 150, unit: 'g' },
      { ingredientId: 'other_water', amount: 100, unit: 'ml' },
      { ingredientId: 'dried_blueberry', amount: 40, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 35, unit: 'g' },
      { ingredientId: 'nut_walnut', amount: 20, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 15, unit: 'g' },
    ],
    instructions: 'Süzme yoğurt ve suyu blendera koyun. Yaban mersini, yulaf, ceviz ve balı ekleyerek 45 saniye yüksek devirde homojen olana kadar karıştırın.',
    prepTime: 4,
  },
  {
    name: 'Karadeniz Dağ Çileği & Yulaf Doyurucu Shake',
    description: 'Kokulu taze çilek, tam yağlı süt, yerli ceviz içi ve köy usulü dut pekmezi ile besleyici lezzet.',
    ingredients: [
      { ingredientId: 'dairy_whole_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'fruit_strawberry', amount: 120, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 40, unit: 'g' },
      { ingredientId: 'nut_walnut', amount: 20, unit: 'g' },
      { ingredientId: 'molasses_mulberry', amount: 15, unit: 'g' },
    ],
    instructions: 'Çilekleri temizleyin. Süt, ceviz, yulaf ve dut pekmezi ile birlikte blendera aktarıp pürüzsüzleşene dek çekin.',
    prepTime: 3,
  },
  {
    name: 'Kuru İncirli & Muzlu Anadolu Shake',
    description: 'Doğal kuru incir, yer fıstığı, tam yağlı süt, yulaf ve bal ile yüksek lif ve kalsiyum zengini doyurucu tarif.',
    ingredients: [
      { ingredientId: 'dairy_whole_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'dried_fig', amount: 40, unit: 'g' },
      { ingredientId: 'fruit_banana', amount: 80, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 35, unit: 'g' },
      { ingredientId: 'nut_peanut', amount: 20, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 10, unit: 'g' },
    ],
    instructions: 'Kuru incirleri ılık suda 5 dakika yumuşatıp ikiye kesin. Süt, yer fıstığı, muz, yulaf ve bal ile blendera alıp 60 saniye çekin.',
    prepTime: 4,
  },
  {
    name: 'Taze Dut & Çiğ Bademli Denge Shake',
    description: 'Taze dut, yarım yağlı süt, çiğ badem ve üzüm pekmezi ile kas onarıcı zengin öğün.',
    ingredients: [
      { ingredientId: 'dairy_semi_skimmed_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'fruit_mulberry', amount: 80, unit: 'g' },
      { ingredientId: 'nut_almond', amount: 20, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 30, unit: 'g' },
      { ingredientId: 'molasses_grape', amount: 15, unit: 'g' },
    ],
    instructions: 'Tüm malzemeleri blender kabında toplayın. Çiğ bademler tamamen dağılıncaya kadar 50 saniye karıştırın.',
    prepTime: 3,
  },
  {
    name: 'Amasya Elmalı & Cevizli Ballı Öğle Shake',
    description: 'Taze Amasya elması, ceviz içi, tam yağlı süt, yulaf ve yayla çiçek balı ile hafif ve besleyici shake.',
    ingredients: [
      { ingredientId: 'dairy_whole_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'fruit_apple', amount: 120, unit: 'g' },
      { ingredientId: 'nut_walnut', amount: 25, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 35, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 15, unit: 'g' },
    ],
    instructions: 'Elmayı yıkayıp çekirdeklerini çıkararak küp doğrayın. Süt, ceviz, yulaf ve balı blenderda krema kıvamına gelene kadar karıştırın.',
    prepTime: 4,
  },
  {
    name: 'Trabzon Hurmalı & Fıstıklı Karamel Shake',
    description: 'Olgun Trabzon hurması, yer fıstığı, tam yağlı süt ve yulaf ile karamel kıvamında tatlı ihtiyacını kesen doğal shake.',
    ingredients: [
      { ingredientId: 'dairy_whole_milk', amount: 250, unit: 'ml' },
      { ingredientId: 'fruit_persimmon', amount: 120, unit: 'g' },
      { ingredientId: 'nut_peanut', amount: 25, unit: 'g' },
      { ingredientId: 'grain_oats', amount: 35, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 10, unit: 'g' },
    ],
    instructions: 'Trabzon hurmasının kabuğunu soyup içini blendera ekleyin. Süt, yer fıstığı, yulaf ve balı ekleyip 45 saniye karıştırın.',
    prepTime: 3,
  },
];

/**
 * Generates a fully verified daily plan deterministically using whole foods and regional recipes.
 * Enforces 1 Shake / Day -> 2 Equal Portions (1. Öğün & 2. Öğün), with minimum 3 distinct valid shakes.
 */
export function generateDeterministicDailyPlan(req: GeneratePlanRequest): DailyPlan {
  const targetTotalKcal = Math.max(DAILY_TARGET_KCAL, req.dailyGoalKcal || 0);
  const candidates = composeThreeDistinctDailyShakes({
    targetCalories: targetTotalKcal,
    timing: 'morning',
    userStock: req.userStock,
    stockOnly: !!req.userStock,
    excludedShakeNames: req.dislikedShakeNames,
  });

  const masterShake = candidates[0];
  const portionKcal = masterShake.portionCalories || Math.round(masterShake.estimatedCalories / 2);

  const dailyShake = {
    id: masterShake.id,
    name: masterShake.name,
    ingredients: masterShake.ingredients,
    totalNutrition: {
      calories: masterShake.estimatedCalories,
      protein: masterShake.protein,
      carbs: masterShake.carbs,
      fat: masterShake.fat,
      fiber: masterShake.fiber,
    },
    portionCount: 2 as const,
    portions: [
      {
        portionNumber: 1 as const,
        name: '1. Öğün' as const,
        calories: portionKcal,
        isCompleted: masterShake.portion1Completed || false,
      },
      {
        portionNumber: 2 as const,
        name: '2. Öğün' as const,
        calories: portionKcal,
        isCompleted: masterShake.portion2Completed || false,
      },
    ],
    instructions: masterShake.instructions,
    preparationTimeMinutes: masterShake.preparationTimeMinutes,
    whyChosenReasons: masterShake.whyChosenReasons,
  };

  return {
    id: `plan_${req.date}_${Date.now()}`,
    date: req.date,
    title: 'Günün Çift Porsiyon Dengeli Shake Planı',
    notes: `${candidates.length} farklı ve kiler stoğuna uygun alternatif shake hazırlandı.`,
    targetRemainingCalories: req.remainingKcalNeeded,
    shakes: candidates,
    candidateShakes: candidates,
    // FIX: previously auto-selected the first/master candidate, so the user never
    // got a real choice among the alternatives — see planningEngine.ts for the
    // matching fix. Left unset when there's more than one candidate so the UI
    // can prompt the user to pick.
    selectedShakeId: candidates.length === 1 ? masterShake.id : undefined,
    dailyShake,
    totalCalories: masterShake.estimatedCalories,
    completedCalories: 0,
    isFullyCompleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an alternative shake deterministically if AI replacement is unavailable.
 */
export function generateDeterministicAlternativeShake(req: ReplaceShakeRequest): Shake {
  return composeDeterministicShake({
    targetCalories: Math.max(DAILY_TARGET_KCAL, req.targetKcal || 0),
    userStock: req.userStock,
    stockOnly: !!req.userStock,
    excludedShakeNames: [
      req.currentShakeName,
      ...(req.otherShakesNames || []),
      ...(req.dislikedShakeNames || []),
    ],
  });
}

// -------------------------------------------------------------
// 1. MEAL ANALYSIS (VISION)
// -------------------------------------------------------------
export interface AnalyzeMealRequest {
  imageBase64: string;
  mimeType?: string;
  mealName?: string;
  userNotes?: string;
}

export async function analyzeMealWithVision(req: AnalyzeMealRequest) {
  const ai = getAiClient();

  const prompt = `Sen uzman bir klinik diyetisyen ve beslenme analistisin.
Gelen fotoğraftaki yemeği/öğünü dikkatle incele.
Kullanıcının belirttiği öğün adı: "${req.mealName || 'Öğün'}".
Ek kullanıcı notu: "${req.userNotes || 'Belirtilmemiş'}".

GÖREVLER:
1. Tabaktaki/masadaki yiyecekleri tespit et — ana yemek, garnitür, sos, ekmek, içecek dahil her şeyi say.
2. Fotoğraftaki porsiyonları, tabak ölçeğini ve pişirme şeklini (kızartma, haşlama, ızgara vb.) profesyonelce tahmin et; mümkünse gram cinsinden somut bir ağırlık belirt.
3. KESİN OLAN VE OLMAYAN AYRIMINI YAP: Fotoğraftan porsiyon ve gizli yağlar (sos, sıvı yağ) tam bilinemez. Bu nedenle ASLA kesin konuşma, her zaman "TAHMİNİ" değer ver.
4. Toplam kalori için hem minimum-maksimum aralığı (örneğin 650-800) hem de ortalama merkezi değeri belirle.
5. Makro tahminlerini (protein, karbonhidrat, yağ, lif gramları) hesapla.
6. Emin olmadığın veya net görünmeyen yiyecekleri uydurma! Güven seviyesini "low", "medium" veya "high" olarak belirt ve notlara açıklama düş (Örn: "Sosun içeriği net seçilemediğinden kalori aralığı geniş tutulmuştur").
7. Türkçe, nazik ve bilgilendirici bir özet sun.

Aşağıdaki JSON şemasına harfiyen uygun bir JSON yanıtı ver.`;

  return withRetry(async () => {
    return await callWithModelFallback(async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: req.mimeType || 'image/jpeg',
                data: req.imageBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Yiyecek adı (Örn: Izgara Tavuk Göğsü)' },
                    portion: { type: Type.STRING, description: 'Tahmini porsiyon (Örn: ~150g, 1 porsiyon)' },
                    estimatedCalories: { type: Type.INTEGER, description: 'Yaklaşık kcal' },
                    protein: { type: Type.NUMBER, description: 'Protein (g)' },
                    carbs: { type: Type.NUMBER, description: 'Karbonhidrat (g)' },
                    fat: { type: Type.NUMBER, description: 'Yağ (g)' },
                    confidence: {
                      type: Type.STRING,
                      enum: ['low', 'medium', 'high'],
                      description: 'Tahmin güven seviyesi',
                    },
                    note: { type: Type.STRING, description: 'Pişirme veya porsiyon notu' },
                  },
                  required: ['name', 'portion', 'estimatedCalories', 'protein', 'carbs', 'fat', 'confidence'],
                },
              },
              calorieMin: { type: Type.INTEGER, description: 'Tahmini minimum kcal (Örn: 650)' },
              calorieMax: { type: Type.INTEGER, description: 'Tahmini maksimum kcal (Örn: 800)' },
              estimatedCalories: { type: Type.INTEGER, description: 'Ortalama tahmini kcal (Örn: 720)' },
              protein: { type: Type.NUMBER, description: 'Toplam protein (g)' },
              carbs: { type: Type.NUMBER, description: 'Toplam karbonhidrat (g)' },
              fat: { type: Type.NUMBER, description: 'Toplam yağ (g)' },
              confidence: {
                type: Type.STRING,
                enum: ['low', 'medium', 'high'],
                description: 'Genel öğün güven seviyesi',
              },
              cookingStyleNotes: { type: Type.STRING, description: 'Pişirme şekli ve porsiyon değerlendirmesi' },
              analysisSummary: { type: Type.STRING, description: 'Kullanıcıya Türkçe kısa açıklama ve beslenme tavsiyesi' },
            },
            required: [
              'detectedItems',
              'calorieMin',
              'calorieMax',
              'estimatedCalories',
              'protein',
              'carbs',
              'fat',
              'confidence',
              'cookingStyleNotes',
              'analysisSummary',
            ],
          },
        },
      });

      const text = response.text?.trim() || '{}';
      return JSON.parse(text);
    });
  });
}

// -------------------------------------------------------------
// 2. DAILY SHAKE PLAN GENERATION
// -------------------------------------------------------------
export interface GeneratePlanRequest {
  date: string;
  dailyGoalKcal: number;
  consumedMealsKcal: number;
  remainingKcalNeeded: number;
  shakeCount: number; // 1 or 2
  portionPreference: PortionPreference;
  mandatoryIngredientIds: string[];
  allowedIngredientIds: string[];
  forbiddenIngredientIds: string[];
  userPreferences: string[]; // AI memory rules
  dislikedShakeNames?: string[];
  favoriteShakeNames?: string[];
  userStock?: Record<string, any>;
}

export async function generateDailyShakePlan(req: GeneratePlanRequest): Promise<DailyPlan> {
  const ai = getAiClient();

  // Filter available ingredients strictly by pantry stock if provided
  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const availableIngredients = INGREDIENTS_DATABASE.filter((item) => {
    if (forbiddenSet.has(item.id)) return false;
    if (req.userStock && getAvailableStockGrams(req.userStock, item.id) <= 0) return false;
    return true;
  });

  const ingredientCatalogSummary = availableIngredients
    .map((i) => {
      const stockGrams = req.userStock ? getAvailableStockGrams(req.userStock, i.id) : 500;
      const totalIngKcal = Math.round((stockGrams * (i.caloriesPer100g || 0)) / 100);
      return `- ID: "${i.id}" | Adı: ${i.name} | Kat: ${i.categoryNameTr} | 100g kcal: ${i.caloriesPer100g} | Kilerdeki Mevcut Miktar: ${stockGrams}g (${totalIngKcal} kcal) | Standart Porsiyon: ${i.defaultServing}${i.defaultServingUnit || 'g'}`;
    })
    .join('\n');

  const targetTotalKcal = Math.max(DAILY_TARGET_KCAL, req.dailyGoalKcal || 0);
  const minAcceptableKcal = targetTotalKcal - CALORIE_TOLERANCE_KCAL;
  const maxAcceptableKcal = targetTotalKcal + CALORIE_TOLERANCE_KCAL;
  const targetPortionKcal = Math.round(targetTotalKcal / 2);

  const pantryCapacity = req.userStock ? calculatePantryShakeCalorieCapacity(req.userStock) : null;
  const pantryInfo = pantryCapacity
    ? `KULLANICI KİLER KAPASİTESİ: Kullanıcının kilerinde toplam ${pantryCapacity.totalCalories} kcal değerinde stok bulunmaktadır. Günlük hedef (${targetTotalKcal} kcal) için kiler stoğu fazlasıyla yeterlidir. KESİNLİKLE "stok yetersiz" veya benzeri bir metin yanıtı verme; doğrudan JSON şemasına uygun tarifler üret.`
    : '';

  const prompt = `Sen NutriShake uygulamasının baş formül geliştiricisi ve beslenme uzmanısın.
Kullanıcı için BUGÜNLÜK 2 eşit porsiyona ayrılacak yüksek kalorili doğal shake adayları hazırlayacaksın.

${pantryInfo}

KESİN KALORİ KURALI (HAYATİ ÖNEMDE):
- Kullanıcının Günlük Hedefi: ${targetTotalKcal} kcal.
- Shake TOPLAM kalorisi hedef ile en fazla 300 kcal fark edebilir.
- Kabul edilen aralık: ${minAcceptableKcal} - ${maxAcceptableKcal} kcal.
- ${minAcceptableKcal} kcal altı veya ${maxAcceptableKcal} kcal üstü KESİNLİKLE GEÇERSİZDİR.
- Shake 2 EŞİT PORSİYONA (%50 + %50) bölünür (Her porsiyon: ~${targetPortionKcal} kcal).

ÇEŞİTLİLİK VE MALZEME SAYISI KURALI (EN AZ 3 FARKLI TARİF):
- Kullanıcıya sunulmak üzere birbiriyle lezzet, kıvam ve malzeme açısından belirgin şekilde FARKLI en az 3 ADET shake adayı üret.
- Her iki alternatif arasında EN AZ 2 MALZEME TAMAMEN FARKLI olmalıdır (sadece tek bir malzemeyi değiştirip diğerlerini aynı bırakmak YETERSİZDİR ve KESİNLİKLE KABUL EDİLMEZ).
  * Örneğin 1. Alternatif: Muz + Fındık + Yulaf + Süt
  * Örneğin 2. Alternatif: Çilek/Elma + Ceviz/Badem + Yulaf + Yoğurt
  * Örneğin 3. Alternatif: Kuru Meyve (hurma/incir) + Tahin/Fıstık + Yulaf + Süt
- Asla tek bir tarifin kopyasını veya sadece ismini/tek malzemesini değiştirerek döndürme!
- STOĞA EKLENEN HER ÜRÜN SHAKE'E GİRMEZ! Kilerde 10 malzeme varsa hepsini tek shake'e doldurmak KESİNLİKLE YASAKTIR.
- MİNİMUM GEREKLİ MALZEME SAYISI KURALI: Her aday shake hedef kalori ve kuralları sağlayan minimum malzeme ile (4 ile en fazla 6 malzeme) oluşturulmalıdır. Asla 6'dan fazla malzeme kullanma!
- "SERBEST (ALLOWED)": Bu malzeme kullanılabilir ancak zorunlu değildir.
- "ZORUNLU (MANDATORY)": Önceliklendirilebilir ancak shake dengesini bozacak şekilde hepsini birden tek shake'e doldurma.
- "STOKTA VAR": Sadece bir uygunluk şartıdır, "Shake'e ekle" anlamına gelmez.
- MALİYETİ MİNİMİZE ET: Mümkün olan en düşük maliyetli geçerli kombinasyonları oluştur.

KIVAM KURALI (SU EKLEME):
- Süt zaten sıvıdır, ekstra su gerekmez.
- Ancak Köy Yoğurdu veya Süzme Yoğurt gibi KOYU/YOĞUN süt ürünleri kullanılıyorsa, shake'in içilebilir (blenderdan sonra kaşıkla değil pipetle/bardaktan içilebilir) bir kıvama gelmesi için tarife MUTLAKA su ekle. Su miktarını yoğurdun yoğunluğuna göre kendin belirle (Süzme Yoğurt için yoğurt miktarının ~%50-60'ı kadar, Köy Yoğurdu için ~%30-40'ı kadar su, ml cinsinden). Eklenen su kalori içermez, hedef kaloriyi etkilemez.
- Her aday tek başına ${minAcceptableKcal} - ${maxAcceptableKcal} kcal bandında olmalıdır.

ZORUNLU SÜT ÜRÜNÜ & MEYVE & KEFİR KURALLARI (HAYATİ KURALLAR):
1. SÜT ÜRÜNÜ SINIRI - TAM OLARAK 1 SÜT ÜRÜNÜ:
   - Her shake tarifinde EN AZ 1 ve EN FAZLA 1 süt ürünü bulunabilir (dairyIngredientCount === 1).
   - Süt + yoğurt BİRLİKTE KULLANILAMAZ!
   - Tam yağlı süt + yarım yağlı süt BİRLİKTE KULLANILAMAZ!
   - Köy yoğurdu + süzme yoğurt BİRLİKTE KULLANILAMAZ!
   - Yalnızca şu 4 seçenekten TAM OLARAK 1 TANESİ seçilebilir:
     * "dairy_whole_milk" (Tam yağlı süt)
     * "dairy_semi_skimmed_milk" (Yarım yağlı süt)
     * "dairy_village_yogurt" (Köy yoğurdu)
     * "dairy_strained_yogurt" (Süzme yoğurt)
2. MEYVE SINIRI - EN FAZLA 2 FARKLI MEYVE:
   - Her shake tarifinde EN FAZLA 2 farklı meyve bulunabilir (fruitIngredientCount <= 2).
   - 1 meyve veya 2 farklı meyve olabilir. 3 veya daha fazla meyve KESİNLİKLE YASAKTIR.
   - Aynı meyvenin alias/farklı ID ile iki kez eklenmesi yasaktır.
3. KEFİR KESİNLİKLE YASAKTIR: Kefir asla kullanılamaz ve süt ürünü sayılmaz!
4. TAKVİYE VE PROTEİN TOZU KESİNLİKLE YASAKTIR: Protein tozu, amino asit vb. sentetik takviyeler KULLANILMAZ.
5. HACİM YÖNETİMİ & KALORİ YOĞUNLUĞU: Sıvı hacmini aşırı şişirme (toplam sıvı 400-650ml bandında kalsın). Kalori yoğunluğunu kavrulmuş fındık, ceviz, badem, yulaf, muz ve tahin/bal/pekmez ile artırarak ~${targetTotalKcal} kcal hedefine ulaş.
6. TEKRAR EDEN MALZEME YASAKTIR: Aynı malzeme listede birden fazla kez yer alamaz, tek satırda birleştirilmelidir.

MALZEME KURAL VE KISITLAMALARI:
- KESİN STOK KURALI: SADECE aşağıdaki listede yer alan "ID" değerlerini kullanacaksın:
${ingredientCatalogSummary}
- ZORUNLU MALZEMELER (Mümkünse mutlaka bu tarifte kullanılmalı):
  ${req.mandatoryIngredientIds.length ? req.mandatoryIngredientIds.join(', ') : 'Belirtilmedi'}
- YASAKLI / KULLANILMAYACAK MALZEMELER:
  ${req.forbiddenIngredientIds.length ? req.forbiddenIngredientIds.join(', ') : 'Yok'}
- KULLANICI TERCİH VE HAFIZA NOTLARI (AI Memory):
  ${req.userPreferences.length ? req.userPreferences.map((p) => `* ${p}`).join('\n') : 'Yok'}
- BEĞENİLMEYEN GEÇMİŞ TARİFLER:
  ${req.dislikedShakeNames?.length ? req.dislikedShakeNames.join(', ') : 'Yok'}

Aşağıdaki JSON formatında en az 3 adet shake adayı içeren bir plan yanıtı ver.`;

  try {
    const aiPlan = await withRetry(async () => {
      return await callWithModelFallback(async (model) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Günün plan başlığı (Örn: Enerji & Kas Onarımı Günlük Planı)' },
                notes: { type: Type.STRING, description: 'Günün planı hakkında kısa tavsiye veya açıklama' },
                shakes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'Shake adı (Örn: Sabah Dinamik Muz-Yulaf Shake)' },
                      description: { type: Type.STRING, description: 'Shake açıklaması ve lezzet notu' },
                      ingredients: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            ingredientId: { type: Type.STRING, description: 'Malzemenin tam ID değeri' },
                            amount: { type: Type.NUMBER, description: 'Miktar (gram veya ml)' },
                            unit: { type: Type.STRING, enum: ['g', 'ml'], description: 'Birim' },
                          },
                          required: ['ingredientId', 'amount', 'unit'],
                        },
                      },
                      instructions: { type: Type.STRING, description: 'Hazırlama talimatı adım adım' },
                      preparationTimeMinutes: { type: Type.INTEGER, description: 'Hazırlama süresi (dakika)' },
                    },
                    required: ['name', 'ingredients', 'instructions', 'preparationTimeMinutes'],
                  },
                },
              },
              required: ['title', 'shakes'],
            },
          },
        });

        const parsed = JSON.parse(response.text?.trim() || '{}');
        const verifiedShakes: Shake[] = [];
        const seenFingerprints = new Set<string>();

        (parsed.shakes || []).forEach((s: any, index: number) => {
          const targetKcal = targetTotalKcal;
          const validation = validateAndSanitizeShake(
            {
              id: `shake_${Date.now()}_${index}`,
              name: s.name || `Günün Shake'i #${index + 1}`,
              description: s.description || '',
              ingredients: (s.ingredients || []).map((ing: any) => ({
                ingredientId: ing.ingredientId,
                amount: Math.max(5, Math.round(ing.amount || 20)),
                quantity: Math.max(5, Math.round(ing.amount || 20)),
                unit: ing.unit || 'g',
              })),
              instructions: s.instructions,
              preparationTimeMinutes: s.preparationTimeMinutes || 3,
              portionSize: req.portionPreference,
            },
            {
              forbiddenIngredientIds: req.forbiddenIngredientIds,
              mandatoryIngredientIds: req.mandatoryIngredientIds,
              targetKcal,
              portionPreference: req.portionPreference,
              dislikedShakeNames: req.dislikedShakeNames,
              userStock: req.userStock,
            }
          );

          if (validation.sanitizedShake) {
            const fp = getRecipeFingerprint(validation.sanitizedShake.ingredients);
            const isTooSimilar = verifiedShakes.some((existing) => {
              const sim = calculateRecipeSimilarity(validation.sanitizedShake!.ingredients, existing.ingredients);
              return sim >= 0.70;
            });
            if (!seenFingerprints.has(fp) && !isTooSimilar) {
              seenFingerprints.add(fp);
              verifiedShakes.push(validation.sanitizedShake);
            }
          }
        });

        // Ensure minimum 3 valid distinct shakes using deterministic engine from pantry stock if AI provided fewer
        if (verifiedShakes.length < 3) {
          try {
            const supplements = composeThreeDistinctDailyShakes({
              targetCalories: targetTotalKcal,
              timing: 'morning',
              userStock: req.userStock,
              stockOnly: !!req.userStock,
              excludedShakeNames: [...(req.dislikedShakeNames || []), ...verifiedShakes.map((s) => s.name)],
            });

            for (const s of supplements) {
              if (verifiedShakes.length >= 3) break;
              const fp = getRecipeFingerprint(s.ingredients);
              const isTooSimilar = verifiedShakes.some((existing) => {
                const sim = calculateRecipeSimilarity(s.ingredients, existing.ingredients);
                return sim >= 0.70;
              });
              if (!seenFingerprints.has(fp) && !isTooSimilar) {
                seenFingerprints.add(fp);
                verifiedShakes.push(s);
              }
            }
          } catch (err) {
            console.warn('Fallback composition error:', err);
          }
        }

        // Secondary fallback to DETERMINISTIC_RECIPE_TEMPLATES if still < 3
        if (verifiedShakes.length < 3) {
          for (const template of DETERMINISTIC_RECIPE_TEMPLATES) {
            if (verifiedShakes.length >= 3) break;
            const validTemplate = validateAndSanitizeShake(
              {
                id: `template_${Date.now()}_${verifiedShakes.length}`,
                name: template.name,
                description: template.description,
                ingredients: template.ingredients.map((i) => ({ ...i })),
                instructions: template.instructions,
                preparationTimeMinutes: 4,
                portionSize: req.portionPreference,
              },
              {
                forbiddenIngredientIds: req.forbiddenIngredientIds,
                mandatoryIngredientIds: req.mandatoryIngredientIds,
                targetKcal: targetTotalKcal,
                portionPreference: req.portionPreference,
                userStock: req.userStock,
              }
            );
            if (validTemplate.sanitizedShake) {
              const fp = getRecipeFingerprint(validTemplate.sanitizedShake.ingredients);
              const isTooSimilar = verifiedShakes.some((existing) => {
                const sim = calculateRecipeSimilarity(validTemplate.sanitizedShake!.ingredients, existing.ingredients);
                return sim >= 0.70;
              });
              if (!seenFingerprints.has(fp) && !isTooSimilar) {
                seenFingerprints.add(fp);
                verifiedShakes.push(validTemplate.sanitizedShake);
              }
            }
          }
        }

        // Relaxed fallback if diversity check was too strict with limited pantry
        if (verifiedShakes.length < 3) {
          for (const template of DETERMINISTIC_RECIPE_TEMPLATES) {
            if (verifiedShakes.length >= 3) break;
            const validTemplate = validateAndSanitizeShake(
              {
                id: `template_relaxed_${Date.now()}_${verifiedShakes.length}`,
                name: template.name,
                description: template.description,
                ingredients: template.ingredients.map((i) => ({ ...i })),
                instructions: template.instructions,
                preparationTimeMinutes: 4,
                portionSize: req.portionPreference,
              },
              {
                forbiddenIngredientIds: req.forbiddenIngredientIds,
                mandatoryIngredientIds: req.mandatoryIngredientIds,
                targetKcal: targetTotalKcal,
                portionPreference: req.portionPreference,
                userStock: req.userStock,
              }
            );
            if (validTemplate.sanitizedShake) {
              const fp = getRecipeFingerprint(validTemplate.sanitizedShake.ingredients);
              if (!seenFingerprints.has(fp)) {
                seenFingerprints.add(fp);
                verifiedShakes.push(validTemplate.sanitizedShake);
              }
            }
          }
        }

        if (verifiedShakes.length === 0) {
          throw new Error('AI geçerli bir shake listesi döndüremedi.');
        }

        // Sort verified shakes: lowest cost first (so index 0 is always the most economical option)
        verifiedShakes.sort((a, b) => {
          const costA = a.estimatedCost ?? 99999;
          const costB = b.estimatedCost ?? 99999;
          if (Math.abs(costA - costB) > 0.05) {
            return costA - costB;
          }
          return a.ingredients.length - b.ingredients.length;
        });

        const masterShake = verifiedShakes[0];
        const portionKcal = masterShake.portionCalories || Math.round(masterShake.estimatedCalories / 2);
        const dailyShake = {
          id: masterShake.id,
          name: masterShake.name,
          ingredients: masterShake.ingredients,
          totalNutrition: {
            calories: masterShake.estimatedCalories,
            protein: masterShake.protein,
            carbs: masterShake.carbs,
            fat: masterShake.fat,
            fiber: masterShake.fiber,
          },
          portionCount: 2 as const,
          portions: [
            {
              portionNumber: 1 as const,
              name: '1. Öğün' as const,
              calories: portionKcal,
              isCompleted: masterShake.portion1Completed || false,
            },
            {
              portionNumber: 2 as const,
              name: '2. Öğün' as const,
              calories: portionKcal,
              isCompleted: masterShake.portion2Completed || false,
            },
          ],
          instructions: masterShake.instructions,
          preparationTimeMinutes: masterShake.preparationTimeMinutes,
          whyChosenReasons: masterShake.whyChosenReasons,
        };

        return {
          id: `plan_${req.date}_${Date.now()}`,
          date: req.date,
          title: parsed.title || 'Günün Çift Porsiyon Doğal Shake Planı',
          notes: `${verifiedShakes.length} farklı ve kiler stoğuna uygun alternatif shake hazırlandı (2 eşit porsiyon).`,
          targetRemainingCalories: req.remainingKcalNeeded,
          shakes: verifiedShakes,
          candidateShakes: verifiedShakes,
          // FIX: see the other two selectedShakeId sites in this file/planningEngine.ts —
          // must not auto-pick a candidate; the user chooses in TodayView.
          selectedShakeId: verifiedShakes.length === 1 ? masterShake.id : undefined,
          dailyShake,
          totalCalories: masterShake.estimatedCalories,
          completedCalories: 0,
          isFullyCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
    });

    return aiPlan;
  } catch (err) {
    console.warn('[Gemini] Plan oluşturmada hata oluştu, doğrulanmış yerel plan devreye girdi:', err);
    return generateDeterministicDailyPlan(req);
  }
}

// -------------------------------------------------------------
// 3. SINGLE SHAKE REPLACEMENT
// -------------------------------------------------------------
export interface ReplaceShakeRequest {
  targetKcal: number;
  currentShakeName: string;
  portionPreference: PortionPreference;
  mandatoryIngredientIds: string[];
  allowedIngredientIds: string[];
  forbiddenIngredientIds: string[];
  otherShakesNames?: string[];
  userPreferences: string[];
  dislikedShakeNames?: string[];
  userStock?: Record<string, any>;
}

export async function replaceSingleShake(req: ReplaceShakeRequest): Promise<Shake> {
  const ai = getAiClient();

  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const availableIngredients = INGREDIENTS_DATABASE.filter((item) => {
    if (forbiddenSet.has(item.id)) return false;
    if (req.userStock && getAvailableStockGrams(req.userStock, item.id) <= 0) return false;
    return true;
  });

  const ingredientCatalogSummary = availableIngredients
    .map(
      (i) => {
        const stockGrams = req.userStock ? getAvailableStockGrams(req.userStock, i.id) : 500;
        return `- ID: "${i.id}" | Adı: ${i.name} | Kat: ${i.categoryNameTr} | 100g kcal: ${i.caloriesPer100g} | Kiler Stoğu: ${stockGrams}g | Standart: ${i.defaultServing}${i.defaultServingUnit || 'g'}`;
      }
    )
    .join('\n');

  // FIX: previously defaulted to 500 kcal and used a 250 kcal tolerance independent of
  // the app's daily target constants. Now floored at DAILY_TARGET_KCAL and uses the
  // shared CALORIE_TOLERANCE_KCAL so this matches generateDailyShakePlan's behavior.
  const targetKcal = Math.round(Math.max(DAILY_TARGET_KCAL, req.targetKcal || 0));
  const targetPortionKcal = Math.round(targetKcal / 2);
  const minAcceptableKcal = targetKcal - CALORIE_TOLERANCE_KCAL;
  const maxAcceptableKcal = targetKcal + CALORIE_TOLERANCE_KCAL;

  const prompt = `Kullanıcı mevcut shake'ini değiştirmek ("Değiştir") istedi.
Değiştirilecek mevcut shake: "${req.currentShakeName}".
HEDEF KALORİ: Toplam ~${targetKcal} kcal (${minAcceptableKcal} - ${maxAcceptableKcal} kcal aralığı).
Porsiyon Tercihi: ${req.portionPreference}.
Shake 2 EŞİT PORSİYONA (%50 + %50) bölünür (Her porsiyon: ~${targetPortionKcal} kcal).

GÖREV:
"${req.currentShakeName}" yerine geçecek YEPYENİ, lezzetli ve dengeli TEK BİR alternatif shake hazırla.
Aynı gün içindeki diğer shake'ler: ${req.otherShakesNames?.join(', ') || 'Yok'}. Bu shake'lerden farklı bir tat profili sun.
Zorunlu malzemeler: ${req.mandatoryIngredientIds.join(', ') || 'Yok'}.
Yasaklı malzemeler: ${req.forbiddenIngredientIds.join(', ') || 'Yok'}.
Kullanıcı tercihleri: ${req.userPreferences.join(', ') || 'Yok'}.

KESİN KURALLAR:
1. HEDEF KALORİ KURALI: Shake toplam kalorisi MUTLAKA ${targetKcal} kcal civarında olmalıdır (${minAcceptableKcal} - ${maxAcceptableKcal} kcal aralığı).
   - Shake 2 EŞİT PORSİYONA (%50 + %50) bölünür (Her porsiyon: ~${targetPortionKcal} kcal).
   - Hedef yüksekse (örneğin 1200-2200 kcal), yulaf miktarını 80-140g, kuruyemişi 30-60g, sütü 350-500ml gibi ayarlayarak hedef kaloriye ULAŞ!
2. SÜT ÜRÜNÜ SINIRI - TAM OLARAK 1 SÜT ÜRÜNÜ:
   - Tarifte EN AZ 1 ve EN FAZLA 1 süt ürünü olmalıdır (dairyIngredientCount === 1).
   - Süt + yoğurt birlikte KULLANILAMAZ. İki farklı süt veya iki farklı yoğurt birlikte KULLANILAMAZ.
   - Yalnızca "dairy_whole_milk", "dairy_semi_skimmed_milk", "dairy_village_yogurt", "dairy_strained_yogurt" arasından TEK BİR TANESİ seçilebilir.
3. MEYVE SINIRI - EN FAZLA 2 FARKLI MEYVE:
   - Tarifte en fazla 2 farklı meyve kullanılabilir (fruitIngredientCount <= 2). 3 veya daha fazla meyve YASAKTIR.
4. KEFİR VE TAKVİYE KESİNLİKLE YASAKTIR: Kefir veya sentetik protein tozu KULLANILAMAZ.
5. MALZEME SAYISI: Minimum gerekli malzeme sayısını kullan. 4 ile en fazla 6 malzeme (asla 6'dan fazla malzeme olamaz).
6. KİLER STOĞU: Her malzemenin miktarını kilerde mevcut olan gramaj sınırları içerisinde tut (Kiler Stoğu sütununa bak).

SADECE aşağıdaki mevcut ID'leri kullan (Protein takviyesi KESİNLİKLE YOKTUR, sadece doğal gıdalar):
${ingredientCatalogSummary}

Aşağıdaki JSON şemasına uygun tek bir shake döndür.`;

  try {
    return await withRetry(async () => {
      return await callWithModelFallback(async (model) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Yeni Shake Adı' },
                description: { type: Type.STRING, description: 'Yeni Shake Açıklaması' },
                ingredients: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ingredientId: { type: Type.STRING, description: 'Malzemenin tam ID değeri' },
                      amount: { type: Type.NUMBER, description: 'Miktar' },
                      unit: { type: Type.STRING, enum: ['g', 'ml'] },
                    },
                    required: ['ingredientId', 'amount', 'unit'],
                  },
                },
                instructions: { type: Type.STRING, description: 'Hazırlama talimatı' },
                preparationTimeMinutes: { type: Type.INTEGER, description: 'Hazırlama süresi' },
              },
              required: ['name', 'ingredients', 'instructions', 'preparationTimeMinutes'],
            },
          },
        });

        const parsed = JSON.parse(response.text?.trim() || '{}');
        const validation = validateAndSanitizeShake(
          {
            id: `shake_${Date.now()}_alt`,
            name: parsed.name || 'Alternatif Özel Shake',
            description: parsed.description || '',
            ingredients: (parsed.ingredients || []).map((ing: any) => ({
              ingredientId: ing.ingredientId,
              amount: Math.max(5, Math.round(ing.amount || 20)),
              quantity: Math.max(5, Math.round(ing.amount || 20)),
              unit: ing.unit || 'g',
            })),
            instructions: parsed.instructions || 'Tüm malzemeleri blenderda 45 saniye homojen kıvama gelene kadar karıştırın.',
            preparationTimeMinutes: parsed.preparationTimeMinutes || 3,
            portionSize: req.portionPreference,
          },
          {
            forbiddenIngredientIds: req.forbiddenIngredientIds,
            mandatoryIngredientIds: req.mandatoryIngredientIds,
            targetKcal,
            portionPreference: req.portionPreference,
            dislikedShakeNames: [req.currentShakeName, ...(req.dislikedShakeNames || [])],
            userStock: req.userStock,
          }
        );

        if (validation.sanitizedShake) {
          return validation.sanitizedShake;
        }

        console.info('[Gemini] Alternatif shake kurallara uyarlanıyor, deterministik motor devreye girdi:', validation.errors);
        return generateDeterministicAlternativeShake(req);
      });
    });
  } catch (err) {
    console.info('[Gemini] Alternatif shake oluşturma yerel tarif motoru ile tamamlanıyor:', err);
    return generateDeterministicAlternativeShake(req);
  }
}
