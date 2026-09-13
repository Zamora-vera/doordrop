import { WORLD_COUNTRIES } from '../lib/countries';
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ZipCodeAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (data: { postalCode: string; city?: string; label?: string; subtitle?: string; source?: string }) => void;
  placeholder: string;
  className?: string;
  required?: boolean;
  countryCode?: string;
}

type Suggestion = {
  label: string;
  subtitle: string;
  postalCode: string;
  city?: string;
  placeId?: string;
  source?: 'local' | 'google';
};

declare global {
  interface Window {
    google?: any;
    __ship24goGoogleMapsPromise?: Promise<void>;
    __ship24goGoogleMapsKey?: string;
    __ship24goGoogleMapsKeyPromise?: Promise<string>;
  }
}

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(WORLD_COUNTRIES.map((c) => [c.code, c.nameEs]));

const CITY_POSTAL_INDEX: Record<string, Array<{ city: string; postalCode: string; region?: string }>> = {
  ES: [
    { city: 'Madrid', postalCode: '28001' },
    { city: 'Madrid', postalCode: '28002' },
    { city: 'Madrid', postalCode: '28003' },
    { city: 'Madrid', postalCode: '28004' },
    { city: 'Madrid', postalCode: '28005' },
    { city: 'Barcelona', postalCode: '08001' },
    { city: 'Barcelona', postalCode: '08002' },
    { city: 'Barcelona', postalCode: '08003' },
    { city: 'Valencia', postalCode: '46001' },
    { city: 'Sevilla', postalCode: '41001' },
    { city: 'Zaragoza', postalCode: '50001' },
    { city: 'Málaga', postalCode: '29001' },
    { city: 'Alicante', postalCode: '03001' },
  ],
  IT: [
    { city: 'Roma', postalCode: '00118' },
    { city: 'Roma', postalCode: '00184' },
    { city: 'Milano', postalCode: '20121' },
    { city: 'Napoli', postalCode: '80121' },
    { city: 'Torino', postalCode: '10121' },
    { city: 'Firenze', postalCode: '50121' },
    { city: 'Bologna', postalCode: '40121' },
    { city: 'Palermo', postalCode: '90121' },
    { city: 'Venezia', postalCode: '30100' },
  ],
  FR: [
    { city: 'Paris', postalCode: '75001' },
    { city: 'Paris', postalCode: '75008' },
    { city: 'Paris', postalCode: '75015' },
    { city: 'Lyon', postalCode: '69001' },
    { city: 'Marseille', postalCode: '13001' },
    { city: 'Toulouse', postalCode: '31000' },
    { city: 'Nice', postalCode: '06000' },
    { city: 'Bordeaux', postalCode: '33000' },
  ],
  DE: [
    { city: 'Berlin', postalCode: '10115' },
    { city: 'Berlin', postalCode: '10117' },
    { city: 'Hamburg', postalCode: '20095' },
    { city: 'München', postalCode: '80331' },
    { city: 'Köln', postalCode: '50667' },
    { city: 'Frankfurt am Main', postalCode: '60311' },
    { city: 'Düsseldorf', postalCode: '40210' },
  ],
  PT: [
    { city: 'Lisboa', postalCode: '1100-001' },
    { city: 'Porto', postalCode: '4000-007' },
    { city: 'Braga', postalCode: '4700-001' },
    { city: 'Coimbra', postalCode: '3000-001' },
  ],
  GB: [
    { city: 'London', postalCode: 'E1W 1BD' },
    { city: 'London', postalCode: 'SW1A 1AA' },
    { city: 'Manchester', postalCode: 'M1 1AE' },
    { city: 'Birmingham', postalCode: 'B1 1AA' },
    { city: 'Liverpool', postalCode: 'L1 8JQ' },
  ],
  US: [
    { city: 'Miami', postalCode: '33101' },
    { city: 'New York', postalCode: '10001' },
    { city: 'Los Angeles', postalCode: '90001' },
    { city: 'Chicago', postalCode: '60601' },
    { city: 'Houston', postalCode: '77002' },
  ],
  DO: [
    { city: 'Santo Domingo', postalCode: '10100' },
    { city: 'Santiago', postalCode: '51000' },
    { city: 'Punta Cana', postalCode: '23000' },
    { city: 'Bávaro', postalCode: '23301' },
    { city: 'Baní', postalCode: '94000' },
    { city: 'La Romana', postalCode: '22000' },
  ],
  MX: [
    { city: 'Ciudad de México', postalCode: '06000' },
    { city: 'Guadalajara', postalCode: '44100' },
    { city: 'Monterrey', postalCode: '64000' },
    { city: 'Cancún', postalCode: '77500' },
  ],
  CO: [
    { city: 'Bogotá', postalCode: '110111' },
    { city: 'Medellín', postalCode: '050001' },
    { city: 'Cali', postalCode: '760001' },
    { city: 'Barranquilla', postalCode: '080001' },
  ],
  AR: [
    { city: 'Buenos Aires', postalCode: 'C1000' },
    { city: 'Córdoba', postalCode: 'X5000' },
    { city: 'Rosario', postalCode: 'S2000' },
  ],
  CL: [
    { city: 'Santiago', postalCode: '8320000' },
    { city: 'Valparaíso', postalCode: '2340000' },
    { city: 'Concepción', postalCode: '4030000' },
  ],
  BR: [
    { city: 'São Paulo', postalCode: '01000-000' },
    { city: 'Rio de Janeiro', postalCode: '20000-000' },
    { city: 'Brasília', postalCode: '70000-000' },
  ],
  NL: [
    { city: 'Amsterdam', postalCode: '1011' },
    { city: 'Rotterdam', postalCode: '3011' },
    { city: 'Utrecht', postalCode: '3511' },
  ],
  BE: [
    { city: 'Bruxelles', postalCode: '1000' },
    { city: 'Antwerpen', postalCode: '2000' },
    { city: 'Gent', postalCode: '9000' },
  ],
};

