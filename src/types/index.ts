// Domain Models and Types for Personal Nutrition & Shake System
// Schema Version 2.0.0

export const CURRENT_SCHEMA_VERSION = 2;

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';
export type PortionPreference = 'small' | 'medium' | 'large'; // Küçük, Orta, Büyük
export type GoalType = 'lose_weight' | 'maintain' | 'maintain_weight' | 'gain_weight';
export type ShakeTiming =
  | 'morning'
  | 'noon'
  | 'evening'
  | 'post_workout'
  | 'snack'
  | 'breakfast'
  | 'lunch'
  | 'pre_workout';
export type IngredientState = 'allowed' | 'mandatory' | 'forbidden';

// Strict 8 categories requested by master architecture
export type IngredientCategory =
  | 'fruits'         // 1. Meyveler
  | 'dried_fruits'   // 2. Kuru Meyveler
  | 'dairy'          // 3. Süt Ürünleri
  | 'grains'         // 4. Tahıllar
  | 'sweeteners'     // 5. Tatlandırıcılar (Reçel, Bal, Pekmez)
  | 'cocoa_extras'   // 6. Kakao ve Shake Ekstraları
  | 'nuts'           // 7. Kuruyemişler
  | 'others';        // 8. Diğer

export type SupportedUnit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'L'
  | 'adet'
  | '1/2 adet'
  | '1/4 adet'
  | 'dilim'
  | 'yemek kaşığı'
  | 'tatlı kaşığı'
  | 'çay kaşığı'
  | 'porsiyon';

export interface UnitOption {
  unit: SupportedUnit | string;
  grams: number; // Normalized equivalent in grams or ml
  label: string; // Turkish display label
}

export type ShiftType = 'morning' | 'evening' | 'off';

export interface ShiftSchedule {
  id: string;
  dayOfWeek: number; // 0 = Pazar, 1 = Pazartesi ... 6 = Cumartesi
  shiftType: ShiftType;
  label?: string; // Örn: "Sabah Vardiyası (08:00 - 17:00)"
  startTime?: string; // "08:00" or "14:30"
  endTime?: string; // "17:00" or "00:00"
  mealWindowStart?: string; // "15:00"
  mealWindowEnd?: string; // "16:30" or "16:00"
  mealTimingRecommendation?: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  gender: 'male' | 'female';
  age: number;
  currentWeight: number; // kg
  targetWeight: number; // kg
  height: number; // cm
  activityLevel: ActivityLevel;
  goal: GoalType;
  dailyShakeCount: number; // 1 or 2
  portionPreference: PortionPreference;
  maintenanceCalories: number; // BMR/TDEE calculated
  calorieGoal: number; // Target daily calories
  monthlyWeightGoalKg?: number; // Core weight goal: +5 kg / month
  dailySurplusKcal?: number; // Targeted daily caloric surplus (~1000-1300 kcal)
  isCustomCalorieGoal: boolean;
  proteinGoal: number; // g
  carbGoal?: number; // g
  fatGoal?: number; // g
  favoriteIngredientIds: string[];
  forbiddenIngredientIds: string[];
  allergies?: string[];
  shifts?: ShiftSchedule[];
  workoutDays?: (number | string)[];
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
}

// Complete Ingredient Data Model with rich metadata
export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  categoryNameTr: string;
  aliases: string[];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  defaultServing: number;
  defaultServingUnit: SupportedUnit | string;
  units: UnitOption[];
  edibleWeight: number; // Net edible weight (e.g., 100g for 1 medium banana without peel)
  shakeCompatibility: 'liquid' | 'base' | 'thickener' | 'flavor' | 'booster' | 'topping' | 'sweetener';
  tasteProfile: 'sweet' | 'tart' | 'rich' | 'bitter' | 'neutral' | 'aromatic' | 'tangy';
  compatibilityTags: string[]; // e.g. ['banana', 'cocoa', 'milk', 'sweet']
  texture: 'liquid' | 'creamy' | 'dense' | 'crunchy' | 'powder' | 'sticky';
  calorieDensity: 'low' | 'medium' | 'high';
  role: 'base' | 'liquid' | 'thickener' | 'sweetener' | 'flavor' | 'energy';
  allergens: string[];
  estimatedPrice: number; // Approximate TL per 100g or unit
  priceUnit: string;
  season: 'all' | 'summer' | 'winter' | 'spring' | 'autumn';
  perishability: 'low' | 'medium' | 'high';
  preparationNotes: string;
  isRegional?: boolean;
  icon?: string;
  isAvailableInOrduUnye?: boolean;
  subCategory?: 'jams' | 'honeys' | 'molasses' | string;
  subCategoryNameTr?: string;
}

