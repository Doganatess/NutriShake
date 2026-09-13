import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Sparkles,
  Layers,
  History,
  Settings,
  WifiOff,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import {
  UserProfile,
  DailyPlan,
  MealAnalysis,
  IngredientState,
} from './types';
import {
  getStoredProfile,
  getStoredIngredientStates,
  getDailyPlanForDate,
  getStoredMeals,
  getTodayDateString,
  saveDailyPlan,
  getStoredPreferences,
  getStoredDislikedShakes,
  getStoredFavorites,
} from './store/storage';
import { calculateDailyNutrition } from './utils/nutritionEngine';
import { generateDailyPlanApi } from './services/apiClient';
import { generateDailyPlan, calculateOptimalDailyShakeKcal } from './engines/planningEngine';
import { getStoredStock } from './storage/storageAbstraction';
import { hasDairyInStock } from './engines/recipeCompositionEngine';

import { TodayView } from './views/TodayView';
import { PlanView } from './views/PlanView';
import { IngredientsView } from './views/IngredientsView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { OnboardingModal } from './components/OnboardingModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';

type TabType = 'today' | 'plan' | 'ingredients' | 'history' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // App Data States
  const [profile, setProfile] = useState<UserProfile | null>(() => getStoredProfile());
  const [ingredientStates, setIngredientStates] = useState<Record<string, IngredientState>>(() =>
    getStoredIngredientStates()
  );

  const todayStr = useMemo(() => getTodayDateString(), []);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(() => getDailyPlanForDate(todayStr));
  const [allMeals, setAllMeals] = useState<MealAnalysis[]>(() => getStoredMeals());

  // Plan Generation state
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Filter today's meals
  const todayMeals = useMemo(() => {
    return allMeals.filter((m) => m.date === todayStr);
  }, [allMeals, todayStr]);

  // Daily Nutrition Summary (Deterministic calculation)
  const nutritionSummary = useMemo(() => {
    return calculateDailyNutrition(profile, dailyPlan, todayMeals);
  }, [profile, dailyPlan, todayMeals]);

  // Refresh data callback from storage
  const handleRefreshData = useCallback(() => {
    const currentToday = getTodayDateString();
    setDailyPlan(getDailyPlanForDate(currentToday));
    setAllMeals(getStoredMeals());
    setIngredientStates(getStoredIngredientStates());
    const storedProf = getStoredProfile();
    if (storedProf) setProfile(storedProf);
  }, []);

  // Generate Daily Shake Plan handler
  const handleGeneratePlan = async () => {
    if (!profile) return;

    // Dairy Consistency Check
    const stock = getStoredStock();
    if (!hasDairyInStock(stock)) {
      setGlobalError(
        'Kıvam ve besin dengesi için kilerinizde en az bir süt ürünü (Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurt) bulunmalıdır. Lütfen önce Malzemeler / Kiler sekmesine gidip bu ürünlerden en az birini ekleyin.'
      );
      setActiveTab('ingredients');
      return;
    }

    setIsGeneratingPlan(true);
    setGlobalError(null);

    try {
      const mandatoryIds = Object.entries(ingredientStates)
        .filter(([_, state]) => state === 'mandatory')
        .map(([id]) => id);

      const allowedIds = Object.entries(ingredientStates)
        .filter(([_, state]) => state === 'allowed')
        .map(([id]) => id);

      const forbiddenIds: string[] = [];

      const prefs = getStoredPreferences().map((p) => p.note);
      const disliked = getStoredDislikedShakes().map((d) => d.name);
      const favorites = getStoredFavorites().map((f) => f.name);

      // Optimal daily shake calories calculated by Planning Engine (~800 - 1400 kcal)
      // Main meal calories are independent and NOT subtracted from the shake target
      const optimalShakeKcal = calculateOptimalDailyShakeKcal(profile);

      const plan = await generateDailyPlanApi({
        date: todayStr,
        // FIX: Previously this sent the user's general diet calorie goal (profile.calorieGoal),
        // which silently overrode the fixed ~3200 kcal shake target computed by
        // calculateOptimalDailyShakeKcal(). The server reads exactly this field
        // (dailyGoalKcal) as the shake calorie target, so it must be optimalShakeKcal.
        dailyGoalKcal: optimalShakeKcal,
        consumedMealsKcal: nutritionSummary.analyzedMealCalories,
        remainingKcalNeeded: optimalShakeKcal,
        shakeCount: 1, // 1 daily recipe -> 2 equal portions
        portionPreference: profile.portionPreference,
        mandatoryIngredientIds: mandatoryIds,
        allowedIngredientIds: allowedIds,
        forbiddenIngredientIds: forbiddenIds,
        userPreferences: prefs,
        dislikedShakeNames: disliked,
        favoriteShakeNames: favorites,
        userStock: stock,
      });

      saveDailyPlan(plan);
      setDailyPlan(plan);
      setActiveTab('plan');
    } catch (err: unknown) {
      console.warn('AI Plan generation unavailable or offline, generating deterministic plan:', err);
      // Deterministic planning engine fallback
      try {
        const fallbackPlan = generateDailyPlan(todayStr, profile);
        setDailyPlan(fallbackPlan);
        setActiveTab('plan');
      } catch (fallbackErr) {
        console.error('Deterministic plan failed:', fallbackErr);
        const msg = fallbackErr instanceof Error ? fallbackErr.message : (err instanceof Error ? err.message : 'Plan oluşturulamadı.');
        setGlobalError(msg);
      }
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Format today date in Turkish: "8 Eylül Salı"
  const formattedTodayDate = useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    }).format(now);
  }, []);

  const activePreferenceNotes = useMemo(() => {
    return getStoredPreferences().map((p) => p.note);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900 font-sans">
      {/* Offline Alert */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-1.5 sticky top-0 z-40">
          <WifiOff className="w-3.5 h-3.5" />
          <span>İnternet bağlantısı kesildi. Çevrimdışı moddasınız.</span>
        </div>
      )}

      {/* Global Error Notice */}
      {globalError && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-800 text-xs px-4 py-2.5 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{globalError}</span>
          </div>
          <button
            onClick={() => setGlobalError(null)}
            className="text-xs font-bold text-rose-900 hover:underline shrink-0 ml-2"
          >
            Kapat
          </button>
        </div>
      )}

      {/* App Main Shell Container (Mobile-first, max-w-lg for comfortable smartphone reading) */}
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col px-3 sm:px-4 pt-3 pb-24">
        {/* Top Header */}
        <header className="flex items-center justify-between py-2.5 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <span className="text-lg">🥤</span>
            </div>
            <div>
              <h1 className="text-base font-black text-stone-900 tracking-tight leading-none">
                NutriShake
              </h1>
              <p className="text-[11px] font-semibold text-emerald-700 capitalize mt-0.5">
                {formattedTodayDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
              {nutritionSummary.remainingCalories} kcal kaldı
            </div>
          </div>
        </header>

        {/* PWA Install Banner */}
        <PWAInstallBanner />

        {/* View Switcher */}
        <main className="flex-1">
          {profile ? (
            <>
              {activeTab === 'today' && (
                <TodayView
                  profile={profile}
                  plan={dailyPlan}
                  meals={todayMeals}
                  nutritionSummary={nutritionSummary}
                  onNavigateToPlan={() => setActiveTab('plan')}
                  onRefreshData={handleRefreshData}
                  onRequestGeneratePlan={handleGeneratePlan}
                  isGeneratingPlan={isGeneratingPlan}
                />
              )}

              {activeTab === 'plan' && (
                <PlanView
                  profile={profile}
                  plan={dailyPlan}
                  nutritionSummary={nutritionSummary}
                  onRequestGeneratePlan={handleGeneratePlan}
                  isGeneratingPlan={isGeneratingPlan}
                  onRefreshData={handleRefreshData}
                  ingredientStates={ingredientStates}
                  userPreferences={activePreferenceNotes}
                />
              )}

              {activeTab === 'ingredients' && (
                <IngredientsView
                  ingredientStates={ingredientStates}
                  onUpdateStates={(newStates) => {
                    setIngredientStates(newStates);
                  }}
                />
              )}

              {activeTab === 'history' && (
                <HistoryView
                  profile={profile}
                  onRefreshData={handleRefreshData}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  profile={profile}
                  onUpdateProfile={(updated) => {
                    setProfile(updated);
                    handleRefreshData();
                  }}
                  onRefreshData={handleRefreshData}
                  onResetAppToOnboarding={() => {
                    setProfile(null);
                    setDailyPlan(null);
                    setAllMeals([]);
                  }}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center py-12 text-stone-400 text-xs">
              Profil kurulumu bekleniyor...
            </div>
          )}
        </main>
      </div>

      {/* Bottom Navigation Bar (Fixed with Safe Area Inset Padding) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/80 shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}
      >
        <div className="w-full max-w-lg mx-auto flex items-center justify-around px-2 py-1.5">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
              activeTab === 'today'
                ? 'text-emerald-700 font-bold'
                : 'text-stone-500 font-medium hover:text-stone-800'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Bugün</span>
          </button>

          <button
            onClick={() => setActiveTab('plan')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
              activeTab === 'plan'
                ? 'text-emerald-700 font-bold'
                : 'text-stone-500 font-medium hover:text-stone-800'
            }`}
          >
            <Sparkles className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Plan</span>
          </button>

          <button
            onClick={() => setActiveTab('ingredients')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
              activeTab === 'ingredients'
                ? 'text-emerald-700 font-bold'
                : 'text-stone-500 font-medium hover:text-stone-800'
            }`}
          >
            <Layers className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Malzemeler</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
              activeTab === 'history'
                ? 'text-emerald-700 font-bold'
                : 'text-stone-500 font-medium hover:text-stone-800'
            }`}
          >
            <History className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Geçmiş</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
              activeTab === 'settings'
                ? 'text-emerald-700 font-bold'
                : 'text-stone-500 font-medium hover:text-stone-800'
            }`}
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Ayarlar</span>
          </button>
        </div>
      </nav>

      {/* Onboarding Modal (Opens if user profile is null on clean initial launch) */}
      {!profile && (
        <OnboardingModal
          onComplete={(newProfile) => {
            setProfile(newProfile);
          }}
          onNavigateToIngredients={() => {
            setActiveTab('ingredients');
          }}
        />
      )}
    </div>
  );
}
