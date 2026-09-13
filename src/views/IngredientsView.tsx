import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Check,
  Sparkles,
  Info,
  X,
  RotateCcw,
  MapPin,
  Package,
  BookOpen,
  Plus,
} from 'lucide-react';
import {
  IngredientState,
  IngredientCategory,
} from '../types';
import {
  INGREDIENTS_DATABASE,
  INGREDIENT_CATEGORIES,
  searchIngredients,
} from '../data/ingredients';
import { saveStoredIngredientStates } from '../storage/storageAbstraction';
import { StockManager } from '../components/StockManager';
import { addOrReplenishStock } from '../engines/stockEngine';

interface IngredientsViewProps {
  ingredientStates: Record<string, IngredientState>;
  onUpdateStates: (newStates: Record<string, IngredientState>) => void;
}

export const IngredientsView: React.FC<IngredientsViewProps> = ({
  ingredientStates,
  onUpdateStates,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'library'>('stock');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSweetenerSubCategory, setSelectedSweetenerSubCategory] = useState<'all' | 'jams' | 'honeys' | 'molasses'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'mandatory' | 'allowed' | 'regional'>('all');
  const [quickAddedId, setQuickAddedId] = useState<string | null>(null);

  // Count summaries
  const counts = useMemo(() => {
    let mandatory = 0;
    let allowed = 0;
    let regional = 0;

    INGREDIENTS_DATABASE.forEach((item) => {
      const state = ingredientStates[item.id] || 'allowed';
      if (state === 'mandatory') mandatory++;
      else allowed++;

      if (item.isRegional) regional++;
    });

    return { mandatory, allowed, regional };
  }, [ingredientStates]);

  // Filtered ingredients
  const filteredIngredients = useMemo(() => {
    const baseList = selectedCategory !== 'all'
      ? INGREDIENTS_DATABASE.filter((item) => {
          if (item.category !== selectedCategory) return false;
          if (selectedCategory === 'sweeteners' && selectedSweetenerSubCategory !== 'all') {
            return item.subCategory === selectedSweetenerSubCategory;
          }
          return true;
        })
      : INGREDIENTS_DATABASE;
    let list = searchIngredients(searchQuery, baseList);

    if (statusFilter === 'mandatory') {
      list = list.filter((item) => ingredientStates[item.id] === 'mandatory');
    } else if (statusFilter === 'allowed') {
      list = list.filter((item) => !ingredientStates[item.id] || ingredientStates[item.id] === 'allowed');
    } else if (statusFilter === 'regional') {
      list = list.filter((item) => item.isRegional);
    }

    return list;
  }, [searchQuery, selectedCategory, statusFilter, ingredientStates]);

  const handleSetState = (ingredientId: string, state: IngredientState) => {
    const updated = {
      ...ingredientStates,
      [ingredientId]: state,
    };
    saveStoredIngredientStates(updated);
    onUpdateStates(updated);
  };

  const handleResetAllToAllowed = () => {
    const updated: Record<string, IngredientState> = {};
    INGREDIENTS_DATABASE.forEach((ing) => {
      updated[ing.id] = 'allowed';
    });
    saveStoredIngredientStates(updated);
    onUpdateStates(updated);
  };

  const handleQuickAddToStock = (ing: typeof INGREDIENTS_DATABASE[0]) => {
    const unit = ing.units && ing.units.length > 0 ? ing.units[0].unit : 'adet';
    const amount = ing.defaultServing || 1;
    addOrReplenishStock(ing.id, amount, unit, 'Kütüphaneden hızlı eklendi');
    setQuickAddedId(ing.id);
    setTimeout(() => setQuickAddedId(null), 1800);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Primary Sub-Navigation: Kilerim vs Malzeme Kütüphanesi */}
      <div className="flex bg-stone-100 p-1.5 rounded-3xl border border-stone-200">
        <button
          onClick={() => setActiveSubTab('stock')}
          className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeSubTab === 'stock'
              ? 'bg-white text-emerald-800 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Mutfak Stoğum (Kiler)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('library')}
          className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeSubTab === 'library'
              ? 'bg-white text-emerald-800 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Malzeme Kütüphanesi (8 Kategori)</span>
        </button>
      </div>

      {/* TAB 1: Stock Pantry Manager */}
      {activeSubTab === 'stock' && <StockManager />}

      {/* TAB 2: Static Ingredients Database Library */}
      {activeSubTab === 'library' && (
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-emerald-400" />
                Türkiye & Bölgesel Malzeme Kütüphanesi (8 Kategori)
              </span>
              <button
                onClick={handleResetAllToAllowed}
                className="text-[11px] text-stone-400 hover:text-white flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3 h-3" />
                Sıfırla
              </button>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              Malzeme Tercihleri ve Kuralları
            </h2>
            <p className="text-xs text-stone-300 mt-1 leading-relaxed">
              Zorunlu kıldığınız malzemeler tariflerde önceliklendirilir. Kilerinizde bulunan malzemelerle dengeli tarifler hazırlanır. İstediğiniz malzemeyi tek tıkla kilerinize ekleyebilirsiniz.
            </p>

            {/* Status Filter Badges */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-stone-800 text-center">
              <button
                onClick={() => setStatusFilter(statusFilter === 'mandatory' ? 'all' : 'mandatory')}
                className={`rounded-2xl p-2 transition text-left sm:text-center ${
                  statusFilter === 'mandatory'
                    ? 'bg-emerald-800 border-2 border-emerald-400'
                    : 'bg-emerald-950/70 border border-emerald-800/80 hover:bg-emerald-900/60'
                }`}
              >
                <div className="text-[10px] text-emerald-400 uppercase font-semibold">Zorunlu</div>
                <div className="text-base sm:text-lg font-bold text-emerald-300 mt-0.5">{counts.mandatory}</div>
                <div className="text-[9px] text-emerald-400/80 truncate">Mutlaka kat</div>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'allowed' ? 'all' : 'allowed')}
                className={`rounded-2xl p-2 transition text-left sm:text-center ${
                  statusFilter === 'allowed'
                    ? 'bg-stone-700 border-2 border-white'
                    : 'bg-stone-800/80 border border-stone-700/80 hover:bg-stone-700/60'
                }`}
              >
                <div className="text-[10px] text-stone-300 uppercase font-semibold">Serbest</div>
                <div className="text-base sm:text-lg font-bold text-white mt-0.5">{counts.allowed}</div>
                <div className="text-[9px] text-stone-400 truncate">Gerekirse seç</div>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'regional' ? 'all' : 'regional')}
                className={`rounded-2xl p-2 transition text-left sm:text-center ${
                  statusFilter === 'regional'
                    ? 'bg-amber-800 border-2 border-amber-300'
                    : 'bg-amber-950/70 border border-amber-800/80 hover:bg-amber-900/60'
                }`}
              >
                <div className="text-[10px] text-amber-300 uppercase font-semibold">📍 Yöresel</div>
                <div className="text-base sm:text-lg font-bold text-amber-200 mt-0.5">{counts.regional}</div>
                <div className="text-[9px] text-amber-300/80 truncate">Ordu / Karadeniz</div>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Malzeme kütüphanesinde ara (Muz, fındık, tam yağlı süt, yulaf, kestane balı, çilek reçeli)..."
              className="w-full pl-10 pr-10 py-3 bg-white border border-stone-200 rounded-2xl text-xs text-stone-900 placeholder:text-stone-400 shadow-2xs focus:outline-hidden focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 8 Strict Category Horizontal Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {INGREDIENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  if (cat.id !== 'sweeteners') setSelectedSweetenerSubCategory('all');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.nameTr}</span>
              </button>
            ))}
          </div>

          {/* TATLANDIRICILAR 3 ALT SEKME YAPISI: Reçeller, Ballar, Pekmezler */}
          {selectedCategory === 'sweeteners' && (
            <div className="p-1.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-amber-900 px-2 shrink-0">Tatlandırıcılar:</span>
              <button
                onClick={() => setSelectedSweetenerSubCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                  selectedSweetenerSubCategory === 'all'
                    ? 'bg-white text-amber-950 shadow-xs font-bold border border-amber-300'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
              >
                Tümü (19)
              </button>
              <button
                onClick={() => setSelectedSweetenerSubCategory('jams')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1 ${
                  selectedSweetenerSubCategory === 'jams'
                    ? 'bg-white text-rose-900 shadow-xs font-bold border border-rose-300'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <span>🍓</span> Reçeller (10)
              </button>
              <button
                onClick={() => setSelectedSweetenerSubCategory('honeys')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1 ${
                  selectedSweetenerSubCategory === 'honeys'
                    ? 'bg-white text-amber-900 shadow-xs font-bold border border-amber-300'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <span>🍯</span> Ballar (3)
              </button>
              <button
                onClick={() => setSelectedSweetenerSubCategory('molasses')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1 ${
                  selectedSweetenerSubCategory === 'molasses'
                    ? 'bg-white text-stone-950 shadow-xs font-bold border border-stone-400'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <span>🫗</span> Pekmezler (6)
              </button>
            </div>
          )}

          {/* List of Ingredients */}
          <div className="space-y-2.5">
            <div className="text-xs text-stone-500 font-medium px-1 flex items-center justify-between">
              <span>Toplam {filteredIngredients.length} malzeme listelendi</span>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="text-[11px] text-emerald-700 font-semibold hover:underline"
                >
                  Filtreyi Temizle
                </button>
              )}
            </div>

            {filteredIngredients.map((ing) => {
              const currentState = ingredientStates[ing.id] || 'allowed';
              const isAdded = quickAddedId === ing.id;

              return (
                <div
                  key={ing.id}
                  className={`p-3.5 sm:p-4 rounded-3xl border transition bg-white shadow-2xs ${
                    currentState === 'mandatory'
                      ? 'border-emerald-400 ring-1 ring-emerald-400/30'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-stone-400">
                          {ing.categoryNameTr}
                        </span>
                        {ing.isRegional && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            <MapPin className="w-2.5 h-2.5" />
                            Ordu / Karadeniz
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400">•</span>
                        <span className="text-[10px] text-stone-500">
                          Standart Porsiyon: {ing.defaultServing} {ing.defaultServingUnit || ing.unit}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xl">{ing.icon || '🥣'}</span>
                        <h3 className="text-sm font-bold text-stone-900 leading-snug">
                          {ing.name}
                        </h3>
                      </div>

                      {ing.preparationNotes && (
                        <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                          {ing.preparationNotes}
                        </p>
                      )}

                      {/* Macro bar */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-600 mt-2">
                        <span className="font-bold text-emerald-800">
                          {ing.caloriesPer100g} kcal <span className="font-normal text-stone-400">/ 100g</span>
                        </span>
                        <span>P: <strong>{ing.proteinPer100g}g</strong></span>
                        <span>K: <strong>{ing.carbsPer100g}g</strong></span>
                        <span>Y: <strong>{ing.fatPer100g}g</strong></span>
                        {ing.fiberPer100g !== undefined && ing.fiberPer100g > 0 && (
                          <span>Lif: <strong>{ing.fiberPer100g}g</strong></span>
                        )}
                        {ing.estimatedPrice !== undefined && ing.estimatedPrice > 0 && (
                          <span className="text-stone-400 text-[10px]">~{ing.estimatedPrice} {ing.priceUnit || 'TL/kg'}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions: Quick Stock Add + 3-State Filter */}
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                      <button
                        onClick={() => handleQuickAddToStock(ing)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          isAdded
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title="Bu malzemeyi kiler stoğuna ekle"
                      >
                        {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {isAdded ? 'Eklendi!' : 'Stoğa Ekle'}
                      </button>

                      <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-2xl">
                        <button
                          onClick={() => handleSetState(ing.id, 'mandatory')}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                            currentState === 'mandatory'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-stone-600 hover:text-emerald-700'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          Zorunlu
                        </button>

                        <button
                          onClick={() => handleSetState(ing.id, 'allowed')}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition ${
                            currentState === 'allowed'
                              ? 'bg-white text-stone-900 font-bold shadow-xs'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          Serbest
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
