import React, { useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Scale, Sparkles } from 'lucide-react';
import {
  ActivityIntensity,
  GeneralMovementLevel,
  GoalPaceUnit,
  GoalType,
  PortionPreference,
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

const workOptions: { id: WorkMovementLevel; title: string; description: string }[] = [
  { id: 'mostly_sitting', title: 'Çoğunlukla oturuyorum', description: 'Masa başı / az hareket' },
  { id: 'some_walking', title: 'Gün içinde yürüyorum', description: 'Aralıklı hareket ve yürüyüş' },
  { id: 'mostly_standing_moving', title: 'Ayakta ve hareketliyim', description: 'Günün çoğu ayakta / hareketli' },
  { id: 'heavy_physical', title: 'Fiziksel olarak yoğun', description: 'Ağır fiziksel iş' },
];

const generalOptions: { id: GeneralMovementLevel; title: string }[] = [
  { id: 'mostly_home', title: 'Çoğunlukla evdeyim' },
  { id: 'some_walking', title: 'Biraz yürüyorum' },
  { id: 'lots_of_walking', title: 'Gün içinde çok yürüyorum' },
];

const sportOptions: { id: SportType; title: string }[] = [
  { id: 'none', title: 'Spor yapmıyorum' },
  { id: 'walking', title: 'Yürüyüş' },
  { id: 'fitness_weights', title: 'Fitness / ağırlık' },
  { id: 'running', title: 'Koşu' },
  { id: 'cycling', title: 'Bisiklet' },
  { id: 'football', title: 'Futbol' },
  { id: 'other', title: 'Diğer' },
];

const paceDefaults: Record<GoalType, number> = {
  gain_weight: 0.25,
  lose_weight: 0.25,
  maintain_weight: 0,
  maintain: 0,
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete, onNavigateToToday }) => {
  const [step, setStep] = useState<Step>(1);
  const [goal, setGoal] = useState<GoalType>('gain_weight');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(30);
  const [currentWeight, setCurrentWeight] = useState(45);
  const [targetWeight, setTargetWeight] = useState(65);
  const [height, setHeight] = useState(170);
  const [workMovement, setWorkMovement] = useState<WorkMovementLevel>('mostly_standing_moving');
  const [workType, setWorkType] = useState<WorkType>('waiter_service');
  const [generalMovement, setGeneralMovement] = useState<GeneralMovementLevel>('some_walking');
  const [sportType, setSportType] = useState<SportType>('none');
  const [sportDaysPerWeek, setSportDaysPerWeek] = useState(0);
  const [sportMinutesPerSession, setSportMinutesPerSession] = useState(0);
  const [sportIntensity, setSportIntensity] = useState<ActivityIntensity>('medium');
  const [pace, setPace] = useState(paceDefaults.gain_weight);
  const [paceUnit, setPaceUnit] = useState<GoalPaceUnit>('kg_per_week');
  const [portionPreference, setPortionPreference] = useState<PortionPreference>('medium');

  const recommendation = useMemo(() => estimateCalorieNeeds(
    currentWeight,
    height,
    targetWeight,
    {
      workMovement,
      sportType,
      sportDaysPerWeek,
      sportMinutesPerSession,
      sportIntensity,
      generalMovement,
      status: 'normal',
    },
    age,
    paceUnit === 'kg_per_week' ? pace * 4.345 : pace,
    gender,
  ), [currentWeight, height, targetWeight, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement, age, pace, paceUnit, gender]);

  const previewProfile = useMemo<UserProfile>(() => ({
    id: 'preview', name: undefined, gender, age, currentWeight, targetWeight, height,
    activityLevel: workMovement === 'mostly_sitting' ? 'sedentary' : workMovement === 'heavy_physical' ? 'very_active' : workMovement === 'mostly_standing_moving' ? 'moderate' : 'light',
    workType, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement,
    goalSettings: { targetWeightKg: targetWeight, targetPace: pace, targetPaceUnit: paceUnit, adjustmentKcal: recommendation.goalAdjustmentKcal },
    goal,
    dailyShakeCount: 1,
    portionPreference,
    maintenanceCalories: recommendation.maintenanceCalories,
    calorieGoal: recommendation.recommendedGoal,
    isCustomCalorieGoal: false,
    proteinGoal: recommendation.proteinGoal,
    favoriteIngredientIds: [],
    forbiddenIngredientIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [gender, age, currentWeight, targetWeight, height, workType, workMovement, sportType, sportDaysPerWeek, sportMinutesPerSession, sportIntensity, generalMovement, pace, paceUnit, recommendation, goal, portionPreference]);

  const macroTargets = useMemo(() => calculateMacroTargets(previewProfile), [previewProfile]);

  const finish = () => {
    const now = new Date().toISOString();
    const profile: UserProfile = {
      ...previewProfile,
      id: `usr_${Date.now()}`,
      macroTargets,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 3,
    };
    saveStoredProfile(profile);
    saveWeightEntry({
      id: `w_${Date.now()}`,
      date: getTodayDateString(),
      weight: currentWeight,
      note: 'Başlangıç ölçümü',
      createdAt: now,
    });
    onComplete(profile);
    onNavigateToToday();
  };

  const next = () => setStep((value) => Math.min(4, value + 1) as Step);
  const back = () => setStep((value) => Math.max(1, value - 1) as Step);

  return (
    <div className="min-h-screen bg-[#f5f7f2] text-stone-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-lg">
              <span className="text-xl font-black">N</span>
            </div>
            <div>
              <div className="text-lg font-black tracking-tight">NutriShake</div>
              <div className="text-[11px] font-medium text-stone-500">Gününü birlikte planlayalım</div>
            </div>
          </div>
          <div className="text-xs font-bold text-stone-400">{step}/4</div>
        </div>

        <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${step * 25}%` }} />
        </div>

        <div className="bg-white rounded-[2rem] border border-stone-200/80 shadow-xl p-5 sm:p-6">
          {step === 1 && (
            <section>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-5">
                <Sparkles className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black tracking-tight">Bugününü yönetelim.</h1>
              <p className="text-sm text-stone-500 mt-2 leading-6">NutriShake; günlük enerji ihtiyacını, yediklerini ve elindeki stokları birlikte değerlendirir.</p>
              <div className="space-y-2 mt-6">
                {goalOptions.map((item) => (
                  <button key={item.id} onClick={() => { setGoal(item.id); setPace(paceDefaults[item.id]); }} className={`w-full text-left p-4 rounded-2xl border transition ${goal === item.id ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                    <div className="font-bold text-sm">{item.title}</div>
                    <div className="text-xs text-stone-500 mt-1">{item.description}</div>
                  </button>
                ))}
              </div>
              <button onClick={next} className="w-full mt-5 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm flex items-center justify-center gap-2">Devam et <ArrowRight className="w-4 h-4" /></button>
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="text-2xl font-black tracking-tight">Temel bilgilerin</h2>
              <p className="text-sm text-stone-500 mt-1 mb-5">Kalori ihtiyacını kişiselleştirmek için yeterli temel veri.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-stone-600">Cinsiyet<select value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female')} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white"><option value="male">Erkek</option><option value="female">Kadın</option></select></label>
                <label className="text-xs font-bold text-stone-600">Yaş<input type="number" min="13" max="100" value={age} onChange={(e) => setAge(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label>
                <label className="text-xs font-bold text-stone-600">Mevcut kilo (kg)<input type="number" min="30" max="250" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label>
                <label className="text-xs font-bold text-stone-600">Hedef kilo (kg)<input type="number" min="30" max="250" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label>
              </div>
              <label className="block text-xs font-bold text-stone-600 mt-3">Boy (cm)<input type="number" min="130" max="230" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label>
              <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button onClick={next} className="flex-1 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm">Aktiviteye geç <ArrowRight className="inline w-4 h-4 ml-1" /></button></div>
            </section>
          )}

          {step === 3 && (
            <section>
              <div className="flex items-center gap-2 mb-5"><Activity className="w-5 h-5 text-emerald-700" /><h2 className="text-2xl font-black tracking-tight">Günlük hareketin</h2></div>
              <label className="block text-xs font-bold text-stone-600">İşte hareketlilik<select value={workMovement} onChange={(e) => setWorkMovement(e.target.value as WorkMovementLevel)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white">{workOptions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              <label className="block text-xs font-bold text-stone-600 mt-3">Genel hareket<select value={generalMovement} onChange={(e) => setGeneralMovement(e.target.value as GeneralMovementLevel)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white">{generalOptions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              <label className="block text-xs font-bold text-stone-600 mt-3">Spor<select value={sportType} onChange={(e) => setSportType(e.target.value as SportType)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 bg-white">{sportOptions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              {sportType !== 'none' && <div className="grid grid-cols-2 gap-3 mt-3"><label className="text-xs font-bold text-stone-600">Gün/hafta<input type="number" min="0" max="7" value={sportDaysPerWeek} onChange={e => setSportDaysPerWeek(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label><label className="text-xs font-bold text-stone-600">Dakika<input type="number" min="0" max="240" value={sportMinutesPerSession} onChange={e => setSportMinutesPerSession(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3" /></label></div>}
              {sportType !== 'none' && <div className="mt-3 grid grid-cols-3 gap-2">{(['low','medium','high'] as ActivityIntensity[]).map(x => <button key={x} onClick={() => setSportIntensity(x)} className={`py-2.5 rounded-xl border text-xs font-bold ${sportIntensity === x ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>{x === 'low' ? 'Düşük' : x === 'medium' ? 'Orta' : 'Yüksek'}</button>)}</div>}
              <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button onClick={next} className="flex-1 py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-sm">Hedefi hesapla <ArrowRight className="inline w-4 h-4 ml-1" /></button></div>
            </section>
          )}

          {step === 4 && (
            <section>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-5"><Scale className="w-6 h-6" /></div>
              <h2 className="text-2xl font-black tracking-tight">Günün başlangıç hedefi</h2>
              <p className="text-sm text-stone-500 mt-1">Bunlar tahmini değerlerdir; günlük kayıtların geldikçe tablo değişir.</p>
              <div className="mt-5 rounded-3xl bg-stone-900 text-white p-5"><div className="text-xs text-stone-400">Tahmini günlük ihtiyacın</div><div className="text-4xl font-black mt-1">{recommendation.estimatedDailyNeed}<span className="text-sm text-stone-400 ml-1">kcal</span></div><div className="mt-4 pt-4 border-t border-white/10"><div className="text-xs text-stone-400">Günlük hedef</div><div className="text-2xl font-black text-emerald-400">{recommendation.recommendedGoal} kcal</div></div></div>
              {goal !== 'maintain_weight' && <div className="mt-4"><label className="text-xs font-bold text-stone-600">Hedef temposu</label><div className="flex gap-2 mt-2"><input type="number" min="0" max="1" step="0.05" value={pace} onChange={e => setPace(Number(e.target.value))} className="flex-1 rounded-xl border border-stone-200 px-3 py-3" /><select value={paceUnit} onChange={e => setPaceUnit(e.target.value as GoalPaceUnit)} className="rounded-xl border border-stone-200 px-3 py-3 bg-white"><option value="kg_per_week">kg / hafta</option><option value="kg_per_month">kg / ay</option></select></div></div>}
              <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Protein</div><div className="font-black">{macroTargets.protein} g</div></div><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Karbonhidrat</div><div className="font-black">{macroTargets.carbs} g</div></div><div className="rounded-2xl bg-stone-50 p-3"><div className="text-[10px] text-stone-500">Yağ</div><div className="font-black">{macroTargets.fat} g</div></div></div>
              <div className="mt-3"><label className="text-xs font-bold text-stone-600">Shake porsiyon tercihi</label><div className="grid grid-cols-3 gap-2 mt-2">{(['small','medium','large'] as PortionPreference[]).map(x => <button key={x} onClick={() => setPortionPreference(x)} className={`py-2.5 rounded-xl border text-xs font-bold ${portionPreference === x ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>{x === 'small' ? 'Küçük' : x === 'medium' ? 'Orta' : 'Büyük'}</button>)}</div></div>
              <div className="flex gap-2 mt-5"><button onClick={back} className="px-4 rounded-2xl bg-stone-100"><ArrowLeft className="w-4 h-4" /></button><button onClick={finish} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2">NutriShake'e başla <Check className="w-4 h-4" /></button></div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
