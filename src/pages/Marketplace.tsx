import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  Truck,
  Heart,
  Store,
  ChevronRight,
  ShieldCheck,
  Tag,
  MapPin,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
  PlusCircle,
  Package,
  Layers,
  CheckCircle2,
  X,
  RotateCcw,
  BadgeCheck
} from 'lucide-react';
import { api, getAuthToken } from '../lib/api';
import { BrandMark, useBrand } from '../lib/brand';
import { LanguageSelector } from '../components/LanguageSelector';
import { GlobalHeader } from '../components/GlobalHeader';
import { GlobalFooter } from '../components/GlobalFooter';
import { useI18n } from '../lib/i18n';

const CONDITIONS: Record<string, { label: string; color: string }> = {
  new: { label: 'Nuevo con etiqueta', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  like_new: { label: 'Como nuevo', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  excellent: { label: 'Excelente estado', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  good: { label: 'Buen estado', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  used: { label: 'Usado', color: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  repair: { label: 'Para piezas / reparar', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' }
};

const COUNTRIES = [
  { code: '', label: 'Todos los países', flag: '🌍' },
  { code: 'ES', label: 'España', flag: '🇪🇸' },
  { code: 'IT', label: 'Italia', flag: '🇮🇹' },
  { code: 'DE', label: 'Alemania', flag: '🇩🇪' },
  { code: 'GB', label: 'Reino Unido', flag: '🇬🇧' }
];

const CONDITION_TRANSLATION_KEYS: Record<string, string> = {
  new: 'marketplace_condition_new',
  like_new: 'marketplace_condition_like_new',
  excellent: 'marketplace_condition_excellent',
  good: 'marketplace_condition_good',
  used: 'marketplace_condition_used',
  repair: 'marketplace_condition_repair'
};

const COUNTRY_TRANSLATION_KEYS: Record<string, string> = {
  '': 'marketplace_all_countries', ES: 'marketplace_country_spain', IT: 'marketplace_country_italy', DE: 'marketplace_country_germany', GB: 'marketplace_country_uk'
};

const localizedConditionLabel = (condition: string, translate: (key: string) => string) =>
  translate(CONDITION_TRANSLATION_KEYS[condition] || '') || CONDITIONS[condition]?.label || condition;

const localizedCountryLabel = (code: string, translate: (key: string) => string) =>
  translate(COUNTRY_TRANSLATION_KEYS[code] || '') || COUNTRIES.find((country) => country.code === code)?.label || code;

export function Marketplace() {
  const { brand } = useBrand();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  // Filter state
  const currentCategory = searchParams.get('categoria') || '';
  const currentSearch = searchParams.get('q') || '';
  const currentCountry = searchParams.get('pais') || '';
  const currentCondition = searchParams.get('condicion') || '';
  const currentMinPrice = searchParams.get('min') || '';
  const currentMaxPrice = searchParams.get('max') || '';
  const currentSort = searchParams.get('orden') || 'newest';
  const hasShipping = searchParams.get('envio') === '1';

  const [searchInput, setSearchInput] = useState(currentSearch);
  const [minPriceInput, setMinPriceInput] = useState(currentMinPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(currentMaxPrice);
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  const isLoggedIn = Boolean(getAuthToken());

  const { t, language } = useI18n();

  useEffect(() => {
    const langCode = language?.startsWith('it') ? 'it' : language?.startsWith('de') ? 'de' : language?.startsWith('en') ? 'en' : 'es';
    api.getMarketplaceCategories(langCode)
      .then(res => setCategories(res.categories || []))
      .catch(() => {});
  }, [language]);

  useEffect(() => {
    loadListings();
  }, [currentCategory, currentSearch, currentCountry, currentCondition, currentMinPrice, currentMaxPrice, currentSort, hasShipping]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: 28,
        sort: currentSort
      };
      if (currentCategory) params.categorySlug = currentCategory;
      if (currentSearch) params.search = currentSearch;
      if (currentCountry) params.countryCode = currentCountry;
      if (currentCondition) params.condition = currentCondition;
      if (currentMinPrice) params.minPrice = Number(currentMinPrice);
      if (currentMaxPrice) params.maxPrice = Number(currentMaxPrice);
      if (hasShipping) params.hasShipping = true;

      const res = await api.getMarketplaceListings(params);
      setListings(res.listings || []);
      setTotal(res.total || 0);
    } catch {
      setListings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) newParams.set('q', searchInput.trim());
    else newParams.delete('q');
    setSearchParams(newParams);
  };

  const handlePriceApply = () => {
    const newParams = new URLSearchParams(searchParams);
    if (minPriceInput && Number(minPriceInput) > 0) newParams.set('min', minPriceInput);
    else newParams.delete('min');

    if (maxPriceInput && Number(maxPriceInput) > 0) newParams.set('max', maxPriceInput);
    else newParams.delete('max');

    setSearchParams(newParams);
    setShowFiltersModal(false);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSearchParams(new URLSearchParams());
  };

  const setCategoryFilter = (slug: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (slug) newParams.set('categoria', slug);
    else newParams.delete('categoria');
    setSearchParams(newParams);
  };

  const setCountryFilter = (code: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (code) newParams.set('pais', code);
    else newParams.delete('pais');
    setSearchParams(newParams);
  };

  const setConditionFilter = (cond: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (cond) newParams.set('condicion', cond);
    else newParams.delete('condicion');
    setSearchParams(newParams);
  };

  const toggleShippingOnly = () => {
    const newParams = new URLSearchParams(searchParams);
    if (hasShipping) newParams.delete('envio');
    else newParams.set('envio', '1');
    setSearchParams(newParams);
  };

  const setSortFilter = (sort: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('orden', sort);
    setSearchParams(newParams);
  };

  const toggleFavorite = async (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      navigate('/auth/login', { state: { from: window.location.pathname } });
      return;
    }
    try {
      const res = await api.toggleMarketplaceFavorite(listingId);
      setFavorites(prev => ({ ...prev, [listingId]: res.isFavorite }));
    } catch {}
  };

  const hasActiveFilters = Boolean(currentCategory || currentSearch || currentCountry || currentCondition || currentMinPrice || currentMaxPrice || hasShipping);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
      {/* Unified Global Header with dynamic welcome and language selector */}
      <GlobalHeader
        initialSearch={searchInput}
        onSearch={(q) => {
          setSearchInput(q);
          const newParams = new URLSearchParams(searchParams);
          if (q.trim()) newParams.set('q', q.trim());
          else newParams.delete('q');
          setSearchParams(newParams);
        }}
      />

      {/* Categories Horizontal Bar */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-dark-900/80 backdrop-blur-sm sticky top-[98px] z-30 overflow-x-auto scrollbar-none shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              !currentCategory
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-dark-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('marketplace_all_categories') || 'Tutte le categorie'}</span>
          </button>
          {categories.map(cat => {
            const active = currentCategory === cat.slug;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.slug)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-dark-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300'
                }`}
              >
                <span>{cat.icon || '📦'}</span>
                <span>{cat.translated_name || cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hero Banner for Marketplace */}
      <section className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white py-8 sm:py-10 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{t('marketplace_hero_badge') || (language === 'it' ? 'Ecosistema Logistico + Compravendita Sicura' : 'Ecosistema Logístico + Compra & Venta Segura')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              {language === 'it' ? (
                <>Compra e vendi con <span className="underline decoration-blue-300">spedizioni DoorDrop</span> integrate.</>
              ) : (
                <>Compra y vende con <span className="underline decoration-blue-300">envíos DoorDrop</span> integrados.</>
              )}
            </h1>
            <p className="text-sm sm:text-base text-blue-100 font-medium leading-relaxed">
              {t('marketplace_hero_desc') || (language === 'it'
                ? 'Catalogo verificato con preventivi automatici, protezione totale dell\'acquirente ed etichette ufficiali dei corrieri in tutta Europa.'
                : 'Catálogo verificado con cotizaciones automáticas, protección al comprador del 100% y etiquetas oficiales con transportistas líderes en toda Europa.')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link
              to="/panel/marketplace"
              className="px-6 py-3.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-black text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Store className="w-4 h-4" />
              <span>{t('marketplace_sell_free') || (language === 'it' ? 'Inizia a vendere gratis' : 'Empezar a vender gratis')}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Quick Filter Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className="text-slate-900 dark:text-white font-extrabold text-sm">{total} {total === 1 ? t('marketplace_product_one') : t('marketplace_product_many')}</span>
            
            {currentCategory && (
              <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center gap-1 font-semibold">
                {t('marketplace_filter_category')}: {categories.find(c => c.slug === currentCategory)?.translated_name || currentCategory}
                <button onClick={() => setCategoryFilter('')} className="ml-1 hover:text-red-500">×</button>
              </span>
            )}
            {currentCountry && (
              <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center gap-1 font-semibold">
                {t('marketplace_filter_country')}: {localizedCountryLabel(currentCountry, t)}
                <button onClick={() => setCountryFilter('')} className="ml-1 hover:text-red-500">×</button>
              </span>
            )}
            {currentCondition && (
              <span className="px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 flex items-center gap-1 font-semibold">
                {localizedConditionLabel(currentCondition, t)}
                <button onClick={() => setConditionFilter('')} className="ml-1 hover:text-red-500">×</button>
              </span>
            )}
            {(currentMinPrice || currentMaxPrice) && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 font-semibold">
                {t('marketplace_filter_price')}: {currentMinPrice || '0'}€ - {currentMaxPrice || '∞'}€
                <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('min'); p.delete('max'); setSearchParams(p); }} className="ml-1 hover:text-red-500">×</button>
              </span>
            )}
            {hasShipping && (
              <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white flex items-center gap-1 font-semibold">
                <Truck className="w-3 h-3" />
                {t('marketplace_with_shipping') || t('marketplace_with_shipments_label')}
                <button onClick={toggleShippingOnly} className="ml-1 hover:text-red-200">×</button>
              </span>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline ml-2 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {t('marketplace_clean_filters')}
              </button>
            )}
          </div>

          {/* Controls Right */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
            {/* Shipping Toggle Pill */}
            <button
              onClick={toggleShippingOnly}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                hasShipping
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{t('marketplace_with_shipments_label')}</span>
            </button>

            {/* Filter Modal Button */}
            <button
              onClick={() => setShowFiltersModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
              <span>{t('marketplace_advanced_filters')}</span>
            </button>

            {/* Country Selector */}
            <div className="flex items-center gap-1">
              {COUNTRIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => setCountryFilter(c.code)}
                  title={c.label}
                  className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentCountry === c.code
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm mr-1">{c.flag}</span>
                  <span className="hidden md:inline">{c.code || t('marketplace_all_short')}</span>
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <select
              value={currentSort}
              onChange={e => setSortFilter(e.target.value)}
              className="text-xs font-bold bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
            >
              <option value="newest">{t('marketplace_sort_newest')}</option>
              <option value="price_asc">{t('marketplace_sort_price_asc')}</option>
              <option value="price_desc">{t('marketplace_sort_price_desc')}</option>
              <option value="popular">{t('marketplace_sort_popular')}</option>
            </select>
          </div>
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 animate-pulse">
                <div className="w-full aspect-square bg-slate-200 dark:bg-slate-700 rounded-xl" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
            <Package className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t('marketplace_no_products')}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-6">
              {t('marketplace_no_products_desc')}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={clearAllFilters}
                className="px-5 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs"
              >
                {t('marketplace_clear_all_filters')}
              </button>
              <Link
                to="/panel/marketplace"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('marketplace_publish_item')}</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {listings.map(item => {
              const price = (item.price_minor / 100).toFixed(2);
              // Never substitute a stock photo for a real listing image. The API
              // returns the provider's original URL when one is available.
              const cover = item.images?.[0]?.url || null;
              const conditionCode = item.condition || 'good';
              const cond = CONDITIONS[conditionCode] || CONDITIONS.good;
              const isFav = favorites[item.id];

              return (
                <Link
                  key={item.id}
                  to={`/marketplace/producto/${item.slug || item.id}`}
                  className="group bg-white dark:bg-dark-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400 dark:hover:border-blue-500 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
                >
                  {/* Image container */}
                  <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {cover ? (
                      <img
                        src={cover}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                        <Package className="w-10 h-10" aria-hidden="true" />
                         <span className="text-[11px] font-semibold">{t('marketplace_image_unavailable')}</span>
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
                      {item.shipping_available === 1 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-600 text-white backdrop-blur-md shadow-md">
                          <Truck className="w-3 h-3" />
                          <span>{t('marketplace_shipping_badge')}</span>
                        </span>
                      )}
                    </div>

                    {/* Favorite Button */}
                    <button
                      onClick={e => toggleFavorite(item.id, e)}
                      className={`absolute top-2.5 right-2.5 p-2 rounded-full backdrop-blur-md transition-all ${
                        isFav
                          ? 'bg-rose-500 text-white'
                          : 'bg-black/35 hover:bg-black/55 text-white'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>

                    {/* Condition badge */}
                    <div className="absolute bottom-2.5 left-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${cond.color} shadow-sm backdrop-blur-sm`}>
                        {localizedConditionLabel(conditionCode, t)}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-2.5">
                    <div>
                      {/* Price & Currency */}
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                          {price} {item.currency}
                        </span>
                        {item.negotiable === 1 && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                             {t('marketplace_negotiable')}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 mt-1 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.title}
                      </h4>
                    </div>

                    {/* Footer / Location & Seller */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1 truncate max-w-[65%]">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{item.city}, {item.country_code}</span>
                      </div>
                      {item.seller?.verification_level === 'verified' && (
                        <div className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-bold shrink-0" title="Vendedor verificado">
                          <ShieldCheck className="w-3.5 h-3.5" />
                           <span className="text-[10px]">{t('marketplace_verified_short')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Advanced Filters Modal */}
      {showFiltersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>{t('marketplace_search_filters')}</span>
              </h3>
              <button onClick={() => setShowFiltersModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rango de precio */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('marketplace_price_range')}</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="number"
                    value={minPriceInput}
                    onChange={e => setMinPriceInput(e.target.value)}
                    placeholder={t('marketplace_price_min')}
                    className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={maxPriceInput}
                    onChange={e => setMaxPriceInput(e.target.value)}
                    placeholder={t('marketplace_price_max')}
                    className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Estado del producto */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('marketplace_condition')}</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CONDITIONS).map(([key, info]) => {
                  const selected = currentCondition === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setConditionFilter(selected ? '' : key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        selected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {localizedConditionLabel(key, t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                {t('marketplace_reset')}
              </button>
              <button
                type="button"
                onClick={handlePriceApply}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md"
              >
                {t('marketplace_apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Global Footer */}
      <GlobalFooter />
    </div>
  );
}
