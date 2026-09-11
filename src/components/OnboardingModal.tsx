import React, { useState } from 'react';
import { Sparkles, ArrowRight, Check, Activity } from 'lucide-react';
import { UserProfile, ActivityLevel, PortionPreference } from '../types';
import { estimateCalorieNeeds } from '../utils/nutritionEngine';
import { saveStoredProfile, saveWeightEntry, getTodayDateString } from '../store/storage';

interface OnboardingModalProps {
  onComplete: (profile: UserProfile) => void;
  onNavigateToIngredients: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onComplete,
  onNavigateToIngredients,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form states
  const [currentWeight, setCurrentWeight] = useState<number>(68);
  const [targetWeight, setTargetWeight] = useState<number>(73); // Default +5 kg target
  const [height, setHeight] = useState<number>(175);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [dailyShakeCount, setDailyShakeCount] = useState<number>(1);
  const [portionPreference, setPortionPreference] = useState<PortionPreference>('medium');

  // Step 3 custom target states
  const [customCalorie, setCustomCalorie] = useState<number>(0);
  const [customProtein, setCustomProtein] = useState<number>(0);
  const [isCustom, setIsCustom] = useState<boolean>(false);

  // Calculate recommendation
  const recommendation = estimateCalorieNeeds(currentWeight, height, targetWeight, activityLevel);

  const handleNextFromStep2 = () => {
    setCustomCalorie(recommendation.recommendedGoal);
    setCustomProtein(recommendation.proteinGoal);
    setStep(3);
  };

