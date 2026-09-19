/**
 * Multi-Provider AI Architecture for NutriShake Server
 * Providers Supported: Gemini (Primary) -> OpenRouter (Fallback)
 * Includes:
 * - Automatic Fallback Cascade
 * - Exponential Retry
 * - Request Timeout
 * - Provider Cooldown Tracking (prevents spamming failing/quota-exceeded providers)
 * - In-flight Duplicate Request Deduplication & In-Memory Cache
 * - Resilient JSON Schema Extraction & Sanitization (never crashes on malformed AI JSON)
 */

import { GoogleGenAI, Type } from '@google/genai';

export type AiProviderName = 'gemini' | 'openrouter';

// Cooldown tracking for failing/rate-limited providers (in milliseconds)
const COOLDOWN_DURATION_MS = 60 * 1000;
const providerCooldowns: Record<AiProviderName, number> = {
  gemini: 0,
  openrouter: 0,
};

export function markProviderCooldown(provider: AiProviderName, durationMs = COOLDOWN_DURATION_MS) {
  providerCooldowns[provider] = Date.now() + durationMs;
  console.warn(`[AI Provider] ${provider} is in cooldown for ${Math.round(durationMs / 1000)}s`);
}

export function isProviderInCooldown(provider: AiProviderName): boolean {
  return Date.now() < (providerCooldowns[provider] || 0);
}

// In-flight request deduplication map
const inflightPromises = new Map<string, Promise<any>>();

// In-memory cache for recent identical requests (TTL: 5 minutes)
interface CacheEntry {
  timestamp: number;
  data: any;
}
const requestCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Best-effort per-instance rate limiter for public serverless endpoints.
// Vercel instances are ephemeral, so this is a protection layer rather than
// a replacement for a distributed rate limiter.
interface RateLimitEntry {
  windowStartedAt: number;
  count: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, maxRequests: number, windowMs = 60_000): boolean {
  const now = Date.now();

  // Prevent an unbounded map on long-lived local/server instances.
  if (rateLimitStore.size > 1000) {
    for (const [storedKey, entry] of rateLimitStore) {
      if (now - entry.windowStartedAt >= windowMs) rateLimitStore.delete(storedKey);
    }
  }

  const current = rateLimitStore.get(key);

  if (!current || now - current.windowStartedAt >= windowMs) {
    rateLimitStore.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }

  if (current.count >= maxRequests) return false;
  current.count += 1;
  return true;
}

export function getRequestClientKey(req: { headers?: Record<string, unknown> }, scope: string): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const client = raw.split(',')[0]?.trim() || 'unknown';
  return `${scope}:${client}`;
}


export function getCachedResponse(key: string): any | null {
  const entry = requestCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedResponse(key: string, data: any): void {
  // Keep cache size bounded
  if (requestCache.size > 100) {
    const oldestKey = requestCache.keys().next().value;
    if (oldestKey) requestCache.delete(oldestKey);
  }
  requestCache.set(key, { timestamp: Date.now(), data });
}

/**
 * Executes an async task with in-flight deduplication.
 * If another request with identical cacheKey is already running, waits for it instead of duplicating.
 */
export async function deduplicateRequest<T>(cacheKey: string, runner: () => Promise<T>): Promise<T> {
  // 1. Check completed cache
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return cached as T;
  }

  // 2. Check currently in-flight request
  const existingPromise = inflightPromises.get(cacheKey);
  if (existingPromise) {
    return (await existingPromise) as T;
  }

  // 3. Run new request and share promise
  const promise = runner()
    .then((result) => {
      setCachedResponse(cacheKey, result);
      return result;
    })
    .finally(() => {
      inflightPromises.delete(cacheKey);
    });

  inflightPromises.set(cacheKey, promise);
  return await promise;
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 25000, context = 'AI operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${context} ${timeoutMs}ms zaman aşımına uğradı.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Exponential backoff retry wrapper
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const errorStr = String(err?.message || err).toLowerCase();
      // Retry only on transient network or 429/503 errors
      const isTransient =
        errorStr.includes('429') ||
        errorStr.includes('503') ||
        errorStr.includes('rate') ||
        errorStr.includes('timeout') ||
        errorStr.includes('fetch') ||
        errorStr.includes('network');
      if (isTransient) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Maksimum deneme sayısına ulaşıldı.');
}

/**
 * Resilient JSON Extractor
 * Safely locates and extracts JSON object or array even if model included markdown or surrounding text.
 */
