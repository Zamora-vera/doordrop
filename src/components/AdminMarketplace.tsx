import React, { useState, useEffect, useMemo } from 'react';
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
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal
} from 'lucide-react';
import { api } from '../lib/api';

export function AdminMarketplace() {
  const [activeTab, setActiveTab] = useState<'stats' | 'listings' | 'sellers'>('listings');
  const [stats, setStats] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters for listings
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'price_asc' | 'price_desc'>('newest');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sellerFilter, sortBy, pageSize]);

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

  // Distinct seller names for filter dropdown
  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(item => {
      if (item.seller_name) set.add(item.seller_name);
    });
    return Array.from(set).sort();
  }, [listings]);

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    return listings.filter(item => {
      // Status filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;

      // Seller filter
      if (sellerFilter !== 'all' && item.seller_name !== sellerFilter) return false;

      // Search query (title, seller_name, city, country, id)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchSeller = (item.seller_name || '').toLowerCase().includes(q);
        const matchCity = (item.city || '').toLowerCase().includes(q);
        const matchId = (item.id || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSeller && !matchCity && !matchId) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'price_asc') return (a.price_minor || 0) - (b.price_minor || 0);
      if (sortBy === 'price_desc') return (b.price_minor || 0) - (a.price_minor || 0);
      return 0;
    });
  }, [listings, statusFilter, sellerFilter, searchQuery, sortBy]);

  // Paginated listings slice
  const totalItems = filteredListings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredListings.slice(start, start + pageSize);
  }, [filteredListings, currentPage, pageSize]);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-100 dark:bg-dark-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Refrescar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Cargando datos...
        </div>
      ) : (
        <>
          {/* TAB: STATS */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Publicaciones Activas</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats?.listings?.active_listings || 0}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-bold">
                    {stats?.listings?.total_listings || 0} publicaciones totales
                  </span>
                </div>
                <div className="p-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-400">Vendedores Registrados</span>
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

          {/* TAB: LISTINGS (Con Filtros Potentes y Paginación) */}
          {activeTab === 'listings' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="p-4 bg-white dark:bg-dark-800 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                  {/* Search box */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre de producto, vendedor o ciudad..."
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter Dropdowns */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">Estado:</span>
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">Todos los estados</option>
                        <option value="active">Activo</option>
                        <option value="pending_review">Pendiente</option>
                        <option value="rejected">Rechazado</option>
                        <option value="sold">Vendido</option>
                      </select>
                    </div>

                    {/* Seller filter */}
                    {sellerOptions.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500">Vendedor:</span>
                        <select
                          value={sellerFilter}
                          onChange={e => setSellerFilter(e.target.value)}
                          className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                          <option value="all">Todos ({sellerOptions.length})</option>
                          {sellerOptions.map(seller => (
                            <option key={seller} value={seller}>{seller}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Sort by */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">Orden:</span>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="newest">Más recientes</option>
                        <option value="oldest">Más antiguos</option>
                        <option value="price_asc">Menor precio</option>
                        <option value="price_desc">Mayor precio</option>
                      </select>
                    </div>

                    {/* Page Size */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">Mostrar:</span>
                      <select
                        value={pageSize}
                        onChange={e => setPageSize(Number(e.target.value))}
                        className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Status Bar counter */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
                  <div>
                    Mostrando <strong className="text-slate-900 dark:text-white">{totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> - <strong className="text-slate-900 dark:text-white">{Math.min(currentPage * pageSize, totalItems)}</strong> de <strong className="text-slate-900 dark:text-white">{totalItems}</strong> publicaciones encontradas
                    {(statusFilter !== 'all' || sellerFilter !== 'all' || searchQuery) && (
                      <span className="ml-2 text-blue-600 font-semibold">(Filtros activos)</span>
                    )}
                  </div>
                  {(statusFilter !== 'all' || sellerFilter !== 'all' || searchQuery) && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('all');
                        setSellerFilter('all');
                      }}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
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
                      {paginatedListings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            No se encontraron publicaciones con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedListings.map(item => (
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
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                item.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                                item.status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="p-4 text-right space-x-1 whitespace-nowrap">
                              {item.status !== 'active' && (
                                <button
                                  onClick={() => handleModerate(item.id, 'active')}
                                  className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
                                  title="Aprobar"
                                >
                                  Aprobar
                                </button>
                              )}
                              {item.status !== 'rejected' && (
                                <button
                                  onClick={() => handleModerate(item.id, 'rejected')}
                                  className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-sm"
                                  title="Rechazar"
                                >
                                  Rechazar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {totalItems > 0 && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="text-slate-500">
                      Página <strong className="text-slate-900 dark:text-white">{currentPage}</strong> de <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-900"
                        title="Primera página"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-900"
                        title="Anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {/* Numbered page buttons */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = currentPage;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded-lg font-bold text-xs transition ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-900'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-900"
                        title="Siguiente"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-900"
                        title="Última página"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
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
