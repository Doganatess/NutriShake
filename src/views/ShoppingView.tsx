import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  CheckSquare,
  Square,
  Share2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Coins,
  TrendingDown,
  Info,
} from 'lucide-react';
import { DailyPlan, ShoppingItem } from '../types';
import { generateShoppingList } from '../engines/shoppingListEngine';
import { getCostSavingSuggestions } from '../engines/costOptimizerEngine';
import { getStoredShoppingChecked, toggleShoppingChecked } from '../store/storage';
import { addOrReplenishStock, deductRecipeStock } from '../engines/stockEngine';

interface ShoppingViewProps {
  currentPlan: DailyPlan | null;
  savedPlans: Record<string, DailyPlan>;
}

export const ShoppingView: React.FC<ShoppingViewProps> = ({ currentPlan, savedPlans }) => {
  const [daysScope, setDaysScope] = useState<1 | 3 | 7>(3);
  const [checkedIds, setCheckedIds] = useState<string[]>(() => getStoredShoppingChecked());
  const [copied, setCopied] = useState<boolean>(false);
  const [showSavingsDetails, setShowSavingsDetails] = useState<boolean>(false);

  // Generate checklist using shoppingListEngine
  const shoppingList = useMemo(() => {
    return generateShoppingList(currentPlan, savedPlans, daysScope);
  }, [currentPlan, savedPlans, daysScope]);

  // Extract all ingredients in current scope for cost saving suggestions
  const allUsedIngredientIds = useMemo(() => {
    return shoppingList.items.map((i) => i.ingredientId);
  }, [shoppingList]);

  const costSavingTips = useMemo(() => {
    return getCostSavingSuggestions(allUsedIngredientIds);
  }, [allUsedIngredientIds]);

  // Toggle item checked state (adds purchased item directly to pantry stock)
  const handleToggle = (itemId: string) => {
    const isCurrentlyChecked = checkedIds.includes(itemId);
    toggleShoppingChecked(itemId);
    setCheckedIds((prev) =>
      isCurrentlyChecked ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );

    const item = shoppingList.items.find((i) => i.id === itemId);
    if (item) {
      if (!isCurrentlyChecked) {
        // Marking as purchased: Add retail amount to pantry stock
        const amountToAdd = item.totalGramsOrMl || 100;
        addOrReplenishStock(
          item.ingredientId,
          amountToAdd,
          item.unit || 'g',
          `Alışveriş listesinden satın alındı: ${item.retailDisplay || item.name}`
        );
      } else {
        // Unmarking: Reverse the addition safely
        const amountToDeduct = item.totalGramsOrMl || 100;
        deductRecipeStock(
          [{ ingredientId: item.ingredientId, amount: amountToDeduct }],
          `Alışveriş işareti geri alındı: ${item.name}`
        );
      }
    }
  };

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, typeof shoppingList.items> = {};
    shoppingList.items.forEach((item) => {
      const cat = item.category || 'Diğer';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [shoppingList]);

  // Category Turkish labels
  const categoryLabels: Record<string, string> = {
    dairy: '🥛 Süt & Süt Ürünleri',
    grains: '🌾 Tahıllar & Yulaf',
    nuts_seeds: '🌰 Fındık, Kuruyemiş & Tohumlar',
    fruits: '🍌 Taze & Kuru Meyveler',
    sweeteners: '🍯 Doğal Bal & Pekmezler',
    flavor_boosters: '🍫 Baharat & Doğal Aromalar',
    vegetables: '🥬 Yeşillik & Sebzeler',
  };

  // Copy shopping list to clipboard
  const handleCopyList = () => {
    let text = `🛒 NutriShake Market & Alışveriş Listesi (${daysScope} Günlük)\n`;
    text += `Toplam Tahmini Tutar: ~${shoppingList.totalEstimatedCost} TL\n\n`;

    (Object.entries(groupedItems) as [string, ShoppingItem[]][]).forEach(([cat, items]) => {
      text += `${categoryLabels[cat] || cat}:\n`;
      items.forEach((item) => {
        const isChecked = checkedIds.includes(item.id);
        text += `${isChecked ? '✓' : '•'} ${item.name}: ${item.retailDisplay}\n`;
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const completedCount = shoppingList.items.filter((i) => checkedIds.includes(i.id)).length;
  const totalCount = shoppingList.items.length;

  return (
    <div className="space-y-4 pb-20">
      {/* Header Card */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
          <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            Akıllı Alışveriş Listesi
          </span>
          <span className="text-[11px] text-stone-300">
            {completedCount} / {totalCount} Alındı
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
          Market & Tedarik Listesi
        </h2>

        <p className="text-xs text-stone-300 mt-1 leading-relaxed">
          Shake tariflerinizdeki gramajlar markette satın alınabilir pratik paket boyutlarına (1 kg, 1 L, 250 g) otomatik dönüştürülür.
        </p>

        {/* Scope selector */}
        <div className="grid grid-cols-3 gap-1.5 bg-stone-800 p-1.5 rounded-2xl mt-4">
          <button
            onClick={() => setDaysScope(1)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              daysScope === 1 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            Bugün İçin
          </button>
          <button
            onClick={() => setDaysScope(3)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              daysScope === 3 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            3 Günlük
          </button>
          <button
            onClick={() => setDaysScope(7)}
            className={`py-1.5 rounded-xl text-xs font-bold transition ${
              daysScope === 7 ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:text-white'
            }`}
          >
            Haftalık (7 Gün)
          </button>
        </div>

        {/* Cost Summary Bar */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-stone-800 text-xs">
          <div className="flex items-center gap-1.5 text-stone-300">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>Tahmini Sepet Tutarı:</span>
          </div>
          <span className="font-bold text-emerald-400 text-sm">
            ~{shoppingList.totalEstimatedCost} TL
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-bold text-stone-700">
          Malzemeler ({totalCount} Kalem)
        </span>

        <button
          onClick={handleCopyList}
          className="px-3 py-1.5 bg-white border border-stone-200 hover:border-emerald-300 text-stone-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition active:scale-95"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copied ? 'Kopyalandı!' : 'WhatsApp / Paylaş'}</span>
        </button>
      </div>

      {/* Cost Optimization Tips Box (Requirement 27) */}
      {costSavingTips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <TrendingDown className="w-4 h-4 text-amber-700" />
              <span>Bütçe Tasarrufu İpuçları</span>
            </div>
            <button
              onClick={() => setShowSavingsDetails(!showSavingsDetails)}
              className="text-[11px] font-semibold text-amber-800 hover:underline"
            >
              {showSavingsDetails ? 'Gizle' : 'Detayları Gör'}
            </button>
          </div>

          <p className="text-[11px] text-amber-900 leading-relaxed">
            Seçtiğiniz bazı premium malzemeler yerine aynı makro ve mineral değerini sağlayan yerel ekonomik alternatifleri tercih ederek sepetinizi yaklaşık %30-40 daha uygun fiyata getirebilirsiniz.
          </p>

          {showSavingsDetails && (
            <div className="space-y-1.5 pt-1">
              {costSavingTips.map((tip, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-white rounded-xl border border-amber-200 flex items-start gap-2"
                >
                  <span className="text-base">💡</span>
                  <div>
                    <span className="font-bold text-stone-900">
                      {tip.originalName} yerine {tip.alternativeName}:
                    </span>{' '}
                    <span className="text-stone-600">{tip.explanation}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {shoppingList.items.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-900">Alışveriş Listesi Boş</h3>
          <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1">
            Günün shake planını oluşturduğunuzda veya özel tarif tasarladığınızda gerekli tüm malzemeler burada otomatik listelenecektir.
          </p>
        </div>
      ) : (
        /* Categorized Checklist */
        <div className="space-y-3">
          {(Object.entries(groupedItems) as [string, ShoppingItem[]][]).map(([cat, items]) => (
            <div
              key={cat}
              className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs space-y-2.5"
            >
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wide border-b border-stone-100 pb-2">
                {categoryLabels[cat] || cat}
              </h4>

              <div className="space-y-1.5">
                {items.map((item) => {
                  const isChecked = checkedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggle(item.id)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition cursor-pointer active:scale-99 ${
                        isChecked
                          ? 'bg-stone-50/80 border-stone-200 opacity-60'
                          : 'bg-white border-stone-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="text-emerald-700 shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-50" />
                          ) : (
                            <Square className="w-5 h-5 text-stone-300" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div
                            className={`text-xs font-bold truncate ${
                              isChecked ? 'line-through text-stone-400' : 'text-stone-800'
                            }`}
                          >
                            {item.name}
                          </div>
                          <div className="text-[10px] text-stone-500">
                            Tarif İhtiyacı: ~{item.totalGramsOrMl}{' '}
                            {item.unit === 'ml' ? 'ml' : 'g'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-xs font-bold ${
                            isChecked
                              ? 'bg-stone-100 text-stone-400'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {item.retailDisplay}
                        </span>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          ~{item.estimatedCost} TL
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-[11px] text-stone-600 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 text-stone-400 mt-0.5" />
        <p className="leading-relaxed">
          Alışveriş listenizdeki onaylanan maddeler cihazınızda güvenle saklanır. Bir ürünü satın aldığınızda üzerine dokunarak üstünü çizebilirsiniz.
        </p>
      </div>
    </div>
  );
};
