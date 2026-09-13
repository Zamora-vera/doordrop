import React, { useState } from 'react';

const normalize = (v: any) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function resolveCarrierName(quote: any): string {
  const candidates = [
    quote?.carrierName,
    quote?.courierName,
    quote?.providerPayload?.ship24goCarrierName,
    quote?.providerPayload?.selectedService?.ship24goCarrierName,
    quote?.providerPayload?.carrier,
    quote?.providerPayload?.carrier_name,
    quote?.providerPayload?.carrierName,
    quote?.providerPayload?.courier,
    quote?.providerPayload?.vendor,
    quote?.providerPayload?.nombre_agencia,
    quote?.service,
    quote?.provider,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    const n = normalize(value);
    if (n.includes('ups')) return 'UPS';
    if (n.includes('dhl')) return 'DHL';
    if (n.includes('fedex') || n.includes('federal express')) return 'FedEx';
    if (n.includes('tnt')) return 'TNT';
    if (n.includes('dpd')) return 'DPD';
    if (n.includes('gls')) return 'GLS';
    if (n.includes('seur')) return 'SEUR';
    if (n.includes('nacex')) return 'NACEX';
    if (n.includes('mrw')) return 'MRW';
    if (n.includes('correos express')) return 'Correos Express';
    if (n.includes('correos')) return 'Correos';
    if (n.includes('zeleris')) return 'Zeleris';
    if (n.includes('ontime')) return 'Ontime';
    if (n.includes('ctt')) return 'CTT';
    if (n.includes('brt') || n.includes('bartolini')) return 'BRT';
    if (n.includes('inpost') || n.includes('in post')) return 'InPost';
    if (n.includes('sda')) return 'SDA';
    if (n.includes('poste italiane') || (n.includes('poste') && n.includes('ital'))) return 'Poste Italiane';
    if (n.includes('hermes')) return 'Hermes';
    if (n.includes('chronopost')) return 'Chronopost';
    if (n.includes('colissimo')) return 'Colissimo';
    if (n.includes('genei') || n.includes('parcel') || n.includes('spedire') || n.includes('spediamo') || n.includes('pacco') || n.includes('easypost') || n.includes('ship24') || n.includes('logihub')) continue;
    return value.replace(/\s+/g, ' ').slice(0, 48);
  }
  return 'DoorDrop';
}

/** Public logo URLs for known carriers (CDN). Fallback uses monogram. */
export function carrierLogoUrl(name: string): string | null {
  const n = normalize(name);
  const map: Array<[string, string]> = [
    ['ups', 'https://logo.clearbit.com/ups.com'],
    ['dhl', 'https://logo.clearbit.com/dhl.com'],
    ['fedex', 'https://logo.clearbit.com/fedex.com'],
    ['tnt', 'https://logo.clearbit.com/tnt.com'],
    ['dpd', 'https://logo.clearbit.com/dpd.com'],
    ['gls', 'https://logo.clearbit.com/gls-group.eu'],
    ['seur', 'https://logo.clearbit.com/seur.com'],
    ['nacex', 'https://logo.clearbit.com/nacex.es'],
    ['mrw', 'https://logo.clearbit.com/mrw.es'],
    ['correos express', 'https://logo.clearbit.com/correosexpress.com'],
    ['correos', 'https://logo.clearbit.com/correos.es'],
    ['zeleris', 'https://logo.clearbit.com/zeleris.com'],
    ['ontime', 'https://logo.clearbit.com/ontime.es'],
    ['ctt', 'https://logo.clearbit.com/ctt.pt'],
    ['brt', 'https://logo.clearbit.com/brt.it'],
    ['inpost', 'https://logo.clearbit.com/inpost.it'],
    ['sda', 'https://logo.clearbit.com/sda.it'],
    ['poste italiane', 'https://logo.clearbit.com/poste.it'],
    ['hermes', 'https://logo.clearbit.com/evri.com'],
    ['chronopost', 'https://logo.clearbit.com/chronopost.fr'],
    ['colissimo', 'https://logo.clearbit.com/laposte.fr'],
  ];
  for (const [key, url] of map) {
    if (n.includes(key)) return url;
  }
  return null;
}

const BRAND_COLORS: Record<string, string> = {
  UPS: 'from-amber-700 to-yellow-600',
  DHL: 'from-yellow-400 to-red-600',
  FedEx: 'from-purple-700 to-orange-500',
  SEUR: 'from-red-600 to-red-500',
  NACEX: 'from-orange-600 to-amber-500',
  Correos: 'from-yellow-500 to-yellow-600',
  'Correos Express': 'from-blue-700 to-yellow-500',
  BRT: 'from-red-700 to-red-500',
  InPost: 'from-yellow-400 to-gray-900',
  SDA: 'from-blue-800 to-blue-600',
  'Poste Italiane': 'from-yellow-500 to-blue-800',
  GLS: 'from-blue-700 to-yellow-400',
  TNT: 'from-orange-600 to-red-600',
  DPD: 'from-red-600 to-gray-800',
  Zeleris: 'from-sky-600 to-blue-800',
};

function monogram(name: string) {
  const parts = String(name || 'DD').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || 'DD').slice(0, 2).toUpperCase();
}

export function CarrierLogo({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const resolved = (!failed && (logoUrl || carrierLogoUrl(name))) || null;
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-14 h-14' : 'w-12 h-12';
  const grad = BRAND_COLORS[name] || 'from-slate-700 to-slate-900';

  if (resolved) {
    return (
      <div className={`${dim} rounded-2xl bg-white border border-slate-200/80 shadow-sm p-1.5 flex items-center justify-center overflow-hidden`}>
        <img
          src={resolved}
          alt={name}
          className="w-full h-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${dim} rounded-2xl bg-gradient-to-br ${grad} text-white font-black text-xs shadow-md flex items-center justify-center tracking-wide`}>
      {monogram(name)}
    </div>
  );
}
