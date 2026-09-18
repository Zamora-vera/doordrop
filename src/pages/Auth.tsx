import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Package, CheckCircle2, Mail, Lock, User, Phone, ArrowLeft, ArrowRight, 
  Building, ShoppingBag, Truck, Send, Layers, MapPin, Check, Sparkles, 
  ChevronRight, Landmark, Store, Globe, Compass, ShieldCheck, TrendingUp
} from 'lucide-react';
import { api, setAuthToken } from '../lib/api';
import { loadGuestQuoteSession, guestSessionToPanelState } from '../lib/guestQuoteSession';
import { loadGuestChatIntent } from '../lib/marketplaceGuestChat';
import { useI18n } from '../lib/i18n';
import { LanguageSelector } from '../components/LanguageSelector';
import { CountrySelect } from '../components/CountrySelect';
import { useCurrency } from '../lib/currency';
import { BrandMark, useBrand } from '../lib/brand';


function resolvePostAuthNavigation(locationState: any) {
  const fromState = locationState || {};
  const chatIntent = loadGuestChatIntent();
  if (chatIntent && chatIntent.listingId) {
    return {
      path: '/panel/marketplace?tab=messages',
      state: { fromChatIntent: true, listingId: chatIntent.listingId }
    };
  }
  const session = loadGuestQuoteSession();
  if (session) {
    return {
      path: '/panel/quote',
      state: {
        ...guestSessionToPanelState(session),
        // merge any router state form fields if present
        prefill: {
          ...session.form,
          ...(fromState.prefill || {}),
          selectedQuoteId: session.quoteId,
          packages: (fromState.prefill && fromState.prefill.packages) || session.form.packages,
        },
        guestQuote: session.quote,
        guestToken: session.token,
        autoSelectQuote: true,
      },
    };
  }
  if (fromState.prefill || fromState.guestQuote) {
    return {
      path: String(fromState.from || '/panel/quote'),
      state: {
        prefill: fromState.prefill || null,
        guestQuote: fromState.guestQuote || null,
        guestToken: fromState.guestToken || null,
        autoSelectQuote: Boolean(fromState.guestQuote || fromState.prefill?.selectedQuoteId),
      },
    };
  }
  return { path: '/panel', state: undefined };
}

// Modern Split-Screen Side panel
const AuthSidebar = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  return (
    <div className="hidden lg:flex lg:col-span-5 bg-slate-950 p-12 text-white flex-col justify-between relative overflow-hidden min-h-screen">
      {/* Decorative radial glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none"></div>
      
      {/* Brand Header */}
      <Link to="/" className="relative z-10 hover:opacity-90 transition-opacity">
        <BrandMark dark iconClassName="w-10 h-10 rounded-xl" textClassName="text-2xl text-white" />
      </Link>

      {/* Main Illustration / Value Mockups */}
      <div className="relative z-10 my-auto py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          {t('smart_logistics')}
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight mb-6 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
          {t('definitive_platform')}
        </h1>
        
        <p className="text-slate-400 text-lg mb-10 max-w-md">
          {t('left_panel_desc')}
        </p>

      </div>

      {/* Footer info */}
      <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
        <span>© 2026 {brand.siteName || 'DoorDrop'}. {t('footer_rights')}</span>
        <div className="flex gap-4">
          <span className="hover:text-slate-400 cursor-pointer">{t('support_link')}</span>
          <span className="hover:text-slate-400 cursor-pointer">{t('privacy_link')}</span>
        </div>
      </div>
    </div>
  );
};

function PayPalMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="PayPal" fill="none">
      <path fill="#003087" d="M7.3 3.25h6.1c3.25 0 5.2 1.65 4.62 4.55-.53 2.69-2.46 4.34-5.56 4.34H10.6l-.96 4.85H6.08L7.3 3.25Z" />
      <path fill="#009CDE" d="M10.25 7.22h5.07c2.25 0 3.7.95 3.63 2.66-.1 2.12-1.7 3.54-4.5 3.54h-2.25l-.87 4.33H8.46l1.79-10.53Z" />
      <path fill="#012169" d="M9.75 6.16h4.83c1.24 0 2.24.23 2.98.68-.68-1.75-2.36-2.72-4.85-2.72H8.02L6.08 16.99h2.2l.99-5.02h1.58l.4-2h-1.58l.08-.43Z" />
    </svg>
  );
}