const normalize = (text: string) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const extractPostalPattern = (text: string) =>
  String(text || '').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b|\b\d{4,6}(?:-\d{3,4})?\b/i)?.[0] || '';

async function getGoogleMapsKey(): Promise<string> {
  if (window.__ship24goGoogleMapsKey) {
    return window.__ship24goGoogleMapsKey;
  }

  if (window.__ship24goGoogleMapsKeyPromise) {
    return window.__ship24goGoogleMapsKeyPromise;
  }

  const staticKey =
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    (globalThis as any).VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    (globalThis as any).GOOGLE_MAPS_API_KEY ||
    '';

  window.__ship24goGoogleMapsKeyPromise = fetch('/api/public/runtime-config', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : {}))
    .then((data: any) => {
      const runtimeKey = String(data?.googleMapsKey || '');
      const key = runtimeKey || String(staticKey || '');
      window.__ship24goGoogleMapsKey = key;
      return key;
    })
    .catch(() => String(staticKey || ''));

  return window.__ship24goGoogleMapsKeyPromise;
}

const loadGoogleMaps = async () => {
  const key = await getGoogleMapsKey();

  if (!key) {
    throw new Error('maps_not_available');
  }

  if (window.google?.maps?.places && window.google?.maps?.Geocoder) {
    return;
  }

  const currentScript = document.querySelector<HTMLScriptElement>('script[data-ship24go-google-maps="1"]');
  const currentKey = currentScript?.dataset.googleMapsKey || '';

  if (currentScript && currentKey !== key) {
    currentScript.remove();
    window.__ship24goGoogleMapsPromise = undefined;
  }

  if (window.__ship24goGoogleMapsPromise) {
    return window.__ship24goGoogleMapsPromise;
  }

  window.__ship24goGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ship24go-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('maps_not_available')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.dataset.ship24goGoogleMaps = '1';
    script.dataset.googleMapsKey = key;
    script.onload = () => resolve();
    script.onerror = () => {
      window.__ship24goGoogleMapsPromise = undefined;
      reject(new Error('maps_not_available'));
    };
    document.head.appendChild(script);
  });

  return window.__ship24goGoogleMapsPromise;
};

const extractPostalCode = (components: any[] = []) => {
  if (!Array.isArray(components)) return '';

  const found = components.find((component: any) =>
    Array.isArray(component.types) && component.types.includes('postal_code')
  );

  return found?.long_name || found?.short_name || '';
};

const extractCity = (components: any[] = []) => {
  const wanted = ['locality', 'postal_town', 'administrative_area_level_2', 'administrative_area_level_1'];

  for (const type of wanted) {
    const found = components.find((component: any) =>
      Array.isArray(component.types) && component.types.includes(type)
    );

    if (found?.long_name) return found.long_name;
  }

  return '';
};

const localRanges = (countryCode: string, query: string): Suggestion[] => {
  const q = normalize(query);
  const cc = String(countryCode || '').toUpperCase();

  if (!q || q.length < 2) return [];

  const items = CITY_POSTAL_INDEX[cc] || [];
  const countryName = COUNTRY_NAMES[cc] || cc;

  const matched = items
    .filter((item) => normalize(`${item.city} ${item.postalCode} ${item.region || ''}`).includes(q))
    .map((item) => ({
      label: `${item.postalCode} — ${item.city}`,
      subtitle: [item.region, countryName].filter(Boolean).join(', '),
      postalCode: item.postalCode,
      city: item.city,
      source: 'local' as const,
    }));

  if (cc === 'ES') {
    const madridRanges = Array.from({ length: 55 }, (_, i) => ({ city: 'Madrid', postalCode: String(28001 + i) }));
    const barcelonaRanges = Array.from({ length: 42 }, (_, i) => ({ city: 'Barcelona', postalCode: String(8001 + i).padStart(5, '0') }));
    const ranges = [...madridRanges, ...barcelonaRanges]
      .filter((item) => normalize(`${item.city} ${item.postalCode}`).includes(q))
      .map((item) => ({
        label: `${item.postalCode} — ${item.city}`,
        subtitle: countryName,
        postalCode: item.postalCode,
        city: item.city,
        source: 'local' as const,
      }));

    return [...ranges, ...matched]
      .filter((item, index, arr) => arr.findIndex((x) => x.label === item.label) === index)
      .slice(0, 12);
  }

  return matched.slice(0, 12);
};