// Stock Item: what the user physically has in their kitchen
export interface StockItem {
  ingredientId: string;
  amount: number; // Total quantity in user's chosen unit
  unit: SupportedUnit | string;
  normalizedGramsOrMl: number; // Converted to standard grams or ml
  updatedAt: string;
  costPerUnit?: number;
  lowStockThreshold?: number; // Warning threshold in normalized grams
}

export interface StockTransaction {
  id: string;
  ingredientId: string;
  type: 'purchase' | 'consume' | 'adjustment' | 'carryover';
  amount: number; // Positive for additions, negative for consumptions
  unit: SupportedUnit | string;
  normalizedGramsOrMl: number;
  date: string; // YYYY-MM-DD
  relatedShakeId?: string;
  relatedPlanId?: string;
  note?: string;
  createdAt: string;
}

export interface ShakeIngredient {
  ingredientId: string;
  amount: number; // Normalized grams or ml for calculation
  quantity?: number; // Quantity in original unit (e.g. 1 adet, 2 yemek kaşığı)
  unit: SupportedUnit | string;
  normalizedGrams?: number;
  calculatedCalories?: number;
  calculatedProtein?: number;
  calculatedCarbs?: number;
  calculatedFat?: number;
  calculatedFiber?: number;
  calculatedCost?: number;
}

export type ShakeRating = 'love' | 'like' | 'neutral' | 'dislike'; // ❤️ Çok iyi, 👍 İyi, 😐 Normal, 👎 Beğenmedim

export interface Shake {
  id: string;
  name: string;
  description?: string;
  ingredients: ShakeIngredient[];
  estimatedCalories: number; // Exact calculated through nutrition engine
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  estimatedCost?: number;
  totalVolumeMl?: number;
  instructions: string | string[];
  preparationTimeMinutes: number;
  portionSize?: PortionPreference;
  timing?: ShakeTiming;
  // 2 Equal Portions System (1 Shake / Gün -> 2 Eşit Porsiyon)
  portionCount?: number; // 2
  portionCalories?: number; // total / 2
  portionProtein?: number;
  portionCarbs?: number;
  portionFat?: number;
  portionFiber?: number;
  portion1Completed?: boolean;
  portion1CompletedAt?: string;
  portion2Completed?: boolean;
  portion2CompletedAt?: string;
  isCompleted: boolean;
  completedAt?: string;
  isFavorite?: boolean;
  isDisliked?: boolean;
  rating?: ShakeRating;
  compatibilityScore?: number;
  dominantTaste?: string;
  predictedTexture?: string;
  whyChosenReasons?: string[]; // "Neden bu shake seçildi?"
  schemaVersion?: number;
  createdAt: string;
}

export interface FavoriteShake {
  id: string;
  shake: Shake;
  rating?: ShakeRating;
  addedAt: string;
  timesPrepared: number;
}

export interface DailyShakeNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  totalVolumeMl?: number;
}

export interface DailyShakePortion {
  portionNumber: 1 | 2;
  name: string;
  calories: number;
  isCompleted: boolean;
  completedAt?: string;
}

