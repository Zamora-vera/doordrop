import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search, Star } from 'lucide-react';
import {
  PRIORITY_COUNTRY_CODES,
  getCountry,
  getCountryFlag,
  WORLD_COUNTRIES,
  WorldCountry,
} from '../lib/countries';

type Props = {
  value: string;
  onChange: (code: string, country?: WorldCountry) => void;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  /** UI language: es | en | it | fr | de | zh | ht | ... */
  lang?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  showLanguage?: boolean;
};

const USAGE_KEY = 'ship24go_country_usage_v1';
const MAX_RECENT = 12;

const LOCALE_MAP: Record<string, string> = {
  es: 'es',
  'es-ES': 'es',
  'es-DO': 'es-DO',
  'es-CO': 'es-CO',
  'es-EC': 'es',
  'es-MX': 'es-MX',
  en: 'en',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  it: 'it',
  fr: 'fr',
  de: 'de',
  zh: 'zh-CN',
  ht: 'fr', // closest for DisplayNames
  pt: 'pt',
  'pt-BR': 'pt-BR',
  nl: 'nl',
};

function resolveLocale(lang?: string): string {
  const raw = String(lang || 'es').trim();
  if (LOCALE_MAP[raw]) return LOCALE_MAP[raw];
  const short = raw.slice(0, 2).toLowerCase();
  return LOCALE_MAP[short] || short || 'es';
}

function createDisplayNames(lang?: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([resolveLocale(lang)], { type: 'region' });
  } catch {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      return null;
    }
  }
}

function countryLabel(c: WorldCountry, lang?: string, dn?: Intl.DisplayNames | null): string {
  const localized = dn?.of(c.code);
  if (localized) return localized;
  const short = String(lang || 'es').slice(0, 2).toLowerCase();
  if (short === 'en') return c.nameEn || c.nameEs || c.code;
  return c.nameEs || c.nameEn || c.code;
}

