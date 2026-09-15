import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Store,
  Truck,
  PlusCircle,
  Search,
  User,
  ShieldCheck,
  Package,
  Layers,
  MessageCircle,
  Sparkles,
  Menu,
  X
} from 'lucide-react';
import { BrandMark, useBrand } from '../lib/brand';
import { LanguageSelector } from './LanguageSelector';
import { useI18n } from '../lib/i18n';
import { getAuthToken } from '../lib/api';

interface GlobalHeaderProps {
  onSearch?: (query: string) => void;
  initialSearch?: string;
  showSearch?: boolean;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  onSearch,
  initialSearch = '',
  showSearch = true
}) => {
  const { t, language } = useI18n();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = Boolean(getAuthToken());
  const isMarketplaceRoute = location.pathname.startsWith('/marketplace');
  const isOmnichannelRoute = location.pathname.startsWith('/omnichannel');
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const headerLanguage = language.startsWith('it') ? 'it' : language.startsWith('en') ? 'en' : language.startsWith('fr') ? 'fr' : 'es';
  const omnichannelAnnouncement = {
    es: { badge: 'NUEVO', label: 'Omnicanal + AI', text: 'WhatsApp, Instagram, Facebook y Telegram en un solo lugar.', cta: 'Descubrir' },
    it: { badge: 'NOVITÀ', label: 'Omnicanale + AI', text: 'WhatsApp, Instagram, Facebook e Telegram in un unico spazio.', cta: 'Scopri' },
    en: { badge: 'NEW', label: 'Omnichannel + AI', text: 'WhatsApp, Instagram, Facebook and Telegram in one place.', cta: 'Discover' },
    fr: { badge: 'NOUVEAU', label: 'Omnicanal + IA', text: 'WhatsApp, Instagram, Facebook et Telegram au même endroit.', cta: 'Découvrir' }
  }[headerLanguage];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchValue);
    } else {
      navigate(`/marketplace?q=${encodeURIComponent(searchValue)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 dark:bg-dark-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
      {/* Animated omnichannel announcement */}
      <div className="bg-gradient-to-r from-slate-950 via-blue-900 to-cyan-800 text-white text-[11px] px-4 font-bold">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <Link to="/omnichannel" className="group flex min-h-11 min-w-0 items-center gap-2.5 py-1.5 hover:text-cyan-100" aria-label={`${omnichannelAnnouncement.label}: ${omnichannelAnnouncement.cta}`}>
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110">
              <MessageCircle className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 animate-pulse text-amber-300" aria-hidden="true" />
            </span>
            <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-950 shadow-sm shadow-amber-400/30 animate-pulse">
              {omnichannelAnnouncement.badge}
            </span>
            <span className="truncate text-[11px] font-black sm:text-xs">{omnichannelAnnouncement.label}</span>
            <span className="hidden truncate font-semibold text-blue-100 md:inline">— {omnichannelAnnouncement.text}</span>
            <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black text-white transition-colors group-hover:bg-white/20 sm:inline-flex">{omnichannelAnnouncement.cta} <span aria-hidden="true">→</span></span>
          </Link>
          <div className="hidden md:flex items-center gap-4 text-[10px] text-blue-200">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" /> {t('marketplace_buyer_protection') || 'Protezione acquirente'}</span>
            <span className="flex items-center gap-1"><Truck className="w-3 h-3 text-blue-300" /> Corrieri Express 24-48h</span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <BrandMark iconClassName="w-8 h-8 rounded-xl shadow-sm group-hover:scale-105 transition-transform" textClassName="text-xl font-black text-slate-900 dark:text-white tracking-tight" />
          </Link>
          <div className="hidden lg:flex items-center gap-1 font-bold text-xs text-slate-600 dark:text-slate-300">
            <Link to="/panel/quote" className="px-3 py-1.5 rounded-lg hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('header_quote') || 'Preventivo'}
            </Link>
            <Link to="/tracking" className="px-3 py-1.5 rounded-lg hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('header_tracking') || 'Tracciamento'}
            </Link>
            <Link to="/marketplace" className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${isMarketplaceRoute ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-black shadow-sm' : 'hover:text-blue-600 dark:hover:text-blue-400'}`}>
              <Store className="w-3.5 h-3.5" />
              <span>{t('header_marketplace') || 'Marketplace'}</span>
            </Link>
            <Link to="/omnichannel" className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${isOmnichannelRoute ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/50 font-black' : 'hover:text-blue-600 dark:hover:text-blue-400'}`}>
              <Sparkles className="h-3.5 w-3.5 text-cyan-500 transition-transform group-hover:rotate-12" aria-hidden="true" />
              <span>{omnichannelAnnouncement.label.replace(' + AI', '').replace(' + IA', '')}</span>
              <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300 animate-pulse">{omnichannelAnnouncement.badge}</span>
            </Link>
          </div>
        </div>

        {/* Search Bar in Header */}
        {showSearch && (
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg relative hidden sm:block">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={language === 'it' ? 'Cerca prodotti, console, tecnologia...' : 'Buscar productos, marcas, ciudades...'}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-dark-900 text-slate-900 dark:text-white transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </form>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <LanguageSelector compact={true} />

          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <Link
                to="/panel/marketplace"
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{language === 'it' ? 'Vendi' : 'Vender'}</span>
              </Link>
              <Link
                to="/panel"
                className="px-3.5 py-2 rounded-full text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>{language === 'it' ? 'Mio Pannello' : 'Mi Panel'}</span>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/auth/login"
                className="px-3.5 py-2 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 transition-colors"
              >
                {t('header_login') || 'Accedi'}
              </Link>
              <Link
                to="/auth/register"
                className="px-4 py-2 rounded-full text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
              >
                {t('header_register') || 'Registrati'}
              </Link>
            </div>
          )}

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-900 p-4 space-y-3">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={language === 'it' ? 'Cerca nel marketplace...' : 'Buscar en el marketplace...'}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </form>

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-bold">
            <Link
              to="/panel/quote"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 rounded-xl bg-slate-50 dark:bg-dark-800 flex items-center gap-2"
            >
              <Truck className="w-4 h-4 text-blue-600" />
              <span>{t('header_quote') || 'Preventivo'}</span>
            </Link>
            <Link
              to="/marketplace"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center gap-2"
            >
              <Store className="w-4 h-4 text-blue-600" />
              <span>Marketplace</span>
            </Link>
            <Link
              to="/tracking"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 rounded-xl bg-slate-50 dark:bg-dark-800 flex items-center gap-2"
            >
              <Package className="w-4 h-4 text-indigo-600" />
              <span>{t('header_tracking') || 'Tracciamento'}</span>
            </Link>
            <Link
              to="/omnichannel"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-cyan-600" />
              <span>{language === 'it' ? 'Omnicanale + AI' : language === 'fr' ? 'Omnicanal + IA' : language === 'en' ? 'Omnichannel + AI' : 'Omnicanal + AI'}</span>
            </Link>
            <Link
              to="/panel/marketplace"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>{language === 'it' ? 'Vendi Prodotto' : 'Vender Producto'}</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
