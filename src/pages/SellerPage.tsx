import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Store, ShieldCheck, MapPin, Package, Star, Clock, Heart } from 'lucide-react';
import { api } from '../lib/api';

export function SellerPage() {
  const { slug } = useParams();
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
      .catch(() => {})
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
      {/* Seller Header */}
      <div className="bg-white dark:bg-dark-900 border-b border-slate-200 dark:border-slate-800 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-3xl shadow-lg shrink-0">
            {seller.display_name.substring(0, 2).toUpperCase()}
          </div>

          <div className="space-y-2 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {seller.display_name}
              </h1>
              {seller.verification_level === 'verified' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Vendedor Verificado</span>
                </span>
              )}
            </div>

            {seller.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                {seller.description}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-semibold text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {seller.city}, {seller.country}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Star className="w-3.5 h-3.5 fill-current" />
                {seller.avg_rating > 0 ? seller.avg_rating.toFixed(1) : 'Nuevo'} ({seller.total_ratings} valoraciones)
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {seller.total_sales} ventas completadas
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Seller Listings */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Publicaciones activas ({listings.length})
          </h2>
          <Link to="/marketplace" className="text-xs font-bold text-blue-600 hover:underline">
            Explorar todo el marketplace
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Este vendedor no tiene publicaciones activas en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {listings.map(item => {
              const price = (item.price_minor / 100).toFixed(2);
              const cover = item.images?.[0]?.url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&q=80';

              return (
                <Link
                  key={item.id}
                  to={`/marketplace/producto/${item.slug || item.id}`}
                  className="group bg-white dark:bg-dark-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400 overflow-hidden shadow-sm hover:shadow-lg transition-all flex flex-col"
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img src={cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="p-3.5 space-y-1">
                    <span className="text-base font-black text-slate-900 dark:text-white">
                      {price} {item.currency}
                    </span>
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">
                      {item.title}
                    </h4>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
