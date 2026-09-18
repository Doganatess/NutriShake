import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Flame,
  AlertCircle,
  Sliders,
  Calendar,
  Plus,
} from 'lucide-react';
import {
  DailyPlan,
  DailyNutritionSummary,
  Shake,
  UserProfile,
  ShakeRating,
} from '../types';
import { ShakeCard } from '../components/ShakeCard';
import { RecipeBuilder } from '../components/RecipeBuilder';
import {
  saveDailyPlan,
  toggleFavoriteShake,
  addDislikedShake,
  savePreference,
  updateShakeRating,
  saveMemory,
} from '../store/storage';
import { replaceShakeApi } from '../services/apiClient';
import { deductRecipeStock, consumeStockForPortion, revertStockForPortion } from '../engines/stockEngine';
import { composeDeterministicShake, hasDairyInStock } from '../engines/recipeCompositionEngine';
import { getStoredStock } from '../storage/storageAbstraction';
import { calculateOptimalDailyShakeKcal } from '../engines/planningEngine';
import { calculateShakeNutrition } from '../utils/nutritionEngine';
import { validateMasterRecipe } from '../utils/recipeValidator';

interface PlanViewProps {
  profile: UserProfile;
  plan: DailyPlan | null;
  nutritionSummary: DailyNutritionSummary;
  onRequestGeneratePlan: () => void;
  isGeneratingPlan: boolean;
  onRefreshData: () => void;
  ingredientStates: Record<string, string>;
  userPreferences: string[];
}

