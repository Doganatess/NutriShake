import React, { useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Scale, Sparkles } from 'lucide-react';
import {
  ActivityIntensity,
  GeneralMovementLevel,
  GoalPaceUnit,
  GoalType,
  SportType,
  UserProfile,
  WorkMovementLevel,
  WorkType,
} from '../types';
import { estimateCalorieNeeds } from '../utils/nutritionEngine';
import { calculateMacroTargets } from '../engines/macroEngine';
import { getTodayDateString, saveStoredProfile, saveWeightEntry } from '../store/storage';

interface OnboardingModalProps {
  onComplete: (profile: UserProfile) => void;
  onNavigateToToday: () => void;
}

type Step = 1 | 2 | 3 | 4;

const goalOptions: { id: GoalType; title: string; description: string }[] = [
  { id: 'gain_weight', title: 'Kilo almak', description: 'Kontrollü enerji fazlasıyla hedef kiloya ilerle' },
  { id: 'maintain_weight', title: 'Kilomu korumak', description: 'Günlük ihtiyacını dengede tut' },
  { id: 'lose_weight', title: 'Kilo vermek', description: 'Hedefine uygun kontrollü enerji açığı oluştur' },
];

const workTypeOptions: { id: WorkType; title: string }[] = [
  { id: 'desk_office', title: 'Ofis / masa başı' },
  { id: 'teacher', title: 'Öğretmen / eğitim' },
  { id: 'student', title: 'Öğrenci' },
  { id: 'waiter_service', title: 'Garson / servis' },
  { id: 'cook_kitchen', title: 'Mutfak / aşçı' },
  { id: 'store_sales', title: 'Mağaza / satış' },
  { id: 'courier', title: 'Kurye / dağıtım' },
  { id: 'warehouse_logistics', title: 'Depo / lojistik' },
  { id: 'factory', title: 'Fabrika / üretim' },
  { id: 'construction', title: 'İnşaat / saha' },
  { id: 'healthcare', title: 'Sağlık' },
  { id: 'cleaning', title: 'Temizlik' },
  { id: 'driver', title: 'Şoför / sürücü' },
  { id: 'other', title: 'Diğer' },
];

const workMovementByType: Record<WorkType, WorkMovementLevel> = {
  desk_office: 'mostly_sitting', teacher: 'some_walking', student: 'some_walking',
  waiter_service: 'mostly_standing_moving', cook_kitchen: 'mostly_standing_moving',
  store_sales: 'mostly_standing_moving', courier: 'heavy_physical', warehouse_logistics: 'heavy_physical',
  factory: 'mostly_standing_moving', construction: 'heavy_physical', healthcare: 'mostly_standing_moving',
  cleaning: 'heavy_physical', driver: 'mostly_sitting', other: 'some_walking',
};

const workMovementLabels: Record<WorkMovementLevel, string> = {
  mostly_sitting: 'Çoğunlukla oturarak',
  some_walking: 'Hafif hareketli',
  mostly_standing_moving: 'Ayakta ve hareketli',
  heavy_physical: 'Fiziksel olarak yoğun',
};

const sportOptions: { id: SportType; title: string }[] = [
  { id: 'none', title: 'Spor yapmıyorum' }, { id: 'walking', title: 'Yürüyüş' },
  { id: 'fitness_weights', title: 'Fitness / ağırlık' }, { id: 'running', title: 'Koşu' },
  { id: 'cycling', title: 'Bisiklet' }, { id: 'football', title: 'Futbol' }, { id: 'other', title: 'Diğer' },
];

