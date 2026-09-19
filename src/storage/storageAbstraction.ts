import {
  UserProfile,
  DailyPlan,
  MealAnalysis,
  Shake,
  UserPreference,
  WeightEntry,
  IngredientState,
  UserMemory,
  ShakeRating,
  StockItem,
  StockTransaction,
  ShiftSchedule,
  ShiftType,
} from '../types.js';

export const CURRENT_SCHEMA_VERSION = 3;


/**
 * One-time storage schema migration entry point.
 *
 * The app intentionally keeps migrations conservative: unknown/corrupt values are
 * left untouched so a migration can never destroy user data. Existing records are
 * upgraded only by adding the current schema version marker.
 */
export function initializeStorageSchema(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  try {
    const rawVersion = localStorage.getItem('nutrishake_schema_version');
    const currentVersion = Number(rawVersion || 0);

    if (!Number.isFinite(currentVersion) || currentVersion < CURRENT_SCHEMA_VERSION) {
      const keysToVersion = [
        STORAGE_KEYS.PROFILE,
        STORAGE_KEYS.DAILY_PLANS,
        STORAGE_KEYS.MEALS,
        STORAGE_KEYS.CUSTOM_RECIPES,
      ];

      for (const key of keysToVersion) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          if (key === STORAGE_KEYS.PROFILE) {
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
            }
          } else if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === 'object') item.schemaVersion = CURRENT_SCHEMA_VERSION;
            }
          } else if (parsed && typeof parsed === 'object') {
            for (const value of Object.values(parsed)) {
              if (value && typeof value === 'object') {
                (value as Record<string, unknown>).schemaVersion = CURRENT_SCHEMA_VERSION;
              }
            }
          }
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // Preserve unreadable user data rather than overwriting it.
        }
      }

      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION));
    }
  } catch (error) {
    console.warn('[Storage] Schema migration could not complete:', error);
  }
}

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'nutrishake_schema_version',
  PROFILE: 'nutrishake_profile',
  INGREDIENT_STATES: 'nutrishake_ingredient_states',
  USER_STOCK: 'nutrishake_user_stock',
  STOCK_TRANSACTIONS: 'nutrishake_stock_transactions',
  DAILY_PLANS: 'nutrishake_daily_plans',
  MEALS: 'nutrishake_meals',
  FAVORITES: 'nutrishake_favorites',
  DISLIKED_SHAKES: 'nutrishake_disliked_shakes',
  PREFERENCES: 'nutrishake_preferences',
  WEIGHTS: 'nutrishake_weights',
  USER_MEMORIES: 'nutrishake_user_memories',
  CUSTOM_RECIPES: 'nutrishake_custom_recipes',
  SHOPPING_CHECKED: 'nutrishake_shopping_checked',
  SHIFTS: 'nutrishake_shifts',
};

// Returns current date string as YYYY-MM-DD in local time
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error('Storage error:', e);
  }
}