export function ZipCodeAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  required,
  countryCode = '',
  onResolved,
}: ZipCodeAutocompleteProps) {
  const selectedCountry = String(countryCode || '').toUpperCase();
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const blurTimer = useRef<number | null>(null);
  const serviceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    loadGoogleMaps()
      .then(() => {
        if (!mounted || !window.google?.maps) return;

        serviceRef.current = new window.google.maps.places.AutocompleteService();
        geocoderRef.current = new window.google.maps.Geocoder();
        setReady(true);
      })
      .catch(() => {
        serviceRef.current = null;
        geocoderRef.current = null;
        setReady(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const countryName = useMemo(() => COUNTRY_NAMES[selectedCountry] || selectedCountry, [selectedCountry]);

  useEffect(() => {
    const q = value.trim();
    const currentRequest = ++requestIdRef.current;

    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const local = localRanges(selectedCountry, q);

    if (!ready || !serviceRef.current || !window.google?.maps?.places) {
      setSuggestions(local);
      setLoading(false);
      return;
    }

    setLoading(true);

    const request: any = {
      input: q,
      types: ['geocode'],
      componentRestrictions: selectedCountry
        ? { country: selectedCountry.toLowerCase() }
        : undefined,
    };

    serviceRef.current.getPlacePredictions(request, (predictions: any[] = [], status: string) => {
      if (currentRequest !== requestIdRef.current) return;

      const googleOk = status === window.google.maps.places.PlacesServiceStatus.OK;

      const remote: Suggestion[] = googleOk
        ? predictions.map((prediction: any) => {
            const main = prediction.structured_formatting?.main_text || prediction.description || q;
            const secondary = prediction.structured_formatting?.secondary_text || countryName || '';
            const postalCode = extractPostalPattern(`${main} ${secondary}`);

            return {
              label: main,
              subtitle: secondary,
              postalCode,
              city: '',
              placeId: prediction.place_id,
              source: 'google' as const,
            };
          })
        : [];

      const merged = [...local, ...remote].filter((item, index, arr) => {
        const key = `${item.label}-${item.subtitle}-${item.placeId || item.postalCode}`;
        return arr.findIndex((x) => `${x.label}-${x.subtitle}-${x.placeId || x.postalCode}` === key) === index;
      });

      setSuggestions(merged.slice(0, 12));
      setLoading(false);
    });
  }, [value, selectedCountry, countryName, ready]);

  const resolveAndSelect = (item: Suggestion) => {
    if (!item.placeId || !geocoderRef.current) {
      const postalCode = item.postalCode || extractPostalPattern(item.label) || item.label;
      onChange(postalCode);
      onResolved?.({ postalCode, city: item.city || '', label: item.label, subtitle: item.subtitle, source: item.source });
      setFocused(false);
      return;
    }

    geocoderRef.current.geocode({ placeId: item.placeId }, (results: any[] = [], status: string) => {
      const result = status === 'OK' ? results[0] : null;
      const components = result?.address_components || [];
      const postalCode = extractPostalCode(components) || item.postalCode || extractPostalPattern(result?.formatted_address || item.label) || '';
      const city = extractCity(components) || item.city || '';

      if (postalCode) {
        onChange(postalCode);
      } else {
        onChange(city || item.label);
      }

      onResolved?.({ postalCode: postalCode || item.label, city, label: result?.formatted_address || item.label, subtitle: item.subtitle, source: item.source || 'google' });
      setFocused(false);
    });
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setFocused(false), 160);
        }}
        placeholder={placeholder}
        className={className || 'input-dynamic font-semibold'}
        required={required}
        inputMode="text"
        autoComplete="postal-code"
      />

      {focused && value.trim().length >= 2 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              Buscando ubicaciones...
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              Escribe ciudad, dirección o código postal.
            </div>
          )}

          {suggestions.map((item, idx) => (
            <button
              key={`${item.placeId || item.postalCode || item.label}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                resolveAndSelect(item);
              }}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {item.label}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.subtitle || countryName}
                  </div>
                </div>
                {item.postalCode && (
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600 dark:bg-blue-950/30 dark:text-cyan-300">
                    {item.postalCode}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
