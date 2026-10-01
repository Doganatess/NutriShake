import React, { useEffect, useState } from 'react';
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
  LogIn,
  LogOut,
  Crown,
  CreditCard,
} from 'lucide-react';
import {
  UserProfile,
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
import { cancelSubscriptionApi, getRewardCreditsApi, getUsageApi, initializeSubscriptionCheckoutApi, loginApi, logoutApi, signupApi } from '../services/apiClient';
import { showRewardedVideo } from '../services/rewardedAds';

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
  const [currentWeightText, setCurrentWeightText] = useState(String(profile.currentWeight));
  const [targetWeightText, setTargetWeightText] = useState(String(profile.targetWeight));
  const [heightText, setHeightText] = useState(String(profile.height));
  const [dailyShakeCount, setDailyShakeCount] = useState<number>(profile.dailyShakeCount);
  const [calorieGoalText, setCalorieGoalText] = useState(String(profile.calorieGoal));
  const [proteinGoalText, setProteinGoalText] = useState(String(profile.proteinGoal));
  const [targetPaceText, setTargetPaceText] = useState(String(profile.goalSettings?.targetPace ?? profile.monthlyWeightGoalKg ?? 0.25));
  const [targetPaceUnit, setTargetPaceUnit] = useState<'kg_per_week' | 'kg_per_month'>(profile.goalSettings?.targetPaceUnit ?? 'kg_per_week');
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMode, setAccountMode] = useState<'login' | 'signup'>('login');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [weeklyShakeUsage, setWeeklyShakeUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);
  const [dailyAiUsage, setDailyAiUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);
  const [rewardCredits, setRewardCredits] = useState<number | null>(null);
  const [paymentName, setPaymentName] = useState(profile.name?.split(' ')[0] || '');
  const [paymentSurname, setPaymentSurname] = useState(profile.name?.split(' ').slice(1).join(' ') || '');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [rewardAdLoading, setRewardAdLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [weeklyShakeUsage, setWeeklyShakeUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);
  const [dailyAiUsage, setDailyAiUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);
  const [rewardCredits, setRewardCredits] = useState<number | null>(null);
  const [paymentName, setPaymentName] = useState(profile.name?.split(' ')[0] || '');
  const [paymentSurname, setPaymentSurname] = useState(profile.name?.split(' ').slice(1).join(' ') || '');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [rewardAdLoading, setRewardAdLoading] = useState(false);

  const currentWeight = Number(currentWeightText) || 0;
  const targetWeight = Number(targetWeightText) || 0;
  const height = Number(heightText) || 0;
  const targetPace = Number(targetPaceText) || 0;
  const calorieGoal = Number(calorieGoalText) || 0;
  const proteinGoal = Number(proteinGoalText) || 0;

  // AI Memory / Preferences
  const [preferences, setPreferences] = useState<UserPreference[]>(getStoredPreferences());
  const [newRuleText, setNewRuleText] = useState<string>('');

  // Favorites
  const [favorites, setFavorites] = useState<Shake[]>(getStoredFavorites());

  // Learned ingredient preferences (from favorites + love/like-rated shakes)
  const topAffinityIngredients = getIngredientAffinityScores(favorites, getStoredDailyPlans())
    .filter((a) => a.score >= 2)
    .slice(0, 8);

  const handleAccountSubmit = async () => {
    setAccountError(null);
    setAccountMessage(null);
    if (!accountEmail.trim() || accountPassword.length < 8) {
      setAccountError('E-posta adresi ve en az 8 karakterli bir şifre girin.');
      return;
    }
    setAccountLoading(true);
    try {
      const result = accountMode === 'login'
        ? await loginApi(accountEmail.trim(), accountPassword)
        : await signupApi(accountEmail.trim(), accountPassword);
      const updated = {
        ...profile,
        entitlement: result.account.entitlement,
        updatedAt: new Date().toISOString(),
      };
      saveStoredProfile(updated);
      onUpdateProfile(updated);
      setAccountPassword('');
      setAccountMessage(accountMode === 'login' ? 'Hesabınıza giriş yapıldı.' : 'Hesabınız oluşturuldu. 7 günlük Premium denemeniz başladı.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Hesap işlemi başarısız oldu.');
    } finally {
      setAccountLoading(false);
    }
  };

  const handleWatchRewardedAd = async () => {
    setAccountError(null);
    setAccountMessage(null);
    setRewardAdLoading(true);
    try {
      await showRewardedVideo(profile.id, async () => {
        const latest = await getRewardCreditsApi();
        setRewardCredits(Number(latest.credits || 0));
      });
      setAccountMessage('Reklam tamamlandı. Reward krediniz doğrulanınca hesabınıza eklendi.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Ödüllü reklam başlatılamadı.');
    } finally {
      setRewardAdLoading(false);
    }
  };

  const handleCancelPremium = async () => {
    if (!window.confirm('Premium aboneliğini iptal etmek istediğinize emin misiniz?')) return;
    setAccountError(null);
    setAccountMessage(null);
    setPaymentLoading(true);
    try {
      await cancelSubscriptionApi();
      const updated = { ...profile, entitlement: { ...profile.entitlement!, plan: 'premium' as const, status: 'active' as const, cancelAtPeriodEnd: true }, updatedAt: new Date().toISOString() };
      saveStoredProfile(updated);
      onUpdateProfile(updated);
      setAccountMessage('Premium abonelik iptali planlandı. Mevcut dönem sonuna kadar Premium erişiminiz devam eder.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Abonelik iptal edilemedi.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleStartPremium = async () => {
    setAccountError(null);
    setAccountMessage(null);
    if (!paymentName.trim() || !paymentSurname.trim() || !paymentPhone.trim()) {
      setAccountError('Premium aboneliği için ad, soyad ve telefon numarasını girin.');
      return;
    }
    const paymentWindow = window.open('', '_blank');
    if (!paymentWindow) {
      setAccountError('Ödeme penceresi tarayıcı tarafından engellendi.');
      return;
    }
    setPaymentLoading(true);
    try {
      const checkout = await initializeSubscriptionCheckoutApi({ name: paymentName.trim(), surname: paymentSurname.trim(), gsmNumber: paymentPhone.trim() });
      paymentWindow.document.open();
      paymentWindow.document.write(checkout.checkoutFormContent);
      paymentWindow.document.close();
    } catch (error) {
      paymentWindow.close();
      setAccountError(error instanceof Error ? error.message : 'Ödeme başlatılamadı.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const refreshUsageStatus = async () => {
    if (!hasServerAccount) return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      const [weekly, daily, rewards] = await Promise.all([
        getUsageApi('free_shake_weekly'),
        getUsageApi('rewarded_ai_generation_daily'),
        getRewardCreditsApi(),
      ]);
      setWeeklyShakeUsage(weekly);
      setDailyAiUsage(daily);
      setRewardCredits(Number(rewards.credits || 0));
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : 'Kullanım bilgileri alınamadı.');
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (hasServerAccount) void refreshUsageStatus();
  }, [hasServerAccount, profile.entitlement?.plan, profile.entitlement?.status]);

  const handleWatchRewardedAd = async () => {
    setAccountError(null); setAccountMessage(null); setRewardAdLoading(true);
    try {
      await showRewardedVideo(profile.id, async () => {
        const latest = await getRewardCreditsApi();
        setRewardCredits(Number(latest.credits || 0));
      });
      setAccountMessage('Reklam tamamlandı ve ödül doğrulama sürecine gönderildi.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Ödüllü reklam başlatılamadı.');
    } finally { setRewardAdLoading(false); }
  };

  const handleStartPremium = async () => {
    setAccountError(null); setAccountMessage(null);
    if (!paymentName.trim() || !paymentSurname.trim() || !paymentPhone.trim()) {
      setAccountError('Premium aboneliği için ad, soyad ve telefon numarasını girin.'); return;
    }
    const paymentWindow = window.open('', '_blank');
    if (!paymentWindow) { setAccountError('Ödeme penceresi tarayıcı tarafından engellendi.'); return; }
    setPaymentLoading(true);
    try {
      const checkout = await initializeSubscriptionCheckoutApi({ name: paymentName.trim(), surname: paymentSurname.trim(), gsmNumber: paymentPhone.trim() });
      paymentWindow.document.open(); paymentWindow.document.write(checkout.checkoutFormContent); paymentWindow.document.close();
    } catch (error) {
      paymentWindow.close(); setAccountError(error instanceof Error ? error.message : 'Ödeme başlatılamadı.');
    } finally { setPaymentLoading(false); }
  };

  const handleCancelPremium = async () => {
    if (!window.confirm('Premium aboneliğini iptal etmek istediğinize emin misiniz?')) return;
    setPaymentLoading(true); setAccountError(null); setAccountMessage(null);
    try {
      await cancelSubscriptionApi();
      const updated = { ...profile, entitlement: { ...profile.entitlement!, plan: 'premium' as const, status: 'active' as const, cancelAtPeriodEnd: true }, updatedAt: new Date().toISOString() };
      saveStoredProfile(updated); onUpdateProfile(updated);
      setAccountMessage('Premium iptali dönem sonuna planlandı.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Abonelik iptal edilemedi.');
    } finally { setPaymentLoading(false); }
  };

  const handleAccountLogout = async () => {
    setAccountError(null);
    setAccountMessage(null);
    setAccountLoading(true);
    try {
      await logoutApi();
      const updated = { ...profile, entitlement: undefined, updatedAt: new Date().toISOString() };
      saveStoredProfile(updated);
      onUpdateProfile(updated);
      setAccountMessage('Hesaptan çıkış yapıldı.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Çıkış yapılamadı.');
    } finally {
      setAccountLoading(false);
    }
  };

  const hasServerAccount = Boolean(profile.id && profile.entitlement);

  const refreshUsageStatus = async () => {
    if (!hasServerAccount) return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      const [weekly, daily, rewards] = await Promise.all([
        getUsageApi('free_shake_weekly'),
        getUsageApi('rewarded_ai_generation_daily'),
        getRewardCreditsApi(),
      ]);
      setWeeklyShakeUsage(weekly);
      setDailyAiUsage(daily);
      setRewardCredits(Number(rewards.credits) || 0);
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : 'Kullanım bilgileri alınamadı.');
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    refreshUsageStatus();
  }, [hasServerAccount]);
  const entitlementLabel = profile.entitlement?.status === 'trial'
    ? 'Premium deneme'
    : profile.entitlement?.plan === 'premium'
      ? 'Premium'
      : 'Ücretsiz';

  // Handle Profile Save
  const handleSaveProfile = () => {
    if (currentWeight <= 0 || targetWeight <= 0 || height <= 0 || calorieGoal <= 0 || proteinGoal <= 0) return;
    const pacePerWeek = targetPaceUnit === 'kg_per_week' ? targetPace : targetPace / 4.345;
    const dailyAdjustmentKcal = Math.round((pacePerWeek * 7700) / 7);
    const goalSettings = {
      ...(profile.goalSettings || {}),
      targetWeightKg: targetWeight,
      targetPace,
      targetPaceUnit,
      adjustmentKcal: profile.goal === 'gain_weight' ? dailyAdjustmentKcal : profile.goal === 'lose_weight' ? -dailyAdjustmentKcal : 0,
    };
    const updated: UserProfile = {
      ...profile,
      currentWeight,
      targetWeight,
      height,
      dailyShakeCount,
      calorieGoal,
      proteinGoal,
      goalSettings,
      monthlyWeightGoalKg: undefined,
      dailySurplusKcal: undefined,
      updatedAt: new Date().toISOString(),
    };

    saveStoredProfile(updated);
    onUpdateProfile(updated);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  // Recalculate Recommendation
  const handleRecalculateNeeds = () => {
    const rec = estimateCalorieNeeds(
      currentWeight, height, targetWeight,
      {
        workMovement: profile.workMovement,
        sportType: profile.sportType,
        sportDaysPerWeek: profile.sportDaysPerWeek,
        sportMinutesPerSession: profile.sportMinutesPerSession,
        sportIntensity: profile.sportIntensity,
        generalMovement: profile.generalMovement,
        status: 'normal',
      },
      profile.age,
      targetPaceUnit === 'kg_per_week' ? targetPace * 4.345 : targetPace,
      profile.gender,
    );
    setCalorieGoalText(String(rec.recommendedGoal));
    setProteinGoalText(String(rec.proteinGoal));
  };

  useEffect(() => {
    if (currentWeight <= 0 || targetWeight <= 0 || height <= 0) return;
    const rec = estimateCalorieNeeds(
      currentWeight, height, targetWeight,
      {
        workMovement: profile.workMovement,
        sportType: profile.sportType,
        sportDaysPerWeek: profile.sportDaysPerWeek,
        sportMinutesPerSession: profile.sportMinutesPerSession,
        sportIntensity: profile.sportIntensity,
        generalMovement: profile.generalMovement,
        status: 'normal',
      },
      profile.age,
      targetPaceUnit === 'kg_per_week' ? targetPace * 4.345 : targetPace,
      profile.gender,
    );
    setCalorieGoalText(String(rec.recommendedGoal));
    setProteinGoalText(String(rec.proteinGoal));
  }, [currentWeight, targetWeight, height, targetPace, targetPaceUnit, profile.workMovement, profile.sportType, profile.sportDaysPerWeek, profile.sportMinutesPerSession, profile.sportIntensity, profile.generalMovement, profile.age, profile.gender]);

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

      {/* Account & Subscription */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Hesap & Üyelik</h3>
          </div>
          {profile.entitlement && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-stone-100 text-stone-700">
              {entitlementLabel}
            </span>
          )}
        </div>

        {hasServerAccount ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-700">
              <div className="font-semibold text-stone-900">Sunucu hesabı aktif</div>
              <div className="mt-1">Premium ve kullanım hakları sunucu tarafından doğrulanır.</div>
              {profile.entitlement?.trialExpiresAt && (
                <div className="mt-1 text-stone-500">Deneme bitişi: {new Date(profile.entitlement.trialExpiresAt).toLocaleDateString('tr-TR')}</div>
              )}
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-stone-900">Kullanım durumu</div>
                <button onClick={refreshUsageStatus} disabled={usageLoading} className="text-[11px] font-bold text-emerald-700 disabled:opacity-50">{usageLoading ? 'Yükleniyor...' : 'Yenile'}</button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-stone-50 p-2">
                  <div className="text-stone-500">Haftalık shake</div>
                  <div className="mt-0.5 font-bold text-stone-900">{weeklyShakeUsage?.unlimited ? 'Sınırsız' : `${weeklyShakeUsage?.used ?? '—'} / ${weeklyShakeUsage?.limit ?? '—'}`}</div>
                </div>
                <div className="rounded-xl bg-stone-50 p-2">
                  <div className="text-stone-500">Günlük AI</div>
                  <div className="mt-0.5 font-bold text-stone-900">{dailyAiUsage?.unlimited ? 'Sınırsız' : `${dailyAiUsage?.used ?? '—'} / ${dailyAiUsage?.limit ?? '—'}`}</div>
                </div>
              </div>
              <div className="text-[11px] text-stone-500">Reward kredisi: <span className="font-bold text-stone-700">{rewardCredits ?? '—'}</span></div>
              {profile.entitlement?.plan !== 'premium' && (
                <button onClick={handleWatchRewardedAd} disabled={rewardAdLoading} className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-50">
                  {rewardAdLoading ? 'Reklam hazırlanıyor...' : '+1 kullanım için ödüllü reklam izle'}
                </button>
              )}
              {usageError && <div className="text-[11px] text-red-700 bg-red-50 rounded-xl p-2">{usageError}</div>}
            </div>
            <div className="rounded-2xl border border-stone-200 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-900"><CreditCard className="w-4 h-4" /> Premium & Kullanım</div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-xl bg-stone-50 p-2"><div className="text-stone-500">Haftalık shake</div><div className="font-bold">{weeklyShakeUsage?.unlimited ? 'Sınırsız' : weeklyShakeUsage ? `${weeklyShakeUsage.used}/${weeklyShakeUsage.limit}` : '—'}</div></div>
                <div className="rounded-xl bg-stone-50 p-2"><div className="text-stone-500">Günlük AI</div><div className="font-bold">{dailyAiUsage?.unlimited ? 'Sınırsız' : dailyAiUsage ? `${dailyAiUsage.used}/${dailyAiUsage.limit}` : '—'}</div></div>
                <div className="rounded-xl bg-stone-50 p-2"><div className="text-stone-500">Reward</div><div className="font-bold">{rewardCredits ?? '—'}</div></div>
              </div>
              {profile.entitlement?.plan === 'premium' && profile.entitlement.provider === 'iyzico' ? (
                <button onClick={handleCancelPremium} disabled={paymentLoading || profile.entitlement.cancelAtPeriodEnd} className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 disabled:opacity-50">{profile.entitlement.cancelAtPeriodEnd ? 'İptal dönem sonuna planlandı' : 'Premium aboneliğini iptal et'}</button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2"><input value={paymentName} onChange={e => setPaymentName(e.target.value)} placeholder="Ad" className="px-3 py-2 border border-stone-200 rounded-xl text-xs" /><input value={paymentSurname} onChange={e => setPaymentSurname(e.target.value)} placeholder="Soyad" className="px-3 py-2 border border-stone-200 rounded-xl text-xs" /></div>
                  <input value={paymentPhone} onChange={e => setPaymentPhone(e.target.value)} placeholder="Telefon" className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs" />
                  <button onClick={handleStartPremium} disabled={paymentLoading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold disabled:opacity-50"><CreditCard className="w-4 h-4" /> {paymentLoading ? 'Ödeme hazırlanıyor...' : 'Premium’a geç'}</button>
                </div>
              )}
              <div className="flex gap-2"><button onClick={refreshUsageStatus} disabled={usageLoading} className="flex-1 px-3 py-2 rounded-xl bg-stone-100 text-stone-700 text-[11px] font-bold">{usageLoading ? 'Yenileniyor...' : 'Kullanımı yenile'}</button><button onClick={handleWatchRewardedAd} disabled={rewardAdLoading} className="flex-1 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-bold">{rewardAdLoading ? 'Reklam hazırlanıyor...' : '+1 kullanım için reklam izle'}</button></div>
              {usageError && <div className="text-[11px] text-red-700 bg-red-50 rounded-xl p-2">{usageError}</div>}
            </div>
            <button onClick={handleAccountLogout} disabled={accountLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 disabled:opacity-50">
              <LogOut className="w-4 h-4" /> Çıkış Yap
            </button>
            {profile.entitlement?.provider === 'iyzico' && profile.entitlement?.subscriptionId && profile.entitlement?.status === 'active' && !profile.entitlement?.cancelAtPeriodEnd ? (
              <button onClick={handleCancelPremium} disabled={paymentLoading} className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold disabled:opacity-50">Aboneliği İptal Et</button>
            ) : null}
            {profile.entitlement?.status === 'expired' || profile.entitlement?.status === 'cancelled' || profile.entitlement?.plan === 'free' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div>
                  <div className="text-xs font-black text-stone-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-amber-700" /> Premium Aboneliği</div>
                  <div className="text-[11px] text-stone-600 mt-1">Ödeme iyzico güvenli ödeme formunda tamamlanır. Kart bilgileri NutriShake sunucusunda tutulmaz.</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={paymentName} onChange={(e) => setPaymentName(e.target.value)} placeholder="Ad" className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-white text-sm outline-none" />
                  <input value={paymentSurname} onChange={(e) => setPaymentSurname(e.target.value)} placeholder="Soyad" className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-white text-sm outline-none" />
                </div>
                <input value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} type="tel" placeholder="Telefon (+90...)" className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-white text-sm outline-none" />
                <button onClick={handleStartPremium} disabled={paymentLoading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold disabled:opacity-50">
                  <CreditCard className="w-4 h-4" /> {paymentLoading ? 'Ödeme hazırlanıyor...' : 'Premium Aboneliğini Başlat'}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-stone-600 leading-relaxed">
              Premium, kullanım limitleri ve güvenli ödeme için hesabınızı bağlayın. Hesap olmadan temel yerel verileriniz korunmaya devam eder.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setAccountMode('login')} className={`text-xs font-bold px-3 py-2 rounded-xl ${accountMode === 'login' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Giriş Yap</button>
              <button onClick={() => setAccountMode('signup')} className={`text-xs font-bold px-3 py-2 rounded-xl ${accountMode === 'signup' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Hesap Oluştur</button>
            </div>
            <input value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} type="email" placeholder="E-posta" className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-stone-50 text-sm outline-none" />
            <input value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} type="password" placeholder="Şifre (en az 8 karakter)" className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-stone-50 text-sm outline-none" />
            <button onClick={handleAccountSubmit} disabled={accountLoading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
              <LogIn className="w-4 h-4" /> {accountLoading ? 'İşleniyor...' : accountMode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
            </button>
          </div>
        )}
        {accountError && <div className="text-xs text-red-700 bg-red-50 rounded-xl p-3">{accountError}</div>}
        {accountMessage && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3">{accountMessage}</div>}
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
              value={currentWeightText}
              onChange={(e) => setCurrentWeightText(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-stone-500 focus:text-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Hedef Kilo (kg)</label>
            <input
              type="number"
              step="0.1"
              value={targetWeightText}
              onChange={(e) => setTargetWeightText(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-stone-500 focus:text-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Boy (cm)</label>
            <input
              type="number"
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-stone-500 focus:text-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Kalori Hedefi</label>
            <input
              type="number"
              value={calorieGoalText}
              onChange={(e) => setCalorieGoalText(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-stone-500 focus:text-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Protein Hedefi (g)</label>
            <input
              type="number"
              value={proteinGoalText}
              onChange={(e) => setProteinGoalText(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-stone-500 focus:text-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Hedef Temposu</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.05"
                min="0"
                value={targetPaceText}
                onChange={(e) => setTargetPaceText(e.target.value)}
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 font-bold text-emerald-800"
              />
              <select value={targetPaceUnit} onChange={(e) => setTargetPaceUnit(e.target.value as 'kg_per_week' | 'kg_per_month')} className="px-3 py-2 border border-stone-200 rounded-xl bg-stone-50 text-xs font-bold">
                <option value="kg_per_week">kg/hafta</option>
                <option value="kg_per_month">kg/ay</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-stone-600 font-medium mb-1">Günlük Shake Modeli</label>
            <div className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-100 font-semibold text-stone-500">
              1 Shake (2 Eşit Porsiyon)
            </div>
          </div>
        </div>

        {/* Aylık Hedef Projeksiyon Bilgilendirmesi */}
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-1">
          <div className="font-bold text-amber-950 flex items-center gap-1.5">
            <span>🎯</span> Hedef temposu: {targetPace} {targetPaceUnit === 'kg_per_week' ? 'kg/hafta' : 'kg/ay'}
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            Seçtiğin tempo, günlük enerji ayarına çevrilerek kalori motoruna aktarılır.
          </p>
          <p className="text-[10px] text-amber-800/90 italic leading-snug">
            * Bu plan bir hedef ve bilimsel enerji projeksiyonudur. Bireysel metabolizma hızınıza, vardiya saatlerinize ve fiziksel iş yoğunluğunuza göre gerçek kilo artışı değişkenlik gösterebilir.
          </p>
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
