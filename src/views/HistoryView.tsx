import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  TrendingUp,
  Scale,
  Plus,
  Trash2,
  Utensils,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Flame,
  BarChart2,
} from 'lucide-react';
import {
  DailyPlan,
  MealAnalysis,
  WeightEntry,
  UserProfile,
} from '../types';
import {
  getTodayDateString,
  getStoredDailyPlans,
  getStoredMeals,
  getStoredWeights,
  saveWeightEntry,
  deleteWeightEntry,
} from '../store/storage';
import { StatisticsView } from './StatisticsView';

interface HistoryViewProps {
  profile: UserProfile;
  onRefreshData: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  profile,
  onRefreshData,
}) => {
  const [subTab, setSubTab] = useState<'stats' | 'calendar' | 'weight'>('stats');

  // Calendar / Day selection
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Weight form states
  const [newWeight, setNewWeight] = useState<number>(profile.currentWeight);
  const [weightDate, setWeightDate] = useState<string>(getTodayDateString());
  const [weightNote, setWeightNote] = useState<string>('');
  const [showAddWeightModal, setShowAddWeightModal] = useState<boolean>(false);

  const dailyPlans = getStoredDailyPlans();
  const allMeals = getStoredMeals();
  const weightEntries = getStoredWeights();

  // Selected date data
  const planForDate = dailyPlans[selectedDate] || null;
  const mealsForDate = allMeals.filter((m) => m.date === selectedDate);

  const completedShakes = planForDate?.shakes.filter((s) => s.isCompleted) || [];
  const mealsKcal = mealsForDate.reduce((sum, m) => sum + (m.estimatedCalories || 0), 0);
  const shakesKcal = completedShakes.reduce((sum, s) => sum + (s.estimatedCalories || 0), 0);
  const totalDayKcal = mealsKcal + shakesKcal;

  // Weight stats
  const latestWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : profile.currentWeight;
  const startWeight = weightEntries.length > 0 ? weightEntries[0].weight : profile.currentWeight;
  const netWeightChange = Math.round((latestWeight - startWeight) * 10) / 10;
  const remainingToTarget = Math.round((profile.targetWeight - latestWeight) * 10) / 10;

  const handleSaveWeight = () => {
    if (!newWeight || newWeight < 30 || newWeight > 250) return;

    saveWeightEntry({
      id: `w_${Date.now()}`,
      date: weightDate || getTodayDateString(),
      weight: newWeight,
      note: weightNote || undefined,
      createdAt: new Date().toISOString(),
    });

    setShowAddWeightModal(false);
    setWeightNote('');
    onRefreshData();
  };

  const handleDeleteWeight = (id: string) => {
    deleteWeightEntry(id);
    onRefreshData();
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Sub-tab switcher */}
      <div className="flex bg-stone-100 p-1 rounded-2xl">
        <button
          onClick={() => setSubTab('stats')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            subTab === 'stats'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          İstatistikler
        </button>
        <button
          onClick={() => setSubTab('calendar')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            subTab === 'calendar'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Günlük Kayıtlar
        </button>
        <button
          onClick={() => setSubTab('weight')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            subTab === 'weight'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Scale className="w-4 h-4" />
          Kilo Takibi
        </button>
      </div>

      {subTab === 'stats' ? (
        /* FIX: StatisticsView was imported but had no button/branch to ever actually
           render it — the default subTab='stats' silently fell through to the weight
           view instead (the ternary only checked for 'calendar'). Now properly wired. */
        <StatisticsView
          profile={profile}
          dailyPlans={dailyPlans}
          meals={allMeals}
          weights={weightEntries}
        />
      ) : subTab === 'calendar' ? (
        /* CALENDAR / MEALS / SHAKES HISTORY VIEW */
        <div className="space-y-4">
          {/* Date Picker Header */}
          <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-emerald-400" />
                Seçili Tarih İncelemesi
              </span>
              <button
                onClick={() => setSelectedDate(getTodayDateString())}
                className="text-[11px] text-stone-300 hover:text-white bg-stone-800 px-2 py-1 rounded-lg"
              >
                Bugüne Dön
              </button>
            </div>

            <div className="flex items-center justify-between my-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-stone-800 text-white text-sm font-bold px-3 py-2 rounded-xl border border-stone-700 cursor-pointer"
              />
              <div className="text-right">
                <div className="text-2xl font-bold text-white">
                  {totalDayKcal} <span className="text-xs font-normal text-stone-400">kcal</span>
                </div>
                <div className="text-[10px] text-stone-400">Günün Toplamı</div>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-800 flex justify-between text-xs text-stone-300">
              <span>Yemeklerden: <strong className="text-white">{mealsKcal} kcal</strong></span>
              <span>İçilen Shake'ler: <strong className="text-white">{shakesKcal} kcal</strong></span>
            </div>
          </div>

          {/* Meals of that date */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5" />
                Bu Tarihte Alınan Öğünler ({mealsForDate.length})
              </h3>
            </div>

            {mealsForDate.length === 0 ? (
              <p className="text-xs text-stone-400 py-3 text-center">
                Bu tarihe ait kayıtlı yemek bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2.5">
                {mealsForDate.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-start gap-3 text-xs"
                  >
                    {meal.photoBase64 ? (
                      <img
                        src={meal.photoBase64}
                        alt={meal.mealName}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 border border-stone-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-stone-200 flex items-center justify-center shrink-0 text-stone-500">
                        <Utensils className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-stone-900">{meal.mealName}</div>
                      <div className="text-[11px] text-emerald-800 font-medium mt-0.5">
                        ~{meal.estimatedCalories} kcal • P: {meal.protein}g | K: {meal.carbs}g | Y: {meal.fat}g
                      </div>
                      {meal.analysisSummary && (
                        <p className="text-[11px] text-stone-500 mt-1 line-clamp-2">
                          {meal.analysisSummary}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shakes of that date */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Bu Tarihteki Shake Planı ({planForDate?.shakes.length || 0})
            </h3>

            {!planForDate || planForDate.shakes.length === 0 ? (
              <p className="text-xs text-stone-400 py-3 text-center">
                Bu tarihe ait planlanmış shake bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2">
                {planForDate.shakes.map((shake, idx) => (
                  <div
                    key={shake.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                      shake.isCompleted
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-stone-900">
                        #{idx + 1} {shake.name}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {shake.estimatedCalories} kcal • {shake.protein}g Protein
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        shake.isCompleted
                          ? 'bg-emerald-200 text-emerald-800'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {shake.isCompleted ? 'İçildi' : 'İçilmedi'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* WEIGHT TRACKER VIEW */
        <div className="space-y-4">
          {/* Weight Card Overview */}
          <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-emerald-400" />
                Kilo Hedefi & İlerleme
              </span>
              <button
                onClick={() => setShowAddWeightModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Yeni Ölçüm Ekle
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
              <div className="bg-stone-800/80 rounded-2xl p-2.5">
                <div className="text-[10px] text-stone-400">Başlangıç</div>
                <div className="text-base font-bold text-white mt-0.5">{startWeight} kg</div>
              </div>
              <div className="bg-emerald-950/70 border border-emerald-800/80 rounded-2xl p-2.5">
                <div className="text-[10px] text-emerald-400 font-semibold">Son Ölçüm</div>
                <div className="text-xl font-black text-emerald-300 mt-0.5">{latestWeight} kg</div>
              </div>
              <div className="bg-stone-800/80 rounded-2xl p-2.5">
                <div className="text-[10px] text-stone-400">Hedef</div>
                <div className="text-base font-bold text-white mt-0.5">{profile.targetWeight} kg</div>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-800 flex justify-between text-xs text-stone-300">
              <span>
                Net Değişim:{' '}
                <strong className={netWeightChange >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {netWeightChange > 0 ? `+${netWeightChange}` : netWeightChange} kg
                </strong>
              </span>
              <span>
                Hedefe Kalan: <strong className="text-white">{Math.abs(remainingToTarget)} kg</strong>
              </span>
            </div>
          </div>

          {/* Weight Log List */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                Kilo Kayıt Geçmişi ({weightEntries.length})
              </h3>
              <button
                onClick={() => setShowAddWeightModal(true)}
                className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Kayıt Ekle
              </button>
            </div>

            {weightEntries.length === 0 ? (
              <p className="text-xs text-stone-400 py-3 text-center">
                Henüz kilo kaydı bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2">
                {[...weightEntries].reverse().map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 text-sm">{entry.weight} kg</span>
                        <span className="text-[11px] text-stone-500 font-medium">{entry.date}</span>
                      </div>
                      {entry.note && (
                        <p className="text-[11px] text-stone-500 mt-0.5">{entry.note}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteWeight(entry.id)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition"
                      title="Kaydı sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Medical Disclaimer */}
          <div className="bg-stone-100 border border-stone-200 rounded-2xl p-3.5 text-[11px] text-stone-600 leading-relaxed flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 shrink-0 text-stone-500 mt-0.5" />
            <div>
              <strong className="text-stone-900">Tıbbi Bilgilendirme ve Uyarı:</strong>
              <p className="mt-0.5">
                Uygulama tıbbi tavsiye veya teşhis içermez. Hızlı ve ani kilo değişimleri sağlığa zararlı olabilir. Herhangi bir sağlık durumunda, kronik rahatsızlıkta veya özel beslenme programlarında mutlaka doktorunuza veya kayıtlı bir diyetisyene danışınız.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Weight Modal */}
      {showAddWeightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl border border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 mb-3">Yeni Kilo Kaydı Ekle</h3>
            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-stone-600 font-medium mb-1">Kilo (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="250"
                  value={newWeight}
                  onChange={(e) => setNewWeight(parseFloat(e.target.value) || profile.currentWeight)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 font-bold bg-stone-50"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-medium mb-1">Tarih</label>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 bg-stone-50"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-medium mb-1">Not (İsteğe bağlı)</label>
                <input
                  type="text"
                  placeholder="Örn: Sabah aç karnına tartıldım"
                  value={weightNote}
                  onChange={(e) => setWeightNote(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 bg-stone-50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddWeightModal(false)}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-xl font-medium text-xs"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSaveWeight}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
