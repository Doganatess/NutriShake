import { GoogleGenAI, Type } from '@google/genai';
import { INGREDIENTS_DATABASE, INGREDIENT_MAP } from '../data/ingredients';
import { calculateShakeNutrition } from '../utils/nutritionEngine';
import { validateAndSanitizeShake } from '../utils/recipeValidator';
import { PortionPreference, Shake, DailyPlan } from '../types';

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
      { ingredientId: 'milk_whole', amount: 250, unit: 'ml' },
      { ingredientId: 'banana', amount: 120, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 40, unit: 'g' },
      { ingredientId: 'hazelnut_roasted', amount: 25, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 15, unit: 'g' },
    ],
    instructions: 'Fındıkları ve yulafı blendera alıp önce hafifçe çekin. Ardından süt, muz ve balı ilave edip 45 saniye pürüzsüz kıvama gelene kadar karıştırın.',
    prepTime: 3,
  },
  {
    name: 'Likapa (Karadeniz Yaban Mersini) & Süzme Yoğurt Shake',
    description: 'Doğu Karadeniz yaylalarının meşhur likapası (yaban mersini), süzme yoğurt, süt ve chia tohumu ile antioksidan deposu.',
    ingredients: [
      { ingredientId: 'milk_semi_skimmed', amount: 200, unit: 'ml' },
      { ingredientId: 'yogurt_strained', amount: 100, unit: 'g' },
      { ingredientId: 'blueberry_fresh', amount: 80, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 30, unit: 'g' },
      { ingredientId: 'chia_seeds', amount: 15, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 15, unit: 'g' },
    ],
    instructions: 'Süzme yoğurt ve sütü blendera koyun. Likapa, ince yulaf ve chia tohumunu ekleyerek 45 saniye yüksek devirde homojen olana kadar karıştırın.',
    prepTime: 4,
  },
  {
    name: 'Karadeniz Dağ Çileği & Yulaf Doyurucu Shake',
    description: 'Kokulu taze çilek, tam yağlı süt, yerli ceviz içi ve köy usulü dut pekmezi ile besleyici lezzet.',
    ingredients: [
      { ingredientId: 'milk_whole', amount: 250, unit: 'ml' },
      { ingredientId: 'strawberry', amount: 120, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 40, unit: 'g' },
      { ingredientId: 'walnut', amount: 20, unit: 'g' },
      { ingredientId: 'molasses_mulberry', amount: 15, unit: 'g' },
    ],
    instructions: 'Çilekleri temizleyin. Süt, ceviz, yulaf ve dut pekmezi ile birlikte blendera aktarıp pürüzsüzleşene dek çekin.',
    prepTime: 3,
  },
  {
    name: 'Kuru İncirli & Yerli Tahinli Anadolu Shake',
    description: 'Doğal kuru incir, susam tahini, süt, yulaf ve bir tutam Seylan tarçını ile yüksek lif ve kalsiyum zengini doyurucu tarif.',
    ingredients: [
      { ingredientId: 'milk_whole', amount: 250, unit: 'ml' },
      { ingredientId: 'fig_dried', amount: 50, unit: 'g' },
      { ingredientId: 'tahini', amount: 20, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 35, unit: 'g' },
      { ingredientId: 'cinnamon_ground', amount: 2, unit: 'g' },
      { ingredientId: 'banana', amount: 80, unit: 'g' },
    ],
    instructions: 'Kuru incirleri ılık suda 5 dakika yumuşatıp ikiye kesin. Süt, tahin, muz ve tarçınla blendera alıp 60 saniye çekin.',
    prepTime: 4,
  },
  {
    name: 'Karadut & Çiğ Bademli Karadeniz Denge Shake',
    description: 'Taze karadut / karadut özü, probiyotik yoğurt, süt ve çiğ badem ile kas onarıcı zengin öğün.',
    ingredients: [
      { ingredientId: 'milk_semi_skimmed', amount: 200, unit: 'ml' },
      { ingredientId: 'yogurt_strained', amount: 80, unit: 'g' },
      { ingredientId: 'blackberry_fresh', amount: 80, unit: 'g' },
      { ingredientId: 'almond_raw', amount: 20, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 30, unit: 'g' },
      { ingredientId: 'molasses_grape', amount: 15, unit: 'g' },
    ],
    instructions: 'Tüm malzemeleri blender kabında toplayın. Çiğ bademler tamamen dağılıncaya kadar 50 saniye karıştırın.',
    prepTime: 3,
  },
  {
    name: 'Amasya Elmalı & Cevizli Tarçınlı Öğle Shake',
    description: 'Taze Amasya elması, ceviz içi, tam yağlı süt, yulaf ve mis kokulu tarçın ile elmalı turta tadında hafif ve besleyici shake.',
    ingredients: [
      { ingredientId: 'milk_whole', amount: 250, unit: 'ml' },
      { ingredientId: 'apple_red', amount: 120, unit: 'g' },
      { ingredientId: 'walnut', amount: 25, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 35, unit: 'g' },
      { ingredientId: 'cinnamon_ground', amount: 2, unit: 'g' },
      { ingredientId: 'honey_flower', amount: 10, unit: 'g' },
    ],
    instructions: 'Elmayı yıkayıp çekirdeklerini çıkararak küp doğrayın. Süt, ceviz, yulaf, tarçın ve balı blenderda krema kıvamına gelene kadar karıştırın.',
    prepTime: 4,
  },
  {
    name: 'Trabzon Hurmalı & Fıstık Ezmeli Karamel Shake',
    description: 'Olgun Trabzon (Cennet) hurması, %100 şekersiz fıstık ezmesi, süt ve yulaf ile karamel kıvamında tatlı ihtiyacını kesen doğal shake.',
    ingredients: [
      { ingredientId: 'milk_whole', amount: 250, unit: 'ml' },
      { ingredientId: 'persimmon', amount: 120, unit: 'g' },
      { ingredientId: 'peanut_butter_pure', amount: 25, unit: 'g' },
      { ingredientId: 'oats_fine', amount: 35, unit: 'g' },
    ],
    instructions: 'Trabzon hurmasının kabuğunu soyup içini blendera ekleyin. Süt, fıstık ezmesi ve yulafı ekleyip 45 saniye karıştırın.',
    prepTime: 3,
  },
];

