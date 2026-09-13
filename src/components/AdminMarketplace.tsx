import React, { useState, useEffect } from 'react';
import {
  Store,
  ShieldCheck,
  Package,
  DollarSign,
  Users,
  CheckCircle2,
  XCircle,
  Eye,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  X
} from 'lucide-react';
import { api } from '../lib/api';

export function AdminMarketplace() {
  const [activeTab, setActiveTab] = useState<'stats' | 'listings' | 'sellers'>('stats');
  const [stats, setStats] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'stats') {
        const res = await api.getAdminMarketplaceStats();
        setStats(res);
      } else if (activeTab === 'listings') {
        const res = await api.getAdminMarketplaceListings();
        setListings(res.listings || []);
      } else if (activeTab === 'sellers') {
        const res = await api.getAdminMarketplaceSellers();
        setSellers(res.sellers || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (id: string, status: string) => {
    try {
      await api.moderateAdminMarketplaceListing(id, { status });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error al moderar publicación');
    }
  };

  const handleVerifySeller = async (id: string, verificationLevel: string) => {
    try {
      await api.verifyAdminMarketplaceSeller(id, { verificationLevel });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar verificación de vendedor');
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Administración del Marketplace</h2>
          </div>
          <p className="text-xs text-slate-500">Gestión de publicaciones, moderación, verificación de vendedores y comisiones.</p>
        </div>

        {/* Sub tabs */}
        <div className="flex items-center gap-2">
          {[
            { key: 'stats', label: 'Métricas y Resumen' },
            { key: 'listings', label: 'Publicaciones' },
            { key: 'sellers', label: 'Vendedores' }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button onClick={loadData} className="p-2 rounded-xl border hover:bg-slate-100 text-slate-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center items-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* TAB: STATS */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Total Publicaciones</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats?.listings?.total_listings || 0}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-bold">
                    {stats?.listings?.active_listings || 0} activas
                  </span>
                </div>
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Total Vendedores</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats?.sellers?.total_sellers || 0}
                  </p>
                  <span className="text-[10px] text-blue-600 font-bold">
                    {stats?.sellers?.verified_sellers || 0} verificados
                  </span>
                </div>
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Pedidos Marketplace</span>
                  <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
                    {stats?.orders?.total_orders || 0}
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold">Completados con envío</span>
                </div>
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Comisiones Generadas</span>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {((stats?.orders?.total_commission_minor || 0) / 100).toFixed(2)} €
                  </p>
                  <span className="text-[10px] text-emerald-600 font-bold">Margen DoorDrop</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LISTINGS */}
          {activeTab === 'listings' && (
            <div className="bg-white dark:bg-dark-800 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-dark-900 text-slate-400 uppercase font-black text-[10px] border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-4">Producto</th>
                      <th className="p-4">Vendedor</th>
                      <th className="p-4">Precio</th>
                      <th className="p-4">Ubicación</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {listings.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-dark-900/50">
                        <td className="p-4 font-bold text-slate-900 dark:text-white max-w-xs truncate">
                          {item.title}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          {item.seller_name || 'Vendedor'}
                        </td>
                        <td className="p-4 font-black">
                          {(item.price_minor / 100).toFixed(2)} {item.currency}
                        </td>
                        <td className="p-4 text-slate-500">
                          {item.city}, {item.country_code}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-1">
                          {item.status !== 'active' && (
                            <button
                              onClick={() => handleModerate(item.id, 'active')}
                              className="px-2 py-1 rounded bg-emerald-600 text-white font-bold"
                              title="Aprobar"
                            >
                              Aprobar
                            </button>
                          )}
                          {item.status !== 'rejected' && (
                            <button
                              onClick={() => handleModerate(item.id, 'rejected')}
                              className="px-2 py-1 rounded bg-rose-600 text-white font-bold"
                              title="Rechazar"
                            >
                              Rechazar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SELLERS */}
          {activeTab === 'sellers' && (
            <div className="bg-white dark:bg-dark-800 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-dark-900 text-slate-400 uppercase font-black text-[10px] border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-4">Nombre Comercial</th>
                      <th className="p-4">Email de Usuario</th>
                      <th className="p-4">País / Ciudad</th>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Verificación</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sellers.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-dark-900/50">
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          {s.display_name}
                        </td>
                        <td className="p-4 text-slate-500">
                          {s.email}
                        </td>
                        <td className="p-4 text-slate-500">
                          {s.city}, {s.country}
                        </td>
                        <td className="p-4 capitalize">
                          {s.seller_type}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.verification_level === 'verified' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {s.verification_level}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-1">
                          {s.verification_level !== 'verified' ? (
                            <button
                              onClick={() => handleVerifySeller(s.id, 'verified')}
                              className="px-2.5 py-1 rounded bg-blue-600 text-white font-bold"
                            >
                              Verificar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleVerifySeller(s.id, 'unverified')}
                              className="px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-bold"
                            >
                              Revocar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
