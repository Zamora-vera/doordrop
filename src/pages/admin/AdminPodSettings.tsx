import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Layers, CheckCircle2, AlertTriangle, ExternalLink, Globe, Shield, ShoppingBag, Truck, Percent, Store } from 'lucide-react';
import { api } from '../../lib/api';

export default function AdminPodSettings() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [margin, setMargin] = useState('35');
  const [storeName, setStoreName] = useState('Zubuy Print');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminPodStatus();
      if (res && res.success) {
        setStatus(res.status);
        setMargin(String(res.status.globalMarginPercent || 35));
        setStoreName(res.status.storeName || 'Zubuy Print');
      }
    } catch (err) {
      console.error('Error fetching POD status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.triggerAdminPodSync({ batchSize: 20 });
      setSyncResult(res);
      await fetchStatus();
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'No fue posible completar la actualización. Intenta nuevamente.'
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.updateAdminPodSettings({
        globalMarginPercent: Number(margin),
        storeName
      });
      alert('Configuración guardada exitosamente.');
      await fetchStatus();
    } catch {
      alert('Error al guardar configuración.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Print On Demand Oficial
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              Contrado Helix v1
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Zubuy Print / Contrado POD</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            Centro de control del proveedor y tienda oficial de Print On Demand. Sincronización automática de 20 productos nocturna cada 12 horas, tarifas de envío calculadas en origen y webhook de seguimiento.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://doordrop.lat/marketplace/sellers/zubuy-print"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:border-indigo-400 transition-colors shadow-sm"
          >
            <Store className="w-4 h-4 text-indigo-600" /> Ver Tienda Pública
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* Grid de Estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="p-6 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Estado Conexión</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xl font-black text-slate-900 dark:text-white">Conectado</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono">Store ID: {status?.storeId || 61803}</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Productos Activos</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{status?.activeProductsCount || 0}</p>
          <p className="text-xs text-slate-500 mt-2">En catálogo Zubuy Print</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Margen Comercial</p>
          <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{status?.globalMarginPercent || 35}%</p>
          <p className="text-xs text-slate-500 mt-2">Sobre coste Contrado</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Módulo Canvas</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
              {status?.canvasStatus || 'En validación'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Helix v1 sin Artwork API</p>
        </div>
      </div>

      {/* Sincronización Manual & Cron */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-black mb-2 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" /> Sincronización de Catálogo
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            El cron jobs nocturno se ejecuta automáticamente cada 12 horas subiendo 20 productos por lote. También puedes forzar una sincronización manual en este momento.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 mb-6">
            <div>
              <p className="text-xs font-black text-slate-700 dark:text-slate-300">Última sincronización:</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Pendiente de inicio'}
              </p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-700 dark:text-slate-300">Próxima ejecución:</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {status?.nextSyncAt ? new Date(status.nextSyncAt).toLocaleString() : 'Programada (12 horas)'}
              </p>
            </div>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Sincronizando lote...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Sincronizar Ahora (20 items)
                </>
              )}
            </button>
          </div>

          {syncResult && (
            <div
              className={`p-4 rounded-xl border text-xs font-mono transition-all ${
                syncResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {syncResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                <span>{syncResult.message} {syncResult.syncedCount !== undefined && `(${syncResult.syncedCount} productos importados)`}</span>
              </div>
            </div>
          )}
        </div>

        {/* Configuración de Margen */}
        <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-black mb-2 flex items-center gap-2">
              <Percent className="w-5 h-5 text-indigo-600" /> Parámetros de Precios
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              El precio final al público en DoorDrop se calcula automáticamente aplicando este margen sobre el coste original del fabricante.
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-2">
                  Margen Global (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="0.5"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-2">
                  Nombre de la Tienda Oficial
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-black text-xs transition-all shadow-md disabled:opacity-60"
              >
                {savingSettings ? 'Guardando...' : 'Guardar Parámetros'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Tarjeta de Webhook y Configuración de Dominio */}
      <div className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8">
        <h3 className="text-lg font-black mb-3 flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-400" /> Registro de Webhook & Dominio en Contrado
        </h3>
        <p className="text-xs text-slate-300 mb-6 max-w-3xl">
          Para recibir cambios de estado de producción (`OrderStatusChange`, `ProductDisContinue`, `Dispatched`) en tiempo real, registra la siguiente URL en tu cuenta de Contrado (*API Integration → Webhook and Domain Registration*):
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700">
            <p className="text-[11px] font-sans font-bold text-indigo-300 uppercase mb-1">Webhook Endpoint URL</p>
            <p className="text-white font-bold select-all">https://doordrop.lat/api/webhooks/contrado</p>
            <p className="text-[10px] text-slate-400 font-sans mt-2">Compatible con firma HMAC-SHA256 y header X-Hub-Signature-256</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700">
            <p className="text-[11px] font-sans font-bold text-indigo-300 uppercase mb-1">Dominio Autorizado</p>
            <p className="text-white font-bold select-all">doordrop.lat</p>
            <p className="text-[10px] text-slate-400 font-sans mt-2">Buzón de operaciones: prints@doordrop.lat</p>
          </div>
        </div>
      </div>
    </div>
  );
}