/**
 * Generates a fully verified daily plan deterministically using whole foods and regional recipes.
 * Enforces 1 Shake / Day -> 2 Equal Portions (1. Öğün & 2. Öğün).
 */
export function generateDeterministicDailyPlan(req: GeneratePlanRequest): DailyPlan {
  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const dislikedSet = new Set((req.dislikedShakeNames || []).map((s) => s.toLowerCase().trim()));

  const suitableTemplates = DETERMINISTIC_RECIPE_TEMPLATES.filter((tpl) => {
    if (dislikedSet.has(tpl.name.toLowerCase().trim())) return false;
    return !tpl.ingredients.some((ing) => forbiddenSet.has(ing.ingredientId));
  });

  const pool = suitableTemplates.length > 0 ? suitableTemplates : DETERMINISTIC_RECIPE_TEMPLATES;
  const template = pool[0];
  const candidateIngredients = template.ingredients
    .filter((ing) => !forbiddenSet.has(ing.ingredientId))
    .map((ing) => ({
      ingredientId: ing.ingredientId,
      amount: ing.amount,
      quantity: ing.amount,
      unit: ing.unit,
    }));

  // Inject any mandatory ingredients if missing
  for (const mandId of req.mandatoryIngredientIds || []) {
    if (!candidateIngredients.some((ing) => ing.ingredientId === mandId) && INGREDIENT_MAP[mandId]) {
      candidateIngredients.push({
        ingredientId: mandId,
        amount: INGREDIENT_MAP[mandId].defaultServing || 25,
        quantity: INGREDIENT_MAP[mandId].defaultServing || 25,
        unit: INGREDIENT_MAP[mandId].defaultServingUnit || 'g',
      });
    }
  }

  const validation = validateAndSanitizeShake(
    {
      id: `shake_${Date.now()}_det_0`,
      name: template.name,
      description: template.description,
      ingredients: candidateIngredients,
      instructions: template.instructions,
      preparationTimeMinutes: template.prepTime,
      portionSize: req.portionPreference,
    },
    {
      forbiddenIngredientIds: req.forbiddenIngredientIds,
      mandatoryIngredientIds: req.mandatoryIngredientIds,
      targetKcal: req.remainingKcalNeeded || 1000,
      portionPreference: req.portionPreference,
      dislikedShakeNames: req.dislikedShakeNames,
    }
  );

  const masterShake: Shake = validation.sanitizedShake || {
    id: `shake_${Date.now()}_fallback`,
    name: 'Günün Besleyici Çift Porsiyon Doğal Shake’i',
    description: '2 eşit porsiyona ayrılmış dengeli günlük shake tarifi.',
    timing: 'morning',
    ingredients: candidateIngredients.map((c) => ({
      ...c,
      normalizedGrams: c.amount,
      calculatedCalories: 0,
      calculatedProtein: 0,
      calculatedCarbs: 0,
      calculatedFat: 0,
    })),
    estimatedCalories: 1000,
    protein: 35,
    carbs: 120,
    fat: 28,
    fiber: 14,
    portionCount: 2,
    portionCalories: 500,
    portionProtein: 17.5,
    portionCarbs: 60,
    portionFat: 14,
    portionFiber: 7,
    instructions: template.instructions,
    preparationTimeMinutes: 4,
    isCompleted: false,
    createdAt: new Date().toISOString(),
    schemaVersion: 2,
  };

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
    notes: 'Doğal, takviyesiz ve 2 eşit porsiyon olarak hazırlanacak tek günlük shake tarifi.',
    targetRemainingCalories: req.remainingKcalNeeded,
    shakes: [masterShake],
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
  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const excludedNames = new Set([
    req.currentShakeName.toLowerCase().trim(),
    ...(req.otherShakesNames || []).map((n) => n.toLowerCase().trim()),
    ...(req.dislikedShakeNames || []).map((n) => n.toLowerCase().trim()),
  ]);

  const candidate =
    DETERMINISTIC_RECIPE_TEMPLATES.find(
      (tpl) =>
        !excludedNames.has(tpl.name.toLowerCase().trim()) &&
        !tpl.ingredients.some((ing) => forbiddenSet.has(ing.ingredientId))
    ) || DETERMINISTIC_RECIPE_TEMPLATES[0];

  const candidateIngredients = candidate.ingredients
    .filter((ing) => !forbiddenSet.has(ing.ingredientId))
    .map((ing) => ({
      ingredientId: ing.ingredientId,
      amount: ing.amount,
      quantity: ing.amount,
      unit: ing.unit,
    }));

  for (const mandId of req.mandatoryIngredientIds || []) {
    if (!candidateIngredients.some((ing) => ing.ingredientId === mandId) && INGREDIENT_MAP[mandId]) {
      candidateIngredients.push({
        ingredientId: mandId,
        amount: INGREDIENT_MAP[mandId].defaultServing || 25,
        quantity: INGREDIENT_MAP[mandId].defaultServing || 25,
        unit: INGREDIENT_MAP[mandId].defaultServingUnit || 'g',
      });
    }
  }

  const validation = validateAndSanitizeShake(
    {
      id: `shake_${Date.now()}_alt`,
      name: candidate.name,
      description: candidate.description,
      ingredients: candidateIngredients,
      instructions: candidate.instructions,
      preparationTimeMinutes: candidate.prepTime,
      portionSize: req.portionPreference,
    },
    {
      forbiddenIngredientIds: req.forbiddenIngredientIds,
      mandatoryIngredientIds: req.mandatoryIngredientIds,
      targetKcal: req.targetKcal,
      portionPreference: req.portionPreference,
    }
  );

  return validation.sanitizedShake!;
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
1. Tabaktaki/masadaki yiyecekleri tespit et.
2. Fotoğraftaki porsiyonları, tabak ölçeğini ve pişirme şeklini (kızartma, haşlama, ızgara vb.) profesyonelce tahmin et.
3. KESİN OLAN VE OLMAYAN AYRIMINI YAP: Fotoğraftan porsiyon ve gizli yağlar (sos, sıvı yağ) tam bilinemez. Bu nedenle ASLA kesin konuşma, her zaman "TAHMİNİ" değer ver.
4. Toplam kalori için hem minimum-maksimum aralığı (örneğin 650-800) hem de ortalama merkezi değeri belirle.
5. Makro tahminlerini (protein, karbonhidrat, yağ gramları) hesapla.
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
}

