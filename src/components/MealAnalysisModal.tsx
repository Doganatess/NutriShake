import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  AlertTriangle,
  Check,
  Trash2,
  HelpCircle,
  Plus,
  Loader2,
} from 'lucide-react';
import { MealAnalysis, DetectedFoodItem } from '../types';
import { compressImage } from '../utils/imageCompressor';
import { analyzeMealApi } from '../services/apiClient';
import { getTodayDateString, saveMeal } from '../store/storage';

interface MealAnalysisModalProps {
  onClose: () => void;
  onMealSaved: (meal: MealAnalysis) => void;
}

const MAX_PHOTOS = 4;

interface PhotoItem {
  base64Data: string;
  previewUrl: string;
}

export const MealAnalysisModal: React.FC<MealAnalysisModalProps> = ({
  onClose,
  onMealSaved,
}) => {
  // Supports 1-4 photos of the same meal (e.g. different angles, or a shot that shows
  // what's under the rice next to one that shows the whole plate) for a more accurate
  // analysis. The backend (analyzeMealMultiVision) already accepted a `photos` array;
  // this UI previously only ever sent a single image.
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const [mealType, setMealType] = useState<MealAnalysis['mealType']>('lunch');
  const [mealName, setMealName] = useState<string>('Öğle Yemeği');
  const [userNotes, setUserNotes] = useState<string>('');
  const [savePhotoInStorage, setSavePhotoInStorage] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Analysis Result states
  const [analyzed, setAnalyzed] = useState<boolean>(false);
  const [calorieMin, setCalorieMin] = useState<number>(0);
  const [calorieMax, setCalorieMax] = useState<number>(0);
  const [estimatedCalories, setEstimatedCalories] = useState<number>(0);
  const [protein, setProtein] = useState<number>(0);
  const [carbs, setCarbs] = useState<number>(0);
  const [fat, setFat] = useState<number>(0);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [detectedItems, setDetectedItems] = useState<DetectedFoodItem[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState<string>('');
  const [cookingStyleNotes, setCookingStyleNotes] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleAddPhoto = async (selectedFile: File) => {
    if (photos.length >= MAX_PHOTOS) {
      setError(`En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`);
      return;
    }
    try {
      setError(null);
      const compressed = await compressImage(selectedFile, 1024, 0.82);
      setPhotos((prev) => [...prev, { base64Data: compressed.base64Data, previewUrl: compressed.dataUrl }]);
    } catch (err: unknown) {
      console.error(err);
      setError('Görsel işlenemedi. Lütfen başka bir fotoğraf deneyin.');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = async () => {
    if (photos.length === 0) {
      setError('Lütfen önce en az bir fotoğraf çekin veya galerinizden yükleyin.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeMealApi({
        photos: photos.map((p) => p.base64Data),
        mealName,
        userNotes,
      });

      setCalorieMin(result.calorieMin);
      setCalorieMax(result.calorieMax);
      setEstimatedCalories(result.estimatedCalories);
      setProtein(Math.round(result.protein * 10) / 10);
      setCarbs(Math.round(result.carbs * 10) / 10);
      setFat(Math.round(result.fat * 10) / 10);
      setConfidence(result.confidence);
      setDetectedItems(result.detectedItems || []);
      setAnalysisSummary(result.analysisSummary || '');
      setCookingStyleNotes(result.cookingStyleNotes || '');
      setAnalyzed(true);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Öğün analizi başarısız oldu.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = (index: number) => {
    const itemToRemove = detectedItems[index];
    const next = detectedItems.filter((_, i) => i !== index);
    setDetectedItems(next);
    if (itemToRemove) {
      const newKcal = Math.max(0, estimatedCalories - (itemToRemove.estimatedCalories || 0));
      setEstimatedCalories(newKcal);
      setProtein(Math.max(0, Math.round((protein - itemToRemove.protein) * 10) / 10));
      setCarbs(Math.max(0, Math.round((carbs - itemToRemove.carbs) * 10) / 10));
      setFat(Math.max(0, Math.round((fat - itemToRemove.fat) * 10) / 10));
    }
  };

  const handleSaveMeal = () => {
    const newMeal: MealAnalysis = {
      id: `meal_${Date.now()}`,
      date: getTodayDateString(),
      mealType,
      mealName: mealName || 'Analiz Edilen Öğün',
      photoBase64: savePhotoInStorage ? photos[0]?.previewUrl : undefined,
      hasPhoto: photos.length > 0,
      estimatedCalories,
      calorieMin: Math.min(calorieMin, estimatedCalories),
      calorieMax: Math.max(calorieMax, estimatedCalories),
      protein,
      carbs,
      fat,
      confidence,
      detectedItems,
      cookingStyleNotes,
      analysisSummary,
      createdAt: new Date().toISOString(),
    };

    saveMeal(newMeal);
    onMealSaved(newMeal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-100 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                {analyzed ? 'Öğün Analiz Sonucu' : 'Fotoğrafla Öğün Analizi'}
              </h2>
              <p className="text-[11px] text-stone-500">
                {analyzed
                  ? 'Değerleri inceleyip düzenleyebilir ve gününüze kaydedebilirsiniz'
                  : 'Yapay zeka tabağınızdaki yiyecekleri ve tahmini kaloriyi inceler'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto py-4 space-y-4 flex-1">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Bir sorun oluştu</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!analyzed ? (
            /* Upload Screen */
            <div className="space-y-4">
              {/* Photo Area: up to MAX_PHOTOS thumbnails + an "add more" tile */}
              {photos.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-900 aspect-square group"
                      >
                        <img
                          src={photo.previewUrl}
                          alt={`Yemek fotoğrafı ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-stone-950/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          title="Bu fotoğrafı kaldır"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <div className="grid grid-cols-1 gap-1 aspect-square">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 transition flex items-center justify-center"
                          title="Fotoğraf ekle"
                        >
                          <Plus className="w-5 h-5 text-emerald-700" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500">
                    {photos.length < MAX_PHOTOS
                      ? `İstersen farklı açılardan ${MAX_PHOTOS - photos.length} fotoğraf daha ekleyebilirsin — analiz daha isabetli olur.`
                      : `En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsin.`}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 transition active:scale-98"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-950">Fotoğraf Çek</span>
                    <span className="text-[10px] text-emerald-700 mt-0.5">Kamera ile çek</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 hover:bg-stone-100 transition active:scale-98"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-stone-800 text-white flex items-center justify-center mb-2 shadow-xs">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-stone-900">Galeriden Seç</span>
                    <span className="text-[10px] text-stone-500 mt-0.5">Dosya yükle</span>
                  </button>
                </div>
              )}

              {/* Hidden Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAddPhoto(f);
                  e.target.value = '';
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAddPhoto(f);
                  e.target.value = '';
                }}
              />

              {/* Meal Meta */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Öğün Türü
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'breakfast', label: 'Kahvaltı' },
                      { id: 'lunch', label: 'Öğle' },
                      { id: 'dinner', label: 'Akşam' },
                      { id: 'snack', label: 'Ara Öğün' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setMealType(t.id as MealAnalysis['mealType']);
                          setMealName(t.label);
                        }}
                        className={`py-2 px-1 text-center rounded-xl border text-xs font-medium transition ${
                          mealType === t.id
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Öğün Başlığı
                  </label>
                  <input
                    type="text"
                    value={mealName}
                    onChange={(e) => setMealName(e.target.value)}
                    placeholder="Örn: Izgara Tavuk ve Bulgur Pilavı"
                    className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Ekstra Not (İsteğe bağlı)
                  </label>
                  <input
                    type="text"
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Örn: Zeytinyağlı salata, yarım porsiyon yedim"
                    className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl bg-white"
                  />
                </div>
              </div>

              {/* Disclaimer Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <p>
                  Fotoğrafla besin analizi görsel tabanlı bir <strong>tahmindir</strong>. Sos, yağ ve gizli malzemeler nedeniyle kalori aralık olarak sunulacaktır. Sonuçları dilediğiniz gibi düzenleyebilirsiniz.
                </p>
              </div>
            </div>
          ) : (
            /* Results Screen (Editable) */
            <div className="space-y-4">
              {/* Calorie Range & Average Card */}
              <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-stone-300 mb-1">
                  <span>Tahmini Enerji Değeri</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      confidence === 'high'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : confidence === 'medium'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {confidence === 'high'
                      ? 'Yüksek Güvenilirlik'
                      : confidence === 'medium'
                      ? 'Orta Güvenilirlik'
                      : 'Düşük Güvenilirlik'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-3xl font-black text-emerald-400">
                    ~{estimatedCalories}
                  </span>
                  <span className="text-sm font-medium text-stone-300">kcal (Ortalama)</span>
                </div>

                <div className="text-xs text-stone-400 mb-4">
                  Tahmini Aralık: <strong className="text-stone-200">{calorieMin} - {calorieMax} kcal</strong>
                </div>

                {/* Macro summary pills */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-800 text-center">
                  <div className="bg-stone-800/80 rounded-xl p-2">
                    <div className="text-[10px] text-stone-400">Protein</div>
                    <div className="text-sm font-bold text-white mt-0.5">{protein}g</div>
                  </div>
                  <div className="bg-stone-800/80 rounded-xl p-2">
                    <div className="text-[10px] text-stone-400">Karbonhidrat</div>
                    <div className="text-sm font-bold text-white mt-0.5">{carbs}g</div>
                  </div>
                  <div className="bg-stone-800/80 rounded-xl p-2">
                    <div className="text-[10px] text-stone-400">Yağ</div>
                    <div className="text-sm font-bold text-white mt-0.5">{fat}g</div>
                  </div>
                </div>
              </div>

              {/* AI Summary note */}
              {analysisSummary && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Beslenme Analizi
                  </div>
                  <p className="leading-relaxed">{analysisSummary}</p>
                </div>
              )}

              {/* Detected items list (Editable) */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-stone-800 mb-2">
                  <span>Tespit Edilen Yiyecekler ({detectedItems.length})</span>
                  <span className="text-[10px] font-normal text-stone-500">Silmek için çöp kutusuna dokunun</span>
                </div>

                <div className="space-y-2">
                  {detectedItems.map((item, index) => (
                    <div
                      key={index}
                      className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-stone-900">{item.name}</div>
                        <div className="text-[11px] text-stone-500">
                          {item.portion}
                          {item.estimatedGrams ? ` (~${item.estimatedGrams}g)` : ''} • {item.estimatedCalories} kcal • P: {item.protein}g | K: {item.carbs}g | Y: {item.fat}g
                          {item.fiber !== undefined ? ` | Lif: ${item.fiber}g` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(index)}
                        className="p-2 text-stone-400 hover:text-rose-600 transition rounded-lg"
                        title="Bu öğeyi çıkar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual adjustment input */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl">
                <label className="block text-xs font-semibold text-stone-800 mb-1.5">
                  Kaloriyi Düzenle (Dilerseniz el ile güncelleyin)
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-stone-500">Kalori</span>
                    <input
                      type="number"
                      value={estimatedCalories}
                      onChange={(e) => setEstimatedCalories(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-500">Protein (g)</span>
                    <input
                      type="number"
                      value={protein}
                      onChange={(e) => setProtein(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-500">Karb (g)</span>
                    <input
                      type="number"
                      value={carbs}
                      onChange={(e) => setCarbs(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-500">Yağ (g)</span>
                    <input
                      type="number"
                      value={fat}
                      onChange={(e) => setFat(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Photo save checkbox */}
              {photos.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={savePhotoInStorage}
                    onChange={(e) => setSavePhotoInStorage(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span>Öğün fotoğrafını geçmişimde sakla (Dilediğinizde silebilirsiniz)</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-3 border-t border-stone-100 shrink-0">
          {!analyzed ? (
            <button
              disabled={photos.length === 0 || isLoading}
              onClick={handleStartAnalysis}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Yapay Zeka Tabağınızı İnceliyor...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {photos.length > 1 ? `${photos.length} Fotoğrafı Analiz Et` : 'Fotoğrafı Analiz Et'}
                </>
              )}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setAnalyzed(false)}
                className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl font-medium text-xs transition"
              >
                Görsele Dön
              </button>
              <button
                onClick={handleSaveMeal}
                className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
              >
                <Check className="w-4 h-4" />
                Öğünü Bugüne Kaydet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
