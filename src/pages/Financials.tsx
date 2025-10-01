// src/pages/Financials.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancials } from '@/contexts/FinancialsContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../AuthPage';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

// --- Period / Compare / Breakdown helpers ---
type PresetKey = 'custom' | '2m' | 'quarter' | 'half' | 'year';
type CompareMode = 'none' | 'prev-period' | 'prev-year';
type Breakdown = 'aggregate' | 'monthly';

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const iso = (d: Date) => d.toISOString().split('T')[0];
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const startOfQuarter = (d: Date) => { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); };
const endOfQuarter = (d: Date) => { const s = startOfQuarter(d); return new Date(s.getFullYear(), s.getMonth() + 3, 0); };

function computePresetRange(preset: PresetKey, anchorDate = new Date()): { from: string; to: string } {
  const today = startOfDay(anchorDate);
  if (preset === '2m') {
    const from = startOfDay(addMonths(today, -2));
    return { from: iso(from), to: iso(today) };
  }
  if (preset === 'quarter') {
    const s = startOfQuarter(today);
    const e = endOfQuarter(today);
    return { from: iso(s), to: iso(e) };
  }
  if (preset === 'half') {
    const from = startOfDay(addMonths(today, -6));
    return { from: iso(from), to: iso(today) };
  }
  if (preset === 'year') {
    const from = startOfDay(addMonths(today, -12));
    return { from: iso(from), to: iso(today) };
  }
  return { from: '', to: '' }; // custom
}

function previousPeriod(fromISO: string, toISO: string, mode: CompareMode): { prevFrom: string; prevTo: string } | null {
  if (mode === 'none') return null;
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(toISO + 'T00:00:00');
  const ms = endOfDay(to).getTime() - startOfDay(from).getTime();
  if (mode === 'prev-period') {
    const prevTo = startOfDay(from);
    const prevFrom = new Date(prevTo.getTime() - ms);
    return { prevFrom: iso(prevFrom), prevTo: iso(new Date(prevTo.getTime() - 1)) };
  }
  // prev-year
  const prevFrom = addMonths(from, -12);
  const prevTo = addMonths(to, -12);
  return { prevFrom: iso(prevFrom), prevTo: iso(prevTo) };
}

const pctChange = (current: number, prev: number) => {
  if (!isFinite(prev) || Math.abs(prev) < 1e-9) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
};
const formatPct = (p: number | null) => (p === null ? '' : `${p.toFixed(1)}%`);

// --- Types ---
interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'debt';
  amount: number;
  description: string;
  date: string;
  category: string;
  account_id: string;
  account_name: string;
}

interface Account {
  id: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  code: string;
  is_postable?: boolean;
  is_active?: boolean;
  reporting_category_id?: number | null;
}

interface Asset {
  id: string;
  name: string;
  cost: number;
  date_received: string;
  accumulated_depreciation: number;
  book_value: number;
}

interface BalanceSheetLineItem {
  item: string;
  amount: number;
  isTotal?: boolean;
  isSubheader?: boolean;
  isAdjustment?: boolean;
}

// --- Current assets detail from API ---
interface ApiCurrentAssetRow {
  section: string;
  label: string;
  amount: number;
  reporting_category_id?: number;
}
interface ApiCurrentAssetsDetail {
  total: number;
  rows: ApiCurrentAssetRow[];
}

// --- PPE detail from API ---
interface ApiPpeRow {
  section: string;
  label: string;
  gross_cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
  reporting_category_id?: number;
}
interface ApiPpeDetail {
  total_nbv: number;
  rows: ApiPpeRow[];
}

// --- Enhanced balance sheet response ---
interface ApiBalanceSheetSection {
  section: string;
  value: string;
}
interface ApiBalanceSheetResponse {
  asOf: string;
  periodStart?: string | null;
  sections: ApiBalanceSheetSection[];

  openingEquity: number | string;
  netProfitLoss: number | string;
  closingEquity?: number | string;

  assets: { current: number | string; non_current: number | string; };
  liabilities: { current: number | string; non_current: number | string; };

  otherEquityMovements?: number | string;

  current_assets_detail?: ApiCurrentAssetsDetail;
  non_current_assets_detail?: ApiPpeDetail;

  equityBreakdown?: {
    opening?: number | string;
    priorRetained?: number | string;
    periodProfit?: number | string;
    sinceInception?: number | string;
    equityAccounts?: number | string;
    totalComputed?: number | string;
  };

  control?: {
    assetsTotal?: number | string;
    liabilitiesTotal?: number | string;
    equityTotal?: number | string;
    liabPlusEquity?: number | string;
    diff?: number | string;
    effective?: {
      equityComputed?: number | string;
      liabPlusEquityComputed?: number | string;
      diffComputed?: number | string;
    };
  };

  debug?: any;
}

interface BalanceSheetData {
  assets: BalanceSheetLineItem[];
  liabilities: BalanceSheetLineItem[];
  equity: BalanceSheetLineItem[];
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalEquityAndLiabilities: number;
    diff: number;
  };
}

interface ApiIncomeStatementSection {
  section: string;
  amount: number;
  accounts: {
    name: string;
    amount: number;
  }[];
}

interface ApiTrialBalanceItem {
  account_id: number;
  code: string;
  name: string;
  type: string;
  normal_side: string;
  total_debit: string;
  total_credit: string;
  balance_debit: string;
  balance_credit: string;
}

interface ApiCashFlowSectionItem {
  line: string;
  amount: string;
}

interface ApiCashFlowGrouped {
  operating?: ApiCashFlowSectionItem[];
  investing?: ApiCashFlowSectionItem[];
  financing?: ApiCashFlowSectionItem[];
}

// Use your deployed backend
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

const openBlobInNewTab = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const newWindow = window.open(url, '_blank');
  if (!newWindow) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

type ReportId = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow-statement';

type SimpleLine = {
  item: string;
  amount?: number | '';
  isTotal?: boolean;
  isSubheader?: boolean;
  isAdjustment?: boolean;
  type?: string;
};

type MonthBucket = { key: string; start: string; end: string; label: string };

