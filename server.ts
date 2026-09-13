import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  generateDailyShakePlan,
  replaceSingleShake,
} from './src/server/geminiService';
import {
  analyzeMealMultiVision,
  generateTextWithFallback,
  deduplicateRequest,
  isProviderInCooldown,
} from './src/server/aiProvider';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser for JSON with ample limit for compressed photo payloads
app.use(express.json({ limit: '35mb' }));

// Health check endpoint with provider status
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      gemini: {
        configured: !!process.env.GEMINI_API_KEY,
        inCooldown: isProviderInCooldown('gemini'),
      },
      openrouter: {
        configured: !!process.env.OPENROUTER_API_KEY,
        inCooldown: isProviderInCooldown('openrouter'),
      },
    },
  });
});

// 1. Interactive Chat / Nutrition Assistant Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, history, context, requestId } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Mesaj içeriği eksik.' });
  }

  const cacheKey = `chat_${requestId || message.trim().toLowerCase().slice(0, 80)}`;

  try {
    const result = await deduplicateRequest(cacheKey, async () => {
      const systemInstruction = `Sen NutriShake akıllı beslenme ve doğal shake formülasyon uzmanısın.
Kullanıcılara Ordu/Karadeniz ve Türk mutfağının doğal malzemeleriyle (süt, yoğurt, fındık, yulaf, taze/kuru meyveler, bal, pekmez) dengeli beslenme tavsiyeleri verirsin.
Asla sentetik protein tozu, yabancı tohumlar (chia, keten harici gereksiz egzotikler), fıstık ezmesi veya yapay tatlandırıcılar önerme.
Kullanıcının vardiyalarına (sabah veya akşam) uygun, pratik, sindirimi rahat ve bilimsel makro dengeli açıklamalar yap. Türkçe, nazik, net ve motive edici konuş.`;

      let prompt = '';
      if (context) {
        prompt += `[KULLANICI BİLGİSİ / BAĞLAM]: ${typeof context === 'object' ? JSON.stringify(context) : context}\n\n`;
      }
      if (Array.isArray(history) && history.length > 0) {
        prompt += `[GEÇMİŞ DİYALOG]:\n${history.map((h: any) => `${h.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${h.text}`).join('\n')}\n\n`;
      }
      prompt += `Kullanıcı Mesajı: ${message}`;

      const aiResponse = await generateTextWithFallback(prompt, systemInstruction, 22000);
      return {
        reply: aiResponse.text,
        provider: aiResponse.provider,
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({
      error: 'Asistan şu anda yanıt veremedi. Lütfen biraz sonra tekrar deneyin.',
      detail: error?.message,
    });
  }
});

// 2. Analyze Meal (Vision AI - Multi-Photo & Multi-Provider Support)
app.post('/api/analyze-meal', async (req, res) => {
  const { imageBase64, photos, mimeType, mealName, userNotes, requestId } = req.body;

  // Support single image or array of multiple photos
  const rawImages: { base64: string; mimeType: string }[] = [];
  if (Array.isArray(photos) && photos.length > 0) {
    photos.forEach((p: string) => {
      if (p) rawImages.push({ base64: p.replace(/^data:image\/[a-z]+;base64,/, ''), mimeType: mimeType || 'image/jpeg' });
    });
  } else if (imageBase64) {
    rawImages.push({
      base64: imageBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
      mimeType: mimeType || 'image/jpeg',
    });
  }

  if (rawImages.length === 0) {
    return res.status(400).json({ error: 'Görsel verisi (base64) eksik.' });
  }

  const cacheKey = `meal_${requestId || rawImages[0].base64.slice(0, 40)}`;

  try {
    const result = await deduplicateRequest(cacheKey, async () => {
      return await analyzeMealMultiVision({
        images: rawImages,
        mealName,
        userNotes,
      });
    });
    res.json(result);
  } catch (error: unknown) {
    console.error('Error analyzing meal:', error);
    const msg = error instanceof Error ? error.message : 'Öğün analizi sırasında bir hata oluştu.';
    res.status(500).json({
      error: 'Fotoğraftan öğün analiz edilemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.',
      detail: msg,
    });
  }
});

// 3. Generate Daily Shake Plan
app.post('/api/generate-plan', async (req, res) => {
  const {
    date,
    dailyGoalKcal,
    consumedMealsKcal,
    remainingKcalNeeded,
    shakeCount,
    portionPreference,
    mandatoryIngredientIds,
    allowedIngredientIds,
    forbiddenIngredientIds,
    userPreferences,
    dislikedShakeNames,
    favoriteShakeNames,
    userStock,
    requestId,
  } = req.body;

  const cacheKey = `plan_${date}_${Math.round(Number(remainingKcalNeeded) || 800)}_${requestId || 'default'}`;

  try {
    const plan = await deduplicateRequest(cacheKey, async () => {
      return await generateDailyShakePlan({
        date: date || new Date().toISOString().split('T')[0],
        dailyGoalKcal: Number(dailyGoalKcal) || 2000,
        consumedMealsKcal: Number(consumedMealsKcal) || 0,
        remainingKcalNeeded: Number(remainingKcalNeeded) || 800,
        shakeCount: Math.min(2, Math.max(1, Number(shakeCount) || 1)),
        portionPreference: portionPreference || 'medium',
        mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
        allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
        forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
        userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
        dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
        favoriteShakeNames: Array.isArray(favoriteShakeNames) ? favoriteShakeNames : [],
        userStock: userStock && typeof userStock === 'object' ? userStock : undefined,
      });
    });
    res.json(plan);
  } catch (error: unknown) {
    console.error('Error generating daily plan:', error);
    const msg = error instanceof Error ? error.message : 'Plan oluşturulamadı.';
    res.status(500).json({
      error: 'Günlük shake planı oluşturulamadı. Lütfen tekrar deneyin.',
      detail: msg,
    });
  }
});

// 4. Replace Single Shake
app.post('/api/replace-shake', async (req, res) => {
  const {
    targetKcal,
    currentShakeName,
    portionPreference,
    mandatoryIngredientIds,
    allowedIngredientIds,
    forbiddenIngredientIds,
    otherShakesNames,
    userPreferences,
    dislikedShakeNames,
    userStock,
    requestId,
  } = req.body;

  const cacheKey = `replace_${requestId || currentShakeName}_${targetKcal}`;

  try {
    const newShake = await deduplicateRequest(cacheKey, async () => {
      return await replaceSingleShake({
        targetKcal: Number(targetKcal) || 500,
        currentShakeName: currentShakeName || 'Mevcut Shake',
        portionPreference: portionPreference || 'medium',
        mandatoryIngredientIds: Array.isArray(mandatoryIngredientIds) ? mandatoryIngredientIds : [],
        allowedIngredientIds: Array.isArray(allowedIngredientIds) ? allowedIngredientIds : [],
        forbiddenIngredientIds: Array.isArray(forbiddenIngredientIds) ? forbiddenIngredientIds : [],
        otherShakesNames: Array.isArray(otherShakesNames) ? otherShakesNames : [],
        userPreferences: Array.isArray(userPreferences) ? userPreferences : [],
        dislikedShakeNames: Array.isArray(dislikedShakeNames) ? dislikedShakeNames : [],
        userStock: userStock && typeof userStock === 'object' ? userStock : undefined,
      });
    });
    res.json(newShake);
  } catch (error: unknown) {
    console.error('Error replacing shake:', error);
    const msg = error instanceof Error ? error.message : 'Shake değiştirilemedi.';
    res.status(500).json({
      error: 'Alternatif shake oluşturulamadı. Lütfen tekrar deneyin.',
      detail: msg,
    });
  }
});

// Start server with Vite middleware in dev or static files in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NutriShake server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