export interface DailyShake {
  id: string;
  name?: string;
  recipeId?: string;
  recipeName?: string;
  date?: string; // YYYY-MM-DD
  recipe?: Shake;
  ingredients?: ShakeIngredient[];
  totalNutrition: DailyShakeNutrition;
  portionNutrition?: DailyShakeNutrition; // Exactly 50%
  portionCount?: 2;
  portions?: [DailyShakePortion, DailyShakePortion] | DailyShakePortion[];
  portion1Completed?: boolean;
  portion1CompletedAt?: string;
  portion2Completed?: boolean;
  portion2CompletedAt?: string;
  instructions?: string | string[];
  preparationTimeMinutes?: number;
  whyChosenReasons?: string[];
  isCompleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyPlan {
  id?: string;
  date: string; // YYYY-MM-DD
  title?: string;
  notes?: string;
  targetRemainingCalories?: number;
  targetCalories?: number;
  totalCalories?: number;
  completedCalories?: number;
  isFullyCompleted?: boolean;
  schemaVersion?: number;
  dailyShake?: DailyShake;
  shakes: Shake[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WeeklyPlan {
  id: string;
  weekStartDate: string; // YYYY-MM-DD (Pazartesi)
  weekEndDate: string; // YYYY-MM-DD (Pazar)
  days: Record<string, DailyPlan>;
  totalEstimatedCalories: number;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DetectedFoodItem {
  name: string;
  portion: string;
  estimatedCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'low' | 'medium' | 'high';
  note?: string;
}

export interface Meal {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  photoUrl?: string;
  createdAt: string;
}

export interface MealAnalysis {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'work_meal';
  mealName: string;
  photoBase64?: string;
  imageBase64?: string;
  photos?: string[]; // Multiple photos support
  hasPhoto: boolean;
  estimatedCalories: number;
  calorieMin: number;
  calorieMax: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  confidence: 'low' | 'medium' | 'high';
  detectedItems: DetectedFoodItem[];
  cookingStyleNotes?: string;
  visibleOilsSauces?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  analysisSummary: string;
  schemaVersion?: number;
  createdAt: string;
}

export interface WeeklyCaloriePool {
  weeklyTarget: number;
  weeklyConsumed: number;
  weeklyRemaining: number;
  daysRemaining: number;
  dailyAverage: number;
  todayRecommendedAllocation: number;
  redistributionNote?: string;
}

export interface HungryAssessment {
  canConsumePortion2: boolean;
  isPortion2Ready: boolean;
  isPortion2AlreadyConsumed: boolean;
  title: string;
  message: string;
  portionCalories: number;
  remainingDailyCalories: number;
  remainingWeeklyCalories: number;
  timingAdvice: string;
  recommendedAction: 'consume_portion_2' | 'wait' | 'light_snack';
}

export interface UserMemory {
  id: string;
  type?: string;
  category?: string;
  content?: string;
  text?: string;
  impact?: 'positive' | 'negative' | 'neutral';
  sourceShakeId?: string;
  createdAt: string;
}

export interface NutritionStats {
  averageCalories?: number;
  averageProtein?: number;
  averageCarbs?: number;
  averageFat?: number;
  averageFiber?: number;
  targetHitRatio?: number;
  daysLogged?: number;
  avgDailyCalories?: number;
  avgDailyProtein?: number;
  avgDailyCarbs?: number;
  avgDailyFat?: number;
  avgShakeCalories?: number;
  totalCompletedShakes?: number;
  topFavoriteShakes?: any[];
  mostUsedIngredients?: any[];
  mostRejectedShakes?: any[];
  weightStats?: any;
}

export interface UserPreference {
  id: string;
  type: 'like' | 'dislike' | 'portion' | 'habit' | 'ingredient';
  note: string;
  active: boolean;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  category: 'allergy' | 'taste' | 'portion' | 'routine' | 'dislike' | 'favorite';
  key: string;
  value: string;
  confidence: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number; // kg
  note?: string;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  ingredientId: string;
  name: string;
  category: IngredientCategory | string;
  categoryNameTr: string;
  requiredAmount: number; // Total required by plan (in grams/ml)
  currentStock: number; // Currently available in stock (in grams/ml)
  neededAmount: number; // required - currentStock (only deficit!)
  retailDisplay: string; // E.g. "1 L", "6 adet", "500 g"
  estimatedCost: number; // Cost in TL
  checked: boolean;
  totalGrams?: number;
  totalGramsOrMl?: number;
  unit?: string;
  displayQuantity?: string;
}

export interface DailyNutritionSummary {
  calorieGoal: number;
  consumedCalories: number;
  remainingCalories: number;
  consumedProtein: number;
  proteinGoal: number;
  consumedCarbs: number;
  consumedFat: number;
  analyzedMealCalories: number;
  completedShakeCalories: number;
  consumedShakeCalories?: number;
}

// Full application export/import backup schema
export interface AppStorageSchema {
  schemaVersion: number;
  exportedAt: string;
  profile: UserProfile | null;
  stock: Record<string, StockItem>;
  stockTransactions: StockTransaction[];
  dailyPlans: Record<string, DailyPlan>;
  weeklyPlans: Record<string, WeeklyPlan>;
  customRecipes: Shake[];
  favoriteShakes: FavoriteShake[];
  dislikedShakes: Shake[];
  meals: MealAnalysis[];
  userPreferences: UserPreference[];
  memories: MemoryItem[];
  weights: WeightEntry[];
  shiftSchedules: ShiftSchedule[];
  shoppingCheckedIds: string[];
}
