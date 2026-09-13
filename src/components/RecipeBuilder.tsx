import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Sliders,
  Check,
  Search,
  Flame,
  Coins,
  ChevronRight,
  RotateCcw,
  Target,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Ingredient, PortionPreference, Shake, ShakeIngredient } from '../types';
import { INGREDIENT_MAP, INGREDIENTS_DATABASE, searchIngredients } from '../data/ingredients';
import { calculateShakeNutrition } from '../utils/nutritionEngine';
import { buildInitialRecipe, adjustRecipeToTargetCalories } from '../engines/recipeBuilderEngine';
import { saveCustomRecipe } from '../store/storage';

interface RecipeBuilderProps {
  remainingKcal: number;
  portionPreference: PortionPreference;
  onAddShakeToPlan: (shake: Shake) => void;
  onClose?: () => void;
}

export const RecipeBuilder: React.FC<RecipeBuilderProps> = ({
  remainingKcal,
  portionPreference,
  onAddShakeToPlan,
  onClose,
}) => {
  // Selected ingredients
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([
    'fruit_banana',
    'dairy_whole_milk',
    'grain_oats',
    'molasses_grape',
  ]);

  // Current recipe ingredients with gram amounts
  const [recipeItems, setRecipeItems] = useState<ShakeIngredient[]>(() =>
    buildInitialRecipe(['fruit_banana', 'dairy_whole_milk', 'grain_oats', 'molasses_grape'], portionPreference)
  );

  const [recipeName, setRecipeName] = useState<string>('Özel Ev Yapımı Shake');
  const [targetKcalInput, setTargetKcalInput] = useState<number>(Math.max(300, remainingKcal || 650));
  const [targetMessage, setTargetMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Real-time deterministic nutrition calculation
  const currentNutrition = useMemo(() => {
    return calculateShakeNutrition(recipeItems);
  }, [recipeItems]);

  // Generate sensible baseline recipe portions
  const handleGenerateBasePortions = () => {
    const items = buildInitialRecipe(selectedIngredientIds, portionPreference);
    setRecipeItems(items);
    setTargetMessage('Malzemelerin doğal porsiyonlarına göre dengeli gramajlar oluşturuldu.');
    setTimeout(() => setTargetMessage(null), 3000);
  };

  // Adjust to target calories mode (Requirement 13)
  const handleAdjustToTarget = () => {
    if (recipeItems.length === 0) return;

    const result = adjustRecipeToTargetCalories(recipeItems, targetKcalInput, portionPreference);
    setRecipeItems(result.adjustedIngredients);
    setTargetMessage(result.message);
    setTimeout(() => setTargetMessage(null), 4000);
  };

  // Step quantity
  const handleStepQuantity = (idx: number, delta: number) => {
    setRecipeItems((prev) => {
      const next = [...prev];
      const item = next[idx];
      const step = item.unit === 'adet' || item.unit === 'dilim' ? 1 : 10;
      const currentQty = item.quantity !== undefined ? item.quantity : item.amount;
      const newQty = Math.max(5, currentQty + delta * step);
      next[idx] = {
        ...item,
        quantity: newQty,
        amount: newQty,
      };
      return next;
    });
  };

  // Direct quantity change
  const handleQuantityChange = (idx: number, val: number) => {
    if (isNaN(val) || val < 1) return;
    setRecipeItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: val,
        amount: val,
      };
      return next;
    });
  };

  // Remove ingredient
  const handleRemoveIngredient = (idx: number) => {
    const removedId = recipeItems[idx]?.ingredientId;
    setRecipeItems((prev) => prev.filter((_, i) => i !== idx));
    if (removedId) {
      setSelectedIngredientIds((prev) => prev.filter((id) => id !== removedId));
    }
  };

  // Add ingredient from modal
  const handleAddIngredient = (ing: Ingredient) => {
    if (selectedIngredientIds.includes(ing.id)) return;

    const newIds = [...selectedIngredientIds, ing.id];
    setSelectedIngredientIds(newIds);

    const defaultUnit = ing.defaultServingUnit || (ing.category === 'dairy' ? 'ml' : 'g');
    const defaultAmount = ing.defaultServing || 50;

    setRecipeItems((prev) => [
      ...prev,
      {
        ingredientId: ing.id,
        amount: defaultAmount,
        quantity: defaultAmount,
        unit: defaultUnit,
      },
    ]);

    setShowAddModal(false);
    setSearchQuery('');
  };

  // Save as custom shake & add to plan
  const handleAddCurrentToPlan = () => {
    if (recipeItems.length === 0) return;

    const finalShake: Shake = {
      id: `custom_${Date.now()}`,
      name: recipeName || 'Özel Ev Yapımı Shake',
      description: 'Kendi seçtiğiniz taze malzemeler ve hassas gramajlarla hazırlanan ev yapımı shake.',
      ingredients: currentNutrition.ingredients,
      estimatedCalories: currentNutrition.calories,
      protein: currentNutrition.protein,
      carbs: currentNutrition.carbs,
      fat: currentNutrition.fat,
      fiber: currentNutrition.fiber,
      estimatedCost: currentNutrition.estimatedCost,
      totalVolumeMl: currentNutrition.totalVolumeMl,
      instructions: 'Tüm malzemeleri blender haznesine aktarın. Pürüzsüz ve homojen bir kıvam elde edene dek yaklaşık 45-60 saniye yüksek hızda karıştırın. Taze ve soğuk olarak tüketin.',
      preparationTimeMinutes: 3,
      portionSize: portionPreference,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };

    saveCustomRecipe(finalShake);
    onAddShakeToPlan(finalShake);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose?.();
    }, 1200);
  };

  const filteredSearch = searchIngredients(searchQuery);

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-stone-200 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-stone-900 leading-tight">
              Kendi Shake'ini Oluştur
            </h3>
            <p className="text-[11px] text-stone-500">
              Malzemeleri seçin, gramajları anında canlı ayarlayın veya hedef kaloriye eşitleyin
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Recipe Name Input */}
      <div>
        <label className="text-[11px] font-bold text-stone-700 block mb-1">
          Tarif Başlığı
        </label>
        <input
          type="text"
          value={recipeName}
          onChange={(e) => setRecipeName(e.target.value)}
          placeholder="Örn: Fındıklı Muzlu Enerji Deposu"
          className="w-full px-3.5 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 text-stone-900 font-medium"
        />
      </div>

      {/* Real-time Macro Bar */}
      <div className="bg-stone-900 text-white rounded-2xl p-3.5 sm:p-4">
        <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-2 flex items-center justify-between">
          <span>Canlı Besin Değerleri (AI Olmadan, Anında)</span>
          <span className="text-stone-400">~{currentNutrition.estimatedCost} TL</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-center">
          <div className="bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-stone-400 font-semibold">Kalori</div>
            <div className="text-base sm:text-lg font-black text-white">{currentNutrition.calories}</div>
            <div className="text-[9px] text-stone-400">kcal</div>
          </div>
          <div className="bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-emerald-400 font-semibold">Protein</div>
            <div className="text-base sm:text-lg font-black text-emerald-400">{currentNutrition.protein}g</div>
          </div>
          <div className="bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-stone-400 font-semibold">Karb</div>
            <div className="text-base sm:text-lg font-black text-white">{currentNutrition.carbs}g</div>
          </div>
          <div className="bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-stone-400 font-semibold">Yağ</div>
            <div className="text-base sm:text-lg font-black text-white">{currentNutrition.fat}g</div>
          </div>
          <div className="hidden sm:block bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-stone-400 font-semibold">Lif</div>
            <div className="text-base sm:text-lg font-black text-white">{currentNutrition.fiber}g</div>
          </div>
          <div className="hidden sm:block bg-stone-800/80 p-2 rounded-xl">
            <div className="text-[10px] text-blue-300 font-semibold">Hacim</div>
            <div className="text-base sm:text-lg font-black text-blue-300">{currentNutrition.totalVolumeMl}ml</div>
          </div>
        </div>
      </div>

      {/* Target Calorie Optimization Box (Requirement 13) */}
      <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
            <Target className="w-4 h-4 text-emerald-700" />
            <span>Hedef Kaloriye Otomatik Ayarla Modu</span>
          </div>
          <button
            onClick={handleGenerateBasePortions}
            className="text-[11px] font-semibold text-emerald-800 hover:underline flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Porsiyonları Sıfırla
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={targetKcalInput}
              onChange={(e) => setTargetKcalInput(Math.max(100, Number(e.target.value)))}
              className="w-full pl-3 pr-12 py-2 text-xs font-bold bg-white border border-emerald-300 rounded-xl text-stone-900"
              placeholder="Örn: 700"
            />
            <span className="absolute right-3 top-2.5 text-[10px] font-semibold text-stone-500">
              kcal
            </span>
          </div>

          <button
            onClick={handleAdjustToTarget}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 shrink-0"
          >
            🎯 Hedefe Eşitle
          </button>
        </div>

        {/* Quick buttons */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-stone-500 text-[10px]">Hızlı Hedef:</span>
          {[500, 650, 750, remainingKcal].filter((k) => k > 100).map((kcal, idx) => (
            <button
              key={idx}
              onClick={() => {
                setTargetKcalInput(kcal);
                const res = adjustRecipeToTargetCalories(recipeItems, kcal, portionPreference);
                setRecipeItems(res.adjustedIngredients);
                setTargetMessage(res.message);
                setTimeout(() => setTargetMessage(null), 3500);
              }}
              className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-semibold hover:bg-emerald-100 transition active:scale-95"
            >
              {kcal} kcal {kcal === remainingKcal ? '(Kalan)' : ''}
            </button>
          ))}
        </div>

        {targetMessage && (
          <p className="text-[11px] text-emerald-900 font-medium bg-emerald-100/60 p-2 rounded-xl leading-tight animate-in fade-in">
            {targetMessage}
          </p>
        )}
      </div>

      {/* Selected Ingredients List with +/- steppers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-stone-800">
          <span>Seçili Malzemeler ({recipeItems.length})</span>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Malzeme Ekle
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {recipeItems.map((item, idx) => {
            const ing = INGREDIENT_MAP[item.ingredientId];
            const qty = item.quantity !== undefined ? item.quantity : item.amount;
            const unit = item.unit || 'g';

            return (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-xs gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xl">{ing?.icon || '🥣'}</span>
                  <div className="min-w-0 truncate">
                    <div className="font-bold text-stone-800 truncate">{ing?.name || item.ingredientId}</div>
                    <div className="text-[10px] text-stone-500">
                      {ing?.caloriesPer100g} kcal/100g • {ing?.categoryNameTr}
                    </div>
                  </div>
                </div>

                {/* Stepper & input */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStepQuantity(idx, -1)}
                    className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-700 font-bold hover:bg-stone-100 flex items-center justify-center active:scale-95"
                  >
                    -
                  </button>

                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                    className="w-14 text-center py-1 border border-stone-200 rounded-lg bg-white font-bold text-stone-900"
                  />

                  <span className="text-[11px] font-medium text-stone-500 w-6">{unit}</span>

                  <button
                    onClick={() => handleStepQuantity(idx, 1)}
                    className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-700 font-bold hover:bg-stone-100 flex items-center justify-center active:scale-95"
                  >
                    +
                  </button>

                  <button
                    onClick={() => handleRemoveIngredient(idx)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {recipeItems.length === 0 && (
            <div className="text-center py-8 text-xs text-stone-400 border border-dashed border-stone-200 rounded-2xl">
              Henüz malzeme eklenmedi. Yukarıdaki "Malzeme Ekle" butonuna dokunarak shake tarifinizi oluşturun.
            </div>
          )}
        </div>
      </div>

      {/* Save Action Buttons */}
      <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
        {savedSuccess && (
          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Plana Eklendi!
          </span>
        )}

        <button
          disabled={recipeItems.length === 0}
          onClick={handleAddCurrentToPlan}
          className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          <span>Bu Tarifi Günün Planına Ekle</span>
        </button>
      </div>

      {/* Ingredient Picker Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-xl border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h4 className="text-sm font-bold text-stone-900">Tarife Malzeme Ekle</h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Ürün ara (muz, yulaf, fındık, pekmez...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50 focus:bg-white text-stone-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredSearch.map((ing) => {
                const isSelected = selectedIngredientIds.includes(ing.id);
                return (
                  <button
                    key={ing.id}
                    disabled={isSelected}
                    onClick={() => handleAddIngredient(ing)}
                    className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-stone-50 border-stone-100 opacity-50 cursor-not-allowed'
                        : 'border-stone-100 hover:border-emerald-200 hover:bg-emerald-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl">{ing.icon || '🥣'}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-stone-800 truncate">
                          {ing.name} {ing.isRegional && '📍'}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {ing.caloriesPer100g} kcal/100g • {ing.categoryNameTr}
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-emerald-700 shrink-0">
                      {isSelected ? 'Eklendi' : '+ Seç'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
