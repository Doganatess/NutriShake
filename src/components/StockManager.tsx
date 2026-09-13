import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Plus,
  Trash2,
  Edit2,
  Search,
  History,
  TrendingUp,
  AlertCircle,
  Check,
  X,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { StockItem, SupportedUnit, StockTransaction } from '../types';
import {
  INGREDIENT_MAP,
  INGREDIENTS_DATABASE,
  searchIngredients,
  canonicalIngredientId,
} from '../data/ingredients';
import {
  getStoredStock,
  saveStoredStock,
  getStoredStockTransactions,
} from '../storage/storageAbstraction';
import {
  addOrReplenishStock,
  setExactStock,
  removeStockItem,
} from '../engines/stockEngine';
import { formatNormalizedUnit } from '../utils/unitConverter';

interface StockManagerProps {
  onStockChange?: () => void;
}

export const StockManager: React.FC<StockManagerProps> = ({ onStockChange }) => {
  const [stock, setStock] = useState<Record<string, StockItem>>(() => getStoredStock());
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Add Item State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');
  const [inputAmount, setInputAmount] = useState<string>('1');
  const [selectedUnit, setSelectedUnit] = useState<SupportedUnit>('adet');
  const [addNote, setAddNote] = useState<string>('');

  const refreshStock = () => {
    const fresh = getStoredStock();
    setStock(fresh);
    if (onStockChange) onStockChange();
  };

  useEffect(() => {
    const handleStockUpdate = () => {
      refreshStock();
    };
    window.addEventListener('nutrishake-stock-changed', handleStockUpdate);
    window.addEventListener('storage', handleStockUpdate);
    return () => {
      window.removeEventListener('nutrishake-stock-changed', handleStockUpdate);
      window.removeEventListener('storage', handleStockUpdate);
    };
  }, []);

  const stockList = useMemo(() => {
    return (Object.values(stock) as StockItem[])
      .filter((item) => item && (item.amount > 0 || (item.normalizedGramsOrMl && item.normalizedGramsOrMl > 0)))
      .map((item) => {
        const ing = INGREDIENT_MAP[item.ingredientId] || INGREDIENT_MAP[canonicalIngredientId(item.ingredientId)];
        const formatted = formatNormalizedUnit(item.normalizedGramsOrMl, ing, item.unit);
        return {
          ...item,
          ing,
          displayAmount: formatted.amount,
          displayUnit: formatted.unit,
          displayString: formatted.display,
        };
      });
  }, [stock]);

  // Filtered ingredients for search in modal
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return INGREDIENTS_DATABASE.slice(0, 10);
    return searchIngredients(searchQuery).slice(0, 10);
  }, [searchQuery]);

  const selectedIngredient = useMemo(() => {
    return selectedIngredientId ? INGREDIENT_MAP[selectedIngredientId] : null;
  }, [selectedIngredientId]);

  // When ingredient changes, set sensible default unit
  const handleSelectIngredient = (id: string) => {
    setSelectedIngredientId(id);
    const ing = INGREDIENT_MAP[id];
    if (ing) {
      if (ing.category === 'dairy' || ing.id === 'other_water') {
        setSelectedUnit('L');
        setInputAmount('1');
      } else if (ing.category === 'grains' || ing.category === 'sweeteners') {
        setSelectedUnit('kg');
        setInputAmount('1');
      } else if (ing.units && ing.units.some((u) => u.unit === 'adet')) {
        setSelectedUnit('adet');
        setInputAmount('3');
      } else {
        setSelectedUnit('g');
        setInputAmount('250');
      }
    }
  };

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngredientId) return;
    const amountNum = parseFloat(inputAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    addOrReplenishStock(selectedIngredientId, amountNum, selectedUnit, addNote || undefined);
    refreshStock();

    // Reset & Close
    setShowAddModal(false);
    setSelectedIngredientId('');
    setSearchQuery('');
    setInputAmount('1');
    setAddNote('');
  };

  const handleQuickAdjust = (ingredientId: string, delta: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const current = stock[ingredientId];
    if (!current) return;

    const newAmount = Math.max(0, current.amount + delta);

    if (newAmount === 0) {
      handleDelete(ingredientId, e);
    } else {
      setExactStock(ingredientId, newAmount, current.unit);
      refreshStock();
    }
  };

  const handleDelete = (ingredientId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    // 1. Remove from persistence (storage)
    removeStockItem(ingredientId);

    // 2. Immediately update local state so UI updates instantly
    setStock((prev) => {
      const next = { ...prev };
      delete next[ingredientId];
      const canon = canonicalIngredientId(ingredientId);
      delete next[canon];
      for (const k of Object.keys(next)) {
        if (k === ingredientId || k === canon || canonicalIngredientId(k) === canon) {
          delete next[k];
        }
      }
      return next;
    });

    if (onStockChange) onStockChange();
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-stone-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-700" />
            Mutfak Stoğum (Kiler)
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {stockList.length === 0
              ? 'Kileriniz henüz boş. Elinizdeki malzemeleri ekleyin.'
              : `${stockList.length} aktif malzeme kayıtlı.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="p-2.5 rounded-2xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition"
            title="Stok Geçmişi / Hareketleri"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Stoğa Ekle
          </button>
        </div>
      </div>

      {/* Empty State */}
      {stockList.length === 0 && (
        <div className="p-8 text-center bg-stone-50 rounded-3xl border border-dashed border-stone-300">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-900 mb-1">Kilerinizde Henüz Malzeme Yok</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto mb-4 leading-relaxed">
            NutriShake Pro'nun size özel tarifler hazırlayabilmesi için mutfağınızda bulunan malzemeleri ve miktarlarını (ör. 3 adet Muz, 2 L Süt, 1 kg Yulaf) ekleyin.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            İlk Malzemeyi Ekle
          </button>
        </div>
      )}

      {/* Stock Items Grid */}
      {stockList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stockList.map((item) => (
            <div
              key={item.ingredientId}
              className="p-4 rounded-3xl border border-stone-200 bg-white shadow-2xs hover:border-stone-300 transition flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{item.ing?.icon || '🥣'}</span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-stone-900 truncate">
                      {item.ing?.name || item.ingredientId}
                    </h4>
                    <span className="text-[10px] uppercase font-bold text-stone-400">
                      {item.ing?.categoryNameTr}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-lg font-black text-emerald-800">
                    {item.displayAmount}
                  </span>
                  <span className="text-xs font-bold text-stone-600">
                    {item.displayUnit}
                  </span>
                  {item.unit !== 'g' && item.unit !== 'ml' && (
                    <span className="text-[10px] text-stone-400 ml-1">
                      (~{Math.round(item.normalizedGramsOrMl)}{item.ing?.category === 'dairy' ? 'ml' : 'g'})
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => handleQuickAdjust(item.ingredientId, -1, e)}
                  className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 font-bold hover:bg-stone-200 flex items-center justify-center text-sm transition cursor-pointer"
                  title="Azalt"
                  id={`stock-decrease-${item.ingredientId}`}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={(e) => handleQuickAdjust(item.ingredientId, 1, e)}
                  className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 font-bold hover:bg-stone-200 flex items-center justify-center text-sm transition cursor-pointer"
                  title="Arttır"
                  id={`stock-increase-${item.ingredientId}`}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(item.ingredientId, e)}
                  className="w-8 h-8 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition ml-1 cursor-pointer"
                  title="Kiler Stoğundan Kaldır"
                  id={`stock-delete-${item.ingredientId}`}
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-700" />
                Kilere Malzeme Ekle
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStock} className="space-y-4">
              {/* Ingredient Search */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Malzeme Ara & Seç
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Örnek: Muz, Tam Yağlı Süt, Yulaf, Çam Balı..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-stone-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-hidden bg-stone-50"
                  />
                </div>

                {/* Candidate list */}
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1 border border-stone-100 rounded-2xl p-1 bg-stone-50/50">
                  {searchResults.map((ing) => (
                    <button
                      type="button"
                      key={ing.id}
                      onClick={() => handleSelectIngredient(ing.id)}
                      className={`w-full p-2 rounded-xl text-left text-xs flex items-center justify-between transition ${
                        selectedIngredientId === ing.id
                          ? 'bg-emerald-700 text-white font-bold'
                          : 'hover:bg-white text-stone-800'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span>{ing.icon}</span>
                        <span>{ing.name}</span>
                      </span>
                      <span className={`text-[10px] ${selectedIngredientId === ing.id ? 'text-emerald-200' : 'text-stone-400'}`}>
                        {ing.categoryNameTr}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedIngredient && (
                <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-xs text-emerald-950 flex items-center gap-2">
                  <span className="text-xl">{selectedIngredient.icon}</span>
                  <div>
                    <strong>{selectedIngredient.name}</strong> seçildi.
                    <div className="text-[11px] text-emerald-800">
                      {selectedIngredient.preparationNotes || 'Doğal kiler malzemesi.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Amount & Unit Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Miktar
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    required
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-stone-200 text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-hidden"
                    placeholder="Ör: 3 veya 0.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Birim
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value as SupportedUnit)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-stone-200 text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-hidden bg-white"
                  >
                    <option value="adet">adet</option>
                    <option value="kg">kg</option>
                    <option value="g">g (gram)</option>
                    <option value="L">L (Litre)</option>
                    <option value="ml">ml</option>
                    <option value="yemek kaşığı">yemek kaşığı</option>
                    <option value="tatlı kaşığı">tatlı kaşığı</option>
                    <option value="çay kaşığı">çay kaşığı</option>
                    <option value="porsiyon">porsiyon</option>
                    <option value="dilim">dilim</option>
                  </select>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Not (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  placeholder="Ör: Marketten taze alındı"
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-hidden"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-2xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={!selectedIngredientId}
                  className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs"
                >
                  Stoğa Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transactions History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-700" />
                Stok Hareketleri (İşlem Günlüğü)
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {getStoredStockTransactions().length === 0 ? (
                <p className="text-xs text-stone-500 text-center py-6">
                  Henüz kaydedilmiş stok hareketi bulunmamaktadır.
                </p>
              ) : (
                getStoredStockTransactions().map((tx) => {
                  const ing = INGREDIENT_MAP[tx.ingredientId];
                  const isPositive = tx.amount > 0;

                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-2xl border border-stone-100 bg-stone-50 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                            isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-stone-900">
                            {ing?.name || tx.ingredientId}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {tx.date} • {tx.note || (isPositive ? 'Stok girişi' : 'Tarif tüketimi')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-black ${
                            isPositive ? 'text-emerald-700' : 'text-amber-800'
                          }`}
                        >
                          {isPositive ? '+' : ''}{tx.amount} {tx.unit}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
