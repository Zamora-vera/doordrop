import React, { useState, useEffect } from 'react';
import { Mail, ArrowLeft, Send, CheckCircle2, AlertTriangle, RefreshCw, Eye, Code, Layers, Sparkles, Copy, Check, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';

const CATEGORIES = [
  { id: 'all', label: 'Todas las Categorías', icon: Layers },
  { id: 'auth', label: 'Autenticación & Clientes', icon: Sparkles },
  { id: 'shipments', label: 'Envíos & Logística', icon: Mail },
  { id: 'billing', label: 'Billetera & Facturación', icon: Mail },
  { id: 'omnichannel', label: 'Omnicanal & Soporte', icon: Mail },
];

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [translationsList, setTranslationsList] = useState<any[]>([]);
  const [activeLang, setActiveLang] = useState('es');
  
  // Edit Form state
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [preheader, setPreheader] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test send state
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Preview Mode
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminEmailTemplates();
      if (res && res.success) {
        setTemplates(res.templates || []);
        if (res.templates && res.templates.length > 0) {
          const firstId = selectedTemplate?.id || res.templates[0].id;
          loadTemplateDetail(firstId);
        }
      }
    } catch (err) {
      console.error('Error fetching email templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetail = async (id: string) => {
    try {
      const res = await api.getAdminEmailTemplate(id);
      if (res && res.success && res.template) {
        setSelectedTemplate(res.template);
        const transList = res.translations || [];
        setTranslationsList(transList);
        
        // Find matching translation for current activeLang
        const curTrans = transList.find((t: any) => t.language === activeLang) || transList[0];
        if (curTrans) {
          setActiveLang(curTrans.language);
          setSubject(curTrans.subject || '');
          setPreheader(curTrans.preheader || '');
          setBodyHtml(curTrans.body_html || '');
          setBodyText(curTrans.body_text || '');
        } else {
          setSubject('');
          setPreheader('');
          setBodyHtml('');
          setBodyText('');
        }
        setTestResult(null);
      }
    } catch (err) {
      console.error('Error loading template detail:', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // When active language or translations list change, sync form fields
  useEffect(() => {
    if (translationsList.length > 0) {
      const trans = translationsList.find((t: any) => t.language === activeLang);
      if (trans) {
        setSubject(trans.subject || '');
        setPreheader(trans.preheader || '');
        setBodyHtml(trans.body_html || '');
        setBodyText(trans.body_text || '');
      } else {
        setSubject('');
        setPreheader('');
        setBodyHtml('');
        setBodyText('');
      }
      setTestResult(null);
    }
  }, [activeLang, translationsList]);

  const handleSaveTranslation = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await api.updateAdminEmailTemplate(selectedTemplate.id, {
        language: activeLang,
        subject,
        preheader,
        body_html: bodyHtml,
        body_text: bodyText,
        is_active: true
      });

      if (res && res.success) {
        setSaveSuccess(true);
        // Refresh detail
        await loadTemplateDetail(selectedTemplate.id);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('Error al guardar la plantilla: ' + (res.error || res.message || 'Desconocido'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    if (!testEmail) {
      alert('Ingresa el correo de destino para la prueba.');
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await api.sendAdminTemplateTest(selectedTemplate.id, {
        language: activeLang,
        toEmail: testEmail,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error al enviar email de prueba'
      });
    } finally {
      setSendingTest(false);
    }
  };

  const copyVariable = (varName: string) => {
    navigator.clipboard.writeText(`{{${varName}}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const filteredTemplates = templates.filter((tpl) => {
    if (selectedCategory === 'all') return true;
    return (tpl.category || '').toLowerCase() === selectedCategory.toLowerCase();
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Link
              to="/admin/settings/smtp"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 dark:bg-dark-800 hover:bg-slate-300 dark:hover:bg-dark-700 text-slate-700 dark:text-slate-300 text-xs font-black uppercase tracking-wider transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a SMTP
            </Link>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-wider">
              <Mail className="w-3.5 h-3.5" /> Plantillas de Notificación
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Plantillas de Correo Multilingüe</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            Gestiona los correos enviados automáticamente por el sistema según el objetivo comercial o transaccional. Compatible con variables dinámicas e idiomas Español, Italiano, Inglés, Alemán y Francés.
          </p>
        </div>
        <button
          onClick={fetchTemplates}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors shadow-sm disabled:opacity-60 self-start lg:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Filtros por Categoría */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              selectedCategory === cat.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-dark-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-blue-400'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Layout: Master - Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Plantillas */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
            Plantillas Disponibles ({filteredTemplates.length})
          </h3>
          {filteredTemplates.map((tpl) => {
            const isSelected = selectedTemplate?.id === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => loadTemplateDetail(tpl.id)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50/80 dark:bg-blue-900/30 border-blue-500 shadow-sm'
                    : 'bg-white dark:bg-dark-800 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">
                    {tpl.name}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-slate-400">
                    {tpl.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                  {tpl.description || 'Sin descripción'}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['es', 'it', 'en', 'de', 'fr'].map((lang) => {
                    const hasLang = (tpl.languages || []).includes(lang);
                    return (
                      <span
                        key={lang}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          hasLang
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold'
                            : 'bg-slate-100 dark:bg-dark-900 text-slate-400 opacity-60'
                        }`}
                      >
                        {lang.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Columna Derecha: Editor y Previsualización */}
        <div className="lg:col-span-8">
          {selectedTemplate ? (
            <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700/80 p-6 sm:p-8 shadow-sm">
              {/* Header de Plantilla Seleccionada */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-700/60 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      ID: {selectedTemplate.id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-slate-400 font-bold">
                      Categoría: {selectedTemplate.category}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                    {selectedTemplate.name}
                  </h2>
                </div>
                
                {/* Botón Guardar */}
                <button
                  onClick={handleSaveTranslation}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all flex items-center gap-2 self-start sm:self-auto disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Guardando...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" /> ¡Guardado!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Guardar Cambios
                    </>
                  )}
                </button>
              </div>

              {/* Selector de Idiomas */}
              <div className="mb-6">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  Idioma de la Plantilla
                </label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => {
                    const isConfigured = translationsList.some((t: any) => t.language === lang.code);
                    return (
                      <button
                        key={lang.code}
                        onClick={() => setActiveLang(lang.code)}
                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                          activeLang === lang.code
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow'
                            : 'bg-slate-50 dark:bg-dark-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.label} ({lang.code.toUpperCase()})</span>
                        {isConfigured && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Variables Disponibles */}
              {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 mb-6">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                    Variables Disponibles (Haz clic para copiar)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.variables.map((v: string) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => copyVariable(v)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-blue-600 dark:text-blue-400 hover:border-blue-400 transition-colors flex items-center gap-1"
                      >
                        <code>{`{{${v}}}`}</code>
                        {copiedVar === v ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulario de Edición: Asunto */}
              <div className="mb-4">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  Asunto del Correo ({activeLang.toUpperCase()})
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej: Bienvenido a DoorDrop - Tu cuenta está activa"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Preheader */}
              <div className="mb-4">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  Preheader / Vista previa en bandeja de entrada
                </label>
                <input
                  type="text"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Texto breve que aparece junto al asunto..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Tabs: Vista Previa vs Código HTML */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Cuerpo del Mensaje (HTML & Responsive)
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-dark-900 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('preview')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        previewMode === 'preview'
                          ? 'bg-white dark:bg-dark-800 text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" /> Vista Previa
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('code')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        previewMode === 'code'
                          ? 'bg-white dark:bg-dark-800 text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" /> Código HTML
                    </button>
                  </div>
                </div>

                {previewMode === 'preview' ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white">
                    <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                      <span>Simulación de Cliente de Correo</span>
                      <span className="font-mono text-[11px] text-slate-400">info@doordrop.lat</span>
                    </div>
                    <div
                      className="p-6 max-h-[450px] overflow-y-auto text-slate-900"
                      dangerouslySetInnerHTML={{
                        __html: bodyHtml
                          ? bodyHtml
                              .replace(/{{customerName}}/g, 'Juan Pérez')
                              .replace(/{{loginUrl}}/g, 'https://doordrop.lat/login')
                              .replace(/{{senderName}}/g, 'DoorDrop')
                              .replace(/{{trackingCode}}/g, 'DD-2026-IT8892')
                              .replace(/{{carrierName}}/g, 'Poste Italiane')
                              .replace(/{{destination}}/g, 'Milano, Italia')
                              .replace(/{{amount}}/g, '50.00 €')
                              .replace(/{{newBalance}}/g, '125.50 €')
                          : '<div class="text-center text-slate-400 py-12">Plantilla vacía para este idioma</div>'
                      }}
                    />
                  </div>
                ) : (
                  <textarea
                    rows={12}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    className="w-full p-4 rounded-2xl bg-slate-900 text-blue-300 font-mono text-xs border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Escribe aquí el contenido HTML de la plantilla..."
                  />
                )}
              </div>

              {/* Texto Plano Alternativo */}
              <div className="mb-8">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  Versión Texto Plano (Clientes sin soporte HTML)
                </label>
                <textarea
                  rows={3}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-sans text-xs outline-none"
                  placeholder="Versión simplificada en texto plano..."
                />
              </div>

              {/* Enviar Test de esta plantilla */}
              <div className="pt-6 border-t border-slate-100 dark:border-slate-700/60">
                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-600" /> Probar plantilla con datos reales
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Envía esta plantilla ({activeLang.toUpperCase()}) con variables simuladas al correo indicado usando el relay de DoorDrop.
                </p>
                <form onSubmit={handleSendTest} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold text-xs outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sendingTest}
                    className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-black text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {sendingTest ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Enviar a {testEmail}
                      </>
                    )}
                  </button>
                </form>

                {testResult && (
                  <div
                    className={`mt-4 p-4 rounded-xl border text-xs font-mono transition-all ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{testResult.message || JSON.stringify(testResult)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white dark:bg-dark-800 rounded-3xl border border-slate-200 dark:border-slate-700">
              Selecciona una plantilla para ver y editar su contenido.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