export async function generateDailyShakePlan(req: GeneratePlanRequest): Promise<DailyPlan> {
  const ai = getAiClient();

  // Filter available ingredients
  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const availableIngredients = INGREDIENTS_DATABASE.filter((item) => !forbiddenSet.has(item.id));
  const ingredientCatalogSummary = availableIngredients
    .map(
      (i) =>
        `- ID: "${i.id}" | Adı: ${i.name} | Kat: ${i.categoryNameTr} | 100g kcal: ${i.caloriesPer100g} | Standart Porsiyon: ${i.defaultServing}${i.defaultServingUnit || 'g'}`
    )
    .join('\n');

  const targetPerShake = Math.max(250, Math.round(req.remainingKcalNeeded / Math.max(1, req.shakeCount)));

  const prompt = `Sen NutriShake uygulamasının baş formül geliştiricisi ve beslenme uzmanısın.
Kullanıcı için BUGÜNLÜK tek ve mükemmel bir shake tarifi hazırlayacaksın.

ÇOK ÖNEMLİ KURAL - 1 GÜN = 1 SHAKE TARİFİ (2 EŞİT PORSİYON):
- Kullanıcı günde SADECE 1 ADET SHAKE hazırlar.
- Bu shake 2 eşit porsiyona ayrılır: 1. Öğün (50%) ve 2. Öğün (50%).
- Aynı gün için asla 2 veya 3 farklı tarif ÜRETME. Kesinlikle tek 1 adet master tarif üret!
- Tarifin toplam kalorisi kullanıcının kilo alma hedefine uygun (~1000-1280 kcal) olmalıdır. Her porsiyon bu kalorinin tam yarısıdır (~500-640 kcal).

GÜNÜN BESLENME DURUMU:
- Günlük Toplam Hedef: ${req.dailyGoalKcal} kcal
- Gün İçinde Alınan (Öğünlerden): ${req.consumedMealsKcal} kcal
- Geriye Kalan Kalori İhtiyacı: ${req.remainingKcalNeeded} kcal
- Hedeflenen Toplam Shake Kalorisi: ~${Math.max(800, req.remainingKcalNeeded)} kcal (Porsiyon başı ~${Math.round(Math.max(800, req.remainingKcalNeeded) / 2)} kcal)
- Porsiyon Tercihi: ${req.portionPreference}

MALZEME KURAL VE KISITLAMALARI:
- KESİN STOK KURALI: Stokta olmayan hiçbir malzeme uydurulamaz veya eklenemez. SADECE aşağıdaki listede yer alan "ID" değerlerini kullanacaksın:
${ingredientCatalogSummary}
- ZORUNLU MALZEMELER (Mümkünse mutlaka bu tarifte kullanılmalı):
  ${req.mandatoryIngredientIds.length ? req.mandatoryIngredientIds.join(', ') : 'Belirtilmedi'}
- YASAKLI / KULLANILMAYACAK MALZEMELER:
  ${req.forbiddenIngredientIds.length ? req.forbiddenIngredientIds.join(', ') : 'Yok'}
- KULLANICI TERCİH VE HAFIZA NOTLARI (AI Memory):
  ${req.userPreferences.length ? req.userPreferences.map((p) => `* ${p}`).join('\n') : 'Yok'}
- BEĞENİLMEYEN GEÇMİŞ TARİFLER:
  ${req.dislikedShakeNames?.length ? req.dislikedShakeNames.join(', ') : 'Yok'}

ÖNEMLİ KURALLAR (TAKVİYESİZ & ZENGİN MEYVE KOMBİNASYONLARI):
1. KESİNLİKLE TAKVİYESİZ: Protein tozu, whey vb. takviyeler KESİNLİKLE KULLANILMAZ.
2. ZENGİN MEYVE EŞLEŞMELERİ: Muz + çilek, elma + tarçın + ceviz, karadut + yoğurt, Trabzon hurması + fıstık ezmesi gibi lezzetli eşleşmeler yap.
3. Karadeniz / Ordu yöresel lezzetlerine (fındık, dut pekmezi, kestane balı vb.) öncelik ver.
4. Talimatlarda karışımın 2 eşit porsiyona bölüneceğini net belirt.

Aşağıdaki JSON formatında tam 1 adet shake içeren bir plan yanıtı ver.`;

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

        (parsed.shakes || []).forEach((s: any, index: number) => {
          const targetKcal = Math.round(req.remainingKcalNeeded / Math.max(1, req.shakeCount));
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
            }
          );

          if (validation.sanitizedShake) {
            verifiedShakes.push(validation.sanitizedShake);
          }
        });

        if (verifiedShakes.length === 0) {
          throw new Error('AI geçerli bir shake listesi döndüremedi.');
        }

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
          notes: parsed.notes || '2 eşit porsiyon olarak hazırlanacak tek günlük dengeli shake tarifi.',
          targetRemainingCalories: req.remainingKcalNeeded,
          shakes: [masterShake],
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
}

