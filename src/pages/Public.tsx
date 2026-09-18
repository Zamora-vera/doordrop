import React, { useState } from 'react';
import { Routes, Route, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Package, Truck, ArrowRight, Search, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { LanguageSelector } from '../components/LanguageSelector';
import { Landing } from './Landing';
import OmnichannelSales from './OmnichannelSales';
import { BrandMark, useBrand } from '../lib/brand';
import MarketplaceTermsDocument from '../components/MarketplaceTermsDocument';
import OmnichannelTermsDocument from '../components/OmnichannelTermsDocument';
import ShippingTermsDocument from '../components/ShippingTermsDocument';
import GlobalTermsDocument from '../components/GlobalTermsDocument';

const Navbar = () => {
  const { t } = useI18n();
  return (
    <nav className="flex items-center justify-between p-6 max-w-7xl mx-auto w-full border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-dark-900">
      <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-gray-900 dark:text-white" />
      <div className="hidden md:flex gap-8 items-center text-sm font-medium text-gray-600 dark:text-gray-300">
        <Link to="/" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('home')}</Link>
        <Link to="/marketplace" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors font-bold text-blue-600 dark:text-neon-cyan">Marketplace</Link>
        <Link to="/tracking" className="hover:text-blue-600 dark:hover:text-neon-cyan transition-colors">{t('tracking')}</Link>
      </div>
      <div className="flex items-center gap-4">
        <LanguageSelector />
        <Link to="/auth/login" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-neon-cyan">{t('login')}</Link>
        <Link to="/auth/register" className="text-sm font-medium bg-blue-600 dark:bg-neon-cyan text-white dark:text-gray-900 px-5 py-2.5 rounded-full hover:bg-blue-700 transition-all">
          {t('register')}
        </Link>
      </div>
    </nav>
  );
};