export function extractSafeJson<T = any>(rawText: string, fallbackValue?: T): T {
  if (!rawText || typeof rawText !== 'string') {
    if (fallbackValue !== undefined) return fallbackValue;
    throw new Error('Boş AI yanıtı alındı.');
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(rawText.trim());
  } catch {
    // Continue to regex extraction
  }

  // 2. Remove markdown code fence ```json ... ```
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // 3. Balanced brace match for JSON object { ... }
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = rawText.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue
    }
  }

  // 4. Balanced bracket match for JSON array [ ... ]
  const firstBracket = rawText.indexOf('[');
  const lastBracket = rawText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = rawText.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue
    }
  }

  if (fallbackValue !== undefined) {
    console.warn('[AI] JSON ayrıştırma başarısız oldu, güvenli fallback döndürülüyor.');
    return fallbackValue;
  }

  throw new Error('AI yanıtından geçerli bir JSON verisi çıkarılamadı.');
}

// ----------------------------------------------------------------------
// PROVIDER CLIENTS
// ----------------------------------------------------------------------

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { 'User-Agent': 'nutrishake-build' } },
    });
  }
  return geminiClient;
}

/**
 * 1. Call Gemini
 */
export async function callGeminiText(prompt: string, systemInstruction?: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) throw new Error('GEMINI_API_KEY yapılandırılmamış.');

  const model = 'gemini-3.8-flash';
  const fallbackModel = 'gemini-3.1-flash-lite';

  const doCall = async (m: string) => {
    const contents: any[] = [];
    if (systemInstruction) contents.push({ text: `SİSTEM TALİMATI: ${systemInstruction}` });
    contents.push({ text: prompt });

    const resp = await client.models.generateContent({
      model: m,
      contents,
    });
    return resp.text || '';
  };

  try {
    return await doCall(model);
  } catch (err: any) {
    console.warn(`[Gemini] ${model} çağrısı başarısız oldu, ${fallbackModel} deneniyor...`, err?.message);
    return await doCall(fallbackModel);
  }
}

/**
 * 2. Call OpenRouter
 */
