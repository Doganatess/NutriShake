import React, { useState } from 'react';
import {
  Camera,
  Sparkles,
  Flame,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trash2,
  Utensils,
  HelpCircle,
  Info,
  AlertCircle,
} from 'lucide-react';
import {
  UserProfile,
  DailyPlan,
  MealAnalysis,
  DailyNutritionSummary,
  Shake,
} from '../types';
import { MealAnalysisModal } from '../components/MealAnalysisModal';
import { removeMealPhotoOnly, deleteMeal, saveDailyPlan } from '../store/storage';
import { consumeStockForPortion, revertStockForPortion } from '../engines/stockEngine';
import { INGREDIENT_MAP } from '../data/ingredients';

interface TodayViewProps {
  profile: UserProfile;
  plan: DailyPlan | null;
  meals: MealAnalysis[];
  nutritionSummary: DailyNutritionSummary;
  onNavigateToPlan: () => void;
  onRefreshData: () => void;
  onRequestGeneratePlan: () => void;
  isGeneratingPlan: boolean;
}

export const TodayView: React.FC<TodayViewProps> = ({
  profile,
  plan,
  meals,
  nutritionSummary,
  onNavigateToPlan,
  onRefreshData,
  onRequestGeneratePlan,
  isGeneratingPlan,
}) => {
  const [showMealModal, setShowMealModal] = useState<boolean>(false);
  const [activePhotoModal, setActivePhotoModal] = useState<string | null>(null);
  const [stockFeedback, setStockFeedback] = useState<string | null>(null);

  const caloriePercentage = Math.min(
    100,
    Math.round((nutritionSummary.consumedCalories / (nutritionSummary.calorieGoal || 1)) * 100)
  );

  const proteinPercentage = Math.min(
    100,
    Math.round((nutritionSummary.consumedProtein / (nutritionSummary.proteinGoal || 1)) * 100)
  );

  // Master shake for the day (1 Shake = 2 Equal Portions)
  const masterShake: Shake | null = plan?.shakes && plan.shakes.length > 0 ? plan.shakes[0] : null;

  const plannedShakeCalories = masterShake ? masterShake.estimatedCalories : (profile.dailySurplusKcal || 1000);
  const portion1Calories = masterShake
    ? (masterShake.portionCalories || Math.round(masterShake.estimatedCalories / 2))
    : Math.round(plannedShakeCalories / 2);
  const portion2Calories = masterShake
    ? (masterShake.portionCalories || Math.round(masterShake.estimatedCalories / 2))
    : Math.round(plannedShakeCalories / 2);

  const isPortion1Done = masterShake ? !!masterShake.portion1Completed : false;
  const isPortion2Done = masterShake ? !!masterShake.portion2Completed : false;
  const completedPortionsCount = (isPortion1Done ? 1 : 0) + (isPortion2Done ? 1 : 0);

  const handleDeleteMeal = (id: string) => {
    deleteMeal(id);
    onRefreshData();
  };

  const handleRemovePhoto = (id: string) => {
    removeMealPhotoOnly(id);
    onRefreshData();
  };

  // Toggle Portion 1 or Portion 2 (Deducts or Reverts 50% stock for specific shake)
  const handleTogglePortion = (shakeId: string, portionNumber: 1 | 2) => {
    if (!plan) return;
    const targetShake = plan.shakes.find((s) => s.id === shakeId);
    if (!targetShake) return;

    const isCurrentDone =
      portionNumber === 1 ? !!targetShake.portion1Completed : !!targetShake.portion2Completed;
    const nextState = !isCurrentDone;

    if (nextState) {
      const result = consumeStockForPortion(targetShake, portionNumber);
      if (!result.success && result.error) {
        setStockFeedback(result.error);
        return;
      }
      setStockFeedback(`${targetShake.name} (${portionNumber}. Öğün) içildi! %50 malzeme stoktan düşüldü.`);
    } else {
      revertStockForPortion(targetShake, portionNumber);
      setStockFeedback(`${targetShake.name} (${portionNumber}. Öğün) geri alındı. %50 malzeme stoğa iade edildi.`);
    }

    setTimeout(() => setStockFeedback(null), 4000);

    const updatedShakes = plan.shakes.map((s) => {
      if (s.id === shakeId) {
        const p1Done = portionNumber === 1 ? nextState : !!s.portion1Completed;
        const p2Done = portionNumber === 2 ? nextState : !!s.portion2Completed;
        const fullyCompleted = p1Done && p2Done;
        return {
          ...s,
          portion1Completed: p1Done,
          portion2Completed: p2Done,
          isCompleted: fullyCompleted,
          completedAt: fullyCompleted ? new Date().toISOString() : undefined,
        };
      }
      return s;
    });

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
      completedCalories,
      isFullyCompleted: updatedShakes.every((s) => s.isCompleted),
      updatedAt: new Date().toISOString(),
    };

    saveDailyPlan(updatedPlan);
    onRefreshData();
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Stock transaction feedback toast */}
      {stockFeedback && (
        <div className="bg-emerald-800 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-between sticky top-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{stockFeedback}</span>
          </div>
          <button
            onClick={() => setStockFeedback(null)}
            className="text-[11px] underline text-emerald-200 ml-2"
          >
            Tamam
          </button>
        </div>
      )}

      {/* 1. Daily Calorie & Nutrition Progress Card */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
          <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-emerald-400" />
            Bugünün Beslenme Dengesi
          </span>
          <span className="text-[11px] text-stone-400">
            Hedef: <strong className="text-white">{nutritionSummary.calorieGoal}</strong> kcal
          </span>
        </div>

        {/* Big numbers */}
        <div className="flex items-baseline justify-between my-3">
          <div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {nutritionSummary.consumedCalories}
              <span className="text-sm font-medium text-stone-400 ml-1">kcal alındı</span>
            </div>
            <div className="text-xs text-stone-300 mt-0.5">
              Geriye Kalan: <strong className="text-emerald-400 font-bold">{nutritionSummary.remainingCalories} kcal</strong>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              %{caloriePercentage}
            </div>
            <div className="text-[11px] text-stone-400">Hedef Tamamlandı</div>
          </div>
        </div>

        {/* Calorie Progress Bar */}
        <div className="w-full bg-stone-800 h-2.5 rounded-full overflow-hidden my-3">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${caloriePercentage}%` }}
          />
        </div>

        {/* 3 Separate Nutrition Indicators (Ana Öğün vs Shake) */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-stone-800 text-center">
          <div className="bg-stone-800/60 rounded-2xl p-2.5 border border-stone-700/50">
            <div className="text-[10px] uppercase font-bold text-emerald-400">🥤 Günün Shake'i</div>
            <div className="text-sm font-black text-emerald-300 mt-0.5">
              {nutritionSummary.consumedShakeCalories} / {plannedShakeCalories}
              <span className="text-[10px] font-normal text-stone-400 ml-0.5">kcal</span>
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5 font-medium">
              {completedPortionsCount}/2 Porsiyon
            </div>
          </div>

          <div className="bg-stone-800/60 rounded-2xl p-2.5 border border-stone-700/50">
            <div className="text-[10px] uppercase font-bold text-amber-400">🍽️ Ana Öğünler</div>
            <div className="text-sm font-black text-amber-300 mt-0.5">
              {nutritionSummary.analyzedMealCalories}
              <span className="text-[10px] font-normal text-stone-400 ml-0.5">kcal</span>
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5 font-medium">
              {meals.length} Öğün Alındı
            </div>
          </div>

          <div className="bg-stone-800/60 rounded-2xl p-2.5 border border-stone-700/50">
            <div className="text-[10px] uppercase font-bold text-stone-300">📊 Toplam Kalori</div>
            <div className="text-sm font-black text-white mt-0.5">
              {nutritionSummary.consumedCalories}
              <span className="text-[10px] font-normal text-stone-400 ml-0.5">kcal</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
              +5 kg/ay hedef
            </div>
          </div>
        </div>

        {/* Macro summary */}
        <div className="mt-3 pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-stone-400">Protein:</span>
            <span className="font-bold text-white">
              {nutritionSummary.consumedProtein} / {nutritionSummary.proteinGoal}g
            </span>
          </div>
          <div className="w-24 bg-stone-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all"
              style={{ width: `${proteinPercentage}%` }}
            />
          </div>
          <div className="text-stone-400 text-[11px]">
            K: <strong className="text-white font-medium">{nutritionSummary.consumedCarbs}g</strong> • Y:{' '}
            <strong className="text-white font-medium">{nutritionSummary.consumedFat}g</strong>
          </div>
        </div>
      </div>

      {/* 2. Primary Action Buttons (Analyze Meal & Shake Plan) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Photo Meal Analysis CTA */}
        <button
          onClick={() => setShowMealModal(true)}
          className="flex items-center gap-3.5 p-4 rounded-3xl bg-white border border-stone-200 hover:border-emerald-300 transition shadow-xs text-left active:scale-98 group"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition">
            <Camera className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                Vision AI
              </span>
            </div>
            <h3 className="text-sm font-bold text-stone-900 leading-tight">
              Öğünümü Fotoğrafla Analiz Et
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5 truncate">
              Tabağınızın fotoğrafını çekin, kalori ve makroları otomatik ekleyin
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-400 shrink-0" />
        </button>

        {/* Shake Plan Status / Action CTA */}
        {plan && plan.shakes && plan.shakes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={onNavigateToPlan}
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-emerald-50/60 border border-emerald-200 hover:border-emerald-300 transition shadow-xs text-left active:scale-98 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                  Günün Shake Planı
                </span>
                <h3 className="text-sm font-bold text-stone-900 leading-tight">
                  {plan.shakes.length} Farklı Shake Hazırlandı
                </h3>
                <p className="text-[11px] text-stone-600 mt-0.5 truncate">
                  {plan.shakes.map((s) => s.name).join(' • ')}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-700 shrink-0" />
            </button>
            <button
              disabled={isGeneratingPlan}
              onClick={onRequestGeneratePlan}
              className="w-full py-2 px-3 rounded-2xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 text-emerald-600 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
              <span>{isGeneratingPlan ? 'Yeniden Planlanıyor...' : 'Günün Shake Tariflerini Yenile'}</span>
            </button>
          </div>
        ) : (
          <button
            disabled={isGeneratingPlan}
            onClick={onRequestGeneratePlan}
            className="flex items-center gap-3.5 p-4 rounded-3xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs text-left active:scale-98 group disabled:opacity-60"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/20 text-white flex items-center justify-center shrink-0">
              <Sparkles className={`w-6 h-6 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-wide">
                Günün Shake Planı
              </span>
              <h3 className="text-sm font-bold text-white leading-tight">
                {isGeneratingPlan ? 'Plan Hazırlanıyor...' : 'Günün Shakesini Oluştur (3 Farklı Seçenek)'}
              </h3>
              <p className="text-[11px] text-emerald-100 mt-0.5 truncate">
                3 farklı tarif • Kiler stoğuna tam uyumlu • 2 eşit porsiyon
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/70 shrink-0" />
          </button>
        )}
      </div>

      {/* 3. Günün Shake Tarifleri (Kiler stoğuna uygun üretilen tüm geçerli tarifler) */}
      {plan && plan.shakes && plan.shakes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">
                🥤
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Günün Shake Tarifleri ({plan.shakes.length} Farklı Seçenek)
              </h3>
            </div>
            <button
              onClick={onNavigateToPlan}
              className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1"
            >
              Tüm Detaylar & Değiştir <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {plan.shakes.length < 3 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Kiler stoğunuzdaki çeşitlilik nedeniyle {plan.shakes.length} geçerli tarif üretildi. Stok dışı uydurma malzeme eklenmemiştir.
              </span>
            </div>
          )}

          {plan.shakes.map((shake, shakeIdx) => {
            const portionCal = shake.portionCalories || Math.round(shake.estimatedCalories / 2);
            const p1Done = !!shake.portion1Completed;
            const p2Done = !!shake.portion2Completed;

            return (
              <div key={shake.id || shakeIdx} className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-xs">
                {/* Shake Title & Macro Summary */}
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100 mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-200 text-stone-700">
                          Shake {shakeIdx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-stone-900">{shake.name}</h4>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1">
                        Toplam {shake.estimatedCalories} kcal • {shake.protein}g Protein • {shake.carbs}g Karb • {shake.fat}g Yağ
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                      2 Eşit Porsiyon
                    </span>
                  </div>

                  {/* Ingredients overview */}
                  <div className="mt-2.5 pt-2 border-t border-stone-200/60 flex flex-wrap gap-1.5">
                    {shake.ingredients.map((ingItem, idx) => {
                      const ing = INGREDIENT_MAP[ingItem.ingredientId];
                      return (
                        <span
                          key={idx}
                          className="text-[11px] bg-white px-2 py-0.5 rounded-lg border border-stone-200 text-stone-700 flex items-center gap-1 font-medium"
                        >
                          <span>{ing?.icon || '🥣'}</span>
                          <span>{ing?.name || ingItem.ingredientId}</span>
                          <span className="text-stone-400 font-bold">({ingItem.amount}g)</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* 1. Öğün & 2. Öğün Action Cards (Portion Controls) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 1. Öğün */}
                  <div
                    className={`p-3.5 rounded-2xl border transition flex flex-col justify-between ${
                      p1Done ? 'bg-emerald-50/60 border-emerald-300' : 'bg-stone-50 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            p1Done ? 'bg-emerald-600 text-white' : 'bg-stone-300 text-stone-700'
                          }`}
                        >
                          {p1Done ? '✓' : '1'}
                        </span>
                        1. Öğün (1. Porsiyon)
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p1Done ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {p1Done ? 'İçildi ✓' : 'İçilmedi'}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mb-3">
                      <strong className="text-stone-800 font-bold">{portionCal} kcal</strong> • Tarifin %50'si
                    </div>
                    <button
                      onClick={() => handleTogglePortion(shake.id, 1)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 border ${
                        p1Done
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white border-stone-300 text-stone-800 hover:border-emerald-400 hover:text-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${p1Done ? 'text-white' : 'text-stone-400'}`} />
                      <span>{p1Done ? 'İçildi (Geri Al)' : '✓ 1. Öğünü İçtim'}</span>
                    </button>
                  </div>

                  {/* 2. Öğün */}
                  <div
                    className={`p-3.5 rounded-2xl border transition flex flex-col justify-between ${
                      p2Done ? 'bg-emerald-50/60 border-emerald-300' : 'bg-stone-50 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            p2Done ? 'bg-emerald-600 text-white' : 'bg-stone-300 text-stone-700'
                          }`}
                        >
                          {p2Done ? '✓' : '2'}
                        </span>
                        2. Öğün (2. Porsiyon)
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p2Done ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {p2Done ? 'İçildi ✓' : 'İçilmedi'}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mb-3">
                      <strong className="text-stone-800 font-bold">{portionCal} kcal</strong> • Tarifin %50'si
                    </div>
                    <button
                      onClick={() => handleTogglePortion(shake.id, 2)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 border ${
                        p2Done
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white border-stone-300 text-stone-800 hover:border-emerald-400 hover:text-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${p2Done ? 'text-white' : 'text-stone-400'}`} />
                      <span>{p2Done ? 'İçildi (Geri Al)' : '✓ 2. Öğünü İçtim'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Today's Logged Meals (Ayrı Ana Öğün Takibi) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Bugün Alınan Ana Öğünler ({meals.length})
            </h3>
          </div>
          <button
            onClick={() => setShowMealModal(true)}
            className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Öğün Ekle
          </button>
        </div>

        <p className="text-[11px] text-stone-500 mb-3">
          💡 Ana öğünleriniz shake planından bağımsız kaydedilir ve shake tarifinin kalorisini düşürmez.
        </p>

        {meals.length === 0 ? (
          <div className="text-center py-6 px-4 bg-stone-50/60 rounded-2xl border border-dashed border-stone-200">
            <Utensils className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-stone-700">Henüz bir ana öğün kaydetmediniz</p>
            <p className="text-[11px] text-stone-500 mt-1 max-w-xs mx-auto">
              Yediğiniz yemeklerin fotoğrafını çekerek veya manuel ekleyerek kalori hedefinizi güncel tutun.
            </p>
            <button
              onClick={() => setShowMealModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
            >
              <Camera className="w-3.5 h-3.5" />
              İlk Öğününü Ekle
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {meal.photoBase64 ? (
                    <div
                      onClick={() => setActivePhotoModal(meal.photoBase64 || null)}
                      className="w-14 h-14 rounded-xl overflow-hidden bg-stone-200 shrink-0 cursor-pointer border border-stone-200 relative group"
                      title="Büyütmek için dokunun"
                    >
                      <img
                        src={meal.photoBase64}
                        alt={meal.mealName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-stone-900/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px]">
                        Büyüt
                      </div>
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-stone-200/80 text-stone-500 flex items-center justify-center shrink-0">
                      <Utensils className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        {meal.mealType === 'breakfast'
                          ? 'Kahvaltı'
                          : meal.mealType === 'lunch'
                          ? 'Öğle Yemeği'
                          : meal.mealType === 'dinner'
                          ? 'Akşam Yemeği'
                          : 'Ara Öğün'}
                      </span>
                      <span className="text-[10px] text-stone-400">•</span>
                      <span className="text-[10px] text-stone-500">
                        {meal.calorieMin}-{meal.calorieMax} kcal aralığı
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-stone-900 truncate mt-0.5">
                      {meal.mealName}
                    </h4>

                    <p className="text-[11px] text-stone-600 font-medium mt-0.5">
                      <strong className="text-emerald-700 font-bold">~{meal.estimatedCalories} kcal</strong> • P: {meal.protein}g | K: {meal.carbs}g | Y: {meal.fat}g
                    </p>

                    {meal.detectedItems && meal.detectedItems.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {meal.detectedItems.map((it, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-white text-stone-600 px-1.5 py-0.5 rounded-md border border-stone-200"
                          >
                            {it.name} ({it.portion})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => handleDeleteMeal(meal.id)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition"
                    title="Öğünü sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {meal.photoBase64 && (
                    <button
                      onClick={() => handleRemovePhoto(meal.id)}
                      className="text-[10px] text-stone-400 hover:text-stone-700"
                      title="Hafıza kazanmak için sadece görseli sil, veriyi sakla"
                    >
                      Fotoğrafı Sil
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Health & Nutrition Disclaimer */}
      <div className="bg-stone-100 border border-stone-200 rounded-2xl p-3 text-[11px] text-stone-500 flex items-start gap-2">
        <HelpCircle className="w-4 h-4 shrink-0 text-stone-400 mt-0.5" />
        <p className="leading-relaxed">
          NutriShake bir kişisel takip ve akıllı formül aracıdır, tıbbi tanı veya diyetisyen tedavisi yerine geçmez. Kalori ve makro hesapları tahmini bilimsel modellerle üretilir.
        </p>
      </div>

      {/* Meal Analysis Modal */}
      {showMealModal && (
        <MealAnalysisModal
          onClose={() => setShowMealModal(false)}
          onMealSaved={() => {
            onRefreshData();
          }}
        />
      )}

      {/* Photo Lightbox Preview */}
      {activePhotoModal && (
        <div
          onClick={() => setActivePhotoModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-xs p-4 cursor-pointer"
        >
          <div className="relative max-w-lg max-h-[85vh] rounded-3xl overflow-hidden bg-black shadow-2xl">
            <img
              src={activePhotoModal}
              alt="Büyük Yemek Fotoğrafı"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
