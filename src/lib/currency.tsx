import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { api } from './api';

export type CurrencyItem = { code: string; symbol: string; name: string; decimals?: number };

export interface CurrencyContextType {
  currency: string;
  country: string;
  rates: Record<string, number>;
  convert: (amount: number, from?: string) => number;
  format: (amount: number, from?: string) => string;
  setCurrency: (currency: string) => void;
  setCountry: (country: string) => void;
  availableCurrencies: CurrencyItem[];
  countryCurrencyMap: Record<string, string>;
  countryLanguageMap: Record<string, string>;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

/** Fallback only until MySQL catalog loads — DOP must be first-class */
export const countryCurrencyMapFallback: Record<string, string> = {
  DO: 'DOP', IT: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR',
  AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', CH: 'EUR',
  US: 'USD', EC: 'USD', PA: 'USD', PR: 'USD', SV: 'USD',
  GB: 'GBP', CO: 'COP', MX: 'MXN', AR: 'ARS', CL: 'CLP',
  BR: 'BRL', PE: 'PEN', CN: 'CNY', HT: 'HTG', CA: 'CAD',
};

export const defaultCurrencies: CurrencyItem[] = [
  { code: 'DOP', symbol: 'RD$', name: 'Peso dominicano', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'Dólar estadounidense', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'Libra esterlina', decimals: 2 },
  { code: 'COP', symbol: 'COP$', name: 'Peso colombiano', decimals: 0 },
  { code: 'MXN', symbol: 'MX$', name: 'Peso mexicano', decimals: 2 },
  { code: 'ARS', symbol: 'ARS$', name: 'Peso argentino', decimals: 2 },
  { code: 'CLP', symbol: 'CLP$', name: 'Peso chileno', decimals: 0 },
  { code: 'BRL', symbol: 'R$', name: 'Real brasileño', decimals: 2 },
  { code: 'PEN', symbol: 'S/', name: 'Sol peruano', decimals: 2 },
  { code: 'CNY', symbol: '¥', name: 'Yuan chino', decimals: 2 },
  { code: 'HTG', symbol: 'G', name: 'Gourde haitiano', decimals: 2 },
  { code: 'CAD', symbol: 'CA$', name: 'Dólar canadiense', decimals: 2 },
];

// back-compat export name
export const availableCurrencies = defaultCurrencies;
export const countryCurrencyMap = countryCurrencyMapFallback;

const defaultRates: Record<string, number> = {
  EUR: 1.0, USD: 1.09, DOP: 66.6, GBP: 0.84, COP: 4420, MXN: 19.5,
  ARS: 990, CLP: 1020, BRL: 6.15, PEN: 4.05, CNY: 7.85, HTG: 142, CAD: 1.48,
};

const normalizeCurrency = (code: any, list: CurrencyItem[] = defaultCurrencies) => {
  const value = String(code || '').trim().toUpperCase();
  if (list.some((c) => c.code === value)) return value;
  // allow codes even if not in list yet (from DB)
  if (/^[A-Z]{3}$/.test(value)) return value;
  return 'EUR';
};

const normalizeCountry = (code: any) => String(code || '').trim().toUpperCase().slice(0, 2);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState(() =>
    normalizeCurrency(localStorage.getItem('ship24go_currency') || localStorage.getItem('enviox_currency') || 'EUR')
  );
  const [country, setCountryState] = useState(() => normalizeCountry(localStorage.getItem('ship24go_country') || ''));
  const [rates, setRates] = useState<Record<string, number>>(defaultRates);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<CurrencyItem[]>(defaultCurrencies);
  const [ccMap, setCcMap] = useState<Record<string, string>>(countryCurrencyMapFallback);
  const [clMap, setClMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    api.getCurrencies()
      .then((res) => {
        if (!cancelled && res?.rates) setRates({ ...defaultRates, ...res.rates });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    fetch('/api/public/locale', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;

        // Catalog from MySQL
        if (Array.isArray(data.currencies) && data.currencies.length) {
          const list: CurrencyItem[] = data.currencies.map((c: any) => ({
            code: String(c.code || '').toUpperCase(),
            symbol: c.symbol || c.code,
            name: c.name || c.code,
            decimals: typeof c.decimals === 'number' ? c.decimals : 2,
          })).filter((c: CurrencyItem) => c.code);
          // Force DOP present
          if (!list.find((c) => c.code === 'DOP')) {
            list.unshift({ code: 'DOP', symbol: 'RD$', name: 'Peso dominicano', decimals: 2 });
          }
          setAvailable(list);
        }
        if (data.countryCurrencyMap && typeof data.countryCurrencyMap === 'object') {
          setCcMap({ ...countryCurrencyMapFallback, ...data.countryCurrencyMap });
        }
        if (data.countryLanguageMap && typeof data.countryLanguageMap === 'object') {
          setClMap(data.countryLanguageMap);
        }

        const detectedCountry = normalizeCountry(data.country || '');
        const manualCountry = localStorage.getItem('ship24go_country_manual') === '1';
        const manualCurrency = localStorage.getItem('ship24go_currency_manual') === '1';

        if (detectedCountry && !manualCountry) {
          const allowAuto = !localStorage.getItem('ship24go_country') || localStorage.getItem('ship24go_country_auto') === '1';
          if (allowAuto) {
            setCountryState(detectedCountry);
            localStorage.setItem('ship24go_country', detectedCountry);
            localStorage.setItem('ship24go_country_auto', '1');
          }
        }

        // Currency from MySQL row for country (e.g. DO → DOP)
        const map = { ...countryCurrencyMapFallback, ...(data.countryCurrencyMap || {}) };
        const cc = detectedCountry || normalizeCountry(localStorage.getItem('ship24go_country'));
        const detectedCurrency = normalizeCurrency(
          data.currency || map[cc] || 'EUR',
          Array.isArray(data.currencies) ? data.currencies : defaultCurrencies
        );

        if (detectedCurrency && !manualCurrency) {
          const hasSaved = localStorage.getItem('ship24go_currency') || localStorage.getItem('enviox_currency');
          const autoOnly = localStorage.getItem('ship24go_currency_auto') === '1';
          // Always re-apply auto currency from geo when not manual (fixes stuck EUR for DO)
          if (!hasSaved || autoOnly || (cc === 'DO' && detectedCurrency === 'DOP' && !manualCurrency)) {
            setCurrencyState(detectedCurrency);
            localStorage.setItem('enviox_currency', detectedCurrency);
            localStorage.setItem('ship24go_currency', detectedCurrency);
            localStorage.setItem('ship24go_currency_auto', '1');
          }
        }

        try {
          if (data.country) sessionStorage.setItem('ship24go_geo_country', String(data.country).toUpperCase().slice(0, 2));
          if (data.language) sessionStorage.setItem('ship24go_geo_language', String(data.language));
          if (data.currency) sessionStorage.setItem('ship24go_geo_currency', String(data.currency).toUpperCase());
        } catch {}
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const setCurrency = (code: string) => {
    const safeCode = normalizeCurrency(code, available);
    setCurrencyState(safeCode);
    localStorage.setItem('enviox_currency', safeCode);
    localStorage.setItem('ship24go_currency', safeCode);
    localStorage.setItem('ship24go_currency_manual', '1');
    localStorage.removeItem('ship24go_currency_auto');
  };

  const setCountry = (code: string) => {
    const safeCountry = normalizeCountry(code);
    setCountryState(safeCountry);
    localStorage.setItem('ship24go_country', safeCountry);
    localStorage.setItem('ship24go_country_manual', '1');
    localStorage.removeItem('ship24go_country_auto');
    const recommended = ccMap[safeCountry] || countryCurrencyMapFallback[safeCountry];
    if (recommended && localStorage.getItem('ship24go_currency_manual') !== '1') {
      const cur = normalizeCurrency(recommended, available);
      setCurrencyState(cur);
      localStorage.setItem('enviox_currency', cur);
      localStorage.setItem('ship24go_currency', cur);
      localStorage.setItem('ship24go_currency_auto', '1');
    }
  };

  const convert = (amount: number, from: string = 'EUR') => {
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    const source = normalizeCurrency(from, available);
    const target = normalizeCurrency(currency, available);
    if (source === target) return value;
    const amountInEUR = source === 'EUR' ? value : value / (rates[source] || defaultRates[source] || 1);
    return target === 'EUR' ? amountInEUR : amountInEUR * (rates[target] || defaultRates[target] || 1);
  };

  const format = (amount: number, from: string = 'EUR') => {
    const converted = convert(amount, from);
    const curr = available.find((c) => c.code === normalizeCurrency(currency, available)) || available[0] || defaultCurrencies[0];
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: curr.code,
        minimumFractionDigits: curr.decimals ?? 2,
        maximumFractionDigits: curr.decimals ?? 2,
      }).format(converted);
    } catch {
      const decimals = curr.decimals ?? 2;
      return `${curr.symbol} ${converted.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  };

  const value = useMemo(
    () => ({
      currency,
      country,
      rates,
      convert,
      format,
      setCurrency,
      setCountry,
      availableCurrencies: available,
      countryCurrencyMap: ccMap,
      countryLanguageMap: clMap,
      loading,
    }),
    [currency, country, rates, available, ccMap, clMap, loading]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
}
