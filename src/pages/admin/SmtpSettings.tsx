import React, { useState, useEffect } from 'react';
import { Mail, Server, Shield, Send, CheckCircle2, AlertTriangle, RefreshCw, Key, Globe, ArrowRight, Activity } from 'lucide-react';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';

export default function SmtpSettings() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testEmail, setTestEmail] = useState('');
  const [customHost, setCustomHost] = useState('');
  const [customPort, setCustomPort] = useState(465);
  const [customSecure, setCustomSecure] = useState(true);
  const [customUser, setCustomUser] = useState('');
  const [customPass, setCustomPass] = useState('');
  const [useCustomCreds, setUseCustomCreds] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminSmtpConfig();
      if (res && res.success) {
        setConfig(res.config);
        setCustomHost(res.config.host || '');
        setCustomPort(res.config.port || 465);
        setCustomSecure(res.config.secure !== false);
        setCustomUser(res.config.user || '');
      }
    } catch (err: any) {
      console.error('Error fetching SMTP config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) {
      alert('Por favor ingresa un correo destinatario para la prueba.');
      return;
    }
    setTesting(true);
    setTestResult(null);

    const payload: any = {
      toEmail: testEmail
    };

    if (useCustomCreds) {
      payload.host = customHost;
      payload.port = Number(customPort);
      payload.secure = customSecure;
      payload.user = customUser;
      if (customPass) {
        payload.pass = customPass;
      }
    }

    try {
      const res = await api.testAdminSmtp(payload);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error al conectar con el servidor SMTP'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-[0.2em]">
              <Server className="w-3.5 h-3.5" /> Servidor de Correo
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              TLS Activo
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Configuración SMTP</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            Gestiona la conectividad del relay de correo transaccional (Amazon SES / Truobox) y realiza pruebas de entrega en tiempo real.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/admin/settings/smtp/template"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all"
          >
            <Mail className="w-4 h-4" /> Plantillas de Correo
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* Grid: Estado Actual & Credenciales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Servidor Relay */}
        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                <Server className="w-6 h-6" />
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                Conectado
              </span>
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Servidor Relay</h3>
            <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
              {config?.host || 'smtp.truobox.com'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Puerto {config?.port || 465} &bull; {config?.secure ? 'SSL / TLS Implícito' : 'STARTTLS'}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500">
            Respaldo: Amazon SES con SNI validado
          </div>
        </div>

        {/* Card 2: Remitente Oficial */}
        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                <Shield className="w-6 h-6" />
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                Autorizado
              </span>
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Remitente Oficial</h3>
            <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
              {config?.senderEmail || 'info@doordrop.lat'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Nombre: <span className="font-bold text-slate-700 dark:text-slate-300">{config?.senderName || 'DoorDrop'}</span>
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500">
            Envelope & From sincronizados estrictamente
          </div>
        </div>

        {/* Card 3: Seguridad & Autenticación */}
        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                <Key className="w-6 h-6" />
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400">
                Cifrado
              </span>
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Usuario Autenticado</h3>
            <p className="text-lg font-black text-slate-900 dark:text-white font-mono truncate">
              {config?.user || 'info@doordrop.lat'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Contraseña protegida en entorno (.env)
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500">
            Autenticación LOGIN / PLAIN TLS
          </div>
        </div>
      </div>

      {/* Formulario de Test de Envío Real */}
      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700/80 p-6 sm:p-8 shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" /> Prueba de Conexión y Envío Real
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Envía un mensaje de diagnóstico inmediato a través del relay SMTP configurado para verificar autenticación y latencia.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUseCustomCreds(!useCustomCreds)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline self-start sm:self-auto"
          >
            {useCustomCreds ? '← Usar credenciales del sistema' : '⚙️ Probar credenciales temporales'}
          </button>
        </div>

        {useCustomCreds && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 mb-6">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-3">
              Modo Diagnóstico Avanzado (No modifica las variables de entorno de producción)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Host</label>
                <input
                  value={customHost}
                  onChange={(e) => setCustomHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                  placeholder="smtp.truobox.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Puerto</label>
                <input
                  type="number"
                  value={customPort}
                  onChange={(e) => setCustomPort(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                  placeholder="465"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Usuario</label>
                <input
                  value={customUser}
                  onChange={(e) => setCustomUser(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                  placeholder="info@doordrop.lat"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Contraseña (temporal)</label>
                <input
                  type="password"
                  value={customPass}
                  onChange={(e) => setCustomPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleTestConnection} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
              Destinatario de prueba
            </label>
            <input
              type="email"
              required
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={testing}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {testing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Conectando al Relay...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Enviar Test SMTP
              </>
            )}
          </button>
        </form>

        {/* Resultado del Test */}
        {testResult && (
          <div
            className={`mt-6 p-5 rounded-2xl border transition-all ${
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {testResult.success ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 overflow-hidden">
                <h4 className="font-black text-sm mb-1">
                  {testResult.success ? 'Conexión SMTP Exitosa (250 OK)' : 'Error de Envío SMTP'}
                </h4>
                <p className="text-xs leading-relaxed font-mono break-all opacity-90">
                  {testResult.message || JSON.stringify(testResult)}
                </p>
                {testResult.messageId && (
                  <p className="text-xs font-mono mt-2 text-emerald-700 dark:text-emerald-400">
                    Message-ID: {testResult.messageId}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Guía Rápida & Parámetros */}
      <div className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8">
        <h3 className="text-lg font-black mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" /> Arquitectura del Relay DoorDrop
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <p className="font-bold text-white mb-1">1. Enrutamiento TLS</p>
            <p className="leading-relaxed text-slate-400">
              Conexión directa en puerto 465 con verificación de SNI para <code className="text-blue-300">smtp.truobox.com</code> y certificados validados.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <p className="font-bold text-white mb-1">2. Identidad AWS SES</p>
            <p className="leading-relaxed text-slate-400">
              El remitente técnico y de cabecera <code className="text-blue-300">info@doordrop.lat</code> coincide con la identidad autorizada en Amazon SES.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <p className="font-bold text-white mb-1">3. Notificaciones Multi-Objetivo</p>
            <p className="leading-relaxed text-slate-400">
              Accede a la pestaña de Plantillas para personalizar asuntos y cuerpos en ES, IT, EN, DE y FR con variables dinámicas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
