import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

type CurrencyCode = 'ZAR' | 'USD';

type Ctx = {
  code: CurrencyCode;
  symbol: string;              // "R" | "$"
  locale: string;              // "en-ZA" | "en-US"
  fmt: (n: number | string | null | undefined, opts?: Intl.NumberFormatOptions) => string;
  // AntD <InputNumber> helpers
  formatter: (value: number | string | undefined) => string;
  parser: (value: string | undefined) => string;
  setCurrency: (c: CurrencyCode) => void; // for optimistic changes after /api/profile PUT
  refreshFromProfile: () => Promise<void>; // re-pull from backend
};

const CurrencyContext = createContext<Ctx | null>(null);

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within <CurrencyProvider>');
  return ctx;
};

const pickMeta = (code: CurrencyCode) => ({
  code,
  symbol: code === 'USD' ? '$' : 'R',
  locale: code === 'USD' ? 'en-US' : 'en-ZA',
});

const API_BASE = 'https://quantnow-sa1e.onrender.com';

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [code, setCode] = useState<CurrencyCode>('ZAR');

  const { symbol, locale } = useMemo(() => pickMeta(code), [code]);

  const fmt = useCallback((n: number | string | null | undefined, opts?: Intl.NumberFormatOptions) => {
    const num = typeof n === 'string' ? Number(n) : Number(n ?? 0);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...opts,
    }).format(num);
  }, [locale, code]);

  // AntD InputNumber helpers (no color/style; just symbols and parsing)
  const formatter = useCallback((value?: number | string) => {
    if (value == null || value === '') return '';
    const s = String(value).replace(/[^\d.-]/g, '');
    const [intPart, fracPart = ''] = s.split('.');
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${symbol} ${withSep}${fracPart ? `.${fracPart}` : ''}`;
  }, [symbol]);

  const parser = useCallback((value?: string) => {
    if (!value) return '';
    return value.replace(/[^\d.-]/g, ''); // strip currency/commas
  }, []);

  const refreshFromProfile = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const c = String(data?.currency || 'ZAR').toUpperCase();
        if (c === 'USD' || c === 'ZAR') setCode(c as CurrencyCode);
      }
    } catch {}
  }, []);

  useEffect(() => { refreshFromProfile(); }, [refreshFromProfile]);

  const value: Ctx = {
    code,
    symbol,
    locale,
    fmt,
    formatter,
    parser,
    setCurrency: (c) => setCode(c),
    refreshFromProfile,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};