// User Profile (Starts COMPLETELY EMPTY on fresh install)
export function getStoredProfile(): UserProfile | null {
  try {
    const raw = getStorageItem(STORAGE_KEYS.PROFILE);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch (e) {
    console.error('Error loading profile:', e);
    return null;
  }
}

export function saveStoredProfile(profile: UserProfile): void {
  try {
    profile.schemaVersion = CURRENT_SCHEMA_VERSION;
    setStorageItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  } catch (e) {
    console.error('Error saving profile:', e);
  }
}

// User Stock (Database !== Stock, Stock starts completely empty)
export function getStoredStock(): Record<string, StockItem> {
  try {
    const raw = getStorageItem(STORAGE_KEYS.USER_STOCK);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error loading stock:', e);
    return {};
  }
}

export function saveStoredStock(stock: Record<string, StockItem>): void {
  try {
    setStorageItem(STORAGE_KEYS.USER_STOCK, JSON.stringify(stock));
  } catch (e) {
    console.error('Error saving stock:', e);
  }
}

// Stock Transactions (Audit trail for in/out inventory)
export function getStoredStockTransactions(): StockTransaction[] {
  try {
    const raw = getStorageItem(STORAGE_KEYS.STOCK_TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading stock transactions:', e);
    return [];
  }
}

export function saveStockTransaction(tx: StockTransaction): void {
  try {
    const list = getStoredStockTransactions();
    const updated = [tx, ...list.slice(0, 199)]; // Keep last 200 logs
    setStorageItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving stock transaction:', e);
  }
}

// Ingredient states: Record<ingredientId, IngredientState> (Clean empty start)
export function getStoredIngredientStates(): Record<string, IngredientState> {
  try {
    const raw = getStorageItem(STORAGE_KEYS.INGREDIENT_STATES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const cleaned: Record<string, IngredientState> = {};
        for (const [id, state] of Object.entries(parsed)) {
          if (state === 'mandatory') {
            cleaned[id] = 'mandatory';
          } else {
            cleaned[id] = 'allowed';
          }
        }
        return cleaned;
      }
    }
  } catch (e) {
    console.error('Error loading ingredient states:', e);
  }
  return {};
}

export function saveStoredIngredientStates(states: Record<string, IngredientState>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INGREDIENT_STATES, JSON.stringify(states));
  } catch (e) {
    console.error('Error saving ingredient states:', e);
  }
}

// Daily Plans: Record<date, DailyPlan>
export function getStoredDailyPlans(): Record<string, DailyPlan> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_PLANS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error loading daily plans:', e);
    return {};
  }
}

export function getDailyPlanForDate(date: string): DailyPlan | null {
  const plans = getStoredDailyPlans();
  return plans[date] || null;
}

export function saveDailyPlan(plan: DailyPlan): void {
  try {
    plan.schemaVersion = CURRENT_SCHEMA_VERSION;
    const plans = getStoredDailyPlans();
    plans[plan.date] = plan;
    localStorage.setItem(STORAGE_KEYS.DAILY_PLANS, JSON.stringify(plans));
  } catch (e) {
    console.error('Error saving daily plan:', e);
  }
}

// Meal Analyses
export function getStoredMeals(): MealAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEALS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading meals:', e);
    return [];
  }
}

export function saveMeal(meal: MealAnalysis): void {
  try {
    meal.schemaVersion = CURRENT_SCHEMA_VERSION;
    const meals = getStoredMeals();
    const updated = [meal, ...meals.filter((m) => m.id !== meal.id)];
    localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving meal:', e);
  }
}

export function deleteMeal(id: string): void {
  try {
    const meals = getStoredMeals();
    const updated = meals.filter((m) => m.id !== id);
    localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting meal:', e);
  }
}

export function removeMealPhotoOnly(id: string): void {
  try {
    const meals = getStoredMeals();
    const updated = meals.map((m) => {
      if (m.id === id) {
        const copy = { ...m };
        delete copy.imageBase64;
        return copy;
      }
      return m;
    });
    localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error removing meal photo:', e);
  }
}

export function getMealsForDate(date: string): MealAnalysis[] {
  const meals = getStoredMeals();
  return meals.filter((m) => m.date === date);
}

// Favorite Shake Recipes
export function getStoredFavorites(): any[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') {
          return {
            id: item,
            name: item,
            ingredients: [],
            estimatedCalories: 350,
            protein: 15,
            carbs: 45,
            fat: 10,
            fiber: 5,
            instructions: '',
            preparationTimeMinutes: 5,
            portionSize: 'medium' as const,
            isCompleted: false,
            createdAt: new Date().toISOString(),
          };
        }
        return item;
      });
    }
    return [];
  } catch (e) {
    console.error('Error loading favorites:', e);
    return [];
  }
}

