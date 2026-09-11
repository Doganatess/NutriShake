import React, { useState, useMemo } from 'react';
import {
  BarChart2,
  Flame,
  TrendingUp,
  TrendingDown,
  Scale,
  Award,
  Calendar,
  Sparkles,
  PieChart,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { DailyPlan, MealAnalysis, UserProfile, WeightEntry } from '../types';
import { computeNutritionStats, computeWeightStats } from '../engines/statisticsEngine';
import { calculateVarietyScore } from '../engines/varietyEngine';
import { INGREDIENT_MAP } from '../data/ingredients';

interface StatisticsViewProps {
  profile: UserProfile;
  dailyPlans: Record<string, DailyPlan>;
  meals: MealAnalysis[];
  weights: WeightEntry[];
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  profile,
  dailyPlans,
  meals,
  weights,
}) => {
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);

  // Compute statistics via statisticsEngine
  const stats = useMemo(() => {
    return computeNutritionStats(dailyPlans, meals, profile.calorieGoal, timeRange);
  }, [dailyPlans, meals, profile.calorieGoal, timeRange]);

  const weightStats = useMemo(() => {
    return computeWeightStats(weights, profile.targetWeight);
  }, [weights, profile.targetWeight]);

  const varietyMetrics = useMemo(() => {
    const plansList = Object.values(dailyPlans);
    return calculateVarietyScore(plansList, 7);
  }, [dailyPlans]);

  return (
    <div className="space-y-4 pb-20">
      {/* Header Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
          <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            Performans & Analitik
          </span>
          <span className="text-[11px] text-stone-300">
            Hedef: {profile.calorieGoal} kcal/gün
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
          İlerleme ve Beslenme Raporu
        </h2>

        <p className="text-xs text-stone-300 mt-1 leading-relaxed">
          Günlük öğünleriniz, içtiğiniz shakeler ve tartı ölçümlerinizin matematiksel analizi.
        </p>

        {/* Time range selector */}
        <div className="grid grid-cols-3 gap-1.5 bg-stone-800 p-1.5 rounded-2xl mt-4">
          <button
            onClick={() => setTimeRange(7)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              timeRange === 7 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            Son 7 Gün
          </button>
          <button
            onClick={() => setTimeRange(14)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              timeRange === 14 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            Son 14 Gün
          </button>
          <button
            onClick={() => setTimeRange(30)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              timeRange === 30 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            Son 30 Gün
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Adherence Rate */}
        <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Hedefe Sadakat</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">
            %{stats.adherenceRate}
          </div>
          <p className="text-[10px] text-stone-500 mt-0.5">
            Hedef aralığında kalınan günler
          </p>
        </div>

        {/* Average Daily Calories */}
        <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Günlük Ort.</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-stone-900">
            {stats.averageCalories} <span className="text-xs font-normal text-stone-400">kcal</span>
          </div>
          <p className="text-[10px] text-stone-500 mt-0.5">
            Hedefe fark: {stats.averageCalories - profile.calorieGoal > 0 ? '+' : ''}
            {stats.averageCalories - profile.calorieGoal} kcal
          </p>
        </div>

        {/* Completed Shakes */}
        <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">İçilen Shakeler</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">
            {stats.completedShakesCount} / {stats.totalPlannedShakesCount}
          </div>
          <p className="text-[10px] text-stone-500 mt-0.5">
            {stats.totalPlannedShakesCount > 0
              ? `%${Math.round((stats.completedShakesCount / stats.totalPlannedShakesCount) * 100)} tamamlama oranı`
              : 'Henüz plan verisi yok'}
          </p>
        </div>

        {/* Variety Score */}
        <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Çeşitlilik Skoru</span>
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">
            {varietyMetrics.score} <span className="text-xs font-normal text-stone-400">/ 100</span>
          </div>
          <p className="text-[10px] text-stone-500 mt-0.5">
            {varietyMetrics.score >= 80 ? 'Harika çeşitlilik' : 'Biraz daha farklılaşabilir'}
          </p>
        </div>
      </div>

      {/* Weight Progress & Velocity (Requirement 32) */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Kilo Takibi ve Trendi
              </h3>
              <p className="text-[11px] text-stone-400">
                Tartı verilerine göre haftalık değişim hızı
              </p>
            </div>
          </div>

          <span className="text-xs font-bold text-stone-800">
            Mevcut: {weightStats.currentWeight ? `${weightStats.currentWeight} kg` : 'Girilmedi'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="text-[10px] text-stone-500 font-semibold">Toplam Değişim</div>
            <div
              className={`text-base font-black mt-0.5 ${
                weightStats.totalChangeKg > 0 ? 'text-emerald-700' : 'text-stone-800'
              }`}
            >
              {weightStats.totalChangeKg > 0 ? `+${weightStats.totalChangeKg}` : weightStats.totalChangeKg} kg
            </div>
            <div className="text-[9px] text-stone-400">İlk ölçümden bu yana</div>
          </div>

          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="text-[10px] text-stone-500 font-semibold">Haftalık Hız</div>
            <div className="text-base font-black text-stone-900 mt-0.5">
              {weightStats.weeklyVelocityKg} kg/hf
            </div>
            <div className="text-[9px] text-stone-400">Son tartı aralığı</div>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="text-[10px] text-stone-500 font-semibold">Hedefe Kalan</div>
            <div className="text-base font-black text-emerald-800 mt-0.5">
              {weightStats.remainingToTargetKg !== null
                ? `${weightStats.remainingToTargetKg} kg`
                : 'Hedef yok'}
            </div>
            <div className="text-[9px] text-stone-400">Hedef: {profile.targetWeight || 75} kg</div>
          </div>
        </div>

        {/* Projection insight text */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 text-[11px] text-emerald-950 flex items-start gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {profile.goal === 'gain_weight'
              ? `Günlük +${Math.max(0, profile.calorieGoal - profile.maintenanceCalories)} kcal fazlalıkla, ayda yaklaşık 1.5 - 2.0 kg sağlıklı ve kaliteli kilo artışı hedeflenmektedir.`
              : profile.goal === 'lose_weight'
              ? `Günlük kalori açığınızla ayda yaklaşık 1.5 - 2.0 kg yağ kaybı projeksiyonu hesaplanmaktadır.`
              : 'Günlük bakım kalorinizle mevcut kilonuzun dengeli korunması hedeflenmektedir.'}
          </p>
        </div>
      </div>

      {/* Top 5 Most Used Ingredients (Requirement 31) */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              En Sık Kullanılan Malzemeler (Top 5)
            </h3>
            <p className="text-[11px] text-stone-400">
              Son {timeRange} günlük shake tariflerinizdeki frekans
            </p>
          </div>
        </div>

        {stats.topIngredients.length === 0 ? (
          <div className="text-center py-6 text-xs text-stone-400">
            Henüz yeterli shake tüketim verisi oluşmadı.
          </div>
        ) : (
          <div className="space-y-2.5">
            {stats.topIngredients.map((item, idx) => {
              const ing = INGREDIENT_MAP[item.ingredientId];
              const maxCount = stats.topIngredients[0]?.count || 1;
              const pct = Math.round((item.count / maxCount) * 100);

              return (
                <div key={item.ingredientId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-stone-800">
                      <span>{ing?.icon || '🥣'}</span>
                      <span>{ing?.name || item.ingredientId}</span>
                    </div>
                    <span className="font-semibold text-stone-500">
                      {item.count} kez kullanıldı
                    </span>
                  </div>

                  <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Variety Recommendations */}
      {varietyMetrics.repeatedIngredients.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-3xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-stone-800">
            <Info className="w-4 h-4 text-stone-500" />
            <span>Çeşitlilik Önerisi</span>
          </div>
          <p className="text-stone-600 text-[11px] leading-relaxed">
            Son günlerde bazı malzemeleri ({varietyMetrics.repeatedIngredients.map((id) => INGREDIENT_MAP[id]?.name || id).join(', ')}) sıkça tercih ettiniz. Damak zevkinizi tazelemek için ceviz, tahin veya kuru incir gibi alternatifleri deneyebilirsiniz.
          </p>
        </div>
      )}
    </div>
  );
};