const Home = () => {
  const { t } = useI18n();
  const { brand } = useBrand();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 max-w-5xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-8">
          <Truck className="w-4 h-4" />
          {brand.siteName}
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-8 leading-tight" dangerouslySetInnerHTML={{__html: t('heroTitle').replace('. ', '. <br/> ')}} />
        <p className="text-xl text-gray-600 mb-12 max-w-2xl">
          {t('heroDesc')}
        </p>
        <div className="flex gap-4">
          <Link to="/auth/register" className="bg-blue-600 text-white px-8 py-4 rounded-full font-medium hover:bg-blue-700 transition-all flex items-center gap-2">
            {t('createAccount')} <ArrowRight className="w-5 h-5" />
          </Link>
          <Link to="/tracking" className="bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-full font-medium hover:border-gray-300 hover:bg-gray-50 transition-all">
            {t('trackPackage')}
          </Link>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-8 text-left w-full">
          {[
            { title: t('connectStore'), desc: t('connectStoreDesc') },
            { title: t('quoteAndChoose'), desc: t('quoteAndChooseDesc') },
            { title: t('notifyClients'), desc: t('notifyClientsDesc') }
          ].map((feature, i) => (
            <div key={i} className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <CheckCircle2 className="w-8 h-8 text-blue-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

const Tracking = () => {
  const { t, language, setLanguage } = useI18n();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const lang = params.get('lang') as any;
    if (lang && ['es','en','it','fr'].includes(lang)) setLanguage(lang);
  }, [params, setLanguage]);

  React.useEffect(() => {
    const initialCode = params.get('code');
    if (!initialCode) return;
    setCode(initialCode);
    (async () => {
      setLoading(true);
      setError('');
      try { setData(await api.trackShipment(initialCode)); }
      catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [params]);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await api.trackShipment(code);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-900 flex flex-col font-sans transition-colors">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-20 relative">
        <div className="absolute top-10 left-10 w-64 h-64 bg-blue-300/10 dark:bg-neon-cyan/5 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-pink-300/10 dark:bg-neon-pink/5 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] pointer-events-none"></div>

        <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-4 text-center tracking-tight">{t('trackTitle')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-12 max-w-lg mx-auto">{t('trackDesc')}</p>
        
        <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3 mb-16 max-w-2xl mx-auto">
          <input
            type="text"
            placeholder={t('trackPlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 px-6 py-4 rounded-xl border border-gray-200 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-800 text-gray-900 dark:text-white shadow-sm font-mono text-lg"
          />
          <button type="submit" disabled={loading} className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-neon-cyan dark:to-neon-green text-white dark:text-gray-900 px-10 py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105">
            <Search className="w-5 h-5" />
            {loading ? t('searching') : t('search')}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-6 rounded-2xl text-center font-bold max-w-2xl mx-auto border border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}

        {data && (
          <div className="bg-white dark:bg-dark-800 border border-gray-100 dark:border-gray-700 rounded-3xl p-8 shadow-xl max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 pb-8 border-b border-gray-100 dark:border-gray-700 gap-4">
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('code')}</p>
                <p className="font-mono text-2xl font-black text-gray-900 dark:text-white">{data.trackingCode}</p>
                {data.destination && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{language === 'it' ? 'Destinazione' : language === 'en' ? 'Destination' : language === 'fr' ? 'Destination' : 'Destino'}: {data.destination}</p>}
                {data.courier && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Courier: <span className="font-black text-gray-800 dark:text-white">{data.courier}</span></p>}
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('status')}</p>
                <p className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 dark:bg-neon-cyan/10 dark:text-neon-cyan font-bold text-sm border border-blue-100 dark:border-neon-cyan/20">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> {data.status}
                </p>
                {data.updatedAt && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{language === 'it' ? 'Aggiornato' : language === 'en' ? 'Updated' : language === 'fr' ? 'Mis à jour' : 'Actualizado'}: {new Date(data.updatedAt).toLocaleString()}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
              <div className="rounded-2xl bg-slate-50 dark:bg-dark-900/60 border border-slate-100 dark:border-gray-700 p-4"><p className="text-xs font-black uppercase text-slate-400 mb-1">Tracking</p><p className="font-mono font-black text-slate-900 dark:text-white break-all">{data.providerTrackingCode || data.trackingCode}</p></div>
              <div className="rounded-2xl bg-slate-50 dark:bg-dark-900/60 border border-slate-100 dark:border-gray-700 p-4"><p className="text-xs font-black uppercase text-slate-400 mb-1">Estado</p><p className="font-black text-slate-900 dark:text-white">{data.status}</p></div>
              <div className="rounded-2xl bg-slate-50 dark:bg-dark-900/60 border border-slate-100 dark:border-gray-700 p-4"><p className="text-xs font-black uppercase text-slate-400 mb-1">Etiqueta</p><p className={`font-black ${data.labelReady ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>{data.labelReady ? (language === 'it' ? 'Disponibile' : 'Disponible') : (language === 'it' ? 'In preparazione' : 'En preparación')}</p></div>
            </div>

            <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-200 before:to-gray-100 dark:before:from-neon-cyan/30 dark:before:to-gray-800">
              {data.events.map((ev: any, i: number) => (
                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mb-8 last:mb-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-dark-800 bg-blue-500 dark:bg-neon-cyan text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <div className="w-2 h-2 rounded-full bg-white dark:bg-dark-900"></div>
                  </div>
                  
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-dark-900/50 shadow-sm">
                    <p className="font-bold text-gray-900 dark:text-white">{ev.status}</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{ev.description}</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-3 font-medium">{new Date(ev.date).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default function PublicPages() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/terms" element={<MarketplaceTermsDocument />} />
      <Route path="/global-terms" element={<GlobalTermsDocument />} />
      <Route path="/terms/global" element={<GlobalTermsDocument />} />
      <Route path="/omnichannel/terms" element={<OmnichannelTermsDocument />} />
      <Route path="/shipping/terms" element={<ShippingTermsDocument />} />
      <Route path="/tracking" element={<Tracking />} />
      <Route path="/omnichannel" element={<OmnichannelSales />} />
    </Routes>
  );
}