const paceDefaults: Record<GoalType, number> = {
  gain_weight: 0.25, lose_weight: 0.25, maintain_weight: 0, maintain: 0,
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete, onNavigateToToday }) => {
  const [step, setStep] = useState<Step>(1);
  const [goal, setGoal] = useState<GoalType>('gain_weight');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [ageText, setAgeText] = useState('30');
  const [currentWeightText, setCurrentWeightText] = useState('45');
  const [targetWeightText, setTargetWeightText] = useState('65');
  const [heightText, setHeightText] = useState('170');
  const [workType, setWorkType] = useState<WorkType>('waiter_service');
  const workMovement = workMovementByType[workType];
  const generalMovement: GeneralMovementLevel = workMovement === 'mostly_sitting' ? 'mostly_home' : workMovement === 'some_walking' ? 'some_walking' : 'lots_of_walking';
  const [sportType, setSportType] = useState<SportType>('none');
  const [sportDaysPerWeek, setSportDaysPerWeek] = useState(0);
  const [sportMinutesPerSession, setSportMinutesPerSession] = useState(0);
  const [sportIntensity, setSportIntensity] = useState<ActivityIntensity>('medium');
  const [paceText, setPaceText] = useState(String(paceDefaults.gain_weight));
  const [paceUnit, setPaceUnit] = useState<GoalPaceUnit>('kg_per_week');

  const age = Number(ageText) || 0;
  const currentWeight = Number(currentWeightText) || 0;
  const targetWeight = Number(targetWeightText) || 0;
  const height = Number(heightText) || 0;
  const pace = Number(paceText) || 0;

  const recommendation = useMemo(() => estimateCalorieNeeds(
    currentWeight, height, targetWeight,
    { workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement, status: 'normal' },
    age, paceUnit === 'kg_per_week' ? pace * 4.345 : pace, gender,
  ), [currentWeight, height, targetWeight, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement, age, pace, paceUnit, gender]);

  const previewProfile = useMemo<UserProfile>(() => ({
    id: 'preview', name: undefined, gender, age, currentWeight, targetWeight, height,
    activityLevel: workMovement === 'mostly_sitting' ? 'sedentary' : workMovement === 'heavy_physical' ? 'very_active' : workMovement === 'mostly_standing_moving' ? 'moderate' : 'light',
    workType, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement,
    goalSettings: { targetWeightKg: targetWeight, targetPace: pace, targetPaceUnit: paceUnit, adjustmentKcal: recommendation.goalAdjustmentKcal },
    goal, dailyShakeCount: 1, portionPreference: 'medium', maintenanceCalories: recommendation.maintenanceCalories,
    calorieGoal: recommendation.recommendedGoal, isCustomCalorieGoal: false, proteinGoal: recommendation.proteinGoal,
    favoriteIngredientIds: [], forbiddenIngredientIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }), [gender, age, currentWeight, targetWeight, height, workType, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement, pace, paceUnit, recommendation, goal]);

  const macroTargets = useMemo(() => calculateMacroTargets(previewProfile), [previewProfile]);

  const finish = () => {
    if (currentWeight <= 0 || targetWeight <= 0 || height <= 0 || age <= 0) return;
    const now = new Date().toISOString();
    const profile: UserProfile = { ...previewProfile, id: `usr_${Date.now()}`, macroTargets, createdAt: now, updatedAt: now, schemaVersion: 3 };
    saveStoredProfile(profile);
    saveWeightEntry({ id: `w_${Date.now()}`, date: getTodayDateString(), weight: currentWeight, note: 'Başlangıç ölçümü', createdAt: now });
    onComplete(profile);
    onNavigateToToday();
  };

  const next = () => setStep((value) => Math.min(4, value + 1) as Step);
  const back = () => setStep((value) => Math.max(1, value - 1) as Step);
  const inputClass = 'mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 text-stone-500 focus:text-stone-900 outline-none';

  return (
    <div className="min-h-screen bg-[#f5f7f2] text-stone-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-lg"><span className="text-xl font-black">N</span></div><div><div className="text-lg font-black tracking-tight">NutriShake</div><div className="text-[11px] font-medium text-stone-500">Gününü birlikte planlayalım</div></div></div>
          <div className="text-xs font-bold text-stone-400">{step}/4</div>
        </div>
        <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mb-5"><div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${step * 25}%` }} /></div>
        <div className="bg-white rounded-[2rem] border border-stone-200/80 shadow-xl p-5 sm:p-6">
          {step === 1 && <section>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-5"><Sparkles className="w-6 h-6" /></div>
            <h1 className="text-2xl font-black tracking-tight">Bugününü yönetelim.</h1>
            <p className="text-sm text-stone-500 mt-2 leading-6">NutriShake; günlük enerji ihtiyacını, yediklerini ve elindeki stokları birlikte değerlendirir.</p>
            <div className="space-y-2 mt-6">{goalOptions.map((item) => <button key={item.id} onClick={() => { setGoal(item.id); setPaceText(String(paceDefaults[item.id])); }} className={`w-full text-left p-4 rounded-2xl border transition ${goal === item.id ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}><div className="font-bold text-sm">{item.title}</div><div className="text-xs text-stone-500 mt-1">{item.description}</div></button>)}</div>
            <button onClick={next} className="w-full mt-5 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm flex items-center justify-center gap-2">Devam et <ArrowRight className="w-4 h-4" /></button>
          </section>}

          {step === 2 && <section>
            <h2 className="text-2xl font-black tracking-tight">Temel bilgilerin</h2><p className="text-sm text-stone-500 mt-1 mb-5">Kalori ihtiyacını kişiselleştirmek için gerekli temel veriler.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-stone-600">Cinsiyet<select value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female')} className={inputClass}><option value="male">Erkek</option><option value="female">Kadın</option></select></label>
              <label className="text-xs font-bold text-stone-600">Yaş<input type="number" min="13" max="100" value={ageText} onChange={(e) => setAgeText(e.target.value)} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-600">Mevcut kilo (kg)<input type="number" min="30" max="250" step="0.1" value={currentWeightText} onChange={(e) => setCurrentWeightText(e.target.value)} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-600">Hedef kilo (kg)<input type="number" min="30" max="250" step="0.1" value={targetWeightText} onChange={(e) => setTargetWeightText(e.target.value)} className={inputClass} /></label>
            </div>
            <label className="block text-xs font-bold text-stone-600 mt-3">Boy (cm)<input type="number" min="130" max="230" value={heightText} onChange={(e) => setHeightText(e.target.value)} className={inputClass} /></label>
            <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button disabled={currentWeight <= 0 || targetWeight <= 0 || height <= 0 || age <= 0} onClick={next} className="flex-1 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm disabled:opacity-40">Aktiviteye geç <ArrowRight className="inline w-4 h-4 ml-1" /></button></div>
          </section>}

          {step === 3 && <section>
            <div className="flex items-center gap-2 mb-5"><Activity className="w-5 h-5 text-emerald-700" /><h2 className="text-2xl font-black tracking-tight">Günlük hareketin</h2></div>
            <label className="block text-xs font-bold text-stone-600">Çalıştığın iş<select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white text-stone-700">{workTypeOptions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
            <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3"><div className="text-[10px] uppercase tracking-wide text-stone-400 font-bold">Hesaplanan iş hareketliliği</div><div className="mt-1 text-sm font-bold text-stone-700">{workMovementLabels[workMovement]}</div><div className="mt-1 text-[11px] text-stone-400">İş türüne göre otomatik belirlenir.</div></div>
            <label className="block text-xs font-bold text-stone-600 mt-3">Spor<select value={sportType} onChange={(e) => setSportType(e.target.value as SportType)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white text-stone-700">{sportOptions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
            {sportType !== 'none' && <div className="grid grid-cols-2 gap-3 mt-3"><label className="text-xs font-bold text-stone-600">Gün/hafta<input type="number" min="0" max="7" value={sportDaysPerWeek} onChange={e => setSportDaysPerWeek(Number(e.target.value))} className={inputClass} /></label><label className="text-xs font-bold text-stone-600">Dakika<input type="number" min="0" max="240" value={sportMinutesPerSession} onChange={e => setSportMinutesPerSession(Number(e.target.value))} className={inputClass} /></label></div>}
            {sportType !== 'none' && <div className="mt-3 grid grid-cols-3 gap-2">{(['low','medium','high'] as ActivityIntensity[]).map(x => <button key={x} onClick={() => setSportIntensity(x)} className={`py-2.5 rounded-xl border text-xs font-bold ${sportIntensity === x ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>{x === 'low' ? 'Düşük' : x === 'medium' ? 'Orta' : 'Yüksek'}</button>)}</div>}
            <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button onClick={next} className="flex-1 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm">Hedefi hesapla <ArrowRight className="inline w-4 h-4 ml-1" /></button></div>
          </section>}

          {step === 4 && <section>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-5"><Scale className="w-6 h-6" /></div>
            <h2 className="text-2xl font-black tracking-tight">Günün başlangıç hedefi</h2><p className="text-sm text-stone-500 mt-1">Bunlar tahmini değerlerdir; günlük kayıtların geldikçe tablo değişir.</p>
            <div className="mt-5 rounded-3xl bg-stone-900 text-white p-5"><div className="text-xs text-stone-400">Tahmini günlük ihtiyacın</div><div className="text-4xl font-black mt-1">{recommendation.estimatedDailyNeed}<span className="text-sm text-stone-400 ml-1">kcal</span></div><div className="mt-4 pt-4 border-t border-white/10"><div className="text-xs text-stone-400">Günlük hedef</div><div className="text-2xl font-black text-emerald-400">{recommendation.recommendedGoal} kcal</div></div></div>
            {goal !== 'maintain_weight' && <div className="mt-4"><label className="text-xs font-bold text-stone-600">Hedef temposu</label><div className="flex gap-2 mt-2"><input type="number" min="0" max="10" step="0.05" value={paceText} onChange={e => setPaceText(e.target.value)} className="flex-1 rounded-xl border border-stone-200 px-3 py-3 text-stone-500 focus:text-stone-900 outline-none" /><select value={paceUnit} onChange={e => setPaceUnit(e.target.value as GoalPaceUnit)} className="rounded-xl border border-stone-200 px-3 py-3 bg-white"><option value="kg_per_week">kg / hafta</option><option value="kg_per_month">kg / ay</option></select></div></div>}
            <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Protein</div><div className="font-black">{macroTargets.protein} g</div></div><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Karbonhidrat</div><div className="font-black">{macroTargets.carbs} g</div></div><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Yağ</div><div className="font-black">{macroTargets.fat} g</div></div></div>
            <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button onClick={finish} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2">NutriShake'e başla <Check className="w-4 h-4" /></button></div>
          </section>}
        </div>
      </div>
    </div>
  );
};
