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
  shakeCount: number;
  portionPreference: PortionPreference;
  mandatoryIngredientIds: string[];
  allowedIngredientIds: string[];
  forbiddenIngredientIds: string[];
  userPreferences: string[];
  dislikedShakeNames?: string[];
  favoriteShakeNames?: string[];
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

export async function chatWithAiApi(
  message: string,
  history?: { role: string; text: string }[],
  context?: any
): Promise<{ reply: string; provider: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      context,
      requestId: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || 'Asistan yanıt veremedi.', data.detail);
  }
  return data;
}

export async function analyzeMealApi(payload: AnalyzeMealPayload): Promise<Omit<MealAnalysis, 'id' | 'date' | 'mealType' | 'mealName' | 'createdAt'>> {
  const res = await fetch('/api/analyze-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function generateDailyPlanApi(payload: GeneratePlanPayload): Promise<DailyPlan> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function replaceShakeApi(payload: ReplaceShakePayload): Promise<Shake> {
  const res = await fetch('/api/replace-shake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
