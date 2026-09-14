import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Store, ShieldCheck, MapPin, Package, Star, Clock, Heart, Sparkles, Truck, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function SellerPage() {
  const { slug } = useParams();
  const { t } = useI18n();
  const [seller, setSeller] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.getMarketplaceSeller(slug)
      .then(res => {
        setSeller(res.seller);
        setListings(res.listings || []);
      })
      .catch((err) => {
        console.error('Error fetching seller:', err);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex items-center justify-center p-4">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex flex-col items-center justify-center p-4 text-center">
        <Store className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">Vendedor no encontrado</h2>
        <Link to="/marketplace" className="px-5 py-2.5 rounded-full bg-blue-600 text-white font-bold text-sm">
          Volver al Marketplace
        </Link>
      </div>
    );
  }

  const isZubuy = seller.slug === 'zubuy-print';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 text-slate-900 dark:text-white">
      {/* Banner / Header */}
      <div className={`border-b ${isZubuy ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-indigo-900/50' : 'bg-white dark:bg-dark-900 border-slate-100 dark:border-slate-800'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            {/* Avatar / Logo */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden bg-slate-200 dark:bg-dark-800 border-4 border-white dark:border-dark-800 shadow-xl shrink-0">
              {seller.logo_url || seller.avatar_url ? (
                <img src={seller.logo_url || seller.avatar_url} alt={seller.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Store className="w-10 h-10" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{seller.display_name}</h1>
                {seller.verification_level === 'professional' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-black uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Tienda Oficial
                  </span>
                )}
                {isZubuy && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Print On Demand
                  </span>
                )}
              </div>

              <p className={`text-sm max-w-2xl leading-relaxed mb-4 ${isZubuy ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {seller.description || 'Tienda verificada en DoorDrop Marketplace.'}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs">
                {seller.city && (
                  <div className="flex items-center gap-1 opacity-80">
                    <MapPin className="w-4 h-4 text-indigo-400" /> {seller.city}, {seller.country}
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-80">
                  <Package className="w-4 h-4 text-indigo-400" /> {listings.length} Productos
                </div>
                {isZubuy && (
                  <div className="flex items-center gap-1 text-indigo-300 font-bold">
                    <Truck className="w-4 h-4" /> Envío internacional garantizado
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Catálogo de Productos</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isZubuy ? 'Artículos exclusivos fabricados bajo pedido' : 'Publicaciones disponibles'}
            </p>
          </div>
          <Link to="/marketplace" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            ← Volver al Marketplace
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 p-12 text-center max-w-xl mx-auto my-8 shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
              {isZubuy ? 'Catálogo en preparación' : 'No hay productos para mostrar'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              {isZubuy
                ? 'Los productos de Zubuy Print se sincronizan automáticamente cada 12 horas desde Contrado Helix. Puedes crear tus diseños en Contrado o sincronizar el catálogo desde el panel Super Admin.'
                : 'Este vendedor no tiene publicaciones activas en este momento.'}
            </p>
            {isZubuy ? (
              <a
                href="https://www.contrado.it/estore/account/manage/api/developer"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg transition-all"
              >
                Panel de Diseños Contrado
              </a>
            ) : (
              <Link
                to="/marketplace"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg transition-all"
              >
                Explorar otros vendedores
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {listings.map((item) => (
              <Link
                key={item.id}
                to={`/marketplace/producto/${item.slug}`}
                className="group rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-xl hover:border-indigo-400 transition-all flex flex-col"
              >
                <div className="aspect-square bg-slate-100 dark:bg-dark-800 relative overflow-hidden">
                  <img
                    src={item.cover_image_url || item.images?.[0]?.url || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400'}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {isZubuy && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-900/80 text-white backdrop-blur-sm">
                      {t('pod_badge') || 'Fabricado bajo pedido'}
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {item.title}
                    </h4>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-bold">Precio</span>
                    <span className="text-base font-black text-slate-900 dark:text-white">
                      {(item.price_minor / 100).toFixed(2)} €
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
