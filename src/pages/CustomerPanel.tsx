import { OmnichannelApp } from './OmnichannelApp';
/* ship24go-cache-bust-1789141438 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Bot, MessageSquare, Users, LayoutDashboard, Package, Calculator, Store, Settings, LogOut, Plus, Search, Moon, Sun, Wallet, ChartPie, Plug, Box, Globe, ChevronDown, ChevronLeft, ChevronRight, Menu, X, CheckCircle, Check, Code, LifeBuoy, Sparkles, CreditCard, Crown, ShieldCheck, Trash2, Truck, ArrowLeft, User, MapPin, Pencil, Download, RotateCw, Clock, Eye, FileText, Info, Percent, ChevronUp, Filter } from 'lucide-react';
import { api, removeAuthToken, getAuthToken, setAuthToken } from '../lib/api';
import { loadGuestQuoteSession, clearGuestQuoteSession, guestSessionToPanelState } from '../lib/guestQuoteSession';
import { useI18n } from '../lib/i18n';
import { CountrySelect } from '../components/CountrySelect';
import { getCountryName as getCountryNameLib, WORLD_COUNTRIES, getCountryFlag } from '../lib/countries';
import { resolveCityFromPostal, resolveItalianCity, resolveCityForCountry } from '../lib/postalCity';
import { LanguageSelector } from '../components/LanguageSelector';
import { Stores } from './Stores';
import { ZipCodeAutocomplete } from '../components/ZipCodeAutocomplete';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { CustomerTickets } from '../components/CustomerTickets';
import { AiCopilotChat } from '../components/AiCopilotChat';
import { useCurrency } from '../lib/currency';
import { CameraMeasure } from '../components/CameraMeasure';
import { BrandMark } from '../lib/brand';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { ShippingTermsConsent } from '../components/ShippingTermsConsent';
import { GlobalTermsGate } from '../components/GlobalTermsGate';
import { APP_VERSION } from '../lib/appVersion';
import Tariffa from './Tariffa';
import { SellerPanel } from './SellerPanel';
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

const COUNTRIES = WORLD_COUNTRIES.map((c) => ({ code: c.code, name: c.nameEs, flag: c.flag, flagSm: c.flagSm }));

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

const getCountryName = (code: string) => {
  const key = String(code || 'OT').toUpperCase();
  return getCountryNameLib(key, 'es') || (key === 'OT' ? 'Otros' : key);
};


const SERVICE_FILTERS = [
  { key: 'all', label: 'Todas las opciones', icon: '🌟', hint: 'Ver todas las tarifas disponibles' },
  { key: 'door_to_door', label: 'Puerta a Puerta (Domicilio)', icon: '🚪➡️🚪', hint: 'Recogida en domicilio y entrega en domicilio' },
  { key: 'office_to_office', label: 'Oficina a Oficina (Punto a Punto)', icon: '🏪➡️🏪', hint: 'Entrega en oficina/locker y recogida en oficina/locker' },
  { key: 'office_to_door', label: 'Oficina a Domicilio', icon: '🏪➡️🚪', hint: 'Deposita en oficina y se entrega en domicilio' },
  { key: 'door_to_office', label: 'Domicilio a Oficina', icon: '🚪➡️🏪', hint: 'Recogida en domicilio y retiro en oficina/punto' },
  { key: 'fast', label: 'Express / 24-48h', icon: '⚡', hint: 'Menor tiempo de entrega' },
  { key: 'economy', label: 'Económico', icon: '💰', hint: 'Máximo ahorro en tarifa' },
];

// The server decides which connectors are active and connected. The client
// only uses this existing quote allow-list to request each result separately.
const PROGRESSIVE_QUOTE_PROVIDER_CODES = ['parcelabc', 'genei', 'paccofacile', 'spedirepro', 'spediamopro', 'easypost', 'logihub_intl'];

const normalizeText = (text: any) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isBrokerOrTechnicalName = (value: any) => {
  const normalized = normalizeText(value);
  return ['paccofacile', 'genei', 'parcelabc', 'parcel abc', 'spedirepro', 'spedire pro', 'spediamopro', 'spediamo pro', 'ship24go', 'red logistica', 'logihub'].some((name) => normalized.includes(name));
};

const cleanCustomerServiceName = (quote: any) => {
  const raw = String(quote?.service || '').trim();
  if (!raw || isBrokerOrTechnicalName(raw)) return getQuoteProfile(quote).label;
  return raw.replace(/parcel\s*abc/ig, '').replace(/logihub/ig, '').replace(/ship24go/ig, '').replace(/\s+/g, ' ').trim() || getQuoteProfile(quote).label;
};

const getCarrierName = (quote: any) => {
  const candidates = [
    quote?.carrierName,
    quote?.courierName,
    quote?.providerPayload?.ship24goCarrierName,
    quote?.providerPayload?.selectedService?.ship24goCarrierName,
    quote?.providerPayload?.carrier,
    quote?.providerPayload?.carrier_name,
    quote?.providerPayload?.carrierName,
    quote?.providerPayload?.courier,
    quote?.providerPayload?.courier_name,
    quote?.providerPayload?.vendor,
    quote?.providerPayload?.nombre_agencia,
    quote?.providerPayload?.nombre_completo_agencia,
    quote?.service
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    const normalized = normalizeText(value);
    if (normalized.includes('ups')) return 'UPS';
    if (normalized.includes('poste italiane') || normalized.includes('poste delivery') || (normalized.includes('poste') && normalized.includes('ital'))) return 'Poste Italiane';
    if (normalized.includes('sda')) return 'SDA';
    if (normalized.includes('brt') || normalized.includes('bartolini')) return 'BRT';
    if (normalized.includes('inpost') || normalized.includes('in post')) return 'InPost';
    if (normalized.includes('dhl')) return 'DHL';
    if (normalized.includes('gls')) return 'GLS';
    if (normalized.includes('fedex') || normalized.includes('federal express')) return 'FedEx';
    if (normalized.includes('seur')) return 'SEUR';
    if (normalized.includes('nacex')) return 'NACEX';
    if (normalized.includes('correos express')) return 'Correos Express';
    if (normalized.includes('correos')) return 'Correos';
    if (normalized.includes('tnt')) return 'TNT';
    if (normalized.includes('dpd')) return 'DPD';
    if (normalized.includes('mrw')) return 'MRW';
    if (isBrokerOrTechnicalName(value)) continue;
    if (normalized) {
      return value.replace(/\s+/g, ' ').slice(0, 42);
    }
  }
  return 'DoorDrop';
};


const formatDeliveryText = (quote: any, t: any) => {
  const minDays = quote?.estimatedDaysMin;
  const maxDays = quote?.estimatedDaysMax || quote?.estimatedDays;
  const daysUnit = t('days_unit') || t('days') || 'días';
  const hoursUnit = t('hours_unit') || 'horas';

  if (minDays && maxDays && minDays !== maxDays) {
    return `${minDays}-${maxDays} ${daysUnit}`;
  }
  if (maxDays) {
    return `${maxDays} ${daysUnit}`;
  }
  const raw = String(quote?.deliveryText || '').trim();
  if (!raw) return `24-72 ${hoursUnit}`;

  let localized = raw;
  localized = localized.replace(/\b(\d+)\s*(?:dias|días|days|giorni|jours|tage|天)\b/gi, `$1 ${daysUnit}`);
  localized = localized.replace(/\b(\d+)\s*(?:horas|hours|ore|heures|stunden|小时)\b/gi, `$1 ${hoursUnit}`);
  return localized;
};

const getQuoteProfile = (quote: any) => {
  const text = normalizeText(`${quote?.service || ''} ${quote?.collectionTypeName || ''} ${quote?.deliveryText || ''}`);
  const maxDays = Number(quote?.estimatedDaysMax || quote?.estimatedDays || 0);
  const isFast = maxDays > 0 && maxDays <= 2 || text.includes('express') || text.includes('urgent') || text.includes('rapido') || text.includes('24h') || text.includes('48h');
  const isDropoff = text.includes('drop-off') || text.includes('dropoff') || text.includes('drop off') || text.includes('point') || text.includes('oficina') || text.includes('hub');
  const isDoor = text.includes('door') || text.includes('home') || text.includes('domicilio') || text.includes('pickup') || text.includes('pick-up');
  const isEconomy = text.includes('economy') || text.includes('economico') || text.includes('standard') || text.includes('3+') || (!isFast && maxDays >= 3);

  if (isFast) return { key: 'fast', label: 'Rápido', className: 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100 dark:text-fuchsia-300 dark:bg-fuchsia-950/20 dark:border-fuchsia-900/30' };
  if (isEconomy) return { key: 'economy', label: 'Económico', className: 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900/30' };
  if (isDropoff) return { key: 'dropoff', label: 'Punto de entrega', className: 'text-blue-700 bg-blue-50 border-blue-100 dark:text-cyan-300 dark:bg-blue-950/20 dark:border-blue-900/30' };
  if (isDoor) return { key: 'door', label: 'A domicilio', className: 'text-indigo-700 bg-indigo-50 border-indigo-100 dark:text-indigo-300 dark:bg-indigo-950/20 dark:border-indigo-900/30' };
  return { key: 'all', label: 'Estándar', className: 'text-slate-700 bg-slate-50 border-slate-100 dark:text-slate-300 dark:bg-slate-800/50 dark:border-slate-700' };
};

const getCollectionLabel = (quote: any) => {
  const text = normalizeText(`${quote?.service || ''} ${quote?.collectionTypeName || ''}`);
  if (quote?.collectionTypeName) return quote.collectionTypeName;
  if (text.includes('drop-off') || text.includes('dropoff') || text.includes('drop off') || text.includes('point') || text.includes('hub')) return 'Oficina / punto autorizado';
  if (text.includes('door') || text.includes('home') || text.includes('domicilio')) return 'Entrega a domicilio';
  if (text.includes('pickup') || text.includes('pick-up')) return 'Recogida disponible';
  return 'Servicio estándar';
};

const quoteMatchesFilter = (quote: any, filter: string, carrierFilter: string = 'all') => {
  if (carrierFilter !== 'all') {
    const cName = getCarrierName(quote);
    if (cName.toLowerCase() !== carrierFilter.toLowerCase()) return false;
  }
  if (!filter || filter === 'all') return true;
  const { departure, arrival } = quotePointTypes(quote);
  const profile = getQuoteProfile(quote);
  const text = normalizeText(`${quote?.service || ''} ${quote?.collectionTypeName || ''} ${quote?.deliveryText || ''}`);

  if (filter === 'door_to_door') {
    return departure === 'home' && arrival === 'home';
  }
  if (filter === 'office_to_office') {
    return departure === 'point' && arrival === 'point';
  }
  if (filter === 'office_to_door') {
    return departure === 'point' && arrival === 'home';
  }
  if (filter === 'door_to_office') {
    return departure === 'home' && arrival === 'point';
  }
  if (filter === 'fast') {
    const maxDays = Number(quote?.estimatedDaysMax || quote?.estimatedDays || 0);
    return (maxDays > 0 && maxDays <= 2) || text.includes('express') || text.includes('urgent') || text.includes('rapido') || text.includes('24h') || text.includes('48h');
  }
  if (filter === 'economy') {
    return profile.key === 'economy' || text.includes('economy') || text.includes('economico') || text.includes('standard');
  }
  if (filter === 'dropoff') {
    return departure === 'point' || arrival === 'point';
  }
  if (filter === 'door') {
    return departure === 'home' || arrival === 'home';
  }
  return profile.key === filter;
};


const quotePointTypes = (quote: any) => {
  const payload = quote?.providerPayload || {};
  const selected = payload?.selectedService || payload;
  const text = normalizeText(`${quote?.service || ''} ${quote?.collectionTypeName || ''} ${selected?.nombre_agencia || ''} ${selected?.nombre_completo_agencia || ''} ${selected?.nombre_integracion_cliente || ''} ${selected?.service_name || ''}`);
  let departure = String(quote?.departureType || selected?.departure_type || payload?.departure_type || payload?.departureType || '').toLowerCase();
  let arrival = String(quote?.arrivalType || selected?.arrival_type || payload?.arrival_type || payload?.arrivalType || '').toLowerCase();
  if (departure === 'point' || departure === 'home' || arrival === 'point' || arrival === 'home') {
    return { departure: departure === 'point' ? 'point' : 'home', arrival: arrival === 'point' ? 'point' : 'home' };
  }
  // Explicit office/punto heuristics only (avoid matching random English "point")
  const pickupPoint = text.includes('punto a punto') || text.includes('point to point') || text.includes('oficina-oficina') || text.includes('oficina-domicilio') || text.includes('domicilio-oficina') || text.includes('shop2shop') || text.includes('drop-off') || text.includes('dropoff') || text.includes('locker') || text.includes('inpost') || text.includes('mondial') || text.includes('delegacion') || text.includes('delegación') || (text.includes('oficina') && !text.includes('dom-dom') && !text.includes('domicilio-domicilio'));
  const deliveryPoint = text.includes('punto a punto') || text.includes('point to point') || text.includes('oficina-oficina') || text.includes('domicilio-oficina') || text.includes('entrega en punto') || text.includes('entrega oficina') || text.includes('disponible en oficina') || text.includes('locker') || text.includes('inpost');
  if (text.includes('oficina-domicilio') || text.includes('oficina - domicilio')) return { departure: 'point', arrival: 'home' };
  if (text.includes('domicilio-oficina') || text.includes('domicilio - oficina')) return { departure: 'home', arrival: 'point' };
  if (text.includes('dom-dom') || text.includes('domicilio-domicilio') || text.includes('door to door')) return { departure: 'home', arrival: 'home' };
  return { departure: pickupPoint ? 'point' : 'home', arrival: deliveryPoint ? 'point' : 'home' };
};

const quoteNeedsSenderPoint = (quote: any) => quotePointTypes(quote).departure === 'point';
const quoteNeedsReceiverPoint = (quote: any) => quotePointTypes(quote).arrival === 'point';
const quoteNeedsAnyPoint = (quote: any) => quoteNeedsSenderPoint(quote) || quoteNeedsReceiverPoint(quote);

const getQuoteServiceBadges = (quote: any, t: any) => {
  const { departure, arrival } = quotePointTypes(quote);
  const badges: { label: string; className: string }[] = [];
  
  if (departure === 'point') {
    badges.push({ 
      label: t('pickup_point') || 'Punto de recogida', 
      className: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/30 dark:border-violet-900/40' 
    });
  } else {
    badges.push({ 
      label: t('pickup_home') || 'Recogida a domicilio', 
      className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/30 dark:border-blue-900/40' 
    });
  }

  if (arrival === 'point') {
    badges.push({ 
      label: t('delivery_point') || 'Punto de entrega', 
      className: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950/30 dark:border-cyan-900/40' 
    });
  } else {
    badges.push({ 
      label: t('delivery_home') || 'Entrega a domicilio', 
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900/40' 
    });
  }

  const text = normalizeText(`${quote?.service || ''} ${quote?.collectionTypeName || ''} ${quote?.providerPayload?.name || ''}`);
  if (text.includes('locker') || text.includes('inpost')) {
    badges.push({ 
      label: t('locker_available') || 'Locker disponible', 
      className: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900/40' 
    });
  }
  return badges;
};

const getDropPointDistance = (point: any) => {
  const distance = point?.DistanceFromOrigin || point?.distance || point?.distance_from_origin;
  if (typeof distance === 'object') {
    const value = distance?.Value ?? distance?.value;
    const unit = distance?.UnitOfMeasurement?.Code || distance?.unit || 'KM';
    if (value !== undefined && value !== null && String(value) !== '') return `${Number(value).toFixed(2)} ${unit}`;
  }
  if (distance !== undefined && distance !== null && String(distance) !== '') return `${Number(distance).toFixed(2)} km`;
  return '';
};

const getDropPointTitle = (point: any) => String(point?.PointName || point?.Name || point?.name || point?.CarrierName || 'Punto autorizado').trim();
const getDropPointAddress = (point: any) => [point?.Street || point?.address, point?.Zip || point?.postalCode, point?.City || point?.city].filter(Boolean).join(', ');

async function ship24goGetMapsKey(): Promise<string> {
  const win = window as any;
  if (win.__ship24goGoogleMapsKey) return win.__ship24goGoogleMapsKey;
  const response = await fetch('/api/public/runtime-config', { credentials: 'same-origin' }).catch(() => null);
  const data = response && response.ok ? await response.json().catch(() => ({})) : {};
  const key = String(data?.googleMapsKey || (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '');
  win.__ship24goGoogleMapsKey = key;
  return key;
}

async function ship24goLoadMaps(language = 'it') {
  const win = window as any;
  if (win.google?.maps && win.__ship24goGoogleMapsLang === language) return;
  const key = await ship24goGetMapsKey();
  if (!key) throw new Error('maps_not_available');
  if (win.__ship24goGoogleMapsPromise) return win.__ship24goGoogleMapsPromise;
  win.__ship24goGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ship24go-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('maps_not_available')), { once: true });
      if (win.google?.maps) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=${encodeURIComponent(language)}`;
    script.async = true;
    script.defer = true;
    script.dataset.ship24goGoogleMaps = '1';
    script.onload = () => { win.__ship24goGoogleMapsLang = language; resolve(); };
    script.onerror = () => { win.__ship24goGoogleMapsPromise = undefined; reject(new Error('maps_not_available')); };
    document.head.appendChild(script);
  });
  return win.__ship24goGoogleMapsPromise;
}

type DropPointModalProps = {
  open: boolean;
  direction: 'sender' | 'receiver';
  quote: any;
  address: any;
  onClose: () => void;
  onSelect: (point: any) => void;
};

const DropPointModal = ({ open, direction, quote, address, onClose, onSelect }: DropPointModalProps) => {
  const { language } = useI18n() /* need language */;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [points, setPoints] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const resetMarkers = () => {
    markersRef.current.forEach((marker: any) => marker.setMap?.(null));
    markersRef.current = [];
  };

  const loadPoints = async () => {
    if (!open) return;
    setLoading(true);
    setMessage('');
    setSelected(null);
    try {
      const payload = quote?.providerPayload || {};
      const selectedService = payload?.selectedService || payload;
      const rawVendor = String(
        selectedService?.vendor
        || selectedService?.courier
        || selectedService?.courier_code
        || selectedService?.id
        || quote?.carrierName
        || quote?.service
        || quote?.serviceId
        || ''
      ).toLowerCase();
      const vendor = rawVendor.includes('ups') ? 'ups'
        : (rawVendor.includes('inpost') || rawVendor.includes('in-post')) ? 'inpost'
        : (rawVendor.includes('poste') || rawVendor.includes('sda')) ? (quote?.providerCode === 'spediamopro' ? 'sda' : 'poste')
        : rawVendor.includes('brt') ? 'brt'
        : (rawVendor.includes('mondial') || rawVendor.includes('relay')) ? 'mondial_relay'
        : '';
      // Prefer address book fields, then quote route geo (never force ES when quote is IT)
      let routeCountry = String(
        address?.country
        || (direction === 'sender' ? (quote?.originCountry || quote?.providerPayload?.originCountry) : (quote?.destCountry || quote?.providerPayload?.destCountry))
        || ''
      ).toUpperCase().slice(0, 2);
      let routeZip = String(
        address?.zipCode || address?.postcode
        || (direction === 'sender' ? (quote?.originZip || '') : (quote?.destZip || ''))
        || ''
      ).replace(/\s+/g, '').trim();
      let routeCity = String(
        address?.city
        || (direction === 'sender' ? (quote?.originCity || '') : (quote?.destCity || ''))
        || ''
      ).trim();
      // Infer country from provider when missing
      if (!routeCountry) {
        const pc = String(quote?.providerCode || '').toLowerCase();
        if (pc === 'spedirepro' || pc === 'spediamopro' || pc === 'paccofacile') routeCountry = 'IT';
        else if (pc === 'genei') routeCountry = 'ES';
        else routeCountry = 'IT'; // safe default for points networks we support best
      }
      // IT: SpedirePro/SpediamoPro often require city+CAP. Resolve city from CAP if empty.
      if (!routeCity && routeZip) {
        routeCity = routeCountry === 'IT'
          ? (resolveItalianCity(routeZip, '') || resolveCityFromPostal(routeCountry, routeZip))
          : resolveCityFromPostal(routeCountry, routeZip);
      }
      if (!routeZip && !routeCity) {
        setMessage('Completa ciudad y código postal del remitente/destinatario para buscar puntos cercanos.');
        setPoints([]);
        setLoading(false);
        return;
      }
      // If still no city on IT, block with clear message (API returns empty without city)
      if (routeCountry === 'IT' && routeZip && !routeCity) {
        setMessage('Inserisci la città (es. Roma) insieme al CAP per trovare i punti vicini.');
        setPoints([]);
        setLoading(false);
        return;
      }
      const res = await (api as any).getDropOffPoints({
        providerCode: quote?.providerCode || 'spedirepro',
        country: routeCountry,
        city: routeCity,
        postcode: routeZip,
        zipCode: routeZip,
        direction,
        vendors: vendor ? [vendor] : undefined,
        agencyId: quote?.serviceId,
        serviceId: quote?.serviceId,
        sender_country: String(quote?.originCountry || routeCountry || 'ES').toUpperCase().slice(0, 2)
      });
      const next = Array.isArray(res.points) ? res.points : [];
      setPoints(next);
      if (next.length) setSelected(next[0]);
      if (!next.length) setMessage('No hay puntos disponibles cerca de esta ubicación. Intenta con otra ciudad o código postal.');
    } catch {
      setPoints([]);
      setMessage('No hay puntos disponibles cerca de esta ubicación. Intenta con otra ciudad o código postal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadPoints();
  }, [open, direction, address?.city, address?.zipCode, quote?.id]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    let cancelled = false;
    ship24goLoadMaps(language || 'it')
      .then(() => {
        if (cancelled || !mapRef.current || !(window as any).google?.maps) return;
        const google = (window as any).google;
        const firstWithCoords = points.find((p: any) => Number(p?.Latitude) && Number(p?.Longitude));
        const center = firstWithCoords ? { lat: Number(firstWithCoords.Latitude), lng: Number(firstWithCoords.Longitude) } : { lat: 41.9028, lng: 12.4964 };
        mapInstance.current = new google.maps.Map(mapRef.current, { center, zoom: firstWithCoords ? 13 : 6, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        resetMarkers();
        const bounds = new google.maps.LatLngBounds();
        points.forEach((point: any) => {
          const lat = Number(point?.Latitude);
          const lng = Number(point?.Longitude);
          if (!lat || !lng) return;
          const marker = new google.maps.Marker({ position: { lat, lng }, map: mapInstance.current, title: getDropPointTitle(point) });
          marker.addListener('click', () => setSelected(point));
          markersRef.current.push(marker);
          bounds.extend({ lat, lng });
        });
        if (markersRef.current.length > 1) mapInstance.current.fitBounds(bounds);
      })
      .catch(() => setMessage('No hay puntos disponibles cerca de esta ubicación. Intenta con otra ciudad o código postal.'));
    return () => { cancelled = true; resetMarkers(); };
  }, [open, points, language]);

  if (!open) return null;
  const title = direction === 'sender' ? 'Elegir punto de recogida' : 'Elegir punto de entrega';

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl bg-white dark:bg-dark-900 border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-neon-cyan">Buscar puntos cercanos</p>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">Selecciona un punto autorizado para continuar. Los puntos mostrados vienen del proveedor seleccionado.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[520px] overflow-hidden">
          <div className="p-4 overflow-y-auto max-h-[65vh] space-y-3 border-r border-gray-100 dark:border-gray-800">
            {loading && <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-sm font-bold">Buscando puntos cercanos...</div>}
            {!loading && message && <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-sm font-bold">{message}</div>}
            {!loading && points.map((point: any, index: number) => {
              const active = selected?.PointID === point?.PointID;
              return (
                <button
                  key={`${point?.PointID || index}-${index}`}
                  type="button"
                  onClick={() => setSelected(point)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-neon-cyan/50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-900 dark:text-white">{getDropPointTitle(point)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">{getDropPointAddress(point)}</p>
                    </div>
                    <span className="text-[10px] rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 px-2 py-1 font-black whitespace-nowrap">Punto autorizado</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black">
                    {point?.CarrierName && <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-dark-800 text-slate-700 dark:text-slate-200">{point.CarrierName}</span>}
                    {getDropPointDistance(point) && <span className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">{getDropPointDistance(point)}</span>}
                    {point?.TypeOfPoint && <span className="px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">Locker disponible</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="relative min-h-[420px] bg-slate-100 dark:bg-dark-950">
            <div ref={mapRef} className="absolute inset-0" />
            {selected && (
              <div className="absolute left-4 right-4 bottom-4 rounded-2xl bg-white/95 dark:bg-dark-900/95 border border-gray-200 dark:border-gray-800 shadow-xl p-4">
                <p className="font-black text-gray-900 dark:text-white">{getDropPointTitle(selected)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">{getDropPointAddress(selected)}</p>
                <button
                  type="button"
                  onClick={() => { onSelect(selected); onClose(); }}
                  className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black shadow-lg"
                >
                  Seleccionar este punto
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const getCarrierLogo = (_providerName: string, _serviceName: string) => {
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
      <Package className="w-6 h-6" />
    </div>
  );
};

const Header = ({ toggleTheme, isDark, toggleMobileMenu, isMobileMenuOpen, profile }: any) => {
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const { currency, setCurrency, format } = useCurrency();
  const accountCurrency = String(profile?.currency || currency || 'EUR').toUpperCase();

  useEffect(() => {
    if (profile?.currency && profile.currency !== currency) {
      setCurrency(String(profile.currency).toUpperCase());
    }
  }, [profile?.currency]);

  return (
    <header className="h-16 glass-panel border-b border-gray-200 dark:border-gray-800/50 flex items-center justify-between px-4 z-50 sticky top-0 bg-white/70 dark:bg-dark-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleMobileMenu()}
              aria-label="Abrir navegación"
              aria-expanded={Boolean(isMobileMenuOpen)}
              className="lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-blue-500 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Menu />
            </button>
            <BrandMark iconClassName="w-8 h-8 rounded-lg" textClassName="font-display text-xl hidden sm:block text-gray-900 dark:text-white" />
        </div>

        <div className="flex items-center gap-4">
            {/* Language Selector */}
            <div className="relative">
                <button onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 py-2 hover:text-gray-900 dark:hover:text-white cursor-pointer">
                    <Globe className="w-4 h-4" /> <span>{language.toUpperCase()}</span> <ChevronDown className="w-3 h-3" />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 max-h-[70vh] overflow-y-auto glass-panel rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 bg-white dark:bg-dark-800">
                      {availableLanguages.map((item) => (
                        <button key={item.code} onClick={() => { setLanguage(item.code); setLangOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer ${language === item.code ? 'font-black text-blue-600 dark:text-neon-cyan' : 'text-gray-700 dark:text-gray-100'}`}>
                          {item.flag} {item.label}
                        </button>
                      ))}
                  </div>
                )}
            </div>

            {/* Account currency: configured from billing settings */}
            <Link to="/panel/settings" className="flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-neon-cyan py-2 hover:opacity-85 cursor-pointer" title="Moneda configurada en Facturación & Saldo">
                <span>{accountCurrency}</span> <ChevronDown className="w-3 h-3" />
            </Link>

            <button onClick={toggleTheme} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-yellow-400 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 dark:bg-neon-cyan/20 dark:text-neon-cyan border border-blue-100 dark:border-neon-cyan/30 font-medium text-sm">
                <Wallet className="w-4 h-4" /> <span>{format(Number(profile?.balance || 0), accountCurrency)}</span>
            </div>
        </div>
    </header>
  );
};

const Sidebar = ({ isMobileMenuOpen, toggleMobileMenu, profile, isSidebarCollapsed, toggleSidebarCollapsed }: any) => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const sectionCopy = language === 'it'
    ? { principal: 'Principale', sales: 'Vendite e canali', account: 'Account e aiuto', collapse: 'Comprimi menu', expand: 'Espandi menu', close: 'Chiudi menu', logout: 'Disconnetti', active: 'Account attivo', marketplace: 'Marketplace', omnichannel: 'Omnicanale + AI', liveChat: 'Live Chat Omnicanale', team: 'Team e dipendenti', integrations: 'Integrazioni', apiDocs: 'Documentazione API', activeView: 'Vista cliente attiva', backAdmin: 'Torna al Super Admin', primaryNav: 'Navigazione principale', panelSections: 'Sezioni del pannello', loading: 'Caricamento...' }
    : language.startsWith('en')
      ? { principal: 'Main', sales: 'Sales & channels', account: 'Account & help', collapse: 'Collapse menu', expand: 'Expand menu', close: 'Close menu', logout: 'Sign out', active: 'Active account', marketplace: 'Marketplace', omnichannel: 'Omnichannel + AI', liveChat: 'Live omnichannel chat', team: 'Team & employees', integrations: 'Integrations', apiDocs: 'API documentation', activeView: 'Active customer view', backAdmin: 'Back to Super Admin', primaryNav: 'Primary navigation', panelSections: 'Dashboard sections', loading: 'Loading...' }
      : language === 'fr'
        ? { principal: 'Principal', sales: 'Ventes et canaux', account: 'Compte et aide', collapse: 'Réduire le menu', expand: 'Développer le menu', close: 'Fermer le menu', logout: 'Se déconnecter', active: 'Compte actif', marketplace: 'Marketplace', omnichannel: 'Omnicanal + IA', liveChat: 'Chat omnicanal en direct', team: 'Équipe et employés', integrations: 'Intégrations', apiDocs: 'Documentation API', activeView: 'Vue client active', backAdmin: 'Retour au Super Admin', primaryNav: 'Navigation principale', panelSections: 'Sections du tableau de bord', loading: 'Chargement...' }
      : language === 'de'
          ? { principal: 'Übersicht', sales: 'Verkauf & Kanäle', account: 'Konto & Hilfe', collapse: 'Menü einklappen', expand: 'Menü ausklappen', close: 'Menü schließen', logout: 'Abmelden', active: 'Aktives Konto', marketplace: 'Marketplace', omnichannel: 'Omnichannel + KI', liveChat: 'Live-Chat Omnichannel', team: 'Team & Mitarbeitende', integrations: 'Integrationen', apiDocs: 'API-Dokumentation', activeView: 'Aktive Kundenansicht', backAdmin: 'Zurück zum Super Admin', primaryNav: 'Hauptnavigation', panelSections: 'Dashboard-Bereiche', loading: 'Wird geladen...' }
          : language === 'zh'
            ? { principal: '主要功能', sales: '销售与渠道', account: '账户与帮助', collapse: '收起菜单', expand: '展开菜单', close: '关闭菜单', logout: '退出登录', active: '账户已启用', marketplace: 'Marketplace', omnichannel: '全渠道 + AI', liveChat: '全渠道实时聊天', team: '团队与员工', integrations: '集成', apiDocs: 'API 文档', activeView: '当前客户视图', backAdmin: '返回超级管理员', primaryNav: '主导航', panelSections: '面板栏目', loading: '正在加载...' }
            : { principal: 'Principal', sales: 'Ventas y canales', account: 'Cuenta y ayuda', collapse: 'Contraer menú', expand: 'Expandir menú', close: 'Cerrar menú', logout: 'Cerrar sesión', active: 'Cuenta activa', marketplace: 'Marketplace', omnichannel: 'Omnicanal + IA', liveChat: 'Chat omnicanal en vivo', team: 'Equipo y empleados', integrations: 'Integraciones', apiDocs: 'Documentación API', activeView: 'Vista de cliente activa', backAdmin: 'Volver al Super Admin', primaryNav: 'Navegación principal', panelSections: 'Secciones del panel', loading: 'Cargando...' };

  const menuSections = [
    {
      title: sectionCopy.principal,
      items: [
        { name: t('dashboard'), path: '/panel', icon: ChartPie },
        { name: t('quote'), path: '/panel/quote', icon: Plus },
        { name: t('tariffs'), path: '/panel/tariffa/', icon: Calculator },
        { name: t('shipments'), path: '/panel/shipments', icon: Box },
      ],
    },
    {
      title: sectionCopy.sales,
      items: [
        { name: sectionCopy.marketplace, path: '/panel/marketplace', icon: Store },
        { name: sectionCopy.omnichannel, path: '/panel/omnichannel', icon: Bot },
        { name: sectionCopy.liveChat, path: '/panel/omnichannel?tab=inbox', icon: MessageSquare },
        { name: sectionCopy.team, path: '/panel/omnichannel?tab=team', icon: Users },
      ],
    },
    {
      title: sectionCopy.account,
      items: [
        { name: sectionCopy.integrations, path: '/panel/stores', icon: Plug },
        { name: t('billing_nav'), path: '/panel/billing', icon: FileText },
        { name: t('wallet_payments_nav'), path: '/panel/settings', icon: Wallet },
        { name: t('tickets_support'), path: '/panel/tickets', icon: LifeBuoy },
        { name: t('ai_copilot'), path: '/panel/copilot', icon: Sparkles },
        { name: sectionCopy.apiDocs, path: '/panel/api-docs', icon: BookOpen },
      ],
    },
  ];

  const menuItems = menuSections.flatMap((section) => section.items);

  return (
    <>
      {isMobileMenuOpen && (
        <div
          role="presentation"
          onClick={() => toggleMobileMenu(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside
        aria-label={sectionCopy.primaryNav}
        className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 transform flex-col border-r border-gray-200 bg-white/95 shadow-2xl backdrop-blur-md transition-[width,transform] duration-300 dark:border-gray-800 dark:bg-dark-900/95 lg:static lg:h-[calc(100dvh-4rem)] lg:translate-x-0 lg:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} w-[min(88vw,20rem)] ${isSidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-72'}`}
      >
          <div className={`flex min-h-[5.25rem] items-center gap-3 border-b border-gray-200 px-3 py-3 dark:border-gray-800/50 ${isSidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between'}`}>
              <div className={`flex min-w-0 items-center gap-3 rounded-2xl bg-gray-100 p-2.5 dark:bg-gray-800/50 ${isSidebarCollapsed ? 'lg:bg-transparent lg:p-0' : 'flex-1'}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-400 to-cyan-500 text-lg font-bold text-white dark:from-neon-cyan dark:to-neon-green">
                      {profile?.name ? profile.name.substring(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div className={`min-w-0 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{profile?.name || sectionCopy.loading}</p>
                      <p className="text-xs font-medium text-blue-600 dark:text-neon-cyan">{sectionCopy.active}</p>
                  </div>
              </div>
              <button
                type="button"
                onClick={() => toggleMobileMenu(false)}
                aria-label={sectionCopy.close}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => toggleSidebarCollapsed()}
                aria-label={isSidebarCollapsed ? sectionCopy.expand : sectionCopy.collapse}
                title={isSidebarCollapsed ? sectionCopy.expand : sectionCopy.collapse}
                className="hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-neon-cyan lg:inline-flex"
              >
                {isSidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4" aria-label={sectionCopy.panelSections}>
              {menuSections.map((section) => (
                <div key={section.title}>
                  <div className={`mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 ${isSidebarCollapsed ? 'lg:text-center lg:px-0' : ''}`}>
                    <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{section.title}</span>
                    {isSidebarCollapsed && <span className="hidden lg:inline">···</span>}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = item.path.includes('?')
                        ? (location.pathname + location.search) === item.path
                        : (location.pathname === item.path && (!location.search || !menuItems.some((menuItem) => menuItem.path === location.pathname + location.search)));
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => toggleMobileMenu(false)}
                          title={isSidebarCollapsed ? item.name : undefined}
                          className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''} ${active ? 'bg-blue-50 text-blue-600 shadow-sm dark:bg-gray-800 dark:text-neon-cyan' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/60'}`}
                        >
                          <item.icon className={`h-5 w-5 shrink-0 ${active ? 'text-blue-500 dark:text-neon-cyan' : 'text-gray-500 group-hover:text-blue-500 dark:text-gray-400'}`} />
                          <span className={`min-w-0 truncate ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
          </nav>

          <div className={`border-t border-gray-200 p-3 dark:border-gray-800/50 sm:p-4 ${isSidebarCollapsed ? 'lg:px-2' : ''}`}>
              <div className={`mb-2 flex items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>DoorDrop</span>
                <span title={`DoorDrop v${APP_VERSION}`}>v{APP_VERSION}</span>
              </div>
              <button
                type="button"
                onClick={() => { removeAuthToken(); navigate('/auth/login'); }}
                title={isSidebarCollapsed ? sectionCopy.logout : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 ${isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
              >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{sectionCopy.logout}</span>
              </button>
          </div>
      </aside>
    </>
  );
};

const Dashboard = ({ profile }: any) => {
  const { t, language } = useI18n();
  const { format } = useCurrency();
  const accountCurrency = String(profile?.currency || 'EUR').toUpperCase();
  const [shipments, setShipments] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [shipmentRes, reportRes] = await Promise.all([api.getShipments(), api.getUserReports()]);
      setShipments(shipmentRes.shipments || []);
      setReports(reportRes);
    } catch {
      setShipments([]);
      setReports(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const pending = Number(reports?.summary?.pending || shipments.filter(s => s.status === 'Pendiente' || s.status === 'Procesando').length);
  const transit = Number(reports?.summary?.transit || shipments.filter(s => s.status === 'En Tránsito').length);
  const delivered = Number(reports?.summary?.delivered || shipments.filter(s => s.status === 'Entregado').length);
  const countryRows = Array.isArray(reports?.countries) ? reports.countries : [];
  const dailyRows = Array.isArray(reports?.daily) ? reports.daily : [];
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const chartText = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.22)';

  const lineChartData = {
    labels: dailyRows.length ? dailyRows.map((row: any) => new Date(row.day).toLocaleDateString(language, { day: '2-digit', month: 'short' })) : [t('customer_dashboard_no_records')],
    datasets: [
      {
        label: t('customer_dashboard_shipments_month'),
        data: dailyRows.length ? dailyRows.map((row: any) => Number(row.shipments || 0)) : [0],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
        tension: 0.45,
        fill: true,
        pointRadius: 4,
      },
    ],
  };

  const countriesChartData = {
    labels: countryRows.length ? countryRows.map((row: any) => getCountryName(row.country)) : [t('customer_dashboard_no_records')],
    datasets: [
      {
        label: t('customer_dashboard_main_destinations'),
        data: countryRows.length ? countryRows.map((row: any) => Number(row.shipments || 0)) : [0],
        backgroundColor: ['#2563eb', '#06b6d4', '#14b8a6', '#8b5cf6', '#f59e0b', '#22c55e'],
        borderRadius: 12,
        maxBarThickness: 40,
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

  return (
    <div className="py-2 md:py-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black uppercase tracking-[0.22em]">
              <ChartPie className="w-4 h-4" /> {t('customer_dashboard_badge')}
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-black">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('customer_dashboard_unified')}</span>
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
            {t('customer_dashboard_welcome').replace(/[!！]\s*$/, '')}{profile?.name ? `, ${profile.name.split(" ")[0]}` : ''}!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('customer_dashboard_subtitle')}</p>
        </div>
        <button onClick={loadDashboard} className="px-5 py-3 rounded-2xl glass-panel text-sm font-black text-gray-700 dark:text-gray-200 hover:border-blue-300 dark:hover:border-neon-cyan/50 transition-colors">
          {t('customer_dashboard_refresh')}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="glass-panel p-5 sm:p-6 rounded-3xl border-l-4 border-l-blue-500 dark:border-l-neon-cyan relative overflow-hidden group md:col-span-1">
              <div className="absolute right-[-10%] top-[-20%] text-blue-500/10 dark:text-neon-cyan/10 text-9xl group-hover:scale-110 transition-transform"><Wallet /></div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{t('customer_dashboard_balance')}</p>
              <h3 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-4">{format(Number(profile?.balance || 0), accountCurrency)}</h3>
              <Link to="/panel/settings" className="text-xs font-bold text-blue-600 dark:text-neon-cyan uppercase tracking-wider hover:underline">{t('customer_dashboard_recharge')}</Link>
          </div>

          <div className="glass-panel p-5 sm:p-6 rounded-3xl relative overflow-hidden">
              <div className="absolute right-4 top-6 text-pink-500/20 dark:text-neon-pink/20 text-4xl"><Box /></div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{t('customer_dashboard_shipments_month')}</p>
              <h3 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-2">{loading ? '—' : (reports?.summary?.totalShipments || shipments.length)}</h3>
              <p className="text-xs text-green-500 font-medium">{t('customer_dashboard_activity_registered')}</p>
          </div>

          <div className="glass-panel p-5 sm:p-6 rounded-3xl relative overflow-hidden">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{t('customer_dashboard_delivered')}</p>
              <h3 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-2">{delivered}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('customer_dashboard_delivered_desc')}</p>
          </div>

          <div className="glass-panel p-5 sm:p-6 rounded-3xl border-l-4 border-l-green-500 relative overflow-hidden">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{t('customer_dashboard_service_status')}</p>
              <h3 className="font-display text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div> {t('customer_dashboard_operational')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('customer_dashboard_service_available')}</p>
          </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        <div className="xl:col-span-2 glass-panel rounded-3xl p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">{t('customer_dashboard_shipment_activity')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('customer_dashboard_last_7_days')}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black">Chart.js</span>
          </div>
          <div className="h-72">
            <Line options={chartOptions} data={lineChartData} />
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-4 sm:p-6">
           <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{t('customer_dashboard_shipment_status')}</h3>
           <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">{t('customer_dashboard_summary')}</p>
          <div className="space-y-4">
            {[
              { label: t('customer_dashboard_pending'), value: pending, className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
              { label: t('customer_dashboard_in_transit'), value: transit, className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
              { label: t('customer_dashboard_delivered'), value: delivered, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{item.label}</span>
                <span className={`px-3 py-1 rounded-full text-sm font-black ${item.className}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-panel rounded-3xl p-4 sm:p-6">
           <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{t('customer_dashboard_main_destinations')}</h3>
           <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">{t('customer_dashboard_main_destinations_desc')}</p>
          <div className="h-80">
            <Bar options={horizontalChartOptions} data={countriesChartData} />
          </div>
        </div>

        {shipments.length === 0 ? (
          <div className="glass-panel rounded-3xl p-4 sm:p-6 md:p-8 text-center border-dashed border-2 border-gray-300 dark:border-gray-700">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 dark:bg-neon-cyan/20 dark:text-neon-cyan rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
              <Package className="w-8 h-8" />
            </div>
             <h3 className="text-lg font-bold mb-2 dark:text-white">{t('customer_dashboard_first_shipment')}</h3>
             <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-md mx-auto">{t('customer_dashboard_first_shipment_desc')}</p>
            <Link to="/panel/quote" className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-neon-cyan dark:to-neon-green text-white dark:text-gray-900 py-3 px-8 rounded-xl font-bold shadow-lg transition-transform hover:-translate-y-1">
              <Plus className="w-5 h-5" />
               {t('customer_dashboard_new_shipment')}
            </Link>
          </div>
        ) : (
          <div className="glass-panel p-4 sm:p-6 rounded-3xl">
             <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{t('customer_dashboard_recent_activity')}</h3>
             <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">{t('customer_dashboard_recent_activity_desc')}</p>
            <div className="space-y-4">
               {shipments.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 border border-gray-100 dark:border-gray-800 rounded-2xl">
                     <div>
                       <p className="font-black text-blue-600 dark:text-neon-cyan">{s.trackingCode}</p>
                       <p className="text-sm text-gray-500">{new Date(s.createdAt).toLocaleDateString()}</p>
                     </div>
                     <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-dark-800 text-gray-800 dark:text-gray-300">
                       {s.status}
                     </span>
                  </div>
               ))}
            </div>
            <div className="mt-6 text-center">
               <Link to="/panel/shipments" className="text-blue-600 dark:text-neon-cyan text-sm font-bold hover:underline">Ver todos los envíos</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Quote = () => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, convert, format, setCurrency } = useCurrency();
  const [form, setForm] = useState({
    originCountry: 'ES',
    originZip: '',
    originCity: '',
    destCountry: 'DE',
    destZip: '',
    destCity: '',
    currency: 'EUR'
  });
  const [packages, setPackages] = useState([
    { width: 10, height: 10, length: 10, weight: 1, qty: 1 }
  ]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollToResults = () => {
    try {
      const el = resultsAnchorRef.current;
      if (!el) return;
      // scroll within panel main if possible
      const main = el.closest('main') as HTMLElement | null;
      if (main) {
        const top = el.offsetTop - 24;
        main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch {
      try { resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    }
  };

  const [error, setError] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState('');
  const [quotePlanSimulation, setQuotePlanSimulation] = useState<number>(0);
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [quoteSortBy, setQuoteSortBy] = useState<'price_asc' | 'speed_asc' | 'savings_desc'>('price_asc');
  const [shippingTermsAccepted, setShippingTermsAccepted] = useState(false);
  const [dropPointModal, setDropPointModal] = useState<{ open: boolean; direction: 'sender' | 'receiver' }>({ open: false, direction: 'sender' });
  const [selectedDrops, setSelectedDrops] = useState<{ sender?: any; receiver?: any }>({});
  const [storeOrderContext, setStoreOrderContext] = useState<any>(null);

  const addPackage = () => {
    setPackages([...packages, { width: 10, height: 10, length: 10, weight: 1, qty: 1 }]);
  };

  const removePackage = (index: number) => {
    setPackages(packages.filter((_, i) => i !== index));
  };

  const updatePackage = (index: number, key: string, val: number) => {
    const next = [...packages];
    next[index] = { ...next[index], [key]: val };
    setPackages(next);
  };

  // Checkout and flow states
  const [activeStep, setActiveStep] = useState<'quote' | 'complete'>('quote');
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [shipmentPaymentMethod, setShipmentPaymentMethod] = useState<'wallet' | 'paypal'>('wallet');
  const [paypalAvailable, setPaypalAvailable] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [addressBook, setAddressBook] = useState<any[]>([]);
  const quoteRequestSequence = useRef(0);

  // Completar envío form state
  const [senderDetails, setSenderDetails] = useState({
    name: '', company: '', email: '', phone: '', addressLine1: '', addressLine2: '', civicNumber: '', formattedAddress: '', googlePlaceId: '', city: '', province: '', country: 'ES', zipCode: '', saveToBook: false
  });
  const [recipientDetails, setRecipientDetails] = useState({
    name: '', company: '', email: '', phone: '', addressLine1: '', addressLine2: '', civicNumber: '', formattedAddress: '', googlePlaceId: '', city: '', province: '', country: 'DE', zipCode: '', saveToBook: false
  });
  const [extraDetails, setExtraDetails] = useState({
    content: 'Efectos personales / Ropa', declaredValue: 15, reference: '', manifest: 1, exportReason: 'Sale', termsOfTrade: 'DAP'
  });
  const [customsDetails, setCustomsDetails] = useState({
    description: 'Prendas de vestir', origin: 'ES', quantity: 1, weight: 1, value: 15, hsCode: '', sku: ''
  });

  const fetchProfileAndAddresses = async () => {
    try {
      const pRes = await api.getProfile();
      const accountCurrency = String(pRes.user?.currency || 'EUR').toUpperCase();
      setProfile(pRes.user);
      setCurrency(accountCurrency);
      setForm(prev => ({ ...prev, currency: accountCurrency }));
      api.paypalGetConfig()
        .then((paypalConfig: any) => setPaypalAvailable(Boolean(paypalConfig?.enabled && paypalConfig?.configured)))
        .catch(() => setPaypalAvailable(false));
      const abRes = await api.getAddressBook();
      setAddressBook(abRes.addresses || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchProfileAndAddresses();
    const st = (location.state as any) || {};
    const session = loadGuestQuoteSession();
    const p = st.prefill || (session ? session.form : null);
    const guestQuote = st.guestQuote || session?.quote || null;
    const autoSelect = Boolean(st.autoSelectQuote || guestQuote);

    if (p) {
      setForm(prev => ({
        ...prev,
        originCountry: p.originCountry || prev.originCountry || 'ES',
        originZip: p.originZip || prev.originZip || '',
        originCity: p.originCity || prev.originCity || '',
        destCountry: p.destCountry || prev.destCountry || 'DE',
        destZip: p.destZip || prev.destZip || '',
        destCity: p.destCity || prev.destCity || '',
        currency: String(profile?.currency || p.currency || prev.currency || 'EUR').toUpperCase()
      }));
      if (p.packages && p.packages.length > 0) {
        setPackages(p.packages);
      }
      if (p.recipient) {
        setRecipientDetails(prev => ({ ...prev, ...p.recipient }));
      }
      if (p.extra) {
        setExtraDetails(prev => ({ ...prev, ...p.extra }));
      }
      if (p.storeOrder) {
        setStoreOrderContext(p.storeOrder);
      }
    }

    // Restore selected guest quote so user can purchase without re-quoting
    if (guestQuote && guestQuote.id) {
      setQuotes([guestQuote]);
      if (autoSelect) {
        setSelectedQuote(guestQuote);
        setTimeout(scrollToResults, 120);
      }
    } else if (p?.selectedQuoteId && !guestQuote) {
      // keep id for after manual quote if needed
    }
  }, [location.state]);

  const handleQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingTermsAccepted) {
      setError(language === 'en'
        ? 'Accept the DoorDrop Shipping Terms before requesting a quote.'
        : language === 'it'
          ? 'Accetta i Termini DoorDrop Spedizioni prima di richiedere un preventivo.'
          : 'Acepta los términos de DoorDrop Envíos antes de solicitar una cotización.');
      return;
    }
    const requestId = quoteRequestSequence.current + 1;
    quoteRequestSequence.current = requestId;
    setLoading(true);
    setLoadingPhase(t('quote_loading_phase1') || 'Preparando solicitud...');
    setError('');
    setQuotes([]);
    setSelectedDrops({});
    setTimeout(scrollToResults, 40);
    let phaseTimer: number | undefined;
    try {
      const quoteCurrency = String(profile?.currency || form.currency || 'EUR').toUpperCase();
      const originZip = String(form.originZip || '').trim();
      const destZip = String(form.destZip || '').trim();
      if (!originZip || !destZip) {
        setError(t('quote_need_zips') || 'Completa los codigos postales de origen y destino para cotizar.');
        setLoadingPhase('');
        return;
      }
      setLoadingPhase(t('quote_loading_phase2') || 'Consultando transportistas en paralelo...');
      phaseTimer = window.setTimeout(() => setLoadingPhase(t('quote_loading_phase3') || 'Comparando precios y plazos...'), 1800);
      const originCountry = String(form.originCountry || 'ES').toUpperCase().slice(0, 2);
      const destCountry = String(form.destCountry || 'DE').toUpperCase().slice(0, 2);
      // IT: fill city from CAP when user only typed postal code (SpedirePro needs city+CAP)
      const originCity = String(form.originCity || '').trim()
        || (originCountry === 'IT' ? resolveItalianCity(originZip, '') : resolveCityFromPostal(originCountry, originZip))
        || resolveCityForCountry(originCountry, originZip, '');
      const destCity = String(form.destCity || '').trim()
        || (destCountry === 'IT' ? resolveItalianCity(destZip, '') : resolveCityFromPostal(destCountry, destZip))
        || resolveCityForCountry(destCountry, destZip, '');
      if (originCity && !String(form.originCity || '').trim()) {
        setForm(prev => ({ ...prev, originCity: prev.originCity || originCity }));
      }
      if (destCity && !String(form.destCity || '').trim()) {
        setForm(prev => ({ ...prev, destCity: prev.destCity || destCity }));
      }
      const requestBase = {
        ...form,
        originZip,
        destZip,
        originCity,
        destCity,
        originCountry,
        destCountry,
        currency: quoteCurrency,
        packages: (packages || []).map((pkg: any) => ({
          width: Math.max(1, Number(pkg.width) || 10),
          height: Math.max(1, Number(pkg.height) || 10),
          length: Math.max(1, Number(pkg.length) || 10),
          weight: Math.max(0.1, Number(pkg.weight) || 1),
          qty: Math.max(1, Number(pkg.qty) || 1),
        })),
      };
      const receiveProviderResponse = async (providerCode: string) => {
        try {
          const response = await api.quoteShipment({ ...requestBase, providerCodes: [providerCode] });
          if (quoteRequestSequence.current !== requestId) return response;
          const providerQuotes = (Array.isArray(response?.quotes) ? response.quotes : []).map((q: any) => ({
            ...q,
            // SHIP24GO_QUOTE_GEO_ATTACH — keep route geo for drop-off points (IT needs city+CAP)
            originCountry: q.originCountry || originCountry,
            destCountry: q.destCountry || destCountry,
            originZip: q.originZip || originZip,
            destZip: q.destZip || destZip,
            originCity: q.originCity || originCity,
            destCity: q.destCity || destCity,
          }));
          if (providerQuotes.length) {
            setQuotes(previous => {
              const byId = new Map(previous.map((quote: any) => [String(quote.id), quote]));
              providerQuotes.forEach((quote: any) => byId.set(String(quote.id), quote));
              return Array.from(byId.values());
            });
          }
          return response;
        } catch (providerError: any) {
          // One unavailable connector must not hide valid offers from others.
          return { quotes: [], providerCode, error: providerError?.message || 'unavailable' };
        }
      };
      const providerResults = await Promise.allSettled(PROGRESSIVE_QUOTE_PROVIDER_CODES.map(receiveProviderResponse));
      if (quoteRequestSequence.current !== requestId) return;
      if (phaseTimer) window.clearTimeout(phaseTimer);
      setLoadingPhase(t('quote_loading_ready') || 'Listo');
      const returnedQuotes = providerResults.flatMap((result: any) => result.status === 'fulfilled' && Array.isArray(result.value?.quotes) ? result.value.quotes : []);
      if (returnedQuotes.length === 0) {
        const messageResult = providerResults.find((result: any) => result.status === 'fulfilled' && result.value?.message);
        const message = messageResult?.status === 'fulfilled' ? messageResult.value.message : undefined;
        setError(message || t('quote_no_options') || 'No encontramos opciones disponibles para esta ruta.');
      }
      setTimeout(scrollToResults, 60);
    } catch (err: any) {
      if (phaseTimer) window.clearTimeout(phaseTimer);
      setQuotes([]);
      setError(err?.message || t('quote_unavailable') || 'La cotizacion no esta disponible en este momento.');
      setTimeout(scrollToResults, 60);
    } finally {
      if (phaseTimer) window.clearTimeout(phaseTimer);
      if (quoteRequestSequence.current === requestId) {
        setLoading(false);
        setLoadingPhase('');
      }
    }
  };

  const handleSelectQuoteForPayment = (quote: any) => {
    setSelectedQuote({
      ...quote,
      originCountry: quote?.originCountry || form.originCountry,
      destCountry: quote?.destCountry || form.destCountry,
      originZip: quote?.originZip || form.originZip,
      destZip: quote?.destZip || form.destZip,
      originCity: quote?.originCity || form.originCity,
      destCity: quote?.destCity || form.destCity,
    });
    setSelectedDrops({});
    setSenderDetails(prev => ({
      ...prev,
      country: form.originCountry,
      zipCode: form.originZip,
      city: form.originCity || prev.city || '',
    }));
    setRecipientDetails(prev => ({
      ...prev,
      country: form.destCountry,
      zipCode: form.destZip,
      city: form.destCity || prev.city || '',
    }));
    setCustomsDetails(prev => ({
      ...prev,
      origin: form.originCountry,
      weight: packages.reduce((sum, p) => sum + Number(p.weight || 0) * Math.max(1, Number(p.qty || 1)), 0)
    }));
    setActiveStep('complete');
    // SHIP24GO_QUOTE_SELECTOR_SCROLL_V1_4_37
    setTimeout(() => {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, 0);
      }
    }, 80);
  };

  const availableCarriers = Array.from(
    new Set(quotes.map((q: any) => getCarrierName(q)).filter(Boolean))
  ).sort();

  const visibleQuotes = quotes
    .filter((quote: any) => {
      const matchFilter = quoteMatchesFilter(quote, serviceFilter, carrierFilter);
      if (!matchFilter) return false;
      if (quoteSearchTerm.trim()) {
        const term = quoteSearchTerm.toLowerCase();
        const cName = getCarrierName(quote).toLowerCase();
        const sName = cleanCustomerServiceName(quote).toLowerCase();
        return cName.includes(term) || sName.includes(term);
      }
      return true;
    })
    .sort((a: any, b: any) => {
      const priceA = Number(a.customerPrice || a.total || 0);
      const priceB = Number(b.customerPrice || b.total || 0);
      if (quoteSortBy === 'price_asc') return priceA - priceB;
      if (quoteSortBy === 'savings_desc') {
        const savingsA = priceA * 0.20;
        const savingsB = priceB * 0.20;
        return savingsB - savingsA;
      }
      if (quoteSortBy === 'speed_asc') {
        const daysA = Number(a.estimatedDaysMin || a.estimatedDays || 99);
        const daysB = Number(b.estimatedDaysMin || b.estimatedDays || 99);
        return daysA - daysB;
      }
      return 0;
    });

  const handleLoadAddress = (type: 'sender' | 'recipient', addressId: string) => {
    if (!addressId) return;
    const addr = addressBook.find(a => a.id === addressId);
    if (!addr) return;

    if (type === 'sender') {
      setSenderDetails({
        ...senderDetails,
        name: addr.name,
        company: addr.company,
        email: addr.email || '',
        phone: addr.phone,
        addressLine1: addr.address,
        civicNumber: addr.civicNumber || '',
        formattedAddress: addr.formattedAddress || addr.address || '',
        googlePlaceId: addr.googlePlaceId || '',
        city: addr.city,
        zipCode: addr.zipCode,
        country: addr.country
      });
    } else {
      setRecipientDetails({
        ...recipientDetails,
        name: addr.name,
        company: addr.company,
        email: addr.email || '',
        phone: addr.phone,
        addressLine1: addr.address,
        civicNumber: addr.civicNumber || '',
        formattedAddress: addr.formattedAddress || addr.address || '',
        googlePlaceId: addr.googlePlaceId || '',
        city: addr.city,
        zipCode: addr.zipCode,
        country: addr.country
      });
    }
  };

  const applyGoogleAddress = (type: 'sender' | 'recipient', parts: any) => {
    const updater = type === 'sender' ? setSenderDetails : setRecipientDetails;
    updater((prev: any) => ({
      ...prev,
      addressLine1: parts.addressLine1 || prev.addressLine1,
      civicNumber: parts.civicNumber || prev.civicNumber,
      formattedAddress: parts.formattedAddress || prev.formattedAddress,
      googlePlaceId: parts.googlePlaceId || prev.googlePlaceId,
      city: parts.city || prev.city,
      zipCode: parts.zipCode || prev.zipCode,
      country: parts.country || prev.country,
    }));
  };

  const executeShipmentSubmit = async (isBorradorMode = false) => {
    if (quoteNeedsSenderPoint(selectedQuote) && !selectedDrops.sender) {
      alert('Selecciona un punto de recogida para continuar.');
      return;
    }
    if (quoteNeedsReceiverPoint(selectedQuote) && !selectedDrops.receiver) {
      alert('Selecciona un punto de entrega para continuar.');
      return;
    }
    setPaymentLoading(true);
    try {
      const isInternational = form.originCountry !== form.destCountry;
      const customsItems = isInternational ? [{
        description: customsDetails.description,
        origin: customsDetails.origin,
        quantity: Number(customsDetails.quantity || 1),
        weight: Number(customsDetails.weight || 1),
        value: Number(customsDetails.value || 1),
        hsCode: customsDetails.hsCode,
        sku: customsDetails.sku,
        exportReason: extraDetails.exportReason,
        termsOfTrade: extraDetails.termsOfTrade
      }] : [];

      const payload = {
        quoteId: selectedQuote.id,
        sender: senderDetails,
        recipient: recipientDetails,
        packages,
        customs: customsItems,
        content: extraDetails.content,
        reference: extraDetails.reference,
        declaredValue: Number(extraDetails.declaredValue || 15),
        exportReason: extraDetails.exportReason,
        termsOfTrade: extraDetails.termsOfTrade,
        manifest: isBorradorMode ? 0 : extraDetails.manifest,
        paymentMethod: shipmentPaymentMethod,
        services: quoteNeedsAnyPoint(selectedQuote) ? { drops: { ...(selectedDrops.sender ? { sender: selectedDrops.sender } : {}), ...(selectedDrops.receiver ? { receiver: selectedDrops.receiver } : {}) } } : undefined
      };

      const res = await api.createShipment(payload);
      if (res?.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      if (storeOrderContext?.id && res?.shipment?.id) {
        await api.linkStoreOrderShipment(storeOrderContext.id, res.shipment.id).catch(() => null);
      }
      if (res.pendingLabel || res.pendingPayment || res.isDraft) {
        alert(res.message || 'Tu envío fue recibido y queda en preparación.');
      } else {
        alert('Envío creado correctamente.');
      }
      clearGuestQuoteSession();
      navigate(storeOrderContext?.id ? '/panel/stores' : '/panel/shipments');
    } catch (err: any) {
      alert(err.message || 'Error al completar el envío. Fue guardado como borrador.');
      navigate('/panel/shipments');
    } finally {
      setPaymentLoading(false);
    }
  };

  if (activeStep === 'complete') {
    const isInternational = form.originCountry !== form.destCountry;
    const walletCurrency = String(profile?.currency || currency || 'EUR').toUpperCase();
    const requiredWalletAmount = convert(Number(selectedQuote.total || 0), selectedQuote.currency || form.currency || walletCurrency);
    const isBalanceEnough = Number(profile?.balance || 0) >= requiredWalletAmount;
    const needsSenderPoint = quoteNeedsSenderPoint(selectedQuote);
    const needsReceiverPoint = quoteNeedsReceiverPoint(selectedQuote);
    const pointSelectionReady = (!needsSenderPoint || Boolean(selectedDrops.sender)) && (!needsReceiverPoint || Boolean(selectedDrops.receiver));

    return (
      <div className="py-2 md:py-4 max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <button 
            onClick={() => setActiveStep('quote')} 
            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Cotizaciones
          </button>
          <div className="text-right">
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">Paso 2 de 2</span>
            <h2 className="text-sm font-bold text-blue-600 dark:text-neon-cyan">Detalles del Envío</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Area */}
          <div className="col-span-1 lg:col-span-8 space-y-8">
            {(needsSenderPoint || needsReceiverPoint) && (
              <div className="glass-panel p-6 rounded-3xl border border-blue-100 dark:border-blue-900/40 space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-neon-cyan">Puntos autorizados</p>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mt-1">Selecciona los puntos requeridos para este servicio</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">Los puntos disponibles vienen directamente de la red logística y se muestran en Google Maps.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {needsSenderPoint && (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white/60 dark:bg-dark-900/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-white">Punto de recogida</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">El remitente deja el paquete en este punto.</p>
                        </div>
                        <MapPin className="w-5 h-5 text-blue-500" />
                      </div>
                      {selectedDrops.sender ? (
                        <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3">
                          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">Punto seleccionado correctamente</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{getDropPointTitle(selectedDrops.sender)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{getDropPointAddress(selectedDrops.sender)}</p>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">Selecciona un punto para continuar.</p>
                      )}
                      <button type="button" onClick={() => setDropPointModal({ open: true, direction: 'sender' })} className="mt-3 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black">
                        {selectedDrops.sender ? 'Cambiar punto' : 'Elegir punto de recogida'}
                      </button>
                    </div>
                  )}
                  {needsReceiverPoint && (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white/60 dark:bg-dark-900/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-white">Punto de entrega</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">El destinatario recogerá el paquete aquí.</p>
                        </div>
                        <MapPin className="w-5 h-5 text-cyan-500" />
                      </div>
                      {selectedDrops.receiver ? (
                        <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3">
                          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">Punto seleccionado correctamente</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{getDropPointTitle(selectedDrops.receiver)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{getDropPointAddress(selectedDrops.receiver)}</p>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">Selecciona un punto para continuar.</p>
                      )}
                      <button type="button" onClick={() => setDropPointModal({ open: true, direction: 'receiver' })} className="mt-3 w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black">
                        {selectedDrops.receiver ? 'Cambiar punto' : 'Elegir punto de entrega'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sender Address */}
            <div className="glass-panel p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-500 dark:text-neon-cyan" /> Datos del Remitente
                </h3>
                {addressBook.filter(a => a.type === 'sender').length > 0 && (
                  <select 
                    onChange={(e) => handleLoadAddress('sender', e.target.value)}
                    className="text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-dark-900 px-3 py-1.5 font-bold text-gray-600 dark:text-gray-300 outline-none"
                  >
                    <option value="">-- Usar Dirección Guardada --</option>
                    {addressBook.filter(a => a.type === 'sender').map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.city})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Nombre Completo *</label>
                  <input required type="text" placeholder="Juan Pérez" value={senderDetails.name} onChange={e => setSenderDetails({...senderDetails, name: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Empresa (Opcional)</label>
                  <input type="text" placeholder="Mi Empresa S.L." value={senderDetails.company} onChange={e => setSenderDetails({...senderDetails, company: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Email *</label>
                  <input required type="email" placeholder="correo@remitente.com" value={senderDetails.email} onChange={e => setSenderDetails({...senderDetails, email: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Teléfono *</label>
                  <input required type="text" placeholder="+34 600 000 000" value={senderDetails.phone} onChange={e => setSenderDetails({...senderDetails, phone: e.target.value})} className="input-dynamic" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección Google *</label>
                  <AddressAutocomplete
                    required
                    value={senderDetails.addressLine1}
                    civicNumber={senderDetails.civicNumber}
                    countryCode={senderDetails.country || form.originCountry}
                    placeholder="Busca la calle en el país de origen"
                    onChange={(value) => setSenderDetails(prev => ({...prev, addressLine1: value}))}
                    onCivicNumberChange={(value) => setSenderDetails(prev => ({...prev, civicNumber: value}))}
                    onSelectAddress={(parts) => applyGoogleAddress('sender', parts)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Número cívico *</label>
                  <input required type="text" placeholder="Ej: 89" value={senderDetails.civicNumber} onChange={e => setSenderDetails({...senderDetails, civicNumber: e.target.value})} className="input-dynamic" />
                  <p className="mt-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500">Se rellena al seleccionar una dirección de Google.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección confirmada</label>
                  <input readOnly type="text" value={senderDetails.formattedAddress || senderDetails.addressLine1} className="input-dynamic bg-gray-100 dark:bg-dark-800 text-gray-500 cursor-default" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección Línea 2 (Opcional)</label>
                  <input type="text" placeholder="Polígono Industrial Oeste, Nave 4" value={senderDetails.addressLine2} onChange={e => setSenderDetails({...senderDetails, addressLine2: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Ciudad *</label>
                  <input required type="text" placeholder="Madrid" value={senderDetails.city} onChange={e => setSenderDetails({...senderDetails, city: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Código Postal *</label>
                  <input required disabled type="text" value={senderDetails.zipCode} className="input-dynamic bg-gray-100 dark:bg-dark-800 text-gray-500 cursor-not-allowed" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input id="save-sender-book" type="checkbox" checked={senderDetails.saveToBook} onChange={e => setSenderDetails({...senderDetails, saveToBook: e.target.checked})} className="rounded text-blue-500 focus:ring-blue-500" />
                <label htmlFor="save-sender-book" className="text-xs text-gray-600 dark:text-gray-300 font-bold select-none cursor-pointer">Guardar en mi libreta de direcciones</label>
              </div>
            </div>

            {/* Recipient Address */}
            <div className="glass-panel p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-500 dark:text-neon-cyan" /> Datos del Destinatario
                </h3>
                {addressBook.filter(a => a.type === 'recipient').length > 0 && (
                  <select 
                    onChange={(e) => handleLoadAddress('recipient', e.target.value)}
                    className="text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-dark-900 px-3 py-1.5 font-bold text-gray-600 dark:text-gray-300 outline-none"
                  >
                    <option value="">-- Usar Dirección Guardada --</option>
                    {addressBook.filter(a => a.type === 'recipient').map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.city})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Nombre Completo *</label>
                  <input required type="text" placeholder="Ana Gómez" value={recipientDetails.name} onChange={e => setRecipientDetails({...recipientDetails, name: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Empresa (Opcional)</label>
                  <input type="text" placeholder="Empresa Destino S.A." value={recipientDetails.company} onChange={e => setRecipientDetails({...recipientDetails, company: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Email (Opcional)</label>
                  <input type="email" placeholder="correo@destinatario.com" value={recipientDetails.email} onChange={e => setRecipientDetails({...recipientDetails, email: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Teléfono *</label>
                  <input required type="text" placeholder="+34 600 000 000" value={recipientDetails.phone} onChange={e => setRecipientDetails({...recipientDetails, phone: e.target.value})} className="input-dynamic" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección Google *</label>
                  <AddressAutocomplete
                    required
                    value={recipientDetails.addressLine1}
                    civicNumber={recipientDetails.civicNumber}
                    countryCode={recipientDetails.country || form.destCountry}
                    placeholder="Busca la calle en el país de destino"
                    onChange={(value) => setRecipientDetails(prev => ({...prev, addressLine1: value}))}
                    onCivicNumberChange={(value) => setRecipientDetails(prev => ({...prev, civicNumber: value}))}
                    onSelectAddress={(parts) => applyGoogleAddress('recipient', parts)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Número cívico *</label>
                  <input required type="text" placeholder="Ej: 45" value={recipientDetails.civicNumber} onChange={e => setRecipientDetails({...recipientDetails, civicNumber: e.target.value})} className="input-dynamic" />
                  <p className="mt-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500">Se rellena al seleccionar una dirección de Google.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección confirmada</label>
                  <input readOnly type="text" value={recipientDetails.formattedAddress || recipientDetails.addressLine1} className="input-dynamic bg-gray-100 dark:bg-dark-800 text-gray-500 cursor-default" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Dirección Línea 2 (Opcional)</label>
                  <input type="text" placeholder="Bloque C, Escalera Derecha" value={recipientDetails.addressLine2} onChange={e => setRecipientDetails({...recipientDetails, addressLine2: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Ciudad *</label>
                  <input required type="text" placeholder="Berlin" value={recipientDetails.city} onChange={e => setRecipientDetails({...recipientDetails, city: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Código Postal *</label>
                  <input required disabled type="text" value={recipientDetails.zipCode} className="input-dynamic bg-gray-100 dark:bg-dark-800 text-gray-500 cursor-not-allowed" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input id="save-recipient-book" type="checkbox" checked={recipientDetails.saveToBook} onChange={e => setRecipientDetails({...recipientDetails, saveToBook: e.target.checked})} className="rounded text-blue-500 focus:ring-blue-500" />
                <label htmlFor="save-recipient-book" className="text-xs text-gray-600 dark:text-gray-300 font-bold select-none cursor-pointer">Guardar en mi libreta de direcciones</label>
              </div>
            </div>

            {/* Shipment Content & Declaration details */}
            <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-5 text-sm text-blue-900 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
            <p className="font-black mb-2">Datos necesarios para generar la etiqueta sin retrasos</p>
            <p className="leading-relaxed">
              Selecciona la dirección sugerida por Google en el país correcto. El número cívico, ciudad y código postal deben quedar completos antes de generar la etiqueta. En envíos internacionales agrega contenido real, valor declarado y datos de mercancía.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
              <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500 dark:text-neon-cyan" /> Detalles de Mercancía & Valor
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Contenido de envío *</label>
                  <input required type="text" placeholder="Ej: Ropa y calzado deportivo" value={extraDetails.content} onChange={e => setExtraDetails({...extraDetails, content: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Valor Declarado (EUR) *</label>
                  <input required type="number" value={extraDetails.declaredValue} onChange={e => setExtraDetails({...extraDetails, declaredValue: Number(e.target.value)})} className="input-dynamic" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Referencia del Cliente (Opcional)</label>
                  <input type="text" placeholder="Ej: Pedido #Shopify-9483" value={extraDetails.reference} onChange={e => setExtraDetails({...extraDetails, reference: e.target.value})} className="input-dynamic" />
                </div>
              </div>
            </div>

            {/* Customs Form (for international / customs shipments) */}
            {isInternational && (
              <div className="glass-panel p-6 rounded-3xl border border-red-200/50 dark:border-red-900/30 bg-red-500/[0.01] space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <p className="text-xs text-amber-800 dark:text-amber-400 font-bold flex items-center gap-1">
                    ⚠️ Información de Aduanas Requerida (Envío Internacional)
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                    Tu envío cruza fronteras aduaneras. Recuerda que para envíos de ParcelABC que requieran aduana, solo se permite **un paquete por envío**.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Descripción Detallada *</label>
                    <input required type="text" value={customsDetails.description} onChange={e => setCustomsDetails({...customsDetails, description: e.target.value})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">País de Origen *</label>
                    <CountrySelect value={customsDetails.origin} onChange={(code) => setCustomsDetails({...customsDetails, origin: code})} lang={language || "es"} buttonClassName="input-dynamic flex items-center gap-2 text-left" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Cantidad *</label>
                    <input required type="number" value={customsDetails.quantity} onChange={e => setCustomsDetails({...customsDetails, quantity: Number(e.target.value)})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Peso Neto Unitario (Kg) *</label>
                    <input required type="number" step="0.001" value={customsDetails.weight} onChange={e => setCustomsDetails({...customsDetails, weight: Number(e.target.value)})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Valor Unitario (EUR) *</label>
                    <input required type="number" value={customsDetails.value} onChange={e => setCustomsDetails({...customsDetails, value: Number(e.target.value)})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Código HS (Opcional)</label>
                    <input type="text" placeholder="Ej: 6109.10" value={customsDetails.hsCode} onChange={e => setCustomsDetails({...customsDetails, hsCode: e.target.value})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">SKU (Opcional)</label>
                    <input type="text" placeholder="Ej: SKU-SHIRT-M" value={customsDetails.sku} onChange={e => setCustomsDetails({...customsDetails, sku: e.target.value})} className="input-dynamic" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Motivo de Exportación</label>
                    <select value={extraDetails.exportReason} onChange={e => setExtraDetails({...extraDetails, exportReason: e.target.value})} className="input-dynamic font-bold">
                      <option value="Sale">Venta (Sale)</option>
                      <option value="Gift">Regalo (Gift)</option>
                      <option value="Sample">Muestra (Sample)</option>
                      <option value="Return">Devolución (Return)</option>
                      <option value="Documents">Documentos (Documents)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Términos Comerciales (Incoterm)</label>
                    <select value={extraDetails.termsOfTrade} onChange={e => setExtraDetails({...extraDetails, termsOfTrade: e.target.value})} className="input-dynamic font-bold">
                      <option value="DAP">DAP (Entregado en punto)</option>
                      <option value="DDP">DDP (Aranceles pagados)</option>
                      <option value="DDU">DDU (Aranceles no pagados)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Quote Summary & Checkout */}
          <div className="col-span-1 lg:col-span-4 space-y-6 sticky top-20">
            <div className="glass-panel p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
              <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Resumen de Servicio</h3>
              
              <div className="flex items-center gap-3">
                {getCarrierLogo(getCarrierName(selectedQuote), cleanCustomerServiceName(selectedQuote))}
                <div>
                  <p className="text-md font-black text-gray-900 dark:text-white">{getCarrierName(selectedQuote)}</p>
                  <p className="text-xs font-bold text-blue-500 dark:text-neon-cyan">{cleanCustomerServiceName(selectedQuote)}</p>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('route_label') || 'Trayecto'}:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{form.originZip} ({form.originCountry}) → {form.destZip} ({form.destCountry})</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('estimated_delivery_label') || 'Entrega estimada'}:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{selectedQuote.estimatedDays} {t('days_unit') || t('days') || 'dias'}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('total_packages_label') || 'Bultos totales'}:</span>
                  {/* SHIP24GO_MULTI_PKG_UI_V1 */}
                  <span className="font-bold text-gray-800 dark:text-gray-200">{(packages || []).reduce((s: number, p: any) => s + Math.max(1, Number(p.qty || p.quantity || 1)), 0)}</span>
                </div>
                {needsSenderPoint && (
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 gap-3">
                    <span>{t('pickup_label') || 'Recogida'}:</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-right">{selectedDrops.sender ? getDropPointTitle(selectedDrops.sender) : (t('pending_status') || 'Pendiente')}</span>
                  </div>
                )}
                {needsReceiverPoint && (
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 gap-3">
                    <span>Entrega:</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-right">{selectedDrops.receiver ? getDropPointTitle(selectedDrops.receiver) : (t('pending_status') || 'Pendiente')}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Precio Total:</span>
                {/* SHIP24GO_FX_FORMAT_QUOTE_V1 */}
                <span className="text-3xl font-black text-blue-600 dark:text-neon-cyan">{format(selectedQuote.total, selectedQuote.currency || form.currency || currency)}</span>
              </div>
            </div>

            {/* Balance & checkout button card */}
            <div className="glass-panel p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tu Monedero</span>
                <span className="text-md font-black text-gray-900 dark:text-white">{format(Number(profile?.balance || 0), walletCurrency)}</span>
              </div>

              {paypalAvailable && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Método de pago</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShipmentPaymentMethod('wallet')}
                      className={`py-2.5 rounded-xl border text-xs font-black transition-colors ${shipmentPaymentMethod === 'wallet' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-neon-cyan' : 'border-gray-200 text-gray-500 dark:border-gray-800'}`}
                    >
                      Wallet DoorDrop
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipmentPaymentMethod('paypal')}
                      className={`py-2.5 rounded-xl border text-xs font-black transition-colors ${shipmentPaymentMethod === 'paypal' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-neon-cyan' : 'border-gray-200 text-gray-500 dark:border-gray-800'}`}
                    >
                      PayPal / tarjeta
                    </button>
                  </div>
                </div>
              )}

              {shipmentPaymentMethod === 'paypal' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-blue-700 dark:text-blue-300 font-bold">
                    PayPal cobrará el equivalente en EUR. El wallet no se utilizará.
                  </div>
                  <button
                    onClick={() => executeShipmentSubmit(false)}
                    disabled={paymentLoading || !pointSelectionReady || !senderDetails.name || !recipientDetails.name || !senderDetails.addressLine1 || !recipientDetails.addressLine1 || !senderDetails.civicNumber || !recipientDetails.civicNumber}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-black rounded-2xl shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {paymentLoading ? 'Abriendo PayPal...' : 'Pagar envío con PayPal'}
                  </button>
                </div>
              ) : isBalanceEnough ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                    <CheckCircle className="w-4 h-4 shrink-0" /> Saldo disponible suficiente.
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input id="pabc-manifest-check" type="checkbox" checked={extraDetails.manifest === 1} onChange={e => setExtraDetails({...extraDetails, manifest: e.target.checked ? 1 : 0})} className="rounded text-blue-500" />
                    <label htmlFor="pabc-manifest-check" className="text-[10px] text-gray-600 dark:text-gray-300 leading-normal font-semibold cursor-pointer">{t('pay_and_label_now') || 'Pagar y generar etiqueta de inmediato'}</label>
                  </div>

                  <button
                    onClick={() => executeShipmentSubmit(false)}
                    disabled={paymentLoading || !pointSelectionReady || !senderDetails.name || !recipientDetails.name || !senderDetails.addressLine1 || !recipientDetails.addressLine1 || !senderDetails.civicNumber || !recipientDetails.civicNumber}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-black rounded-2xl shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {paymentLoading ? (t('processing') || 'Procesando...') : (t('pay_create_real') || 'Pagar y crear envio real')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-xs text-amber-700 dark:text-amber-400 font-semibold leading-relaxed">
                    {t('wallet_insufficient')}
                  </div>

                  <button
                    onClick={() => executeShipmentSubmit(false)}
                    disabled={paymentLoading || !pointSelectionReady || !senderDetails.name || !recipientDetails.name || !senderDetails.addressLine1 || !recipientDetails.addressLine1 || !senderDetails.civicNumber || !recipientDetails.civicNumber}
                    className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-2xl shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {paymentLoading ? (t('wallet_sending') || 'Enviando...') : (t('wallet_send_prep') || 'Enviar a preparacion')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <DropPointModal
          open={dropPointModal.open}
          direction={dropPointModal.direction}
          quote={selectedQuote}
          address={dropPointModal.direction === 'sender' ? senderDetails : recipientDetails}
          onClose={() => setDropPointModal(prev => ({ ...prev, open: false }))}
          onSelect={(point) => setSelectedDrops(prev => ({ ...prev, [dropPointModal.direction]: point }))}
        />
      </div>
    );
  }

  return (
    <div className="py-2 md:py-4 max-w-5xl mx-auto">
      <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-3">
        <Package className="w-8 h-8 text-blue-500 dark:text-neon-cyan" /> 
        Crear Nuevo Envío
      </h1>
      
      <div className="glass-panel p-4 sm:p-6 md:p-8 rounded-3xl mb-8 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-blue-300/20 dark:bg-neon-cyan/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] pointer-events-none"></div>
        <form onSubmit={handleQuote} className="relative z-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/50 dark:bg-dark-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700/50 group hover:border-blue-400 dark:hover:border-neon-cyan/50 transition-colors">
               <label className="block text-xs font-bold text-blue-600 dark:text-neon-cyan uppercase tracking-wider mb-3 flex items-center">
                 <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-neon-cyan mr-2 animate-pulse"></div>
                 {t('origin') || 'Origen'}
               </label>
               <div className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-semibold text-gray-500 mb-1">País</label>
                   <CountrySelect value={form.originCountry} onChange={(code) => setForm({...form, originCountry: code})} lang={language || "es"} buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-semibold text-gray-500 mb-1">Código Postal</label>
                   <ZipCodeAutocomplete 
                     required 
                     value={form.originZip} 
                     onChange={(val) => setForm({...form, originZip: val})}
                     onResolved={(data) => setForm(prev => ({...prev, originZip: data.postalCode || prev.originZip, originCity: data.city || prev.originCity}))}
                     placeholder="Ej: 28001"
                     countryCode={form.originCountry}
                   />
                   <input
                     type="text"
                     value={form.originCity}
                     onChange={(e) => setForm({...form, originCity: e.target.value})}
                     placeholder="Ciudad / Localidad"
                     className="input-dynamic font-medium mt-2"
                   />
                 </div>
               </div>
            </div>

            <div className="bg-white/50 dark:bg-dark-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700/50 group hover:border-blue-400 dark:hover:border-neon-cyan/50 transition-colors">
               <label className="block text-xs font-bold text-blue-600 dark:text-neon-cyan uppercase tracking-wider mb-3 flex items-center">
                 <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-neon-cyan mr-2 animate-pulse"></div>
                 {t('destination') || 'Destino'}
               </label>
               <div className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-semibold text-gray-500 mb-1">País</label>
                   <CountrySelect value={form.destCountry} onChange={(code) => setForm({...form, destCountry: code})} lang={language || "es"} buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-semibold text-gray-500 mb-1">Código Postal</label>
                   <ZipCodeAutocomplete 
                     required 
                     value={form.destZip} 
                     onChange={(val) => setForm({...form, destZip: val})}
                     onResolved={(data) => setForm(prev => ({...prev, destZip: data.postalCode || prev.destZip, destCity: data.city || prev.destCity}))}
                     placeholder="Ej: 10115"
                     countryCode={form.destCountry}
                   />
                   <input
                     type="text"
                     value={form.destCity}
                     onChange={(e) => setForm({...form, destCity: e.target.value})}
                     placeholder="Ciudad / Localidad"
                     className="input-dynamic font-medium mt-2"
                   />
                 </div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30">
              <p className="text-xs font-bold text-blue-700 dark:text-neon-cyan">Mostraremos hasta 10 opciones disponibles con el precio final ya calculado.</p>
              <p className="text-[11px] text-blue-600/80 dark:text-neon-cyan/80 mt-1">La cotización usará la moneda configurada en tu cuenta. Puedes filtrar por económico, rápido, oficina/punto o servicio a domicilio.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SERVICE_FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setServiceFilter(item.key)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition-all ${serviceFilter === item.key ? 'border-blue-500 bg-white text-blue-700 shadow-sm dark:border-neon-cyan dark:bg-dark-900 dark:text-neon-cyan' : 'border-blue-100 bg-white/60 text-blue-600 hover:bg-white dark:border-blue-900/40 dark:bg-dark-900/30 dark:text-blue-200'}`}
                    title={item.hint}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Packages configuration */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('pkg_details')}</h3>
              <button type="button" onClick={addPackage} className="text-xs font-bold text-blue-600 dark:text-neon-cyan flex items-center gap-1 hover:underline cursor-pointer">
                <Plus className="w-4 h-4" /> {t('pkg_add')}
              </button>
            </div>
            
            <div className="space-y-4">
              {packages.map((pkg, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-gray-50 dark:bg-dark-900/30 border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row items-center gap-4 relative animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-neon-cyan/20 text-blue-600 dark:text-neon-cyan flex items-center justify-center font-bold text-xs shrink-0">
                    {idx + 1}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
                    <div>
                      <label className="block text-[10px] text-gray-400 font-semibold mb-1">Largo (cm)</label>
                      <input required type="number" min="1" value={pkg.length} onChange={(e) => updatePackage(idx, 'length', parseInt(e.target.value) || 0)} className="input-dynamic font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-semibold mb-1">Ancho (cm)</label>
                      <input required type="number" min="1" value={pkg.width} onChange={(e) => updatePackage(idx, 'width', parseInt(e.target.value) || 0)} className="input-dynamic font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-semibold mb-1">Alto (cm)</label>
                      <input required type="number" min="1" value={pkg.height} onChange={(e) => updatePackage(idx, 'height', parseInt(e.target.value) || 0)} className="input-dynamic font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-semibold mb-1">Peso (kg)</label>
                      <input required type="number" min="0.1" step="0.1" value={pkg.weight} onChange={(e) => updatePackage(idx, 'weight', parseFloat(e.target.value) || 0)} className="input-dynamic font-semibold" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[10px] text-gray-400 font-semibold mb-1">Cantidad</label>
                      <input required type="number" min="1" value={pkg.qty} onChange={(e) => updatePackage(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))} className="input-dynamic font-semibold" />
                    </div>
                  </div>

                  {packages.length > 1 && (
                    <button type="button" onClick={() => removePackage(idx)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl shrink-0 cursor-pointer transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <ShippingTermsConsent onAcceptedChange={setShippingTermsAccepted} />
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading || !shippingTermsAccepted || !form.originZip || !form.destZip}
              className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-neon-cyan dark:to-neon-green text-white dark:text-gray-900 px-8 py-3.5 rounded-full font-black text-sm transition-all hover:scale-105 shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                  {t('searching')}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {t('searchRates') || 'Buscar Tarifas'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 text-xs font-bold text-red-600 dark:text-red-400 mb-8 animate-in fade-in duration-200">
          ⚠️ {error}
        </div>
      )}

      {/* Quote options list */}
      {/* SHIP24GO_QUOTE_LOADER_SCROLL_V3 */}
      <div ref={resultsAnchorRef} id="quote-results-anchor" data-ship24go-ux="20260723v4" className="scroll-mt-6" />

      {loading && (
        <div className="mt-8 glass-panel rounded-3xl p-8 border border-blue-200/40 dark:border-neon-cyan/30 bg-gradient-to-br from-blue-50/80 to-cyan-50/40 dark:from-slate-900/80 dark:to-slate-950/90 text-center shadow-lg">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-blue-200 dark:border-slate-700 border-t-blue-600 dark:border-t-neon-cyan animate-spin" />
          <p className="text-lg font-black text-gray-900 dark:text-white mb-1">{t('quote_loading_title') || 'Buscando las mejores tarifas...'}</p>
          <p className="text-sm font-semibold text-blue-600 dark:text-neon-cyan mb-3">{loadingPhase || t('quote_loading_phase2') || 'Consultando transportistas en paralelo...'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {t('quote_loading_hint') || 'Estamos consultando varios proveedores a la vez.'}
          </p>
          <div className="mt-5 h-1.5 w-full max-w-sm mx-auto rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 dark:from-neon-cyan dark:to-neon-green animate-pulse" style={{ width: '72%' }} />
          </div>
        </div>
      )}

      {/* SHIP24GO_QUOTE_EMPTY_STATE_V2 */}
      {!loading && !error && quotes.length === 0 && (
        <div className="mt-8 glass-panel rounded-3xl p-8 border border-dashed border-gray-200 dark:border-gray-700 text-center">
          <Package className="w-10 h-10 mx-auto mb-3 text-blue-500 dark:text-neon-cyan opacity-80" />
          <p className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">{t('quote_ready_title') || 'Listo para cotizar'}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {t('quote_ready_hint') || 'Completa origen, destino y paquetes.'}
          </p>
        </div>
      )}

      {!loading && !!error && quotes.length === 0 && (
        <div className="mt-8 rounded-3xl p-6 border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 text-sm font-semibold">
          {error}
        </div>
      )}

      {quotes.length > 0 && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* TOP CONTROLS CARD: COUNT + MEMBERSHIP SIMULATION SWITCHER */}
          <div className="bg-white dark:bg-dark-900 p-4 sm:p-5 rounded-3xl border border-gray-200/90 dark:border-gray-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-neon-cyan flex items-center justify-center font-black">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <span>{t('availableOptions') || 'Opciones Disponibles'}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white dark:bg-neon-cyan dark:text-gray-900">
                    {visibleQuotes.length} / {quotes.length}
                  </span>
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {packages.length} {t('parcels_summary') || 'bultos'} ({packages.reduce((sum: number, p: any) => sum + Number(p.weight || 0) * Math.max(1, Number(p.qty || 1)), 0).toFixed(1)} kg) · {form.originCity || form.originZip} → {form.destCity || form.destZip}
                </p>
              </div>
            </div>

            {/* INTERACTIVE MEMBERSHIP SIMULATION TARIFF PILLS */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0 flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-purple-500" />
                <span>Simular Tarifa:</span>
              </span>
              <div className="inline-flex bg-gray-100 dark:bg-dark-800 p-1 rounded-2xl text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setQuotePlanSimulation(0)}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                    quotePlanSimulation === 0
                      ? 'bg-white dark:bg-dark-900 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Estándar
                </button>
                <button
                  type="button"
                  onClick={() => setQuotePlanSimulation(0.10)}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer ${
                    quotePlanSimulation === 0.10
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Crown className="w-3 h-3" />
                  <span>PRO (-10%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuotePlanSimulation(0.20)}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer ${
                    quotePlanSimulation === 0.20
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>ENTERPRISE (-20%)</span>
                </button>
              </div>
            </div>
          </div>

          {/* STAR ENTERPRISE HERO BANNER */}
          {Number(profile?.planDiscountPercent || 0) === 0 && (
            <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-purple-900/15 via-purple-600/15 to-indigo-600/15 border-2 border-purple-500/50 dark:border-purple-400/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5 text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/30">
                  <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider">
                      {t('enterprise_best_value') || 'MÁXIMO AHORRO'}
                    </span>
                    <p className="text-sm sm:text-base font-black text-gray-900 dark:text-white">
                      {t('membership_banner_title') || '¡Ahorra un 20% en cada envío con el Plan Enterprise!'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {t('membership_banner_sub') || 'Obtén la tarifa más baja del mercado en todos tus paquetes. Plan Pro (-10%) por 29.99 €/mes · Plan Enterprise (-20%) por 50.00 €/mes.'}
                  </p>
                </div>
              </div>
              <Link
                to="/panel/billing"
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black shrink-0 transition-all hover:scale-105 shadow-md shadow-purple-500/30 flex items-center gap-2"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>{t('membership_banner_btn') || 'Activar Plan & Ahorrar 20%'}</span>
              </Link>
            </div>
          )}

          {/* FILTERS & SEARCH ROW */}
          <div className="glass-panel p-4 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-3">
            {/* Row 1: Modalities */}
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                {t('modality_filter_title') || 'Modalidad de Recogida y Entrega'}:
              </p>
              <div className="flex flex-wrap gap-2">
                {SERVICE_FILTERS.map((item: any) => {
                  const isActive = serviceFilter === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setServiceFilter(item.key)}
                      title={item.hint}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 dark:bg-neon-cyan dark:text-gray-900 scale-105'
                          : 'bg-gray-100 hover:bg-gray-200 dark:bg-dark-900/60 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-800'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{t(`filter_${item.key}`) || item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Carrier Filter Chips & Live Search & Sort By */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Carrier Chips */}
              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                  {t('carrier_filter_title') || 'Transportista'}:
                </span>
                <button
                  type="button"
                  onClick={() => setCarrierFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    carrierFilter === 'all'
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {t('all_carriers') || 'Todos'}
                </button>
                {availableCarriers.map((cName: string) => {
                  const isActive = carrierFilter.toLowerCase() === cName.toLowerCase();
                  return (
                    <button
                      key={cName}
                      type="button"
                      onClick={() => setCarrierFilter(isActive ? 'all' : cName)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white dark:bg-neon-cyan dark:text-gray-900 shadow-xs'
                          : 'bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {cName}
                    </button>
                  );
                })}
              </div>

              {/* Live Search + Sort Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar transportista..."
                    value={quoteSearchTerm}
                    onChange={(e) => setQuoteSearchTerm(e.target.value)}
                    className="input-dynamic text-xs font-semibold pl-8 pr-7 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 text-gray-800 dark:text-gray-200 w-44"
                  />
                  {quoteSearchTerm && (
                    <button onClick={() => setQuoteSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={quoteSortBy}
                  onChange={(e: any) => setQuoteSortBy(e.target.value)}
                  aria-label={t('sort_by') || 'Ordenar por'}
                  className="input-dynamic text-xs font-bold py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 text-gray-800 dark:text-gray-200 cursor-pointer shadow-sm"
                >
                  <option value="price_asc">🏷️ {t('sort_price_asc') || 'Menor precio'}</option>
                  <option value="speed_asc">⚡ {t('sort_speed_asc') || 'Más rápido'}</option>
                  <option value="savings_desc">✨ {t('sort_savings_desc') || 'Mayor ahorro membresía'}</option>
                </select>
              </div>
            </div>
          </div>

          {/* QUOTE CARDS LIST WITH ACCORDION & 20% DISCOUNT */}
          <div className="space-y-4">
            {visibleQuotes.map((q: any) => {
              const basePrice = Number(q.customerPrice || q.total || 0);
              const activeCurrency = q.currency || form.currency || currency;
              const isExpanded = expandedCardId === q.id;

              // Simulation discount or user active plan discount
              const effectiveDiscount = quotePlanSimulation > 0 ? quotePlanSimulation : Number(q.planDiscountPercent || 0) / 100;
              const finalPrice = effectiveDiscount > 0 ? basePrice * (1 - effectiveDiscount) : basePrice;
              const simulatedSavings = basePrice * effectiveDiscount;

              const priceEnterprise = basePrice * 0.80;
              const savingsEnterprise = basePrice * 0.20;
              const pricePro = basePrice * 0.90;
              const savingsPro = basePrice * 0.10;

              const pointInfo = quotePointTypes(q);
              const isDeparturePoint = pointInfo.departure === 'point';
              const isArrivalPoint = pointInfo.arrival === 'point';
              const carrierName = getCarrierName(q);

              return (
                <div
                  key={q.id}
                  className="bg-white dark:bg-dark-900 rounded-3xl border border-gray-200/90 dark:border-gray-800 hover:border-blue-400/60 dark:hover:border-neon-cyan/60 transition-all duration-200 shadow-sm hover:shadow-md p-5"
                  style={{ borderColor: q.providerColor ? `${q.providerColor}44` : undefined }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    
                    {/* Left: Carrier Icon, Brand & Details */}
                    <div className="flex items-start sm:items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        {q.providerLogo ? (
                          <img
                            src={q.providerLogo}
                            alt={carrierName}
                            className="w-14 h-14 rounded-2xl object-contain bg-white border border-gray-100 dark:border-gray-800 shadow-xs p-1.5"
                          />
                        ) : (
                          getCarrierLogo(carrierName, q.service)
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black text-gray-900 dark:text-white truncate">
                            {carrierName}
                          </h3>
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-800 px-2.5 py-0.5 rounded-lg truncate">
                            {t('service_label') || 'Servicio'}: {cleanCustomerServiceName(q)}
                          </span>
                        </div>

                        {/* Transit Time & Modality Summary */}
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                          <span className="inline-flex items-center gap-1 font-bold text-gray-800 dark:text-gray-200">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            {t('estimatedDelivery') || 'Entrega estimada'}: <strong>{formatDeliveryText(q, t)}</strong>
                          </span>
                          <span className="text-gray-300 dark:text-gray-700 hidden sm:inline">•</span>
                          <span className="text-[11px] font-medium text-gray-500">
                            {packages.length} {t('parcels_summary') || 'bultos'}
                          </span>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className={`inline-flex items-center text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border gap-1 ${
                            isDeparturePoint
                              ? 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/30 dark:border-purple-900/40'
                              : 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/30 dark:border-blue-900/40'
                          }`}>
                            <Truck className="w-3 h-3" />
                            {isDeparturePoint ? (t('at_office') || 'En Oficina / Punto') : (t('at_home') || 'A Domicilio')}
                            <span>—</span>
                            {isArrivalPoint ? (t('at_office') || 'En Oficina / Punto') : (t('at_home') || 'A Domicilio')}
                          </span>

                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/40 gap-1">
                            <ShieldCheck className="w-3 h-3" /> {t('protected_price') || 'Precio protegido'}
                          </span>

                          <span className="inline-flex items-center text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30 px-2.5 py-0.5 rounded-full border border-sky-200 dark:border-sky-900/40 gap-1">
                            <Globe className="w-3 h-3" /> {t('realtime_tracking') || 'Rastreo 24/7'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Pricing Box & Action Buttons */}
                    <div className="flex items-center justify-between lg:flex-col lg:items-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-gray-800">
                      
                      <div className="text-left lg:text-right">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center lg:justify-end gap-1">
                          <span>{t('final_price') || 'PRECIO FINAL'}</span>
                          {effectiveDiscount > 0 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black">
                              -{(effectiveDiscount * 100).toFixed(0)}% {quotePlanSimulation > 0 ? 'SIMULADO' : (q.planName || 'PLAN')}
                            </span>
                          )}
                        </div>

                        {/* Big Price Display */}
                        <div className="flex items-baseline gap-1 lg:justify-end">
                          {effectiveDiscount > 0 && (
                            <span className="text-xs sm:text-sm line-through text-gray-400 font-bold">
                              {format(basePrice, activeCurrency)}
                            </span>
                          )}
                          <span className={`text-2xl sm:text-3xl font-black tracking-tight ${effectiveDiscount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                            {format(finalPrice, activeCurrency)}
                          </span>
                        </div>

                        {effectiveDiscount > 0 && (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                            {t('you_save') || 'Ahorras'} {format(simulatedSavings, activeCurrency)}
                          </span>
                        )}

                        {/* MEMBERSHIP PROMOTIONAL PILLS (PRO 10% & ENTERPRISE 20%) WHEN NO DISCOUNT */}
                        {effectiveDiscount === 0 && (
                          <div className="mt-2 flex flex-col items-end gap-1.5">
                            {/* Star Enterprise 20% Discount */}
                            <Link
                              to="/panel/billing"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-600/20 via-purple-500/15 to-indigo-600/20 hover:from-purple-600/30 hover:to-indigo-600/30 border-2 border-purple-500/50 text-purple-700 dark:text-purple-300 text-[11px] font-black transition-all hover:scale-105 shadow-xs"
                              title={`${t('with_plan_enterprise') || 'Con Plan Enterprise (20%)'}: ${format(priceEnterprise, activeCurrency)}`}
                            >
                              <Sparkles className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
                              <span>
                                {t('with_plan_enterprise') || 'Con Enterprise (20%)'}: <strong>{format(priceEnterprise, activeCurrency)}</strong>
                              </span>
                              <span className="ml-1 text-[9px] px-1.5 py-0.2 rounded-full bg-purple-600 text-white font-black tracking-wide">
                                -{format(savingsEnterprise, activeCurrency)}
                              </span>
                            </Link>

                            {/* Pro Plan 10% Discount */}
                            <Link
                              to="/panel/billing"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-[11px] font-bold transition-all hover:scale-105 shadow-xs"
                              title={`${t('with_plan_pro') || 'Con Plan Pro (10%)'}: ${format(pricePro, activeCurrency)}`}
                            >
                              <Crown className="w-3.5 h-3.5 text-amber-500" />
                              <span>
                                {t('with_plan_pro') || 'Con Pro (10%)'}: <strong>{format(pricePro, activeCurrency)}</strong>
                              </span>
                              <span className="ml-1 text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-extrabold">
                                -{format(savingsPro, activeCurrency)}
                              </span>
                            </Link>
                          </div>
                        )}
                      </div>

                      {/* Action Button & Expand Toggle */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSelectQuoteForPayment(q)}
                          disabled={loading}
                          className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-blue-600 dark:hover:bg-neon-cyan dark:hover:text-gray-900 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm hover:shadow-xl transition-all hover:-translate-y-0.5 cursor-pointer whitespace-nowrap"
                        >
                          {t('chooseService') || 'Elegir servicio'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedCardId(isExpanded ? null : q.id)}
                          className="p-3 rounded-2xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition cursor-pointer"
                          title="Ver detalles adicionales"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* EXPANDED DETAILS ACCORDION */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs space-y-2 animate-in fade-in duration-200">
                      <p className="font-bold text-gray-800 dark:text-gray-200">
                        Detalles y garantías del servicio:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Seguimiento y trazabilidad GPS en tiempo real</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Seguro básico estándar incluido sin costo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{isDeparturePoint ? 'Entrega en oficina/punto cercano' : 'Recogida directa en tu dirección'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{isArrivalPoint ? 'Retiro en punto/locker autorizado' : 'Entrega en puerta del destinatario'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleQuotes.length === 0 && (
              <div className="bg-white dark:bg-dark-900 rounded-3xl p-8 border border-gray-200 dark:border-gray-800 text-center space-y-3">
                <Package className="w-10 h-10 text-gray-400 mx-auto opacity-50" />
                <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                  {t('no_filter_match') || 'No se encontraron tarifas con los filtros actuales'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('no_filter_match_hint') || 'Prueba restableciendo los filtros o buscando por otro nombre de transportista.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setServiceFilter('all');
                    setCarrierFilter('all');
                    setQuoteSearchTerm('');
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-neon-cyan text-xs font-extrabold hover:underline cursor-pointer"
                >
                  {t('reset_filters') || 'Restablecer filtros'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CUSTOMER_SERVICE_TERMS: Record<string, { title: string; body: string[] }> = {
  es: {
    title: 'Condiciones del servicio',
    body: [
      'Este servicio es de puerta a puerta. Si el tiempo de tránsito es importante para usted, pero el precio de la opción Express es prohibitivo, y necesita un servicio con seguimiento online, entrega confirmada y además a través de uno de nuestros colaboradores más fiables, entonces este es el servicio para usted. El tiempo de tránsito suele ser entre 3 a 5 días laborables entre la mayoría de los países de la UE, con un par de días más cuando las distancias son grandes.',
      'Para evitar demoras innecesarias, sobrecargos y penalizaciones, por favor asegúrese de declarar correctamente el contenido de su envío y no declarar por debajo de sus valores reales los pesos y las dimensiones de su(s) bulto(s).',
      'Pueden aplicarse tarifas de administración (10 EUR o 25 % del valor del pedido, el que sea mayor) si el cliente desea cancelar un pedido ya pagado o si se proporcionaron datos de pedido incorrectos y esto tiene un impacto en la devolución o entrega del envío.',
      'Todos los envíos realizados con este servicio incluyen un seguro gratuito de hasta 25 EUR. Disponemos de cobertura de hasta 5.000 EUR. Consulte las listas de artículos que no se pueden asegurar o que tienen cobertura limitada, así como los países de origen o destino para los cuales no podemos ofrecer dicha cobertura.',
      'Si necesita asegurar un envío por un valor superior al máximo permitido o si necesita asegurar un artículo prohibido o con limitaciones que quiere enviar de forma regular, por favor póngase en contacto con soporte@doordrop.lat y estudiaremos la posibilidad de crear un seguro especial para usted.'
    ]
  },
  en: {
    title: 'Service conditions',
    body: [
      'This is a door-to-door service. If transit time matters to you, but the Express option is too expensive, and you need online tracking, confirmed delivery, and service through one of our most reliable logistics partners, this service is designed for you. Transit time is usually 3 to 5 business days between most EU countries, with a few extra days when distances are longer.',
      'To avoid unnecessary delays, surcharges, and penalties, please make sure you declare the shipment contents correctly and do not underdeclare the real weight, value, or dimensions of your parcel(s).',
      'Administration fees may apply (10 EUR or 25% of the order value, whichever is higher) if the customer wants to cancel an already paid order or if incorrect order details affect the return or delivery of the shipment.',
      'All shipments made with this service include free insurance coverage up to 25 EUR. Coverage is available up to 5,000 EUR. Please review the list of items that cannot be insured or that have limited coverage, as well as origin/destination countries where coverage may not be available.',
      'If you need to insure a shipment above the permitted maximum, or need recurring coverage for a prohibited or restricted item, please contact soporte@doordrop.lat and we will review the possibility of creating special insurance for you.'
    ]
  },
  it: {
    title: 'Condizioni del servizio',
    body: [
      'Questo è un servizio porta a porta. Se il tempo di transito è importante per te, ma l’opzione Express è troppo costosa, e hai bisogno di tracciamento online, consegna confermata e servizio tramite uno dei nostri partner logistici più affidabili, questo servizio è adatto a te. Il tempo di transito è solitamente tra 3 e 5 giorni lavorativi nella maggior parte dei paesi dell’UE, con qualche giorno in più quando le distanze sono maggiori.',
      'Per evitare ritardi non necessari, supplementi e penali, assicurati di dichiarare correttamente il contenuto della spedizione e di non indicare valori inferiori a quelli reali per peso, valore e dimensioni dei colli.',
      'Possono essere applicate spese amministrative (10 EUR o il 25% del valore dell’ordine, se superiore) se il cliente desidera annullare un ordine già pagato o se dati errati dell’ordine incidono sulla restituzione o consegna della spedizione.',
      'Tutte le spedizioni effettuate con questo servizio includono un’assicurazione gratuita fino a 25 EUR. È disponibile copertura fino a 5.000 EUR. Consulta l’elenco degli articoli non assicurabili o con copertura limitata e i paesi di origine/destinazione per cui la copertura potrebbe non essere disponibile.',
      'Se devi assicurare una spedizione per un valore superiore al massimo consentito, o vuoi spedire regolarmente un articolo proibito o con limitazioni, contatta soporte@doordrop.lat e valuteremo la possibilità di creare un’assicurazione speciale per te.'
    ]
  }
};

const getCustomerServiceTerms = (language: string) => CUSTOMER_SERVICE_TERMS[language] || CUSTOMER_SERVICE_TERMS.en || CUSTOMER_SERVICE_TERMS.es;

const getCustomerShipmentStatus = (shipment: any) => {
  const label = String(shipment?.status || '').toLowerCase();
  const code = String(shipment?.statusCode || '').toLowerCase();
  const cancelStatus = String(shipment?.cancellationRequest?.status || '').toLowerCase();
  if (cancelStatus === 'pending_review') {
    return {
      label: 'Cancelación en revisión',
      helper: 'Nuestro equipo está revisando tu solicitud. Te responderemos por correo y ticket.',
      Icon: Clock,
      className: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/40'
    };
  }
  if (cancelStatus === 'refunded') {
    return {
      label: 'Reembolso aprobado',
      helper: 'El importe fue acreditado en tu monedero DoorDrop.',
      Icon: CheckCircle,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
    };
  }
  if (cancelStatus === 'rejected') {
    return {
      label: 'Solicitud revisada',
      helper: 'Revisa el ticket para conocer la respuesta del equipo.',
      Icon: Info,
      className: 'bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    };
  }
  if (shipment?.labelReady) {
    return {
      label: 'Etiqueta lista',
      helper: 'Tu etiqueta ya está lista para ver o descargar.',
      Icon: CheckCircle,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
    };
  }
  if (label.includes('prueba') || code.includes('sandbox')) {
    return {
      label: 'Etiqueta en preparación',
      helper: 'Estamos preparando tu etiqueta. Te avisaremos cuando esté lista para descargar.',
      Icon: Clock,
      className: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40'
    };
  }
  if (code.includes('pending_label') || label.includes('prepar')) {
    return {
      label: 'Etiqueta en preparación',
      helper: 'Estamos preparando tu etiqueta. Te avisaremos cuando esté lista para descargar.',
      Icon: Clock,
      className: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40'
    };
  }
  if (code.includes('transit') || label.includes('tránsito') || label.includes('transito')) {
    return {
      label: 'En tránsito',
      helper: 'El envío está en camino.',
      Icon: Truck,
      className: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40'
    };
  }
  if (code.includes('delivered') || label.includes('entreg')) {
    return {
      label: 'Entregado',
      helper: 'Entrega completada.',
      Icon: Package,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
    };
  }
  if (code.includes('cancel') || label.includes('cancel')) {
    return {
      label: 'Cancelado',
      helper: 'Este envío fue cancelado.',
      Icon: X,
      className: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40'
    };
  }
  return {
    label: shipment?.status || 'En proceso',
    helper: 'Estamos gestionando este envío.',
    Icon: Clock,
    className: 'bg-gray-100 dark:bg-dark-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
  };
};

const Shipments = () => {
  const { t, language } = useI18n();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [editingShipment, setEditingShipment] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({ sender: {}, recipient: {}, packages: [] });
  const [termsOpen, setTermsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courierFilter, setCourierFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cancellationTargets, setCancellationTargets] = useState<any[]>([]);
  const [cancellationReasonCode, setCancellationReasonCode] = useState('service_not_needed');
  const [cancellationDetail, setCancellationDetail] = useState('');
  const [aiReasonLoading, setAiReasonLoading] = useState(false);
  const serviceTerms = getCustomerServiceTerms(language);

  const loadShipments = () => {
    setLoading(true);
    api.getShipments().then(res => {
      setShipments(res.shipments || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const openEditShipment = (shipment: any) => {
    setEditingShipment(shipment);
    setEditForm({
      sender: { ...(shipment.sender || {}) },
      recipient: { ...(shipment.recipient || {}) },
      packages: shipment.packages?.length ? shipment.packages.map((p: any) => ({ ...p })) : [{ width: 10, height: 10, length: 10, weight: 1, qty: 1 }]
    });
  };

  const updateEditAddress = (type: 'sender' | 'recipient', key: string, value: string) => {
    setEditForm((prev: any) => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } }));
  };

  const updateEditPackage = (index: number, key: string, value: number) => {
    setEditForm((prev: any) => {
      const packages = [...(prev.packages || [])];
      packages[index] = { ...(packages[index] || {}), [key]: value };
      return { ...prev, packages };
    });
  };

  const saveShipmentEdit = async () => {
    if (!editingShipment) return;
    setActionLoading(`edit-${editingShipment.id}`);
    try {
      await api.updateShipment(editingShipment.id, editForm);
      setEditingShipment(null);
      loadShipments();
    } catch (e: any) {
      alert(e.message || 'No se pudo guardar el envío.');
    } finally {
      setActionLoading('');
    }
  };

  const finalizeShipment = async (shipment: any) => {
    setActionLoading(`finalize-${shipment.id}`);
    try {
      const res = await api.finalizeShipment(shipment.id);
      alert(res.message || 'Preparación en curso.');
      loadShipments();
    } catch (e: any) {
      alert(e.message || 'No se pudo completar la operación.');
    } finally {
      setActionLoading('');
    }
  };

  const retryLabel = async (shipment: any) => {
    setActionLoading(`retry-${shipment.id}`);
    try {
      const res = await api.retryShipmentLabel(shipment.id);
      alert(res.message || 'Preparación en curso.');
      loadShipments();
    } catch (e: any) {
      alert(e.message || 'No se pudo completar la operación.');
    } finally {
      setActionLoading('');
    }
  };

  const cancellationReasons = [
    { code: 'service_not_needed', label: 'Ya no necesito realizar el envío' },
    { code: 'incorrect_shipment_data', label: 'Los datos del envío son incorrectos' },
    { code: 'duplicate_shipment', label: 'El envío fue creado por duplicado' },
    { code: 'delivery_time', label: 'El plazo de entrega no me conviene' },
    { code: 'price', label: 'El precio final no me conviene' },
    { code: 'other', label: 'Otro motivo' },
  ];

  const openCancellationModal = (targets: any[]) => {
    const eligible = targets.filter((shipment) => shipment?.canRequestCancellation);
    if (!eligible.length) return;
    setCancellationTargets(eligible);
    setCancellationReasonCode('service_not_needed');
    setCancellationDetail('');
  };

  const requestCancellation = async () => {
    if (!cancellationTargets.length) return;
    const reasonLabel = cancellationReasons.find((item) => item.code === cancellationReasonCode)?.label || 'Otro motivo';
    const detail = cancellationDetail.trim();
    const reason = detail ? `${reasonLabel}. ${detail}` : reasonLabel;
    setActionLoading('cancel-batch');
    try {
      const results = await Promise.allSettled(
        cancellationTargets.map((shipment) => api.requestShipmentCancellation(shipment.id, { reason, reasonCode: cancellationReasonCode, lang: language }))
      );
      const completed = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - completed;
      setCancellationTargets([]);
      setSelectedIds(new Set());
      await loadShipments();
      alert(failed ? `${completed} solicitud(es) enviadas; ${failed} no pudieron procesarse.` : `${completed} solicitud(es) recibidas. Te responderemos por correo y ticket.`);
    } catch (e: any) {
      alert(e.message || 'No se pudo completar la solicitud.');
    } finally {
      setActionLoading('');
    }
  };

  const suggestCancellationReason = async () => {
    if (!cancellationTargets.length) return;
    setAiReasonLoading(true);
    try {
      const response = await api.suggestShipmentCancellationReason(cancellationTargets[0].id, {
        reasonCode: cancellationReasonCode,
        detail: cancellationDetail,
        lang: language,
        shipmentCount: cancellationTargets.length,
      });
      if (response?.suggestion) setCancellationDetail(response.suggestion);
    } catch (e: any) {
      alert(e.message || 'La asistencia no está disponible. Puedes escribir el motivo directamente.');
    } finally {
      setAiReasonLoading(false);
    }
  };

  const shipmentRows = useMemo(() => shipments.map((shipment) => {
    const statusView = getCustomerShipmentStatus(shipment);
    const courier = getCarrierName({ carrierName: shipment.carrierName, service: shipment.quote?.serviceName || shipment.serviceName });
    return { shipment, statusView, courier };
  }), [shipments]);

  const availableStatuses = useMemo(() => Array.from(new Set(shipmentRows.map((row) => row.statusView.label))).sort(), [shipmentRows]);
  const availableCouriers = useMemo(() => Array.from(new Set(shipmentRows.map((row) => row.courier))).sort(), [shipmentRows]);
  const filteredRows = useMemo(() => shipmentRows.filter(({ shipment, statusView, courier }) => {
    const haystack = [shipment.trackingCode, shipment.recipient?.city, shipment.recipient?.country, shipment.recipient?.name, courier, statusView.label].join(' ').toLowerCase();
    const created = shipment.createdAt ? new Date(shipment.createdAt) : null;
    const afterStart = !dateFrom || (created && created >= new Date(`${dateFrom}T00:00:00`));
    const beforeEnd = !dateTo || (created && created <= new Date(`${dateTo}T23:59:59`));
    return haystack.includes(searchText.trim().toLowerCase())
      && (statusFilter === 'all' || statusView.label === statusFilter)
      && (courierFilter === 'all' || courier === courierFilter)
      && Boolean(afterStart && beforeEnd);
  }), [shipmentRows, searchText, statusFilter, courierFilter, dateFrom, dateTo]);

  const selectedShipments = shipments.filter((shipment) => selectedIds.has(shipment.id));
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(({ shipment }) => selectedIds.has(shipment.id));
  const toggleVisibleSelection = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) filteredRows.forEach(({ shipment }) => next.delete(shipment.id));
      else filteredRows.forEach(({ shipment }) => next.add(shipment.id));
      return next;
    });
  };

  const toggleShipmentSelection = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const labelUrl = (shipment: any, download = false) => {
    const base = shipment?.labelDownloadUrl || (shipment?.id ? `/api/shipments/${shipment.id}/label/file` : '');
    if (!base) return '';
    return download ? `${base}${base.includes('?') ? '&' : '?'}download=1` : base;
  };

  const openLabel = async (shipment: any) => {
    const url = labelUrl(shipment, false);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadLabel = (shipment: any) => {
    const url = labelUrl(shipment, true);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="py-2 md:py-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">{t('myShipments')}</h1>
        <Link to="/panel/quote" className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-neon-cyan dark:to-neon-green text-white dark:text-gray-900 px-6 py-2.5 rounded-full font-bold transition-all hover:scale-105 shadow-md flex items-center gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> {t('newShipment')}
        </Link>
      </div>

      <div className="mb-5 rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-dark-900/90">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Tracking, destino, destinatario o courier" className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-dark-800" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-dark-800">
            <option value="all">Todos los estados</option>
            {availableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={courierFilter} onChange={(event) => setCourierFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-dark-800">
            <option value="all">Todos los couriers</option>
            {availableCouriers.map((courier) => <option key={courier} value={courier}>{courier}</option>)}
          </select>
          <button type="button" onClick={() => { setSearchText(''); setStatusFilter('all'); setCourierFilter('all'); setDateFrom(''); setDateTo(''); }} className="h-11 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-dark-800">Limpiar filtros</button>
        </div>
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Fecha inicial" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold dark:border-gray-700 dark:bg-dark-800" />
            <span className="text-xs font-bold text-gray-400">a</span>
            <input aria-label="Fecha final" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold dark:border-gray-700 dark:bg-dark-800" />
            <span className="text-xs font-bold text-gray-500">{filteredRows.length} resultado(s)</span>
          </div>
          {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{selectedIds.size} seleccionado(s)</span>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-xl px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-800">Quitar selección</button>
            <button type="button" onClick={() => openCancellationModal(selectedShipments)} disabled={!selectedShipments.some((shipment) => shipment.canRequestCancellation)} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /> Solicitar cancelación</button>
          </div>}
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800">
        {shipments.length === 0 && !loading ? (
          <div className="p-16 text-center text-gray-500 dark:text-gray-400">
            <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-lg font-medium">{t('createFirstShipment')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-dark-800/50 border-b border-gray-200 dark:border-gray-800 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                  <th className="p-5"><input aria-label="Seleccionar resultados visibles" type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} /></th>
                  <th className="p-5">Tracking</th>
                  <th className="p-5">{t('destination')}</th>
                  <th className="p-5">Courier</th>
                  <th className="p-5">{t('status')}</th>
                  <th className="p-5">{t('date')}</th>
                  <th className="p-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredRows.map(({ shipment: s, statusView, courier }) => {
                  const StatusIcon = statusView.Icon;
                  return (
                  <tr key={s.id} className="hover:bg-blue-50/50 dark:hover:bg-neon-cyan/5 transition-colors">
                    <td className="p-5"><input aria-label={`Seleccionar envío ${s.trackingCode || s.id}`} type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleShipmentSelection(s.id)} /></td>
                    <td className="p-5 font-mono font-bold text-blue-600 dark:text-neon-cyan">{s.trackingCode}</td>
                    <td className="p-5 text-gray-900 dark:text-gray-300 font-medium">{s.recipient?.city || '-'}</td>
                    <td className="p-5">
                      <div className="text-sm font-black text-gray-900 dark:text-white">{courier}</div>
                    </td>
                    <td className="p-5">
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${statusView.className}`}>
                          <StatusIcon className={`w-3.5 h-3.5 ${s.labelReady ? '' : 'animate-pulse'}`} /> {statusView.label}
                        </span>
                        {!s.labelReady && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                            <Clock className="w-3 h-3" /> {statusView.helper}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-5 text-gray-500 dark:text-gray-400 text-sm">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="p-5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {s.labelReady ? (
                          <>
                            <button onClick={() => openLabel(s)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300">
                              <Eye className="w-4 h-4" /> Ver etiqueta
                            </button>
                            <button onClick={() => downloadLabel(s)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300">
                              <Download className="w-4 h-4" /> Descargar PDF
                            </button>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-500 dark:bg-dark-800 dark:text-gray-400">
                            <Clock className="w-4 h-4 animate-pulse" /> Preparando
                          </span>
                        )}
                        {s.canRequestCancellation && (
                          <button onClick={() => openCancellationModal([s])} disabled={actionLoading === 'cancel-batch'} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:bg-rose-950/30 dark:text-rose-300">
                            <Trash2 className="w-4 h-4" /> Solicitar cancelación
                          </button>
                        )}
                        {s.cancellationRequest?.status === 'pending_review' && (
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                            <Clock className="w-4 h-4 animate-pulse" /> En revisión
                          </span>
                        )}
                        <button onClick={() => setTermsOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 dark:bg-dark-800 dark:text-slate-300">
                          <FileText className="w-4 h-4" /> Condiciones
                        </button>
                        {s.canEdit && (
                          <button onClick={() => openEditShipment(s)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-neon-cyan">
                            <Pencil className="w-4 h-4" /> Modificar
                          </button>
                        )}
                        {s.canFinalize && !s.labelReady && (
                          <button onClick={() => finalizeShipment(s)} disabled={actionLoading === 'finalize-' + s.id} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950/30 dark:text-emerald-300">
                            <CheckCircle className={`w-4 h-4 ${actionLoading === 'finalize-' + s.id ? 'animate-pulse' : ''}`} /> Finalizar
                          </button>
                        )}
                        {s.canRetryLabel && !s.labelReady && (
                          <button onClick={() => retryLabel(s)} disabled={actionLoading === 'retry-' + s.id} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-950/30 dark:text-amber-300">
                            <RotateCw className={`w-4 h-4 ${actionLoading === 'retry-' + s.id ? 'animate-spin' : ''}`} /> Preparar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRows.length === 0 && <div className="p-12 text-center text-sm font-semibold text-gray-500">No hay envíos que coincidan con los filtros.</div>}
          </div>
        )}
      </div>

      {cancellationTargets.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-dark-900">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6 dark:border-gray-800">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Revisión humana obligatoria</p><h2 id="cancel-title" className="mt-1 text-2xl font-black">Solicitar cancelación</h2><p className="mt-2 text-sm text-gray-500">{cancellationTargets.length} envío(s). El reembolso no es automático.</p></div>
              <button type="button" onClick={() => setCancellationTargets([])} aria-label="Cerrar" className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500">Motivo</span><select value={cancellationReasonCode} onChange={(event) => setCancellationReasonCode(event.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-dark-800">{cancellationReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500">Explicación adicional</span><textarea value={cancellationDetail} onChange={(event) => setCancellationDetail(event.target.value)} maxLength={1500} rows={5} placeholder="Puedes explicar tu caso con tus propias palabras." className="w-full resize-none rounded-2xl border border-gray-200 bg-white p-4 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-dark-800" /><span className="mt-1 block text-right text-[11px] text-gray-400">{cancellationDetail.length}/1500</span></label>
              <button type="button" onClick={suggestCancellationReason} disabled={aiReasonLoading} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"><Sparkles className={`h-4 w-4 ${aiReasonLoading ? 'animate-pulse' : ''}`} />{aiReasonLoading ? 'Redactando…' : 'Mejorar explicación con IA'}</button>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">DoorDrop comprobará el estado logístico y los costes ya incurridos. Enviar esta solicitud crea un ticket individual por cada envío elegible.</div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 p-6 dark:border-gray-800 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCancellationTargets([])} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-dark-800">Volver</button><button type="button" onClick={requestCancellation} disabled={actionLoading === 'cancel-batch'} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50">{actionLoading === 'cancel-batch' ? 'Enviando…' : `Enviar ${cancellationTargets.length} solicitud(es)`}</button></div>
          </div>
        </div>
      )}

      {termsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-neon-cyan">DoorDrop</p>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{serviceTerms.title}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Información importante antes de preparar o descargar la etiqueta.</p>
              </div>
              <button onClick={() => setTermsOpen(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm leading-7 text-gray-700 dark:text-gray-300">
              <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-4 flex gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-neon-cyan flex-shrink-0 mt-0.5" />
                <p className="font-bold text-blue-900 dark:text-blue-100">Revisa dirección, contenido, valor declarado, peso y dimensiones antes de finalizar el envío.</p>
              </div>
              {serviceTerms.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button onClick={() => setTermsOpen(false)} className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-3 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {editingShipment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-neon-cyan">Modificar envío</p>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{editingShipment.trackingCode}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Puedes actualizar los datos mientras la etiqueta no esté disponible.</p>
              </div>
              <button onClick={() => setEditingShipment(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(['sender', 'recipient'] as const).map((type) => (
                <div key={type} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-5 bg-gray-50/40 dark:bg-dark-800/30">
                  <h4 className="font-black text-gray-900 dark:text-white mb-4">{type === 'sender' ? 'Remitente' : 'Destinatario'}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={editForm[type]?.name || ''} onChange={(e) => updateEditAddress(type, 'name', e.target.value)} placeholder="Nombre" className="input-dynamic" />
                    <input value={editForm[type]?.company || ''} onChange={(e) => updateEditAddress(type, 'company', e.target.value)} placeholder="Empresa" className="input-dynamic" />
                    <input value={editForm[type]?.email || ''} onChange={(e) => updateEditAddress(type, 'email', e.target.value)} placeholder="Email" className="input-dynamic" />
                    <input value={editForm[type]?.phone || ''} onChange={(e) => updateEditAddress(type, 'phone', e.target.value)} placeholder="Teléfono" className="input-dynamic" />
                    <input value={editForm[type]?.addressLine1 || editForm[type]?.address || ''} onChange={(e) => updateEditAddress(type, 'addressLine1', e.target.value)} placeholder="Dirección" className="input-dynamic sm:col-span-2" />
                    <input value={editForm[type]?.city || ''} onChange={(e) => updateEditAddress(type, 'city', e.target.value)} placeholder="Ciudad" className="input-dynamic" />
                    <input value={editForm[type]?.zipCode || editForm[type]?.post_code || ''} onChange={(e) => updateEditAddress(type, 'zipCode', e.target.value)} placeholder="Código postal" className="input-dynamic" />
                  </div>
                </div>
              ))}

              <div className="lg:col-span-2 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 bg-gray-50/40 dark:bg-dark-800/30">
                <h4 className="font-black text-gray-900 dark:text-white mb-4">Bultos</h4>
                <div className="space-y-3">
                  {(editForm.packages || []).map((pkg: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <input type="number" min="1" value={pkg.length || 10} onChange={(e) => updateEditPackage(idx, 'length', Number(e.target.value || 10))} className="input-dynamic" placeholder="Largo" />
                      <input type="number" min="1" value={pkg.width || 10} onChange={(e) => updateEditPackage(idx, 'width', Number(e.target.value || 10))} className="input-dynamic" placeholder="Ancho" />
                      <input type="number" min="1" value={pkg.height || 10} onChange={(e) => updateEditPackage(idx, 'height', Number(e.target.value || 10))} className="input-dynamic" placeholder="Alto" />
                      <input type="number" min="0.1" step="0.1" value={pkg.weight || 1} onChange={(e) => updateEditPackage(idx, 'weight', Number(e.target.value || 1))} className="input-dynamic" placeholder="Peso" />
                      <input type="number" min="1" value={pkg.qty || 1} onChange={(e) => updateEditPackage(idx, 'qty', Number(e.target.value || 1))} className="input-dynamic" placeholder="Cantidad" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-end gap-3">
              <button onClick={() => setEditingShipment(null)} className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300 font-bold">
                Cancelar
              </button>
              <button onClick={saveShipmentEdit} disabled={actionLoading === 'edit-' + editingShipment.id} className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-60">
                {actionLoading === 'edit-' + editingShipment.id ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



const CustomerBilling = () => {
  const { t, language } = useI18n();
  const { format } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | ''>('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all', type: 'all' });

  const uiLanguage = String(language || 'es').slice(0, 2);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getUserBilling({ page, pageSize: 25, lang: uiLanguage, ...filters });
      setData(result);
    } catch (e: any) {
      setError(e?.message || t('billing_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, uiLanguage, filters.from, filters.to, filters.status, filters.type]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (page !== 1) setPage(1);
  };

  const resetFilters = () => {
    setFilters({ from: '', to: '', status: 'all', type: 'all' });
    setPage(1);
  };

  const download = async (format: 'pdf' | 'csv') => {
    setExporting(format);
    setError('');
    try {
      const result = await api.downloadUserBillingExport(format, uiLanguage, filters);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || t('billing_export_error'));
    } finally {
      setExporting('');
    }
  };

  const account = data?.account || {};
  const summary = data?.summary || {};
  const pagination = data?.pagination || { page: 1, totalPages: 1 };
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const accountCurrency = String(account.currency || 'EUR').toUpperCase();
  const costs = Array.isArray(data?.analytics?.costs) ? data.analytics.costs : [];
  const totalCosts = Number(data?.analytics?.totalCosts || 0);
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => key === 'status' || key === 'type' ? value !== 'all' : Boolean(value));

  const costChartData = useMemo(() => ({
    labels: costs.map((item: any) => `${item.reason}${item.currency && item.currency !== accountCurrency ? ` · ${item.currency}` : ''}`),
    datasets: [{
      label: t('billing_costs_recorded'),
      data: costs.map((item: any) => Number(item.amount || 0)),
      backgroundColor: ['#2563eb', '#06b6d4', '#14b8a6', '#8b5cf6', '#f59e0b', '#f97316', '#ec4899', '#64748b'],
      borderRadius: 10,
      borderSkipped: false,
      barThickness: 18,
      maxBarThickness: 22
    }]
  }), [costs, accountCurrency, t]);

  const costChartOptions: any = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const item = costs[context.dataIndex];
            return ` ${format(Number(context.raw || 0), String(item?.currency || accountCurrency).toUpperCase())}`;
          }
        }
      }
    },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.18)' }, ticks: { color: '#64748b', font: { weight: 700 } } },
      y: { grid: { display: false }, ticks: { color: '#475569', font: { weight: 700 } } }
    }
  }), [accountCurrency, costs, format, t]);

  const formatDate = (value: any) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(uiLanguage === 'en' ? 'en-US' : uiLanguage === 'fr' ? 'fr-FR' : uiLanguage === 'it' ? 'it-IT' : 'es-ES', {
        dateStyle: 'medium', timeStyle: 'short'
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  };

  const statusLabel = (status: string) => {
    const key = `billing_status_${String(status || '').toLowerCase()}`;
    const translated = t(key);
    return translated === key ? String(status || t('billing_status_unknown')) : translated;
  };

  return (
    <div className="py-2 md:py-4 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-neon-cyan">{t('billing_eyebrow')}</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mt-2">{t('billing_title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">{t('billing_subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download('pdf')} disabled={Boolean(exporting)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-800 shadow-sm transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-100">
            <FileText className="w-4 h-4" /> {exporting === 'pdf' ? t('billing_generating') : t('billing_download_pdf')}
          </button>
          <button type="button" onClick={() => download('csv')} disabled={Boolean(exporting)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
            <Download className="w-4 h-4" /> {exporting === 'csv' ? t('billing_generating') : t('billing_download_csv')}
          </button>
        </div>
      </div>

      {error && <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"><span>{error}</span><button type="button" onClick={load} className="inline-flex items-center gap-1 underline"><RotateCw className="w-4 h-4" /> {t('billing_retry')}</button></div>}

      <section className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-neon-cyan"><Filter className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">{t('billing_filters_title')}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('billing_filters_desc')}</p>
            </div>
          </div>
          {hasActiveFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-black text-gray-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-200 dark:hover:border-neon-cyan/50"><X className="w-3.5 h-3.5" /> {t('billing_filter_reset')}</button>}
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="space-y-1.5 text-xs font-black text-gray-500 dark:text-gray-400"><span>{t('billing_filter_from')}</span><input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-100 dark:focus:border-neon-cyan dark:focus:ring-neon-cyan/10" /></label>
          <label className="space-y-1.5 text-xs font-black text-gray-500 dark:text-gray-400"><span>{t('billing_filter_to')}</span><input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-100 dark:focus:border-neon-cyan dark:focus:ring-neon-cyan/10" /></label>
          <label className="space-y-1.5 text-xs font-black text-gray-500 dark:text-gray-400"><span>{t('billing_filter_status')}</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-100 dark:focus:border-neon-cyan dark:focus:ring-neon-cyan/10"><option value="all">{t('billing_filter_all')}</option><option value="pending">{t('billing_status_pending')}</option><option value="completed">{t('billing_status_completed')}</option><option value="paid">{t('billing_status_paid')}</option><option value="failed">{t('billing_status_failed')}</option><option value="refunded">{t('billing_status_refunded')}</option><option value="cancelled">{t('billing_status_cancelled')}</option></select></label>
          <label className="space-y-1.5 text-xs font-black text-gray-500 dark:text-gray-400"><span>{t('billing_filter_type')}</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-100 dark:focus:border-neon-cyan dark:focus:ring-neon-cyan/10"><option value="all">{t('billing_filter_all')}</option><option value="topup">{t('billing_filter_topup')}</option><option value="subscription">{t('billing_filter_subscription')}</option><option value="payment">{t('billing_filter_payment')}</option><option value="wallet">{t('billing_filter_wallet')}</option><option value="incoming">{t('billing_filter_incoming')}</option><option value="outgoing">{t('billing_filter_outgoing')}</option></select></label>
        </div>
      </section>

      {loading ? <div className="glass-panel rounded-3xl p-12 text-center text-gray-500 dark:text-gray-400">{t('billing_loading')}</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="glass-panel rounded-2xl border border-blue-100 dark:border-blue-900/40 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('billing_available_balance')}</p>
              <p className="mt-2 text-2xl font-black text-blue-600 dark:text-neon-cyan">{format(Number(account.balance || 0), accountCurrency)}</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('billing_movements')}</p>
              <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Number(summary.totalEntries || 0)}</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('billing_topups_completed')}</p>
              <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Number(summary.completedTopups || 0)}</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('billing_payments_paid')}</p>
              <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Number(summary.paidPayments || 0)}</p>
            </div>
            <div className="glass-panel rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-orange-50/50 p-5 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/20">
              <p className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">{t('billing_costs_recorded')}</p>
              <p className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-200">{format(totalCosts, accountCurrency)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_.65fr] gap-6">
            <section className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20"><Percent className="w-4 h-4" /></div><h2 className="text-lg font-black text-gray-900 dark:text-white">{t('billing_costs_title')}</h2></div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('billing_costs_desc')}</p>
                </div>
                <span className="inline-flex w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{format(totalCosts, accountCurrency)}</span>
              </div>
              {costs.length > 0 ? <div className="mt-5 h-72"><Bar options={costChartOptions} data={costChartData} /></div> : <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 text-center dark:border-gray-800 dark:bg-dark-800/30"><Percent className="mb-3 h-9 w-9 text-gray-300 dark:text-gray-700" /><p className="text-sm font-black text-gray-700 dark:text-gray-200">{t('billing_costs_empty')}</p><p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">{t('billing_costs_empty_desc')}</p></div>}
            </section>
            <aside className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('billing_costs_recorded')}</p><p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{format(totalCosts, accountCurrency)}</p></div><div className="rounded-2xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"><Wallet className="h-5 w-5" /></div></div>
              <div className="mt-5 space-y-3">{costs.length > 0 ? costs.map((item: any) => <div key={`${item.currency}-${item.reason}`} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-gray-800 dark:bg-dark-800/50"><div className="min-w-0"><p className="truncate text-xs font-black text-gray-800 dark:text-gray-100">{item.reason}</p><p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{Number(item.count || 0)} · {item.currency}</p></div><span className="shrink-0 text-xs font-black text-amber-700 dark:text-amber-300">{format(Number(item.amount || 0), String(item.currency || accountCurrency).toUpperCase())}</span></div>) : <p className="text-sm text-gray-500 dark:text-gray-400">{t('billing_costs_empty_desc')}</p>}</div>
            </aside>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_.65fr] gap-6">
            <section className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-5 md:px-7 py-5">
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">{t('billing_activity_title')}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('billing_activity_desc')}</p>
                </div>
                <div className="flex items-center gap-3"><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950/30 dark:text-neon-cyan">{Number(pagination.total || 0)} {t('billing_filtered_results')}</span><Link to="/panel/settings" className="text-xs font-black text-blue-600 dark:text-neon-cyan hover:underline">{t('billing_edit_profile')}</Link></div>
              </div>

              {entries.length === 0 ? <div className="p-12 text-center text-sm text-gray-500 dark:text-gray-400"><FileText className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-700" /><p className="font-black text-gray-700 dark:text-gray-200">{hasActiveFilters ? t('billing_no_filtered_results') : t('billing_empty_title')}</p><p className="mt-1">{hasActiveFilters ? t('billing_filter_reset') : t('billing_empty_desc')}</p></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="bg-gray-50/80 dark:bg-dark-800/70 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-5 md:px-7 py-3 font-black">{t('billing_date')}</th>
                        <th className="px-4 py-3 font-black">{t('billing_concept')}</th>
                        <th className="px-4 py-3 font-black">{t('billing_status')}</th>
                        <th className="px-4 py-3 font-black text-right">{t('billing_amount')}</th>
                        <th className="px-5 md:px-7 py-3 font-black">{t('billing_reference')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {entries.map((entry: any) => {
                        const incoming = entry.direction === 'incoming';
                        return (
                          <tr key={`${entry.source}-${entry.id}`} className="align-top hover:bg-gray-50/60 dark:hover:bg-dark-800/40">
                            <td className="px-5 md:px-7 py-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-black text-gray-900 dark:text-white">{entry.title}</p>
                              {entry.description && entry.description !== entry.title && <p className="mt-1 max-w-[220px] truncate text-xs text-gray-500 dark:text-gray-400" title={entry.description}>{entry.description}</p>}
                            </td>
                            <td className="px-4 py-4"><span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-black text-gray-600 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-300">{statusLabel(entry.status)}</span></td>
                            <td className={`px-4 py-4 text-right text-sm font-black whitespace-nowrap ${incoming ? 'text-emerald-600 dark:text-neon-green' : 'text-gray-900 dark:text-white'}`}>{incoming ? '+' : '-'}{format(Number(entry.amount || 0), String(entry.currency || accountCurrency).toUpperCase())}</td>
                            <td className="px-5 md:px-7 py-4 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-[150px] truncate" title={entry.reference || ''}>{entry.reference || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 px-5 md:px-7 py-4 text-xs font-black text-gray-500 dark:text-gray-400">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-dark-800"><ChevronLeft className="w-4 h-4" /> {t('billing_previous')}</button>
                <span>{t('billing_page')} {page} / {Math.max(1, Number(pagination.totalPages || 1))}</span>
                <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= Number(pagination.totalPages || 1) || loading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-dark-800">{t('billing_next')} <ChevronRight className="w-4 h-4" /></button>
              </div>
            </section>

            <aside className="space-y-6">
              <section className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">{t('billing_profile_title')}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('billing_profile_desc')}</p>
                {data?.billingProfile ? <div className="mt-5 space-y-3 text-sm">
                  <p className="font-black text-gray-900 dark:text-white">{data.billingProfile.companyName || account.name}</p>
                  <p className="text-gray-600 dark:text-gray-300">{data.billingProfile.email || account.email}</p>
                  {[data.billingProfile.address, data.billingProfile.city, data.billingProfile.zipCode, data.billingProfile.country].filter(Boolean).length > 0 && <p className="text-gray-500 dark:text-gray-400">{[data.billingProfile.address, data.billingProfile.city, data.billingProfile.zipCode, data.billingProfile.country].filter(Boolean).join(' · ')}</p>}
                </div> : <p className="mt-5 rounded-xl bg-amber-50 px-3 py-3 text-xs font-bold text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">{t('billing_profile_missing')}</p>}
                <Link to="/panel/settings" className="mt-5 inline-flex text-xs font-black text-blue-600 dark:text-neon-cyan hover:underline">{t('billing_edit_profile')} →</Link>
              </section>

              <section className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">{t('billing_subscriptions_title')}</h2>
                {subscriptions.length === 0 ? <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('billing_no_subscriptions')}</p> : <div className="mt-4 space-y-3">{subscriptions.map((subscription: any) => <div key={subscription.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-dark-800/50"><div className="flex items-start justify-between gap-3"><p className="text-sm font-black text-gray-900 dark:text-white">{subscription.planName}</p><span className="text-[10px] font-black uppercase text-blue-600 dark:text-neon-cyan">{statusLabel(subscription.status)}</span></div><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subscription.currentPeriodEnd ? `${t('billing_renews')} ${formatDate(subscription.currentPeriodEnd)}` : t('billing_no_period')}</p></div>)}</div>}
              </section>
            </aside>
          </div>

          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{t('billing_disclaimer')}</p>
        </>
      )}
    </div>
  );
};

const getLocalizedBankDetailLabel = (translate: (key: string) => string, label: string) => {
  const normalized = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const translationKey = {
    account_type: 'customer_settings_bank_account_type',
    checking: 'customer_settings_bank_checking',
    routing_number_wire_and_ach: 'customer_settings_bank_routing_number',
    account_number: 'customer_settings_bank_account_number',
    swift_bic: 'customer_settings_bank_swift_bic',
  }[normalized] || '';
  return translationKey ? translate(translationKey) : label;
};

const getLocalizedBankDetailValue = (translate: (key: string) => string, label: string, value: any) => {
  const normalized = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'account_type' && String(value || '').trim().toLowerCase() === 'checking') {
    return translate('customer_settings_bank_checking');
  }
  return String(value);
};


const CustomerWalletTransfer = () => {
  const { t, language } = useI18n();
  const { format } = useCurrency();
  const [profile, setProfile] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const currency = String(profile?.currency || 'USD').toUpperCase();

  const load = async () => {
    setLoading(true);
    try {
      const profileRes = await api.getProfile();
      const user = profileRes.user || {};
      setProfile(user);
      setPayerName(user.name || '');
      const bankRes = await api.getBankAccounts({ currency: user.currency || 'USD', lang: language });
      const list = bankRes.accounts || [];
      setAccounts(list);
      setSelectedBankId(list[0]?.id || '');
    } catch {
      setError(t('noData'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [language]);

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file'));
    reader.readAsDataURL(file);
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      if (!receiptFile) {
        setError(t('bank_upload_receipt'));
        setSubmitting(false);
        return;
      }
      const receiptBase64 = await fileToDataUrl(receiptFile);
      const res = await api.submitWalletTransferProof({
        bankAccountId: selectedBankId,
        amount: Number(amount || 0),
        currency: selected?.currency || currency,
        referenceNumber,
        payerName,
        note,
        receiptFileName: receiptFile.name,
        receiptMime: receiptFile.type,
        receiptBase64
      });
      if (res.success) {
        setMessage(t('bank_receipt_sent'));
        setAmount('');
        setReferenceNumber('');
        setNote('');
        setReceiptFile(null);
      }
    } catch (e: any) {
      setError(e.message || t('noData'));
    } finally {
      setSubmitting(false);
    }
  };

  const selected = accounts.find((a: any) => a.id === selectedBankId) || accounts[0];

  return (
    <div className="py-2 md:py-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <Link to="/panel/settings" className="text-sm font-black text-blue-600 dark:text-neon-cyan hover:underline">← {t('settings')}</Link>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mt-3">{t('bank_wallet_title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">{t('bank_wallet_subtitle')}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-800 px-5 py-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('bank_current_balance')}</p>
          <p className="text-2xl font-black text-blue-600 dark:text-neon-cyan">{format(Number(profile?.balance || 0), currency)}</p>
        </div>
      </div>

      {message && <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 text-green-800 dark:text-neon-green rounded-2xl font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {message}</div>}
      {error && <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-400 rounded-2xl font-bold flex items-center gap-2"><X className="w-5 h-5" /> {error}</div>}

      {loading ? <div className="glass-panel rounded-3xl p-10 text-center text-gray-500 dark:text-gray-400">{t('searching')}</div> : !accounts.length ? <div className="glass-panel rounded-3xl p-10 text-center text-gray-500 dark:text-gray-400">{t('bank_no_accounts')}</div> : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_.9fr] gap-8">
          <div className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t('bank_selected_for_currency')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{selected?.currency || currency}</p>
            {selected?.currencyMismatch && <p className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 text-xs font-bold text-amber-700 dark:text-amber-300">{t('customer_settings_bank_currency_mismatch').replace('{currency}', currency).replace('{bankCurrency}', selected.currency)}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {accounts.map((account: any) => (
                <button key={account.id} onClick={() => setSelectedBankId(account.id)} className={`text-left rounded-2xl border p-5 transition-all ${selectedBankId === account.id ? 'border-blue-500 bg-blue-50 dark:bg-neon-cyan/10 dark:border-neon-cyan' : 'border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-dark-800/60 hover:border-blue-300'}`}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="px-3 py-1 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-black">{account.currency}</span>
                    <span className="text-xs font-black text-gray-500">{account.countryCode || ''}</span>
                  </div>
                  <p className="font-black text-gray-900 dark:text-white">{account.bankName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{account.accountHolder}</p>
                </button>
              ))}
            </div>

            {selected && (
              <div className="rounded-2xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="font-black text-gray-900 dark:text-white mb-3">{t('bank_details')}</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 text-sm"><span className="text-gray-500 font-bold">{t('bank_account_holder')}</span><span className="font-black text-gray-900 dark:text-white">{selected.accountHolder}</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 text-sm"><span className="text-gray-500 font-bold">{t('bank_name')}</span><span className="font-black text-gray-900 dark:text-white">{selected.bankName}</span></div>
                  {Object.entries(selected.details || {}).map(([key, value]: any) => (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 text-sm"><span className="text-gray-500 font-bold">{getLocalizedBankDetailLabel(t, key)}</span><span className="font-mono font-black text-gray-900 dark:text-white break-all">{getLocalizedBankDetailValue(t, key, value)}</span></div>
                  ))}
                  {selected.bankAddress && <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 text-sm"><span className="text-gray-500 font-bold">{t('customer_settings_bank_address')}</span><span className="text-gray-700 dark:text-gray-300">{selected.bankAddress}</span></div>}
                </div>
                {selected.instruction && <p className="mt-5 rounded-xl bg-blue-50 dark:bg-neon-cyan/10 text-blue-800 dark:text-neon-cyan p-4 text-sm font-bold">{selected.instruction}</p>}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="glass-panel rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 space-y-5">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">{t('bank_upload_receipt')}</h2>
            <div>
              <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bank_transfer_amount')} ({selected?.currency || currency})</label>
              <input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-dynamic font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bank_reference')}</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="input-dynamic font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bank_payer_name')}</label>
              <input value={payerName} onChange={(e) => setPayerName(e.target.value)} className="input-dynamic font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bank_note')}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-dynamic font-medium" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('bank_receipt_file')}</label>
              <input required type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-700 text-sm" />
              {receiptFile && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-2"><FileText className="w-4 h-4" /> {receiptFile.name}</p>}
            </div>
            <button disabled={submitting || !selectedBankId} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 font-black disabled:opacity-60">
              {submitting ? t('searching') : t('bank_submit_receipt')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
const CustomerSettings = () => {
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const { format, setCurrency, availableCurrencies } = useCurrency();
  const [profile, setProfile] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [billingForm, setBillingForm] = useState({
    name: '', phone: '', country: 'ES', currency: 'EUR', businessType: '', preferredPaymentMethod: 'wallet',
    companyName: '', billingEmail: '', billingPhone: '', address: '', city: '', zipCode: '', billingCountry: 'ES'
  });
  const [subscribing, setSubscribing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Wallet and safety forms
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [cardForm, setCardForm] = useState({ cardNumber: '', expiryDate: '', cvv: '', cardholderName: '' });
  const [showCardModal, setShowCardModal] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [subscriptionMethods, setSubscriptionMethods] = useState<any>({ wallet: true, polar: false, paypal: false });
  const [rechargeProvider, setRechargeProvider] = useState<'polar' | 'paypal'>('polar');
  const [selectedSubscriptionMethod, setSelectedSubscriptionMethod] = useState<'wallet' | 'polar' | 'paypal'>('wallet');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [bankPreview, setBankPreview] = useState<any>(null);
  const walletCurrency = String(profile?.currency || 'EUR').toUpperCase();

  const copy = (key: string, values: Record<string, string | number> = {}) => {
    return Object.entries(values).reduce((result, [name, value]) => result.replace(`{${name}}`, String(value)), t(key));
  };

  const localizedCurrencyName = (currency: any) => {
    const code = String(currency?.code || '').toUpperCase();
    const locale = String(language || 'it').split('-')[0];
    try {
      const displayNames = new (Intl as any).DisplayNames([locale], { type: 'currency' });
      const translated = displayNames.of(code);
      if (translated) return `${translated.charAt(0).toUpperCase()}${translated.slice(1)}`;
    } catch {}
    return currency?.name || code;
  };
  
  const hydrateSettingsForm = (user: any, companyData: any = null) => {
    const accountCurrency = String(user?.currency || 'EUR').toUpperCase();
    setBillingForm(prev => ({
      ...prev,
      name: user?.name || '',
      phone: user?.phone || '',
      country: user?.country || 'ES',
      currency: accountCurrency,
      businessType: user?.businessType || '',
      preferredPaymentMethod: user?.preferredPaymentMethod || 'wallet',
      companyName: companyData?.companyName || companyData?.company_name || '',
      billingEmail: companyData?.email || user?.email || '',
      billingPhone: companyData?.phone || user?.phone || '',
      address: companyData?.address || '',
      city: companyData?.city || '',
      zipCode: companyData?.zipCode || companyData?.zip_code || '',
      billingCountry: companyData?.country || user?.country || 'ES'
    }));
    setCurrency(accountCurrency);
  };

  const fetchLatestProfile = () => {
    api.getProfile().then(res => {
      setProfile(res.user);
      setCompany(res.company || null);
      hydrateSettingsForm(res.user, res.company || null);
      loadSubscriptionAndBankOptions(String(res.user?.currency || 'EUR').toUpperCase());
    }).catch(() => {});
  };

  const loadSubscriptionAndBankOptions = async (currencyCode?: string) => {
    try {
      const plansRes = await api.getSubscriptionPlans();
      const list = (plansRes.plans || []).filter((plan: any) => plan.id !== 'plan_basic' && Number(plan.price || 0) > 0);
      setSubscriptionPlans(list);
      const methods = plansRes.methods || { wallet: true, polar: false, paypal: false };
      setSubscriptionMethods(methods);
      setRechargeProvider(prev => prev === 'polar' && methods.polar ? 'polar' : methods.paypal ? 'paypal' : 'polar');
      if (!selectedPlanId && list.length) setSelectedPlanId(list[0].id);
    } catch {
      setSubscriptionPlans([]);
    }
    try {
      const bankRes = await api.getBankAccounts({ currency: currencyCode || billingForm.currency || 'EUR' });
      setBankPreview((bankRes.accounts || [])[0] || null);
    } catch {
      setBankPreview(null);
    }
  };

  const handleSubscriptionCheckout = async (method: 'wallet' | 'polar' | 'paypal', planId?: string) => {
    const chosenPlanId = planId || selectedPlanId || subscriptionPlans?.[0]?.id;
    if (!chosenPlanId) {
      setActionError(t('customer_settings_no_plan_selected'));
      return;
    }
    setSelectedSubscriptionMethod(method);
    setSubscribing(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = method === 'wallet'
        ? await api.subscribeWithWallet(chosenPlanId)
        : method === 'paypal'
          ? await api.paypalSubscriptionCheckout(chosenPlanId)
          : await api.polarSubscriptionCheckout(chosenPlanId);
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      if (res.success) {
        if (res.user) setProfile(res.user);
        setActionSuccess(res.message || t('customer_settings_subscription_success'));
        fetchLatestProfile();
      }
    } catch (e: any) {
      const message = String(e?.message || '').trim();
      setActionError(/polar/i.test(message) ? t('customer_settings_payment_error') : (message || t('customer_settings_subscription_error')));
    } finally {
      setSubscribing(false);
    }
  };


  useEffect(() => {
    fetchLatestProfile();

    // Parse query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_success') === 'true') {
      setSuccessMessage(t('customer_settings_subscription_processed'));
      // Clean query parameters from URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handlePolarSubscription = async () => {
    setSubscribing(true);
    setErrorMessage('');
    try {
      const res = await api.polarCreateCheckout();
      if (res.url) {
        window.location.href = res.url;
      } else {
        setErrorMessage(t('customer_settings_payment_error'));
      }
    } catch (e: any) {
      setErrorMessage(t('customer_settings_subscription_error'));
    } finally {
      setSubscribing(false);
    }
  };

  const handleRecharge = async (amount: number, paymentProvider: 'polar' | 'paypal' = rechargeProvider) => {
    setRechargeLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.rechargeWallet(amount, paymentProvider);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      if (res.success) {
        setProfile(res.user);
        setActionSuccess(t('customer_settings_recharge_success'));
      }
    } catch (e: any) {
      const message = String(e?.message || '').trim();
      setActionError(/polar/i.test(message) ? t('customer_settings_payment_error') : (message || t('customer_settings_recharge_error')));
    } finally {
      setRechargeLoading(false);
    }
  };

  const handleConnectCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.connectCard(cardForm);
      if (res.success) {
        setProfile(res.user);
        setShowCardModal(false);
        setCardForm({ cardNumber: '', expiryDate: '', cvv: '', cardholderName: '' });
        setActionSuccess(t('customer_settings_card_success'));
      }
    } catch (e: any) {
      setActionError(e.message || t('customer_settings_card_error'));
    }
  };

  const handleConnectPaypal = async () => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.startPaypalLink();
      if (!res?.url) throw new Error(t('customer_settings_paypal_unavailable'));
      window.location.assign(res.url);
    } catch (e: any) {
      setActionError(e.message || t('customer_settings_paypal_error'));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.updateUserSettings({
        language,
        name: billingForm.name,
        phone: billingForm.phone,
        country: billingForm.country,
        currency: billingForm.currency,
        businessType: billingForm.businessType,
        preferredPaymentMethod: billingForm.preferredPaymentMethod,
        billing: {
          companyName: billingForm.companyName,
          email: billingForm.billingEmail,
          phone: billingForm.billingPhone,
          address: billingForm.address,
          city: billingForm.city,
          zipCode: billingForm.zipCode,
          country: billingForm.billingCountry
        }
      });
      setProfile(res.user);
      setCompany(res.company || null);
      hydrateSettingsForm(res.user, res.company || null);
      setActionSuccess(t('customer_settings_settings_success'));
    } catch (e: any) {
      setActionError(e.message || t('customer_settings_settings_error'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLanguageChange = async (nextLanguage: string) => {
    const previousLanguage = language;
    setLanguage(nextLanguage as any);
    setLanguageSaving(true);
    setActionError('');
    try {
      const res = await api.updateUserSettings({ language: nextLanguage });
      if (res.user) setProfile((current: any) => ({ ...(current || {}), ...res.user }));
      if (res.company) setCompany(res.company);
    } catch (e: any) {
      setLanguage(previousLanguage);
      setActionError(e.message || t('customer_settings_settings_error'));
    } finally {
      setLanguageSaving(false);
    }
  };

  return (
    <div className="py-2 md:py-4">
      <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-8">{t('customer_settings_title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_language_label')}</label>
          <select value={language} disabled={languageSaving} onChange={(e) => handleLanguageChange(e.target.value)} className="input-dynamic font-bold disabled:opacity-60">
            {availableLanguages.map((item) => <option key={item.code} value={item.code}>{item.flag} {item.label}</option>)}
          </select>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{t('customer_settings_language_help')}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_currency_label')}</label>
          <select value={billingForm.currency} onChange={e => { const nextCurrency = e.target.value; setBillingForm({...billingForm, currency: nextCurrency}); loadSubscriptionAndBankOptions(nextCurrency); }} className="input-dynamic font-bold">
            {availableCurrencies.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol}) - {localizedCurrencyName(c)}</option>)}
          </select>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{t('customer_settings_currency_help')}</p>
          {billingForm.currency !== walletCurrency && <p className="text-[10px] text-amber-600 dark:text-amber-300 mt-1">{copy('customer_settings_currency_change_notice', { from: walletCurrency, to: billingForm.currency })}</p>}
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_appearance')}</label>
          <select defaultValue={localStorage.getItem('theme') || 'system'} onChange={(e) => { localStorage.setItem('theme', e.target.value); window.dispatchEvent(new Event('ship24go-theme-change')); }} className="input-dynamic font-bold">
            <option value="system">{t('customer_settings_appearance_system')}</option>
            <option value="light">{t('customer_settings_appearance_light')}</option>
            <option value="dark">{t('customer_settings_appearance_dark')}</option>
          </select>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{t('customer_settings_appearance_help')}</p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-neon-green rounded-2xl font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      {actionSuccess && (
        <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 text-green-800 dark:text-neon-green rounded-2xl font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="w-5 h-5 text-green-500" /> {actionSuccess}
        </div>
      )}

      {actionError && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-400 rounded-2xl font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <X className="w-5 h-5 text-red-500" /> {actionError}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Wallet Balance Column */}
          <div className="glass-panel p-4 sm:p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
              <div>
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-lg flex items-center gap-2 dark:text-white"><Wallet className="text-blue-500 dark:text-neon-cyan" /> {t('customer_settings_wallet_title')}</h3>
                      <span className="text-2xl font-black text-blue-600 dark:text-neon-cyan">
                        {format(Number(profile?.balance || 0), walletCurrency)}
                      </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('customer_settings_wallet_desc')}</p>
                  
                  <div className="grid grid-cols-3 gap-3 mb-6">
                      <button 
                        onClick={() => handleRecharge(50)}
                        disabled={rechargeLoading}
                        className="py-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-pink-500 dark:hover:border-neon-pink text-gray-700 dark:text-gray-300 font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        +{format(50, walletCurrency)}
                      </button>
                      <button 
                        onClick={() => handleRecharge(100)}
                        disabled={rechargeLoading}
                        className="py-3 border-2 border-pink-500 bg-pink-50/10 text-pink-600 dark:text-neon-pink rounded-xl font-bold shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        +{format(100, walletCurrency)}
                      </button>
                      <button 
                        onClick={() => handleRecharge(200)}
                        disabled={rechargeLoading}
                        className="py-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-pink-500 dark:hover:border-neon-pink text-gray-700 dark:text-gray-300 font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        +{format(200, walletCurrency)}
                      </button>
                  </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subscriptionMethods.polar && <button
                  onClick={() => handleRecharge(150, 'polar')}
                  disabled={rechargeLoading}
                  className="w-full flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-slate-900 via-blue-700 to-cyan-600 hover:from-slate-950 hover:via-blue-800 hover:to-cyan-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
                >
                  <span>{rechargeLoading ? t('customer_settings_secure_payment_loading') : t('customer_settings_recharge_card')}</span>
                  {!rechargeLoading && <PaymentBrandMarks label={t('customer_settings_payment_brands')} />}
                </button>}
                {subscriptionMethods.paypal && <button
                  onClick={() => handleRecharge(150, 'paypal')}
                  disabled={rechargeLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
                >
                  {rechargeLoading ? t('customer_settings_secure_payment_loading') : copy('customer_settings_recharge_paypal', { currency: walletCurrency })}
                </button>}
                {!subscriptionMethods.polar && !subscriptionMethods.paypal && <p className="sm:col-span-2 text-sm text-gray-500 dark:text-gray-400 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3">{t('customer_settings_card_payments_disabled')}</p>}
                <Link to="/panel/settings/wallet" className="w-full text-center bg-white dark:bg-dark-800 border border-blue-200 dark:border-neon-cyan/30 text-blue-700 dark:text-neon-cyan font-bold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-transform hover:-translate-y-0.5">
                  {t('bank_open_wallet')}
                </Link>

              {bankPreview && (
                <div className="mt-5 rounded-2xl border border-blue-100 dark:border-neon-cyan/20 bg-blue-50/70 dark:bg-neon-cyan/10 p-4 sm:col-span-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-neon-cyan">{t('customer_settings_bank_available')}</p>
                      <p className="font-black text-gray-900 dark:text-white mt-1">{bankPreview.bankName} · {bankPreview.currency}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{bankPreview.accountHolder}</p>
                    </div>
                    <Link to="/panel/settings/wallet" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black text-center hover:bg-blue-700">{t('customer_settings_bank_details')}</Link>
                  </div>
                  {bankPreview.details && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 text-xs">
                      {Object.entries(bankPreview.details).slice(0, 4).map(([key, value]: any) => (
                        <div key={key} className="rounded-xl bg-white/70 dark:bg-dark-800/60 p-3"><span className="block text-gray-500 font-bold">{getLocalizedBankDetailLabel(t, key)}</span><span className="block text-gray-900 dark:text-white font-mono font-black break-all">{getLocalizedBankDetailValue(t, key, value)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
          </div>

          {/* Connected Methods of Backup & Security */}
          <div className="glass-panel p-4 sm:p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
              <div>
                  <h3 className="font-bold text-lg mb-2 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="text-green-500 dark:text-neon-green" /> {t('customer_settings_backup_title')}
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                    {t('customer_settings_backup_desc')}
                  </p>
                  
                  <div className="space-y-4">
                      {/* Security Card Status */}
                      <div className="p-4 rounded-2xl bg-gray-50 dark:bg-dark-800/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                              <div>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">{t('customer_settings_security_card')}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {profile?.cardConnected ? copy('customer_settings_security_card_connected', { details: profile.cardDetails?.cardNumber || '' }) : t('customer_settings_security_card_none')}
                                  </p>
                              </div>
                          </div>
                          <button 
                            onClick={() => setShowCardModal(true)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${profile?.cardConnected ? 'border-gray-200 hover:bg-gray-100 text-gray-600 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300' : 'border-pink-500 hover:bg-pink-50 dark:border-neon-pink dark:hover:bg-neon-pink/10 text-pink-600 dark:text-neon-pink'}`}
                          >
                              {profile?.cardConnected ? t('customer_settings_change_card') : t('customer_settings_link_card')}
                          </button>
                      </div>

                      {/* PayPal Backup Status */}
                      <div className="p-4 rounded-2xl bg-gray-50 dark:bg-dark-800/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <i className="fa-brands fa-paypal text-blue-500 text-lg"></i>
                              <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{t('customer_settings_backup_paypal')}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {profile?.paypalConnected ? copy('customer_settings_backup_paypal_connected', { email: profile.paypalEmail || '' }) : t('customer_settings_backup_paypal_none')}
                                  </p>
                              </div>
                          </div>
                          <button 
                            onClick={handleConnectPaypal}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${profile?.paypalConnected ? 'border-gray-200 hover:bg-gray-100 text-gray-600 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300' : 'border-blue-500 hover:bg-blue-50 dark:border-neon-cyan dark:hover:bg-neon-cyan/10 text-blue-600 dark:text-neon-cyan'}`}
                          >
                              {profile?.paypalConnected ? t('customer_settings_change_paypal') : t('customer_settings_link_paypal')}
                          </button>
                      </div>
                  </div>
              </div>

              {/* Customer-facing subscription summary */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 mt-6 flex items-center justify-between">
                  <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('customer_settings_subscription_plan')}</p>
                      <p className="text-sm font-black text-pink-500 dark:text-neon-pink uppercase tracking-wide">{String((profile as any)?.subscription?.planName || (profile as any)?.currentPlanName || 'DoorDrop').toUpperCase()} {t('customer_settings_active').toUpperCase()}</p>
                  </div>
                  <button 
                    onClick={handlePolarSubscription}
                    disabled={subscribing}
                    className="text-xs font-bold bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-xl transition-all hover:scale-105"
                  >
                     {subscribing ? t('customer_settings_loading') : t('customer_settings_manage_subscription')}
                  </button>
              </div>
          </div>
      </div>



      <div className="glass-panel p-4 sm:p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-800 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-neon-cyan mb-2">{t('customer_settings_subscription_eyebrow')}</p>
            <h3 className="font-black text-2xl text-gray-900 dark:text-white">{t('customer_settings_plans_title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-3xl">{t('customer_settings_plans_desc')}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 dark:bg-dark-800 border border-gray-100 dark:border-gray-800 p-4 min-w-[220px]">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider">{t('customer_settings_available_balance')}</p>
            <p className="text-2xl font-black text-blue-600 dark:text-neon-cyan">{format(Number(profile?.balance || 0), walletCurrency)}</p>
          </div>
        </div>

        {!subscriptionPlans.length ? (
          <div className="rounded-2xl bg-gray-50 dark:bg-dark-800/60 border border-gray-100 dark:border-gray-800 p-6 text-center text-gray-500 dark:text-gray-400 font-bold">{t('customer_settings_no_plans')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {subscriptionPlans.map((plan: any) => (
              <div key={plan.id} className={`rounded-3xl border p-5 bg-white dark:bg-dark-800 shadow-sm ${selectedPlanId === plan.id ? 'border-blue-500 dark:border-neon-cyan' : 'border-gray-100 dark:border-gray-800'}`}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{plan.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{copy('customer_settings_discount', { value: Number(plan.discount || 0).toFixed(0) })}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-neon-cyan/10 text-blue-700 dark:text-neon-cyan text-xs font-black">{plan.currency}</span>
                </div>
                <p className="text-3xl font-black text-gray-900 dark:text-white mb-5">{format(Number(plan.price || 0), plan.currency)}</p>
                <button onClick={() => setSelectedPlanId(plan.id)} className="w-full mb-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 font-black text-sm hover:border-blue-500 dark:hover:border-neon-cyan">{t('customer_settings_select')}</button>
                <div className="space-y-2">
                  {subscriptionMethods.wallet && plan.walletEnabled !== false && <button disabled={subscribing} onClick={() => handleSubscriptionCheckout('wallet', plan.id)} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-60">{t('customer_settings_activate_wallet')}</button>}
                  {subscriptionMethods.polar && plan.polarEnabled !== false && <button disabled={subscribing} onClick={() => handleSubscriptionCheckout('polar', plan.id)} className="w-full flex flex-wrap items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-slate-900 via-blue-700 to-cyan-600 hover:from-slate-950 hover:via-blue-800 hover:to-cyan-700 text-white font-black text-sm disabled:opacity-60"><span>{t('customer_settings_activate_card')}</span><PaymentBrandMarks label={t('customer_settings_payment_brands')} /></button>}
                  {subscriptionMethods.paypal && plan.paypalEnabled !== false && <button disabled={subscribing} onClick={() => handleSubscriptionCheckout('paypal', plan.id)} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-60">{t('customer_settings_activate_paypal')}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credit Card Pre-authorization linking Modal */}
      {showCardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-gradient-to-r from-pink-500 to-orange-400 dark:from-neon-pink dark:to-[#9D00FF] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><CreditCard /> {t('customer_settings_card_modal_title')}</h3>
                <p className="text-xs text-white/80 mt-1">{t('customer_settings_card_modal_desc')}</p>
              </div>
              <button onClick={() => setShowCardModal(false)} className="p-1 rounded-full hover:bg-white/10 text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConnectCardSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_cardholder')}</label>
                <input required type="text" placeholder={t('customer_settings_cardholder_placeholder')} value={cardForm.cardholderName} onChange={e => setCardForm({...cardForm, cardholderName: e.target.value})} className="input-dynamic" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_card_number')}</label>
                <input required type="text" maxLength={16} placeholder={t('customer_settings_card_number_placeholder')} value={cardForm.cardNumber} onChange={e => setCardForm({...cardForm, cardNumber: e.target.value})} className="input-dynamic" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_expiry')}</label>
                  <input required type="text" maxLength={5} placeholder="MM/YY" value={cardForm.expiryDate} onChange={e => setCardForm({...cardForm, expiryDate: e.target.value})} className="input-dynamic" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_cvv')}</label>
                  <input required type="password" maxLength={3} placeholder={t('customer_settings_cvv_placeholder')} value={cardForm.cvv} onChange={e => setCardForm({...cardForm, cvv: e.target.value})} className="input-dynamic" />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                * {t('customer_settings_card_security_note')}
              </p>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowCardModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-all text-sm">
                  {t('customer_settings_cancel')}
                </button>
                <button type="submit" className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-orange-400 dark:from-neon-pink dark:to-[#9D00FF] text-white font-bold rounded-xl shadow hover:opacity-90 transition-all text-sm">
                  {t('customer_settings_link_card')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel p-4 sm:p-6 md:p-8 rounded-3xl max-w-2xl border border-gray-200 dark:border-gray-800 relative overflow-hidden mt-8">
        <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-pink-300/20 dark:bg-neon-pink/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[60px] pointer-events-none"></div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 relative z-10 flex items-center">
          <Settings className="w-5 h-5 mr-2 text-pink-500 dark:text-neon-pink" />
          {t('customer_settings_billing_title')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 relative z-10">{t('customer_settings_billing_desc')}</p>
        {profile ? (
          <form onSubmit={handleSaveSettings} className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_business_name')}</label>
                <input type="text" value={billingForm.name} onChange={e => setBillingForm({...billingForm, name: e.target.value})} className="input-dynamic font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_account_email')}</label>
                <input type="email" readOnly value={profile.email || ''} className="input-dynamic font-medium bg-gray-50 dark:bg-dark-800" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_phone')}</label>
                <input type="text" value={billingForm.phone} onChange={e => setBillingForm({...billingForm, phone: e.target.value})} className="input-dynamic font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_operating_country')}</label>
                <CountrySelect value={billingForm.country} onChange={(code) => setBillingForm({...billingForm, country: code, billingCountry: billingForm.billingCountry || code})} lang={language || "es"} buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_default_currency')}</label>
                <select value={billingForm.currency} onChange={e => { const nextCurrency = e.target.value; setBillingForm({...billingForm, currency: nextCurrency}); loadSubscriptionAndBankOptions(nextCurrency); }} className="input-dynamic font-bold">
                  {availableCurrencies.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol}) - {localizedCurrencyName(c)}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">{t('customer_settings_quote_currency_help')}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_preferred_shipping_method')}</label>
                <select value={billingForm.preferredPaymentMethod} onChange={e => setBillingForm({...billingForm, preferredPaymentMethod: e.target.value})} className="input-dynamic font-bold">
                  <option value="wallet">{t('customer_settings_wallet_balance')}</option>
                  <option value="card">{t('customer_settings_saved_card')}</option>
                  <option value="paypal">{t('customer_settings_saved_paypal')}</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">{t('customer_settings_shipping_preference_help')}</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_business_type')}</label>
                <input type="text" value={billingForm.businessType} onChange={e => setBillingForm({...billingForm, businessType: e.target.value})} className="input-dynamic font-medium" />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
              <h4 className="font-black text-gray-900 dark:text-white mb-4">{t('customer_settings_billing_data')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_tax_name')}</label>
                  <input type="text" value={billingForm.companyName} onChange={e => setBillingForm({...billingForm, companyName: e.target.value})} className="input-dynamic font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_billing_email')}</label>
                  <input type="email" value={billingForm.billingEmail} onChange={e => setBillingForm({...billingForm, billingEmail: e.target.value})} className="input-dynamic font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_billing_phone')}</label>
                  <input type="text" value={billingForm.billingPhone} onChange={e => setBillingForm({...billingForm, billingPhone: e.target.value})} className="input-dynamic font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_billing_country')}</label>
                  <CountrySelect value={billingForm.billingCountry} onChange={(code) => setBillingForm({...billingForm, billingCountry: code})} lang={language || "es"} buttonClassName="input-dynamic flex items-center gap-2 cursor-pointer font-medium text-left" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_address')}</label>
                  <input type="text" value={billingForm.address} onChange={e => setBillingForm({...billingForm, address: e.target.value})} className="input-dynamic font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_city')}</label>
                  <input type="text" value={billingForm.city} onChange={e => setBillingForm({...billingForm, city: e.target.value})} className="input-dynamic font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('customer_settings_postal_code')}</label>
                  <input type="text" value={billingForm.zipCode} onChange={e => setBillingForm({...billingForm, zipCode: e.target.value})} className="input-dynamic font-medium" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
               <p className="text-xs text-gray-500 dark:text-gray-400">{t('customer_settings_current_balance')}: <span className="font-black text-gray-900 dark:text-white">{format(Number(profile?.balance || 0), walletCurrency)}</span></p>
               <button disabled={settingsSaving} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-full font-bold hover:shadow-lg transition-transform hover:-translate-y-1 text-sm disabled:opacity-50">
                 {settingsSaving ? t('customer_settings_saving') : t('customer_settings_save')}
               </button>
            </div>
          </form>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">{t('customer_settings_loading_profile')}</p>
        )}
      </div>
    </div>
  );
};


const PaymentBrandMarks = ({ className = '', label = 'Visa, Mastercard y Google Pay' }: { className?: string; label?: string }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] leading-none shadow-sm ${className}`}
    aria-label={label}
    title={label}
  >
    <span className="font-black tracking-tight text-[#1a1f71]">VISA</span>
    <span className="inline-flex items-center -space-x-1" aria-hidden="true">
      <span className="h-3.5 w-3.5 rounded-full bg-[#eb001b]" />
      <span className="h-3.5 w-3.5 rounded-full bg-[#f79e1b] opacity-90" />
    </span>
    <span className="font-semibold tracking-tight text-slate-700"><span className="text-[#4285f4]">G</span> Pay</span>
  </span>
);

const CustomerApiDocs = () => {
  return (
    <div className="h-[calc(100vh-6rem)] -m-4 md:-m-8 flex flex-col bg-slate-50 dark:bg-dark-900">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800">
        <div>
          <h1 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">API Docs</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Swagger UI · Use <span className="font-bold">carrierName</span> (FedEx, UPS, DHL…) — not wholesale suppliers
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/docs" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700">
            Full screen ↗
          </a>
          <a href="/openapi.json" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-xs font-black text-slate-700 dark:text-slate-200">
            openapi.json
          </a>
          <a href="/api/docs/pdf?lang=en" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-xs font-black text-slate-700 dark:text-slate-200">
            PDF
          </a>
        </div>
      </div>
      <iframe
        title="DoorDrop API Docs"
        src="/docs?embed=1"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
};



export default function CustomerPanel() {
  const { language } = useI18n();
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('doordrop-sidebar-collapsed') === '1');
  const [profile, setProfile] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      const prefillState = location.state;
      navigate('/auth/login', { state: { from: location.pathname, prefill: prefillState?.prefill } });
      return;
    }
    api.getProfile().then(res => setProfile(res.user)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileMenuOpen]);

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

  const toggleMobileMenu = (next?: boolean) => {
    setIsMobileMenuOpen((previous) => typeof next === 'boolean' ? next : !previous);
  };

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem('doordrop-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

  const adminBackupToken = typeof window !== 'undefined' ? localStorage.getItem('ship24go_admin_token_backup') : null;
  const impersonatedClientName = typeof window !== 'undefined' ? localStorage.getItem('ship24go_impersonated_client_name') : '';
  const customerViewCopy = language === 'it'
    ? { active: 'Vista cliente attiva', back: 'Torna al Super Admin' }
    : language.startsWith('en')
      ? { active: 'Active customer view', back: 'Back to Super Admin' }
      : language === 'fr'
        ? { active: 'Vue client active', back: 'Retour au Super Admin' }
        : language === 'de'
          ? { active: 'Aktive Kundenansicht', back: 'Zurück zum Super Admin' }
          : { active: 'Vista de cliente activa', back: 'Volver al Super Admin' };
  const returnToAdmin = () => {
    const token = localStorage.getItem('ship24go_admin_token_backup');
    const returnPath = localStorage.getItem('ship24go_admin_return_path') || '/admin/clients';
    if (token) {
      setAuthToken(token);
      localStorage.removeItem('ship24go_admin_token_backup');
      localStorage.removeItem('ship24go_admin_return_path');
      localStorage.removeItem('ship24go_impersonated_client_name');
      navigate(returnPath);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-900 font-sans flex flex-col transition-colors print:min-h-0 print:bg-white">
      {adminBackupToken && (
        <div className="bg-slate-900 text-white px-4 py-2 text-sm font-bold flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 z-[60] print:hidden">
          <span>{customerViewCopy.active}{impersonatedClientName ? `: ${impersonatedClientName}` : ''}</span>
          <button onClick={returnToAdmin} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-black hover:bg-slate-100">{customerViewCopy.back}</button>
        </div>
      )}
      {!adminBackupToken && <GlobalTermsGate />}
      <div className="print:hidden"><Header toggleTheme={toggleTheme} isDark={isDark} isMobileMenuOpen={isMobileMenuOpen} toggleMobileMenu={toggleMobileMenu} profile={profile} /></div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><Sidebar isMobileMenuOpen={isMobileMenuOpen} toggleMobileMenu={toggleMobileMenu} isSidebarCollapsed={isSidebarCollapsed} toggleSidebarCollapsed={toggleSidebarCollapsed} profile={profile} /></div>
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 h-[calc(100dvh-4rem)] print:block print:h-auto print:min-h-0 print:overflow-visible print:p-0">
          <PanelErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} />} />
            <Route path="/quote" element={<Quote />} />
            <Route path="/tariffa/*" element={<Tariffa />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/marketplace/*" element={<SellerPanel profile={profile} onProfileUpdated={() => api.getProfile().then(res => setProfile(res.user)).catch(() => {})} />} />
            <Route path="/omnichannel/*" element={<OmnichannelApp profile={profile} />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/billing" element={<CustomerBilling />} />
            <Route path="/settings/wallet" element={<CustomerWalletTransfer />} />
            <Route path="/settings" element={<CustomerSettings />} />
            <Route path="/tickets" element={<CustomerTickets />} />
            <Route path="/copilot" element={<AiCopilotChat />} />
            <Route path="/api-docs" element={<CustomerApiDocs />} />
            <Route path="*" element={<div className="p-8 text-gray-500 dark:text-gray-400">Módulo en construcción</div>} />
          </Routes>
          </PanelErrorBoundary>
        </main>
      </div>
    </div>
  );
}