export const PlanView: React.FC<PlanViewProps> = ({
  profile,
  plan,
  nutritionSummary,
  onRequestGeneratePlan,
  isGeneratingPlan,
  onRefreshData,
  ingredientStates,
  userPreferences,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'builder'>('plan');
  const [replacingShakeId, setReplacingShakeId] = useState<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const completedCount = plan?.shakes.filter((s) => s.isCompleted).length || 0;
  const totalCount = plan?.shakes.length || 0;

  // Toggle Completed
  const handleToggleComplete = (shakeId: string) => {
    if (!plan) return;
    const updatedShakes = plan.shakes.map((s) => {
      if (s.id === shakeId) {
        const nextState = !s.isCompleted;

        // If completing, deduct ingredients from pantry stock
        if (nextState) {
          deductRecipeStock(
            s.ingredients.map((item) => ({
              ingredientId: item.ingredientId,
              amount: item.amount || (item.quantity ? item.quantity : 0),
            })),
            `Shake tüketildi: ${s.name}`
          );
        }

        return {
          ...s,
          isCompleted: nextState,
          completedAt: nextState ? new Date().toISOString() : undefined,
        };
      }
      return s;
    });

    const updatedPlan: DailyPlan = {
      ...plan,
      shakes: updatedShakes,
      updatedAt: new Date().toISOString(),
    };

    saveDailyPlan(updatedPlan);
    onRefreshData();
  };

  // Toggle Portion (1. Öğün or 2. Öğün)
  const handleTogglePortion = (shakeId: string, portionNumber: 1 | 2) => {
    if (!plan) return;
    const targetShake = plan.shakes.find((s) => s.id === shakeId);
    if (!targetShake) return;

    const isCurrentDone =
      portionNumber === 1 ? !!targetShake.portion1Completed : !!targetShake.portion2Completed;
    const nextState = !isCurrentDone;

    if (nextState) {
      consumeStockForPortion(targetShake, portionNumber);
    } else {
      revertStockForPortion(targetShake, portionNumber);
    }

    const updatedShakes = plan.shakes.map((s) => {
      if (s.id === shakeId) {
        const p1 = portionNumber === 1 ? nextState : !!s.portion1Completed;
        const p2 = portionNumber === 2 ? nextState : !!s.portion2Completed;
        const fullyDone = p1 && p2;
        return {
          ...s,
          portion1Completed: p1,
          portion2Completed: p2,
          isCompleted: fullyDone,
          completedAt: fullyDone ? new Date().toISOString() : undefined,
        };
      }
      return s;
    });

    const updatedDailyShake = plan.dailyShake
      ? {
          ...plan.dailyShake,
          portions: [
            {
              ...plan.dailyShake.portions[0],
              isCompleted:
                portionNumber === 1 ? nextState : !!plan.dailyShake.portions[0]?.isCompleted,
            },
            {
              ...plan.dailyShake.portions[1],
              isCompleted:
                portionNumber === 2 ? nextState : !!plan.dailyShake.portions[1]?.isCompleted,
            },
          ] as [typeof plan.dailyShake.portions[0], typeof plan.dailyShake.portions[1]],
        }
      : undefined;

    const completedCalories = updatedShakes.reduce((sum, s) => {
      let cal = 0;
      const portionCal = s.portionCalories || Math.round(s.estimatedCalories / 2);
      if (s.portion1Completed) cal += portionCal;
      if (s.portion2Completed) cal += portionCal;
      return sum + cal;
    }, 0);

    const updatedPlan: DailyPlan = {
      ...plan,
      shakes: updatedShakes,
      dailyShake: updatedDailyShake,
      completedCalories,
      isFullyCompleted: updatedShakes.every((s) => s.isCompleted),
      updatedAt: new Date().toISOString(),
    };

    saveDailyPlan(updatedPlan);
    onRefreshData();
  };

  // Toggle Favorite
  const handleToggleFavorite = (shake: Shake) => {
    toggleFavoriteShake(shake);
    if (plan) {
      const updatedShakes = plan.shakes.map((s) =>
        s.id === shake.id ? { ...s, isFavorite: !s.isFavorite } : s
      );
      saveDailyPlan({ ...plan, shakes: updatedShakes });
    }
    onRefreshData();
  };

  // Dislike Shake -> Add to memory
  const handleDislikeShake = (shake: Shake, reason?: string) => {
    addDislikedShake(shake);

    savePreference({
      id: `pref_${Date.now()}`,
      type: 'dislike',
      note: `"${shake.name}" tarifi beğenilmedi (${reason || 'Genel'}). Benzer kombinasyonları tercih etmiyorum.`,
      active: true,
      createdAt: new Date().toISOString(),
    });

    saveMemory({
      id: `mem_dislike_${Date.now()}`,
      type: 'shake_dislike',
      text: `"${shake.name}" tarifi beğenilmedi: ${reason || 'Tad/kıvam uyumsuzluğu'}`,
      impact: 'negative',
      sourceShakeId: shake.id,
      createdAt: new Date().toISOString(),
    });

    if (plan) {
      const updatedShakes = plan.shakes.map((s) =>
        s.id === shake.id ? { ...s, isDisliked: true } : s
      );
      saveDailyPlan({ ...plan, shakes: updatedShakes });
    }

    onRefreshData();
  };

  // Rate Shake (Requirement 24)
  const handleRateShake = (shake: Shake, rating: ShakeRating) => {
    if (!plan) return;
    updateShakeRating(plan.date, shake.id, rating);

    // Save memory if very positive or negative
    if (rating === 'love') {
      saveMemory({
        id: `mem_love_${Date.now()}`,
        type: 'shake_rating',
        text: `Kullanıcı "${shake.name}" tarifini çok beğendi (❤️ Çok iyi).`,
        impact: 'positive',
        sourceShakeId: shake.id,
        createdAt: new Date().toISOString(),
      });
    }

    onRefreshData();
  };

  // Update Shake locally (Deterministic editing, no AI call needed)
  const handleUpdateShake = (updatedShake: Shake) => {
    if (!plan) return;
    const updatedShakes = plan.shakes.map((s) => (s.id === updatedShake.id ? updatedShake : s));
    const updatedPlan: DailyPlan = {
      ...plan,
      shakes: updatedShakes,
      updatedAt: new Date().toISOString(),
    };
    saveDailyPlan(updatedPlan);
    onRefreshData();
  };

  // Add Custom Shake to Plan (from Recipe Builder)
  const handleAddCustomShakeToPlan = (newShake: Shake) => {
    if (plan) {
      const updatedPlan: DailyPlan = {
        ...plan,
        shakes: [...plan.shakes, newShake],
        updatedAt: new Date().toISOString(),
      };
      saveDailyPlan(updatedPlan);
    } else {
      const newPlan: DailyPlan = {
        id: `plan_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        title: 'Kişisel Shake Planı',
        targetCalories: newShake.estimatedCalories,
        shakes: [newShake],
        notes: 'Özel oluşturulan tarifinizle başlatılan günlük plan.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveDailyPlan(newPlan);
    }
    setActiveTab('plan');
    onRefreshData();
  };

  // Replace Single Shake (Preserves all other shakes & synchronizes dailyShake for Today view)
  const handleReplaceSingleShake = async (shake: Shake) => {
    if (!plan) return;

    // FIX (race condition): only one "Değiştir" (replace) can run at a time. Without
    // this, clicking replace on two different shakes back-to-back could let both writes
    // finish out of order — the second saveDailyPlan() would overwrite the plan based on
    // a stale snapshot from before the first replace landed, silently losing it.
    if (replacingShakeId !== null) return;

    setReplacingShakeId(shake.id);
    setReplaceError(null);

    // Consistency check: At least one allowed dairy in stock
    const stock = getStoredStock();
    if (!hasDairyInStock(stock)) {
      setReplaceError('Kıvam ve besin dengesi için kilerinizde en az bir süt ürünü (Tam Yağlı Süt, Yarım Yağlı Süt, Köy Yoğurdu veya Süzme Yoğurt) bulunmalıdır.');
      setReplacingShakeId(null);
      return;
    }

    try {
      const mandatoryIds = Object.entries(ingredientStates)
        .filter(([_, state]) => state === 'mandatory')
        .map(([id]) => id);

      const allowedIds = Object.entries(ingredientStates)
        .filter(([_, state]) => state === 'allowed')
        .map(([id]) => id);

      const forbiddenIds: string[] = [];

      const otherShakes = plan.shakes
        .filter((s) => s.id !== shake.id)
        .map((s) => s.name);

      // FIX: Previously this anchored the replacement's target to the OLD shake's own
      // estimatedCalories whenever it was > 600 kcal. If a shake had ever been generated
      // too low (e.g. 900 kcal), every subsequent "replace" would target ~900 kcal again,
      // permanently perpetuating a low-calorie result. The replacement target must always
      // be the app's fixed daily target (currently 3200 kcal, floored at 2500).
      const targetKcal = calculateOptimalDailyShakeKcal(profile);

      let newShake: Shake;

      try {
        newShake = await replaceShakeApi({
          targetKcal,
          currentShakeName: shake.name,
          portionPreference: profile.portionPreference,
          mandatoryIngredientIds: mandatoryIds,
          allowedIngredientIds: allowedIds,
          forbiddenIngredientIds: forbiddenIds,
          otherShakesNames: otherShakes,
          userPreferences,
          dislikedShakeNames: [shake.name],
          userStock: stock,
        });
      } catch (apiErr) {
        console.warn('AI replace failed or offline, using deterministic composition engine:', apiErr);
        // Deterministic fallback: Generate distinct recipe using available stock
        newShake = composeDeterministicShake({
          targetCalories: targetKcal,
          timing: shake.timing || 'morning',
          stockOnly: true,
          userProfile: profile,
          excludedIngredientIds: shake.ingredients.map((i) => i.ingredientId),
          recentShakes: [shake],
          excludedShakeNames: [shake.name],
        });
      }

      // Re-calculate nutrition and validate
      const nutrition = calculateShakeNutrition(newShake.ingredients);
      newShake.estimatedCalories = nutrition.calories;
      newShake.protein = nutrition.protein;
      newShake.carbs = nutrition.carbs;
      newShake.fat = nutrition.fat;
      newShake.fiber = nutrition.fiber;

      // Enforce 2 equal portions
      const portionCalories = Math.round(newShake.estimatedCalories / 2);
      const portionProtein = Math.round((newShake.protein / 2) * 10) / 10;
      const portionCarbs = Math.round((newShake.carbs / 2) * 10) / 10;
      const portionFat = Math.round((newShake.fat / 2) * 10) / 10;

      newShake.portionCount = 2;
      newShake.portionCalories = portionCalories;
      newShake.portionProtein = portionProtein;
      newShake.portionCarbs = portionCarbs;
      newShake.portionFat = portionFat;
      newShake.portion1Completed = false;
      newShake.portion2Completed = false;
      newShake.isCompleted = false;

      // Validate recipe against all 12 master rules (dairy, kefir, fruit limit, duplicates, etc.)
      // The result is now actually checked — an invalid replacement is rejected instead of silently accepted.
      const validation = validateMasterRecipe(newShake, {
        targetKcal,
        userStock: stock,
      });
      if (!validation.isValid) {
        throw new Error(validation.errors[0] || 'Yeni tarif geçerlilik kurallarını sağlamadı.');
      }

      const updatedShakes = plan.shakes.map((s) => (s.id === shake.id ? newShake : s));

      // Update both plan.shakes and plan.dailyShake so TodayView and PlanView are synchronized
      const updatedPlan: DailyPlan = {
        ...plan,
        shakes: updatedShakes,
        dailyShake: {
          id: newShake.id,
          name: newShake.name,
          recipeId: newShake.id,
          recipeName: newShake.name,
          ingredients: newShake.ingredients,
          totalNutrition: {
            calories: newShake.estimatedCalories,
            protein: newShake.protein,
            carbs: newShake.carbs,
            fat: newShake.fat,
            fiber: newShake.fiber,
          },
          portionNutrition: {
            calories: portionCalories,
            protein: portionProtein,
            carbs: portionCarbs,
            fat: portionFat,
            fiber: Math.round((newShake.fiber / 2) * 10) / 10,
          },
          portionCount: 2,
          portions: [
            { portionNumber: 1, name: '1. Öğün', calories: portionCalories, isCompleted: false },
            { portionNumber: 2, name: '2. Öğün', calories: portionCalories, isCompleted: false },
          ],
          portion1Completed: false,
          portion2Completed: false,
          isCompleted: false,
          instructions: newShake.instructions,
          preparationTimeMinutes: newShake.preparationTimeMinutes,
          whyChosenReasons: newShake.whyChosenReasons,
        },
        updatedAt: new Date().toISOString(),
      };

      saveDailyPlan(updatedPlan);
      onRefreshData();
    } catch (err: unknown) {
      console.error('Failed to replace shake:', err);
      const msg = err instanceof Error ? err.message : 'Shake değiştirilemedi.';
      setReplaceError(msg);
      // Existing shake is strictly preserved
    } finally {
      setReplacingShakeId(null);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Sub-tab Switcher */}
      <div className="flex bg-stone-100 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('plan')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'plan'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          <span>Günün Planı ({totalCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('builder')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'builder'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-emerald-600" />
          <span>Kendi Shake'ini Tasarla</span>
        </button>
      </div>

      {activeTab === 'builder' ? (
        <RecipeBuilder
          remainingKcal={nutritionSummary.remainingCalories}
          portionPreference={profile.portionPreference}
          onAddShakeToPlan={handleAddCustomShakeToPlan}
        />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Günlük Shake Planı
              </span>
              <span className="text-[11px] text-stone-300">
                1 Shake (2 Eşit Porsiyon) •{' '}
                {profile.portionPreference === 'small'
                  ? 'Küçük'
                  : profile.portionPreference === 'large'
                  ? 'Büyük'
                  : 'Orta'}{' '}
                Porsiyon
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              {plan ? plan.title : 'Bugün Henüz Plan Oluşturulmadı'}
            </h2>

            {plan?.notes && (
              <p className="text-xs text-stone-300 mt-1 leading-relaxed">{plan.notes}</p>
            )}

            {/* Status Bar */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-stone-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-stone-400">Durum:</span>
                <span className="font-bold text-white">
                  {completedCount} / {totalCount} Tamamlandı
                </span>
              </div>

              <div className="flex items-center gap-1 text-emerald-400 font-medium">
                <Flame className="w-3.5 h-3.5" />
                <span>Kalan İhtiyaç: ~{nutritionSummary.remainingCalories} kcal</span>
              </div>
            </div>
          </div>

          {replaceError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{replaceError}</span>
            </div>
          )}

          {/* Plan Content */}
          {!plan ? (
            /* Empty State */
            <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center shadow-xs">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-stone-900">
                Bugün İçin Shake Planı Hazırlanmadı
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1 mb-5 leading-relaxed">
                Günlük hedefinize ({profile.calorieGoal} kcal), aldığınız öğünlere ve seçtiğiniz
                malzemelere göre bugünkü shake planınızı yapay zeka hemen oluştursun.
              </p>
              <button
                disabled={isGeneratingPlan}
                onClick={onRequestGeneratePlan}
                className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 mx-auto shadow-sm active:scale-98 transition disabled:opacity-60"
              >
                <Sparkles className={`w-4 h-4 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
                {isGeneratingPlan ? 'Yapay Zeka Hazırlıyor...' : 'Bugünün Kalanını Planla'}
              </button>
            </div>
          ) : (
            /* Shake Cards List */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-stone-600 px-1">
                <span className="font-semibold">
                  {plan.selectedShakeId
                    ? 'Bugün İçin Seçilen Shake'
                    : `Günün Tarifleri (${plan.shakes.length} Farklı Seçenek)`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('builder')}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Özel Shake Ekle
                  </button>
                  <span className="text-stone-300">•</span>
                  <button
                    disabled={isGeneratingPlan}
                    onClick={onRequestGeneratePlan}
                    className="text-stone-500 hover:text-stone-800 font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
                    Yeniden Planla
                  </button>
                </div>
              </div>

              {/* FIX: previously checked plan.shakes.length (which is now pruned down to 1
                  once the user selects a shake in "Bugün"), so this pantry-limitation
                  warning incorrectly reappeared after every selection. Now checks the
                  original candidate count instead. */}
              {!plan.selectedShakeId && (plan.candidateShakes?.length ?? plan.shakes.length) < 3 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Kiler stoğunuzdaki çeşitlilik nedeniyle {plan.candidateShakes?.length ?? plan.shakes.length} geçerli tarif üretildi. Stok dışı uydurma malzeme eklenmemiştir.
                  </span>
                </div>
              )}

              {plan.shakes.map((shake, idx) => (
                <ShakeCard
                  key={shake.id}
                  shake={shake}
                  index={idx}
                  onToggleComplete={handleToggleComplete}
                  onTogglePortion={handleTogglePortion}
                  onToggleFavorite={handleToggleFavorite}
                  onDislikeShake={handleDislikeShake}
                  onReplaceShake={handleReplaceSingleShake}
                  onUpdateShake={handleUpdateShake}
                  onRateShake={handleRateShake}
                  isReplacing={replacingShakeId === shake.id}
                />
              ))}
            </div>
          )}

          {/* Shake Tips */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3 text-[11px] text-emerald-950 flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-700 mt-0.5" />
            <p className="leading-relaxed">
              <strong>İpucu:</strong> Bir shake'in tadı veya malzemesi hoşunuza gitmediyse kartın
              altındaki <strong className="text-stone-900">Değiştir</strong> butonuna dokunarak
              günün diğer tariflerini bozmadan yalnızca o shake için taze bir alternatif
              oluşturabilirsiniz.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
