import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCurrency } from '../lib/currency';

export const CurrencySelector = ({ compact = true }: { compact?: boolean }) => {
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = availableCurrencies.find((c) => c.code === currency) || availableCurrencies[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Priority order: DOP first among common
  const ordered = [...availableCurrencies].sort((a, b) => {
    const p = ['DOP', 'EUR', 'USD', 'GBP', 'COP', 'MXN', 'ARS', 'CLP', 'BRL', 'CNY', 'HTG', 'CAD'];
    const ia = p.indexOf(a.code); const ib = p.indexOf(b.code);
    if (ia === -1 && ib === -1) return a.code.localeCompare(b.code);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-white/80 dark:bg-dark-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-100 hover:border-blue-300 focus:outline-none cursor-pointer"
        aria-label="Currency"
      >
        <span className="text-blue-600 dark:text-neon-cyan">{current?.symbol || currency}</span>
        <span>{current?.code || currency}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 min-w-[14rem] max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 shadow-xl">
          {ordered.map((item) => {
            const active = item.code === currency;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => { setCurrency(item.code); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-blue-50 dark:hover:bg-blue-500/10 ${
                  active ? 'bg-blue-50/70 dark:bg-blue-500/15 font-black text-blue-700 dark:text-neon-cyan' : 'font-medium text-gray-800 dark:text-gray-100'
                }`}
              >
                <span className="w-10 font-black text-blue-600 dark:text-neon-cyan">{item.symbol}</span>
                <span className="flex-1">{item.code}{compact ? '' : ` · ${item.name}`}</span>
                {active ? <span className="text-xs">✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
