import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  Key,
  Globe,
  DollarSign,
  Users,
  MessageSquare,
  Share2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Check,
  Radio,
  Bot,
  Percent
} from 'lucide-react';
import { omnichannelApi } from '../lib/omnichannelApi';

export function AdminOmnichannel() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form settings
  const [formData, setFormData] = useState({
    zernio_api_key: 'sk_895a0c3cf6da498f854c000ef72860d0ca5f5c313464055e44e07454a50cfa7a',
    zernio_webhook_secret: 'whsec_dd_omni_895a0c3cf6da498f854c000ef72860d0',
    zernio_api_url: 'https://zernio.com/api/v1',
    omnichannel_extra_channel_usd: '8.00',
    omnichannel_default_currency: 'EUR',
    deepseek_api_key: 'sk-placeholder-api-key',
    deepseek_api_url: 'https://api.deepseek.com',
    deepseek_model: 'deepseek-chat',
    omnichannel_ai_margin_percent: '10.0'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await omnichannelApi.getAdminSettings();
      setOverview(res.overview);
      if (res.settings) {
        const map: any = {};
        res.settings.forEach((s: any) => { map[s.setting_key] = s.setting_value; });
        setFormData({
          zernio_api_key: map.zernio_api_key || formData.zernio_api_key,
          zernio_webhook_secret: map.zernio_webhook_secret || formData.zernio_webhook_secret,
          zernio_api_url: map.zernio_api_url || formData.zernio_api_url,
          omnichannel_extra_channel_usd: map.omnichannel_extra_channel_usd || '8.00',
          omnichannel_default_currency: map.omnichannel_default_currency || 'EUR',
          deepseek_api_key: map.deepseek_api_key || formData.deepseek_api_key,
          deepseek_api_url: map.deepseek_api_url || formData.deepseek_api_url,
          deepseek_model: map.deepseek_model || formData.deepseek_model,
          omnichannel_ai_margin_percent: map.omnichannel_ai_margin_percent || '10.0'
        });
      }

      const clientRes = await omnichannelApi.getAdminClients();
      setClients(clientRes.clients || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar configuración de Super Admin');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      await omnichannelApi.saveAdminSettings(formData);
      setStatusMsg('Configuración del proveedor Zernio y DeepSeek AI guardada exitosamente.');
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await omnichannelApi.testProviderConnection();
      setStatusMsg(`✅ Conexión con Zernio verificada (${res.profiles_count} perfiles activos).`);
    } catch (err: any) {
      setErrorMsg(`❌ ${err.message || 'Error de conexión'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleTestDeepSeek = async () => {
    setTestingAi(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${formData.deepseek_api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10
        })
      });
      if (res.ok) {
        setStatusMsg('✅ DeepSeek AI API Key verificada y operativa (Modelo: deepseek-chat).');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setErrorMsg(`❌ Error probando DeepSeek: ${e.message}`);
    } finally {
      setTestingAi(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-gray-900 via-slate-900 to-indigo-950 text-white shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-blue-400/30">
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin Portal
            </div>
            <h1 className="text-2xl font-bold tracking-tight">DoorDrop Omnicanal — Proveedores & Reventa AI</h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Configuración central de Zernio (canales y mensajería) y DeepSeek AI (modelo, visión y margen comercial del 10% descontado del saldo/wallet).
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
            title="Refrescar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-center gap-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-xs font-bold text-gray-400 uppercase">Suscriptores Activos</div>
          <div className="text-2xl font-black mt-2 text-gray-900 dark:text-white">{overview?.total_subscribers || 0}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-xs font-bold text-gray-400 uppercase">MRR Omnicanal</div>
          <div className="text-2xl font-black mt-2 text-emerald-600 dark:text-emerald-400">€{overview?.mrr || '0.00'}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-xs font-bold text-gray-400 uppercase">Canales Vinculados</div>
          <div className="text-2xl font-black mt-2 text-blue-600 dark:text-blue-400">{overview?.total_channels || 0}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-xs font-bold text-gray-400 uppercase">Mensajes Procesados</div>
          <div className="text-2xl font-black mt-2 text-indigo-600 dark:text-indigo-400">{overview?.total_messages || 0}</div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* DeepSeek AI Provider Box */}
        <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-600" /> DeepSeek AI (Motor Inteligente & Reventa)
              </h2>
              <p className="text-xs text-gray-500">
                Responde en WhatsApp, Facebook e Instagram. El costo de tokens se descuenta directamente de la recarga de saldo/wallet del cliente con un +10% de ganancia.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestDeepSeek}
              disabled={testingAi}
              className="px-3.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold text-xs border border-purple-200 dark:border-purple-800 flex items-center gap-1.5"
            >
              <Radio className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin' : ''}`} /> Probar DeepSeek
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                DeepSeek API Key
              </label>
              <input
                type="password"
                value={formData.deepseek_api_key}
                onChange={e => setFormData({ ...formData, deepseek_api_key: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-mono focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Margen de Reventa AI (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={formData.omnichannel_ai_margin_percent}
                  onChange={e => setFormData({ ...formData, omnichannel_ai_margin_percent: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-bold text-emerald-600 focus:ring-2 focus:ring-purple-500"
                />
                <Percent className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Zernio Master Provider Box */}
        <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-500" /> Zernio API (Canales, Bandeja & Webhooks)
              </h2>
              <p className="text-xs text-gray-500">
                Credenciales maestras centralizadas para autenticar OAuth de WhatsApp, Instagram, Facebook y Telegram.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold text-xs border border-blue-200 dark:border-blue-800 flex items-center gap-1.5"
            >
              <Radio className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} /> Probar Zernio
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Zernio Master API Key (Bearer)
              </label>
              <input
                type="password"
                value={formData.zernio_api_key}
                onChange={e => setFormData({ ...formData, zernio_api_key: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Webhook HMAC Secret
              </label>
              <input
                type="text"
                value={formData.zernio_webhook_secret}
                onChange={e => setFormData({ ...formData, zernio_webhook_secret: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Precio Canal Adicional (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.omnichannel_extra_channel_usd}
                onChange={e => setFormData({ ...formData, omnichannel_extra_channel_usd: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                URL de Webhook Central DoorDrop
              </label>
              <input
                type="text"
                disabled
                value="https://doordrop.lat/api/webhooks/zernio"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-sm font-mono text-cyan-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Todos los Parámetros'}
            </button>
          </div>
        </div>
      </form>

      {/* Clients & Subscribers Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Clientes con Planes Omnicanal</h2>
        {clients.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No hay clientes con suscripciones omnicanal registradas aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 dark:border-gray-800 text-gray-400 uppercase font-semibold">
                <tr>
                  <th className="pb-3">Cliente / Tienda</th>
                  <th className="pb-3">Plan</th>
                  <th className="pb-3">Canales Activos</th>
                  <th className="pb-3">Conversaciones</th>
                  <th className="pb-3">Precio Mensual</th>
                  <th className="pb-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {clients.map(c => (
                  <tr key={c.id}>
                    <td className="py-3">
                      <div className="font-bold text-gray-900 dark:text-white">{c.name || c.email}</div>
                      <div className="text-gray-400 text-[11px]">{c.email}</div>
                    </td>
                    <td className="py-3 font-semibold uppercase">{c.plan_code}</td>
                    <td className="py-3">{c.active_channels_count} / {c.channels_limit}</td>
                    <td className="py-3">{c.total_conversations}</td>
                    <td className="py-3 font-bold text-emerald-600">€{c.monthly_price}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
