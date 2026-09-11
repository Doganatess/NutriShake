import React, { useState } from 'react';
import {
  CheckCircle2,
  Heart,
  Star,
  ThumbsDown,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Sliders,
  Plus,
  Trash2,
  X,
  Search,
  RotateCcw,
  Coins,
  AlertTriangle,
  Package,
} from 'lucide-react';
import { Shake, ShakeIngredient, Ingredient, ShakeRating } from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE, searchIngredients } from '../data/ingredients';
import { calculateShakeNutrition, calculateIngredientNutrition } from '../utils/nutritionEngine';
import { validateRecipeStock, getStockAmountNormalized } from '../engines/stockEngine';

interface ShakeCardProps {
  shake: Shake;
  index: number;
  onToggleComplete: (shakeId: string) => void;
  onTogglePortion?: (shakeId: string, portionNumber: 1 | 2) => void;
  onToggleFavorite: (shake: Shake) => void;
  onDislikeShake: (shake: Shake, reason?: string) => void;
  onReplaceShake: (shake: Shake) => void;
  onUpdateShake?: (updatedShake: Shake) => void;
  onRateShake?: (shake: Shake, rating: ShakeRating) => void;
  isReplacing?: boolean;
}

export const ShakeCard: React.FC<ShakeCardProps> = ({
  shake,
  index,
  onToggleComplete,
  onTogglePortion,
  onToggleFavorite,
  onDislikeShake,
  onReplaceShake,
  onUpdateShake,
  onRateShake,
  isReplacing = false,
}) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showDislikePrompt, setShowDislikePrompt] = useState<boolean>(false);
  const [dislikeReason, setDislikeReason] = useState<string>('');
  const [currentRating, setCurrentRating] = useState<ShakeRating | undefined>(shake.rating);

  // Editing state
  const [editIngredients, setEditIngredients] = useState<ShakeIngredient[]>(shake.ingredients);
  const [showAddIngredientModal, setShowAddIngredientModal] = useState<boolean>(false);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState<number | null>(null);
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState<string>('');

  // Real-time calculation of edited shake
  const currentNutrition = calculateShakeNutrition(isEditing ? editIngredients : shake.ingredients);

  // Real-time Stock Check
  const stockValidation = validateRecipeStock(
    (isEditing ? editIngredients : shake.ingredients).map((i) => ({
      ingredientId: i.ingredientId,
      amount: i.amount || (i.quantity ? i.quantity : 0),
    }))
  );

  const handleConfirmDislike = () => {
    onDislikeShake(shake, dislikeReason || 'Genel olarak beğenilmedi');
    setShowDislikePrompt(false);
  };

  // Start editing: clone ingredients
  const handleStartEdit = () => {
    setEditIngredients(
      shake.ingredients.map((item) => ({
        ...item,
        quantity: item.quantity !== undefined ? item.quantity : item.amount,
        unit: item.unit || 'g',
      }))
    );
    setIsEditing(true);
    setShowDetails(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditIngredients(shake.ingredients);
    setIsEditing(false);
  };

  // Save changes via deterministic recalculation (NO AI API CALL)
  const handleSaveEdit = () => {
    if (!onUpdateShake) return;

    if (!stockValidation.isValid) {
      const missingNames = stockValidation.missing.map((m) => m.ingredientName).join(', ');
      alert(`Stok yetersiz: ${missingNames}. Stokta olmayan veya yetersiz miktardaki ürün shake'e eklenemez.`);
      return;
    }

    const recalculated = calculateShakeNutrition(editIngredients);
    const updatedShake: Shake = {
      ...shake,
      ingredients: recalculated.ingredients,
      estimatedCalories: recalculated.calories,
      protein: recalculated.protein,
      carbs: recalculated.carbs,
      fat: recalculated.fat,
      fiber: recalculated.fiber,
      estimatedCost: recalculated.estimatedCost,
      totalVolumeMl: recalculated.totalVolumeMl,
    };

    onUpdateShake(updatedShake);
    setIsEditing(false);
  };

  // Change quantity of an ingredient
  const handleQuantityChange = (idx: number, newQty: number) => {
    if (newQty < 1) return;
    setEditIngredients((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: newQty,
        amount: newQty,
      };
      return next;
    });
  };

  // Step quantity (+/- 5g or 10g or 1 unit)
  const handleStepQuantity = (idx: number, delta: number) => {
    const item = editIngredients[idx];
    const currentQty = item.quantity !== undefined ? item.quantity : item.amount;
    const isUnitDiscrete = item.unit === 'adet' || item.unit === 'dilim' || item.unit === 'ölçek' || item.unit === 'avuç';
    const step = isUnitDiscrete ? 1 : 10;
    const newQty = Math.max(1, currentQty + delta * step);
    handleQuantityChange(idx, newQty);
  };

  // Change unit of an ingredient
  const handleUnitChange = (idx: number, newUnit: string) => {
    setEditIngredients((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        unit: newUnit,
      };
      return next;
    });
  };

  // Remove ingredient
  const handleRemoveIngredient = (idx: number) => {
    if (editIngredients.length <= 1) {
      alert('Tarifte en az 1 malzeme kalmalıdır.');
      return;
    }
    setEditIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  // Select ingredient from search (either replacing or adding)
  const handleSelectIngredient = (ingredient: Ingredient) => {
    const available = getStockAmountNormalized(ingredient.id);
    if (available <= 0) {
      alert(`"${ingredient.name}" kiler stoklarınızda bulunmuyor. Stok kuralı gereği stokta olmayan veya 0 gram olan ürün shake'e eklenemez.`);
      return;
    }

    if (replaceTargetIndex !== null) {
      // Replace existing ingredient
      setEditIngredients((prev) => {
        const next = [...prev];
        const safeAmount = Math.min(ingredient.defaultServing || 50, available);
        next[replaceTargetIndex] = {
          ingredientId: ingredient.id,
          amount: safeAmount,
          quantity: safeAmount,
          unit: ingredient.defaultServingUnit || 'g',
        };
        return next;
      });
      setReplaceTargetIndex(null);
    } else {
      // Add new ingredient
      const safeAmount = Math.min(ingredient.defaultServing || 50, available);
      setEditIngredients((prev) => [
        ...prev,
        {
          ingredientId: ingredient.id,
          amount: safeAmount,
          quantity: safeAmount,
          unit: ingredient.defaultServingUnit || 'g',
        },
      ]);
    }
    setShowAddIngredientModal(false);
    setIngredientSearchQuery('');
  };

  const filteredSearchIngredients = searchIngredients(ingredientSearchQuery);

  return (
    <div
      className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
        shake.isCompleted
          ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
          : isEditing
          ? 'bg-white border-emerald-400 ring-2 ring-emerald-100 shadow-md'
          : 'bg-white border-stone-200 shadow-xs hover:border-emerald-200'
      }`}
    >
      {/* Top Banner */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800">
                🥤 Shake #{index + 1} • {shake.portionSize === 'small' ? 'Küçük' : shake.portionSize === 'large' ? 'Büyük' : 'Orta'} Porsiyon
              </span>
              <span className="flex items-center gap-1 text-[11px] text-stone-500 font-medium">
                <Clock className="w-3 h-3 text-stone-400" />
                {shake.preparationTimeMinutes || 3} dk
              </span>
            </div>

            <h3
              className={`text-base sm:text-lg font-bold truncate ${
                shake.isCompleted ? 'text-emerald-950 line-through decoration-emerald-500' : 'text-stone-900'
              }`}
            >
              {shake.name}
            </h3>

            {shake.description && (
              <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">
                {shake.description}
              </p>
            )}
          </div>

          {/* Action Buttons (Edit & Favorite) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onUpdateShake && !shake.isCompleted && (
              <button
                onClick={isEditing ? handleCancelEdit : handleStartEdit}
                className={`p-2 rounded-2xl border transition active:scale-95 text-xs font-semibold flex items-center gap-1 ${
                  isEditing
                    ? 'bg-stone-100 border-stone-300 text-stone-700'
                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:text-emerald-700 hover:border-emerald-200'
                }`}
                title={isEditing ? 'Düzenlemeyi İptal Et' : 'Tarifi Düzenle (Miktar/Ürün)'}
              >
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline">{isEditing ? 'İptal' : 'Düzenle'}</span>
              </button>
            )}

            <button
              onClick={() => onToggleFavorite(shake)}
              className={`p-2 rounded-2xl border transition active:scale-95 ${
                shake.isFavorite
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-stone-50 border-stone-200 text-stone-400 hover:text-stone-600'
              }`}
              title={shake.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            >
              <Heart className={`w-4 h-4 ${shake.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Nutritional Macro Pill Bar (Real-time recalculation) */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-3 text-center">
          <div className="bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">🔥 Kalori</div>
            <div className="text-sm font-bold text-stone-900 mt-0.5">
              {currentNutrition.calories} <span className="text-[10px] font-normal text-stone-500">kcal</span>
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">💪 Protein</div>
            <div className="text-sm font-bold text-emerald-700 mt-0.5">{currentNutrition.protein}g</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">🍚 Karb</div>
            <div className="text-sm font-bold text-stone-800 mt-0.5">{currentNutrition.carbs}g</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">🥑 Yağ</div>
            <div className="text-sm font-bold text-stone-800 mt-0.5">{currentNutrition.fat}g</div>
          </div>
          <div className="hidden sm:block bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">🌾 Lif</div>
            <div className="text-sm font-bold text-stone-800 mt-0.5">{currentNutrition.fiber || 0}g</div>
          </div>
          <div className="hidden sm:block bg-stone-50 rounded-xl p-2 border border-stone-100">
            <div className="text-[10px] text-stone-500 uppercase font-semibold">💧 Hacim</div>
            <div className="text-sm font-bold text-blue-700 mt-0.5">{currentNutrition.totalVolumeMl || 300}ml</div>
          </div>
        </div>

        {/* Cost & Volume Indicator (Requirements 14 & 28) */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-stone-500 px-1">
          <div className="flex items-center gap-1 font-medium text-emerald-800 bg-emerald-50/70 px-2 py-0.5 rounded-lg border border-emerald-100">
            <Coins className="w-3 h-3 text-emerald-600" />
            <span>Tahmini Maliyet: ~{currentNutrition.estimatedCost || 35} TL</span>
          </div>
          <div className="text-stone-400">
            Kıvam: <span className="font-semibold text-stone-700">{currentNutrition.totalVolumeMl && currentNutrition.totalVolumeMl > 550 ? 'Büyük boy, akışkan' : 'İçimi dengeli kıvam'}</span>
          </div>
        </div>

        {/* Stock Shortage Warning */}
        {!stockValidation.isValid && !shake.isCompleted && (
          <div className="mt-2.5 p-2.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="font-bold">Kiler Stoğu Yetersiz: </span>
              <span className="text-[11px] text-amber-800">
                {stockValidation.missing.map((m) => `${m.ingredientName} (${m.retailDisplayDeficit} eksik)`).join(', ')}. Lütfen kilerinizi güncelleyin veya miktarı düzenleyin.
              </span>
            </div>
          </div>
        )}

        {/* INLINE RECIPE EDITOR (Requirements 9 & 16) */}
        {isEditing ? (
          <div className="mt-4 pt-3 border-t border-emerald-100 bg-emerald-50/30 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-emerald-950">
                  Malzeme ve Miktar Düzenleme (Anında Canlı Hesaplama)
                </span>
              </div>
              <button
                onClick={() => {
                  setReplaceTargetIndex(null);
                  setShowAddIngredientModal(true);
                }}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Malzeme Ekle
              </button>
            </div>

            <div className="space-y-2">
              {editIngredients.map((item, idx) => {
                const ing = INGREDIENT_MAP[item.ingredientId];
                const rawQty = item.quantity !== undefined ? item.quantity : item.amount;
                const unit = item.unit || 'g';
                const itemMacros = calculateIngredientNutrition(item.ingredientId, rawQty, unit);

                return (
                  <div
                    key={idx}
                    className="bg-white p-2.5 sm:p-3 rounded-xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{ing?.icon || '🥣'}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-stone-900 truncate">
                          {ing?.name || item.ingredientId}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {itemMacros.calories} kcal • {itemMacros.protein}g P • {itemMacros.normalizedGrams}g
                        </div>
                      </div>
                    </div>

                    {/* Step controls & Unit Selector */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        onClick={() => handleStepQuantity(idx, -1)}
                        className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm flex items-center justify-center transition active:scale-90"
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min="1"
                        max="2000"
                        value={rawQty}
                        onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                        className="w-14 text-center font-bold text-xs py-1 px-1 border border-stone-200 rounded-lg bg-stone-50 text-stone-900"
                      />

                      <button
                        onClick={() => handleStepQuantity(idx, 1)}
                        className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm flex items-center justify-center transition active:scale-90"
                      >
                        +
                      </button>

                      {/* Unit dropdown */}
                      {ing?.units && ing.units.length > 1 ? (
                        <select
                          value={unit}
                          onChange={(e) => handleUnitChange(idx, e.target.value)}
                          className="text-[11px] font-medium py-1 px-1.5 border border-stone-200 rounded-lg bg-white text-stone-700"
                        >
                          {ing.units.map((u, uIdx) => (
                            <option key={uIdx} value={u.unit}>
                              {u.unit}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-stone-500 w-8 text-center">{unit}</span>
                      )}

                      {/* Replace button */}
                      <button
                        onClick={() => {
                          setReplaceTargetIndex(idx);
                          setShowAddIngredientModal(true);
                        }}
                        className="p-1.5 text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                        title="Bu malzemeyi başka bir ürünle değiştir"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleRemoveIngredient(idx)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Malzemeyi çıkar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save & Cancel Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-emerald-100">
              <span className="text-[11px] font-bold text-emerald-900">
                Toplam: {currentNutrition.calories} kcal ({currentNutrition.protein}g Protein)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition active:scale-95"
                >
                  ✓ Değişiklikleri Kaydet
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD VIEW: Ingredients List (Requirement 8 & 15) */
          <div className="mt-3 pt-3 border-t border-stone-100">
            <div className="text-xs font-semibold text-stone-700 mb-2 flex items-center justify-between">
              <span>İçindekiler ({shake.ingredients.length})</span>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] text-emerald-700 hover:underline flex items-center gap-0.5 font-medium"
              >
                {showDetails ? (
                  <>
                    Detayları Gizle <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Hazırlanış & Detaylar <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Clean, authentic ingredients chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {shake.ingredients.map((item, idx) => {
                const ing = INGREDIENT_MAP[item.ingredientId];
                const rawQty = item.quantity !== undefined ? item.quantity : item.amount;
                const unit = item.unit || 'g';

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-stone-50 px-2.5 py-1.5 rounded-xl border border-stone-100"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span>{ing?.icon || '🥣'}</span>
                      <span className="font-medium text-stone-800 truncate">{ing?.name || item.ingredientId}</span>
                    </div>
                    <span className="font-bold text-stone-900 shrink-0">
                      {rawQty} {unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expanded Recipe & Instructions */}
        {showDetails && !isEditing && (
          <div className="mt-3 pt-3 border-t border-dashed border-stone-200 text-xs space-y-3 animate-in fade-in">
            {/* Ingredients table with calculated macros */}
            <div className="bg-stone-50 rounded-2xl p-3 border border-stone-100">
              <div className="text-[11px] font-bold text-stone-800 mb-2">
                Besin ve Porsiyon Dağılımı (Deterministik)
              </div>
              <div className="space-y-1.5">
                {shake.ingredients.map((item, idx) => {
                  const ing = INGREDIENT_MAP[item.ingredientId];
                  const rawQty = item.quantity !== undefined ? item.quantity : item.amount;
                  const unit = item.unit || 'g';
                  const macros = calculateIngredientNutrition(item.ingredientId, rawQty, unit);

                  return (
                    <div key={idx} className="flex justify-between text-[11px] text-stone-600">
                      <span>
                        • {ing?.name || item.ingredientId} ({rawQty} {unit})
                      </span>
                      <span className="font-semibold text-stone-800">
                        {macros.calories} kcal | {macros.protein}g P
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preparation instructions */}
            <div className="bg-emerald-50/70 rounded-2xl p-3 border border-emerald-100">
              <div className="text-[11px] font-bold text-emerald-950 mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                Hazırlanış Adımları
              </div>
              <p className="text-stone-700 text-xs leading-relaxed whitespace-pre-line">
                {shake.instructions}
              </p>
            </div>
          </div>
        )}

        {/* Dislike Prompt */}
        {showDislikePrompt && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2">
            <p className="font-semibold text-rose-900">
              Bu tarifi neden beğenmediniz? (Yapay zeka benzer formülleri hafızasından çıkaracaktır)
            </p>
            <input
              type="text"
              placeholder="Örn: Kıvamı çok yoğun geldi / badem tadını sevmedim"
              value={dislikeReason}
              onChange={(e) => setDislikeReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-rose-200 rounded-xl bg-white text-stone-800"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowDislikePrompt(false)}
                className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg text-xs"
              >
                Vazgeç
              </button>
              <button
                onClick={handleConfirmDislike}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold"
              >
                Hafızaya Kaydet & Çıkar
              </button>
            </div>
          </div>
        )}

        {/* Shake Rating & Feedback (Requirement 24) */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs">
          <span className="text-[11px] font-medium text-stone-400">Puan Ver:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setCurrentRating('love');
                onRateShake?.(shake, 'love');
              }}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition active:scale-95 ${
                currentRating === 'love'
                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300'
                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
              title="Çok iyi"
            >
              ❤️ Çok iyi
            </button>
            <button
              onClick={() => {
                setCurrentRating('like');
                onRateShake?.(shake, 'like');
              }}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition active:scale-95 ${
                currentRating === 'like'
                  ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300'
                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
              title="İyi"
            >
              👍 İyi
            </button>
            <button
              onClick={() => {
                setCurrentRating('neutral');
                onRateShake?.(shake, 'neutral');
              }}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition active:scale-95 ${
                currentRating === 'neutral'
                  ? 'bg-amber-100 text-amber-800 font-bold border border-amber-300'
                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
              title="Normal"
            >
              😐 Normal
            </button>
            <button
              onClick={() => {
                setCurrentRating('dislike');
                setShowDislikePrompt(true);
              }}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition active:scale-95 ${
                currentRating === 'dislike'
                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300'
                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
              }`}
              title="Beğenmedim"
            >
              👎 Beğenmedim
            </button>
          </div>
        </div>
      </div>

      {/* Action Bar Footer (1. Öğün & 2. Öğün Controls) */}
      <div className="bg-stone-50/70 border-t border-stone-100 px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {onTogglePortion ? (
          <div className="flex-1 grid grid-cols-2 gap-2">
            <button
              onClick={() => onTogglePortion(shake.id, 1)}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 border ${
                shake.portion1Completed
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-300 hover:text-emerald-800'
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${shake.portion1Completed ? 'text-white' : 'text-stone-400'}`} />
              <span>{shake.portion1Completed ? '1. Öğün: İçildi ✓' : '1. Öğün: İçilmedi'}</span>
            </button>

            <button
              onClick={() => onTogglePortion(shake.id, 2)}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 border ${
                shake.portion2Completed
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-300 hover:text-emerald-800'
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${shake.portion2Completed ? 'text-white' : 'text-stone-400'}`} />
              <span>{shake.portion2Completed ? '2. Öğün: İçildi ✓' : '2. Öğün: İçilmedi'}</span>
            </button>
          </div>
        ) : (
          /* Fallback Single Complete button */
          <button
            onClick={() => onToggleComplete(shake.id)}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 ${
              shake.isCompleted
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-stone-200 text-stone-800 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${shake.isCompleted ? 'text-white' : 'text-stone-400'}`} />
            {shake.isCompleted ? 'İçildi (Geri Al)' : '✓ Tamamlandı Olarak İşaretle'}
          </button>
        )}

        <div className="flex items-center gap-1.5 justify-end">
          {/* Replace single shake button */}
          <button
            disabled={isReplacing || shake.isCompleted}
            onClick={() => onReplaceShake(shake)}
            className="py-2 px-3 rounded-xl border border-stone-200 bg-white hover:border-stone-300 text-stone-700 text-xs font-medium flex items-center gap-1 transition active:scale-95 disabled:opacity-40"
            title="Sadece bu shake'i AI ile yenisiyle değiştir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReplacing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Değiştir</span>
          </button>

          {/* Dislike button */}
          <button
            onClick={() => setShowDislikePrompt(true)}
            className="p-2 rounded-xl border border-stone-200 bg-white hover:border-rose-200 hover:text-rose-600 text-stone-400 text-xs transition active:scale-95"
            title="Beğenmedim (AI hafızasına kaydet)"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* INGREDIENT PICKER MODAL (FOR ADD / REPLACE) */}
      {showAddIngredientModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-xl border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h4 className="text-sm font-bold text-stone-900">
                {replaceTargetIndex !== null ? 'Malzemeyi Değiştir' : 'Yeni Malzeme Ekle'}
              </h4>
              <button
                onClick={() => {
                  setShowAddIngredientModal(false);
                  setReplaceTargetIndex(null);
                }}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="py-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ürün ara (muz, yulaf, fındık, pekmez...)"
                  value={ingredientSearchQuery}
                  onChange={(e) => setIngredientSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 text-stone-900"
                  autoFocus
                />
              </div>
            </div>

            {/* Ingredient List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredSearchIngredients.map((ing) => {
                const stockQty = getStockAmountNormalized(ing.id);
                const hasStock = stockQty > 0;
                return (
                  <button
                    key={ing.id}
                    disabled={!hasStock}
                    onClick={() => handleSelectIngredient(ing)}
                    className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition group ${
                      hasStock
                        ? 'border-stone-100 hover:border-emerald-200 hover:bg-emerald-50/40 cursor-pointer'
                        : 'border-stone-100 bg-stone-50/60 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl">{ing.icon || '🥣'}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-stone-800 group-hover:text-emerald-900 truncate">
                          {ing.name} {ing.isRegional && '📍'}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {ing.caloriesPer100g} kcal/100g • {ing.proteinPer100g}g Protein
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {hasStock ? (
                        <div>
                          <span className="text-xs font-bold text-emerald-700">Seç</span>
                          <div className="text-[9px] text-stone-400 font-medium">Stokta: {stockQty}{ing.defaultServingUnit || 'g'}</div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-md">
                          Stokta Yok
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredSearchIngredients.length === 0 && (
                <div className="text-center py-6 text-xs text-stone-400">
                  Aranan kriterde ürün bulunamadı.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
