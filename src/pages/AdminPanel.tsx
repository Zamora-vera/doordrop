import { AdminOmnichannel } from './AdminOmnichannel';
import { getCountryName, WORLD_COUNTRIES } from '../lib/countries';
import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Users, Package, Settings, LogOut, BarChart3, Truck, Crown, Edit, Save, LifeBuoy, Sparkles, Menu, X, Eye, Lock, Unlock, LogIn, CreditCard, Wallet, ShieldCheck, XCircle, Moon, Sun, MapPin, Clipboard, PlayCircle, RefreshCw, Mail, Send, Activity, Clock, Plug, Store, Link2, CheckCircle2, AlertTriangle, ExternalLink, BookOpen } from 'lucide-react';
import { api, removeAuthToken, getAuthToken, setAuthToken } from '../lib/api';
import { useI18n } from '../lib/i18n';

const normalizeAdminCarrierText = (value: any) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const displayAdminCarrierName = (value: any) => {
  const text = normalizeAdminCarrierText(value);
  if (!text) return 'DoorDrop';
  if (text.includes('ups')) return 'UPS';
  if (text.includes('inpost') || text.includes('in post')) return 'InPost';
  if (text.includes('poste italiane') || (text.includes('poste') && text.includes('ital'))) return 'Poste Italiane';
  if (text.includes('sda')) return 'SDA';
  if (text.includes('brt') || text.includes('bartolini')) return 'BRT';
  if (text.includes('dhl')) return 'DHL';
  if (text.includes('gls')) return 'GLS';
  if (text.includes('fedex')) return 'FedEx';
  if (text.includes('seur')) return 'SEUR';
  if (text.includes('correos express')) return 'Correos Express';
  if (text.includes('correos')) return 'Correos';
  if (['paccofacile','genei','parcelabc','parcel abc','spedirepro','spedire pro','spediamopro','spediamo pro','ship24go','logihub','red logistica'].some((name) => text.includes(name))) return 'DoorDrop';
  return String(value || 'DoorDrop').replace(/\s+/g, ' ').slice(0, 42);
};

import { useCurrency } from '../lib/currency';
import { BrandMark, DEFAULT_BRAND, useBrand } from '../lib/brand';
import { LanguageSelector } from '../components/LanguageSelector';
import { AdminTickets } from '../components/AdminTickets';
import { AdminMarketplace } from '../components/AdminMarketplace';
import { AiCopilotChat } from '../components/AiCopilotChat';
import AdminDocs from './AdminDocs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(WORLD_COUNTRIES.map((c) => [c.code, c.nameEs]));
const MAX_PLAN_DISCOUNT_PERCENT = 23;

const countryLabel = (code: string) => {
  const key = String(code || 'OT').toUpperCase();
  return COUNTRY_NAMES[key] || key;
};