export async function replaceSingleShake(req: ReplaceShakeRequest): Promise<Shake> {
  const ai = getAiClient();

  const forbiddenSet = new Set(req.forbiddenIngredientIds || []);
  const availableIngredients = INGREDIENTS_DATABASE.filter((item) => !forbiddenSet.has(item.id));
  const ingredientCatalogSummary = availableIngredients
    .map(
      (i) =>
        `- ID: "${i.id}" | Adı: ${i.name} | Kat: ${i.categoryNameTr} | 100g kcal: ${i.caloriesPer100g} | Standart: ${i.defaultServing}${i.defaultServingUnit || 'g'}`
    )
    .join('\n');

  const prompt = `Kullanıcı mevcut shake'ini değiştirmek ("Değiştir") istedi.
Değiştirilecek mevcut shake: "${req.currentShakeName}".
Hedef Kalori: ~${req.targetKcal} kcal.
Porsiyon Tercihi: ${req.portionPreference}.

GÖREV:
"${req.currentShakeName}" yerine geçecek YEPYENİ, lezzetli ve dengeli TEK BİR alternatif shake hazırla.
Aynı gün içindeki diğer shake'ler: ${req.otherShakesNames?.join(', ') || 'Yok'}. Bu shake'lerden farklı bir tat profili sun.
Zorunlu malzemeler: ${req.mandatoryIngredientIds.join(', ') || 'Yok'}.
Yasaklı malzemeler: ${req.forbiddenIngredientIds.join(', ') || 'Yok'}.
Kullanıcı tercihleri: ${req.userPreferences.join(', ') || 'Yok'}.

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
            targetKcal: req.targetKcal,
            portionPreference: req.portionPreference,
            dislikedShakeNames: [req.currentShakeName, ...(req.dislikedShakeNames || [])],
          }
        );

        if (validation.sanitizedShake) {
          return validation.sanitizedShake;
        }

        throw new Error('Üretilen alternatif shake beslenme kurallarını karşılamadı.');
      });
    });
  } catch (err) {
    console.warn('[Gemini] Alternatif shake oluşturmada hata, yerel tarif seçiliyor:', err);
    return generateDeterministicAlternativeShake(req);
  }
}
