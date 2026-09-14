import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  Crown,
  ExternalLink,
  Info,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  WalletCards,
} from 'lucide-react';
import { api } from '../lib/api';

const MAX_PLAN_DISCOUNT_PERCENT = 23;
const SHIPPING_PROVIDER_CODES = new Set([
  'parcelabc',
  'genei',
  'paccofacile',
  'spedirepro',
  'spediamopro',
  'easypost',
  'logihub_intl',
]);

const providerObservation: Record<string, string> = {
  parcelabc: 'Devuelve tarifas en las rutas probadas: ES→DE, IT→IT, IT→FR y DO→US. Es la conexión más estable observada.',
  logihub_intl: 'Suspendido por decisión administrativa. Permanece inactivo y no participa en cotizaciones ni compras.',
  paccofacile: 'Devuelve tarifas en rutas italianas. En ES→DE y DO→US respondió HTTP 400, por lo que la cobertura depende del país y la localidad.',
  spedirepro: 'Devuelve tarifas en IT→IT. En ES→DE y DO→US respondió HTTP 200 sin ofertas; conectado no significa cobertura universal.',
  spediamopro: 'Devuelve tarifas en IT→IT. En ES→DE y DO→US respondió HTTP 200 sin ofertas; revisar cobertura y saldo antes de comprar.',
  genei: 'La autenticación y el saldo responden, pero las rutas auditadas devolvieron 0 ofertas. Debe revisarse la modalidad de tarifas y cobertura.',
  easypost: 'La API responde, pero la cotización auditada devolvió HTTP 201 con 0 rates. La bandera de conexión requiere una prueba de cuentas/carriers.',
};

const routeChecks = [
  { route: 'ES 28001 Madrid → DE 10115 Berlín', result: '10 tarifas', detail: 'Auditoría histórica; couriers observados: SEUR y UPS.' },
  { route: 'IT 00118 Roma → IT 20121 Milán', result: '24 tarifas', detail: 'SpedirePro, SpediamoPro, Paccofacile y ParcelABC devolvieron ofertas.' },
  { route: 'IT 00118 Roma → FR 75001 París', result: '20 tarifas', detail: 'Paccofacile y ParcelABC devolvieron ofertas.' },
  { route: 'DO 10101 Santo Domingo → US 10001 Nueva York', result: '6 tarifas históricas', detail: 'El conector internacional y ParcelABC devolvieron ofertas en la auditoría anterior; el conector internacional está suspendido actualmente.' },
];

const statusText = (value: any) => String(value || '').toLowerCase() === 'ok' ? 'OK' : String(value || 'no probado').replace(/_/g, ' ');