const AdminSidebar = ({ isMobileMenuOpen, toggleMobileMenu, currentUser, isDark, toggleTheme }: any) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const menu = [
    { name: t('dashboard'), path: '/admin', icon: LayoutDashboard },
    { name: t('clients'), path: '/admin/clients', icon: Users },
    { name: t('totalShipments'), path: '/admin/shipments', icon: Package },
    { name: 'Marketplace', path: '/admin/marketplace', icon: Store },
    { name: 'Omnicanal + AI', path: '/admin/omnichannel', icon: Bot },
    { name: t('providers'), path: '/admin/providers', icon: Truck },
    { name: 'Documentación', path: '/admin/docs', icon: BookOpen },
    { name: 'Integraciones', path: '/admin/integraciones', icon: Plug },
    { name: 'Polar', path: '/admin/polar', icon: Sparkles },
    { name: 'PayPal', path: '/admin/paypal', icon: CreditCard },
    { name: 'Planes & Descuentos', path: '/admin/plans', icon: Crown },
    { name: t('bank_admin_nav'), path: '/admin/banks', icon: CreditCard },
    { name: t('reports'), path: '/admin/reports', icon: BarChart3 },
    { name: t('settings'), path: '/admin/settings', icon: Settings },
    { name: t('tickets_support'), path: '/admin/tickets', icon: LifeBuoy },
    { name: t('ai_copilot'), path: '/admin/copilot', icon: Sparkles },
  ];

  return (
    <>
      {isMobileMenuOpen && (
        <div onClick={toggleMobileMenu} className="fixed inset-0 bg-black/50 z-40 md:hidden"></div>
      )}
      <aside className={`fixed md:static inset-y-0 left-0 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 w-64 bg-slate-900 text-white min-h-screen flex flex-col font-sans z-50`}>
        <div className="p-6 flex items-center justify-between md:justify-start gap-2">
          <BrandMark dark iconClassName="w-8 h-8 rounded-lg" textClassName="text-xl text-white" />
          <button onClick={toggleMobileMenu} className="md:hidden text-slate-300 hover:text-white cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>
        {currentUser && (
          <div className="mx-4 mb-4 rounded-xl bg-slate-800/80 border border-slate-700 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">Sesión activa</p>
            <p className="text-sm font-bold text-white truncate">{currentUser.name || 'Super Admin'}</p>
            <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
            <button
              onClick={() => {
                removeAuthToken();
                navigate('/auth/login');
              }}
              className="mt-3 w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
            >
              Cambiar cuenta
            </button>
          </div>
        )}

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {menu.map(item => {
            const active = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== '/admin');
            const handleClick = () => {
              if (window.innerWidth < 768) {
                toggleMobileMenu();
              }
            };
            
            if (item.path === '/admin' && location.pathname !== '/admin') return (
              <Link key={item.path} to={item.path} onClick={handleClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800 hover:text-white`}>
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
            return (
              <Link key={item.path} to={item.path} onClick={handleClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-slate-800 flex flex-col gap-4">
          <div className="px-4 text-black">
            <LanguageSelector />
          </div>
          
          {/* Admin Currency Selector */}
          <div className="px-4 text-slate-300">
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)} 
              className="w-full bg-slate-800 text-white rounded-lg p-2.5 text-xs border border-slate-700 outline-none focus:border-blue-500 cursor-pointer font-bold"
            >
              {availableCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} - {c.code}
                </option>
              ))}
            </select>
          </div>

          <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-3 w-full text-left text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {isDark ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button onClick={() => { removeAuthToken(); navigate('/auth/login'); }} className="flex items-center gap-3 px-4 py-3 w-full text-left text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer">
            <LogOut className="w-5 h-5" />
            {t('logout')}
          </button>
        </div>
      </aside>
    </>
  );
};

const AdminDashboard = () => {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [statsRes, reportsRes] = await Promise.all([api.getAdminStats(), api.getAdminReports()]);
      setStats(statsRes);
      setReports(reportsRes);
    } catch {
      setStats(null);
      setReports(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const chartText = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.22)';
  const dailyRows = Array.isArray(reports?.daily) ? reports.daily : [];
  const countryRows = Array.isArray(reports?.countries) ? reports.countries : [];
  const providerRows = Array.isArray(reports?.providers) ? reports.providers : [];

  const lineChartData = {
    labels: dailyRows.length ? dailyRows.map((row: any) => new Date(row.day).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })) : ['Sin datos'],
    datasets: [
      {
        label: 'Ingresos',
        data: dailyRows.length ? dailyRows.map((row: any) => Number(row.revenue || 0)) : [0],
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        tension: 0.45,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const countriesChartData = {
    labels: countryRows.length ? countryRows.map((row: any) => countryLabel(row.country)) : ['No hay registros todavía'],
    datasets: [
      {
        label: 'Envíos',
        data: countryRows.length ? countryRows.map((row: any) => Number(row.shipments || 0)) : [0],
        backgroundColor: ['#2563eb', '#06b6d4', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#64748b'],
        borderRadius: 12,
        maxBarThickness: 42,
      },
    ],
  };

  const providerChartData = {
    labels: providerRows.length ? providerRows.map((row: any) => row.provider || 'Agencia') : ['No hay registros todavía'],
    datasets: [
      {
        label: 'Envíos por agencia',
        data: providerRows.length ? providerRows.map((row: any) => Number(row.shipments || 0)) : [0],
        backgroundColor: 'rgba(20, 184, 166, 0.72)',
        borderColor: '#14b8a6',
        borderWidth: 1,
        borderRadius: 12,
        maxBarThickness: 44,
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        titleColor: isDark ? '#ffffff' : '#0f172a',
        bodyColor: isDark ? '#e2e8f0' : '#334155',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.35)',
        borderWidth: 1,
        padding: 12,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartText, font: { weight: 700 } } },
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: chartText, precision: 0 } },
    },
  };

  const horizontalChartOptions: any = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: chartText, precision: 0 } },
      y: { grid: { display: false }, ticks: { color: chartText, font: { weight: 700 } } },
    },
  };

  const cards = [
    { label: t('regUsers'), value: stats?.totalUsers || 0, hint: 'Cuentas registradas' },
    { label: t('procShipments'), value: stats?.totalShipments || reports?.summary?.totalShipments || 0, hint: 'Operaciones acumuladas' },
    { label: t('activeStores'), value: stats?.activeStores || 0, hint: 'Tiendas conectadas' },
    { label: 'Ingresos estimados', value: format(reports?.summary?.totalRevenue || 0), hint: 'Según envíos procesados' },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em] mb-3">
            <BarChart3 className="w-4 h-4" /> Analítica global
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-slate-950 dark:text-white">{t('controlPanel')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Resumen comercial, agencias y destinos con mayor movimiento.</p>
        </div>
        <button onClick={loadDashboard} className="px-5 py-3 rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-700 dark:text-slate-200 hover:border-blue-300 dark:hover:border-neon-cyan/50 transition-colors shadow-sm">
          Actualizar métricas
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        {cards.map((s, i) => (
          <div key={i} className="relative overflow-hidden bg-white dark:bg-dark-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/70 shadow-sm hover:shadow-md transition-all">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/10 dark:bg-neon-cyan/10" />
            <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{s.label}</p>
            <p className="text-3xl font-black text-slate-950 dark:text-white">{loading ? '—' : s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        <div className="xl:col-span-2 bg-white dark:bg-dark-800 rounded-3xl border border-slate-100 dark:border-slate-700/70 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Evolución de ingresos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Últimos 7 días registrados.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200 text-xs font-black">Chart.js</span>
          </div>
          <div className="h-72">
            <Line options={chartOptions} data={lineChartData} />
          </div>
        </div>

        <div className="bg-slate-950 dark:bg-black rounded-3xl border border-slate-800 shadow-sm p-6 text-white overflow-hidden relative">
          <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-neon-cyan/20 blur-2xl" />
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center"><MapPin className="w-5 h-5 text-neon-cyan" /></div>
            <div>
              <h2 className="text-lg font-black">País líder</h2>
              <p className="text-xs text-slate-400">Destino con más envíos</p>
            </div>
          </div>
          <p className="text-4xl font-black relative">{countryRows[0] ? countryLabel(countryRows[0].country) : 'No hay registros todavía'}</p>
          <p className="text-sm text-slate-300 mt-3 relative">{countryRows[0] ? `${countryRows[0].shipments} envíos registrados` : 'Cuando existan envíos, aquí verás el país principal.'}</p>
          <div className="mt-8 space-y-3 relative">
            {countryRows.slice(0, 4).map((row: any) => (
              <div key={row.country} className="flex items-center justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-slate-300">{countryLabel(row.country)}</span>
                <span className="font-black text-white">{row.shipments}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-dark-800 rounded-3xl border border-slate-100 dark:border-slate-700/70 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-950 dark:text-white mb-1">Países donde más envían</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Ranking de destinos por cantidad de envíos.</p>
          <div className="h-80">
            <Bar options={horizontalChartOptions} data={countriesChartData} />
          </div>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-3xl border border-slate-100 dark:border-slate-700/70 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-950 dark:text-white mb-1">Envíos por agencia</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Volumen distribuido por proveedor conectado.</p>
          <div className="h-80">
            <Bar options={chartOptions} data={providerChartData} />
          </div>
        </div>
      </div>
    </div>
  );
};

const formatClientMoney = (amount: any, code: string = 'EUR') => {
  const value = Number(amount || 0);
  const currency = String(code || 'EUR').toUpperCase();
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', DOP: 'RD$', MXN: 'MX$', COP: 'COP$', ARS: 'ARS$' };
  if (currency === 'COP' || currency === 'ARS') return `${symbols[currency] || currency} ${Math.round(value).toLocaleString()}`;
  return `${symbols[currency] || currency} ${value.toFixed(2)}`;
};

const convertAdminPreview = (amount: number, from: string, to: string, rates: Record<string, number>) => {
  const value = Number(amount || 0);
  const source = String(from || 'EUR').toUpperCase();
  const target = String(to || 'EUR').toUpperCase();
  if (!value || source === target) return value;
  const sourceRate = Number(rates?.[source] || 0);
  const targetRate = Number(rates?.[target] || 0);
  if (!sourceRate || !targetRate) return value;
  return Math.round(((value / sourceRate) * targetRate + Number.EPSILON) * 100) / 100;
};

const AdminClients = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { rates, availableCurrencies } = useCurrency();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState('');
  const [recharge, setRecharge] = useState({ amount: '25', currency: 'EUR', note: '' });

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClients();
      setClients(res.clients || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const refreshClient = async (client: any) => {
    setDetailLoading(true);
    setNotice('');
    try {
      const res = await api.getAdminClient(client.id);
      setSelectedClient(res.client);
      setClientDetails(res);
      setRecharge(prev => ({ ...prev, currency: res.client?.currency || prev.currency || 'EUR' }));
    } catch {
      setNotice('No se pudo cargar la información del cliente.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openClient = async (client: any) => {
    setSelectedClient(client);
    setClientDetails(null);
    setRecharge(prev => ({ ...prev, currency: client.currency || 'EUR' }));
    await refreshClient(client);
  };

  const updateClientInList = (client: any) => {
    if (!client) return;
    setClients(prev => prev.map((item) => item.id === client.id ? { ...item, ...client } : item));
    setSelectedClient((prev: any) => prev?.id === client.id ? { ...prev, ...client } : prev);
    setClientDetails((prev: any) => prev ? { ...prev, client: { ...(prev.client || {}), ...client } } : prev);
  };

  const runClientAction = async (key: string, action: () => Promise<any>) => {
    setActionLoading(key);
    setNotice('');
    try {
      const res = await action();
      if (res.client) updateClientInList(res.client);
      setNotice(res.message || 'Operación completada correctamente.');
      if (selectedClient?.id) {
        const details = await api.getAdminClient(selectedClient.id);
        setClientDetails(details);
        updateClientInList(details.client);
      }
    } catch (err: any) {
      setNotice(err?.message || 'No se pudo completar la operación.');
    } finally {
      setActionLoading('');
    }
  };

  const handleRecharge = async () => {
    const amount = Number(recharge.amount || 0);
    if (!selectedClient || !amount || amount <= 0) {
      setNotice('Ingresa un monto válido para aplicar la recarga.');
      return;
    }
    await runClientAction('recharge', () => api.adminRechargeClient(selectedClient.id, recharge));
  };

  const handleStatusToggle = async (client: any = selectedClient) => {
    if (!client) return;
    const nextStatus = client.status === 'active' ? 'suspended' : 'active';
    await runClientAction(`status-${client.id}`, () => api.adminUpdateClientStatus(client.id, nextStatus));
  };

  const handleImpersonate = async (client: any = selectedClient) => {
    if (!client) return;
    setActionLoading(`impersonate-${client.id}`);
    setNotice('');
    try {
      const adminToken = getAuthToken();
      const res = await api.adminImpersonateClient(client.id);
      if (adminToken) localStorage.setItem('ship24go_admin_token_backup', adminToken);
      localStorage.setItem('ship24go_admin_return_path', '/admin/clients');
      localStorage.setItem('ship24go_impersonated_client_name', client.name || client.email || 'Cliente');
      setAuthToken(res.token);
      navigate('/panel');
    } catch (err: any) {
      setNotice(err?.message || 'No se pudo preparar el acceso del cliente.');
      setActionLoading('');
    }
  };

  const getStatusBadge = (client: any) => {
    if (client.status === 'suspended') return 'bg-amber-100 text-amber-700';
    if (client.status === 'closed') return 'bg-red-100 text-red-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'suspended') return 'Bloqueado';
    if (status === 'closed') return 'Cerrado';
    return 'Activo';
  };

  const previewAmount = selectedClient
    ? convertAdminPreview(Number(recharge.amount || 0), recharge.currency, selectedClient.currency || 'EUR', rates)
    : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">{t('clients') || 'Gestión de Clientes'}</h1>
          <p className="text-sm text-gray-500 mt-1">Administra saldos, accesos, tarjetas vinculadas y estado de cada cuenta.</p>
        </div>
        <button onClick={loadClients} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:border-blue-200 hover:text-blue-600 transition-colors">
          Actualizar
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No hay clientes registrados todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-6">Cliente</th>
                  <th className="p-6">Correo electrónico</th>
                  <th className="p-6">Moneda</th>
                  <th className="p-6">Saldo</th>
                  <th className="p-6">Tarjeta</th>
                  <th className="p-6">Estado</th>
                  <th className="p-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-bold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                          {c.name ? c.name.substring(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div>
                          <p>{c.name}</p>
                          <p className="text-xs text-gray-400 font-semibold">{c.businessType || 'Cuenta cliente'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-gray-500 font-medium">{c.email}</td>
                    <td className="p-6 text-gray-700 font-black">{c.currency || 'EUR'}</td>
                    <td className="p-6">
                      <div className={`font-black ${Number(c.balance || 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatClientMoney(c.balance, c.currency)}</div>
                      {Number(c.balance || 0) < 0 && <div className="text-[11px] text-red-500 font-bold">Saldo pendiente</div>}
                    </td>
                    <td className="p-6">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${c.cardConnected ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        <CreditCard className="w-3.5 h-3.5" /> {c.cardConnected ? 'Vinculada' : 'No vinculada'}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusBadge(c)}`}>{getStatusLabel(c.status)}</span>
                    </td>
                    <td className="p-6">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openClient(c)} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 flex items-center gap-1">
                          <Eye className="w-4 h-4" /> Ver datos
                        </button>
                        <button onClick={() => handleImpersonate(c)} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 flex items-center gap-1">
                          <LogIn className="w-4 h-4" /> Entrar
                        </button>
                        <button onClick={() => handleStatusToggle(c)} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:border-blue-200 flex items-center gap-1">
                          {c.status === 'active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {c.status === 'active' ? 'Bloquear' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedClient && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[80] flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-blue-600 mb-1">Ficha del cliente</p>
                <h2 className="text-2xl font-black text-gray-900">{selectedClient.name}</h2>
                <p className="text-sm text-gray-500 font-medium">{selectedClient.email}</p>
              </div>
              <button onClick={() => { setSelectedClient(null); setClientDetails(null); }} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {notice && <div className="mb-5 p-4 rounded-2xl bg-blue-50 text-blue-700 text-sm font-bold border border-blue-100">{notice}</div>}
              {detailLoading ? (
                <div className="p-12 text-center text-gray-500">Cargando información del cliente...</div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-black mb-1">Saldo</p>
                        <p className={`text-2xl font-black ${Number(selectedClient.balance || 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatClientMoney(selectedClient.balance, selectedClient.currency)}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-black mb-1">Moneda</p>
                        <p className="text-2xl font-black text-gray-900">{selectedClient.currency}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-black mb-1">Estado</p>
                        <p className="text-lg font-black text-gray-900">{getStatusLabel(selectedClient.status)}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-black mb-1">País</p>
                        <p className="text-lg font-black text-gray-900">{selectedClient.country || 'ES'}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-black text-gray-900">Datos de pago</h3>
                        <ShieldCheck className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-white border border-gray-100">
                          <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Tarjeta asociada</p>
                          {selectedClient.cardConnected ? (
                            <div>
                              <p className="font-black text-gray-900">{selectedClient.cardDetails?.cardNumber || 'Tarjeta vinculada'}</p>
                              <p className="text-xs text-gray-500 mt-1">Titular: {selectedClient.cardDetails?.cardholderName || 'Cliente'}</p>
                              <p className="text-xs text-gray-500">Vence: {selectedClient.cardDetails?.expiryDate || 'No disponible'}</p>
                              <button onClick={() => runClientAction('remove-card', () => api.adminRemoveClientCard(selectedClient.id))} className="mt-3 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200">
                                Desvincular tarjeta
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 font-semibold">No hay tarjeta asociada.</p>
                          )}
                        </div>
                        <div className="p-4 rounded-xl bg-white border border-gray-100">
                          <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">PayPal</p>
                          <p className="font-black text-gray-900">{selectedClient.paypalConnected ? selectedClient.paypalEmail : 'No conectado'}</p>
                          <p className="text-xs text-gray-500 mt-1">Medio alternativo de pago del cliente.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="p-4 bg-gray-50 border-b border-gray-100"><h3 className="font-black text-gray-900">Movimientos recientes</h3></div>
                      <div className="divide-y divide-gray-100">
                        {(clientDetails?.transactions || []).length === 0 ? (
                          <div className="p-5 text-sm text-gray-500 font-medium">No hay movimientos para mostrar.</div>
                        ) : (clientDetails?.transactions || []).map((tx: any) => (
                          <div key={tx.id} className="p-4 flex justify-between gap-4">
                            <div>
                              <p className="font-bold text-gray-900">{tx.description || 'Movimiento de saldo'}</p>
                              <p className="text-xs text-gray-400 font-medium">{new Date(tx.created_at || tx.createdAt).toLocaleString()}</p>
                            </div>
                            <p className={`font-black ${tx.type === 'debit' ? 'text-red-600' : 'text-emerald-600'}`}>{tx.type === 'debit' ? '-' : '+'}{formatClientMoney(tx.amount, tx.currency)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-100 p-5 bg-white">
                      <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-500" /> Recargar saldo</h3>
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Monto</label>
                      <input type="number" min="1" value={recharge.amount} onChange={e => setRecharge({ ...recharge, amount: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-3 font-bold outline-none focus:border-blue-500 mb-3" />
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Moneda de recarga</label>
                      <select value={recharge.currency} onChange={e => setRecharge({ ...recharge, currency: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-3 font-bold outline-none focus:border-blue-500 mb-3">
                        {availableCurrencies.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                      </select>
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Nota interna opcional</label>
                      <textarea value={recharge.note} onChange={e => setRecharge({ ...recharge, note: e.target.value })} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 mb-3" rows={3} placeholder="Ej. ajuste por servicio, recarga manual o acuerdo comercial" />
                      <div className="p-3 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold mb-4">
                        Se acreditará aprox. {formatClientMoney(previewAmount, selectedClient.currency)} en la cuenta del cliente.
                      </div>
                      <button disabled={actionLoading === 'recharge'} onClick={handleRecharge} className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-60">
                        {actionLoading === 'recharge' ? 'Aplicando...' : 'Aplicar recarga'}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-100 p-5 bg-white space-y-3">
                      <h3 className="font-black text-gray-900 mb-2">Acciones de cuenta</h3>
                      <button onClick={() => handleImpersonate(selectedClient)} className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black flex items-center justify-center gap-2">
                        <LogIn className="w-4 h-4" /> Entrar como cliente
                      </button>
                      <button onClick={() => handleStatusToggle(selectedClient)} className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 hover:border-blue-200 text-gray-800 font-black flex items-center justify-center gap-2">
                        {selectedClient.status === 'active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {selectedClient.status === 'active' ? 'Bloquear cliente' : 'Activar cliente'}
                      </button>
                      <button onClick={() => runClientAction('clear-debt', () => api.adminClearClientDebt(selectedClient.id, { note: 'Ajuste de saldo pendiente desde Super Admin' }))} className="w-full px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black flex items-center justify-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> Quitar deuda pendiente
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-100 p-5 bg-white">
                      <h3 className="font-black text-gray-900 mb-4">Últimos envíos</h3>
                      {(clientDetails?.shipments || []).length === 0 ? (
                        <p className="text-sm text-gray-500 font-medium">No hay envíos para mostrar.</p>
                      ) : (
                        <div className="space-y-3">
                          {(clientDetails?.shipments || []).slice(0, 5).map((shipment: any) => (
                            <div key={shipment.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                              <p className="font-mono text-xs font-black text-blue-600">{shipment.tracking_code}</p>
                              <p className="text-xs text-gray-500 font-semibold">{shipment.status_label || 'Registrado'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminShipments = () => {
  const { t } = useI18n();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchShipments();
  }, []);

  const fetchShipments = () => {
    setLoading(true);
    api.getAdminShipments().then(res => {
      setShipments(res.shipments || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.updateAdminShipmentStatus(id, newStatus);
      fetchShipments();
    } catch (error) {
      alert('Error al actualizar el estado del envío.');
    }
  };

  const handlePrepareShipment = async (shipment: any) => {
    setActionMap(prev => ({ ...prev, [shipment.id]: true }));
    try {
      const res = await api.retryShipmentLabel(shipment.id);
      alert(res.message || 'Preparación en curso.');
      fetchShipments();
    } catch (error: any) {
      alert(error?.message || 'No se pudo completar la preparación.');
    } finally {
      setActionMap(prev => ({ ...prev, [shipment.id]: false }));
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <h1 className="text-3xl font-black text-gray-900 mb-8">{t('totalShipments') || 'Registro Global de Envíos'}</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
           <div className="relative w-64">
             <input type="text" placeholder="Buscar tracking o usuario..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors" />
             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</div>
           </div>
           <select className="border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500">
             <option>Todos los estados</option>
             <option>En Tránsito</option>
             <option>Entregados</option>
           </select>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando envíos...</div>
        ) : shipments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No hay envíos registrados en el sistema.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-6">Código Tracking</th>
                  <th className="p-6">Cliente</th>
                  <th className="p-6">Proveedor</th>
                  <th className="p-6">Estado</th>
                  <th className="p-6">Fecha Creación</th>
                  <th className="p-6">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s: any) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-mono font-bold text-blue-600">{s.trackingCode}</td>
                    <td className="p-6 text-gray-900 font-bold">{s.userId || 'Anónimo'}</td>
                    <td className="p-6 text-gray-700 font-bold"><div>{displayAdminCarrierName(s.carrierName)}</div></td>
                    <td className="p-6">
                      <select 
                        value={s.status} 
                        onChange={(e) => handleStatusChange(s.id, e.target.value)}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold focus:outline-none appearance-none cursor-pointer border ${
                          s.status === 'Entregado' ? 'bg-green-100 text-green-700 border-green-200' : 
                          s.status === 'Cancelado' ? 'bg-red-100 text-red-700 border-red-200' : 
                          'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        <option value="Creado">Creado</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="Recogida Programada">Recogida Programada</option>
                        <option value="En Tránsito">En Tránsito</option>
                        <option value="En Reparto">En Reparto</option>
                        <option value="Entregado">Entregado</option>
                        <option value="Devuelto">Devuelto</option>
                        <option value="Cancelado">Cancelado</option>
                        <option value="Incidencia">Incidencia</option>
                      </select>
                    </td>
                    <td className="p-6 text-gray-500 font-medium">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="p-6">
                      {s.canRetryLabel && !s.labelReady ? (
                        <button
                          onClick={() => handlePrepareShipment(s)}
                          disabled={Boolean(actionMap[s.id])}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:bg-gray-100 disabled:text-gray-400 text-xs font-black transition-colors"
                        >
                          <PlayCircle className="w-4 h-4" />
                          {actionMap[s.id] ? 'Preparando...' : 'Preparar'}
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-gray-400">—</span>
                      )}
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
};

const AdminProviders = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});

  const loadProviders = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminProviders();
      setProviders(res.providers || []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const updateProvider = (index: number, key: string, value: any) => {
    const next = [...providers];
    next[index] = { ...next[index], [key]: value };
    setProviders(next);
  };

  const updateProviderConfig = (index: number, key: string, value: any) => {
    const next = [...providers];
    next[index] = {
      ...next[index],
      config: {
        ...(next[index].config || {}),
        [key]: value
      }
    };
    setProviders(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = providers.map((provider) => ({
        ...provider,
        margin_percent: Number(provider.margin ?? provider.margin_percent ?? 30),
        config: provider.config || {}
      }));
      const res = await api.updateAdminProviders(payload);
      setProviders(res.providers || []);
      alert(res.message || 'Proveedor guardado correctamente.');
    } catch {
      alert('No se pudo completar la operación.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (provider: any) => {
    setTestingMap(prev => ({ ...prev, [provider.code]: true }));
    try {
      const res = await api.testAdminProvider(provider.code);
      alert(res.message || (res.success ? 'Proveedor conectado correctamente.' : 'No se pudieron obtener opciones en la prueba.'));
      await loadProviders();
    } catch {
      alert('No se pudo validar la conexión. Revisa la credencial privada.');
    } finally {
      setTestingMap(prev => ({ ...prev, [provider.code]: false }));
    }
  };

  const handleCreatePolarWebhook = async () => {
    setTestingMap(prev => ({ ...prev, polarWebhook: true }));
    try {
      const res = await api.polarCreateWebhook();
      alert(res.message || 'Webhook de Polar configurado correctamente.');
      await loadProviders();
    } catch {
      alert('No se pudo crear el webhook de Polar. Revisa la credencial privada.');
    } finally {
      setTestingMap(prev => ({ ...prev, polarWebhook: false }));
    }
  };

  const handleCreateEasyPostWebhook = async () => {
    setTestingMap(prev => ({ ...prev, easyPostWebhook: true }));
    try {
      const res = await api.createEasyPostWebhook();
      alert(res.message || 'Webhook de EasyPost configurado correctamente.');
      await loadProviders();
    } catch {
      alert('No se pudo completar la operación. Revisa la credencial privada.');
    } finally {
      setTestingMap(prev => ({ ...prev, easyPostWebhook: false }));
    }
  };

  const handleAddPabc = () => {
    setProviders([
      ...providers,
      {
        id: `prv_${Date.now()}`,
        code: 'parcelabc',
        name: 'ParcelABC',
        is_active: true,
        margin: 30,
        currency: 'EUR',
        config: {
          baseUrl: 'https://www.parcelabc.com/api-pabc.php',
          primaryColor: '#2563eb',
          secondaryColor: '#06b6d4',
          maxResults: 10,
          priority: 10,
          manifestAuto: false
        }
      }
    ]);
  };


  const handleAddPaccofacile = () => {
    setProviders([
      ...providers,
      {
        id: `prv_${Date.now()}`,
        code: 'paccofacile',
        name: 'Paccofacile',
        is_active: true,
        margin: 30,
        currency: 'EUR',
        config: {
          mode: 'sandbox',
          baseUrl: 'https://paccofacile.tecnosogima.cloud/sandbox',
          liveBaseUrl: 'https://paccofacile.tecnosogima.cloud/live',
          apiVersion: 'v1',
          token: '',
          apiKey: '',
          accountNumber: '',
          allowRealBuy: false,
          publicName: 'DoorDrop',
          primaryColor: '#16a34a',
          secondaryColor: '#22c55e',
          maxResults: 10,
          priority: 30
        }
      }
    ]);
  };


  const handleAddSpedirePro = () => {
    setProviders([
      ...providers,
      {
        id: `prv_${Date.now()}`,
        code: 'spedirepro',
        name: 'SpedirePro',
        is_active: true,
        margin: 30,
        currency: 'EUR',
        config: {
          baseUrl: 'https://www.spedirepro.com/public-api',
          apiKey: '',
          allowRealBuy: false,
          publicName: 'DoorDrop',
          primaryColor: '#7c3aed',
          secondaryColor: '#a855f7',
          maxResults: 10,
          priority: 25
        }
      }
    ]);
  };


  const handleAddSpediamoPro = () => {
    setProviders([
      ...providers,
      {
        id: `prv_${Date.now()}`,
        code: 'spediamopro',
        name: 'SpediamoPro',
        is_active: true,
        margin: 30,
        currency: 'EUR',
        config: {
          mode: 'production',
          baseUrl: 'https://core.spediamopro.com/api/v2',
          stagingBaseUrl: 'https://core.spediamopro.it/api/v2',
          authCode: '',
          allowRealBuy: false,
          publicName: 'DoorDrop',
          primaryColor: '#4f46e5',
          secondaryColor: '#06b6d4',
          maxResults: 10,
          priority: 22
        }
      }
    ]);
  };


  const handleAddEasyPost = () => {
    setProviders([
      ...providers,
      {
        id: `prv_${Date.now()}`,
        code: 'easypost',
        name: 'EasyPost',
        is_active: true,
        margin: 30,
        currency: 'USD',
        config: {
          mode: 'test',
          baseUrl: 'https://api.easypost.com/v2',
          apiKey: '',
          allowRealBuy: false,
          publicName: 'DoorDrop',
          webhookUrl: 'https://doordrop.lat/api/webhooks/easypost',
          primaryColor: '#111827',
          secondaryColor: '#2563eb',
          maxResults: 10,
          priority: 21
        }
      }
    ]);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Proveedores de envío</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Configura tus proveedores, colores, moneda y margen comercial desde un solo lugar.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleAddPabc} className="bg-white border border-gray-200 hover:border-blue-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Truck className="w-4 h-4" /> Agregar ParcelABC
          </button>
          <button onClick={handleAddPaccofacile} className="bg-white border border-emerald-200 hover:border-emerald-300 text-emerald-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Truck className="w-4 h-4" /> Agregar Paccofacile
          </button>
          <button onClick={handleAddSpedirePro} className="bg-white border border-violet-200 hover:border-violet-300 text-violet-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Truck className="w-4 h-4" /> Agregar SpedirePro
          </button>
          <button onClick={handleAddSpediamoPro} className="bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Truck className="w-4 h-4" /> Agregar SpediamoPro
          </button>
          <button onClick={handleAddEasyPost} className="bg-white border border-slate-200 hover:border-slate-400 text-slate-800 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Truck className="w-4 h-4" /> Agregar EasyPost
          </button>
          <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">Cargando...</div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Truck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-gray-900">No hay proveedores configurados todavía.</h2>
          <p className="text-sm text-gray-500 mt-2 mb-6">Agrega tu primer proveedor de envíos.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={handleAddPabc} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold">Agregar ParcelABC</button>
            <button onClick={handleAddPaccofacile} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold">Agregar Paccofacile</button>
            <button onClick={handleAddSpedirePro} className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold">Agregar SpedirePro</button>
            <button onClick={handleAddSpediamoPro} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold">Agregar SpediamoPro</button>
            <button onClick={handleAddEasyPost} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold">Agregar EasyPost</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {providers.map((p: any, i) => {
            const cfg = p.config || {};
            const isSuspendedInternational = p.code === 'logihub_intl';
            return (
              <div key={`${p.code}-${i}`} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl text-white font-black flex items-center justify-center shadow-sm" style={{ background: cfg.primaryColor || '#2563eb' }}>
                      {(p.name || 'P').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <input
                        value={p.name || ''}
                        onChange={(e) => updateProvider(i, 'name', e.target.value)}
                        className="text-xl font-black text-gray-900 bg-transparent border-0 outline-none w-full"
                      />
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{isSuspendedInternational ? 'suspendido' : p.code}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600 select-none">
                    <input type="checkbox" checked={Boolean(p.is_active)} disabled={isSuspendedInternational} onChange={(e) => updateProvider(i, 'is_active', e.target.checked)} className="rounded text-blue-600 disabled:cursor-not-allowed disabled:opacity-60" />
                    {isSuspendedInternational ? 'Suspendido' : 'Activo'}
                  </label>
                </div>

                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">URL base</label>
                      <input
                        type="text"
                        value={cfg.baseUrl || (p.code === 'parcelabc' ? 'https://www.parcelabc.com/api-pabc.php' : p.code === 'paccofacile' ? 'https://paccofacile.tecnosogima.cloud/sandbox' : p.code === 'spedirepro' ? 'https://www.spedirepro.com/public-api' : p.code === 'spediamopro' ? 'https://core.spediamopro.com/api/v2' : '')}
                        onChange={(e) => updateProviderConfig(i, 'baseUrl', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Credencial privada</label>
                      <input
                        type="password"
                        value={p.code === 'paccofacile' ? (cfg.token || '') : p.code === 'spedirepro' ? (cfg.apiKey || '') : p.code === 'spediamopro' ? (cfg.authCode || '') : p.code === 'easypost' ? (cfg.apiKey || '') : (cfg.authToken || cfg.credential || '')}
                        onChange={(e) => updateProviderConfig(i, p.code === 'genei' ? 'credential' : p.code === 'paccofacile' ? 'token' : p.code === 'spedirepro' ? 'apiKey' : p.code === 'spediamopro' ? 'authCode' : p.code === 'easypost' ? 'apiKey' : 'authToken', e.target.value)}
                        placeholder="Pega la credencial del proveedor"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400"
                      />
                    </div>
                    {p.code === 'paccofacile' && (
                      <>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Modo</label>
                          <select value={cfg.mode || 'sandbox'} onChange={(e) => updateProviderConfig(i, 'mode', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400">
                            <option value="sandbox">Sandbox seguro</option>
                            <option value="live">Producción real</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Account Number</label>
                          <input type="text" value={cfg.accountNumber || ''} onChange={(e) => updateProviderConfig(i, 'accountNumber', e.target.value)} placeholder="444017" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">API Key</label>
                          <input type="password" value={cfg.apiKey || ''} onChange={(e) => updateProviderConfig(i, 'apiKey', e.target.value)} placeholder="Pega la API key de Paccofacile" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400" />
                        </div>
                        <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                          <input type="checkbox" checked={Boolean(cfg.allowRealBuy)} onChange={(e) => updateProviderConfig(i, 'allowRealBuy', e.target.checked)} className="rounded text-amber-600" />
                          Permitir compra real con crédito de Paccofacile. Mantener desactivado durante pruebas.
                        </label>
                      </>
                    )}
                    {p.code === 'spedirepro' && (
                      <>
                        <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold text-violet-800">
                          <input type="checkbox" checked={Boolean(cfg.allowRealBuy)} onChange={(e) => updateProviderConfig(i, 'allowRealBuy', e.target.checked)} className="rounded text-violet-600" />
                          Permitir emisión real de etiquetas con saldo de SpedirePro.
                        </label>
                      </>
                    )}
                    {p.code === 'spediamopro' && (
                      <>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Modo</label>
                          <select value={cfg.mode || 'production'} onChange={(e) => updateProviderConfig(i, 'mode', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400">
                            <option value="production">Producción real</option>
                            <option value="staging">Staging / pruebas</option>
                          </select>
                        </div>
                        <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-bold text-indigo-800">
                          <input type="checkbox" checked={Boolean(cfg.allowRealBuy)} onChange={(e) => updateProviderConfig(i, 'allowRealBuy', e.target.checked)} className="rounded text-indigo-600" />
                          Permitir emisión real de etiquetas con saldo de SpediamoPro.
                        </label>
                      </>
                    )}
                    {p.code === 'easypost' && (
                      <>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Modo</label>
                          <select value={cfg.mode || 'test'} onChange={(e) => updateProviderConfig(i, 'mode', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400">
                            <option value="test">Pruebas</option>
                            <option value="production">Producción real</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Webhook URL</label>
                          <input type="text" value={cfg.webhookUrl || 'https://doordrop.lat/api/webhooks/easypost'} onChange={(e) => updateProviderConfig(i, 'webhookUrl', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400" />
                        </div>
                        <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700">
                          <input type="checkbox" checked={Boolean(cfg.allowRealBuy)} onChange={(e) => updateProviderConfig(i, 'allowRealBuy', e.target.checked)} className="rounded text-slate-700" />
                          Permitir emisión real de etiquetas con EasyPost. Mantener desactivado durante pruebas.
                        </label>
                      </>
                    )}

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Moneda</label>
                      <select
                        value={p.currency || 'EUR'}
                        onChange={(e) => updateProvider(i, 'currency', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="USD">USD ($)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="DOP">DOP (RD$)</option>
                        <option value="MXN">MXN ($)</option>
                        <option value="COP">COP ($)</option>
                        <option value="ARS">ARS ($)</option>
                        <option value="CLP">CLP ($)</option>
                        <option value="BRL">BRL (R$)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Margen comercial (%)</label>
                      <input
                        type="number"
                        min="0"
                        value={p.margin ?? p.margin_percent ?? 30}
                        onChange={(e) => updateProvider(i, 'margin', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Margen fijo</label>
                      <input type="number" min="0" step="0.01" value={cfg.fixedMargin || 0} onChange={(e) => updateProviderConfig(i, 'fixedMargin', Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Ganancia mínima</label>
                      <input type="number" min="0" step="0.01" value={cfg.minimumMargin || 0} onChange={(e) => updateProviderConfig(i, 'minimumMargin', Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Máximo resultados</label>
                      <input type="number" min="1" max="10" value={cfg.maxResults || 10} onChange={(e) => updateProviderConfig(i, 'maxResults', Math.min(10, Math.max(1, Number(e.target.value))))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Prioridad</label>
                      <input type="number" min="1" value={cfg.priority || 100} onChange={(e) => updateProviderConfig(i, 'priority', Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Color principal</label>
                      <input type="color" value={cfg.primaryColor || '#2563eb'} onChange={(e) => updateProviderConfig(i, 'primaryColor', e.target.value)} className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Color secundario</label>
                      <input type="color" value={cfg.secondaryColor || '#06b6d4'} onChange={(e) => updateProviderConfig(i, 'secondaryColor', e.target.value)} className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-xl" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1">Logo URL</label>
                      <input type="text" value={cfg.logoUrl || ''} onChange={(e) => updateProviderConfig(i, 'logoUrl', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold outline-none focus:border-blue-400" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
                    <div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${isSuspendedInternational ? 'bg-amber-100 text-amber-800' : p.is_connected ? 'bg-green-100 text-green-700' : p.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isSuspendedInternational ? 'Suspendido' : p.is_connected ? 'Integrado' : p.is_active ? 'Pendiente' : 'No disponible'}
                      </span>
                      {p.balance?.label && (
                        <p className="text-[12px] text-gray-700 font-black mt-2">Saldo proveedor: {p.balance.label}</p>
                      )}
                      {!p.balance?.label && (p.code === 'paccofacile' || p.code === 'spedirepro' || p.code === 'spediamopro' || p.code === 'easypost' || p.code === 'genei') && (
                        <p className="text-[11px] text-gray-400 mt-2">Saldo no disponible</p>
                      )}
                      {p.last_connection_message && <p className="text-[11px] text-gray-400 mt-1">{p.last_connection_message}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleTestConnection(p)} disabled={isSuspendedInternational || testingMap[p.code]} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 font-bold rounded-lg text-xs transition-colors">
                        {isSuspendedInternational ? 'Suspendido' : testingMap[p.code] ? 'Probando...' : p.code === 'paccofacile' ? 'Validar Paccofacile' : p.code === 'spedirepro' ? 'Validar SpedirePro' : p.code === 'spediamopro' ? 'Validar SpediamoPro' : p.code === 'easypost' ? 'Validar EasyPost' : 'Probar conexión'}
                      </button>
                      {p.code === 'easypost' && (
                        <button onClick={handleCreateEasyPostWebhook} disabled={testingMap.easyPostWebhook} className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:bg-gray-300 disabled:text-gray-500 font-bold rounded-lg text-xs transition-colors">
                          {testingMap.easyPostWebhook ? 'Creando...' : 'Add Webhook'}
                        </button>
                      )}
                      {p.code === 'polar' && (
                        <button onClick={handleCreatePolarWebhook} disabled={testingMap.polarWebhook} className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:bg-gray-300 disabled:text-gray-500 font-bold rounded-lg text-xs transition-colors">
                          {testingMap.polarWebhook ? 'Creando...' : 'Crear webhook'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AdminPlans = () => {
  const { t } = useI18n();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingPolar, setSyncingPolar] = useState(false);
  const [syncingPayPal, setSyncingPayPal] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminPlans();
      setPlans(res.plans || []);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  const handleSyncPolarProducts = async () => {
    setSyncingPolar(true);
    try {
      const res = await api.syncPolarProducts();
      setPlans(res.plans || []);
      alert(res.message || 'Planes sincronizados con Polar.');
    } catch (e: any) {
      alert(e.message || 'No se pudieron sincronizar los planes con Polar.');
    } finally {
      setSyncingPolar(false);
    }
  };

  const handleSyncPayPalProducts = async () => {
    setSyncingPayPal(true);
    try {
      const res = await api.syncPayPalProducts();
      setPlans(res.plans || []);
      alert(res.message || 'Planes sincronizados con PayPal.');
    } catch (e: any) {
      alert(e.message || 'No se pudieron sincronizar los planes con PayPal.');
    } finally {
      setSyncingPayPal(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = plans.map((plan: any) => ({
        ...plan,
        discount: Number(plan.discount || 0),
        price: Number(plan.price || 0),
        currency: String(plan.currency || 'EUR').toUpperCase(),
        billing_interval: plan.billingInterval || plan.billing_interval || 'month',
        polar_product_id: plan.polarProductId || plan.polar_product_id || '',
        polar_price_id: plan.polarPriceId || plan.polar_price_id || '',
        polar_sync_status: plan.polarSyncStatus || plan.polar_sync_status || 'pending',
        paypal_product_id: plan.paypalProductId || plan.paypal_product_id || '',
        paypal_plan_id: plan.paypalPlanId || plan.paypal_plan_id || '',
        paypal_sync_status: plan.paypalSyncStatus || plan.paypal_sync_status || 'pending',
        wallet_enabled: plan.walletEnabled !== false,
        polar_enabled: plan.polarEnabled !== false,
        paypal_enabled: plan.paypalEnabled !== false,
        is_active: plan.isActive !== false
      }));
      const res = await api.updateAdminPlans(payload);
      if (res.plans) setPlans(res.plans);
      alert('Planes guardados correctamente.');
    } catch (e: any) {
      alert(e.message || 'No se pudo completar la operación.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (index: number, field: string, value: any) => {
    setPlans((current) => current.map((plan, i) => {
      if (i !== index) return plan;
      if (['price', 'discount'].includes(field)) {
        const numericValue = Number(value || 0);
        return { ...plan, [field]: field === 'discount' ? Math.min(MAX_PLAN_DISCOUNT_PERCENT, Math.max(0, numericValue)) : Math.max(0, numericValue) };
      }
      if (['walletEnabled', 'polarEnabled', 'paypalEnabled', 'isActive'].includes(field)) return { ...plan, [field]: Boolean(value) };
      return { ...plan, [field]: value };
    }));
  };

  const statusBadge = (status: string) => {
    const ok = String(status || '').toLowerCase() === 'synced';
    return <span className={`px-3 py-1 rounded-full text-[11px] font-black ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{ok ? 'Sincronizado' : 'Pendiente'}</span>;
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 mb-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 mb-2">Suscripciones SaaS</p>
          <h1 className="text-3xl font-black text-gray-900">Planes y descuentos</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-3xl">Gestiona precios en EUR, descuentos y estado comercial. La configuración de Polar y PayPal está en páginas dedicadas.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/admin/polar" className="bg-violet-50 hover:bg-violet-100 text-violet-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors self-start sm:self-auto">
            <Sparkles className="w-4 h-4" /> Polar
          </Link>
          <Link to="/admin/paypal" className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors self-start sm:self-auto">
            <CreditCard className="w-4 h-4" /> PayPal
          </Link>
          <button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors self-start sm:self-auto disabled:bg-gray-300">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">Planes</p><p className="text-lg font-black text-gray-900 mt-1">Precio y descuento</p><p className="text-xs text-gray-500 mt-2">Los planes se mantienen limpios y comerciales.</p></div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 shadow-sm"><p className="text-xs font-black text-emerald-700 uppercase tracking-wider">Protección de margen</p><p className="text-lg font-black text-emerald-900 mt-1">Máximo {MAX_PLAN_DISCOUNT_PERCENT}%</p><p className="text-xs text-emerald-800 mt-2">Con margen de transporte del 30%, evita que el descuento lleve el precio por debajo del coste.</p></div>
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">Polar</p><p className="text-lg font-black text-gray-900 mt-1">Configuración dedicada</p><p className="text-xs text-gray-500 mt-2">Credenciales, webhooks, salud e historial en una sola página.</p></div>
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">PayPal</p><p className="text-lg font-black text-gray-900 mt-1">Configuración dedicada</p><p className="text-xs text-gray-500 mt-2">Pago con PayPal o tarjeta sin mezclarlo con otros módulos.</p></div>
      </div>

      {loading ? (
        <div className="rounded-3xl bg-white border border-gray-100 p-12 text-center text-gray-500 font-bold">Cargando planes...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <div key={plan.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre del plan</label>
                  <input type="text" value={plan.name || ''} onChange={(e) => handleChange(i, 'name', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 focus:outline-none focus:border-blue-500" />
                </div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-500 mt-8"><input type="checkbox" checked={plan.isActive !== false} onChange={(e) => handleChange(i, 'isActive', e.target.checked)} /> Activo</label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Precio mensual</label><input type="number" step="0.01" value={plan.price || 0} onChange={(e) => handleChange(i, 'price', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Moneda</label><select value={plan.currency || 'EUR'} onChange={(e) => handleChange(i, 'currency', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900"><option value="EUR">EUR</option><option value="USD">USD</option><option value="DOP">DOP</option><option value="GBP">GBP</option></select></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descuento % <span className="text-emerald-600">(máx. {MAX_PLAN_DISCOUNT_PERCENT}%)</span></label><input type="number" min="0" max={MAX_PLAN_DISCOUNT_PERCENT} step="0.01" value={plan.discount || 0} onChange={(e) => handleChange(i, 'discount', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 focus:outline-none focus:border-blue-500" /><p className="text-[11px] text-gray-500 mt-1">30% de margen ⇒ 23% es el tope operativo seguro.</p></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Periodo</label><select value={plan.billingInterval || 'month'} onChange={(e) => handleChange(i, 'billingInterval', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900"><option value="month">Mensual</option><option value="year">Anual</option></select></div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50/80">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">Métodos de cobro</p>
                <p className="text-sm text-gray-600 mt-2">Wallet, Polar y PayPal se gestionan desde sus páginas dedicadas para mantener esta vista simple.</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link to="/admin/polar" className="px-3 py-2 rounded-lg bg-violet-50 text-violet-700 text-xs font-black">Configurar Polar</Link>
                  <Link to="/admin/paypal" className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">Configurar PayPal</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminReports = () => {
  const { t } = useI18n();
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<any>({ period: 'month', search: '', provider: 'all', status: 'all', dateFrom: '', dateTo: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const money = (value: any, currency = 'EUR') => {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: String(currency || 'EUR') }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency || 'EUR'}`;
    }
  };

  const loadReports = async (override: any = {}) => {
    setLoading(true);
    try {
      const res = await api.getAdminReports({ ...filters, page, limit, ...override });
      setReports(res);
    } catch {
      setReports(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [filters.period, filters.provider, filters.status, filters.dateFrom, filters.dateTo, page, limit]);

  const updateFilter = (key: string, value: any) => {
    setPage(1);
    setFilters((current: any) => ({ ...current, [key]: value }));
  };

  const applySearch = () => {
    setPage(1);
    loadReports({ page: 1 });
  };

  const rows = Array.isArray(reports?.rows) ? reports.rows : [];
  const summary = reports?.summary || {};
  const pagination = reports?.pagination || { page: 1, totalPages: 1, totalRows: 0, limit };

  const barChartData = {
    labels: reports?.daily?.map((item: any) => item.day) || [],
    datasets: [
      {
        label: 'Ventas',
        data: reports?.daily?.map((item: any) => item.revenue) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
    ],
  };

  const exportCsv = () => {
    const headers = [
      'Fecha', 'Tracking', 'Cliente', 'Correo', 'Courier', 'Servicio', 'Estado', 'Pago', 'Moneda',
      'Precio compra', 'Precio cliente', 'Descuento', 'Pagado cliente', 'Ganancia esperada', 'Ganancia cobrada', 'Perdida',
      'Proveedor interno', 'Origen', 'Destino'
    ];
    const csvRows = rows.map((row: any) => [
      row.date ? new Date(row.date).toLocaleString('es-ES') : '',
      row.trackingCode || '',
      row.clientName || '',
      row.clientEmail || '',
      row.carrierName || '',
      row.serviceName || '',
      row.statusLabel || '',
      row.paymentStatus || '',
      row.currency || 'EUR',
      row.providerCost || 0,
      row.clientPrice || 0,
      row.discountAmount || 0,
      row.paidNet || 0,
      row.expectedProfit || 0,
      row.actualProfit || 0,
      row.lossAmount || 0,
      row.providerCode || '',
      `${row.sender?.country || ''} ${row.sender?.city || ''} ${row.sender?.zip || ''}`.trim(),
      `${row.recipient?.country || ''} ${row.recipient?.city || ''} ${row.recipient?.zip || ''}`.trim(),
    ]);
    const csv = [headers, ...csvRows]
      .map((line) => line.map((cell: any) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ship24go_reporte_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">{t('reports') || 'Reportes'}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Vista financiera de envíos con precio de compra, precio cliente, descuento, pago, ganancia y pérdida.</p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          Exportar CSV
        </button>
      </div>

      <div className="bg-white dark:bg-dark-800 border border-gray-100 dark:border-dark-700 rounded-2xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Periodo</label>
            <select value={filters.period} onChange={(e) => updateFilter('period', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white">
              <option value="today">Hoy</option>
              <option value="week">Últimos 7 días</option>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
              <option value="all">Todo</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Desde</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Hasta</label>
            <input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Proveedor</label>
            <select value={filters.provider} onChange={(e) => updateFilter('provider', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white">
              <option value="all">Todos</option>
              <option value="parcelabc">ParcelABC</option>
              <option value="genei">Genei</option>
              <option value="paccofacile">Paccofacile</option>
              <option value="spedirepro">SpedirePro</option>
              <option value="spediamopro">SpediamoPro</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Estado</label>
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white">
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="pending">Pendientes</option>
              <option value="processed">Procesados</option>
              <option value="delivered">Entregados</option>
              <option value="cancel">Cancelados</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Buscar</label>
            <div className="flex gap-2">
              <input value={filters.search} onChange={(e) => setFilters((current: any) => ({ ...current, search: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }} placeholder="Tracking, cliente..." className="min-w-0 flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white" />
              <button onClick={applySearch} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">Ver</button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">Cargando reportes...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Envíos</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{summary.totalShipments || 0}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Compra proveedor</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{money(summary.purchaseCost || 0)}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Precio cliente</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{money(summary.clientRevenue || 0)}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Pagado</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{money(summary.paidNet || 0)}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Ganancia esperada</p>
              <p className="text-3xl font-black text-emerald-600 mt-2">{money(summary.expectedProfit || 0)}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Pérdida</p>
              <p className="text-3xl font-black text-rose-600 mt-2">{money(summary.lossAmount || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="xl:col-span-2 bg-white dark:bg-dark-800 p-6 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-gray-900 dark:text-white">Ventas por día</h2>
                <span className="text-xs font-bold text-gray-500">{reports?.filters?.dateFrom || 'Inicio'} → {reports?.filters?.dateTo || 'Hoy'}</span>
              </div>
              <div className="h-72">
                <Bar options={{ responsive: true, maintainAspectRatio: false }} data={barChartData} />
              </div>
            </div>
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Resumen por proveedor</h2>
              <div className="space-y-3">
                {(reports?.providers || []).length ? reports.providers.map((provider: any) => (
                  <div key={provider.provider} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-dark-900">
                    <div>
                      <p className="font-black text-gray-900 dark:text-white text-sm uppercase">{provider.provider}</p>
                      <p className="text-xs text-gray-500">{provider.shipments} envíos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-gray-900 dark:text-white text-sm">{money(provider.revenue || 0)}</p>
                      <p className="text-xs font-bold text-emerald-600">{money(provider.profit || 0)}</p>
                    </div>
                  </div>
                )) : <p className="text-sm text-gray-500">No hay datos para mostrar.</p>}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-800 rounded-2xl border border-gray-100 dark:border-dark-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-dark-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">Detalle tipo Excel</h2>
                <p className="text-xs text-gray-500">{pagination.totalRows || 0} registros encontrados</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={limit} onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-900 text-sm font-bold text-gray-900 dark:text-white">
                  <option value={25}>25 / página</option>
                  <option value={50}>50 / página</option>
                  <option value={100}>100 / página</option>
                  <option value={200}>200 / página</option>
                </select>
                <button onClick={loadReports} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-dark-700 dark:hover:bg-dark-600 text-gray-900 dark:text-white font-black text-sm">Actualizar</button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[620px]">
              <table className="min-w-[1800px] w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-slate-300">
                  <tr>
                    {['Fecha','Tracking','Cliente','Courier','Servicio','Estado','Pago','Compra','Cliente','Descuento','Pagado','Ganancia esperada','Ganancia cobrada','Pérdida','Origen','Destino','Proveedor'].map((head) => (
                      <th key={head} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider border-b border-gray-200 dark:border-dark-700 whitespace-nowrap">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((row: any) => (
                    <tr key={row.id} className="border-b border-gray-100 dark:border-dark-700 hover:bg-blue-50/60 dark:hover:bg-dark-700/60">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-slate-300 font-semibold">{row.date ? new Date(row.date).toLocaleString('es-ES') : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-black text-gray-900 dark:text-white">{row.trackingCode || '—'}</p>
                        {row.providerTrackingCode && <p className="text-[11px] text-gray-500">{row.providerTrackingCode}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-black text-gray-900 dark:text-white">{row.clientName || 'Cliente'}</p>
                        <p className="text-[11px] text-gray-500">{row.clientEmail || ''}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-gray-900 dark:text-white">{displayAdminCarrierName(row.carrierName)}</td>
                      <td className="px-4 py-3 min-w-[220px] text-gray-700 dark:text-slate-300">{row.serviceName || 'Servicio estándar'}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">{row.statusLabel || 'Creado'}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-1 rounded-lg text-xs font-black ${row.paymentStatus === 'Pagado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.paymentStatus || 'Pendiente'}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-gray-900 dark:text-white">{money(row.providerCost, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-gray-900 dark:text-white">{money(row.clientPrice, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-purple-700 font-black">{money(row.discountAmount, row.currency)} {Number(row.discountPercent || 0) > 0 ? <span className="text-[11px]">({row.discountPercent}%)</span> : null}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-gray-900 dark:text-white">{money(row.paidNet, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-emerald-600">{money(row.expectedProfit, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-emerald-700">{money(row.actualProfit, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-black text-rose-600">{money(row.lossAmount, row.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-slate-300">{[row.sender?.country, row.sender?.city, row.sender?.zip].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-slate-300">{[row.recipient?.country, row.recipient?.city, row.recipient?.zip].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 uppercase font-bold">{row.providerCode || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={17} className="px-6 py-12 text-center text-gray-500">No hay datos para mostrar.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-dark-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500 font-bold">Página {pagination.page || page} de {pagination.totalPages || 1}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-dark-600 text-sm font-black disabled:opacity-40">Anterior</button>
                <button onClick={() => setPage((p) => Math.min(Number(pagination.totalPages || 1), p + 1))} disabled={page >= Number(pagination.totalPages || 1)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-dark-600 text-sm font-black disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const AdminLabelCron = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminLabelCronStatus();
      setStatus(res);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const copyCommand = async () => {
    const command = status?.curlCommand || '';
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      alert('Comando copiado correctamente.');
    } catch {
      alert(command);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.runAdminLabelCron(10);
      alert(`Preparación ejecutada. Procesados: ${res.processed || 0}`);
      await loadStatus();
    } catch {
      alert('No se pudo completar la operación.');
    } finally {
      setRunning(false);
    }
  };

  const summary = status?.summary || {};

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em] mb-3">
            <RefreshCw className="w-4 h-4" /> Automatización
          </p>
          <h1 className="text-3xl md:text-4xl font-black">Etiquetas y preparación automática</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            Este panel mantiene en cola los envíos recibidos y prepara la etiqueta cuando la red logística vuelve a estar disponible.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadStatus} disabled={loading} className="px-5 py-3 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:border-blue-300 dark:hover:border-neon-cyan disabled:opacity-60">
            Actualizar
          </button>
          <button onClick={runNow} disabled={running} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-60">
            <PlayCircle className="w-5 h-5" /> {running ? 'Procesando...' : 'Ejecutar ahora'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          ['Pendientes', summary.pending || 0],
          ['Listas', summary.ready || 0],
          ['En preparación', summary.waitingProvider || 0],
          ['Esperando etiqueta', summary.waitingLabel || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-3xl font-black mt-2">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-black">Comando para aaPanel</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Recomendado: cada 5 minutos.</p>
          </div>
          <button onClick={copyCommand} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm">
            <Clipboard className="w-4 h-4" /> Copiar comando
          </button>
        </div>
        <pre className="overflow-x-auto rounded-2xl bg-slate-950 text-slate-100 p-4 text-xs font-mono whitespace-pre-wrap">{status?.curlCommand || 'Cargando comando...'}</pre>
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-black">Últimos procesos</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-500">Cargando información...</div>
        ) : !status?.jobs?.length ? (
          <div className="p-12 text-center text-slate-500">No hay registros todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-dark-900/60 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-4">Tracking</th>
                  <th className="p-4">Proceso</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Intentos</th>
                  <th className="p-4">Mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {status.jobs.map((job: any) => (
                  <tr key={job.id}>
                    <td className="p-4 font-mono font-bold text-blue-600 dark:text-neon-cyan">{job.trackingCode || job.shipmentId}</td>
                    <td className="p-4 text-sm font-bold">{job.jobType === 'label_fetch' ? 'Etiqueta' : 'Preparación'}</td>
                    <td className="p-4"><span className="rounded-full bg-slate-100 dark:bg-dark-900 px-3 py-1 text-xs font-black">{job.status}</span></td>
                    <td className="p-4 text-sm font-bold">{job.attempts || 0}</td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{job.message || 'En curso'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


const AdminStatusCron = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try { setStatus(await api.getAdminStatusCronStatus()); }
    catch { setStatus(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadStatus(); }, []);

  const copyCommand = async () => {
    const command = status?.curlCommand || '';
    if (!command) return;
    try { await navigator.clipboard.writeText(command); alert('Comando copiado correctamente.'); }
    catch { alert(command); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.runAdminStatusCron(25);
      alert(`Estados actualizados. Procesados: ${res.processed || 0}`);
      await loadStatus();
    } catch { alert('No se pudo completar la operación.'); }
    finally { setRunning(false); }
  };

  const summary = status?.summary || {};
  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-neon-cyan/10 text-cyan-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em] mb-3">
            <Activity className="w-4 h-4" /> Seguimiento
          </p>
          <h1 className="text-3xl md:text-4xl font-black">Estados de envío automáticos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            Consulta Genei y ParcelABC por la vía oficial, actualiza el estado público del envío y envía notificaciones al cliente cuando hay cambios.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadStatus} disabled={loading} className="px-5 py-3 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:border-blue-300 dark:hover:border-neon-cyan disabled:opacity-60">Actualizar</button>
          <button onClick={runNow} disabled={running} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm disabled:opacity-60">
            <PlayCircle className="w-5 h-5" /> {running ? 'Procesando...' : 'Ejecutar ahora'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {[
          ['Activos', summary.active || 0],
          ['En tránsito', summary.inTransit || 0],
          ['En reparto', summary.outForDelivery || 0],
          ['Entregados', summary.delivered || 0],
          ['Incidencias', summary.issues || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-3xl font-black mt-2">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-black">Comando para aaPanel</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Recomendado: cada 15 minutos. No crea envíos ni descuenta saldo.</p>
          </div>
          <button onClick={copyCommand} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm">
            <Clipboard className="w-4 h-4" /> Copiar comando
          </button>
        </div>
        <pre className="overflow-x-auto rounded-2xl bg-slate-950 text-slate-100 p-4 text-xs font-mono whitespace-pre-wrap">{status?.curlCommand || 'Cargando comando...'}</pre>
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-black">Últimos cambios detectados</h2>
          <Link to="/admin/settings/email/logs" className="text-sm font-black text-blue-600 dark:text-neon-cyan">Ver emails</Link>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500">Cargando información...</div> : !status?.recent?.length ? <div className="p-12 text-center text-slate-500">No hay registros todavía.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-dark-900/60 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="p-4">Tracking</th><th className="p-4">Estado</th><th className="p-4">Proveedor</th><th className="p-4">Fecha</th><th className="p-4">Detalle</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{status.recent.map((ev: any) => <tr key={ev.id}><td className="p-4 font-mono font-bold text-blue-600 dark:text-neon-cyan">{ev.trackingCode || ev.shipmentId}</td><td className="p-4"><span className="rounded-full bg-slate-100 dark:bg-dark-900 px-3 py-1 text-xs font-black">{ev.statusLabel}</span></td><td className="p-4 text-sm font-bold uppercase">{ev.providerCode || 'DoorDrop'}</td><td className="p-4 text-xs text-slate-500">{ev.eventTime ? new Date(ev.eventTime).toLocaleString() : ''}</td><td className="p-4 text-sm text-slate-500 dark:text-slate-400">{ev.description}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
};

const AdminEmailLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [language, setLanguage] = useState('es');

  const loadLogs = async () => {
    setLoading(true);
    try { const res = await api.getAdminEmailLogs(); setLogs(res.logs || []); }
    catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadLogs(); }, []);

  const sendTest = async () => {
    if (!testTo) return alert('Ingresa un correo para probar.');
    setTesting(true);
    try {
      const res = await api.sendAdminTestEmail({ to: testTo, language });
      alert(res.success ? 'Correo de prueba enviado.' : 'No se pudo enviar el correo de prueba.');
      await loadLogs();
    } catch { alert('No se pudo completar la operación.'); }
    finally { setTesting(false); }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em] mb-3">
            <Mail className="w-4 h-4" /> Email
          </p>
          <h1 className="text-3xl md:text-4xl font-black">Emails y notificaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">Revisa los emails enviados por idioma del cliente y prueba la integración de Brevo con el logo de la marca.</p>
        </div>
        <button onClick={loadLogs} disabled={loading} className="px-5 py-3 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-bold text-sm hover:border-blue-300 dark:hover:border-neon-cyan disabled:opacity-60">Actualizar</button>
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm mb-8">
        <h2 className="text-xl font-black mb-4">Enviar prueba</h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3">
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="correo@cliente.com" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 outline-none font-bold" />
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 outline-none font-bold">
            <option value="es">Español</option><option value="en">English</option><option value="it">Italiano</option><option value="fr">Français</option>
          </select>
          <button onClick={sendTest} disabled={testing} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-60"><Send className="w-4 h-4" /> {testing ? 'Enviando...' : 'Enviar prueba'}</button>
        </div>
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h2 className="text-xl font-black">Últimos emails</h2></div>
        {loading ? <div className="p-12 text-center text-slate-500">Cargando información...</div> : !logs.length ? <div className="p-12 text-center text-slate-500">No hay registros todavía.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-dark-900/60 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="p-4">Tracking</th><th className="p-4">Destino</th><th className="p-4">Idioma</th><th className="p-4">Estado</th><th className="p-4">Asunto</th><th className="p-4">Fecha</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{logs.map((log: any) => <tr key={log.id}><td className="p-4 font-mono font-bold text-blue-600 dark:text-neon-cyan">{log.trackingCode || log.shipmentId || '-'}</td><td className="p-4 text-sm font-bold">{log.toEmail}</td><td className="p-4"><span className="rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan px-3 py-1 text-xs font-black uppercase">{log.language}</span></td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${log.status === 'sent' ? 'bg-green-100 text-green-700' : log.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{log.status}</span>{log.errorMessage && <p className="text-xs text-red-500 mt-1">{log.errorMessage}</p>}</td><td className="p-4 text-sm text-slate-600 dark:text-slate-300">{log.subject}</td><td className="p-4 text-xs text-slate-500">{log.sentAt ? new Date(log.sentAt).toLocaleString() : new Date(log.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
};


const AdminIntegrations = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminEcartStatus();
      setStatus(res);
    } catch {
      setNotice('No se pudo cargar la integración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const copyRedirect = async () => {
    const value = status?.redirectUrl || 'https://doordrop.lat/api/integrations/ecartapi/callback';
    try {
      await navigator.clipboard.writeText(value);
      setNotice('URL copiada correctamente.');
    } catch {
      alert(value);
    }
  };

  const testIntegration = async () => {
    setBusy(true);
    try {
      const res = await api.testAdminEcart();
      setNotice(res.message || 'Integración revisada correctamente.');
      await loadStatus();
    } catch {
      setNotice('No se pudo validar la integración.');
    } finally {
      setBusy(false);
    }
  };

  const cards = [
    { label: 'Tiendas conectadas', value: status?.connectedStores || 0, icon: Store, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Pedidos importados', value: status?.orders || 0, icon: Package, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Direcciones por revisar', value: status?.addressAlerts || 0, icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Envíos creados', value: status?.shipments || 0, icon: Truck, tone: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Ecommerce</p>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mt-2">Integraciones de tiendas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            Controla la conexión de tiendas, pedidos importados y alertas de direcciones antes de generar etiquetas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadStatus} className="px-4 py-3 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button onClick={testIntegration} disabled={busy} className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:bg-slate-300 flex items-center gap-2">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Revisar integración
          </button>
        </div>
      </div>

      {notice && <div className="rounded-2xl bg-blue-50 border border-blue-100 text-blue-800 p-4 text-sm font-bold">{notice}</div>}

      {loading ? (
        <div className="rounded-3xl bg-white dark:bg-dark-950 border border-slate-100 dark:border-slate-800 p-12 text-center text-slate-500">Cargando integración...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="bg-white dark:bg-dark-950 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tone}`}><Icon className="w-5 h-5" /></div>
                <p className="text-3xl font-black text-slate-900 dark:text-white mt-4">{value}</p>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-dark-950 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-lg"><Plug className="w-7 h-7" /></div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Ecart API</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${status?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status?.enabled ? 'Integración activa' : 'Integración pausada'}</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    Permite conectar Shopify, WooCommerce, PrestaShop, Wix, Mercado Libre, Amazon, eBay y otros canales desde un flujo unificado.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="rounded-2xl bg-slate-50 dark:bg-dark-900 p-4 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">App ID</p>
                  <p className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100">{status?.appIdMasked || 'Pendiente'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-dark-900 p-4 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Versión recomendada</p>
                  <p className="mt-2 font-black text-slate-900 dark:text-slate-100">{String(status?.apiVersion || 'v2').toUpperCase()} unificada</p>
                </div>
                <div className="md:col-span-2 rounded-2xl bg-slate-50 dark:bg-dark-900 p-4 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">URL de redirección</p>
                  <div className="mt-2 flex flex-col md:flex-row gap-3">
                    <input readOnly value={status?.redirectUrl || 'https://doordrop.lat/api/integrations/ecartapi/callback'} className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-dark-950 border border-slate-200 dark:border-slate-800 font-mono text-sm text-slate-900 dark:text-slate-100" />
                    <button onClick={copyRedirect} className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center gap-2"><Link2 className="w-4 h-4" /> Copiar</button>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900 font-semibold">
                Para producción, esta URL debe estar configurada en el dashboard de Ecart. La conexión de tiendas es gratuita para el cliente; DoorDrop monetiza la generación de etiquetas y la gestión logística.
              </div>
            </div>

            <div className="bg-white dark:bg-dark-950 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">Flujo para el cliente</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Texto comercial recomendado para soporte y ventas.</p>
              <div className="space-y-3">
                {[
                  'Conecta tu tienda desde el panel.',
                  'Sincroniza pedidos recientes.',
                  'Corrige direcciones marcadas.',
                  'Crea el envío y genera la etiqueta.',
                  'DoorDrop devuelve tracking a la tienda.'
                ].map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 dark:bg-dark-900 p-3 border border-slate-100 dark:border-slate-800">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">{index + 1}</div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{item}</p>
                  </div>
                ))}
              </div>
              <a href="/panel/stores" className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-50 text-blue-700 font-black hover:bg-blue-100"><ExternalLink className="w-4 h-4" /> Ver pantalla cliente</a>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-950 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">Registros recientes</h2>
            {status?.logs?.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {status.logs.map((log: any) => (
                  <div key={log.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">{log.message || 'Registro actualizado'}</p>
                      <p className="text-xs text-slate-500">{log.action} · {new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`self-start md:self-auto px-3 py-1 rounded-full text-xs font-black ${log.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{log.status === 'ok' ? 'Correcto' : 'Revisar'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No hay registros todavía.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};



const AdminBankWallet = () => {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('pending');
  const [adjustForm, setAdjustForm] = useState({ clientId: '', mode: 'credit', amount: '', currency: 'USD', note: '' });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [banksRes, receiptsRes, clientsRes] = await Promise.all([
        api.getAdminBankAccounts(),
        api.getAdminPaymentReceipts(status),
        api.getAdminClients()
      ]);
      setAccounts(banksRes.accounts || []);
      setReceipts(receiptsRes.receipts || []);
      setClients(clientsRes.clients || []);
    } catch {
      setNotice(t('noData'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [status]);

  const updateAccount = (idx: number, patch: any) => {
    setAccounts(prev => prev.map((acc, i) => i === idx ? { ...acc, ...patch } : acc));
  };

  const saveAccount = async (account: any) => {
    setSaving(true);
    setNotice('');
    try {
      const payload = {
        id: account.id,
        code: account.code,
        currency: account.currency,
        countryCode: account.countryCode,
        accountHolder: account.accountHolder,
        bankName: account.bankName,
        bankAddress: account.bankAddress,
        details: typeof account.details === 'string' ? JSON.parse(account.details || '{}') : (account.details || {}),
        instructions: typeof account.instructions === 'string' ? JSON.parse(account.instructions || '{}') : (account.instructions || {}),
        isActive: account.isActive,
        sortOrder: account.sortOrder || 0
      };
      await api.saveAdminBankAccount(payload);
      setNotice(t('bank_save'));
      await loadAll();
    } catch {
      setNotice(t('noData'));
    } finally {
      setSaving(false);
    }
  };

  const reviewReceipt = async (receipt: any, action: 'approve' | 'reject') => {
    setSaving(true);
    setNotice('');
    try {
      if (action === 'approve') await api.approveAdminPaymentReceipt(receipt.id, { adminNote: 'Revisión completada' });
      else await api.rejectAdminPaymentReceipt(receipt.id, { adminNote: 'Revisión solicitada' });
      setNotice(action === 'approve' ? t('bank_receipt_approved') : t('bank_receipt_rejected'));
      await loadAll();
    } catch {
      setNotice(t('noData'));
    } finally {
      setSaving(false);
    }
  };

  const applyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustForm.clientId) return;
    setSaving(true);
    setNotice('');
    try {
      await api.adminAdjustClientBalance(adjustForm.clientId, {
        mode: adjustForm.mode,
        amount: Number(adjustForm.amount || 0),
        currency: adjustForm.currency,
        note: adjustForm.note
      });
      setNotice(t('bank_update_balance'));
      setAdjustForm(prev => ({ ...prev, amount: '', note: '' }));
      await loadAll();
    } catch {
      setNotice(t('noData'));
    } finally {
      setSaving(false);
    }
  };

  const selectedClient = clients.find((c: any) => c.id === adjustForm.clientId);

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-full bg-slate-50 dark:bg-dark-900 text-slate-900 dark:text-white">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em] mb-3">
            <CreditCard className="w-4 h-4" /> {t('bank_admin_nav')}
          </p>
          <h1 className="text-3xl md:text-4xl font-black">{t('bank_admin_title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">{t('bank_admin_subtitle')}</p>
        </div>
        <button onClick={loadAll} disabled={loading} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-black text-sm hover:border-blue-300 dark:hover:border-neon-cyan disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('search')}
        </button>
      </div>

      {notice && <div className="mb-6 rounded-2xl bg-blue-50 dark:bg-neon-cyan/10 border border-blue-100 dark:border-neon-cyan/20 text-blue-800 dark:text-neon-cyan px-4 py-3 font-bold text-sm">{notice}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-6 mb-8">
        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">{t('bank_accounts')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">EUR, GBP, USD y DOP.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {accounts.map((account, idx) => (
              <div key={account.id} className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black">{account.currency}</span>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                      <input type="checkbox" checked={Boolean(account.isActive)} onChange={(e) => updateAccount(idx, { isActive: e.target.checked })} /> {t('bank_active')}
                    </label>
                  </div>
                  <input value={account.accountHolder || ''} onChange={(e) => updateAccount(idx, { accountHolder: e.target.value })} placeholder={t('bank_account_holder')} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none" />
                  <input value={account.bankName || ''} onChange={(e) => updateAccount(idx, { bankName: e.target.value })} placeholder={t('bank_name')} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none" />
                  <textarea value={account.bankAddress || ''} onChange={(e) => updateAccount(idx, { bankAddress: e.target.value })} rows={2} placeholder="Dirección" className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm outline-none" />
                </div>
                <div className="space-y-3">
                  <textarea value={typeof account.details === 'string' ? account.details : JSON.stringify(account.details || {}, null, 2)} onChange={(e) => updateAccount(idx, { details: e.target.value })} rows={5} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-mono text-xs outline-none" />
                  <button onClick={() => saveAccount(account)} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-60">
                    <Save className="w-4 h-4" /> {t('bank_save')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm p-6">
          <h2 className="text-xl font-black mb-2">{t('bank_client_adjustment')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('bank_admin_subtitle')}</p>
          <form onSubmit={applyAdjustment} className="space-y-4">
            <select value={adjustForm.clientId} onChange={(e) => setAdjustForm({ ...adjustForm, clientId: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none">
              <option value="">{t('bank_customer')}</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.email} — {c.currency || 'USD'} {Number(c.balance || 0).toFixed(2)}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={adjustForm.mode} onChange={(e) => setAdjustForm({ ...adjustForm, mode: e.target.value })} className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none">
                <option value="credit">{t('bank_credit')}</option>
                <option value="debit">{t('bank_debit')}</option>
                <option value="set">{t('bank_set_balance')}</option>
              </select>
              <select value={adjustForm.currency} onChange={(e) => setAdjustForm({ ...adjustForm, currency: e.target.value })} className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none">
                {['USD','EUR','GBP','DOP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input type="number" min="0" step="0.01" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} placeholder={t('bank_transfer_amount')} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none" />
            <textarea value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} rows={3} placeholder={t('bank_note')} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-sm outline-none" />
            {selectedClient && <p className="text-xs text-slate-500">{t('bank_current_balance')}: <span className="font-black">{format(Number(selectedClient.balance || 0), selectedClient.currency || adjustForm.currency)}</span></p>}
            <button disabled={saving || !adjustForm.clientId} className="w-full px-5 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black disabled:opacity-60">{t('bank_update_balance')}</button>
          </form>
        </div>
      </div>

      <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{t('bank_payment_receipts')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('bank_wallet_subtitle')}</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-slate-700 font-bold outline-none">
            <option value="pending">{t('bank_receipt_pending')}</option>
            <option value="approved">{t('bank_receipt_approved')}</option>
            <option value="rejected">{t('bank_receipt_rejected')}</option>
            <option value="all">Todos</option>
          </select>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500">{t('searching')}</div> : !receipts.length ? <div className="p-12 text-center text-slate-500">{t('noRecords')}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-dark-900/60 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="p-4">{t('bank_customer')}</th><th className="p-4">{t('bank_name')}</th><th className="p-4">{t('bank_transfer_amount')}</th><th className="p-4">{t('bank_receipt_file')}</th><th className="p-4">{t('bank_action')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receipts.map((r: any) => <tr key={r.id}>
                  <td className="p-4"><div className="font-black text-sm">{r.userName || r.userEmail}</div><div className="text-xs text-slate-500">{r.userEmail}</div></td>
                  <td className="p-4 text-sm"><div className="font-bold">{r.bankName}</div><div className="text-xs text-slate-500">{r.referenceNumber || '-'}</div></td>
                  <td className="p-4 font-black">{format(Number(r.amount || 0), r.currency)}</td>
                  <td className="p-4">{r.receiptFileUrl ? <a href={r.receiptFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-neon-cyan font-black text-xs"><ExternalLink className="w-4 h-4" /> {t('bank_receipt_file')}</a> : '-'}</td>
                  <td className="p-4">
                    {r.status === 'pending' ? <div className="flex flex-wrap gap-2"><button onClick={() => reviewReceipt(r, 'approve')} disabled={saving} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs"><CheckCircle2 className="w-4 h-4" /> {t('bank_approve')}</button><button onClick={() => reviewReceipt(r, 'reject')} disabled={saving} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 font-black text-xs"><XCircle className="w-4 h-4" /> {t('bank_reject')}</button></div> : <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-dark-900 text-xs font-black">{r.status}</span>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const paymentTexts: any = {
  es: {
    badge: 'PASARELA DE PAGO', health: 'Salud', history: 'Historial', settings: 'Configuración', plans: 'Planes', save: 'Guardar configuración', saved: 'Configuración guardada.', unavailable: 'No se pudo completar la operación.', active: 'Activo', inactive: 'Inactivo', configured: 'Configurado', pending: 'Pendiente', environment: 'Ambiente', sandbox: 'Sandbox / Pruebas', production: 'Producción / Live', webhookUrl: 'URL del webhook', copy: 'Copiar URL', createWebhook: 'Crear webhook', syncPlans: 'Sincronizar planes', refresh: 'Actualizar', globalEnabled: 'Método activo para clientes', walletInfo: 'Wallet se administra en Bancos y Wallet. Polar y PayPal se administran aquí.', noHistory: 'No hay eventos todavía.', lastEvents: 'Últimos eventos recibidos', statusOk: 'Listo para operar', statusPending: 'Falta configuración', planEnabled: 'Habilitado', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: 'Secret privado', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: 'Configura Polar con credenciales, webhook, sincronización de planes, historial y salud.', subtitlePaypal: 'Configura PayPal y tarjeta con credenciales, webhook, sincronización de planes, historial y salud.'
  },
  en: {
    badge: 'PAYMENT GATEWAY', health: 'Health', history: 'History', settings: 'Settings', plans: 'Plans', save: 'Save settings', saved: 'Settings saved.', unavailable: 'The operation could not be completed.', active: 'Active', inactive: 'Inactive', configured: 'Configured', pending: 'Pending', environment: 'Environment', sandbox: 'Sandbox / Test', production: 'Production / Live', webhookUrl: 'Webhook URL', copy: 'Copy URL', createWebhook: 'Create webhook', syncPlans: 'Sync plans', refresh: 'Refresh', globalEnabled: 'Payment method active for customers', walletInfo: 'Wallet is managed in Banks & Wallet. Polar and PayPal are managed here.', noHistory: 'No events yet.', lastEvents: 'Latest received events', statusOk: 'Ready to operate', statusPending: 'Configuration required', planEnabled: 'Enabled', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: 'Private secret', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: 'Configure Polar credentials, webhook, plan sync, history and health.', subtitlePaypal: 'Configure PayPal and card payments with credentials, webhook, plan sync, history and health.'
  },
  it: {
    badge: 'PAGAMENTI', health: 'Salute', history: 'Storico', settings: 'Impostazioni', plans: 'Piani', save: 'Salva configurazione', saved: 'Configurazione salvata.', unavailable: 'Non è stato possibile completare l’operazione.', active: 'Attivo', inactive: 'Inattivo', configured: 'Configurato', pending: 'In attesa', environment: 'Ambiente', sandbox: 'Sandbox / Test', production: 'Produzione / Live', webhookUrl: 'URL webhook', copy: 'Copia URL', createWebhook: 'Crea webhook', syncPlans: 'Sincronizza piani', refresh: 'Aggiorna', globalEnabled: 'Metodo attivo per i clienti', walletInfo: 'Il wallet si gestisce in Banche e Wallet. Polar e PayPal si gestiscono qui.', noHistory: 'Nessun evento ancora.', lastEvents: 'Ultimi eventi ricevuti', statusOk: 'Pronto a operare', statusPending: 'Configurazione richiesta', planEnabled: 'Abilitato', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: 'Secret privato', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: 'Configura Polar con credenziali, webhook, sincronizzazione piani, storico e salute.', subtitlePaypal: 'Configura PayPal e carta con credenziali, webhook, sincronizzazione piani, storico e salute.'
  },
  fr: {
    badge: 'PAIEMENTS', health: 'Santé', history: 'Historique', settings: 'Paramètres', plans: 'Plans', save: 'Enregistrer', saved: 'Configuration enregistrée.', unavailable: 'L’opération n’a pas pu être finalisée.', active: 'Actif', inactive: 'Inactif', configured: 'Configuré', pending: 'En attente', environment: 'Environnement', sandbox: 'Sandbox / Test', production: 'Production / Live', webhookUrl: 'URL webhook', copy: 'Copier URL', createWebhook: 'Créer webhook', syncPlans: 'Synchroniser plans', refresh: 'Actualiser', globalEnabled: 'Méthode active pour les clients', walletInfo: 'Le wallet se gère dans Banques et Wallet. Polar et PayPal se gèrent ici.', noHistory: 'Aucun événement pour le moment.', lastEvents: 'Derniers événements reçus', statusOk: 'Prêt à opérer', statusPending: 'Configuration requise', planEnabled: 'Activé', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: 'Secret privé', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: 'Configurez Polar avec identifiants, webhook, synchronisation des plans, historique et santé.', subtitlePaypal: 'Configurez PayPal et carte avec identifiants, webhook, synchronisation des plans, historique et santé.'
  },
  de: {
    badge: 'ZAHLUNGEN', health: 'Status', history: 'Verlauf', settings: 'Einstellungen', plans: 'Pläne', save: 'Einstellungen speichern', saved: 'Einstellungen gespeichert.', unavailable: 'Der Vorgang konnte nicht abgeschlossen werden.', active: 'Aktiv', inactive: 'Inaktiv', configured: 'Konfiguriert', pending: 'Ausstehend', environment: 'Umgebung', sandbox: 'Sandbox / Test', production: 'Produktion / Live', webhookUrl: 'Webhook-URL', copy: 'URL kopieren', createWebhook: 'Webhook erstellen', syncPlans: 'Pläne synchronisieren', refresh: 'Aktualisieren', globalEnabled: 'Zahlungsart für Kunden aktiv', walletInfo: 'Wallet wird unter Banken und Wallet verwaltet. Polar und PayPal werden hier verwaltet.', noHistory: 'Noch keine Ereignisse.', lastEvents: 'Letzte Ereignisse', statusOk: 'Betriebsbereit', statusPending: 'Konfiguration erforderlich', planEnabled: 'Aktiviert', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: 'Privates Secret', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: 'Konfiguriere Polar mit Zugangsdaten, Webhook, Plan-Synchronisierung, Verlauf und Status.', subtitlePaypal: 'Konfiguriere PayPal und Karte mit Zugangsdaten, Webhook, Plan-Synchronisierung, Verlauf und Status.'
  },
  zh: {
    badge: '支付网关', health: '健康状态', history: '历史记录', settings: '设置', plans: '套餐', save: '保存设置', saved: '设置已保存。', unavailable: '无法完成操作。', active: '已启用', inactive: '未启用', configured: '已配置', pending: '待配置', environment: '环境', sandbox: '沙盒 / 测试', production: '生产 / Live', webhookUrl: 'Webhook URL', copy: '复制 URL', createWebhook: '创建 webhook', syncPlans: '同步套餐', refresh: '刷新', globalEnabled: '向客户启用此支付方式', walletInfo: 'Wallet 在银行与钱包中管理。Polar 和 PayPal 在此管理。', noHistory: '暂无事件。', lastEvents: '最近收到的事件', statusOk: '可以使用', statusPending: '需要配置', planEnabled: '启用', productId: 'Product ID', priceId: 'Price ID', planId: 'Plan ID', clientId: 'Client ID', secret: '私密 Secret', token: 'Access token', webhookSecret: 'Webhook signing secret', subtitlePolar: '配置 Polar 凭据、webhook、套餐同步、历史与健康状态。', subtitlePaypal: '配置 PayPal 和银行卡支付、webhook、套餐同步、历史与健康状态。'
  }
};

const AdminPaymentIntegration = ({ provider }: { provider: 'polar' | 'paypal' }) => {
  const { language } = useI18n();
  const copy = paymentTexts[language] || paymentTexts.es;
  const isPolar = provider === 'polar';
  const title = isPolar ? 'Polar' : 'PayPal';
  const accent = isPolar ? 'violet' : 'blue';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>({ settings: {}, status: {}, history: [], plans: [] });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getPaymentIntegration(provider);
      setData(res || { settings: {}, status: {}, history: [], plans: [] });
    } catch {
      setData({ settings: {}, status: {}, history: [], plans: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [provider]);

  const updateSettings = (patch: any) => setData((prev: any) => ({ ...prev, settings: { ...(prev.settings || {}), ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.savePaymentIntegration(provider, data.settings || {});
      setData((prev: any) => ({ ...prev, ...(res || {}) }));
      alert(copy.saved);
    } catch (e: any) {
      alert(e.message || copy.unavailable);
    } finally {
      setSaving(false);
    }
  };

  const createWebhook = async () => {
    setBusy(true);
    try {
      const res = isPolar ? await api.createPolarWebhook() : await api.createPayPalWebhook();
      alert(res.message || copy.saved);
      await load();
    } catch (e: any) {
      alert(e.message || copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const syncPlans = async () => {
    setBusy(true);
    try {
      const res = isPolar ? await api.syncPolarProducts() : await api.syncPayPalProducts();
      alert(res.message || copy.saved);
      await load();
    } catch (e: any) {
      alert(e.message || copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const savePlans = async (plans: any[]) => {
    setBusy(true);
    try {
      await api.updateAdminPlans(plans);
      await load();
    } catch (e: any) {
      alert(e.message || copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const updatePlan = (index: number, field: string, value: any) => {
    const plans = (data.plans || []).map((plan: any, i: number) => i === index ? { ...plan, [field]: value } : plan);
    setData((prev: any) => ({ ...prev, plans }));
  };

  const copyWebhook = async () => {
    const url = data.settings?.webhookUrl || data.status?.webhookUrl || `https://doordrop.lat/api/webhooks/${provider}`;
    try { await navigator.clipboard.writeText(url); alert(copy.saved); } catch { alert(url); }
  };

  const ready = Boolean(data.status?.configured || data.status?.credentialsReady);
  const webhookReady = Boolean(data.status?.webhookReady || data.settings?.webhookId || data.settings?.webhookSecret);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.22em] ${isPolar ? 'text-violet-600' : 'text-blue-600'} mb-2`}>{copy.badge}</p>
          <h1 className="text-3xl font-black text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-3xl">{isPolar ? copy.subtitlePolar : copy.subtitlePaypal}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={load} disabled={loading} className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 font-bold hover:bg-gray-50 flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{copy.refresh}</button>
          <button onClick={save} disabled={saving} className={`px-5 py-3 rounded-xl text-white font-bold flex items-center gap-2 ${isPolar ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-gray-300`}><Save className="w-4 h-4" />{saving ? '...' : copy.save}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">{copy.health}</p><p className={`text-2xl font-black mt-3 ${ready ? 'text-emerald-600' : 'text-amber-600'}`}>{ready ? copy.statusOk : copy.statusPending}</p><p className="text-sm text-gray-500 mt-2">{data.status?.message || (ready ? copy.configured : copy.pending)}</p></div>
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">Webhook</p><p className={`text-2xl font-black mt-3 ${webhookReady ? 'text-emerald-600' : 'text-amber-600'}`}>{webhookReady ? copy.configured : copy.pending}</p><p className="text-sm text-gray-500 mt-2">{data.settings?.webhookUrl || `https://doordrop.lat/api/webhooks/${provider}`}</p></div>
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm"><p className="text-xs font-black text-gray-500 uppercase tracking-wider">{copy.plans}</p><p className="text-2xl font-black mt-3 text-gray-900">{(data.plans || []).length}</p><p className="text-sm text-gray-500 mt-2">{copy.walletInfo}</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black text-gray-900">{copy.settings}</h2><p className="text-sm text-gray-500">{copy.globalEnabled}</p></div><input type="checkbox" checked={data.settings?.enabled !== false && data.settings?.enabled !== '0'} onChange={(e) => updateSettings({ enabled: e.target.checked })} className="w-5 h-5" /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.environment}</label><select value={data.settings?.environment || 'sandbox'} onChange={(e) => updateSettings({ environment: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-bold"><option value="sandbox">{copy.sandbox}</option><option value="production">{copy.production}</option></select></div>
          {isPolar ? <>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.token}</label><input type="password" value={data.settings?.apiToken || ''} onChange={(e) => updateSettings({ apiToken: e.target.value })} placeholder="polar_at_..." className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.webhookSecret}</label><input type="password" value={data.settings?.webhookSecret || ''} onChange={(e) => updateSettings({ webhookSecret: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm" /></div>
          </> : <>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.clientId}</label><input value={data.settings?.clientId || ''} onChange={(e) => updateSettings({ clientId: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.secret}</label><input type="password" value={data.settings?.clientSecret || ''} onChange={(e) => updateSettings({ clientSecret: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm" /></div>
          </>}
          <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">{copy.webhookUrl}</label><div className="flex flex-col sm:flex-row gap-3"><input readOnly value={data.settings?.webhookUrl || `https://doordrop.lat/api/webhooks/${provider}`} className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-xs" /><button onClick={copyWebhook} className="px-5 py-3 rounded-xl bg-gray-900 text-white font-bold">{copy.copy}</button></div></div>
          {!isPolar && <div><label className="block text-xs font-black text-gray-500 uppercase mb-2">Webhook ID</label><input value={data.settings?.webhookId || ''} onChange={(e) => updateSettings({ webhookId: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm" /></div>}
          <div className="flex flex-col md:flex-row gap-3 pt-2"><button onClick={createWebhook} disabled={busy} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-bold disabled:bg-gray-300">{copy.createWebhook}</button><button onClick={syncPlans} disabled={busy} className={`px-5 py-3 rounded-xl font-bold disabled:bg-gray-100 ${isPolar ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{copy.syncPlans}</button></div>
        </div>

        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-black text-gray-900">{copy.history}</h2><span className="text-xs font-black text-gray-500 uppercase">{copy.lastEvents}</span></div>
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {(data.history || []).length ? (data.history || []).map((item: any, idx: number) => (
              <div key={item.id || idx} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-black text-gray-900 text-sm truncate">{item.eventType || item.event_type || item.action || 'Evento'}</p><span className="text-[11px] font-black text-gray-500">{item.status || item.processedStatus || 'recibido'}</span></div>
                <p className="text-xs text-gray-500 mt-2">{item.createdAt || item.created_at || item.created || ''}</p>
              </div>
            )) : <div className="rounded-2xl bg-gray-50 p-8 text-center text-sm font-bold text-gray-500">{copy.noHistory}</div>}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6"><div><h2 className="text-xl font-black text-gray-900">{copy.plans}</h2><p className="text-sm text-gray-500">{isPolar ? copy.subtitlePolar : copy.subtitlePaypal}</p></div><button onClick={() => savePlans(data.plans || [])} disabled={busy} className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold disabled:bg-gray-300">{copy.save}</button></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data.plans || []).map((plan: any, i: number) => (
            <div key={plan.id || i} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3"><div><p className="font-black text-gray-900">{plan.name}</p><p className="text-xs text-gray-500">{Number(plan.price || 0).toFixed(2)} {plan.currency || 'EUR'}</p></div><label className="flex items-center gap-2 text-xs font-black text-gray-600"><input type="checkbox" checked={isPolar ? plan.polarEnabled !== false : plan.paypalEnabled !== false} onChange={(e) => updatePlan(i, isPolar ? 'polarEnabled' : 'paypalEnabled', e.target.checked)} />{copy.planEnabled}</label></div>
              {isPolar ? <>
                <input placeholder={copy.productId} value={plan.polarProductId || ''} onChange={(e) => updatePlan(i, 'polarProductId', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 font-mono text-xs" />
                <input placeholder={copy.priceId} value={plan.polarPriceId || ''} onChange={(e) => updatePlan(i, 'polarPriceId', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 font-mono text-xs" />
              </> : <>
                <input placeholder={copy.productId} value={plan.paypalProductId || ''} onChange={(e) => updatePlan(i, 'paypalProductId', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 font-mono text-xs" />
                <input placeholder={copy.planId} value={plan.paypalPlanId || ''} onChange={(e) => updatePlan(i, 'paypalPlanId', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 font-mono text-xs" />
              </>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AdminSettings = () => {
  const { t } = useI18n();
  const { refreshBrand } = useBrand();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    googleMaps: '',
    genei: '',
    parcelAbc: '',
    posteItaliane: '',
    paccoFacile: '',
    paypalClientId: '',
    paypalClientSecret: '',
    paypalEnvironment: 'sandbox',
    paypalWebhookId: '',
    paypalWebhookSecret: '',
    paypalWebhookUrl: '',
    paymentWalletEnabled: '1',
    paymentPolarEnabled: '1',
    paymentPaypalEnabled: '1',
    polarApiToken: '',
    polarProductId: '',
    polarWalletProductId: '',
    polarSubscriptionProductId: '',
    polarWebhookId: '',
    polarWebhookSecret: '',
    polarWebhookUrl: '',
    polarEnvironment: 'sandbox',
    freeCurrencyApiKey: '',
    ecartApiClientId: '',
    ecartClientSecret: '',
    ecartAppUrl: 'https://doordrop.lat',
    ecartRedirectUrl: 'https://doordrop.lat/api/integrations/ecartapi/callback',
  });
  const [brand, setBrand] = useState({
    ...DEFAULT_BRAND,
    logoDataUrl: '',
    faviconDataUrl: ''
  });
  const [aiSettings, setAiSettings] = useState<any>({
    enabled: true,
    model: 'gpt-5.4-mini',
    openaiApiKey: '',
    autoTicket: true,
    maxContextRecords: 20,
    instructions: ''
  });
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polarBusy, setPolarBusy] = useState(false);
  const [paypalBusy, setPaypalBusy] = useState(false);
  const [spedireInfo, setSpedireInfo] = useState<any>(null);
  const [spedireWallet, setSpedireWallet] = useState<any>(null);
  const [spedireWalletPage, setSpedireWalletPage] = useState(1);
  const [spedireLookup, setSpedireLookup] = useState('');
  const [spedireWebhookHistory, setSpedireWebhookHistory] = useState<any[]>([]);
  const [spedireBusy, setSpedireBusy] = useState(false);
  const polarWebhookUrl = apiKeys.polarWebhookUrl || 'https://doordrop.lat/api/webhooks/polar';
  const polarEnvironment = apiKeys.polarEnvironment || 'sandbox';
  const paypalWebhookUrl = apiKeys.paypalWebhookUrl || 'https://doordrop.lat/api/webhooks/paypal';
  const paypalEnvironment = apiKeys.paypalEnvironment || 'sandbox';

  useEffect(() => {
    api.getAdminSettings().then(res => {
      if (res.apiKeys) setApiKeys(res.apiKeys);
      if (res.brand) setBrand(prev => ({ ...prev, ...res.brand, logoDataUrl: '', faviconDataUrl: '' }));
      if (res.ai) setAiSettings((prev: any) => ({ ...prev, ...res.ai, openaiApiKey: '' }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadSpedireProIntegration = async (page = spedireWalletPage) => {
    setSpedireBusy(true);
    try {
      const [info, wallet, localWebhooks] = await Promise.all([
        api.getSpedireProIntegration(),
        api.getSpedireProWallet({ page }).catch(() => null),
        api.getSpedireProLocalWebhooks().catch(() => null)
      ]);
      setSpedireInfo({ ...info, localWebhooks: localWebhooks?.items || [] });
      if (wallet) setSpedireWallet(wallet);
    } catch {
      setSpedireInfo(null);
    } finally {
      setSpedireBusy(false);
    }
  };

  useEffect(() => {
    loadSpedireProIntegration(1);
  }, []);

  const handleCopySpedireWebhook = async () => {
    const value = spedireInfo?.webhookUrl || 'https://doordrop.lat/api/webhooks/spedirepro';
    try {
      await navigator.clipboard.writeText(value);
      alert('URL copiada correctamente.');
    } catch {
      alert(value);
    }
  };

  const handleSearchSpedireWebhookHistory = async () => {
    const value = spedireLookup.trim();
    if (!value) return;
    setSpedireBusy(true);
    try {
      const res = await api.getSpedireProWebhookHistory({ reference: value, tracker: value });
      setSpedireWebhookHistory(res.items || []);
    } catch {
      alert('No se pudo cargar el historial.');
    } finally {
      setSpedireBusy(false);
    }
  };

  const handleSpedireWalletPage = async (nextPage: number) => {
    const page = Math.max(1, nextPage);
    setSpedireWalletPage(page);
    setSpedireBusy(true);
    try {
      const wallet = await api.getSpedireProWallet({ page });
      setSpedireWallet(wallet);
    } catch {
      alert('No se pudieron cargar los movimientos.');
    } finally {
      setSpedireBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.updateAdminSettings({ apiKeys, brand, ai: aiSettings });
      if (res.brand) setBrand(prev => ({ ...prev, ...res.brand, logoDataUrl: '', faviconDataUrl: '' }));
      if (res.ai) setAiSettings((prev: any) => ({ ...prev, ...res.ai, openaiApiKey: '' }));
      await refreshBrand();
      alert('Configuración guardada correctamente.');
    } catch (e) {
      alert('No se pudo completar la operación.');
    }
    setSaving(false);
  };

  const handleChange = (name: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [name]: value }));
  };

  const handleBrandChange = (name: string, value: string) => {
    setBrand(prev => ({ ...prev, [name]: value }));
  };

  const handleBrandFile = (name: 'logoDataUrl' | 'faviconDataUrl', file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecciona una imagen válida.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('La imagen debe pesar menos de 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setBrand(prev => ({ ...prev, [name]: value }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddKey = () => {
    if (!newKeyName || !newKeyValue) return;
    setApiKeys(prev => ({ ...prev, [newKeyName]: newKeyValue }));
    setNewKeyName('');
    setNewKeyValue('');
  };

  const handleCopyPolarWebhook = async () => {
    try {
      await navigator.clipboard.writeText(polarWebhookUrl);
      alert('URL copiada correctamente.');
    } catch {
      alert(polarWebhookUrl);
    }
  };

  const handleCreatePolarWebhook = async () => {
    setPolarBusy(true);
    try {
      const res = await api.createPolarWebhook();
      setApiKeys(prev => ({
        ...prev,
        polarWebhookUrl: res.webhookUrl || polarWebhookUrl,
        polarWebhookId: res.webhook?.id || prev.polarWebhookId || ''
      }));
      alert(res.message || 'Webhook configurado correctamente.');
    } catch {
      alert('No se pudo crear automáticamente. Copia la URL y agrégala manualmente en Polar.');
    } finally {
      setPolarBusy(false);
    }
  };

  const handleSyncPolarPlans = async () => {
    setPolarBusy(true);
    try {
      const res = await api.syncPolarProducts();
      setApiKeys(prev => ({
        ...prev,
        polarWalletProductId: res.walletProductId || prev.polarWalletProductId || '',
        polarSubscriptionProductId: res.subscriptionProductId || prev.polarSubscriptionProductId || '',
        polarWebhookUrl
      }));
      alert(res.message || 'Planes publicados correctamente en Polar.');
    } catch {
      alert('No se pudieron publicar los planes en Polar.');
    } finally {
      setPolarBusy(false);
    }
  };



  const handleCopyPayPalWebhook = async () => {
    try {
      await navigator.clipboard.writeText(paypalWebhookUrl);
      alert('URL copiada correctamente.');
    } catch {
      alert(paypalWebhookUrl);
    }
  };

  const handleCreatePayPalWebhook = async () => {
    setPaypalBusy(true);
    try {
      const res = await api.createPayPalWebhook();
      setApiKeys(prev => ({
        ...prev,
        paypalWebhookUrl: res.webhookUrl || paypalWebhookUrl,
        paypalWebhookId: res.webhook?.id || prev.paypalWebhookId || ''
      }));
      alert(res.message || 'Webhook de PayPal configurado correctamente.');
    } catch (e: any) {
      alert(e.message || 'No se pudo crear automáticamente. Copia la URL y agrégala manualmente en PayPal.');
    } finally {
      setPaypalBusy(false);
    }
  };

  const handleSyncPayPalPlans = async () => {
    setPaypalBusy(true);
    try {
      const res = await api.syncPayPalProducts();
      alert(res.message || 'Planes sincronizados correctamente con PayPal.');
    } catch (e: any) {
      alert(e.message || 'No se pudieron sincronizar los planes con PayPal.');
    } finally {
      setPaypalBusy(false);
    }
  };

  const handleDeleteKey = (name: string) => {
    const copy = { ...apiKeys };
    delete copy[name];
    setApiKeys(copy);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <h1 className="text-3xl font-black text-gray-900">{t('settings') || 'Configuración'}</h1>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/settings/cron" className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg self-start sm:self-auto">
            <RefreshCw className="w-4 h-4" /> Etiquetas
          </Link>
          <Link to="/admin/settings/status" className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg self-start sm:self-auto">
            <Activity className="w-4 h-4" /> Estados
          </Link>
          <Link to="/admin/settings/email/logs" className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm self-start sm:self-auto">
            <Mail className="w-4 h-4" /> Emails
          </Link>
          <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg self-start sm:self-auto">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/40 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300 mb-2">{t('ai_admin_badge')}</p>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t('ai_admin_settings_title')}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-2xl">{t('ai_admin_settings_desc')}</p>
          </div>
          <div className={`px-4 py-2 rounded-full text-xs font-black ${aiSettings.hasKey ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
            {aiSettings.hasKey ? t('ai_admin_connected') : t('ai_admin_pending')}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-slate-800/60 px-4 py-3">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('ai_admin_enabled')}</span>
            <input
              type="checkbox"
              checked={aiSettings.enabled !== false}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, enabled: e.target.checked }))}
              className="w-5 h-5"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-slate-800/60 px-4 py-3">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('ai_admin_auto_ticket')}</span>
            <input
              type="checkbox"
              checked={aiSettings.autoTicket !== false}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, autoTicket: e.target.checked }))}
              className="w-5 h-5"
            />
          </label>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ai_admin_model')}</label>
            <input
              value={aiSettings.model || ''}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-5.4-mini"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ai_admin_context_limit')}</label>
            <input
              type="number"
              min={5}
              max={50}
              value={aiSettings.maxContextRecords || 20}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, maxContextRecords: Number(e.target.value || 20) }))}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ai_admin_openai_key')}</label>
            <input
              type="password"
              value={aiSettings.openaiApiKey || ''}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, openaiApiKey: e.target.value }))}
              placeholder={aiSettings.hasKey ? t('ai_admin_key_saved') : t('ai_admin_key_placeholder')}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-2">{t('ai_admin_key_help')}</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('ai_admin_instructions')}</label>
            <textarea
              rows={3}
              value={aiSettings.instructions || ''}
              onChange={(e) => setAiSettings((prev: any) => ({ ...prev, instructions: e.target.value }))}
              placeholder={t('ai_admin_instructions_placeholder')}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-violet-100 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600 mb-2">SpedirePro API</p>
            <h3 className="text-xl font-black text-gray-900 mb-2">Webhooks, saldo y seguimiento</h3>
            <p className="text-gray-500 text-sm max-w-2xl">Pega esta URL en SpedirePro para recibir creación de envío, actualizaciones y resultado de recogida. DoorDrop guardará el estado y buscará la etiqueta si todavía no está disponible.</p>
          </div>
          <button onClick={() => loadSpedireProIntegration(spedireWalletPage)} disabled={spedireBusy} className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-black flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${spedireBusy ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">URL para SpedirePro</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input readOnly value={spedireInfo?.webhookUrl || 'https://doordrop.lat/api/webhooks/spedirepro'} className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl font-mono text-sm text-slate-900" />
              <button onClick={handleCopySpedireWebhook} className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center gap-2"><Clipboard className="w-4 h-4" /> Copiar</button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Tracking público: {spedireInfo?.trackingBaseUrl || 'https://doordrop.lat/tracking?code='}</p>
          </div>
          <div className="bg-slate-900 text-white rounded-2xl p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Saldo proveedor</p>
            <p className="text-3xl font-black">{spedireInfo?.provider?.balance?.label || '—'}</p>
            <p className="text-xs text-slate-400 mt-2">{spedireInfo?.credentialsReady ? 'Conexión configurada' : 'Conexión pendiente'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {(spedireInfo?.events || []).map((ev: any) => (
            <div key={ev.code} className="border border-slate-100 rounded-2xl p-4 bg-white">
              <p className="font-black text-slate-900">{ev.title}</p>
              <p className="text-sm text-slate-500 mt-1">{ev.description}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-slate-900">Movimientos de saldo</p>
                <p className="text-xs text-slate-500">Historial desde SpedirePro</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleSpedireWalletPage(spedireWalletPage - 1)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-black">‹</button>
                <button onClick={() => handleSpedireWalletPage(spedireWalletPage + 1)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-black">›</button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="bg-white text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Concepto</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Saldo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(spedireWallet?.data || []).length ? (spedireWallet.data || []).map((row: any, idx: number) => (
                    <tr key={idx}><td className="p-3 text-xs text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td className="p-3 font-bold text-slate-700">{row.causal || row.order_reference || 'Movimiento'}</td><td className={`p-3 text-right font-black ${Number(row.amount || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{Number(row.amount || 0).toFixed(2)}</td><td className="p-3 text-right font-black text-slate-900">{Number(row.partial || 0).toFixed(2)}</td></tr>
                  )) : <tr><td colSpan={4} className="p-6 text-center text-slate-500 font-bold">No hay registros todavía.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-50">
              <p className="font-black text-slate-900">Historial de comunicaciones</p>
              <div className="flex gap-2 mt-3">
                <input value={spedireLookup} onChange={(e) => setSpedireLookup(e.target.value)} placeholder="Referencia o tracking" className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold" />
                <button onClick={handleSearchSpedireWebhookHistory} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white font-black">Buscar</button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="bg-white text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Destino</th><th className="p-3 text-left">Respuesta</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {spedireWebhookHistory.length ? spedireWebhookHistory.map((row: any, idx: number) => (
                    <tr key={row.uuid || idx}><td className="p-3 text-xs text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td className="p-3 text-xs font-mono text-slate-700 max-w-[220px] truncate">{row.destination || '—'}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{row.response_code || '—'}</span></td></tr>
                  )) : (spedireInfo?.localWebhooks || []).length ? spedireInfo.localWebhooks.map((row: any) => (
                    <tr key={row.id}><td className="p-3 text-xs text-slate-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td><td className="p-3 font-mono text-xs text-slate-700">{row.externalId}</td><td className="p-3"><span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-black">Recibido</span></td></tr>
                  )) : <tr><td colSpan={3} className="p-6 text-center text-slate-500 font-bold">No hay registros todavía.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Marca y presencia pública</h3>
            <p className="text-gray-500 text-sm max-w-2xl">
              Cambia el nombre, el logo, el favicon y la información que verán los clientes en la web, el panel y los resultados de búsqueda.
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 min-w-[260px]">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Vista previa</p>
            <div className="flex items-center gap-3">
              {(brand.logoDataUrl || brand.logoUrl) ? (
                <img src={brand.logoDataUrl || brand.logoUrl} alt={brand.siteName} className="w-12 h-12 object-contain rounded-xl bg-white border border-slate-100 p-1" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                  {(brand.shortName || brand.siteName || 'S').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-black text-slate-900">{brand.shortName || brand.siteName}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{brand.tagline}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre comercial</label>
            <input value={brand.siteName || ''} onChange={(e) => handleBrandChange('siteName', e.target.value)} placeholder="Nombre de la plataforma" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre corto</label>
            <input value={brand.shortName || ''} onChange={(e) => handleBrandChange('shortName', e.target.value)} placeholder="Nombre corto para el panel" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Frase principal</label>
            <input value={brand.tagline || ''} onChange={(e) => handleBrandChange('tagline', e.target.value)} placeholder="Frase comercial de la marca" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Logo</label>
            <input type="file" accept="image/*" onChange={(e) => handleBrandFile('logoDataUrl', e.target.files?.[0])} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900" />
            <input value={brand.logoUrl || ''} onChange={(e) => handleBrandChange('logoUrl', e.target.value)} placeholder="O pega una URL del logo" className="mt-3 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Favicon</label>
            <input type="file" accept="image/*,.ico" onChange={(e) => handleBrandFile('faviconDataUrl', e.target.files?.[0])} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900" />
            <input value={brand.faviconUrl || ''} onChange={(e) => handleBrandChange('faviconUrl', e.target.value)} placeholder="O pega una URL del favicon" className="mt-3 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Título para buscadores</label>
            <input value={brand.seoTitle || ''} onChange={(e) => handleBrandChange('seoTitle', e.target.value)} placeholder="Título público" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Color principal</label>
            <input type="color" value={brand.themeColor || '#2563eb'} onChange={(e) => handleBrandChange('themeColor', e.target.value)} className="w-full h-[46px] px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción para buscadores</label>
            <textarea value={brand.seoDescription || ''} onChange={(e) => handleBrandChange('seoDescription', e.target.value)} rows={3} placeholder="Descripción pública de la plataforma" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Palabras clave</label>
            <input value={brand.seoKeywords || ''} onChange={(e) => handleBrandChange('seoKeywords', e.target.value)} placeholder="envíos, logística, ecommerce" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Métodos de pago</h3>
            <p className="text-gray-500 text-sm max-w-2xl">Wallet, Polar y PayPal ahora tienen páginas dedicadas con configuración, historial y estado de conexión.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin/polar" className="px-5 py-3 bg-violet-50 text-violet-700 rounded-xl font-bold hover:bg-violet-100">Configurar Polar</Link>
            <Link to="/admin/paypal" className="px-5 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold hover:bg-blue-100">Configurar PayPal</Link>
            <Link to="/admin/banks" className="px-5 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold hover:bg-emerald-100">Bancos y wallet</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" /> Credenciales privadas
          </h3>
          <p className="text-gray-500 text-sm mb-6">Estas credenciales quedan protegidas para conectar tus proveedores y servicios externos.</p>
          
          {loading ? (
            <div className="text-gray-500">Cargando configuración...</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(apiKeys).filter(([key]) => !['paypalClientId','paypalClientSecret','paypalEnvironment','paypalWebhookId','paypalWebhookSecret','paypalWebhookUrl','paymentWalletEnabled','paymentPolarEnabled','paymentPaypalEnabled','polarApiToken','polarProductId','polarWalletProductId','polarSubscriptionProductId','polarWebhookId','polarWebhookSecret','polarWebhookUrl','polarEnvironment'].includes(key)).map(([key, value]) => (
                <div key={key} className="relative">
                  <label className="block text-sm font-bold text-gray-700 mb-2 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={value}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-mono text-sm"
                    />
                    {!['googleMaps', 'genei', 'parcelAbc', 'posteItaliane', 'paccoFacile', 'paypalClientId', 'paypalClientSecret', 'polarApiToken', 'polarProductId', 'polarEnvironment', 'freeCurrencyApiKey', 'ecartApiClientId', 'ecartClientSecret', 'ecartAppUrl', 'ecartRedirectUrl'].includes(key) && (
                      <button onClick={() => handleDeleteKey(key)} className="px-4 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-bold">
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              <div className="pt-6 border-t border-gray-100 mt-6">
                <h4 className="font-bold text-gray-900 mb-4">Agregar Nueva Dinámicamente</h4>
                <div className="flex flex-col gap-3">
                  <input 
                    type="text" 
                    placeholder="Nombre del Proveedor (ej: sendcloud)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-sm"
                  />
                  <input 
                    type="password" 
                    placeholder="Valor de la"
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-sm"
                  />
                  <button onClick={handleAddKey} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors">
                    + Agregar Integración
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      navigate('/auth/login', { replace: true, state: { from: location.pathname } });
      return;
    }

    api.getProfile()
      .then((res: any) => {
        const user = res.user;
        if (!user || user.role !== 'super_admin') {
          removeAuthToken();
          navigate('/auth/login', { replace: true });
          return;
        }

        setCurrentUser(user);
        setCheckingSession(false);
      })
      .catch(() => {
        removeAuthToken();
        navigate('/auth/login', { replace: true });
      });
  }, [navigate, location.pathname]);

  useEffect(() => {
    const applyTheme = () => {
      const stored = localStorage.getItem('theme') || 'system';
      const nextDark = stored === 'dark' || (stored === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      setIsDark(nextDark);
      document.documentElement.classList.toggle('dark', nextDark);
      document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', nextDark ? '#020617' : '#2563eb');
    };
    applyTheme();
    window.addEventListener('ship24go-theme-change', applyTheme);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', applyTheme);
    return () => {
      window.removeEventListener('ship24go-theme-change', applyTheme);
      media?.removeEventListener?.('change', applyTheme);
    };
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    window.dispatchEvent(new Event('ship24go-theme-change'));
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-bold">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-dark-900 font-sans transition-colors relative">
      {/* Mobile Top Header */}
      <div className="md:hidden h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-40 sticky top-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="text-slate-300 hover:text-white text-xl cursor-pointer"
          >
            <Menu />
          </button>
          <BrandMark dark iconClassName="w-8 h-8 rounded-lg" textClassName="text-base text-white" />
        </div>
        <button onClick={toggleTheme} className="w-9 h-9 rounded-full bg-white/10 text-slate-200 flex items-center justify-center">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
        <AdminSidebar 
          isMobileMenuOpen={isMobileMenuOpen} 
          toggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          currentUser={currentUser}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />
        <main className="flex-1 overflow-y-auto h-[calc(100vh-4rem)] md:h-screen bg-slate-50 dark:bg-dark-900 transition-colors">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/clients" element={<AdminClients />} />
            <Route path="/shipments" element={<AdminShipments />} />
            <Route path="/marketplace/*" element={<AdminMarketplace />} />
            <Route path="/omnichannel/*" element={<AdminOmnichannel />} />
            <Route path="/providers" element={<AdminProviders />} />
            <Route path="/docs" element={<AdminDocs />} />
            <Route path="/integraciones" element={<AdminIntegrations />} />
            <Route path="/polar" element={<AdminPaymentIntegration provider="polar" />} />
            <Route path="/paypal" element={<AdminPaymentIntegration provider="paypal" />} />
            <Route path="/plans" element={<AdminPlans />} />
            <Route path="/banks" element={<AdminBankWallet />} />
            <Route path="/reports" element={<AdminReports />} />
            <Route path="/settings" element={<AdminSettings />} />
            <Route path="/settings/cron" element={<AdminLabelCron />} />
            <Route path="/settings/status" element={<AdminStatusCron />} />
            <Route path="/settings/email/logs" element={<AdminEmailLogs />} />
            <Route path="/tickets" element={<AdminTickets />} />
            <Route path="/copilot" element={<AiCopilotChat />} />
            <Route path="*" element={<div className="p-4 md:p-8 text-slate-500 dark:text-slate-400">Módulo en preparación para el Super Admin</div>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