export function toggleFavorite(recipeIdOrName: string): boolean {
  try {
    const favs = getStoredFavorites();
    const exists = favs.some((f) => f.id === recipeIdOrName || f.name === recipeIdOrName);
    const updated = exists
      ? favs.filter((f) => f.id !== recipeIdOrName && f.name !== recipeIdOrName)
      : [
          ...favs,
          {
            id: recipeIdOrName,
            name: recipeIdOrName,
            ingredients: [],
            estimatedCalories: 350,
            protein: 15,
            carbs: 45,
            fat: 10,
            fiber: 5,
            instructions: '',
            preparationTimeMinutes: 5,
            portionSize: 'medium' as const,
            isCompleted: false,
            createdAt: new Date().toISOString(),
          },
        ];
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
    return !exists;
  } catch (e) {
    console.error('Error toggling favorite:', e);
    return false;
  }
}

export function toggleFavoriteShake(shake: Shake): boolean {
  try {
    const favs = getStoredFavorites();
    const exists = favs.some((f) => f.id === shake.id || f.name === shake.name);
    const updated = exists
      ? favs.filter((f) => f.id !== shake.id && f.name !== shake.name)
      : [shake, ...favs];
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
    return !exists;
  } catch (e) {
    console.error('Error toggling favorite shake:', e);
    return false;
  }
}

// Disliked Shakes (Feedback learning)
export function getStoredDislikedShakes(): any[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DISLIKED_SHAKES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading disliked shakes:', e);
    return [];
  }
}

export function addDislikedShake(shakeOrId: Shake | string): void {
  try {
    const disliked = getStoredDislikedShakes();
    const item = typeof shakeOrId === 'string' ? { id: shakeOrId, name: shakeOrId } : shakeOrId;
    const exists = disliked.some((d: any) =>
      typeof d === 'string' ? d === item.id || d === item.name : d.id === item.id || d.name === item.name
    );
    if (!exists) {
      disliked.push(item);
      localStorage.setItem(STORAGE_KEYS.DISLIKED_SHAKES, JSON.stringify(disliked));
    }
  } catch (e) {
    console.error('Error adding disliked shake:', e);
  }
}

// User Preferences (List of rules or preferences)
export function getStoredPreferences(): UserPreference[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading preferences:', e);
  }
  return [];
}

export function saveStoredPreferences(prefs: UserPreference[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
  } catch (e) {
    console.error('Error saving preferences:', e);
  }
}

export function savePreference(pref: UserPreference): void {
  try {
    const list = getStoredPreferences();
    const updated = [pref, ...list.filter((p) => p.id !== pref.id)];
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving preference:', e);
  }
}

export function deletePreference(id: string): void {
  try {
    const list = getStoredPreferences();
    const updated = list.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting preference:', e);
  }
}

// Weight Entries
export function getStoredWeights(): WeightEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEIGHTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading weights:', e);
    return [];
  }
}

export function saveWeightEntry(entry: WeightEntry): void {
  try {
    const weights = getStoredWeights();
    const filtered = weights.filter((w) => w.date !== entry.date);
    const updated = [...filtered, entry].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving weight entry:', e);
  }
}

export function deleteWeightEntry(dateOrId: string): void {
  try {
    const weights = getStoredWeights();
    const updated = weights.filter((w) => w.date !== dateOrId && w.id !== dateOrId);
    localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting weight entry:', e);
  }
}

// User Memories
export function getStoredUserMemories(): UserMemory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_MEMORIES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading user memories:', e);
    return [];
  }
}

export function saveUserMemory(memory: UserMemory): void {
  try {
    const list = getStoredUserMemories();
    const updated = [memory, ...list.filter((m) => m.id !== memory.id)];
    localStorage.setItem(STORAGE_KEYS.USER_MEMORIES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving user memory:', e);
  }
}

export const saveMemory = saveUserMemory;

export function deleteUserMemory(id: string): void {
  try {
    const list = getStoredUserMemories();
    const updated = list.filter((m) => m.id !== id);
    localStorage.setItem(STORAGE_KEYS.USER_MEMORIES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting user memory:', e);
  }
}

// Custom Created Recipes
export function getStoredCustomRecipes(): Shake[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_RECIPES);
    return raw ? (JSON.parse(raw) as Shake[]) : [];
  } catch (e) {
    console.error('Error loading custom recipes:', e);
    return [];
  }
}

