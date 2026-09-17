import React, { useState } from 'react';
import {
  Settings,
  User,
  Brain,
  Heart,
  Download,
  Upload,
  Trash2,
  Plus,
  Check,
  AlertTriangle,
  HelpCircle,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  UserProfile,
  ActivityLevel,
  PortionPreference,
  UserPreference,
  Shake,
} from '../types';
import {
  saveStoredProfile,
  getStoredPreferences,
  savePreference,
  deletePreference,
  getStoredFavorites,
  toggleFavoriteShake,
  clearAllAppData,
} from '../store/storage';
import {
  clearUserOnlyData,
  exportAllUserData,
  importUserData,
  getStoredDailyPlans,
} from '../storage/storageAbstraction';
import { estimateCalorieNeeds } from '../utils/nutritionEngine';
import { getIngredientAffinityScores } from '../engines/statisticsEngine';

interface SettingsViewProps {
  profile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onRefreshData: () => void;
  onResetAppToOnboarding: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  onUpdateProfile,
  onRefreshData,
  onResetAppToOnboarding,
}) => {
  // Profile edit states
  const [currentWeight, setCurrentWeight] = useState<number>(profile.currentWeight);
  const [targetWeight, setTargetWeight] = useState<number>(profile.targetWeight);
  const [height, setHeight] = useState<number>(profile.height);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [dailyShakeCount, setDailyShakeCount] = useState<number>(profile.dailyShakeCount);
  const [portionPreference, setPortionPreference] = useState<PortionPreference>(profile.portionPreference);
  const [calorieGoal, setCalorieGoal] = useState<number>(profile.calorieGoal);
  const [proteinGoal, setProteinGoal] = useState<number>(profile.proteinGoal);
  const [monthlyWeightGoalKg, setMonthlyWeightGoalKg] = useState<number>(profile.monthlyWeightGoalKg || 5);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  // AI Memory / Preferences
  const [preferences, setPreferences] = useState<UserPreference[]>(getStoredPreferences());
  const [newRuleText, setNewRuleText] = useState<string>('');

  // Favorites
  const [favorites, setFavorites] = useState<Shake[]>(getStoredFavorites());

  // Learned ingredient preferences (from favorites + love/like-rated shakes)
  const topAffinityIngredients = getIngredientAffinityScores(favorites, getStoredDailyPlans())
    .filter((a) => a.score >= 2)
    .slice(0, 8);

  // Handle Profile Save
  const handleSaveProfile = () => {
    const dailySurplusKcal = Math.round((monthlyWeightGoalKg * 7700) / 30);
    const updated: UserProfile = {
      ...profile,
      currentWeight,
      targetWeight,
      height,
      activityLevel,
      dailyShakeCount,
      portionPreference,
      calorieGoal,
      proteinGoal,
      monthlyWeightGoalKg,
      dailySurplusKcal,
      updatedAt: new Date().toISOString(),
    };

    saveStoredProfile(updated);
    onUpdateProfile(updated);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  // Recalculate Recommendation
  const handleRecalculateNeeds = () => {
    const rec = estimateCalorieNeeds(currentWeight, height, targetWeight, activityLevel, 28, monthlyWeightGoalKg);
    setCalorieGoal(rec.recommendedGoal);
    setProteinGoal(rec.proteinGoal);
  };

  // Add preference rule
  const handleAddPreferenceRule = () => {
    if (!newRuleText.trim()) return;

    const newPref: UserPreference = {
      id: `pref_${Date.now()}`,
      type: 'habit',
      note: newRuleText.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };

    savePreference(newPref);
    setPreferences(getStoredPreferences());
    setNewRuleText('');
    onRefreshData();
  };

  const handleDeletePreferenceRule = (id: string) => {
    deletePreference(id);
    setPreferences(getStoredPreferences());
    onRefreshData();
  };

  const handleRemoveFavorite = (shake: Shake) => {
    toggleFavoriteShake(shake);
    setFavorites(getStoredFavorites());
    onRefreshData();
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const jsonString = exportAllUserData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrishake_yedek_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const success = importUserData(content);
        if (success) {
          window.location.reload();
        } else {
          alert('Yedek dosyası okunamadı veya biçimi geçersiz.');
        }
      } catch (err) {
        alert('Yedek dosyası okunamadı veya biçimi geçersiz.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (confirm('Kullanıcı verilerinizi, kiler stoğunuzu, geçmişinizi ve tercihlerinizi silip uygulamayı sıfırlamak istediğinize emin misiniz?\n\nNot: 8 kategorilik Türkiye malzeme kütüphanesi korunacaktır.')) {
      clearUserOnlyData();
      onResetAppToOnboarding();
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-emerald-400 mb-1">
          <Settings className="w-4 h-4 text-emerald-400" />
          Kişisel Tercihler & Sistem
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
          Profil ve Uygulama Ayarları
        </h2>
        <p className="text-xs text-stone-300 mt-1 leading-relaxed">
          Kişisel hedeflerinizi güncelleyin, yapay zeka hafıza kurallarını yönetin veya verilerinizi yedekleyin.
        </p>
      </div>

      {/* 1. Profile & Nutritional Goals */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">Kişisel Hedefler & Profil</h3>
          </div>
          <button
            onClick={handleRecalculateNeeds}
            className="text-[11px] text-emerald-700 font-semibold hover:underline"
          >
            Önerilen Hedefleri Yeniden Hesapla
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-stone-600 font-medium mb-1">Mevcut Kilo (kg)</label>
            <input
              type="number"
              step="0.1"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(parseFloat(e.target.value) || 60)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Hedef Kilo (kg)</label>
            <input
              type="number"
              step="0.1"
              value={targetWeight}
              onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 60)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Boy (cm)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value) || 170)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Kalori Hedefi</label>
            <input
              type="number"
              value={calorieGoal}
              onChange={(e) => setCalorieGoal(parseInt(e.target.value) || 2000)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Protein Hedefi (g)</label>
            <input
              type="number"
              value={proteinGoal}
              onChange={(e) => setProteinGoal(parseInt(e.target.value) || 100)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Aylık Kilo Alma Hedefi (kg)</label>
            <input
              type="number"
              step="0.5"
              value={monthlyWeightGoalKg}
              onChange={(e) => setMonthlyWeightGoalKg(parseFloat(e.target.value) || 5)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-emerald-800"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Shake Modeli</label>
            <div className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-100 font-semibold text-stone-500">
              1 Shake (2 Eşit Porsiyon)
            </div>
          </div>
          </div>
        </div>

        {/* Aylık Hedef Projeksiyon Bilgilendirmesi */}
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-1">
          <div className="font-bold text-amber-950 flex items-center gap-1.5">
            <span>🎯</span> Aylık Kilo Alma Hedefi: +{monthlyWeightGoalKg} KG Planı
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            Hedeflenen aylık artış: <strong>+{monthlyWeightGoalKg} kg</strong> (Günlük hedeflenen planlı kalori fazlası: <strong>~{Math.round((monthlyWeightGoalKg * 7700) / 30)} kcal</strong>).
          </p>
          <p className="text-[10px] text-amber-800/90 italic leading-snug">
            * Bu plan bir hedef ve bilimsel enerji projeksiyonudur. Bireysel metabolizma hızınıza, vardiya saatlerinize ve fiziksel iş yoğunluğunuza göre gerçek kilo artışı değişkenlik gösterebilir.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <label className="block text-stone-600 font-medium mb-1">Aktivite Seviyesi</label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-semibold"
            >
              <option value="sedentary">Hareketsiz (Masa başı)</option>
              <option value="light">Hafif Aktif (Haftada 1-2 gün spor)</option>
              <option value="moderate">Orta Aktif (Haftada 3-4 gün spor)</option>
              <option value="very_active">Çok Aktif (Yoğun spor/antrenman)</option>
            </select>
          </div>

          <div>
            <label className="block text-stone-600 font-medium mb-1">Porsiyon Tercihi</label>
            <select
              value={portionPreference}
              onChange={(e) => setPortionPreference(e.target.value as PortionPreference)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-semibold"
            >
              <option value="small">Küçük Porsiyon (~300 ml)</option>
              <option value="medium">Orta Porsiyon (~450 ml)</option>
              <option value="large">Büyük Porsiyon (~650 ml)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          {savedFeedback && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <Check className="w-4 h-4" /> Değişiklikler kaydedildi!
            </span>
          )}
          <button
            onClick={handleSaveProfile}
            className="ml-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs active:scale-98 transition"
          >
            Profili Kaydet
          </button>
        </div>
      </div>

      {/* 2. AI Memory & User Preferences */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">Yapay Zeka Hafızası (AI Memory)</h3>
          </div>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Geçmişte beğenmediğiniz tarifler veya eklediğiniz özel kurallar burada tutulur ve plan oluştururken dikkate alınır.
          </p>
        </div>

        {/* Add rule input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Yeni kural ekle (Örn: Çikolata aromalarını çok severim / Akşam shake'inde tarçın olmasın)..."
            value={newRuleText}
            onChange={(e) => setNewRuleText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPreferenceRule()}
            className="flex-1 px-3 py-2.5 text-xs border border-stone-200 rounded-xl bg-stone-50 placeholder:text-stone-400"
          />
          <button
            onClick={handleAddPreferenceRule}
            className="px-3.5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-semibold shrink-0 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Rule list */}
        {preferences.length === 0 ? (
          <p className="text-xs text-stone-400 py-2 text-center">
            Henüz özel hafıza kuralı bulunmuyor. Bir shake'i beğenmediğinizde veya yukarıdan kural eklediğinizde burada listelenir.
          </p>
        ) : (
          <div className="space-y-2">
            {preferences.map((pref) => (
              <div
                key={pref.id}
                className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="text-stone-800 font-medium truncate">{pref.note}</span>
                </div>
                <button
                  onClick={() => handleDeletePreferenceRule(pref.id)}
                  className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition shrink-0 ml-2"
                  title="Kuralı sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* En Çok Sevdiklerin (Learned Ingredient Preferences) */}
      {topAffinityIngredients.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-3">
          <div className="border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-stone-900">En Çok Sevdiklerin</h3>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Favorilediğin ve yüksek puan verdiğin shake'lerde en sık geçen malzemeler. Yeni tarifler oluşturulurken bunlara hafifçe öncelik verilir.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {topAffinityIngredients.map((a) => (
              <span
                key={a.ingredientId}
                className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5"
              >
                <span>{a.icon}</span>
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Saved Favorites */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-3">
        <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-600 fill-rose-600" />
            <h3 className="text-sm font-bold text-stone-900">Favori Shake'lerim ({favorites.length})</h3>
          </div>
        </div>

        {favorites.length === 0 ? (
          <p className="text-xs text-stone-400 py-3 text-center">
            Henüz favorilere eklenmiş bir shake bulunmuyor. Shake kartlarındaki kalp simgesine dokunarak favorilerinize ekleyebilirsiniz.
          </p>
        ) : (
          <div className="space-y-2.5">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between text-xs"
              >
                <div>
                  <h4 className="font-bold text-stone-900">{fav.name}</h4>
                  <p className="text-[11px] text-stone-600 mt-0.5">
                    {fav.estimatedCalories} kcal • {fav.protein}g Protein • {fav.ingredients.length} malzeme
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveFavorite(fav)}
                  className="p-2 text-rose-500 hover:text-rose-700 transition"
                  title="Favorilerden çıkar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Data Backup & Reset */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-stone-900">Veri Yönetimi & Yedekleme</h3>
        <p className="text-[11px] text-stone-500 leading-relaxed">
          Tüm verileriniz tarayıcınızın yerel depolama alanında güvenle tutulur. Cihaz değiştirirken JSON yedeği alıp yükleyebilirsiniz.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleExportBackup}
            className="p-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-4 h-4 text-stone-600" />
            Yedeği İndir (JSON)
          </button>

          <label className="p-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer text-center">
            <Upload className="w-4 h-4 text-stone-600" />
            Yedeği Yükle
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
          </label>
        </div>

        <div className="pt-3 border-t border-stone-100">
          <button
            onClick={handleClearAll}
            className="w-full py-2.5 px-4 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Kullanıcı Verilerini Sıfırla (Malzeme Kütüphanesi Korunur)
          </button>
        </div>
      </div>

      {/* App & Medical Note */}
      <div className="text-center text-stone-600 text-[11px] pt-2">
        <p>NutriShake v1.0.0 • iPhone Safari ve PWA Uyumlu</p>
        <p className="mt-0.5">Tıbbi tanı veya tedavi amacıyla kullanılmaz.</p>
      </div>
    </div>
  );
};