  const handleFinalSubmit = () => {
    const finalCalorie = isCustom ? customCalorie : recommendation.recommendedGoal;
    const finalProtein = isCustom ? customProtein : recommendation.proteinGoal;

    const newProfile: UserProfile = {
      id: `usr_${Date.now()}`,
      gender: 'male',
      age: 30,
      goal: targetWeight > currentWeight ? 'gain_weight' : targetWeight < currentWeight ? 'lose_weight' : 'maintain_weight',
      maintenanceCalories: recommendation.maintenanceCalories,
      currentWeight,
      targetWeight,
      height,
      activityLevel,
      dailyShakeCount,
      portionPreference,
      calorieGoal: finalCalorie,
      monthlyWeightGoalKg: 5,
      dailySurplusKcal: recommendation.dailySurplusKcal || 1280,
      isCustomCalorieGoal: isCustom,
      proteinGoal: finalProtein,
      favoriteIngredientIds: [],
      forbiddenIngredientIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveStoredProfile(newProfile);

    // Record initial weight entry without mock history
    saveWeightEntry({
      id: `w_${Date.now()}`,
      date: getTodayDateString(),
      weight: currentWeight,
      note: 'Başlangıç ölçümü',
      createdAt: new Date().toISOString(),
    });

    onComplete(newProfile);
    onNavigateToIngredients();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-100 my-auto">
        {/* Progress Bar */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              NutriShake Kurulumu
            </span>
          </div>
          <span className="text-xs font-medium text-stone-600">
            Adım {step} / 3
          </span>
        </div>

        <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden mb-6">
          <div
            className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
            style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
          />
        </div>

        {/* STEP 1: Basic measurements */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-stone-900 mb-1">
              Kişisel Profilinizi Oluşturun
            </h2>
            <p className="text-xs text-stone-500 mb-6 leading-relaxed">
              Günlük kalori ve shake formüllerinizi ihtiyaçlarınıza göre optimize etmek için temel bilgilerinizi girin.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <div className="flex justify-between text-xs font-medium text-stone-700 mb-1.5">
                  <label htmlFor="input-current-weight">Mevcut Kilo</label>
                  <span className="font-bold text-emerald-700">{currentWeight} kg</span>
                </div>
                <input
                  id="input-current-weight"
                  type="range"
                  min={35}
                  max={160}
                  step={0.5}
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer h-2 bg-stone-200 rounded-lg"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-stone-700 mb-1.5">
                  <label htmlFor="input-target-weight">Hedef Kilo</label>
                  <span className="font-bold text-emerald-700">{targetWeight} kg</span>
                </div>
                <input
                  id="input-target-weight"
                  type="range"
                  min={35}
                  max={160}
                  step={0.5}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer h-2 bg-stone-200 rounded-lg"
                />
                <div className="flex justify-between items-center mt-1 text-[11px] text-stone-600">
                  <span>Değişim hedefi:</span>
                  <span className="font-medium text-stone-700">
                    {targetWeight > currentWeight
                      ? `+${(targetWeight - currentWeight).toFixed(1)} kg (Kilo alma/kas)`
                      : targetWeight < currentWeight
                      ? `${(targetWeight - currentWeight).toFixed(1)} kg (Kilo verme)`
                      : 'Kilo koruma'}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-stone-700 mb-1.5">
                  <label htmlFor="input-height">Boy Uzunluğu</label>
                  <span className="font-bold text-emerald-700">{height} cm</span>
                </div>
                <input
                  id="input-height"
                  type="range"
                  min={130}
                  max={215}
                  step={1}
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer h-2 bg-stone-200 rounded-lg"
                />
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
            >
              Devam Et
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Lifestyle & Preferences */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-stone-900 mb-1">
              Aktivite & Shake Tercihleri
            </h2>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Günlük temponuza uygun porsiyon ve sıklığı belirleyin.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-2">
                  Günlük Aktivite Düzeyi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'sedentary', label: 'Hareketsiz', desc: 'Masa başı iş' },
                    { id: 'light', label: 'Hafif Aktif', desc: 'Haftada 1-2 gün yürüyüş' },
                    { id: 'moderate', label: 'Orta Aktif', desc: 'Haftada 3-4 gün spor' },
                    { id: 'very_active', label: 'Çok Aktif', desc: 'Yoğun antrenman/iş' },
                  ].map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setActivityLevel(act.id as ActivityLevel)}
                      className={`p-3 text-left rounded-2xl border transition text-xs ${
                        activityLevel === act.id
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <div>{act.label}</div>
                      <div className="text-[10px] text-stone-600 font-normal mt-0.5">{act.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-2">
                  Günde Kaç Shake İçmek İstersiniz?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { count: 1, label: 'Günde 1 Shake', note: 'Ara öğün veya kahvaltı' },
                    { count: 2, label: 'Günde 2 Shake', note: 'Sabah + İkindi/Akşam' },
                  ].map((sc) => (
                    <button
                      key={sc.count}
                      type="button"
                      onClick={() => setDailyShakeCount(sc.count)}
                      className={`p-3 text-left rounded-2xl border transition text-xs ${
                        dailyShakeCount === sc.count
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <div>{sc.label}</div>
                      <div className="text-[10px] text-stone-600 font-normal mt-0.5">{sc.note}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-2">
                  Porsiyon Büyüklüğü Tercihi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'small', title: 'Küçük', vol: '~300 ml' },
                    { id: 'medium', title: 'Orta', vol: '~450 ml' },
                    { id: 'large', title: 'Büyük', vol: '~650 ml' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPortionPreference(p.id as PortionPreference)}
                      className={`p-2.5 text-center rounded-2xl border transition text-xs ${
                        portionPreference === p.id
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <div>{p.title}</div>
                      <div className="text-[10px] text-stone-600 font-normal">{p.vol}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="py-3.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl font-medium text-xs transition"
              >
                Geri
              </button>
              <button
                onClick={handleNextFromStep2}
                className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
              >
                Hesapla & İlerle
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Goal Confirmation & Disclaimer */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-stone-900 mb-1">
              Hedefleriniz Belirlendi
            </h2>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Bilimsel bazal metabolizma tahminine göre hesaplandı. Dilerseniz kendi hedefinizi yazabilirsiniz.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between gap-2 mb-2 text-emerald-800 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  Önerilen Günlük Beslenme Hedefi
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-bold">
                  Hedef: Aylık +5 KG
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
                  <div className="text-[11px] text-stone-500">Günlük Kalori Hedefi</div>
                  <div className="text-lg font-black text-stone-900 mt-0.5">
                    {isCustom ? customCalorie : recommendation.recommendedGoal} <span className="text-xs font-normal text-stone-500">kcal</span>
                  </div>
                </div>
                <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-100">
                  <div className="text-[11px] text-stone-500">Günlük Protein Hedefi</div>
                  <div className="text-lg font-black text-stone-900 mt-0.5">
                    {isCustom ? customProtein : recommendation.proteinGoal} <span className="text-xs font-normal text-stone-500">g</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Target Projection Note (Rule 2) */}
            <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl mb-4 text-xs space-y-1">
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <span>🎯</span> Aylık Kilo Alma Hedefi: +5 KG
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Hedeflenen aylık artış: <strong>+5 kg</strong> (Günlük hedeflenen kalori fazlası: <strong>~{recommendation.dailySurplusKcal || 1280} kcal</strong>).
              </p>
              <p className="text-[10px] text-amber-800/90 italic leading-snug">
                * Bu plan bir hedef ve bilimsel enerji projeksiyonudur; kesin bir taahhüt olmayıp bireysel metabolizma hızına ve günlük tempoya göre gerçek artış değişebilir.
              </p>
            </div>

            {/* Custom toggle */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setIsCustom(!isCustom)}
                className="text-xs text-emerald-700 hover:underline font-medium flex items-center gap-1 mb-2"
              >
                {isCustom ? '✓ Özel hedef kullanılıyor (Vazgeç)' : '+ Kendi özel kalori hedefimi girmek istiyorum'}
              </button>

              {isCustom && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 border border-stone-200 rounded-2xl">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Kalori (kcal)</label>
                    <input
                      type="number"
                      min={1200}
                      max={5000}
                      value={customCalorie}
                      onChange={(e) => setCustomCalorie(parseInt(e.target.value) || 2000)}
                      className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Protein (g)</label>
                    <input
                      type="number"
                      min={40}
                      max={300}
                      value={customProtein}
                      onChange={(e) => setCustomProtein(parseInt(e.target.value) || 100)}
                      className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Health Disclaimer */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-[11px] text-stone-500 leading-relaxed mb-6">
              <strong className="text-stone-700 font-semibold">Önemli Sağlık Uyarısı:</strong> Belirtilen besin değerleri ve kalori ihtiyaçları bilimsel formüllerle üretilmiş yaklaşık <em>tahminlerdir</em>. Uygulama tıbbi teşhis koymaz veya kesin sonuç vaadinde bulunmaz.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="py-3.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl font-medium text-xs transition"
              >
                Geri
              </button>
              <button
                onClick={handleFinalSubmit}
                className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
              >
                <Check className="w-4 h-4" />
                Malzemelerimi Seçmeye Başla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