const AdminDocs = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [providerResponse, planResponse] = await Promise.all([
        api.getAdminProviders(),
        api.getAdminPlans(),
      ]);
      setProviders(providerResponse.providers || []);
      setPlans(planResponse.plans || []);
      setRefreshedAt(new Date().toLocaleString());
    } catch {
      setError('No se pudieron cargar los estados actuales. La documentación fija sigue disponible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const shippingProviders = useMemo(
    () => providers.filter((provider) => SHIPPING_PROVIDER_CODES.has(String(provider.code || '').toLowerCase())),
    [providers]
  );
  const activeShipping = shippingProviders.filter((provider) => Boolean(provider.is_active)).length;
  const connectedShipping = shippingProviders.filter((provider) => Boolean(provider.is_connected)).length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1500px] mx-auto text-slate-900 dark:text-slate-100">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            <BookOpen className="w-3.5 h-3.5" /> Manual interno DoorDrop
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">Documentación operativa</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            Cómo se cotiza, cómo se compra una etiqueta, cómo se muestran los couriers y cómo se protege la ganancia de DoorDrop.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar estado
          </button>
          <a href="/admin/providers" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-black hover:bg-slate-50 dark:hover:bg-slate-800">
            Proveedores <ExternalLink className="w-4 h-4" />
          </a>
          <a href="/admin/plans" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-black hover:bg-slate-50 dark:hover:bg-slate-800">
            Planes <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {error && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/30 p-5">
          <p className="text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Proveedores de envío</p>
          <p className="text-3xl font-black mt-2">{shippingProviders.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{activeShipping} activos · {connectedShipping} conectados según el panel</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30 p-5">
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Margen operativo</p>
          <p className="text-3xl font-black mt-2">30%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Aplicado al coste devuelto por cada proveedor de envío</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-950/30 p-5">
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">Tope de descuento</p>
          <p className="text-3xl font-black mt-2">{MAX_PLAN_DISCOUNT_PERCENT}%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Límite de seguridad para no vender por debajo del coste</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-100 dark:bg-blue-950/50 p-3 text-blue-700 dark:text-blue-300"><Activity className="w-5 h-5" /></div>
            <div>
              <h2 className="text-xl font-black">Flujo completo de un envío</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">La cotización y la compra son dos acciones separadas.</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {[
              ['1', 'Cotizar', 'En /panel/tariffa/ se envían país, código postal, ciudad opcional, dimensiones, peso y cantidad a /api/shipments/quote.'],
              ['2', 'Comparar', 'DoorDrop consulta en paralelo a los proveedores activos de envío, normaliza la respuesta y muestra solo carrierName, servicio, peso, plazo y precio final.'],
              ['3', 'Elegir courier', 'El cliente elige la marca pública del courier: UPS, DHL, FedEx, SEUR, GLS, BRT, InPost, etc. Nunca debe elegir un proveedor interno.'],
              ['4', 'Comprar', 'En /panel/quote se confirma el quoteId. POST /api/shipments valida la sesión, cobra el wallet y solicita la etiqueta oficial.'],
              ['5', 'Entregar y rastrear', 'Se descarga la etiqueta oficial, se guarda trackingCode y se consulta /tracking/{code}.'],
            ].map(([number, title, description]) => (
              <div key={number} className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{number}</div>
                <div><p className="font-black">{title}</p><p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 p-3 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-5 h-5" /></div>
            <div>
              <h2 className="text-xl font-black">Regla de ganancia y descuentos</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">La protección está aplicada en precios y en el guardado de planes.</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-white/80 dark:border-emerald-900/70 dark:bg-slate-900/70 p-4 font-mono text-sm leading-7">
            <p>Coste proveedor = <span className="font-black text-blue-700 dark:text-blue-300">C</span></p>
            <p>Precio de lista = <span className="font-black text-blue-700 dark:text-blue-300">C × 1.30</span></p>
            <p>Precio con plan = <span className="font-black text-blue-700 dark:text-blue-300">Precio de lista × (1 − descuento)</span></p>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            <p><strong>Por qué 23%:</strong> con un margen del 30%, el descuento matemático máximo sin perder el coste es 30 ÷ 130 = 23.0769%. Se fija en 23% para dejar un pequeño margen después del redondeo a dos decimales.</p>
            <p><strong>Ejemplo:</strong> coste 100 → lista 130 → con 23% de descuento: 100.10. DoorDrop no vende por debajo de 100.</p>
            <p className="flex gap-2 items-start text-amber-800 dark:text-amber-200"><AlertTriangle className="w-4 h-4 mt-1 shrink-0" />Este cálculo protege frente al coste del courier. Comisiones de pasarela, impuestos, reembolsos o contracargos deben reservarse aparte.</p>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-blue-600" /><h2 className="text-xl font-black">Proveedores de envío</h2></div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Activo, conectado y tarifas son indicadores distintos.</p>
          </div>
          <p className="text-xs text-slate-400">{refreshedAt ? `Estado leído: ${refreshedAt}` : 'Cargando estado...'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Proveedor</th><th className="px-3 py-3">Activo</th><th className="px-3 py-3">Conectado</th><th className="px-3 py-3">Margen</th><th className="px-3 py-3">Tarifas observadas</th><th className="px-3 py-3">Último estado</th></tr></thead>
            <tbody>
              {shippingProviders.map((provider) => {
                const code = String(provider.code || '').toLowerCase();
                const isSuspendedInternational = code === 'logihub_intl';
                return <tr key={code} className="border-b border-slate-100 dark:border-slate-800/70 align-top"><td className="px-3 py-4"><p className="font-black">{isSuspendedInternational ? 'Conector internacional suspendido' : (provider.name || code)}</p><p className="text-[11px] font-mono text-slate-400 mt-1">{isSuspendedInternational ? 'suspendido' : code}</p></td><td className="px-3 py-4">{provider.is_active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />Sí</span> : <span className="text-xs font-bold text-slate-400">No</span>}</td><td className="px-3 py-4">{provider.is_connected ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700"><CheckCircle2 className="w-3.5 h-3.5" />Sí</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700"><AlertTriangle className="w-3.5 h-3.5" />No</span>}</td><td className="px-3 py-4 font-black">{Number(provider.margin_percent ?? provider.margin ?? 0).toFixed(0)}%</td><td className="px-3 py-4 min-w-[360px] text-xs leading-5 text-slate-600 dark:text-slate-300">{providerObservation[code] || 'Consultar una ruta real desde Cotizar; la cobertura depende del país y el código postal.'}</td><td className="px-3 py-4 min-w-[220px]"><p className="text-xs font-black uppercase text-slate-600 dark:text-slate-300">{isSuspendedInternational ? 'suspendido' : statusText(provider.last_connection_status)}</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{provider.last_connection_message || 'Sin mensaje'}</p>{provider.balance?.label && <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-2">Saldo: {provider.balance.label}</p>}</td></tr>;
              })}
            </tbody>
          </table>
          {!loading && shippingProviders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay proveedores de envío cargados.</p>}
          {shippingProviders.some((provider) => String(provider.code || '').toLowerCase() === 'logihub_intl') && <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-black">Registro de suspensión</p><p className="mt-1 leading-6">El conector internacional fue suspendido por decisión administrativa y debe permanecer inactivo hasta nueva autorización. No se utiliza para cotizar ni para comprar envíos; sus identificadores técnicos se conservan únicamente para históricos y seguimiento.</p></div></div>}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2"><Truck className="w-5 h-5 text-violet-600" /><h2 className="text-xl font-black">Cómo se interpreta un proveedor</h2></div>
          <div className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300 mt-5">
            <p><strong>Activo:</strong> `is_active = 1`; el motor puede intentar consultarlo.</p>
            <p><strong>Conectado:</strong> `is_connected = 1`; la última validación o configuración del panel no reportó fallo. Puede estar desactualizado.</p>
            <p><strong>Devuelve tarifas:</strong> la API respondió con ofertas válidas para esa ruta. Es la evidencia que decide si aparece en Cotizar.</p>
            <p><strong>HTTP 200 sin ofertas:</strong> la API respondió, pero no encontró servicio para los datos enviados. No equivale necesariamente a proveedor caído.</p>
            <p><strong>HTTP 400:</strong> la solicitud fue rechazada; revisar cobertura, localidad, país, formato o credenciales del proveedor.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2"><Code2 className="w-5 h-5 text-cyan-600" /><h2 className="text-xl font-black">Rutas y datos necesarios</h2></div>
          <div className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300 mt-5">
            <p>El cliente debe enviar códigos postales reales, país ISO2, peso y dimensiones en centímetros.</p>
            <p>DoorDrop infiere ciudades conocidas desde el código postal, pero se recomienda enviar `originCity` y `destCity`, especialmente para Italia y República Dominicana.</p>
            <p>El país/moneda del visitante puede orientar la vista, pero la tarifa se calcula con origen, destino, código postal y paquete; no con una IP inventada.</p>
            <p>Los proveedores se consultan en paralelo. Las respuestas se normalizan a precio, moneda, courier, servicio y plazo.</p>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 mb-8">
        <div className="flex items-center gap-2 mb-5"><ArrowRight className="w-5 h-5 text-blue-600" /><h2 className="text-xl font-black">Auditoría de rutas reales</h2><span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-black text-slate-500">02/09/2026</span></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routeChecks.map((check) => <div key={check.route} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><p className="font-black">{check.route}</p><p className="text-lg font-black text-emerald-600 mt-2">{check.result}</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{check.detail}</p></div>)}
        </div>
        <p className="flex gap-2 items-start text-xs leading-5 text-slate-500 dark:text-slate-400 mt-5"><Info className="w-4 h-4 shrink-0 mt-0.5" />Esta matriz es una referencia de diagnóstico con rutas concretas. Una ruta sin ofertas no desactiva ni invalida universalmente al proveedor.</p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2"><WalletCards className="w-5 h-5 text-emerald-600" /><h2 className="text-xl font-black">Planes y descuentos</h2></div>
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400 mt-1">Los descuentos se aplican después de calcular el precio de lista y nunca deben superar {MAX_PLAN_DISCOUNT_PERCENT}%.</p>
          <div className="mt-5 space-y-3">
            {plans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3"><div><p className="font-black">{plan.name || plan.code}</p><p className="text-xs text-slate-500">{Number(plan.price || 0).toFixed(2)} {plan.currency || 'EUR'} / {plan.billingInterval === 'year' ? 'año' : 'mes'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${Number(plan.discount || 0) <= MAX_PLAN_DISCOUNT_PERCENT ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{Number(plan.discount || 0).toFixed(0)}% descuento</span></div>)}
          </div>
          <a href="/admin/plans" className="inline-flex items-center gap-2 mt-5 text-sm font-black text-blue-600 hover:text-blue-700">Abrir planes y descuentos <ArrowRight className="w-4 h-4" /></a>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2"><Percent className="w-5 h-5 text-amber-600" /><h2 className="text-xl font-black">Checklist antes de publicar</h2></div>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-1 shrink-0 text-emerald-600" />Todos los proveedores de envío deben conservar margen de 30%.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-1 shrink-0 text-emerald-600" />Ningún plan debe superar el descuento máximo de 23%.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-1 shrink-0 text-emerald-600" />Probar rutas reales por país y código postal; no basta con HTTP 200.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-1 shrink-0 text-emerald-600" />La interfaz cliente muestra courier y servicio, no proveedor interno ni coste.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-1 shrink-0 text-emerald-600" />Re-cotizar antes de comprar si la oferta tiene más de unos minutos.</li>
          </ul>
        </section>
      </div>

      
      {/* =====================================================================
          INTEGRACIÓN EXTRA: MATTERHORN WHOLESALE B2B & MARKETPLACE
         ===================================================================== */}
      <section className="rounded-3xl border border-blue-500/30 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white shadow-xl p-6 sm:p-8 mb-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-300 text-[10px] font-black uppercase tracking-wider border border-blue-400/30">
                  Módulo Integrado Extra
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-400/30">
                  Activo & Automatizado
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tight mt-1">
                Integración Matterhorn Wholesale B2B (Moda & Lingerie)
              </h2>
            </div>
          </div>
          <a
            href="https://app.swaggerhub.com/apis-docs/MatterhornModa/MatterhornWholesaleB2BApi/1.0.4.1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold border border-white/20 transition-all self-start md:self-auto"
          >
            <span>SwaggerHub API v1.0.4.1</span>
            <ExternalLink className="w-4 h-4 text-blue-300" />
          </a>
        </div>

        {/* 4 Key Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tienda Asignada</span>
            <p className="text-base font-black text-white truncate">Zubay IT (Roma, IT)</p>
            <p className="text-xs text-blue-300 font-mono">moda@doordrop.lat</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Regla de Margen B2B</span>
            <p className="text-base font-black text-emerald-400">+30% Exacto</p>
            <p className="text-xs text-slate-300">PVP = Coste Mayorista × 1.30</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Logística y Envíos</span>
            <p className="text-base font-black text-amber-300">Directo Proveedor API</p>
            <p className="text-xs text-slate-300">GLOBAL (7,90 €) / DPD (9,90 €)</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cron Automatizado</span>
            <p className="text-base font-black text-cyan-300">10 productos / hora</p>
            <p className="text-xs text-slate-300">240 al día en rotación continua</p>
          </div>
        </div>

        {/* Technical Architecture Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              Especificación de Conexión & Credenciales
            </h3>
            <ul className="space-y-2 text-xs leading-relaxed">
              <li><strong className="text-white">API Base:</strong> <code className="bg-black/30 px-2 py-0.5 rounded text-cyan-300">https://matterhorn-wholesale.com/B2BAPI</code></li>
              <li><strong className="text-white">Autenticación:</strong> Header HTTP <code className="bg-black/30 px-2 py-0.5 rounded text-amber-300">Authorization: 8c6d9d74ee</code></li>
              <li><strong className="text-white">Consultas de Catálogo:</strong> <code className="bg-black/30 px-2 py-0.5 rounded">/ITEMS/?limit=10&page=N</code></li>
              <li><strong className="text-white">Tarifas de Entrega:</strong> <code className="bg-black/30 px-2 py-0.5 rounded">/DICTIONARIES/DELIVERY/IT</code></li>
              <li><strong className="text-white">Generación de Pedidos Dropshipping:</strong> <code className="bg-black/30 px-2 py-0.5 rounded">PUT /ACCOUNT/ORDERS/</code> con <code className="text-emerald-300">variant_uid</code> y dirección del destinatario.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Reglas de Negocio & Localización
            </h3>
            <ul className="space-y-2 text-xs leading-relaxed">
              <li><strong className="text-white">Idioma y Títulos:</strong> Traducción automática al <strong>Italiano</strong> (Slip da Donna, Reggiseno Imbottito, Push-up, Abito, ecc.).</li>
              <li><strong className="text-white">Peso Normalizado:</strong> Rango textil de <strong>200 - 350 gramos</strong> por prenda (evitando recargos de flete erróneos).</li>
              <li><strong className="text-white">Separación de Red:</strong> No muestra transportistas locales de DoorDrop para artículos Matterhorn; cotiza directamente las tarifas oficiales del almacén mayorista europeo.</li>
              <li><strong className="text-white">Script Cron en Servidor:</strong> <code className="bg-black/30 px-2 py-0.5 rounded text-slate-200">/www/wwwroot/doordrop.lat/run_matterhorn_cron.sh</code> ejecutado cada hora en <code className="text-cyan-300">0 * * * *</code>.</li>
            </ul>
          </div>
        </div>
      </section>

      
      {/* SECCIÓN DOORDROP OMNICANAL + AI EMPLOYEE */}
      <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 text-white shadow-xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-indigo-500/20 pb-6 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Nuevo Módulo Omnicanal & AI
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              DoorDrop Omnicanal + AI Employee (WhatsApp & Social)
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-3xl">
              Arquitectura unificada de atención al cliente multi-cuenta, automatización Comment-to-DM, auto-publicación y empleado virtual 24/7 con integración directa a órdenes y envíos DoorDrop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Webhook Activo & Conectado
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-2xl bg-black/40 border border-slate-700/60">
            <h3 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" /> Planes Comerciales
            </h3>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li><strong className="text-white">WhatsApp (€9.99/mes):</strong> 1 canal WhatsApp, bandeja de conversaciones, contactos, empleado AI, FAQs y soporte.</li>
              <li><strong className="text-white">Duo (€18/mes):</strong> WhatsApp + 1 canal a elección (Instagram, Facebook o Telegram) en bandeja combinada.</li>
              <li><strong className="text-white">Omni 3 (€24.99/mes):</strong> WhatsApp + Instagram + Facebook con IA sincronizada multicanal.</li>
              <li><strong className="text-white">Canales Adicionales:</strong> Tarifa base de <strong>USD 8 / canal / mes</strong> (configurable en Super Admin).</li>
              <li><strong className="text-white">Mensajería:</strong> Comercializado con <em>Mensajes Ilimitados</em> incluidos.</li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-black/40 border border-slate-700/60">
            <h3 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> Add-ons y Automatización
            </h3>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li><strong className="text-white">Comment-to-DM (€2/mes):</strong> Detecta palabras clave en publicaciones y dispara respuesta pública o DM directo para cerrar ventas.</li>
              <li><strong className="text-white">Auto-Publishing (€2/mes):</strong> Programador multicanal con calendario para publicaciones simultáneas.</li>
              <li><strong className="text-white">Perfiles Aislados:</strong> Cada usuario cuenta con un Profile ID independiente en el backend para evitar cruce de cuentas.</li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-black/40 border border-slate-700/60">
            <h3 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" /> Herramientas DoorDrop del AI
            </h3>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li><strong className="text-white">lookup_order:</strong> Búsqueda en tiempo real de pedidos por ID, número o email de comprador.</li>
              <li><strong className="text-white">lookup_tracking:</strong> Verificación del estado de guías de envío y transportadoras.</li>
              <li><strong className="text-white">quote_shipping:</strong> Cotización instantánea de fletes DoorDrop (Italia y Europa).</li>
              <li><strong className="text-white">search_products:</strong> Consulta del catálogo y disponibilidad de artículos de la tienda.</li>
              <li><strong className="text-white">Traspaso Humano:</strong> Botón de control para pausar la IA y ceder el control al agente humano.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-white">Webhook Central DoorDrop:</span>
            <code className="ml-2 font-mono text-cyan-300">https://doordrop.lat/api/webhooks/zernio</code>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Verificación de firma HMAC-SHA256 y deduplicación por UUID de evento.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/panel/omnichannel"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow"
            >
              Panel Cliente
            </a>
            <a
              href="/admin/omnichannel"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition border border-slate-600"
            >
              Configuración Super Admin
            </a>
          </div>
        </div>
      </section>


      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4"><Info className="w-5 h-5 text-cyan-300" /><h2 className="text-xl font-black">Endpoints importantes</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ['/panel/tariffa/', 'Cotizar y comparar tarifas reales'],
            ['/panel/quote', 'Confirmar compra y generar etiqueta'],
            ['/api/shipments/quote', 'API de cotización multi-courier'],
            ['/api/shipments', 'Crear envío con quoteId y cobrar wallet'],
            ['/tracking/{code}', 'Tracking público'],
            ['/admin/providers', 'Estado, margen y conexión de proveedores'],
            ['/admin/plans', 'Planes y descuentos con límite de seguridad'],
            ['/docs', 'OpenAPI pública de DoorDrop'],
          ].map(([path, description]) => <div key={path} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="font-mono text-cyan-300">{path}</p><p className="text-xs text-slate-300 mt-1">{description}</p></div>)}
        </div>
      </section>
    </div>
  );
};

export default AdminDocs;