export function saveCustomRecipe(shake: Shake): void {
  try {
    shake.schemaVersion = CURRENT_SCHEMA_VERSION;
    const recipes = getStoredCustomRecipes();
    const updated = [shake, ...recipes.filter((r) => r.id !== shake.id)];
    localStorage.setItem(STORAGE_KEYS.CUSTOM_RECIPES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving custom recipe:', e);
  }
}

export function deleteCustomRecipe(id: string): void {
  try {
    const recipes = getStoredCustomRecipes();
    const updated = recipes.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_RECIPES, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting custom recipe:', e);
  }
}

// Shopping Checklist
export function getStoredShoppingChecked(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHOPPING_CHECKED);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading shopping checked:', e);
    return [];
  }
}

export function toggleShoppingChecked(itemId: string): boolean {
  try {
    const checked = getStoredShoppingChecked();
    const exists = checked.includes(itemId);
    const updated = exists ? checked.filter((id) => id !== itemId) : [...checked, itemId];
    localStorage.setItem(STORAGE_KEYS.SHOPPING_CHECKED, JSON.stringify(updated));
    return !exists;
  } catch (e) {
    console.error('Error toggling shopping checked:', e);
    return false;
  }
}

// Update Shake Rating
export function updateShakeRating(date: string, shakeId: string, rating: ShakeRating): void {
  try {
    const plans = getStoredDailyPlans();
    const plan = plans[date];
    if (!plan) return;

    plan.shakes = plan.shakes.map((s) => {
      if (s.id === shakeId) {
        return { ...s, rating };
      }
      return s;
    });

    plans[date] = plan;
    localStorage.setItem(STORAGE_KEYS.DAILY_PLANS, JSON.stringify(plans));
  } catch (e) {
    console.error('Error updating shake rating:', e);
  }
}

// Shift Schedule Management
export const DEFAULT_SHIFTS: ShiftSchedule[] = [
  { id: 'shift_1', dayOfWeek: 1, shiftType: 'morning', label: 'Sabah (08:00 - 17:00)', startTime: '08:00', endTime: '17:00', mealWindowStart: '15:00', mealWindowEnd: '16:30' },
  { id: 'shift_2', dayOfWeek: 2, shiftType: 'morning', label: 'Sabah (08:00 - 17:00)', startTime: '08:00', endTime: '17:00', mealWindowStart: '15:00', mealWindowEnd: '16:30' },
  { id: 'shift_3', dayOfWeek: 3, shiftType: 'morning', label: 'Sabah (08:00 - 17:00)', startTime: '08:00', endTime: '17:00', mealWindowStart: '15:00', mealWindowEnd: '16:30' },
  { id: 'shift_4', dayOfWeek: 4, shiftType: 'morning', label: 'Sabah (08:00 - 17:00)', startTime: '08:00', endTime: '17:00', mealWindowStart: '15:00', mealWindowEnd: '16:30' },
  { id: 'shift_5', dayOfWeek: 5, shiftType: 'morning', label: 'Sabah (08:00 - 17:00)', startTime: '08:00', endTime: '17:00', mealWindowStart: '15:00', mealWindowEnd: '16:30' },
  { id: 'shift_6', dayOfWeek: 6, shiftType: 'off', label: 'İzin Günü' },
  { id: 'shift_0', dayOfWeek: 0, shiftType: 'off', label: 'İzin Günü' },
];

export function getStoredShifts(): ShiftSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    if (!raw) return DEFAULT_SHIFTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SHIFTS;
  } catch (e) {
    console.error('Error loading shifts:', e);
    return DEFAULT_SHIFTS;
  }
}