function loadUsage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function bumpUsage(code: string) {
  try {
    const usage = loadUsage();
    const key = String(code || '').toUpperCase();
    if (!key) return;
    usage[key] = Number(usage[key] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    /* ignore */
  }
}

function normalizeApiCountry(c: any): WorldCountry | null {
  const code = String(c?.code || c?.iso2 || '').toUpperCase();
  if (!code || code.length !== 2) return null;
  return {
    code,
    nameEn: String(c?.nameEn || c?.name_en || c?.name || code),
    nameEs: String(c?.nameEs || c?.name_es || c?.name || code),
    language: String(c?.language || c?.language_code || ''),
    languageName: String(c?.languageName || c?.language_name || ''),
    currency: String(c?.currency || 'USD'),
    flag: String(c?.flag || c?.flag_url || `https://flagsapi.com/${code}/flat/64.png`),
    flagSm: String(c?.flagSm || `https://flagsapi.com/${code}/flat/32.png`),
  };
}

function searchCopy(lang?: string) {
  const l = String(lang || 'es').slice(0, 2).toLowerCase();
  if (l === 'en') return { ph: 'Search country A–Z…', none: 'No countries found', most: 'Most used', all: 'All countries A–Z', loading: 'Searching…', results: 'results' };
  if (l === 'it') return { ph: 'Cerca paese A–Z…', none: 'Nessun paese trovato', most: 'Più usati', all: 'Tutti i paesi A–Z', loading: 'Ricerca…', results: 'risultati' };
  if (l === 'fr') return { ph: 'Rechercher un pays A–Z…', none: 'Aucun pays trouvé', most: 'Plus utilisés', all: 'Tous les pays A–Z', loading: 'Recherche…', results: 'résultats' };
  if (l === 'de') return { ph: 'Land suchen A–Z…', none: 'Kein Land gefunden', most: 'Am häufigsten', all: 'Alle Länder A–Z', loading: 'Suche…', results: 'Treffer' };
  if (l === 'zh') return { ph: '搜索国家 A–Z…', none: '未找到国家', most: '常用', all: '全部国家 A–Z', loading: '搜索中…', results: '结果' };
  return { ph: 'Buscar país A–Z…', none: 'Sin resultados', most: 'Más usados', all: 'Todos los países A–Z', loading: 'Buscando…', results: 'resultados' };
}

export function CountrySelect({
  value,
  onChange,
  className = '',
  buttonClassName = '',
  placeholder,
  lang = 'es',
  disabled = false,
  name,
  id,
  showLanguage = false,
}: Props) {
  const langKey = String(lang || 'es');
  const copy = searchCopy(langKey);
  const dn = useMemo(() => createDisplayNames(langKey), [langKey]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [remote, setRemote] = useState<WorldCountry[] | null>(null);
  const [usageTick, setUsageTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstMatchRef = useRef<HTMLButtonElement | null>(null);

  // Debounce search + loading spinner
  useEffect(() => {
    if (!q.trim()) {
      setDebouncedQ('');
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  // Load full list from MySQL API
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    fetch(`/api/public/countries?lang=${encodeURIComponent(String(lang || 'es').slice(0, 2))}`, {
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = ((data?.countries || []) as any[])
          .map(normalizeApiCountry)
          .filter(Boolean) as WorldCountry[];
        if (list.length >= 50) setRemote(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const baseList = useMemo(() => {
    return remote && remote.length ? remote : WORLD_COUNTRIES;
  }, [remote]);

  const byCode = useMemo(() => {
    const m = new Map<string, WorldCountry>();
    baseList.forEach((c) => m.set(c.code, c));
    return m;
  }, [baseList]);

  const labelOf = useCallback(
    (c: WorldCountry) => countryLabel(c, langKey, dn),
    [langKey, dn]
  );

  // Most used = local usage hits first, then platform priority defaults
  const mostUsed = useMemo(() => {
    const usage = loadUsage();
    const scored = Object.entries(usage)
      .map(([code, count]) => ({ code, count: Number(count) || 0 }))
      .filter((x) => x.count > 0 && byCode.has(x.code))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    const ordered: WorldCountry[] = [];
    const seen = new Set<string>();
    for (const s of scored) {
      const c = byCode.get(s.code);
      if (c && !seen.has(c.code)) {
        ordered.push(c);
        seen.add(c.code);
      }
      if (ordered.length >= MAX_RECENT) break;
    }
    for (const code of PRIORITY_COUNTRY_CODES) {
      if (seen.has(code)) continue;
      const c = byCode.get(code) || getCountry(code);
      if (c) {
        ordered.push(c);
        seen.add(c.code);
      }
      if (ordered.length >= MAX_RECENT) break;
    }
    return ordered;
  }, [byCode, usageTick]);

  // Full list sorted A–Z by localized name
  const allSorted = useMemo(() => {
    const locale = resolveLocale(langKey);
    return [...baseList].sort((a, b) =>
      labelOf(a).localeCompare(labelOf(b), locale, { sensitivity: 'base' })
    );
  }, [baseList, labelOf, langKey]);

  const query = debouncedQ.toLowerCase();

  const filterFn = useCallback(
    (c: WorldCountry) => {
      if (!query) return true;
      const name = labelOf(c).toLowerCase();
      return (
        name.includes(query) ||
        c.code.toLowerCase().includes(query) ||
        c.nameEn.toLowerCase().includes(query) ||
        c.nameEs.toLowerCase().includes(query) ||
        c.language.toLowerCase().includes(query) ||
        (c.languageName || '').toLowerCase().includes(query)
      );
    },
    [query, labelOf]
  );

  // Default: most used on top. Searching: full A–Z matches only (faster to scan).
  const filteredMost = useMemo(
    () => (query ? [] : mostUsed),
    [mostUsed, query]
  );

  const filteredAll = useMemo(() => {
    if (query) return allSorted.filter(filterFn);
    const mostCodes = new Set(mostUsed.map((c) => c.code));
    return allSorted.filter((c) => !mostCodes.has(c.code) && filterFn(c));
  }, [allSorted, filterFn, query, mostUsed]);

  const selected = useMemo(() => {
    const code = String(value || '').toUpperCase();
    return byCode.get(code) || getCountry(code);
  }, [byCode, value]);

  // Scroll to first match when search resolves
  useEffect(() => {
    if (!open || searching) return;
    if (!query) return;
    const t = window.setTimeout(() => {
      firstMatchRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, searching, query, filteredMost, filteredAll]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (c: WorldCountry) => {
    bumpUsage(c.code);
    setUsageTick((n) => n + 1);
    onChange(c.code, c);
    setOpen(false);
    setQ('');
    setDebouncedQ('');
  };

  const selectedLabel = selected
    ? labelOf(selected)
    : placeholder || (langKey.startsWith('en') ? 'Select country' : 'Seleccionar pais');

  const totalVisible = filteredMost.length + filteredAll.length;
  const firstMatchCode = useMemo(() => {
    if (!query || searching) return null;
    return filteredMost[0]?.code || filteredAll[0]?.code || null;
  }, [query, searching, filteredMost, filteredAll]);

  const renderRow = (c: WorldCountry, opts?: { star?: boolean }) => {
    const active = c.code === String(value || '').toUpperCase();
    const isFirstMatch = Boolean(firstMatchCode) && c.code === firstMatchCode;
    const n = labelOf(c);
    return (
      <button
        key={`${opts?.star ? 'm' : 'a'}-${c.code}`}
        type="button"
        ref={isFirstMatch ? firstMatchRef : undefined}
        onClick={() => pick(c)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
          active
            ? 'bg-blue-50/90 dark:bg-blue-500/15'
            : isFirstMatch
              ? 'bg-amber-50/80 dark:bg-amber-500/10'
              : 'hover:bg-blue-50 dark:hover:bg-blue-500/10'
        }`}
      >
        <img
          src={c.flagSm || getCountryFlag(c.code, 'flat', 32)}
          alt={c.code}
          className="w-7 h-5 object-cover rounded-sm shadow-sm shrink-0 bg-slate-100"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = `https://flagsapi.com/${c.code}/shiny/32.png`;
          }}
        />
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-slate-900 dark:text-white">{c.code}</span>
          <span className="text-slate-600 dark:text-slate-300"> {n}</span>
          {showLanguage ? (
            <span className="block text-[10px] text-slate-400 truncate">
              {c.languageName || c.language} · {c.currency}
            </span>
          ) : null}
        </span>
        {opts?.star ? <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" /> : null}
        {active ? <span className="text-blue-600 text-xs font-bold">✓</span> : null}
      </button>
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value || ''} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={
          buttonClassName ||
          'w-full flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-left text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium disabled:opacity-50'
        }
      >
        {selected ? (
          <img
            src={getCountryFlag(selected.code, 'flat', 32)}
            alt={selected.code}
            className="w-6 h-4 object-cover rounded-sm shadow-sm shrink-0 bg-slate-100"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = `https://flagsapi.com/${selected.code}/shiny/32.png`;
            }}
          />
        ) : (
          <span className="w-6 h-4 rounded-sm bg-slate-200 dark:bg-slate-700 shrink-0" />
        )}
        <span className="flex-1 truncate">
          {selected ? (
            <>
              <span className="font-semibold">{selected.code}</span>
              <span className="text-slate-500 dark:text-slate-400 font-normal"> · {selectedLabel}</span>
            </>
          ) : (
            selectedLabel
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[80] mt-2 w-full min-w-[18rem] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            {searching || loadingList ? (
              <Loader2 className="w-4 h-4 text-blue-500 ml-1 animate-spin shrink-0" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={copy.ph}
              className="w-full bg-transparent text-sm py-2 pr-2 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {searching ? (
              <span className="text-[10px] text-blue-500 font-semibold whitespace-nowrap pr-1">{copy.loading}</span>
            ) : null}
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto py-1 scroll-smooth">
            {loadingList && !baseList.length ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                {copy.loading}
              </div>
            ) : searching ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                {copy.loading}
              </div>
            ) : totalVisible === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">{copy.none}</div>
            ) : (
              <>
                {filteredMost.length > 0 && !query ? (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {copy.most}
                    </div>
                    {filteredMost.map((c) => renderRow(c, { star: true }))}
                    <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {copy.all}
                    </div>
                  </>
                ) : null}

                {query ? (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-blue-500">
                    {totalVisible} {copy.results} · A–Z
                  </div>
                ) : null}

                {filteredAll.map((c) => renderRow(c))}
              </>
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between gap-2">
            <span>
              {totalVisible} / {baseList.length}
            </span>
            <span className="truncate">A-Z · {resolveLocale(langKey)} · flagsapi</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CountrySelect;