function PayPalAuthButton({ mode, onError }: { mode: 'login' | 'register'; onError?: (message: string) => void }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    api.getPaypalAuthConfig()
      .then((config: any) => { if (active) setEnabled(Boolean(config?.enabled)); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);

  if (!enabled) return null;

  const start = async () => {
    setLoading(true);
    onError?.('');
    try {
      const result = await api.startPaypalAuth(mode);
      if (!result?.url) throw new Error(t('paypal_auth_error'));
      window.location.assign(result.url);
    } catch (err: any) {
      onError?.(err.message || t('paypal_auth_error'));
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span>{t('or_continue_with')}</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="mt-4 w-full flex items-center justify-center gap-2.5 rounded-xl border border-[#0070ba] bg-white py-3 px-4 text-sm font-semibold text-[#003087] shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-[#009cde]/20"
      >
        <PayPalMark />
        <span>{loading ? t('paypal_auth_loading') : t('continue_with_paypal')}</span>
      </button>
    </div>
  );
}

const Login = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const guestSession = loadGuestQuoteSession();
  const guestMsg = (location.state as any)?.message || (guestSession
    ? (t('guest_login_to_ship') || 'Sign in to complete your selected rate and create the label.')
    : '');


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(form);
      setAuthToken(res.token);

      if (res.user.role === 'super_admin') {
        navigate('/admin');
      } else {
        const next = resolvePostAuthNavigation(location.state);
        navigate(next.path, next.state ? { state: next.state } : undefined);
      }
    } catch (err: any) {
      if (err?.code === 'EMAIL_NOT_VERIFIED' || err?.requiresEmailVerification) {
        navigate(`/auth/verify-email?email=${encodeURIComponent(err.email || form.email)}`);
        return;
      }
      setError(err.message || 'Error de inicio de sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 font-sans overflow-x-hidden">
      {/* Split Left Column */}
      <AuthSidebar />

      {/* Split Right Column */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-16 relative min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-8">
          <Link to="/" className="lg:hidden">
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-slate-900 dark:text-white" />
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSelector />
          </div>
        </div>

        {/* Content Container */}
        <div className="my-auto w-full max-w-md mx-auto">
          <div className="text-left mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('login')}
            </h2>
            <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400">
              {t('login_subtitle')}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-700/55">
            <form className="space-y-5" onSubmit={handleSubmit}>
              {guestMsg && (
                <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm font-semibold text-blue-800 dark:text-blue-200">
                  {guestMsg}
                  {guestSession?.quote && (
                    <div className="mt-1 text-xs font-bold opacity-90">
                      {(guestSession.quote.carrierName || guestSession.quote.service || 'Quote')} · {guestSession.quote.total} {guestSession.quote.currency || 'EUR'} · token {guestSession.token}
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/30 font-medium">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('email')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Mail className="w-4.5 h-4.5" />
                  </div>
                  <input 
                    required 
                    type="email" 
                    placeholder="nombre@empresa.com"
                    value={form.email} 
                    onChange={e => setForm({...form, email: e.target.value})} 
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {t('password')}
                  </label>
                  <Link to="/auth/forgot-password" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    {t('forgot_password')}
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <input 
                    required 
                    type="password" 
                    placeholder="••••••••"
                    value={form.password} 
                    onChange={e => setForm({...form, password: e.target.value})} 
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center cursor-pointer select-none">
                  <input type="checkbox" className="w-4.5 h-4.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 focus:ring-offset-0 dark:bg-slate-900 dark:border-slate-700" />
                  <span className="ml-2 text-xs text-slate-600 dark:text-slate-400 font-medium">{t('remember_me')}</span>
                </label>
              </div>

              <button 
                disabled={loading} 
                type="submit" 
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 cursor-pointer transition-all mt-4"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    <span>{t('enter')}</span>
                    <ArrowRight className="w-4.5 h-4.5" />
                  </>
                )}
              </button>
            </form>

            <PayPalAuthButton mode="login" onError={setError} />

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/50 text-center">
              <Link to="/auth/register" state={location.state || undefined} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center justify-center gap-1.5 transition-colors">
                <span>{t('noAccount')}</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 lg:hidden">
          <span>© 2026 {brand.siteName || 'DoorDrop'}. {t('footer_rights')}</span>
        </div>
      </div>
    </div>
  );
};

const Register = () => {
  const { t, language } = useI18n();
  const { brand } = useBrand();
  const { currency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [form, setForm] = useState(() => {
    const defaultCountry = language.toUpperCase() === 'EN' ? 'US' : (language.toUpperCase() === 'IT' ? 'IT' : 'ES');
    return {
      name: '', email: '', phone: '', password: '', 
      country: defaultCountry, 
      language: language || 'es', 
      currency: currency || 'EUR',
      globalTermsAccepted: false,
      globalTermsLanguage: ['es', 'it', 'en'].includes(String(language || '').slice(0, 2)) ? String(language || '').slice(0, 2) : 'en',
      businessType: '', storeType: '',
      pickupAddress: { companyName: '', address: '', city: '', province: '', zip: '', country: defaultCountry, phone: '', contact: '' }
    };
  });

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => Math.max(1, s - 1));

  const handleSubmit = async () => {
    if (form.globalTermsAccepted !== true) {
      setError(language === 'it' ? 'Devi accettare i Termini e Condizioni Globali.' : language === 'en' ? 'You must accept the Global Terms and Conditions.' : 'Debes aceptar los Términos y Condiciones Globales.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.register(form);
      if (res?.requiresEmailVerification) {
        navigate(`/auth/verify-email?email=${encodeURIComponent(res.email || form.email)}`);
        return;
      }
      setAuthToken(res.token);
      const next = resolvePostAuthNavigation(location.state);
      navigate(next.path, next.state ? { state: next.state } : undefined);
    } catch (err: any) {
      setError(err.message || 'Error en el registro');
    } finally {
      setLoading(false);
    }
  };

  // Pre-configured Visual Selection Cards
  const businessTypes = [
    { id: 'Tienda online', labelKey: 'business_online_label' as const, descKey: 'business_online_desc' as const, icon: ShoppingBag, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20' },
    { id: 'Tienda física', labelKey: 'business_physical_label' as const, descKey: 'business_physical_desc' as const, icon: Store, color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 border-amber-500/20' },
    { id: 'Vendedor independiente', labelKey: 'business_indie_label' as const, descKey: 'business_indie_desc' as const, icon: User, color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-500/20' },
    { id: 'Empresa logística', labelKey: 'business_logistics_label' as const, descKey: 'business_logistics_desc' as const, icon: Truck, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500/20' },
    { id: 'Solo quiero enviar paquetes', labelKey: 'business_fast_label' as const, descKey: 'business_fast_desc' as const, icon: Send, color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10 border-violet-500/20' },
    { id: 'Otro', labelKey: 'business_other_label' as const, descKey: 'business_other_desc' as const, icon: Layers, color: 'text-slate-500 bg-slate-50 dark:bg-slate-500/10 border-slate-500/20' }
  ];

  const storeTypes = [
    { id: 'Shopify', name: 'Shopify', descKey: 'store_shopify_desc' as const, logo: 'https://cdn.worldvectorlogo.com/logos/shopify.svg' },
    { id: 'WooCommerce', name: 'WooCommerce', descKey: 'store_woo_desc' as const, logo: 'https://cdn.worldvectorlogo.com/logos/woocommerce.svg' },
    { id: 'Wix', name: 'Wix Store', descKey: 'store_wix_desc' as const, logo: '/logos/wix.svg' },
    { id: 'Tienda personalizada', name: 'API de Terceros', descKey: 'store_custom_desc' as const, logo: null }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 font-sans overflow-x-hidden">
      {/* Left Column (Branding banner stays constant or has dynamic text) */}
      <AuthSidebar />

      {/* Right Column (Register form flow) */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-16 relative min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-6">
          <Link to="/" className="lg:hidden">
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-slate-900 dark:text-white" />
          </Link>
          
          <div className="ml-auto flex items-center gap-4">
            <LanguageSelector />
          </div>
        </div>

        {/* Form Container */}
        <div className="my-auto w-full max-w-xl mx-auto py-4">
          
          {/* Stepper Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              <span>{t('createAccount') || 'Crear Cuenta'}</span>
              <span>{t('step') || 'Paso'} {step} {t('of') || 'de'} 4</span>
            </div>
            {/* Visual Progress Bar */}
            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden flex gap-0.5">
              <div className={`h-full transition-all duration-300 rounded-l-full bg-blue-600 ${step >= 1 ? 'w-1/4' : 'w-0'}`} />
              <div className={`h-full transition-all duration-300 bg-blue-600 ${step >= 2 ? 'w-1/4' : 'w-0'}`} />
              <div className={`h-full transition-all duration-300 bg-blue-600 ${step >= 3 ? 'w-1/4' : 'w-0'}`} />
              <div className={`h-full transition-all duration-300 rounded-r-full bg-blue-600 ${step >= 4 ? 'w-1/4' : 'w-0'}`} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-700/55">
            {error && (
              <div className="mb-5 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/30 font-medium">
                {error}
              </div>
            )}

            {/* STEP 1: Personal Credentials */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('account_data_title')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('account_data_desc')}</p>
                </div>

                <PayPalAuthButton mode="register" onError={setError} />

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('fullName')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <User className="w-4.5 h-4.5" />
                    </div>
                    <input 
                      required 
                      placeholder="Juan Pérez" 
                      value={form.name} 
                      onChange={e => setForm({...form, name: e.target.value})} 
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Mail className="w-4.5 h-4.5" />
                    </div>
                    <input 
                      required 
                      type="email" 
                      placeholder="juan@ejemplo.com" 
                      value={form.email} 
                      onChange={e => setForm({...form, email: e.target.value})} 
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('phone')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Phone className="w-4.5 h-4.5" />
                    </div>
                    <input 
                      required 
                      type="tel" 
                      placeholder="+34 600 000 000" 
                      value={form.phone} 
                      onChange={e => setForm({...form, phone: e.target.value})} 
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('password')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Lock className="w-4.5 h-4.5" />
                    </div>
                    <input 
                      required 
                      type="password" 
                      placeholder="••••••••" 
                      value={form.password} 
                      onChange={e => setForm({...form, password: e.target.value})} 
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      País
                    </label>
                    <CountrySelect value={form.country} onChange={(newCountry, c) => { setForm(prev => ({ ...prev, country: newCountry, currency: c?.currency || prev.currency, language: (c?.language && ["es","en","it","fr","de","zh","ht"].includes(c.language)) ? c.language : prev.language, pickupAddress: { ...prev.pickupAddress, country: newCountry } })); }} lang={language || "es"} showLanguage />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Moneda
                    </label>
                    <select
                      value={form.currency}
                      onChange={e => setForm({ ...form, currency: e.target.value })}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="MXN">MXN ($)</option>
                      <option value="COP">COP ($)</option>
                      <option value="ARS">ARS ($)</option>
                      <option value="DOP">DOP ($)</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={next} 
                  disabled={!form.name || !form.email || !form.phone || !form.password}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer transition-all mt-6"
                >
                  <span>{t('continue')}</span>
                  <ArrowRight className="w-4.5 h-4.5" />
                </button>
              </div>
            )}

            {/* STEP 2: Business Type selection */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('businessType')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('business_type_desc')}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {businessTypes.map(opt => {
                    const IconComp = opt.icon;
                    const isSelected = form.businessType === opt.id;
                    return (
                      <div 
                        key={opt.id} 
                        onClick={() => setForm({...form, businessType: opt.id})}
                        className={`p-4 rounded-2xl border-2 text-left cursor-pointer transition-all flex flex-col justify-between h-32 relative ${
                          isSelected 
                            ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-500/10' 
                            : 'border-slate-100 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className={`p-2.5 rounded-xl border ${opt.color}`}>
                            <IconComp className="w-5 h-5" />
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{t(opt.labelKey)}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{t(opt.descKey)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={prev} 
                    className="flex items-center justify-center gap-1.5 py-3 px-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t('back_btn')}</span>
                  </button>
                  <button 
                    onClick={next} 
                    disabled={!form.businessType}
                    className="flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <span>{t('continue')}</span>
                    <ArrowRight className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Store Type selection */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('storeType')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('store_type_desc')}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {storeTypes.map(opt => {
                    const isSelected = form.storeType === opt.id;
                    return (
                      <div 
                        key={opt.id} 
                        onClick={() => setForm({...form, storeType: opt.id})}
                        className={`p-4 rounded-2xl border-2 text-left cursor-pointer transition-all flex flex-col justify-between h-32 relative ${
                          isSelected 
                            ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-500/10' 
                            : 'border-slate-100 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          {opt.logo ? (
                            <img src={opt.logo} alt={opt.name} className="h-7 w-auto max-w-[7rem] object-contain object-left" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                              <Globe className="w-4 h-4" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="mt-2">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{opt.name}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{t(opt.descKey)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 text-center">
                  <button 
                    onClick={() => { setForm({...form, storeType: 'skip'}); next(); }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {t('skip_store_setup')}
                  </button>
                </div>

                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={prev} 
                    className="flex items-center justify-center gap-1.5 py-3 px-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t('back_btn')}</span>
                  </button>
                  <button 
                    onClick={next} 
                    disabled={!form.storeType}
                    className="flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <span>{t('continue')}</span>
                    <ArrowRight className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Pickup Address */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('pickupAddress')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickup_address_desc')}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      {t('company_or_contact_label')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Building className="w-4 h-4" />
                      </div>
                      <input 
                        placeholder="Logística S.L. / Juan Pérez" 
                        value={form.pickupAddress.companyName} 
                        onChange={e => setForm({...form, pickupAddress: {...form.pickupAddress, companyName: e.target.value}})} 
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      {t('address')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input 
                        placeholder="Calle de la Logística 12, Piso 1" 
                        value={form.pickupAddress.address} 
                        onChange={e => setForm({...form, pickupAddress: {...form.pickupAddress, address: e.target.value}})} 
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                        {t('city')}
                      </label>
                      <input 
                        placeholder="Madrid" 
                        value={form.pickupAddress.city} 
                        onChange={e => setForm({...form, pickupAddress: {...form.pickupAddress, city: e.target.value}})} 
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                        {t('zip')}
                      </label>
                      <input 
                        placeholder="28001" 
                        value={form.pickupAddress.zip} 
                        onChange={e => setForm({...form, pickupAddress: {...form.pickupAddress, zip: e.target.value}})} 
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <label className="flex items-start gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={Boolean(form.globalTermsAccepted)} onChange={e => setForm({...form, globalTermsAccepted: e.target.checked, globalTermsLanguage: ['es', 'it', 'en'].includes(String(language || '').slice(0, 2)) ? String(language || '').slice(0, 2) : 'en'})} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <span>{language === 'it' ? 'Accetto i Termini e Condizioni Globali di DoorDrop.' : language === 'en' ? 'I accept the DoorDrop Global Terms and Conditions.' : 'Acepto los Términos y Condiciones Globales de DoorDrop.'}{' '}<Link to="/global-terms" target="_blank" rel="noreferrer" className="font-black text-blue-700 hover:underline dark:text-neon-cyan">{language === 'it' ? 'Leggi i termini globali' : language === 'en' ? 'Read global terms' : 'Leer términos globales'}</Link></span>
                  </label>
                </div>

                <div className="flex gap-3 mt-8">
                  <button 
                    disabled={loading || !form.globalTermsAccepted}
                    onClick={handleSubmit} 
                    className="flex-1 py-3 px-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    {t('skipAndFinish')}
                  </button>
                  <button 
                    disabled={loading || !form.globalTermsAccepted || !form.pickupAddress.companyName || !form.pickupAddress.address || !form.pickupAddress.city || !form.pickupAddress.zip}
                    onClick={handleSubmit} 
                    className="flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    {loading ? (
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <>
                        <span>{t('finishRegister')}</span>
                        <CheckCircle2 className="w-4.5 h-4.5" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center mt-4">
                  <button 
                    onClick={prev}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {t('prev_step_btn')}
                  </button>
                </div>
              </div>
            )}

            {/* Stepper Footer Switch */}
            {step === 1 && (
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/50 text-center">
                <Link to="/auth/login" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center justify-center gap-1.5 transition-colors">
                  <span>{t('has_account')}</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 lg:hidden">
          <span>© 2026 {brand.siteName || 'DoorDrop'}. Todos los derechos reservados.</span>
        </div>
      </div>
    </div>
  );
};


// =============================================================================
// PANTALLA: RECUPERAR CONTRASEÑA (FORGOT PASSWORD)
// =============================================================================
const ForgotPassword = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    try {
      await api.forgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 font-sans overflow-x-hidden">
      <AuthSidebar />

      <div className="col-span-1 lg:col-span-7 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-16 relative min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-8">
          <Link to="/" className="lg:hidden">
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-slate-900 dark:text-white" />
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSelector />
          </div>
        </div>

        {/* Content */}
        <div className="my-auto w-full max-w-md mx-auto">
          <div className="text-left mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('forgot_password_title') || 'Recuperar Contraseña'}
            </h2>
            <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400">
              {t('forgot_password_desc') || 'Ingresa el correo electrónico asociado a tu cuenta y te enviaremos un enlace seguro para restablecer tu contraseña.'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-700/55">
            {submitted ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('reset_email_sent_title') || 'Enlace de recuperación enviado'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                  {t('reset_email_sent_desc') || 'Si el correo ingresado coincide con una cuenta activa en DoorDrop, recibirás un enlace válido durante 30 minutos.'}
                </p>
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50">
                  <Link
                    to="/auth/login"
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t('back_to_login') || 'Volver a Iniciar Sesión'}</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('email') || 'Correo Electrónico'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Mail className="w-4.5 h-4.5" />
                    </div>
                    <input
                      required
                      type="email"
                      placeholder="nombre@empresa.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 cursor-pointer transition-all mt-4"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <span>{t('send_reset_link') || 'Enviar Enlace de Recuperación'}</span>
                  )}
                </button>

                <div className="pt-3 text-center">
                  <Link
                    to="/auth/login"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('back_to_login') || 'Volver a Iniciar Sesión'}</span>
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 lg:hidden">
          <span>© 2026 {brand.siteName || 'DoorDrop'}. Todos los derechos reservados.</span>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// PANTALLA: RESTABLECER CONTRASEÑA (RESET PASSWORD)
// =============================================================================
const ResetPassword = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  const location = useLocation();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Leer token desde query params al montar y retirarlo de la barra de URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawToken = params.get('token');
    if (rawToken) {
      setToken(rawToken);
      // Evitar que el token quede expuesto en la URL visible
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        // Ignorar si el navegador restringe el historial
      }
    }
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(t('invalid_reset_token') || 'El enlace de recuperación es inválido o ha expirado.');
      return;
    }

    if (newPassword.length < 8) {
      setError(t('password_min_length') || 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwords_dont_match') || 'Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.resetPassword({ token, newPassword });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'No se pudo restablecer la contraseña. Solicita un nuevo enlace.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 font-sans overflow-x-hidden">
      <AuthSidebar />

      <div className="col-span-1 lg:col-span-7 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-16 relative min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-8">
          <Link to="/" className="lg:hidden">
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-slate-900 dark:text-white" />
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSelector />
          </div>
        </div>

        {/* Content */}
        <div className="my-auto w-full max-w-md mx-auto">
          <div className="text-left mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('reset_password_title') || 'Crear Nueva Contraseña'}
            </h2>
            <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400">
              {t('reset_password_desc') || 'Establece una nueva contraseña segura para tu cuenta en DoorDrop.'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-700/55">
            {success ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('reset_success_title') || '¡Contraseña restablecida con éxito!'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                  {t('reset_success_desc') || 'Tu contraseña ha sido actualizada. Ya puedes ingresar a tu cuenta.'}
                </p>
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50">
                  <Link
                    to="/auth/login"
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
                  >
                    <span>{t('back_to_login') || 'Iniciar Sesión'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : !token && !loading ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Enlace inválido o incompleto
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  No se detectó un token de recuperación válido en la dirección solicitada. Por favor, solicita un nuevo enlace.
                </p>
                <div className="pt-4">
                  <Link
                    to="/auth/forgot-password"
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
                  >
                    <span>Solicitar nuevo enlace</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('new_password') || 'Nueva Contraseña'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Lock className="w-4.5 h-4.5" />
                    </div>
                    <input
                      required
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {t('password_min_length') || 'Mínimo 8 caracteres.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('confirm_password') || 'Confirmar Contraseña'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Lock className="w-4.5 h-4.5" />
                    </div>
                    <input
                      required
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg shadow-blue-500/10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 cursor-pointer transition-all mt-4"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <span>{t('reset_password_button') || 'Guardar Nueva Contraseña'}</span>
                  )}
                </button>

                <div className="pt-3 text-center">
                  <Link
                    to="/auth/login"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('back_to_login') || 'Volver a Iniciar Sesión'}</span>
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 lg:hidden">
          <span>© 2026 {brand.siteName || 'DoorDrop'}. Todos los derechos reservados.</span>
        </div>
      </div>
    </div>
  );
};

const PaypalAuthCallback = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const status = new URLSearchParams(location.search).get('status');
    if (status && status !== 'success') {
      setLoading(false);
      setError(status === 'cancelled' ? t('paypal_auth_cancelled') : t('paypal_auth_error'));
      return;
    }

    let active = true;
    api.completePaypalAuth()
      .then((res: any) => {
        if (!active) return;
        setAuthToken(res.token);
        const next = resolvePostAuthNavigation(undefined);
        navigate(next.path, next.state ? { state: next.state, replace: true } : { replace: true });
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err.message || t('paypal_auth_error'));
        setLoading(false);
      });
    return () => { active = false; };
  }, [location.search, navigate, t]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#009cde]/20 bg-white shadow-sm">
          <PayPalMark className="h-8 w-8" />
        </div>
        {loading ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('paypal_auth_pending')}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('paypal_auth_loading')}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('paypal_auth_error')}</h1>
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <Link to="/auth/login" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              {t('back_to_login')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

const EmailVerification = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(location.search);
    const rawToken = params.get('token') || '';
    const queryEmail = params.get('email') || '';
    setEmail(queryEmail);
    setError('');
    setResent(false);
    setSuccess(false);

    // El token solo se necesita durante esta carga; no lo dejamos visible en el historial.
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {}

    if (!rawToken) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    api.completeEmailVerification({ token: rawToken })
      .then(() => { if (active) setSuccess(true); })
      .catch((err: any) => { if (active) setError(err.message || t('email_verification_invalid')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [location.search, t]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError(t('email_verification_email_required'));
      return;
    }
    setResendLoading(true);
    setError('');
    setResent(false);
    try {
      await api.resendEmailVerification({ email: normalizedEmail });
      setResent(true);
    } catch (err: any) {
      setError(err.message || t('email_verification_resend_error'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 font-sans overflow-x-hidden">
      <AuthSidebar />
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-16 relative min-h-screen">
        <div className="flex items-center justify-between w-full mb-8">
          <Link to="/" className="lg:hidden">
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-slate-900 dark:text-white" />
          </Link>
          <div className="ml-auto flex items-center gap-4"><LanguageSelector /></div>
        </div>

        <div className="my-auto w-full max-w-md mx-auto">
          <div className="text-left mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('email_verification_title')}
            </h2>
            <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400">
              {t('email_verification_desc')}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-700/55">
            {loading ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
                  <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('email_verification_pending')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('email_verification_pending_desc')}</p>
              </div>
            ) : success ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('email_verification_success_title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t('email_verification_success_desc')}</p>
                <Link to="/auth/login" className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10">
                  <span>{t('email_verification_login')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium">{error}</div>}
                {resent && <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-medium">{t('email_verification_resent')}</div>}
                <div className="text-center py-2">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('email_verification_check_title')}</h3>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t('email_verification_check_desc')}</p>
                </div>
                <form onSubmit={resend} className="space-y-3 pt-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com" className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 pl-11 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" />
                  </div>
                  <button disabled={resendLoading} type="submit" className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all">
                    {resendLoading ? t('email_verification_resending') : t('email_verification_resend')}
                  </button>
                </form>
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">{t('email_verification_expiry')}</p>
                <div className="pt-3 text-center border-t border-slate-100 dark:border-slate-700/50">
                  <Link to="/auth/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('back_to_login')}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 lg:hidden">
          <span>© 2026 {brand.siteName || 'DoorDrop'}. {t('footer_rights')}</span>
        </div>
      </div>
    </div>
  );
};


export default function AuthPages() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<EmailVerification />} />
      <Route path="/paypal/callback" element={<PaypalAuthCallback />} />
    </Routes>
  );
}