export function saveStoredShifts(shifts: ShiftSchedule[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
  } catch (e) {
    console.error('Error saving shifts:', e);
  }
}

/**
 * EXPORT ALL USER DATA TO JSON
 * Allows complete backup of stock, recipes, plans, meals, memory, shifts, etc.
 */
export function exportAllUserData(): string {
  const exportPayload = {
    app: 'NutriShake Pro',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile: getStoredProfile(),
      stock: getStoredStock(),
      stockTransactions: getStoredStockTransactions(),
      ingredientStates: getStoredIngredientStates(),
      dailyPlans: getStoredDailyPlans(),
      meals: getStoredMeals(),
      customRecipes: getStoredCustomRecipes(),
      weights: getStoredWeights(),
      preferences: getStoredPreferences(),
      favorites: getStoredFavorites(),
      dislikedShakes: getStoredDislikedShakes(),
      userMemories: getStoredUserMemories(),
      shifts: getStoredShifts(),
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * IMPORT USER DATA FROM JSON
 * Validates schema and restores all tables cleanly.
 */
export function importUserData(jsonString: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !parsed.data) {
      return { success: false, message: 'Geçersiz veri formatı!' };
    }

    const { data } = parsed;

    if (data.profile) saveStoredProfile(data.profile);
    if (data.stock) saveStoredStock(data.stock);
    if (data.stockTransactions && Array.isArray(data.stockTransactions)) {
      localStorage.setItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(data.stockTransactions));
    }
    if (data.ingredientStates) saveStoredIngredientStates(data.ingredientStates);
    if (data.dailyPlans) localStorage.setItem(STORAGE_KEYS.DAILY_PLANS, JSON.stringify(data.dailyPlans));
    if (data.meals) localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(data.meals));
    if (data.customRecipes) localStorage.setItem(STORAGE_KEYS.CUSTOM_RECIPES, JSON.stringify(data.customRecipes));
    if (data.weights) localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(data.weights));
    if (data.preferences) saveStoredPreferences(data.preferences);
    if (data.favorites) localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data.favorites));
    if (data.dislikedShakes) localStorage.setItem(STORAGE_KEYS.DISLIKED_SHAKES, JSON.stringify(data.dislikedShakes));
    if (data.userMemories) localStorage.setItem(STORAGE_KEYS.USER_MEMORIES, JSON.stringify(data.userMemories));
    if (data.shifts && Array.isArray(data.shifts)) saveStoredShifts(data.shifts);

    return { success: true, message: 'Verileriniz başarıyla içe aktarıldı.' };
  } catch (err) {
    console.error('Import error:', err);
    return { success: false, message: 'Dosya okunurken hata oluştu: ' + String(err) };
  }
}

/**
 * STRICT REQUIREMENT: "Verilerimi Sil"
 * SADECE kullanıcı verilerini temizler.
 * STATIC INGREDIENT DATABASE ASLA SİLİNMEZ!
 */
export function clearUserOnlyData(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

export const clearAllAppData = clearUserOnlyData;

/**
 * Weekly Recommended Signatures tracking (Rule 5: Prevent duplicate shakes in same week)
 */
export function getWeeklyKey(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay();
  // Monday of current week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

export function getWeeklyRecommendedSignatures(weekKey?: string): string[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
    const key = `nutrishake_weekly_signatures_${weekKey || getWeeklyKey()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading weekly signatures:', e);
    return [];
  }
}

export function saveWeeklyRecommendedSignature(signature: string, weekKey?: string): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = `nutrishake_weekly_signatures_${weekKey || getWeeklyKey()}`;
    const list = getWeeklyRecommendedSignatures(weekKey);
    if (!list.includes(signature)) {
      list.push(signature);
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch (e) {
    console.error('Error saving weekly signature:', e);
  }
}

export function clearWeeklyRecommendedSignatures(weekKey?: string): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = `nutrishake_weekly_signatures_${weekKey || getWeeklyKey()}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Error clearing weekly signatures:', e);
  }
}