const Financials = () => {
  const navigate = useNavigate();
  const { latestProcessedTransactions } = useFinancials(); // (unused, but fine)
  const { toast } = useToast();

  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const oneYearAgo = new Date(today.setFullYear(today.getFullYear() - 1));
    return oneYearAgo.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const [preset, setPreset] = useState<PresetKey>('custom');
  const [compareMode, setCompareMode] = useState<CompareMode>('none');
  const [breakdown, setBreakdown] = useState<Breakdown>('aggregate');

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trialBalanceData, setTrialBalanceData] = useState<ApiTrialBalanceItem[]>([]);
  const [incomeStatementData, setIncomeStatementData] = useState<SimpleLine[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData>({
    assets: [], liabilities: [], equity: [],
    totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
  });
  const [cashflowData, setCashflowData] = useState<{ category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[]>([]);

  // Previous-period datasets (aggregate mode)
  const [trialBalanceDataPrev, setTrialBalanceDataPrev] = useState<ApiTrialBalanceItem[]>([]);
  const [incomeStatementDataPrev, setIncomeStatementDataPrev] = useState<SimpleLine[]>([]);
  const [balanceSheetDataPrev, setBalanceSheetDataPrev] = useState<BalanceSheetData>({
    assets: [], liabilities: [], equity: [],
    totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
  });
  const [cashflowDataPrev, setCashflowDataPrev] = useState<typeof cashflowData>([]);

  // Monthly view state
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);
  const [incomeMonthly, setIncomeMonthly] = useState<SimpleLine[][]>([]);
  const [trialMonthly, setTrialMonthly] = useState<ApiTrialBalanceItem[][]>([]);
  const [bsMonthly, setBsMonthly] = useState<BalanceSheetData[]>([]);
  const [cfMonthly, setCfMonthly] = useState<typeof cashflowData[]>([]);

  const [activeTab, setActiveTab] = useState<ReportId>('income-statement');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('income-statement');

  const reportTypes = [
    { id: 'trial-balance' as ReportId, label: 'Trial Balance' },
    { id: 'income-statement' as ReportId, label: 'Income Statement' },
    { id: 'balance-sheet' as ReportId, label: 'Balance Sheet' },
    { id: 'cash-flow-statement' as ReportId, label: 'Cashflow Statement' },
  ] as const;

  
  const token = localStorage.getItem('token');

  // ---------- Helpers ----------
  const ZEPS = 0.005;

  const num = (n: any) => {
    const parsed = parseFloat(String(n));
    return isNaN(parsed) ? 0 : parsed;
  };
  const isZeroish = (n: any) => Math.abs(Number(n) || 0) < ZEPS;
  const nonZero = (n: number) => !isZeroish(n);

  const toMoney = (val: number): string =>
    `R ${Math.abs(Number(val)).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const moneyOrBlank = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '';
    const v = Number(amount);
    if (!isFinite(v) || isZeroish(v)) return '';
    return toMoney(v);
  };
  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '';
    return toMoney(Number(amount));
  };

  // ---------- CSV helpers ----------
  const csvEscape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rowsToCsvString = (rows: (string | number | null | undefined)[][]) =>
    rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const saveCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
    const csv = rowsToCsvString(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveBlob(blob, filename);
  };
  const csvAmount = (val: number | string | null | undefined, { alwaysShow = false } = {}) => {
    if (val === null || val === undefined) return '';
    const n = Number(val);
    if (!isFinite(n)) return '';
    if (!alwaysShow && isZeroish(n)) return '';
    return Math.abs(n).toFixed(2);
  };

  // ======= ALIGNMENT / PIVOT HELPERS =======
  const toNumOrNull = (v: number | '' | undefined): number | null => (typeof v === 'number' ? v : null);

  function multiAlignByItem(series: SimpleLine[][]) {
    const monthMaps: Map<string, SimpleLine>[] = series.map(lines => {
      const m = new Map<string, SimpleLine>();
      (lines || []).forEach(l => m.set(l.item, l));
      return m;
    });

    const orderedKeys: string[] = [];
    (series[0] || []).forEach(l => orderedKeys.push(l.item));
    for (let i = 1; i < monthMaps.length; i++) {
      monthMaps[i].forEach((_v, k) => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });
    }

    return orderedKeys.map(k => {
      const metaFrom = (monthMaps.find(m => m.has(k))?.get(k));
      const flags = {
        type: metaFrom?.type,
        isTotal: metaFrom?.isTotal,
        isSubheader: metaFrom?.isSubheader,
        isAdjustment: metaFrom?.isAdjustment,
      };
      const values = monthMaps.map(m => toNumOrNull(m.get(k)?.amount as any));
      return { item: k, ...flags, values };
    });
  }

  // ======= Memoized builders to prevent update loops =======
  const buildIncomeStatementLines = useCallback((sections: ApiIncomeStatementSection[] | undefined): SimpleLine[] => {
    const lines: SimpleLine[] = [];
    if (!sections || !Array.isArray(sections)) return lines;

    const sectionMap: Record<string, ApiIncomeStatementSection> = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    const revenueSection = sectionMap['revenue'];
    if (revenueSection && revenueSection.accounts?.length > 0) {
      lines.push({ item: 'Revenue', amount: '', type: 'header' });
      revenueSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail' });
      });
      if (nonZero(revenueSection.amount)) lines.push({ item: 'Total Revenue', amount: revenueSection.amount, type: 'subtotal' });
    }

    const cogsSection = sectionMap['cogs'];
    if (cogsSection && cogsSection.accounts.some(a => nonZero(a.amount))) {
      lines.push({ item: 'Less: Cost of Goods Sold', amount: '', type: 'header' });
      cogsSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail-expense' });
      });
      if (nonZero(cogsSection.amount)) lines.push({ item: 'Total Cost of Goods Sold', amount: cogsSection.amount, type: 'subtotal' });
    }

    const totalRevenue = revenueSection?.amount || 0;
    const totalCogs = cogsSection?.amount || 0;
    const grossProfit = totalRevenue - totalCogs;
    if (nonZero(grossProfit)) lines.push({ item: 'Gross Profit', amount: grossProfit, type: 'subtotal' });

    const otherIncomeSection = sectionMap['other_income'];
    if (otherIncomeSection && otherIncomeSection.accounts.some(a => nonZero(a.amount))) {
      lines.push({ item: 'Other Income', amount: '', type: 'header' });
      otherIncomeSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail' });
      });
      if (nonZero(otherIncomeSection.amount)) lines.push({ item: 'Total Other Income', amount: otherIncomeSection.amount, type: 'subtotal' });
    }

    let totalExpenses = 0;
    const expenseKeys = Object.keys(sectionMap).filter(k => !['revenue', 'cogs', 'other_income'].includes(k));
    const hasExpenseSections = expenseKeys.some(k => sectionMap[k].accounts.some(a => nonZero(a.amount)));

    if (hasExpenseSections) {
      lines.push({ item: 'Less: Expenses', amount: '', type: 'header' });

      expenseKeys.forEach(key => {
        const section = sectionMap[key];
        if (section && section.accounts.some(a => nonZero(a.amount))) {
          const title = key.replace(/_/g, ' ');
          lines.push({ item: `  ${title}`, amount: '', type: 'subheader' });
          section.accounts.forEach(acc => {
            if (nonZero(acc.amount)) lines.push({ item: `    ${acc.name}`, amount: acc.amount, type: 'detail-expense' });
          });
          if (nonZero(section.amount)) lines.push({ item: `  Total ${title}`, amount: section.amount, type: 'subtotal' });
          totalExpenses += section.amount;
        }
      });

      if (nonZero(totalExpenses)) lines.push({ item: 'Total Expenses', amount: totalExpenses, type: 'subtotal' });
    }

    const netProfitLoss = (revenueSection?.amount || 0) - (cogsSection?.amount || 0) + (otherIncomeSection?.amount || 0) - totalExpenses;
    lines.push({
      item: netProfitLoss >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period',
      amount: Math.abs(netProfitLoss),
      type: 'total'
    });

    return lines;
  }, []);

  const normalizeBalanceSheetFromServer = useCallback((response: ApiBalanceSheetResponse | undefined): BalanceSheetData => {
    const assets: BalanceSheetLineItem[] = [];
    const liabilities: BalanceSheetLineItem[] = [];
    const equity: BalanceSheetLineItem[] = [];

    if (!response) {
      return {
        assets, liabilities, equity,
        totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
      };
    }

    const openingEquity = num(response.equityBreakdown?.opening ?? response.openingEquity);
    const periodProfit = num(response.equityBreakdown?.periodProfit ?? response.netProfitLoss);
    const priorRetained = num(response.equityBreakdown?.priorRetained ?? 0);
    const sinceInception = num(response.equityBreakdown?.sinceInception ?? 0);
    const equityAccounts = num(response.equityBreakdown?.equityAccounts ?? response.closingEquity ?? 0);
    const otherEquityMovements = num(response.otherEquityMovements ?? 0);

    const currentAssets = num(response.assets?.current ?? 0);
    const ppe = response.non_current_assets_detail;
    const nonCurrentFromDetail = Array.isArray(ppe?.rows)
      ? ppe!.rows.reduce((sum, r) => sum + num(r.net_book_value), 0)
      : 0;
    const nonCurrentFallback = num(response.assets?.non_current ?? 0);
    const nonCurrentAssets = nonCurrentFromDetail || nonCurrentFallback;

    const currentLiabs = num(response.liabilities?.current ?? 0);
    const nonCurrentLiabs = num(response.liabilities?.non_current ?? 0);

    const displayTotalAssets = currentAssets + nonCurrentAssets;
    const displayTotalLiabs = currentLiabs + nonCurrentLiabs;

    const equityComputed =
      num(response.control?.effective?.equityComputed) ||
      num(response.equityBreakdown?.totalComputed) ||
      (equityAccounts + sinceInception) ||
      (openingEquity + periodProfit + otherEquityMovements);

    const displayLiabPlusEquity = displayTotalLiabs + equityComputed;

    const controlAssetsTotal = num(response.control?.assetsTotal);
    const controlLiabPlusEquityEff = num(response.control?.effective?.liabPlusEquityComputed);
    const controlDiffEff = num(response.control?.effective?.diffComputed);

    const totalAssetsFinal = controlAssetsTotal || displayTotalAssets;
    const totalEquityAndLiabsFinal = controlLiabPlusEquityEff || displayLiabPlusEquity;
    const diffFinal = Number((totalAssetsFinal - totalEquityAndLiabsFinal).toFixed(2));

    // ----- Build asset lines -----
    assets.push({ item: 'Current Assets', amount: 0, isSubheader: true });
    const cad = response.current_assets_detail;
    if (cad && Array.isArray(cad.rows) && cad.rows.length > 0) {
      cad.rows.filter(r => nonZero(r.amount)).forEach(r => {
        assets.push({ item: `  ${r.label}`, amount: r.amount });
      });
    } else {
      if (nonZero(currentAssets)) assets.push({ item: '  Current Assets (total)', amount: currentAssets });
    }
    assets.push({ item: 'Total Current Assets', amount: currentAssets, isTotal: true });

    assets.push({ item: 'Non-current Assets', amount: 0, isSubheader: true });
    if (ppe && Array.isArray(ppe.rows) && ppe.rows.length > 0) {
      assets.push({ item: '  Property, Plant & Equipment (by category)', amount: 0, isSubheader: true });
      ppe.rows
        .filter(r => nonZero(num(r.net_book_value)))
        .forEach(r => {
          const gross = num(r.gross_cost);
          const accum = num(r.accumulated_depreciation);
          const nbv = num(r.net_book_value);
          assets.push({ item: `    ${r.label}`, amount: nbv });
          if (nonZero(gross)) assets.push({ item: `      Gross cost – ${r.label}`, amount: gross, isAdjustment: true });
          if (nonZero(accum)) assets.push({ item: `      Accumulated depreciation – ${r.label}`, amount: -Math.abs(accum), isAdjustment: true });
        });
    } else {
      if (nonZero(nonCurrentAssets)) assets.push({ item: '  Non-current Assets (total)', amount: nonCurrentAssets });
    }
    assets.push({ item: 'Total Non-Current Assets', amount: nonCurrentAssets, isTotal: true });

    assets.push({ item: 'TOTAL ASSETS', amount: displayTotalAssets, isTotal: true, isSubheader: true });

    // ----- Liabilities -----
    liabilities.push({ item: 'Current Liabilities', amount: 0, isSubheader: true });
    if (nonZero(currentLiabs)) liabilities.push({ item: '  Current Liabilities (total)', amount: currentLiabs });
    liabilities.push({ item: 'Total Current Liabilities', amount: currentLiabs, isTotal: true });

    liabilities.push({ item: 'Non-Current Liabilities', amount: 0, isSubheader: true });
    if (nonZero(nonCurrentLiabs)) liabilities.push({ item: '  Non-Current Liabilities (total)', amount: nonCurrentLiabs });
    liabilities.push({ item: 'Total Non-Current Liabilities', amount: nonCurrentLiabs, isTotal: true });

    liabilities.push({ item: 'TOTAL LIABILITIES', amount: displayTotalLiabs, isTotal: true, isSubheader: true });

    // ----- Equity -----
    equity.push({ item: 'Equity', amount: 0, isSubheader: true });
    equity.push({ item: '  Contributed / Opening Equity', amount: openingEquity });
    if (nonZero(priorRetained)) {
      equity.push({ item: '  Retained Earnings (prior periods)', amount: priorRetained });
    }
    equity.push({
      item: periodProfit >= 0 ? '  Net Profit for Period' : '  Net Loss for Period',
      amount: Math.abs(periodProfit)
    });
    if (nonZero(otherEquityMovements)) {
      equity.push({
        item: '  Other Equity Movements (Owner contributions/drawings)',
        amount: otherEquityMovements,
        isAdjustment: true
      });
    }
    equity.push({ item: 'TOTAL EQUITY', amount: equityComputed, isTotal: true, isSubheader: true });

    const liabilitiesWithGrand = [
      ...liabilities,
      { item: 'TOTAL EQUITY AND LIABILITIES', amount: displayLiabPlusEquity, isTotal: true, isSubheader: true }
    ];

    return {
      assets,
      liabilities: liabilitiesWithGrand,
      equity,
      totals: {
        totalAssets: totalAssetsFinal,
        totalLiabilities: displayTotalLiabs,
        totalEquity: equityComputed,
        totalEquityAndLiabilities: totalEquityAndLiabsFinal,
        diff: controlDiffEff || diffFinal,
      }
    };
  }, []);

  // --- Cashflow (memoized) ---
  const normalizeCashflow = useCallback((groupedSections: ApiCashFlowGrouped | undefined) => {
    const sections: { category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[] = [];
    if (!groupedSections || typeof groupedSections !== 'object') return sections;

    const categories = ['operating', 'investing', 'financing'] as const;
    let netChange = 0;

    categories.forEach(cat => {
      const itemsRaw = groupedSections[cat];
      if (Array.isArray(itemsRaw)) {
        const items = itemsRaw
          .map(i => ({ item: i.line, amount: num(i.amount) }))
          .filter(i => nonZero(i.amount));

        const total = items.reduce((sum, item) => sum + item.amount, 0);
        netChange += total;

        if (items.length > 0 || nonZero(total)) {
          sections.push({
            category: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Activities`,
            items,
            total,
            showSubtotal: true
          });
        }
      }
    });

    sections.push({
      category: 'Net Increase / (Decrease) in Cash',
      items: [],
      total: netChange,
      showSubtotal: false
    });

    return sections;
  }, []);

  // ======= GENERAL DATA FETCH =======
  const { isAuthenticated } = useAuth(); // keep after hooks okay
  const fetchAllData = useCallback(async () => {
    if (!token) {
      setAllTransactions([]);
      setAllAccounts([]);
      setAllAssets([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [txRes, accRes, assetRes] = await Promise.all([
        fetch(`${API_BASE_URL}/transactions?fromDate=${fromDate}&toDate=${toDate}`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/accounts`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/assets`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!txRes.ok) throw new Error(`Failed to fetch transactions: ${txRes.statusText}`);
      if (!accRes.ok) throw new Error(`Failed to fetch accounts: ${accRes.statusText}`);
      if (!assetRes.ok) throw new Error(`Failed to fetch assets: ${assetRes.statusText}`);

      setAllTransactions(await txRes.json());
      setAllAccounts(await accRes.json());
      setAllAssets(await assetRes.json());
    } catch (err: any) {
      console.error("Error fetching general financial data:", err);
      setError(`Failed to load data: ${err.message}. Please ensure the backend is running.`);
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAllData();
    } else {
      setAllTransactions([]); setAllAccounts([]); setAllAssets([]);
      setIsLoading(false);
    }
  }, [fetchAllData, isAuthenticated, token]);

  // When preset changes (and not custom), update date range
  useEffect(() => {
    if (preset === 'custom') return;
    const { from, to } = computePresetRange(preset);
    if (from && to) { setFromDate(from); setToDate(to); }
  }, [preset]);

  // ======= AGGREGATE FETCH =======
  const fetchServerStatement = useCallback(
    async (type: ReportId) => {
      if (!token) return;

      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

      const buildUrl = (t: ReportId, start: string, end: string) => {
        switch (t) {
          case 'income-statement':
            return `${API_BASE_URL}/reports/income-statement?start=${start}&end=${end}`;
          case 'balance-sheet':
            return `${API_BASE_URL}/reports/balance-sheet?asOf=${end}&start=${start}&debug=1`;
          case 'trial-balance':
            return `${API_BASE_URL}/reports/trial-balance?start=${start}&end=${end}`;
          case 'cash-flow-statement':
            return `${API_BASE_URL}/reports/cash-flow?start=${start}&end=${end}`;
        }
      };

      const doFetch = async (url: string) => {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${res.status} ${res.statusText}. Details: ${errorText}`);
        }
        return res.json();
      };

      try {
        if (breakdown === 'monthly') return; // aggregate fetch skipped in monthly mode

        // Current period
        const payload = await doFetch(buildUrl(type, fromDate, toDate)!);

        if (type === 'income-statement') {
          const sections = payload?.sections as ApiIncomeStatementSection[] | undefined;
          setIncomeStatementData(buildIncomeStatementLines(sections));
        } else if (type === 'trial-balance') {
          setTrialBalanceData((payload?.items as ApiTrialBalanceItem[]) || []);
        } else if (type === 'balance-sheet') {
          setBalanceSheetData(normalizeBalanceSheetFromServer(payload as ApiBalanceSheetResponse));
        } else if (type === 'cash-flow-statement') {
          setCashflowData(normalizeCashflow(payload?.sections as ApiCashFlowGrouped | undefined));
        }

        // Comparison period (aggregate only)
        const prevRange = previousPeriod(fromDate, toDate, compareMode);
        if (prevRange) {
          const prevPayload = await doFetch(buildUrl(type, prevRange.prevFrom, prevRange.prevTo)!);

          if (type === 'income-statement') {
            const sections = prevPayload?.sections as ApiIncomeStatementSection[] | undefined;
            setIncomeStatementDataPrev(buildIncomeStatementLines(sections));
          } else if (type === 'trial-balance') {
            setTrialBalanceDataPrev((prevPayload?.items as ApiTrialBalanceItem[]) || []);
          } else if (type === 'balance-sheet') {
            setBalanceSheetDataPrev(normalizeBalanceSheetFromServer(prevPayload as ApiBalanceSheetResponse));
          } else if (type === 'cash-flow-statement') {
            setCashflowDataPrev(normalizeCashflow(prevPayload?.sections as ApiCashFlowGrouped | undefined));
          }
        } else {
          setIncomeStatementDataPrev([]);
          setTrialBalanceDataPrev([]);
          setBalanceSheetDataPrev({
            assets: [], liabilities: [], equity: [],
            totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
          });
          setCashflowDataPrev([]);
        }
      } catch (err: any) {
        console.error(`Error fetching ${type}:`, err);
        toast({
          title: `Failed to load ${type.replace(/-/g, ' ')}`,
          description: err.message || 'Please try again.',
          variant: 'destructive',
        });
        if (type === 'income-statement') setIncomeStatementData([]);
        if (type === 'trial-balance') setTrialBalanceData([]);
        if (type === 'balance-sheet') setBalanceSheetData({
          assets: [], liabilities: [], equity: [],
          totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
        });
        if (type === 'cash-flow-statement') setCashflowData([]);
      }
    },
    [fromDate, toDate, token, toast, compareMode, breakdown, buildIncomeStatementLines, normalizeBalanceSheetFromServer, normalizeCashflow]
  );

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (breakdown === 'aggregate') {
      fetchServerStatement(activeTab);
    }
  }, [activeTab, fromDate, toDate, fetchServerStatement, isAuthenticated, token, breakdown]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (breakdown === 'aggregate') {
      (['income-statement', 'trial-balance', 'balance-sheet', 'cash-flow-statement'] as ReportId[])
        .forEach((t) => fetchServerStatement(t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, isAuthenticated, token, compareMode, breakdown]);

  // ======= MONTHLY (PIVOT) =======
  const buildMonthBuckets = useCallback((fromISO: string, toISO: string): MonthBucket[] => {
    const start = new Date(fromISO + 'T00:00:00');
    const end = new Date(toISO + 'T00:00:00');
    const buckets: MonthBucket[] = [];

    if (start > end) return buckets;

    let y = start.getFullYear();
    let m = start.getMonth();
    while (new Date(y, m, 1) <= end) {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      const sISO = iso(first);
      const eISO = iso(last <= end ? last : end);
      buckets.push({
        key: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`,
        start: sISO,
        end: eISO,
        label: first.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
      });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return buckets;
  }, []);

  const fetchMonthlyFor = useCallback(async (type: ReportId, monthsIn: MonthBucket[]) => {
    if (!token) return;
    if (monthsIn.length === 0) return;

    const MAX_MONTHS = 18;
    const buckets = monthsIn.length > MAX_MONTHS ? monthsIn.slice(-MAX_MONTHS) : monthsIn;
    if (monthsIn.length > MAX_MONTHS) {
      toast({ title: 'Showing latest months only', description: `Limited to ${MAX_MONTHS} months for performance.`, variant: 'default' });
    }

    setIsMonthlyLoading(true);
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

    const buildUrl = (t: ReportId, start: string, end: string) => {
      switch (t) {
        case 'income-statement': return `${API_BASE_URL}/reports/income-statement?start=${start}&end=${end}`;
        case 'cash-flow-statement': return `${API_BASE_URL}/reports/cash-flow?start=${start}&end=${end}`;
        case 'trial-balance': return `${API_BASE_URL}/reports/trial-balance?start=${start}&end=${end}`;
        case 'balance-sheet': return `${API_BASE_URL}/reports/balance-sheet?asOf=${end}&start=${start}&debug=1`;
      }
    };

    try {
      if (type === 'income-statement') {
        const results = await Promise.all(buckets.map(async b => {
          const res = await fetch(buildUrl(type, b.start, b.end)!, { headers });
          if (!res.ok) throw new Error('Income (monthly) fetch failed');
          const payload = await res.json();
          return buildIncomeStatementLines(payload?.sections);
        }));
        setIncomeMonthly(results);
      }

      if (type === 'cash-flow-statement') {
        const results = await Promise.all(buckets.map(async b => {
          const res = await fetch(buildUrl(type, b.start, b.end)!, { headers });
          if (!res.ok) throw new Error('Cashflow (monthly) fetch failed');
          const payload = await res.json();
          return normalizeCashflow(payload?.sections as ApiCashFlowGrouped | undefined);
        }));
        setCfMonthly(results);
      }

      if (type === 'trial-balance') {
        const results = await Promise.all(buckets.map(async b => {
          const res = await fetch(buildUrl(type, b.start, b.end)!, { headers });
          if (!res.ok) throw new Error('Trial (monthly) fetch failed');
          const payload = await res.json();
          return (payload?.items as ApiTrialBalanceItem[]) || [];
        }));
        setTrialMonthly(results);
      }

      if (type === 'balance-sheet') {
        const results = await Promise.all(buckets.map(async b => {
          const res = await fetch(buildUrl(type, b.start, b.end)!, { headers });
          if (!res.ok) throw new Error('Balance (monthly) fetch failed');
          const payload = await res.json();
          return normalizeBalanceSheetFromServer(payload as ApiBalanceSheetResponse);
        }));
        setBsMonthly(results);
      }
    } catch (err: any) {
      console.error('Monthly fetch error', err);
      toast({ title: 'Monthly view error', description: err?.message || 'Could not load monthly data.', variant: 'destructive' });
      if (type === 'income-statement') setIncomeMonthly([]);
      if (type === 'trial-balance') setTrialMonthly([]);
      if (type === 'balance-sheet') setBsMonthly([]);
      if (type === 'cash-flow-statement') setCfMonthly([]);
    } finally {
      setIsMonthlyLoading(false);
    }
  }, [normalizeBalanceSheetFromServer, buildIncomeStatementLines, normalizeCashflow, toast, token]);

  // Recompute month buckets + fetch monthly for active tab (guard setMonths to avoid loops)
  useEffect(() => {
    if (breakdown !== 'monthly') return;

    const newBuckets = buildMonthBuckets(fromDate, toDate);

    const same =
      months.length === newBuckets.length &&
      months.every((b, i) =>
        b.key === newBuckets[i].key &&
        b.start === newBuckets[i].start &&
        b.end === newBuckets[i].end
      );

    if (!same) setMonths(newBuckets);

    if (!isAuthenticated || !token) return;
    fetchMonthlyFor(activeTab, newBuckets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown, fromDate, toDate, activeTab, buildMonthBuckets, fetchMonthlyFor, isAuthenticated, token]);

  // Disable compare when switching to monthly (prevents ref churn)
  useEffect(() => {
    if (breakdown === 'monthly' && compareMode !== 'none') {
      setCompareMode('none');
    }
  }, [breakdown, compareMode]);

  // ======= EXPORTS (aggregate only) =======
  const flattenCashflow = (sections: { category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[]): SimpleLine[] => {
    const out: SimpleLine[] = [];
    sections.forEach(sec => {
      out.push({ item: sec.category, isSubheader: true });
      sec.items.forEach(it => out.push({ item: `  ${it.item}`, amount: it.amount }));
      if (sec.showSubtotal) {
        const label = sec.total >= 0 ? `Net cash from ${sec.category}` : `Net cash used in ${sec.category}`;
        out.push({ item: label, amount: sec.total, isTotal: true });
      } else {
        out.push({ item: sec.category, amount: sec.total, isTotal: true });
      }
    });
    return out;
  };

  const trialToNetLines = (items: ApiTrialBalanceItem[]): SimpleLine[] => {
    const out: SimpleLine[] = [];
    items.forEach(i => {
      const dr = num(i.balance_debit);
      const cr = num(i.balance_credit);
      const net = dr - cr; // +ve debit, -ve credit
      if (!isZeroish(net)) {
        out.push({ item: `${i.code} - ${i.name}`, amount: net });
      }
    });
    const totalNet = items.reduce((s, i) => s + (num(i.balance_debit) - num(i.balance_credit)), 0);
    out.push({ item: 'TOTAL (net DR-CR)', amount: totalNet, isTotal: true });
    return out;
  };

  const buildCsvRowsFor = (type: ReportId) => {
    const rows: (string | number | null | undefined)[][] = [];
    const periodStr = `${new Date(fromDate).toLocaleDateString('en-ZA')} to ${new Date(toDate).toLocaleDateString('en-ZA')}`;
    const pushBlank = () => rows.push(['']);

    if (type === 'income-statement') {
      rows.push(['Income Statement']);
      rows.push([`For the period ${periodStr}`]);
      pushBlank();
      rows.push(['Item', 'Amount (R)']);
      const filtered = (incomeStatementData || []).filter(
        l => typeof l.amount !== 'number' || nonZero(Number(l.amount))
      );
      filtered.forEach(l => {
        const isTotalish = l.type === 'total' || l.type === 'subtotal';
        rows.push([l.item, csvAmount(typeof l.amount === 'number' ? l.amount : null, { alwaysShow: isTotalish })]);
      });
      return rows;
    }

    if (type === 'trial-balance') {
      rows.push(['Trial Balance']);
      rows.push([`As of ${new Date(toDate).toLocaleDateString('en-ZA')}`]);
      pushBlank();
      rows.push(['Account', 'Debit (R)', 'Credit (R)']);
      const filtered = (trialBalanceData || []).filter(
        i => nonZero(num(i.balance_debit)) || nonZero(num(i.balance_credit))
      );
      filtered.forEach(i => {
        rows.push([`${i.code} - ${i.name}`, csvAmount(num(i.balance_debit)), csvAmount(num(i.balance_credit))]);
      });
      const totalDebit = (trialBalanceData || []).reduce((s, i) => s + num(i.balance_debit), 0);
      const totalCredit = (trialBalanceData || []).reduce((s, i) => s + num(i.balance_credit), 0);
      rows.push(['TOTALS', csvAmount(totalDebit, { alwaysShow: true }), csvAmount(totalCredit, { alwaysShow: true })]);
      return rows;
    }

    if (type === 'balance-sheet') {
      rows.push(['Balance Sheet']);
      rows.push([`As of ${new Date(toDate).toLocaleDateString('en-ZA')}`]);
      pushBlank();

      rows.push(['ASSETS']);
      rows.push(['Item', 'Amount (R)']);
      (balanceSheetData.assets || [])
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([li.item, li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })]));

      pushBlank();
      rows.push(['EQUITY AND LIABILITIES']);
      rows.push(['Item', 'Amount (R)']);
      [...(balanceSheetData.liabilities || []), ...(balanceSheetData.equity || [])]
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([li.item, li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })]));

      pushBlank();
      rows.push(['TOTAL ASSETS (control)', csvAmount(balanceSheetData.totals.totalAssets, { alwaysShow: true })]);
      rows.push(['TOTAL EQUITY AND LIABILITIES (control)', csvAmount(balanceSheetData.totals.totalEquityAndLiabilities, { alwaysShow: true })]);
      return rows;
    }

    if (type === 'cash-flow-statement') {
      rows.push(['Cash Flow Statement']);
      rows.push([`For the period ${periodStr}`]);
      pushBlank();

      const filteredSections = (cashflowData || []).filter(section => {
        const isNet = section.category === 'Net Increase / (Decrease) in Cash';
        return isNet || section.items.length > 0 || nonZero(section.total);
      });

      filteredSections.forEach(section => {
        rows.push([section.category]);
        if (section.items.length > 0) {
          rows.push(['Item', 'Amount (R)']);
          section.items.forEach(it => rows.push([it.item, csvAmount(it.amount)]));
          rows.push([
            section.total >= 0 ? `Net cash from ${section.category}` : `Net cash used in ${section.category}`,
            csvAmount(section.total, { alwaysShow: true })
          ]);
          pushBlank();
        } else {
          rows.push(['', csvAmount(section.total, { alwaysShow: true })]);
          pushBlank();
        }
      });
      return rows;
    }

    rows.push(['No data available.']);
    return rows;
  };

  const handleDownloadPdf = async () => {
    if (!token) {
      toast({ title: "Authentication Required", description: "Please log in to download financial documents.", variant: "destructive" });
      return;
    }
    if (!selectedDocumentType || !fromDate || !toDate) {
      toast({ title: "Missing Information", description: "Please select a document type and valid dates.", variant: "destructive" });
      return;
    }
    try {
      const qs = new URLSearchParams({
        documentType: selectedDocumentType,
        startDate: fromDate,
        endDate: toDate,
      });
      const resp = await fetch(`${API_BASE_URL}/generate-financial-document?${qs}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Download failed: ${resp.status} ${resp.statusText}. Details: ${text.substring(0, 200)}`);
      }
      const cd = resp.headers.get('Content-Disposition') || '';
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
      const filename = decodeURIComponent(match?.[1] || match?.[2] || `${selectedDocumentType}-${fromDate}-to-${toDate}.pdf`);
      const blob = await resp.blob();
      openBlobInNewTab(blob, filename);
      toast({ title: "Download ready", description: `Your ${selectedDocumentType.replace(/-/g, ' ')} opened in a new tab.` });
    } catch (err: any) {
      console.error("Error downloading PDF:", err);
      toast({ title: "Download Failed", description: err?.message || "There was an error generating the report. Please try again.", variant: "destructive" });
    }
  };

  const handleDownloadCsv = () => {
    if (breakdown === 'monthly') {
      toast({ title: 'Monthly export not implemented', description: 'Switch to Aggregate to export a single-period CSV.', variant: 'default' });
      return;
    }
    const id = selectedDocumentType as ReportId;
    if (!id) {
      toast({ title: "Missing type", description: "Choose a document type first.", variant: "destructive" });
      return;
    }
    const rows = buildCsvRowsFor(id);
    const filename = `${id}_${fromDate}_to_${toDate}.csv`.replace(/-/g, '_');
    saveCsv(filename, rows);
    toast({ title: "CSV ready", description: `Saved ${filename}` });
  };

  const handleDownloadCsvZip = async () => {
    if (breakdown === 'monthly') {
      toast({ title: 'Monthly export not implemented', description: 'Switch to Aggregate to export a ZIP.', variant: 'default' });
      return;
    }
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const ids: ReportId[] = ['income-statement', 'trial-balance', 'balance-sheet', 'cash-flow-statement'];
      ids.forEach((id) => {
        const rows = buildCsvRowsFor(id);
        const csv = rowsToCsvString(rows);
        const fname = `${id}_${fromDate}_to_${toDate}.csv`.replace(/-/g, '_');
        zip.file(fname, csv);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const zipName = `reports_${fromDate}_to_${toDate}.zip`.replace(/-/g, '_');
      saveBlob(blob, zipName);
      toast({ title: "ZIP ready", description: `Saved ${zipName}` });
    } catch (err: any) {
      console.error('ZIP export failed:', err);
      toast({ title: "ZIP export failed", description: err?.message || 'Unexpected error', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading financial data...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Error: {error}
        <Button onClick={fetchAllData} className="ml-4">Retry</Button>
      </div>
    );
  }

  const showCompare = compareMode !== 'none' && breakdown === 'aggregate';

  // ====== UI ======
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto p-4 sm:p-6 lg:p-8"
      >


        <Card className="mb-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-800 dark:text-gray-200">Financial Reports</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              View and generate various financial statements for your business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
              <div className="flex-1 w-full sm:w-auto">
                <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Date
                </label>
                <Input id="fromDate" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPreset('custom'); }} className="w-full" />
              </div>
              <div className="flex-1 w-full sm:w-auto">
                <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To Date
                </label>
                <Input id="toDate" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPreset('custom'); }} className="w-full" />
              </div>

              {/* Period Preset */}
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Period Preset
                </label>
                <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom (use dates)</SelectItem>
                    <SelectItem value="2m">Last 2 months</SelectItem>
                    <SelectItem value="quarter">This quarter</SelectItem>
                    <SelectItem value="half">Last 6 months</SelectItem>
                    <SelectItem value="year">Last 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Breakdown */}
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Breakdown
                </label>
                <Select value={breakdown} onValueChange={(v) => setBreakdown(v as Breakdown)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Aggregate or Monthly" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aggregate">Aggregate</SelectItem>
                    <SelectItem value="monthly">Monthly (pivot)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Compare */}
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Compare
                </label>
                <Select
                  value={compareMode}
                  onValueChange={(v) => setCompareMode(v as CompareMode)}
                  disabled={breakdown === 'monthly'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No comparison" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No comparison</SelectItem>
                    <SelectItem value="prev-period">Previous period</SelectItem>
                    <SelectItem value="prev-year">Same period last year</SelectItem>
                  </SelectContent>
                </Select>
                {breakdown === 'monthly' && (
                  <p className="text-xs text-gray-500 mt-1">Comparison is available in Aggregate view.</p>
                )}
              </div>

              <div className="flex-1 w-full sm:w-auto">
                <label htmlFor="documentType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Document Type
                </label>
                <Select onValueChange={setSelectedDocumentType} value={selectedDocumentType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((report) => (
                      <SelectItem key={report.id} value={report.id}>
                        {report.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 mt-7">
                <Button onClick={handleDownloadPdf} className="w-full sm:w-auto">Download PDF</Button>
                <Button onClick={handleDownloadCsv} variant="secondary" className="w-full sm:w-auto">Download CSV</Button>
                <Button onClick={handleDownloadCsvZip} variant="outline" className="w-full sm:w-auto">Download CSV (ZIP)</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportId)}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            {reportTypes.map((report) => (
              <TabsTrigger key={report.id} value={report.id}>
                {report.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ================== INCOME STATEMENT ================== */}
          <TabsContent value="income-statement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Income Statement</CardTitle>
                <CardDescription>
                  {breakdown === 'aggregate'
                    ? <>For the period {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>
                    : <>Monthly breakdown from {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>}
                </CardDescription>
              </CardHeader>

              <CardContent>
                {breakdown === 'aggregate' && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        {!showCompare && <TableHead className="text-right">Amount (R)</TableHead>}
                        {showCompare && (
                          <>
                            <TableHead className="text-right">Current (R)</TableHead>
                            <TableHead className="text-right">Previous (R)</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead className="text-right">Δ%</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!incomeStatementData || incomeStatementData.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={showCompare ? 5 : 2} className="text-center text-gray-500">
                            No data available for the selected period.
                          </TableCell>
                        </TableRow>
                      ) : !showCompare ? (
                        (incomeStatementData.filter(l => typeof l.amount !== 'number' || nonZero(l.amount))).map((item, idx) => {
                          const isTotalish = item.type === 'total' || item.type === 'subtotal';
                          const isHeaderish = item.type === 'header' || item.type === 'subheader';
                          const isExpenseDetail = item.type === 'detail-expense';
                          return (
                            <TableRow key={idx} className={[
                              isTotalish ? 'font-bold border-t-2 border-b-2' : '',
                              isHeaderish ? 'font-semibold text-gray-800' : '',
                            ].join(' ')}>
                              <TableCell className={isExpenseDetail ? 'pl-8' : ''}>{item.item}</TableCell>
                              <TableCell className="text-right">{typeof item.amount === 'number' ? moneyOrBlank(item.amount) : ''}</TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        (() => {
                          const align = (cur: SimpleLine[], prev: SimpleLine[]) => {
                            const mapPrev = new Map(prev.map(l => [l.item, l]));
                            const keysOrdered: string[] = [];
                            cur.forEach(l => keysOrdered.push(l.item));
                            prev.forEach(l => { if (!mapPrev.has(l.item) && !keysOrdered.includes(l.item)) keysOrdered.push(l.item); });
                            return keysOrdered.map(k => {
                              const c = cur.find(x => x.item === k);
                              const p = prev.find(x => x.item === k);
                              const delta = (toNumOrNull(c?.amount as any) ?? 0) - (toNumOrNull(p?.amount as any) ?? 0);
                              const pct = pctChange(toNumOrNull(c?.amount as any) ?? 0, toNumOrNull(p?.amount as any) ?? 0);
                              return {
                                item: k,
                                type: (c?.type ?? p?.type),
                                isTotal: c?.isTotal || p?.isTotal,
                                isSubheader: c?.isSubheader || p?.isSubheader,
                                isAdjustment: c?.isAdjustment || p?.isAdjustment,
                                cur: toNumOrNull(c?.amount as any),
                                prev: toNumOrNull(p?.amount as any),
                                delta, pct
                              };
                            });
                          };
                          const rows = align(incomeStatementData, incomeStatementDataPrev);
                          return rows.map((r, idx) => (
                            <TableRow key={idx} className={[
                              (r.type === 'total' || r.isTotal) ? 'font-bold border-t-2 border-b-2' : '',
                              (r.type === 'header' || r.isSubheader) ? 'font-semibold text-gray-800' : '',
                            ].join(' ')}>
                              <TableCell className={r.type === 'detail-expense' ? 'pl-8' : ''}>{r.item}</TableCell>
                              <TableCell className="text-right">{r.cur != null ? moneyOrBlank(r.cur) : ''}</TableCell>
                              <TableCell className="text-right">{r.prev != null ? moneyOrBlank(r.prev) : ''}</TableCell>
                              <TableCell className={`text-right ${r.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(r.cur != null || r.prev != null) ? moneyOrBlank(r.delta) : ''}</TableCell>
                              <TableCell className="text-right">{formatPct(r.pct)}</TableCell>
                            </TableRow>
                          ));
                        })()
                      )}
                    </TableBody>
                  </Table>
                )}

                {breakdown === 'monthly' && (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Line</TableHead>
                          {months.map(m => (
                            <TableHead key={m.key} className="text-right">{m.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isMonthlyLoading && (
                          <TableRow>
                            <TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading monthly data…</TableCell>
                          </TableRow>
                        )}
                        {!isMonthlyLoading && incomeMonthly.length > 0 ? (
                          multiAlignByItem(incomeMonthly).map((row, idx) => {
                            const isTotalish = row.type === 'total' || row.isTotal;
                            const isHeaderish = row.type === 'header' || row.isSubheader;
                            const isExpenseDetail = row.type === 'detail-expense';
                            return (
                              <TableRow key={idx} className={[
                                isTotalish ? 'font-bold border-t-2 border-b-2' : '',
                                isHeaderish ? 'font-semibold text-gray-800' : ''
                              ].join(' ')}>
                                <TableCell className={["sticky left-0 z-10 bg-white dark:bg-gray-800", isExpenseDetail ? 'pl-8' : ''].join(' ')}>{row.item}</TableCell>
                                {row.values.map((v, i) => (
                                  <TableCell key={i} className="text-right">{row.isSubheader ? '' : (v != null ? moneyOrBlank(v) : '')}</TableCell>
                                ))}
                              </TableRow>
                            );
                          })
                        ) : (
                          !isMonthlyLoading && (
                            <TableRow>
                              <TableCell colSpan={months.length + 1} className="text-center text-gray-500">No monthly data.</TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================== TRIAL BALANCE ================== */}
          <TabsContent value="trial-balance" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Trial Balance</CardTitle>
                <CardDescription>
                  {breakdown === 'aggregate'
                    ? <>As of {new Date(toDate).toLocaleDateString('en-ZA')}</>
                    : <>Monthly breakdown from {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown === 'aggregate' && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        {!showCompare && (
                          <>
                            <TableHead className="text-right">Debit (R)</TableHead>
                            <TableHead className="text-right">Credit (R)</TableHead>
                          </>
                        )}
                        {showCompare && (
                          <>
                            <TableHead className="text-right">DR (Current)</TableHead>
                            <TableHead className="text-right">CR (Current)</TableHead>
                            <TableHead className="text-right">DR (Previous)</TableHead>
                            <TableHead className="text-right">CR (Previous)</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!trialBalanceData || trialBalanceData.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={showCompare ? 5 : 3} className="text-center text-gray-500">
                            No data available for the selected period.
                          </TableCell>
                        </TableRow>
                      ) : !showCompare ? (
                        <>
                          {trialBalanceData
                            .filter(i => nonZero(num(i.balance_debit)) || nonZero(num(i.balance_credit)))
                            .map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>{item.code} - {item.name}</TableCell>
                                <TableCell className="text-right">{moneyOrBlank(num(item.balance_debit))}</TableCell>
                                <TableCell className="text-right">{moneyOrBlank(num(item.balance_credit))}</TableCell>
                              </TableRow>
                            ))}
                          <TableRow className="font-bold border-t-2">
                            <TableCell>TOTALS</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(trialBalanceData.reduce((sum, item) => sum + num(item.balance_debit), 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(trialBalanceData.reduce((sum, item) => sum + num(item.balance_credit), 0))}
                            </TableCell>
                          </TableRow>
                        </>
                      ) : (
                        (() => {
                          const prevMap = new Map<string, ApiTrialBalanceItem>();
                          (trialBalanceDataPrev || []).forEach(p => prevMap.set(`${p.code}||${p.name}`, p));
                          const allRows = [...trialBalanceData]
                            .filter(i => nonZero(num(i.balance_debit)) || nonZero(num(i.balance_credit)) || prevMap.has(`${i.code}||${i.name}`))
                            .sort((a, b) => a.code.localeCompare(b.code));

                          return (
                            <>
                              {allRows.map((cur, idx) => {
                                const key = `${cur.code}||${cur.name}`;
                                const p = prevMap.get(key);
                                return (
                                  <TableRow key={idx}>
                                    <TableCell>{cur.code} - {cur.name}</TableCell>
                                    <TableCell className="text-right">{moneyOrBlank(num(cur.balance_debit))}</TableCell>
                                    <TableCell className="text-right">{moneyOrBlank(num(cur.balance_credit))}</TableCell>
                                    <TableCell className="text-right">{p ? moneyOrBlank(num(p.balance_debit)) : ''}</TableCell>
                                    <TableCell className="text-right">{p ? moneyOrBlank(num(p.balance_credit)) : ''}</TableCell>
                                  </TableRow>
                                );
                              })}
                              <TableRow className="font-bold border-t-2">
                                <TableCell>TOTALS</TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(trialBalanceData.reduce((s, i) => s + num(i.balance_debit), 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(trialBalanceData.reduce((s, i) => s + num(i.balance_credit), 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency((trialBalanceDataPrev || []).reduce((s, i) => s + num(i.balance_debit), 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency((trialBalanceDataPrev || []).reduce((s, i) => s + num(i.balance_credit), 0))}
                                </TableCell>
                              </TableRow>
                            </>
                          );
                        })()
                      )}
                    </TableBody>
                  </Table>
                )}

                {breakdown === 'monthly' && (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Account (net)</TableHead>
                          {months.map(m => (
                            <TableHead key={m.key} className="text-right">{m.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isMonthlyLoading && (
                          <TableRow>
                            <TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading monthly data…</TableCell>
                          </TableRow>
                        )}
                        {!isMonthlyLoading && trialMonthly.length > 0 ? (
                          multiAlignByItem(trialMonthly.map(trialToNetLines)).map((row, idx) => (
                            <TableRow key={idx} className={row.isTotal ? 'font-bold border-t-2' : ''}>
                              <TableCell className="sticky left-0 z-10 bg-white dark:bg-gray-800">{row.item}</TableCell>
                              {row.values.map((v, i) => (
                                <TableCell key={i} className="text-right">{v != null ? moneyOrBlank(v) : ''}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          !isMonthlyLoading && (
                            <TableRow>
                              <TableCell colSpan={months.length + 1} className="text-center text-gray-500">No monthly data.</TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================== BALANCE SHEET ================== */}
          <TabsContent value="balance-sheet" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Balance Sheet</CardTitle>
                <CardDescription>
                  {breakdown === 'aggregate'
                    ? <>As of {new Date(toDate).toLocaleDateString('en-ZA')}</>
                    : <>Month-end snapshots from {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown === 'aggregate' && (
                  <>
                    {/* ASSETS (aggregate / compare) */}
                    <div className="mb-8">
                      <h3 className="font-semibold text-lg mb-3">ASSETS</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            {!showCompare && <TableHead className="text-right">Amount (R)</TableHead>}
                            {showCompare && (
                              <>
                                <TableHead className="text-right">Current (R)</TableHead>
                                <TableHead className="text-right">Previous (R)</TableHead>
                                <TableHead className="text-right">Δ</TableHead>
                                <TableHead className="text-right">Δ%</TableHead>
                              </>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!showCompare ? (
                            (balanceSheetData.assets || []).filter(li => li.isTotal || li.isSubheader || nonZero(li.amount)).map((li, i) => (
                              <TableRow key={i}>
                                <TableCell className={[
                                  li.isTotal ? 'font-bold' : '',
                                  li.isSubheader ? 'font-semibold !mt-4' : '',
                                  li.isAdjustment ? 'pl-4 text-sm text-gray-600 dark:text-gray-400' : ''
                                ].join(' ')}>
                                  {li.item}
                                </TableCell>
                                <TableCell className="text-right">{li.isSubheader ? '' : moneyOrBlank(li.amount)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            (() => {
                              const rows = multiAlignByItem([balanceSheetData.assets, balanceSheetDataPrev.assets]);
                              return rows.map((r, idx) => {
                                const delta = (r.values[0] ?? 0) - (r.values[1] ?? 0);
                                const pct = pctChange(r.values[0] ?? 0, r.values[1] ?? 0);
                                return (
                                  <TableRow key={idx}>
                                    <TableCell className={[
                                      r.isTotal ? 'font-bold' : '',
                                      r.isSubheader ? 'font-semibold !mt-4' : '',
                                      r.isAdjustment ? 'pl-4 text-sm text-gray-600 dark:text-gray-400' : ''
                                    ].join(' ')}>{r.item}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[0] != null ? moneyOrBlank(r.values[0]!) : '')}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[1] != null ? moneyOrBlank(r.values[1]!) : '')}</TableCell>
                                    <TableCell className={`text-right ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.isSubheader ? '' : moneyOrBlank(delta)}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : formatPct(pct)}</TableCell>
                                  </TableRow>
                                );
                              });
                            })()
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* LIABILITIES */}
                    <div className="mt-6">
                      <h3 className="font-semibold text-lg mb-3">LIABILITIES</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            {!showCompare && <TableHead className="text-right">Amount (R)</TableHead>}
                            {showCompare && (
                              <>
                                <TableHead className="text-right">Current (R)</TableHead>
                                <TableHead className="text-right">Previous (R)</TableHead>
                                <TableHead className="text-right">Δ</TableHead>
                                <TableHead className="text-right">Δ%</TableHead>
                              </>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!showCompare ? (
                            (balanceSheetData.liabilities || []).filter(li => li.isTotal || li.isSubheader || nonZero(li.amount)).map((li, i) => (
                              <TableRow key={i}>
                                <TableCell className={[
                                  li.isTotal ? 'font-bold' : '',
                                  li.isSubheader ? 'font-semibold !mt-4' : ''
                                ].join(' ')}>{li.item}</TableCell>
                                <TableCell className="text-right">{li.isSubheader ? '' : moneyOrBlank(li.amount)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            (() => {
                              const rows = multiAlignByItem([balanceSheetData.liabilities, balanceSheetDataPrev.liabilities]);
                              return rows.map((r, idx) => {
                                const delta = (r.values[0] ?? 0) - (r.values[1] ?? 0);
                                const pct = pctChange(r.values[0] ?? 0, r.values[1] ?? 0);
                                return (
                                  <TableRow key={idx}>
                                    <TableCell className={[r.isTotal ? 'font-bold' : '', r.isSubheader ? 'font-semibold !mt-4' : ''].join(' ')}>{r.item}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[0] != null ? moneyOrBlank(r.values[0]!) : '')}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[1] != null ? moneyOrBlank(r.values[1]!) : '')}</TableCell>
                                    <TableCell className={`text-right ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.isSubheader ? '' : moneyOrBlank(delta)}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : formatPct(pct)}</TableCell>
                                  </TableRow>
                                );
                              });
                            })()
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* EQUITY */}
                    <div className="mt-6">
                      <h3 className="font-semibold text-lg mb-3">EQUITY</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            {!showCompare && <TableHead className="text-right">Amount (R)</TableHead>}
                            {showCompare && (
                              <>
                                <TableHead className="text-right">Current (R)</TableHead>
                                <TableHead className="text-right">Previous (R)</TableHead>
                                <TableHead className="text-right">Δ</TableHead>
                                <TableHead className="text-right">Δ%</TableHead>
                              </>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!showCompare ? (
                            (balanceSheetData.equity || []).filter(li => li.isTotal || li.isSubheader || nonZero(li.amount)).map((li, i) => (
                              <TableRow key={i}>
                                <TableCell className={[
                                  li.isTotal ? 'font-bold' : '',
                                  li.isSubheader ? 'font-semibold !mt-4' : ''
                                ].join(' ')}>{li.item}</TableCell>
                                <TableCell className="text-right">{li.isSubheader ? '' : moneyOrBlank(li.amount)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            (() => {
                              const rows = multiAlignByItem([balanceSheetData.equity, balanceSheetDataPrev.equity]);
                              return rows.map((r, idx) => {
                                const delta = (r.values[0] ?? 0) - (r.values[1] ?? 0);
                                const pct = pctChange(r.values[0] ?? 0, r.values[1] ?? 0);
                                return (
                                  <TableRow key={idx}>
                                    <TableCell className={[r.isTotal ? 'font-bold' : '', r.isSubheader ? 'font-semibold !mt-4' : ''].join(' ')}>{r.item}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[0] != null ? moneyOrBlank(r.values[0]!) : '')}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : (r.values[1] != null ? moneyOrBlank(r.values[1]!) : '')}</TableCell>
                                    <TableCell className={`text-right ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.isSubheader ? '' : moneyOrBlank(delta)}</TableCell>
                                    <TableCell className="text-right">{r.isSubheader ? '' : formatPct(pct)}</TableCell>
                                  </TableRow>
                                );
                              });
                            })()
                          )}
                        </TableBody>
                      </Table>

                      {/* Equality Check */}
                      <div className="mt-6 border-t pt-3 space-y-1">
                        <div className="flex justify-between">
                          <span className="font-semibold">TOTAL ASSETS (control)</span>
                          <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalAssets)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-semibold">TOTAL EQUITY AND LIABILITIES (control)</span>
                          <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalEquityAndLiabilities)}</span>
                        </div>
                        {nonZero(balanceSheetData.totals.diff) && (
                          <div className="mt-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm">
                            Out of balance by {formatCurrency(balanceSheetData.totals.diff)} (per GL control).
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {breakdown === 'monthly' && (
                  <>
                    {/* Assets monthly pivot */}
                    <div className="mb-8">
                      <h3 className="font-semibold text-lg mb-3">ASSETS (Monthly)</h3>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[900px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Item</TableHead>
                              {months.map(m => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {isMonthlyLoading && (
                              <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading…</TableCell></TableRow>
                            )}
                            {!isMonthlyLoading && bsMonthly.length > 0 ? (
                              multiAlignByItem(bsMonthly.map(b => b.assets)).map((row, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className={[
                                    'sticky left-0 z-10 bg-white dark:bg-gray-800',
                                    row.isTotal ? 'font-bold' : '',
                                    row.isSubheader ? 'font-semibold !mt-4' : '',
                                    row.isAdjustment ? 'pl-4 text-sm text-gray-600 dark:text-gray-400' : ''
                                  ].join(' ')}>{row.item}</TableCell>
                                  {row.values.map((v, i) => (
                                    <TableCell key={i} className="text-right">{row.isSubheader ? '' : (v != null ? moneyOrBlank(v) : '')}</TableCell>
                                  ))}
                                </TableRow>
                              ))
                            ) : (
                              !isMonthlyLoading && (
                                <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">No data.</TableCell></TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Liabilities monthly pivot */}
                    <div className="mb-8">
                      <h3 className="font-semibold text-lg mb-3">LIABILITIES (Monthly)</h3>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[900px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Item</TableHead>
                              {months.map(m => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {isMonthlyLoading && (
                              <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading…</TableCell></TableRow>
                            )}
                            {!isMonthlyLoading && bsMonthly.length > 0 ? (
                              multiAlignByItem(bsMonthly.map(b => b.liabilities)).map((row, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className={[
                                    'sticky left-0 z-10 bg-white dark:bg-gray-800',
                                    row.isTotal ? 'font-bold' : '',
                                    row.isSubheader ? 'font-semibold !mt-4' : ''
                                  ].join(' ')}>{row.item}</TableCell>
                                  {row.values.map((v, i) => (
                                    <TableCell key={i} className="text-right">{row.isSubheader ? '' : (v != null ? moneyOrBlank(v) : '')}</TableCell>
                                  ))}
                                </TableRow>
                              ))
                            ) : (
                              !isMonthlyLoading && (
                                <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">No data.</TableCell></TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Equity monthly pivot */}
                    <div>
                      <h3 className="font-semibold text-lg mb-3">EQUITY (Monthly)</h3>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[900px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Item</TableHead>
                              {months.map(m => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {isMonthlyLoading && (
                              <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading…</TableCell></TableRow>
                            )}
                            {!isMonthlyLoading && bsMonthly.length > 0 ? (
                              multiAlignByItem(bsMonthly.map(b => b.equity)).map((row, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className={[
                                    'sticky left-0 z-10 bg-white dark:bg-gray-800',
                                    row.isTotal ? 'font-bold' : '',
                                    row.isSubheader ? 'font-semibold !mt-4' : ''
                                  ].join(' ')}>{row.item}</TableCell>
                                  {row.values.map((v, i) => (
                                    <TableCell key={i} className="text-right">{row.isSubheader ? '' : (v != null ? moneyOrBlank(v) : '')}</TableCell>
                                  ))}
                                </TableRow>
                              ))
                            ) : (
                              !isMonthlyLoading && (
                                <TableRow><TableCell colSpan={months.length + 1} className="text-center text-gray-500">No data.</TableCell></TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================== CASH FLOW ================== */}
          <TabsContent value="cash-flow-statement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Cash Flow Statement</CardTitle>
                <CardDescription>
                  {breakdown === 'aggregate'
                    ? <>For the period {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>
                    : <>Monthly breakdown from {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}</>}
                </CardDescription>
              </CardHeader>

              <CardContent>
                {breakdown === 'aggregate' && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        {!showCompare && <TableHead className="text-right">Amount (R)</TableHead>}
                        {showCompare && (
                          <>
                            <TableHead className="text-right">Current (R)</TableHead>
                            <TableHead className="text-right">Previous (R)</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead className="text-right">Δ%</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!cashflowData || cashflowData.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={showCompare ? 5 : 2} className="text-center text-gray-500">
                            No cash flow data available for the selected period.
                          </TableCell>
                        </TableRow>
                      ) : !showCompare ? (
                        flattenCashflow(cashflowData).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className={[
                              row.isTotal ? 'font-bold' : '',
                              row.isSubheader ? 'font-semibold !mt-4' : '',
                            ].join(' ')}>{row.item}</TableCell>
                            <TableCell className="text-right">{row.isSubheader ? '' : moneyOrBlank(row.amount as number)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        (() => {
                          const rows = multiAlignByItem([flattenCashflow(cashflowData), flattenCashflow(cashflowDataPrev)]);
                          return rows.map((r, idx) => {
                            const delta = (r.values[0] ?? 0) - (r.values[1] ?? 0);
                            const pct = pctChange(r.values[0] ?? 0, r.values[1] ?? 0);
                            return (
                              <TableRow key={idx}>
                                <TableCell className={[
                                  r.isTotal ? 'font-bold' : '',
                                  r.isSubheader ? 'font-semibold !mt-4' : '',
                                ].join(' ')}>{r.item}</TableCell>
                                <TableCell className="text-right">{r.isSubheader ? '' : (r.values[0] != null ? moneyOrBlank(r.values[0]!) : '')}</TableCell>
                                <TableCell className="text-right">{r.isSubheader ? '' : (r.values[1] != null ? moneyOrBlank(r.values[1]!) : '')}</TableCell>
                                <TableCell className={`text-right ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.isSubheader ? '' : moneyOrBlank(delta)}</TableCell>
                                <TableCell className="text-right">{r.isSubheader ? '' : formatPct(pct)}</TableCell>
                              </TableRow>
                            );
                          });
                        })()
                      )}
                    </TableBody>
                  </Table>
                )}

                {breakdown === 'monthly' && (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-10 bg-white dark:bg-gray-800">Line</TableHead>
                          {months.map(m => (
                            <TableHead key={m.key} className="text-right">{m.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isMonthlyLoading && (
                          <TableRow>
                            <TableCell colSpan={months.length + 1} className="text-center text-gray-500">Loading monthly data…</TableCell>
                          </TableRow>
                        )}
                        {!isMonthlyLoading && cfMonthly.length > 0 ? (
                          multiAlignByItem(cfMonthly.map(flattenCashflow)).map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className={[
                                'sticky left-0 z-10 bg-white dark:bg-gray-800',
                                row.isTotal ? 'font-bold' : '',
                                row.isSubheader ? 'font-semibold !mt-4' : '',
                              ].join(' ')}>{row.item}</TableCell>
                              {row.values.map((v, i) => (
                                <TableCell key={i} className="text-right">{row.isSubheader ? '' : (v != null ? moneyOrBlank(v) : '')}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          !isMonthlyLoading && (
                            <TableRow>
                              <TableCell colSpan={months.length + 1} className="text-center text-gray-500">No monthly data.</TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default Financials;
