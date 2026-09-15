import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Globe, ChevronDown, Sun, Moon, ArrowRightLeft, Search, Copy, Trash2, Plus, Lock, Box, Cpu, Rocket, MessageCircle, Sparkles } from 'lucide-react';
import { LanguageSelector } from '../components/LanguageSelector';
import { CurrencySelector } from '../components/CurrencySelector';
import { useI18n } from '../lib/i18n';
import { ZipCodeAutocomplete } from '../components/ZipCodeAutocomplete';
import { CountrySelect } from '../components/CountrySelect';
import { api } from '../lib/api';
import { BrandMark, useBrand } from '../lib/brand';
import { useCurrency } from '../lib/currency';
import { CarrierLogo, resolveCarrierName } from '../lib/carrierBrand';
import { saveGuestQuoteSession } from '../lib/guestQuoteSession';
import { getSupportWhatsAppUrl } from '../lib/supportContact';

export const Landing = () => {
  const { t, language, setLanguage } = useI18n();
  const navigate = useNavigate();
  const { brand } = useBrand();
  const supportWhatsAppHref = getSupportWhatsAppUrl(language);
  const landingLanguage = language.startsWith('it') ? 'it' : language.startsWith('en') ? 'en' : language.startsWith('fr') ? 'fr' : 'es';
  const omnichannelAnnouncement = {
    es: { badge: 'NUEVO', label: 'Omnicanal + AI', text: 'WhatsApp, Instagram, Facebook y Telegram en un solo lugar.', cta: 'Descubrir' },
    it: { badge: 'NOVITÀ', label: 'Omnicanale + AI', text: 'WhatsApp, Instagram, Facebook e Telegram in un unico spazio.', cta: 'Scopri' },
    en: { badge: 'NEW', label: 'Omnichannel + AI', text: 'WhatsApp, Instagram, Facebook and Telegram in one place.', cta: 'Discover' },
    fr: { badge: 'NOUVEAU', label: 'Omnicanal + IA', text: 'WhatsApp, Instagram, Facebook et Telegram au même endroit.', cta: 'Découvrir' }
  }[landingLanguage];
  
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const [form, setForm] = useState({
    originCountry: 'ES',
    originZip: '',
    destCountry: 'DE',
    destZip: ''
  });

  
  // IP geo → default origin country (and keep form currency-aware)
  useEffect(() => {
    let cancelled = false;
    const applyCountry = (cc: string) => {
      const code = String(cc || '').toUpperCase().slice(0, 2);
      if (!code || cancelled) return;
      setForm((prev) => {
        // only auto-fill if still default ES and user hasn't typed a zip yet
        if (prev.originZip) return prev;
        if (prev.originCountry && prev.originCountry !== 'ES' && localStorage.getItem('ship24go_country_manual') === '1') return prev;
        if (localStorage.getItem('ship24go_form_origin_manual') === '1') return prev;
        return { ...prev, originCountry: code };
      });
    };
    const cached = sessionStorage.getItem('ship24go_geo_country') || localStorage.getItem('ship24go_country');
    if (cached) applyCountry(cached);
    fetch('/api/public/locale', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.country) applyCountry(data.country);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [packages, setPackages] = useState([
    { width: 10, height: 10, length: 10, weight: 1, qty: 1 }
  ]);

  const addPackage = () => {
    setPackages([...packages, { width: 10, height: 10, length: 10, weight: 1, qty: 1 }]);
  };

  const removePackage = (index: number) => {
    setPackages(packages.filter((_, i) => i !== index));
  };

  const updatePackage = (index: number, key: string, val: number) => {
    const next = [...packages];
    next[index] = { ...next[index], [key]: val };
    setPackages(next);
  };

  const { format, currency, country, setCountry } = useCurrency();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteMessage, setQuoteMessage] = useState('');
  const resultsRef = React.useRef<HTMLDivElement | null>(null);

  const handleCalculate = async () => {
    const originZip = String(form.originZip || '').trim();
    const destZip = String(form.destZip || '').trim();
    if (!originZip || !destZip) {
      setQuoteError(t('quote_need_zips') || 'Completa los códigos postales de origen y destino.');
      setQuotes([]);
      return;
    }
    setLoadingQuote(true);
    setQuoteError('');
    setQuoteMessage('');
    setQuotes([]);
    try {
      const res = await api.quoteShipment({
        originCountry: String(form.originCountry || 'ES').toUpperCase().slice(0, 2),
        destCountry: String(form.destCountry || 'DE').toUpperCase().slice(0, 2),
        originZip,
        destZip,
        packages: (packages || []).map((pkg: any) => ({
          width: Math.max(1, Number(pkg.width) || 10),
          height: Math.max(1, Number(pkg.height) || 10),
          length: Math.max(1, Number(pkg.length) || 10),
          weight: Math.max(0.1, Number(pkg.weight) || 1),
          qty: Math.max(1, Number(pkg.qty) || 1),
        })),
        currency: String(currency || 'EUR').toUpperCase(),
      });
      const next = Array.isArray(res?.quotes) ? res.quotes : [];
      setQuotes(next);
      if (!next.length) {
        setQuoteError(res?.message || res?.error || t('quote_no_options') || 'No encontramos opciones para esta ruta.');
      } else {
        setQuoteMessage(t('guest_quote_hint') || 'Precios públicos sin cuenta. Inicia sesión solo para crear el envío y la etiqueta.');
      }
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (err: any) {
      setQuotes([]);
      setQuoteError(err?.message || t('quote_unavailable') || 'No se pudo cotizar ahora. Intenta de nuevo.');
    } finally {
      setLoadingQuote(false);
    }
  };

  const goShipWithQuote = (quote?: any) => {
    if (!quote?.id) return;
    const session = saveGuestQuoteSession({
      form: {
        originCountry: form.originCountry,
        originZip: form.originZip,
        originCity: (form as any).originCity,
        destCountry: form.destCountry,
        destZip: form.destZip,
        destCity: (form as any).destCity,
        packages,
        currency: quote.currency || 'EUR',
      },
      quote,
    });
    navigate('/auth/login', {
      state: {
        from: '/panel/quote',
        prefill: {
          ...form,
          packages,
          selectedQuoteId: quote.id,
        },
        guestQuote: quote,
        guestToken: session.token,
        message: t('guest_login_to_ship') || 'Inicia sesión o regístrate para comprar la etiqueta con el precio cotizado.',
      },
    });
  };

  return (
    <div className="antialiased overflow-x-hidden selection:bg-neon-pink selection:text-white bg-light-100 text-gray-800 dark:bg-dark-900 dark:text-[#C5C6C7] min-h-screen">
      {/* Animated omnichannel announcement bar */}
      <div className="fixed w-full top-0 z-50 min-h-9 bg-gradient-to-r from-slate-950 via-blue-900 to-cyan-800 text-white text-[11px] px-4 font-bold shadow-md">
        <Link to="/omnichannel" className="group mx-auto flex min-h-9 max-w-5xl items-center justify-center gap-2.5 py-1.5 hover:text-cyan-100" aria-label={`${omnichannelAnnouncement.label}: ${omnichannelAnnouncement.cta}`}>
          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110">
            <MessageCircle className="h-3.5 w-3.5 text-cyan-200" aria-hidden="true" />
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 animate-pulse text-amber-300" aria-hidden="true" />
          </span>
          <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-950 shadow-sm shadow-amber-400/30 animate-pulse">
            {omnichannelAnnouncement.badge}
          </span>
          <span className="truncate text-[11px] font-black sm:text-xs">{omnichannelAnnouncement.label}</span>
          <span className="hidden truncate font-semibold text-blue-100 md:inline">— {omnichannelAnnouncement.text}</span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black text-white transition-colors group-hover:bg-white/20 sm:inline-flex">{omnichannelAnnouncement.cta} <span aria-hidden="true">→</span></span>
        </Link>
      </div>

      {/* Header / Navbar */}
      <header className="fixed w-full top-8 z-50 glass-panel border-b-0 dark:border-b dark:border-gray-800 shadow-sm dark:shadow-none">
        <div className="container mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <Link to="/" className="cursor-pointer">
            <BrandMark iconClassName="w-10 h-10 rounded-xl" textClassName="text-2xl text-gray-900 dark:text-white" />
          </Link>

          {/* Nav Desktop */}
          <nav className="hidden md:flex space-x-8 font-medium text-sm text-gray-600 dark:text-gray-300">
            <Link to="/omnichannel" className="group inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">
              <Sparkles className="h-3.5 w-3.5 text-cyan-500 transition-transform group-hover:rotate-12" aria-hidden="true" />
              <span>{omnichannelAnnouncement.label.replace(' + AI', '').replace(' + IA', '')}</span>
              <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300 animate-pulse">{omnichannelAnnouncement.badge}</span>
            </Link>
            <Link to="/marketplace" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors font-bold text-blue-600 dark:text-neon-cyan">Marketplace</Link>
            <Link to="/tracking" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('nav_tracking') || 'Seguimiento'}</Link>
            <Link to="/omnichannel#plans" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('nav_companies') || 'Empresas'}</Link>
            <a href={supportWhatsAppHref} target="_blank" rel="noreferrer" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('nav_support') || 'Soporte'}</a>
          </nav>

          <div className="flex items-center gap-4">
            <CurrencySelector />
            <LanguageSelector />

            <button onClick={toggleTheme} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-dark-800 text-gray-600 dark:text-yellow-400 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <Link to="/auth/login" className="hidden md:block px-5 py-2 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold text-sm hover:shadow-lg transition-all">
              {t('btn_login') || 'Ingresar'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center pt-32 pb-12 overflow-hidden">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-300/30 dark:bg-neon-cyan/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-blob"></div>
          <div className="absolute top-[20%] right-[-5%] w-[30rem] h-[30rem] bg-pink-300/30 dark:bg-neon-pink/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px] animate-blob" style={{animationDelay: '2s'}}></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[40rem] h-[40rem] bg-cyan-300/30 dark:bg-neon-green/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px] animate-blob" style={{animationDelay: '4s'}}></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto mb-12 animate-float">
            <div className="inline-block px-4 py-1.5 rounded-full border border-blue-500/30 dark:border-neon-cyan/30 bg-blue-50 dark:bg-neon-cyan/10 text-blue-600 dark:text-neon-cyan text-sm font-bold tracking-widest uppercase mb-6 backdrop-blur-sm">
              {t('hero_badge') || 'Revoluciona tu logística'}
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white mb-6 leading-tight tracking-tight">
              {t('hero_title_1') || 'Envía a la'} <span className="text-gradient">{t('hero_title_2') || 'velocidad de la luz.'}</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              {t('hero_subtitle') || 'Calcula tarifas al instante entre +50 transportistas globales mediante nuestra IA. Sin registros, sin esperas.'}
            </p>
          </div>

          {/* Form */}
          <div className="max-w-6xl mx-auto">
            <div className="glass-panel rounded-3xl overflow-hidden relative">
              <div className="quote-toolbar flex flex-col sm:flex-row justify-between items-center p-6">
                <div className="flex space-x-1 bg-gray-100 dark:bg-black/40 p-1 rounded-xl mb-4 sm:mb-0 border border-gray-200 dark:border-white/10">
                  <button className="px-6 py-2 rounded-lg bg-white dark:bg-neon-cyan/15 text-blue-600 dark:text-neon-cyan font-bold text-sm shadow-sm dark:shadow-[0_0_14px_rgba(102,252,241,0.25)] border border-transparent dark:border-neon-cyan/25">
                    {t('tab_send') || 'Enviar Paquete'}
                  </button>
                  <Link to="/tracking" className="px-6 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium text-sm transition-all hover:bg-white dark:hover:bg-dark-800">
                    {t('tab_track') || 'Seguir Envío'}
                  </Link>
                  <Link to="/marketplace" className="px-6 py-2 rounded-lg text-blue-600 dark:text-neon-cyan hover:text-blue-700 font-black text-sm transition-all hover:bg-white dark:hover:bg-dark-800 flex items-center gap-1.5">
                    <span>🛒 Marketplace</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-black">Nuevo</span>
                  </Link>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{t('profile_label') || 'Perfil:'}</span>
                  <div className="flex items-center bg-gray-100 dark:bg-black/40 rounded-full p-1 border border-gray-200 dark:border-white/10">
                    <button className="px-4 py-1.5 rounded-full text-xs font-bold bg-white dark:bg-neon-cyan/15 text-gray-800 dark:text-neon-cyan shadow-sm dark:border dark:border-neon-cyan/20">
                      {t('profile_personal') || 'Personal'}
                    </button>
                    <button className="px-4 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-all">
                      {t('profile_business') || 'Empresa'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="quote-inner p-6 md:p-8 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
                  <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 bg-white dark:bg-[#0c1219] border-2 border-blue-500 dark:border-neon-cyan rounded-full p-3 shadow-lg dark:shadow-[0_0_20px_rgba(102,252,241,0.35)]">
                    <ArrowRightLeft className="w-5 h-5 text-blue-500 dark:text-neon-cyan" />
                  </div>

                  <div className="quote-card p-6 rounded-2xl relative group hover:border-blue-400 dark:hover:border-neon-cyan/50 transition-colors shadow-sm">
                    <div className="absolute -top-3 left-6 bg-white dark:bg-[#0c1219] px-3 py-1 rounded-full text-xs font-bold text-blue-600 dark:text-neon-cyan uppercase tracking-wider flex items-center border border-gray-100 dark:border-neon-cyan/25 shadow-sm dark:shadow-[0_0_12px_rgba(102,252,241,0.15)]">
                      <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-neon-cyan mr-2 animate-pulse"></div> {t('origin') || 'Origen'}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('country') || 'País'}</label>
                        <CountrySelect value={form.originCountry} onChange={(code) => setForm({...form, originCountry: code})} lang={language || "es"} showLanguage buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('zipcode') || 'Código Postal'}</label>
                        <ZipCodeAutocomplete 
                          value={form.originZip} 
                          onChange={(v) => setForm({...form, originZip: v})}
                          placeholder="Ej: 28001" 
                          className="input-dynamic"
                          countryCode={form.originCountry}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="quote-card quote-card-dest p-6 rounded-2xl relative group hover:border-pink-400 dark:hover:border-neon-pink/50 transition-colors shadow-sm">
                    <div className="absolute -top-3 left-6 bg-white dark:bg-[#0c1219] px-3 py-1 rounded-full text-xs font-bold text-pink-600 dark:text-neon-pink uppercase tracking-wider flex items-center border border-gray-100 dark:border-neon-pink/30 shadow-sm dark:shadow-[0_0_12px_rgba(255,46,147,0.18)]">
                      <div className="w-2 h-2 rounded-full bg-pink-500 dark:bg-neon-pink mr-2"></div> {t('destination') || 'Destino'}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('country') || 'País'}</label>
                        <CountrySelect value={form.destCountry} onChange={(code) => setForm({...form, destCountry: code})} lang={language || "es"} showLanguage buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left focus:border-pink-500 dark:focus:border-neon-pink" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('zipcode') || 'Código Postal'}</label>
                        <ZipCodeAutocomplete 
                          value={form.destZip} 
                          onChange={(v) => setForm({...form, destZip: v})}
                          placeholder="Ej: 10115" 
                          className="input-dynamic focus:border-pink-500 dark:focus:border-neon-pink"
                          countryCode={form.destCountry}
                        />
                      </div>
                    </div>
                  </div>              
                </div>

              {/* Package details */}
              <div className="quote-surface p-6 rounded-2xl shadow-inner">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center">
                      <Package className="w-4 h-4 text-blue-500 dark:text-neon-green mr-2" /> {t('pkg_details') || 'Detalles de los Bultos'}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {packages.map((pkg, idx) => (
                      <div key={idx} className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end border-b border-gray-100 dark:border-gray-800/50 pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">{t('pkg_type') || 'Tipo'} (Bulto {idx + 1})</label>
                          <select className="input-dynamic appearance-none font-medium">
                            <option>{t('type_box') || 'Caja Estandar'}</option>
                            <option>{t('type_doc') || 'Sobre Documentos'}</option>
                            <option>{t('type_tube') || 'Tubo / Cilíndrico'}</option>
                            <option>{t('type_pallet') || 'Palet'}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">{t('pkg_weight') || 'Peso (kg)'}</label>
                          <input type="number" min="0.1" step="0.1" value={pkg.weight} onChange={e => updatePackage(idx, 'weight', Number(e.target.value))} placeholder="0.0" className="input-dynamic text-center font-bold" />
                        </div>
                        <div className="col-span-2 flex items-center space-x-2">
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('pkg_length') || 'Largo'}</label>
                            <input type="number" min="1" value={pkg.length} onChange={e => updatePackage(idx, 'length', Number(e.target.value))} placeholder="cm" className="input-dynamic text-center text-sm" />
                          </div>
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('pkg_width') || 'Ancho'}</label>
                            <input type="number" min="1" value={pkg.width} onChange={e => updatePackage(idx, 'width', Number(e.target.value))} placeholder="cm" className="input-dynamic text-center text-sm" />
                          </div>
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('pkg_height') || 'Alto'}</label>
                            <input type="number" min="1" value={pkg.height} onChange={e => updatePackage(idx, 'height', Number(e.target.value))} placeholder="cm" className="input-dynamic text-center text-sm" />
                          </div>
                          {packages.length > 1 && (
                            <button type="button" onClick={() => removePackage(idx)} className="text-red-500 hover:text-red-700 p-2 mb-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 flex justify-center">
                    <button type="button" onClick={addPackage} className="text-xs font-bold text-blue-600 dark:text-neon-cyan hover:text-white dark:hover:text-white transition-colors flex items-center border border-blue-200 dark:border-neon-cyan/30 rounded-full px-4 py-1.5 bg-blue-50 hover:bg-blue-500 dark:bg-neon-cyan/5 dark:hover:bg-neon-cyan/20">
                      <Plus className="w-3 h-3 mr-1" /> {t('pkg_add') || 'Añadir otro bulto'}
                    </button>
                  </div>
              </div>

                <div className="mt-10 text-center">
                  <button
                    type="button"
                    disabled={loadingQuote}
                    onClick={handleCalculate}
                    className="bg-gradient-to-r from-pink-500 to-orange-400 dark:from-neon-pink dark:to-[#9D00FF] text-white font-black py-4 px-12 rounded-full text-lg transition-all transform hover:scale-105 hover:shadow-xl dark:hover:shadow-neon-pink w-full md:w-auto relative overflow-hidden group disabled:opacity-60 disabled:hover:scale-100"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {loadingQuote ? (t('quote_loading') || 'Consultando transportistas…') : (t('btn_calculate') || 'Calcular Tarifas Mágicas')}
                    </span>
                  </button>
                  <p className="mt-4 text-xs font-medium text-gray-500 flex items-center justify-center">
                    <Lock className="w-3 h-3 mr-1 text-green-500" /> {t('secure_msg') || 'Búsqueda 100% segura. Precios finales sin sorpresas. Sin cuenta para ver precios.'}
                  </p>
                  {quoteError && (
                    <p className="mt-4 text-sm font-bold text-red-600 dark:text-red-400">{quoteError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Guest quote results — elegant, translated, with carrier logos */}
          <div ref={resultsRef} className="container mx-auto px-4 mt-10 max-w-5xl relative z-10 pb-8">
            {loadingQuote && (
              <div className="rounded-[28px] bg-white/95 dark:bg-dark-800/95 border border-slate-100 dark:border-slate-700 p-10 text-center shadow-2xl backdrop-blur">
                <div className="inline-block w-11 h-11 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-black text-lg text-slate-900 dark:text-white">{t('quote_loading_phase2') || t('quote_loading')}</p>
                <p className="text-sm text-slate-500 mt-2">{t('guest_quote_free')}</p>
              </div>
            )}

            {!loadingQuote && quotes.length > 0 && (
              <div className="rounded-[28px] bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-700 shadow-2xl overflow-hidden">
                <div className="px-6 md:px-8 py-6 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-50 via-white to-blue-50 dark:from-dark-900 dark:via-dark-800 dark:to-slate-900">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-neon-cyan">
                      {t('availableOptions') || 'Options'}
                    </p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      {quotes.length} {t('guest_rates_found')}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                      {quoteMessage || t('guest_quote_hint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goShipWithQuote(quotes[0])}
                    className="self-start md:self-auto px-5 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black shadow-lg hover:scale-[1.02] transition"
                  >
                    {t('guest_ship_cheapest')}
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                  {quotes.map((q: any, idx: number) => {
                    const carrier = resolveCarrierName(q);
                    const days = q.estimatedDays || q.estimatedDaysMax || q.estimatedDaysMin;
                    const price = Number(q.total ?? q.customerPrice ?? 0);
                    const cur = String(q.currency || 'EUR').toUpperCase();
                    const service = String(q.service || q.serviceTypeLabel || 'Standard').replace(/\s+/g, ' ').slice(0, 80);
                    return (
                      <div
                        key={q.id || `${carrier}-${idx}`}
                        className="px-5 md:px-8 py-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-slate-50/90 dark:hover:bg-dark-900/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <CarrierLogo name={carrier} logoUrl={q.providerLogo || q.carrierLogo} size="md" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-neon-cyan transition-colors truncate">
                                {carrier}
                              </p>
                              {idx === 0 && (
                                <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40">
                                  Best price
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{service}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {days != null && (
                                <span className="inline-flex items-center text-[11px] font-bold text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-900/40">
                                  {days} {t('days') || t('estimated_days')}
                                </span>
                              )}
                              <span className="inline-flex items-center text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                {t('protected_price')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 sm:pl-4 sm:border-l sm:border-slate-100 dark:sm:border-slate-700">
                          <div className="text-left sm:text-right">
                            <p className="text-2xl md:text-[1.7rem] font-black tracking-tight text-slate-900 dark:text-white">
                              {format(price, cur)}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 mt-0.5">
                              {t('final_price')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => goShipWithQuote(q)}
                            className="shrink-0 px-4 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black shadow-md hover:shadow-lg hover:scale-[1.02] transition"
                          >
                            {t('guest_select_ship')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-6 py-4 bg-slate-50 dark:bg-dark-900/70 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {t('guest_login_footer')}{' '}
                  <Link to="/auth/register" className="font-black text-blue-600 dark:text-neon-cyan hover:underline">
                    {t('createAccount') || t('footer_btn') || 'Register'}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      {/* MARKETPLACE SHOWCASE SECTION */}
      <section className="py-20 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 border-y border-slate-200/80 dark:border-slate-800 relative z-10">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                <span>🛒 Ecosistema Unificado</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                DoorDrop Marketplace
              </h2>
              <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                El primer marketplace conectado directamente a la red logística de DoorDrop. Compra con protección garantizada y vende con etiquetas de envío generadas al instante.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/marketplace"
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all flex items-center gap-2"
              >
                <span>Ver catálogo completo</span>
                <span>→</span>
              </Link>
              <Link
                to="/panel/marketplace"
                className="px-6 py-3 rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-bold text-sm hover:bg-slate-50 transition-all"
              >
                Vender producto
              </Link>
            </div>
          </div>

          {/* Featured Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link to="/marketplace/producto/lst_iphone14_001" className="group bg-white dark:bg-dark-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm hover:shadow-xl transition-all flex flex-col">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 mb-4">
                <img src="https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800&q=80" alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-sm">
                  Envío DoorDrop 24/48h
                </span>
              </div>
              <div className="space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">649.00 €</span>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-1">iPhone 14 Pro 128GB Grigio Siderale - Pari al Nuovo</h4>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-400 font-semibold">
                  <span>📍 Milano, IT</span>
                  <span className="text-blue-600 font-bold">Ver producto →</span>
                </div>
              </div>
            </Link>

            <Link to="/marketplace/producto/lst_ps5_004" className="group bg-white dark:bg-dark-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm hover:shadow-xl transition-all flex flex-col">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 mb-4">
                <img src="https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800&q=80" alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-sm">
                  Envío DoorDrop 24/48h
                </span>
              </div>
              <div className="space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">380.00 €</span>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-1">PlayStation 5 Chasis C (Versión Disco) + Mando DualSense</h4>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-400 font-semibold">
                  <span>📍 Barcelona, ES</span>
                  <span className="text-blue-600 font-bold">Ver producto →</span>
                </div>
              </div>
            </Link>

            <Link to="/marketplace/producto/lst_delonghi_003" className="group bg-white dark:bg-dark-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm hover:shadow-xl transition-all flex flex-col">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 mb-4">
                <img src="https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&q=80" alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-sm">
                  Envío DoorDrop 24/48h
                </span>
              </div>
              <div className="space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">89.00 €</span>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-1">Cafetera Espresso De'Longhi Dedica EC685.M Acero</h4>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-400 font-semibold">
                  <span>📍 Madrid, ES</span>
                  <span className="text-blue-600 font-bold">Ver producto →</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-10 border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-900 relative z-10">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-8">{t('partners_title') || 'Conectados con las mejores redes'}</p>
          
          <div className="flex overflow-x-auto no-scrollbar space-x-12 items-center justify-start md:justify-center opacity-60 hover:opacity-100 transition-opacity duration-500 pb-4 md:pb-0 px-4">
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer text-3xl font-black italic text-yellow-500">DHL</div>
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer text-3xl font-bold text-blue-700">GLS<span className="text-yellow-400">.</span></div>
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer flex items-center">
              <div className="w-8 h-8 bg-red-600 text-white rounded flex items-center justify-center font-bold mr-1">S</div>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-300">SEUR</span>
            </div>
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer text-2xl font-black tracking-tighter text-orange-600">NACEX</div>
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer text-3xl font-bold text-yellow-900 dark:text-yellow-600 flex items-center"><Package className="w-6 h-6 mr-1" /> UPS</div>
            <div className="flex-none grayscale hover:grayscale-0 transition-all duration-300 transform hover:scale-110 cursor-pointer text-2xl font-bold text-purple-700">FedEx</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-light-200 dark:bg-[#07080a] relative">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white mb-4">
              {t('how_title_1') || 'La logística,'} <span className="text-blue-600 dark:text-neon-cyan">{t('how_title_2') || 'reimaginada.'}</span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">{t('how_subtitle') || 'Olvídate de procesos complicados. Hemos simplificado el envío a tres pasos básicos.'}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-panel p-8 rounded-3xl group hover:-translate-y-2 transition-transform duration-300 text-center md:text-left border border-transparent hover:border-blue-200 dark:hover:border-neon-cyan/50">
              <div className="w-16 h-16 mx-auto md:mx-0 bg-white dark:bg-dark-900 rounded-2xl flex items-center justify-center border border-blue-200 dark:border-neon-cyan/30 text-blue-500 dark:text-neon-cyan text-2xl mb-6 shadow-md dark:shadow-[0_0_15px_rgba(102,252,241,0.2)] group-hover:scale-110 transition-transform">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step1_title') || '1. Escaneo de Tarifas'}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {t('step1_desc') || 'Nuestro algoritmo rastrea en tiempo real miles de rutas y opciones para mostrarte el precio más competitivo del mercado al instante.'}
              </p>
            </div>

            <div className="glass-panel p-8 rounded-3xl group hover:-translate-y-2 transition-transform duration-300 text-center md:text-left border border-transparent hover:border-pink-200 dark:hover:border-neon-pink/50">
              <div className="w-16 h-16 mx-auto md:mx-0 bg-white dark:bg-dark-900 rounded-2xl flex items-center justify-center border border-pink-200 dark:border-neon-pink/30 text-pink-500 dark:text-neon-pink text-2xl mb-6 shadow-md dark:shadow-[0_0_15px_rgba(255,0,127,0.2)] group-hover:scale-110 transition-transform">
                <Cpu className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step2_title') || '2. Procesamiento IA'}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {t('step2_desc') || 'Generamos etiquetas, documentación aduanera y gestionamos la recogida de forma automatizada según tus preferencias.'}
              </p>
            </div>

            <div className="glass-panel p-8 rounded-3xl group hover:-translate-y-2 transition-transform duration-300 text-center md:text-left border border-transparent hover:border-cyan-200 dark:hover:border-neon-green/50">
              <div className="w-16 h-16 mx-auto md:mx-0 bg-white dark:bg-dark-900 rounded-2xl flex items-center justify-center border border-cyan-200 dark:border-neon-green/30 text-cyan-500 dark:text-neon-green text-2xl mb-6 shadow-md dark:shadow-[0_0_15px_rgba(69,162,158,0.2)] group-hover:scale-110 transition-transform">
                <Rocket className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step3_title') || '3. Despegue y Control'}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {t('step3_desc') || 'Paga seguro y obtén un tracking en vivo. Sabrás exactamente dónde está tu envío en cada coordenada del planeta.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-[#07080a] pt-16 pb-8 border-t border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-1 md:col-span-1">
              <div className="mb-4"><BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-gray-900 dark:text-white" /></div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                {t('footer_desc') || 'Revolucionando la logística global con inteligencia artificial y transparencia total en los precios.'}
              </p>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-4">{t('footer_prod') || 'Producto'}</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_pricing') || 'Cotizador B2B'}</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_api') || 'API de Envíos'}</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_ecommerce') || 'Integración E-commerce'}</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_tracking') || 'Seguimiento Avanzado'}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-4">{t('footer_company') || 'Compañía'}</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_about') || 'Sobre Nosotros'}</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_careers') || 'Carreras'}</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_blog') || 'Blog'}</a></li>
                <li><a href={supportWhatsAppHref} target="_blank" rel="noreferrer" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('footer_contact') || 'Contacto'}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-4">{t('footer_ready') || '¿Listo para empezar?'}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('footer_ready_desc') || 'Únete a miles de empresas que ya optimizan sus envíos.'}</p>
              <Link to="/auth/register" className="block text-center w-full py-2.5 px-4 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-bold text-sm hover:shadow-lg transition-all border border-transparent dark:hover:border-white">
                {t('footer_btn') || 'Crear Cuenta Gratis'}
              </Link>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              &copy; 2026 {brand.siteName || 'DoorDrop'}. {t('footer_rights') || 'Todos los derechos reservados.'}
            </p>
            <div className="flex space-x-4 text-xs text-gray-400 dark:text-gray-500">
              <a href="#" className="hover:text-gray-900 dark:hover:text-white">{t('footer_privacy') || 'Privacidad'}</a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-white">{t('footer_terms') || 'Términos'}</a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-white">{t('footer_cookies') || 'Cookies'}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