export async function callOpenRouterText(prompt: string, systemInstruction?: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY yapılandırılmamış.');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://nutrishake.app',
      'X-Title': 'NutriShake Pro',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter hatası (${response.status}): ${errText}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * Universal text generation with multi-provider fallback cascade
 * Tries: Gemini (Primary) -> OpenRouter (Fallback)
 */
export async function generateTextWithFallback(
  prompt: string,
  systemInstruction?: string,
  timeoutMs = 20000
): Promise<{ text: string; provider: AiProviderName }> {
  const providers: { name: AiProviderName; runner: () => Promise<string> }[] = [
    { name: 'gemini', runner: () => callGeminiText(prompt, systemInstruction) },
    { name: 'openrouter', runner: () => callOpenRouterText(prompt, systemInstruction) },
  ];

  let lastError: any = null;

  for (const p of providers) {
    if (isProviderInCooldown(p.name)) {
      continue;
    }

    try {
      const text = await withRetry(
        () => withTimeout(p.runner(), timeoutMs, `${p.name} text çağrısı`),
        1,
        800
      );
      if (text && text.trim().length > 0) {
        return { text, provider: p.name };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI Fallback] ${p.name} başarısız oldu:`, err?.message);
      // Mark provider in cooldown if rate-limited or quota exceeded
      const errLower = String(err?.message || '').toLowerCase();
      if (errLower.includes('429') || errLower.includes('quota') || errLower.includes('503')) {
        markProviderCooldown(p.name);
      }
    }
  }

  throw new Error(`Tüm AI servisleri meşgul veya kullanılamıyor: ${lastError?.message || 'Bilinmeyen hata'}`);
}

/**
 * Multi-Image Vision Analysis with Multi-Provider Support
 * Supports array of image Base64s (user can upload multiple photos of the meal).
 * Tries: Gemini Vision -> OpenRouter (Gemini Multimodal)
 */
export interface MultiVisionRequest {
  images: { base64: string; mimeType: string }[];
  mealName?: string;
  userNotes?: string;
}

export async function analyzeMealMultiVision(req: MultiVisionRequest): Promise<any> {
  const prompt = `Sen uzman bir klinik diyetisyen ve beslenme analistisin.
Gelen ${req.images.length} adet fotoğraftaki yemeği/öğünü dikkatle incele.
Kullanıcının belirttiği öğün adı: "${req.mealName || 'İş Yemeği / Öğün'}".
Ek kullanıcı notu: "${req.userNotes || 'Belirtilmemiş'}".

GÖREVLER:
1. Tabaktaki/masadaki tüm yiyecekleri tespit et. Fotoğrafların tamamını ortak analiz et.
2. Porsiyonları, pişirme şeklini (kızartma, haşlama, fırın vb.) ve görünür yağ/sosları değerlendir.
3. KESİN DEĞİL, TAHMİNİ DEĞERLER VER: Fotoğraftan porsiyon ve gizli yağlar kesin bilinemez.
4. Toplam kalori aralığını (calorieMin - calorieMax) ve ortalama tahmini kaloriyi (estimatedCalories) belirle.
5. Makro tahminlerini (protein, carbs, fat, fiber) hesapla.
6. Belirsizlik yüksekse (örneğin sosun içi belirsizse veya karanlıksa) "needsClarification": true yap ve kullanıcıya net bir açıklama sorusu yönelt ("clarificationQuestion").
7. Güven seviyesini 'low', 'medium' veya 'high' olarak belirle.

MUTLAKA aşağıdaki JSON şemasında çıktı ver:
{
  "detectedItems": [
    {
      "name": "Yiyecek adı",
      "portion": "Tahmini porsiyon (ör: 1 porsiyon / ~200g)",
      "estimatedCalories": 350,
      "protein": 25,
      "carbs": 10,
      "fat": 15,
      "confidence": "medium",
      "note": "Açıklama"
    }
  ],
  "calorieMin": 600,
  "calorieMax": 750,
  "estimatedCalories": 680,
  "protein": 38,
  "carbs": 45,
  "fat": 24,
  "fiber": 6,
  "confidence": "medium",
  "cookingStyleNotes": "Izgara ve az yağlı",
  "visibleOilsSauces": "Üzerinde hafif zeytinyağı sosu mevcut",
  "needsClarification": false,
  "clarificationQuestion": "",
  "analysisSummary": "Dengeli bir öğün..."
}`;

  // 1. Try Gemini Vision First
  const gemini = getGeminiClient();
  if (gemini && !isProviderInCooldown('gemini')) {
    try {
      return await withRetry(
        () =>
          withTimeout(
            (async () => {
              const parts: any[] = req.images.map((img) => ({
                inlineData: {
                  mimeType: img.mimeType || 'image/jpeg',
                  data: img.base64,
                },
              }));
              parts.push({ text: prompt });

              const resp = await gemini.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: { parts },
                config: {
                  responseMimeType: 'application/json',
                },
              });

              const text = resp.text || '{}';
              return extractSafeJson(text);
            })(),
            28000,
            'Gemini multi-vision'
          ),
        1,
        1000
      );
    } catch (err: any) {
      console.warn('[Vision] Gemini vision hatası, OpenRouter deneniyor...', err?.message);
      if (String(err?.message || '').includes('429') || String(err?.message || '').includes('quota')) {
        markProviderCooldown('gemini');
      }
    }
  }

  // 2. Try OpenRouter Multimodal Fallback
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && !isProviderInCooldown('openrouter')) {
    try {
      return await withTimeout(
        (async () => {
          const contentParts: any[] = [{ type: 'text', text: prompt }];
          req.images.forEach((img) => {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`,
              },
            });
          });

          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openRouterKey}`,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [{ role: 'user', content: contentParts }],
            }),
          });

          if (!resp.ok) throw new Error(`OpenRouter Vision failed (${resp.status})`);
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || '{}';
          return extractSafeJson(content);
        })(),
        28000,
        'OpenRouter vision'
      );
    } catch (err: any) {
      console.warn('[Vision] OpenRouter vision hatası:', err?.message);
      markProviderCooldown('openrouter');
    }
  }

  // 3. Fallback: Return safe conservative heuristic rather than crashing!
  return {
    detectedItems: [
      {
        name: req.mealName || 'İş Yemeği',
        portion: '1 standart tabak',
        estimatedCalories: 650,
        protein: 28,
        carbs: 60,
        fat: 22,
        confidence: 'low',
        note: 'AI servisi geçici olarak meşgul olduğundan standart iş yemeği tahmini uygulandı.',
      },
    ],
    calorieMin: 550,
    calorieMax: 780,
    estimatedCalories: 650,
    protein: 28,
    carbs: 60,
    fat: 22,
    fiber: 5,
    confidence: 'low',
    cookingStyleNotes: 'Standart pişirme varsayımı',
    visibleOilsSauces: 'Orta düzey yağ',
    needsClarification: true,
    clarificationQuestion: 'Yemeğin içeriği veya pişirilme şekli hakkında detay paylaşmak ister misiniz?',
    analysisSummary: 'Görsel analizi servisi geçici olarak meşgul. Öğününüz ortalama standart iş yemeği değerleriyle kaydedildi, dilediğinizde miktarı düzenleyebilirsiniz.',
  };
}
