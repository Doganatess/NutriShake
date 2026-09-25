import {
  DailyPlan,
  MealAnalysis,
  Shake,
  PortionPreference,
} from '../types';

export interface GeneratePlanPayload {
  date: string;
  dailyGoalKcal: number;
  consumedMealsKcal: number;
  remainingKcalNeeded: number;
  remainingProtein?: number;
  remainingCarbs?: number;
  remainingFat?: number;
  shakeCount: number;
  portionPreference: PortionPreference;
  mandatoryIngredientIds: string[];
  allowedIngredientIds: string[];
  forbiddenIngredientIds: string[];
  userPreferences: string[];
  dislikedShakeNames?: string[];
  favoriteShakeNames?: string[];
  userStock?: Record<string, any>;
}

export interface ReplaceShakePayload {
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

export interface AnalyzeMealPayload {
  imageBase64?: string;
  photos?: string[];
  mimeType?: string;
  mealName?: string;
  userNotes?: string;
}

export class ApiError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

// NOTE: A chatWithAiApi() helper targeting '/api/chat' used to live here, but no
// screen in the app ever called it and there was no matching api/chat.ts endpoint —
// it would have thrown a 404 the moment anything tried to use it. Removed as dead code
// rather than left as a trap for a future feature that silently doesn't exist yet.


export async function analyzeMealApi(payload: AnalyzeMealPayload, signal?: AbortSignal): Promise<Omit<MealAnalysis, 'id' | 'date' | 'mealType' | 'mealName' | 'createdAt'>> {
  const res = await fetch('/api/analyze-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      ...payload,
      requestId: `meal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || 'Öğün analiz edilemedi.', data.detail);
  }

  return data;
}

export async function generateDailyPlanApi(payload: GeneratePlanPayload, signal?: AbortSignal): Promise<DailyPlan> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      ...payload,
      requestId: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || 'Günlük plan oluşturulamadı.', data.detail);
  }

  return data;
}

export async function replaceShakeApi(payload: ReplaceShakePayload, signal?: AbortSignal): Promise<Shake> {
  const res = await fetch('/api/replace-shake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      ...payload,
      requestId: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || 'Shake değiştirilemedi.', data.detail);
  }

  return data;
}
