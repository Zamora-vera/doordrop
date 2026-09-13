import { WORLD_COUNTRIES, COUNTRY_LANGUAGE, getCountry } from '../lib/countries';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type AddressParts = {
  addressLine1: string;
  streetName: string;
  civicNumber: string;
  city: string;
  zipCode: string;
  country: string;
  formattedAddress: string;
  googlePlaceId: string;
};

interface AddressAutocompleteProps {
  value: string;
  civicNumber?: string;
  onChange: (value: string) => void;
  onCivicNumberChange?: (value: string) => void;
  onSelectAddress?: (parts: AddressParts) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  countryCode?: string;
}

declare global {
  interface Window {
    google?: any;
    __ship24goGoogleMapsPromise?: Promise<void>;
    __ship24goGoogleMapsKey?: string;
    __ship24goGoogleMapsKeyPromise?: Promise<string>;
    __ship24goGoogleMapsLang?: string;
  }
}

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(WORLD_COUNTRIES.map((c) => [c.code, c.nameEs]));


async function getGoogleMapsKey(): Promise<string> {
  if (window.__ship24goGoogleMapsKey) return window.__ship24goGoogleMapsKey;
  if (window.__ship24goGoogleMapsKeyPromise) return window.__ship24goGoogleMapsKeyPromise;

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

async function loadGoogleMaps(language = 'es') {
  const key = await getGoogleMapsKey();
  if (!key) throw new Error('maps_not_available');

  if (window.google?.maps?.places && window.__ship24goGoogleMapsLang === language) return;

  const currentScript = document.querySelector<HTMLScriptElement>('script[data-ship24go-google-maps="1"]');
  const currentKey = currentScript?.dataset.googleMapsKey || '';
  const currentLang = currentScript?.dataset.googleMapsLanguage || '';

  if (currentScript && (currentKey !== key || currentLang !== language)) {
    currentScript.remove();
    window.__ship24goGoogleMapsPromise = undefined;
    window.__ship24goGoogleMapsLang = undefined;
    try {
      delete (window as any).google;
    } catch {}
  }

  if (window.__ship24goGoogleMapsPromise) return window.__ship24goGoogleMapsPromise;

  window.__ship24goGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ship24go-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('maps_not_available')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=${encodeURIComponent(language)}`;
    script.async = true;
    script.defer = true;
    script.dataset.ship24goGoogleMaps = '1';
    script.dataset.googleMapsKey = key;
    script.dataset.googleMapsLanguage = language;
    script.onload = () => {
      window.__ship24goGoogleMapsLang = language;
      resolve();
    };
    script.onerror = () => {
      window.__ship24goGoogleMapsPromise = undefined;
      reject(new Error('maps_not_available'));
    };
    document.head.appendChild(script);
  });

  return window.__ship24goGoogleMapsPromise;
}

const component = (components: any[] = [], type: string, variant: 'long_name' | 'short_name' = 'long_name') => {
  const found = components.find((item: any) => Array.isArray(item.types) && item.types.includes(type));
  return found?.[variant] || found?.long_name || found?.short_name || '';
};

const extractCity = (components: any[] = []) => {
  const wanted = ['locality', 'postal_town', 'administrative_area_level_2', 'administrative_area_level_1'];
  for (const type of wanted) {
    const value = component(components, type);
    if (value) return value;
  }
  return '';
};

const joinStreet = (street: string, civic: string) => [street, civic].filter(Boolean).join(' ').trim();

const extractManualCivicNumber = (address: string) => {
  const value = String(address || '').trim();
  const match = value.match(/(?:^|\s)(\d+[A-Za-zÀ-ÿ\/-]{0,8})\s*$/);
  return match?.[1] || '';
};

export function AddressAutocomplete({
  value,
  civicNumber = '',
  onChange,
  onCivicNumberChange,
  onSelectAddress,
  placeholder = 'Busca y selecciona la dirección correcta',
  className,
  required,
  countryCode = '',
}: AddressAutocompleteProps) {
  const selectedCountry = String(countryCode || '').toUpperCase();
  const language = (COUNTRY_LANGUAGE && COUNTRY_LANGUAGE[selectedCountry]) || getCountry(selectedCountry)?.language || 'es';
  const countryName = useMemo(() => COUNTRY_NAMES[selectedCountry] || selectedCountry, [selectedCountry]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    loadGoogleMaps(language)
      .then(() => {
        if (!mounted || !window.google?.maps?.places || !inputRef.current) return;
        autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ['address_components', 'formatted_address', 'place_id', 'name'],
          types: ['address'],
          componentRestrictions: selectedCountry ? { country: selectedCountry.toLowerCase() } : undefined,
        });

        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current?.getPlace?.();
          const components = place?.address_components || [];
          const street = component(components, 'route');
          const civic = component(components, 'street_number');
          const postal = component(components, 'postal_code');
          const city = extractCity(components);
          const country = component(components, 'country', 'short_name') || selectedCountry;
          const line1 = joinStreet(street || place?.name || value, civic || civicNumber);

          onChange(line1);
          if (onCivicNumberChange && civic) onCivicNumberChange(civic);
          onSelectAddress?.({
            addressLine1: line1,
            streetName: street || place?.name || value,
            civicNumber: civic || civicNumber,
            city,
            zipCode: postal,
            country,
            formattedAddress: place?.formatted_address || line1,
            googlePlaceId: place?.place_id || '',
          });
        });
        setMapsReady(true);
      })
      .catch(() => setMapsReady(false));

    return () => {
      mounted = false;
      try {
        if (autocompleteRef.current && window.google?.maps?.event) {
          window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        }
      } catch {}
    };
  }, [language, selectedCountry]);

  const handleManualChange = (nextValue: string) => {
    onChange(nextValue);
    const manualCivic = extractManualCivicNumber(nextValue);
    if (manualCivic && manualCivic !== civicNumber) {
      onCivicNumberChange?.(manualCivic);
    }
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleManualChange(e.target.value)}
        placeholder={placeholder}
        className={className || 'input-dynamic'}
        required={required}
        autoComplete="street-address"
      />
      <p className="mt-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
        {mapsReady
          ? `Sugerencias de Google activas para ${countryName}. Selecciona una dirección de la lista.`
          : `Escribe calle y número exactamente como aparece en ${countryName || 'el país de destino'}.`}
      </p>
    </div>
  );
}
