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
import { useCurrency } from '@/contexts/CurrencyContext';

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
  overdraft?: number;
  current_liabilities_detail?: ApiCurrentLiabilitiesDetail;

  // NEW from backend
  reclassTotal?: number;
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

  checks?: ApiBalanceSheetChecks;
  hints?: string[];

  debug?: {
    accountsBySection?: any[];
    suspects?: ApiDebugSuspect[];
    [key: string]: any;
  };
}
type UnbalancedEntry = {
  id: number;
  entryDate: string;
  reference: string | null;
  description: string | null;
  totalDebit: number;
  totalCredit: number;
  diff: number;
};

type UnbalancedEntryLine = {
  entryId: number;
  lineId: number;
  date: string;
  reference: string | null;
  description: string | null;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
};




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
  // NEW
  hints?: string[];
  suspects?: ApiDebugSuspect[];
    unbalancedEntries: UnbalancedEntry[];
  unbalancedEntryLines: UnbalancedEntryLine[];
}



interface ApiLiabilityDetailRow {
  section: string;
  label: string;
  amount: number;
}
interface ApiCurrentLiabilitiesDetail {
  rows: ApiLiabilityDetailRow[];
}

interface ApiBalanceSheetChecks {
  eps?: number;
  detailVsSections?: {
    currentAssetsDetailTotal?: number;
    presentedCurrentAssets?: number;
    deltaCurrentDetailVsSection?: number;

    nonCurrentAssetsDetailTotal?: number;
    presentedNonCurrentAssets?: number;
    deltaNonCurrentDetailVsSection?: number;

    ok?: boolean;
  };
  presentationVsControl?: {
    presentedAssetsTotal?: number;
    controlAssetsTotal?: number;
    deltaAssets_PresentationVsControl?: number;

    presentedLiabEqTotal?: number;
    controlLiabEq_EquityOnly?: number;
    controlLiabEq_EquityComputed?: number;
    deltaLiabEq_PresentationVsControl_EquityOnly?: number;
    deltaLiabEq_PresentationVsControl_EquityComputed?: number;

    ok?: boolean;
  };
  doubleEntry?: {
    diffComputed?: number;
    ok?: boolean;
  };
}

interface ApiDebugSuspect {
  id: number;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  section: string;
  amount: number;
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

interface ApiVatResponse {
  period: { from: string; to: string };
  accounts: {
    vatPayableId: number | null;
    vatInputId: number | null;
    salesRevenueId: number | null;
  };
  results: {
    output_vat_1A: number;     // Output VAT (Box 1A)
    input_vat_1B: number;      // Input VAT  (Box 1B)
    net_vat_1C: number;        // Net (payable/refund)
    taxable_supplies_excl: number; // For 1A context
    zero_rated_supplies: number;
    exempt_supplies: number;
  };
}

// Use your deployed backend
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

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

type ReportId = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow-statement' | 'vat';

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
  const { symbol, fmt } = useCurrency();
const F = (n: number) => fmt(Number(n || 0));


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
  // near your other useState hooks
  const [vatData, setVatData] = useState<ApiVatResponse | null>(null);


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
  // add near other monthly state
  const [incomeOrderHint, setIncomeOrderHint] = useState<string[]>([]);


  const [activeTab, setActiveTab] = useState<ReportId>('income-statement');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('income-statement');

// reportTypes
const reportTypes = [
  { id: 'trial-balance' as ReportId, label: 'Trial Balance' },
  { id: 'income-statement' as ReportId, label: 'Income Statement' },
  { id: 'balance-sheet' as ReportId, label: 'Balance Sheet' },
  { id: 'cash-flow-statement' as ReportId, label: 'Cashflow Statement' },
  { id: 'vat' as ReportId, label: 'VAT' }, // NEW
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



// single source of truth
const toMoney = (val: number): string => {
  const n = Number(val || 0);
  const abs = Math.abs(n);

  const s = fmt(abs);

  if (n < 0) {

    const stripped = s.replace(new RegExp(`^\\${symbol}\\s*`), ''); // Remove leading symbol and optional space
    return `(${symbol} ${stripped})`;
  } else {
   
    return s;
  }
};

const moneyOrBlank = (amount?: number | null): string => {
  if (amount == null || !isFinite(Number(amount)) || Math.abs(Number(amount)) < 0.005) return '';
  return toMoney(Number(amount));
};

const formatCurrency = (amount?: number | null): string =>
  amount == null ? '' : toMoney(Number(amount));


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

// replaces the existing multiAlignByItem()
function multiAlignByItem(series: SimpleLine[][], orderHint?: string[]) {
  const monthMaps: Map<string, SimpleLine>[] = series.map(lines => {
    const m = new Map<string, SimpleLine>();
    (lines || []).forEach(l => m.set(l.item, l));
    return m;
  });

  // Build the order from hint → first series → any remaining
  const orderedKeys: string[] = orderHint ? [...orderHint] : [];
  if (!orderedKeys.length && series[0]) series[0].forEach(l => orderedKeys.push(l.item));
  for (let i = 0; i < monthMaps.length; i++) {
    monthMaps[i].forEach((_v, k) => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });
  }

  // Always move NET PROFIT/LOSS line to the bottom
  const netIdx = orderedKeys.findIndex(k => /NET (PROFIT|LOSS) for the period/i.test(k));
  if (netIdx >= 0) {
    const [netKey] = orderedKeys.splice(netIdx, 1);
    orderedKeys.push(netKey);
  }

  return orderedKeys.map(k => {
    const metaFrom = (monthMaps.find(m => m.has(k))?.get(k));
    const values = monthMaps.map(m => (typeof m.get(k)?.amount === 'number' ? (m.get(k)!.amount as number) : null));
    return {
      item: k,
      type: metaFrom?.type,
      isTotal: metaFrom?.isTotal,
      isSubheader: metaFrom?.isSubheader,
      isAdjustment: metaFrom?.isAdjustment,
      values
    };
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

const netProfitLoss =
  (revenueSection?.amount || 0)
  - (cogsSection?.amount || 0)
  + (otherIncomeSection?.amount || 0)
  - totalExpenses;

lines.push({
  item: netProfitLoss >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period',
  amount: netProfitLoss,     // <-- keep SIGNED (no Math.abs)
  type: 'total',
  isTotal: true              // <-- mark clearly as a total
});

    return lines;
  }, []);

  const normalizeBalanceSheetFromServer = useCallback((response: ApiBalanceSheetResponse | undefined): BalanceSheetData => {
    const assets: BalanceSheetLineItem[] = [];
    const liabilities: BalanceSheetLineItem[] = [];
    const equity: BalanceSheetLineItem[] = [];
    const overdraft = num((response as any)?.overdraft ?? 0);
    const cliabDetail = response.current_liabilities_detail?.rows ?? [];
    const hints = Array.isArray(response.hints) ? response.hints : [];

    const unbalancedEntries = Array.isArray(response.debug?.unbalancedEntries)
  ? response.debug!.unbalancedEntries.map((e: any) => ({
      ...e,
      totalDebit: num(e.totalDebit),
      totalCredit: num(e.totalCredit),
      diff: num(e.diff),
    }))
  : [];

const unbalancedEntryLines = Array.isArray(response.debug?.unbalancedEntryLines)
  ? response.debug!.unbalancedEntryLines.map((l: any) => ({
      ...l,
      debit: num(l.debit),
      credit: num(l.credit),
    }))
  : [];

const suspects = Array.isArray(response.debug?.suspects)
  ? response.debug!.suspects.map(s => ({
      ...s,
      amount: num(s.amount)
    }))
  : [];





    if (!response) {
      return {
        assets, liabilities, equity,
        totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
      };
    }

const openingEquity = num(response.equityBreakdown?.opening ?? response.openingEquity);
const periodProfit  = num(response.equityBreakdown?.periodProfit ?? response.netProfitLoss);
const priorRetained = num(response.equityBreakdown?.priorRetained ?? 0);
const sinceInception = num(response.equityBreakdown?.sinceInception ?? 0);
const equityAccounts = num(response.equityBreakdown?.equityAccounts ?? response.closingEquity ?? 0);
const otherEquityMovements = num(response.otherEquityMovements ?? 0);

// ✅ Prefer detail totals for CURRENT ASSETS
const cad = response.current_assets_detail;
const currentFromDetail = num(cad?.total ?? 0);
const currentFromSections = num(response.assets?.current ?? 0);
const currentAssets = (currentFromDetail || currentFromSections);

// ✅ Prefer PPE detail for NON-CURRENT ASSETS (fallback to section)
const ppe = response.non_current_assets_detail;
const nonCurrentFromDetail = Array.isArray(ppe?.rows)
  ? ppe!.rows.reduce((sum, r) => sum + num(r.net_book_value), 0)
  : 0;
const nonCurrentFallback = num(response.assets?.non_current ?? 0);
const nonCurrentAssets = (nonCurrentFromDetail || nonCurrentFallback);

// Liabilities
const currentLiabs    = num(response.liabilities?.current ?? 0);
const nonCurrentLiabs = num(response.liabilities?.non_current ?? 0);

// Totals for display
const displayTotalAssets = currentAssets + nonCurrentAssets;
const displayTotalLiabs  = currentLiabs + nonCurrentLiabs;

// Equity (effective)
const equityComputed =
  num(response.control?.effective?.equityComputed) ||
  num(response.equityBreakdown?.totalComputed) ||
  (equityAccounts + sinceInception) ||
  (openingEquity + periodProfit + otherEquityMovements);

const displayLiabPlusEquity = displayTotalLiabs + equityComputed;

// GL control (if present, use for the equality check box)
const controlAssetsTotal         = num(response.control?.assetsTotal);
const controlLiabPlusEquityEff   = num(response.control?.effective?.liabPlusEquityComputed);
const controlDiffEff             = num(response.control?.effective?.diffComputed);

// ✅ What the user should see on the face of the report
const totalAssetsFinal         = displayTotalAssets;
const totalEquityAndLiabsFinal = displayLiabPlusEquity;

// ✅ Keep using GL control diff for the warning, fall back to presentation diff if missing
const presentationDiff = Number((displayTotalAssets - displayLiabPlusEquity).toFixed(2));
const diffFinal = controlDiffEff || presentationDiff;



    // ----- Build asset lines -----
    assets.push({ item: 'Current Assets', amount: 0, isSubheader: true });
    //const cad = response.current_assets_detail;
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
// ----- Liabilities -----
// ----- Liabilities (show detail if provided, incl. overdraft) -----
liabilities.push({ item: 'Current Liabilities', amount: 0, isSubheader: true });

if (Array.isArray(cliabDetail) && cliabDetail.length > 0) {
  cliabDetail
    .filter(r => nonZero(num(r.amount)))
    .forEach(r => liabilities.push({ item: `  ${r.label}`, amount: num(r.amount) }));
} else if (nonZero(currentLiabs)) {
  // fallback
  liabilities.push({ item: '  Current Liabilities (total)', amount: currentLiabs });
}

liabilities.push({ item: 'Total Current Liabilities', amount: currentLiabs, isTotal: true });

liabilities.push({ item: 'Non-Current Liabilities', amount: 0, isSubheader: true });
if (nonZero(nonCurrentLiabs)) {
  liabilities.push({ item: '  Non-Current Liabilities (total)', amount: nonCurrentLiabs });
}
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
      },
      hints,
      suspects,
      unbalancedEntries,
      unbalancedEntryLines,
    };


  }, []);

  // --- Cashflow (memoized) ---
// --- Cashflow (memoized) ---
const normalizeCashflow = useCallback((groupedSections: ApiCashFlowGrouped | undefined) => {
  const sections: {
    category: string;
    items: { item: string; amount: number }[];
    total: number;
    showSubtotal: boolean;
  }[] = [];
  if (!groupedSections || typeof groupedSections !== 'object') return sections;

  const isServerTotal = (label: string) =>
    /^net\s+cash\s+(from|used in)\s+.*activities$/i.test(label.trim());

  const categories = ['operating', 'investing', 'financing'] as const;
  let netChange = 0;

  categories.forEach(cat => {
    const itemsRaw = groupedSections[cat];
    if (!Array.isArray(itemsRaw)) return;

    // 1) Separate server subtotal (if any)
    const serverTotalRow = itemsRaw.find(r => isServerTotal(r.line));
    const serverTotal = serverTotalRow ? num(serverTotalRow.amount) : null;

    // 2) Keep only detail rows (strip the server subtotal so we don't render it again)
    const items = itemsRaw
      .filter(r => !isServerTotal(r.line))
      .map(r => ({ item: r.line, amount: num(r.amount) }))
      .filter(r => nonZero(r.amount));

    // 3) Decide which total to use: server's if present, otherwise sum of details
    const total = serverTotal != null ? serverTotal : items.reduce((s, it) => s + it.amount, 0);
    netChange += total;

    if (items.length > 0 || nonZero(total)) {
      sections.push({
        category: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Activities`,
        items,
        total,
        showSubtotal: true
      });
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

  useEffect(() => {
  if (selectedDocumentType === 'vat') {
    if (breakdown !== 'aggregate') setBreakdown('aggregate');
    if (compareMode !== 'none') setCompareMode('none');
  }
}, [selectedDocumentType, breakdown, compareMode]);

  // ======= AGGREGATE FETCH =======
  const fetchServerStatement = useCallback(
    async (type: ReportId) => {
      if (!token) return;

      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

const buildUrl = (t: ReportId, start: string, end: string) => {
  switch (t) {
    case 'income-statement': return `${API_BASE_URL}/reports/income-statement?start=${start}&end=${end}`;
    case 'balance-sheet':    return `${API_BASE_URL}/reports/balance-sheet?asOf=${end}&start=${start}&debug=1`;
    case 'trial-balance':    return `${API_BASE_URL}/reports/trial-balance?start=${start}&end=${end}`;
    case 'cash-flow-statement': return `${API_BASE_URL}/reports/cash-flow?start=${start}&end=${end}`;
    case 'vat':              return `${API_BASE_URL}/reports/vat?from=${start}&to=${end}`; // NEW
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
        } // ✅ NEW: Handle VAT report
else if (type === 'vat') {
  setVatData(payload as ApiVatResponse);
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
        if (type === 'vat') setVatData(null);

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

  // NEW: fetch aggregate once to get canonical row order
  try {
    const aggRes = await fetch(buildUrl(type, fromDate, toDate)!, { headers });
    if (aggRes.ok) {
      const aggPayload = await aggRes.json();
      const aggLines = buildIncomeStatementLines(aggPayload?.sections);
      setIncomeOrderHint(aggLines.map(l => l.item));
    } else {
      setIncomeOrderHint([]);
    }
  } catch {
    setIncomeOrderHint([]);
  }
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
      rows.push(['Item', 'Amount ']);
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
      rows.push(['Item', 'Amount ']);
      (balanceSheetData.assets || [])
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([li.item, li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })]));

      pushBlank();
      rows.push(['EQUITY AND LIABILITIES']);
      rows.push(['Item', 'Amount ']);
      [...(balanceSheetData.liabilities || []), ...(balanceSheetData.equity || [])]
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([li.item, li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })]));

      pushBlank();
      rows.push(['TOTAL ASSETS ', csvAmount(balanceSheetData.totals.totalAssets, { alwaysShow: true })]);
      rows.push(['TOTAL EQUITY AND LIABILITIES ', csvAmount(balanceSheetData.totals.totalEquityAndLiabilities, { alwaysShow: true })]);
      return rows;
    }
    if (type === 'vat') {
  const rows: (string | number | null | undefined)[][] = [];
  rows.push(['VAT Report (SARS summary)']);
  rows.push([`For the period ${new Date(fromDate).toLocaleDateString('en-ZA')} to ${new Date(toDate).toLocaleDateString('en-ZA')}`]);
  rows.push(['']);

  if (!vatData) {
    rows.push(['No VAT data for this period.']);
    return rows;
  }

  rows.push(['Line', 'Amount ']);
  rows.push(['Output VAT (Box 1A)', csvAmount(vatData.results.output_vat_1A, { alwaysShow: true })]);
  rows.push(['Input VAT (Box 1B)',  csvAmount(vatData.results.input_vat_1B,  { alwaysShow: true })]);
  rows.push(['Net VAT – Payable(+) / Refund(-) (Box 1C)', csvAmount(vatData.results.net_vat_1C, { alwaysShow: true })]);

  rows.push(['']);
  rows.push(['Supporting Figures']);
  rows.push(['Taxable supplies (excl.)', csvAmount(vatData.results.taxable_supplies_excl, { alwaysShow: true })]);
  rows.push(['Zero-rated supplies',       csvAmount(vatData.results.zero_rated_supplies,   { alwaysShow: true })]);
  rows.push(['Exempt supplies',           csvAmount(vatData.results.exempt_supplies,       { alwaysShow: true })]);

  rows.push(['']);
  rows.push(['Accounts used']);
  rows.push(['VAT Payable ID', vatData.accounts.vatPayableId ?? 'n/a']);
  rows.push(['VAT Input ID',   vatData.accounts.vatInputId   ?? 'n/a']);
  rows.push(['Sales Revenue ID', vatData.accounts.salesRevenueId ?? 'n/a']);

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
          rows.push(['Item', 'Amount ']);
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
    toast({
      title: "Authentication Required",
      description: "Please log in to download financial documents.",
      variant: "destructive",
    });
    return;
  }
  if (!selectedDocumentType || !fromDate || !toDate) {
    toast({
      title: "Missing Information",
      description: "Please select a document type and valid dates.",
      variant: "destructive",
    });
    return;
  }
  try {
    const qs = new URLSearchParams({
      documentType: selectedDocumentType,
      startDate: fromDate,
      endDate: toDate,
      breakdown,            // "aggregate" | "monthly"
      compare: compareMode, // "none" | "prev-period" | "prev-year"
    });
    const resp = await fetch(`${API_BASE_URL}/generate-financial-document?${qs}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    // === NEW: plan limit handling with Upgrade button (matches Transactions.tsx style) ===
    if (resp.status === 402) {
      const data = await resp.json().catch(() => null);
      if (data?.code === 'plan_limit_reached') {
        const used  = Number(data.used ?? 0);
        const limit = Number(data.limit ?? 0);
        toast({
          variant: 'destructive',
          title: 'Monthly limit reached',
          description: `You've used ${used}/${limit} financial document downloads this month.`,
          action: (
            <Button size="sm" onClick={() => window.open('/pricing','_blank')}>
              Upgrade
            </Button>
          ),
        });
        return;
      }
      const text = await resp.text().catch(() => '');
      throw new Error(`402 Payment Required. Details: ${text.substring(0,200)}`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Download failed: ${resp.status} ${resp.statusText}. Details: ${text.substring(0, 200)}`);
    }

    // success flow unchanged
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
    const suffix =
      breakdown === 'monthly' ? '_pivot' :
      (compareMode !== 'none' ? '_comparative' : '');
    const fallback = `${selectedDocumentType}-${fromDate}-to-${toDate}${suffix}.pdf`;

    const filename = decodeURIComponent(match?.[1] || match?.[2] || fallback);
    const blob = await resp.blob();
    openBlobInNewTab(blob, filename);
    toast({
      title: "Download ready",
      description: `Your ${selectedDocumentType.replace(/-/g, ' ')} opened in a new tab.`,
    });
  } catch (err: any) {
    console.error("Error downloading PDF:", err);
    toast({
      title: "Download Failed",
      description: err?.message || "There was an error generating the report. Please try again.",
      variant: "destructive",
    });
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


<Card className="mb-6 bg-white dark:bg-gray-950/60 shadow-sm border">
  {/* Top bar: title on left, actions on right */}
  <CardHeader className="pb-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Financial Reports
        </CardTitle>
        <CardDescription className="mt-1">
          View and export your statutory statements.
        </CardDescription>
      </div>

      {/* Actions on the right */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleDownloadPdf}>Download PDF</Button>
        <Button size="sm" variant="secondary" onClick={handleDownloadCsv}>CSV</Button>
        <Button size="sm" variant="outline" onClick={handleDownloadCsvZip}>CSV (ZIP)</Button>
      </div>
    </div>
  </CardHeader>

  <CardContent className="pt-0">
    {/* Quick period chips */}
    <div className="flex flex-wrap gap-2 py-3">
      {[
        {k:'custom', t:'Custom'},
        {k:'2m', t:'Last 2 mo'},
        {k:'quarter', t:'This quarter'},
        {k:'half', t:'Last 6 mo'},
        {k:'year', t:'Last 12 mo'},
      ].map(p => (
        <button
          key={p.k}
          onClick={() => setPreset(p.k as any)}
          className={[
            "px-3 py-1 rounded-full border text-xs",
            preset === p.k
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-accent"
          ].join(" ")}
        >
          {p.t}
        </button>
      ))}
    </div>

    {/* Dense controls grid */}
    <div className="grid gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 items-end">
      {/* From / To */}
      <div className="lg:col-span-2">
        <label htmlFor="fromDate" className="block text-[11px] font-medium text-muted-foreground mb-1">From</label>
        <Input id="fromDate" type="date"
          value={fromDate}
          onChange={(e)=>{ setFromDate(e.target.value); setPreset('custom'); }}
          className="h-9" />
      </div>
      <div className="lg:col-span-2">
        <label htmlFor="toDate" className="block text-[11px] font-medium text-muted-foreground mb-1">To</label>
        <Input id="toDate" type="date"
          value={toDate}
          onChange={(e)=>{ setToDate(e.target.value); setPreset('custom'); }}
          className="h-9" />
      </div>

      {/* Preset (select) */}
      <div className="lg:col-span-2">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Period Preset</label>
        <Select value={preset} onValueChange={(v)=>setPreset(v as any)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Preset" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom</SelectItem>
            <SelectItem value="2m">Last 2 months</SelectItem>
            <SelectItem value="quarter">This quarter</SelectItem>
            <SelectItem value="half">Last 6 months</SelectItem>
            <SelectItem value="year">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Breakdown */}
      <div className="lg:col-span-2">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Breakdown</label>
        <Select value={breakdown} onValueChange={(v)=>setBreakdown(v as any)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Breakdown" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aggregate">Aggregate</SelectItem>
            <SelectItem value="monthly">Monthly (pivot)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Compare */}
      <div className="lg:col-span-2">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Compare</label>
        <Select value={compareMode} onValueChange={(v)=>setCompareMode(v as any)} disabled={breakdown==='monthly'}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Compare" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No comparison</SelectItem>
            <SelectItem value="prev-period">Previous period</SelectItem>
            <SelectItem value="prev-year">Same period last year</SelectItem>
          </SelectContent>
        </Select>
        {breakdown==='monthly' && (
          <div className="text-[11px] text-muted-foreground mt-1">Comparison only in Aggregate view.</div>
        )}
      </div>

      {/* Document type */}
      <div className="lg:col-span-2">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Document Type</label>
        <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            {reportTypes.map(r => (
              <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Period summary chip */}
      <div className="lg:col-span-12">
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-background">
          <span className="opacity-70">Period:</span>
          <span className="font-medium">
            {new Date(fromDate).toLocaleDateString('en-ZA')} — {new Date(toDate).toLocaleDateString('en-ZA')}
          </span>
          {compareMode!=='none' && breakdown==='aggregate' && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-[2px] text-primary">Comparison on</span>
          )}
        </div>
      </div>
    </div>
  </CardContent>
</Card>


        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportId)}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
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
                        {!showCompare && <TableHead className="text-right">{`Amount (${symbol})`}</TableHead>}
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
                          multiAlignByItem(incomeMonthly, incomeOrderHint).map((row, idx) => {

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
<TableHead className="text-right">{`Debit (${symbol})`}</TableHead>
<TableHead className="text-right">{`Credit (${symbol})`}</TableHead>

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
                            {!showCompare && <TableHead className="text-right">{`Amount (${symbol})`}</TableHead>}
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
                            {!showCompare && <TableHead className="text-right">{`Amount (${symbol})`}</TableHead>}
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
                            {!showCompare && <TableHead className="text-right">{`Amount (${symbol})`}</TableHead>}
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
{/* Equality Check + Diagnostics */}
<div className="mt-6 border-t pt-3 space-y-3">
  <div className="flex justify-between">
    <span className="font-semibold">TOTAL ASSETS</span>
    <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalAssets)}</span>
  </div>
  <div className="flex justify-between">
    <span className="font-semibold">TOTAL EQUITY AND LIABILITIES</span>
    <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalEquityAndLiabilities)}</span>
  </div>

  {nonZero(balanceSheetData.totals.diff) && (
    <div className="mt-2 space-y-3">
      <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm">
        <div className="font-semibold">
          Out of balance by {formatCurrency(balanceSheetData.totals.diff)} (per GL control).
        </div>
        <div className="text-xs mt-1">
          Your debits and credits don’t fully agree for this date; see possible causes below.
        </div>
      </div>

      {/* High-level hints from backend */}
      {balanceSheetData.hints && balanceSheetData.hints.length > 0 && (
        <div className="rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-900/20 text-sky-900 dark:text-sky-100 px-3 py-2 text-xs">
          <div className="font-semibold mb-1">System diagnostics</div>
          <ul className="list-disc pl-4 space-y-1">
            {balanceSheetData.hints.map((h, idx) => (
              <li key={idx}>{h}</li>
            ))}
          </ul>
        </div>
      )}


            {/* Unbalanced journal entries (DR != CR) */}
      {balanceSheetData.unbalancedEntries && balanceSheetData.unbalancedEntries.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 px-3 py-2 text-xs mt-3">
          <div className="font-semibold mb-2">
            Problem entries (debits ≠ credits)
          </div>
          <div className="overflow-x-auto -mx-1 mb-2">
            <Table className="min-w-[600px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Total DR ({symbol})</TableHead>
                  <TableHead className="text-right">Total CR ({symbol})</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  {/* Optional: actions column */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {balanceSheetData.unbalancedEntries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {e.entryDate ? new Date(e.entryDate).toLocaleDateString('en-ZA') : ''}
                    </TableCell>
                    <TableCell>{e.reference || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{e.description || '-'}</TableCell>
                    <TableCell className="text-right">{moneyOrBlank(e.totalDebit)}</TableCell>
                    <TableCell className="text-right">{moneyOrBlank(e.totalCredit)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {moneyOrBlank(e.diff)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Optional: show first few lines for context */}
          {balanceSheetData.unbalancedEntryLines &&
            balanceSheetData.unbalancedEntryLines.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold mb-1">Sample entry lines</div>
                <div className="overflow-x-auto -mx-1">
                  <Table className="min-w-[650px] text-[11px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entry #</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceSheetData.unbalancedEntryLines.slice(0, 20).map(l => (
                        <TableRow key={l.lineId}>
                          <TableCell>{l.entryId}</TableCell>
                          <TableCell>{l.code} – {l.name}</TableCell>
                          <TableCell>{l.type}</TableCell>
                          <TableCell className="text-right">{moneyOrBlank(l.debit)}</TableCell>
                          <TableCell className="text-right">{moneyOrBlank(l.credit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {balanceSheetData.unbalancedEntryLines.length > 20 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Showing first 20 lines; fix these entries in your journal screen.
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      )}

 


      {/* Suspect accounts table */}
      {balanceSheetData.suspects && balanceSheetData.suspects.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 px-3 py-2 text-xs">
          <div className="font-semibold mb-2">
            Accounts to review (mapping / section issues)
          </div>
          <div className="overflow-x-auto -mx-1">
            <Table className="min-w-[500px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Balance ({symbol})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balanceSheetData.suspects.slice(0, 10).map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.section || '<none>'}
                    </TableCell>
                    <TableCell className="text-right">
                      {moneyOrBlank(s.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {balanceSheetData.suspects.length > 10 && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Showing first 10 suspect accounts; refine mappings in your chart of accounts for more detail.
              </div>
            )}
          </div>
        </div>
      )}
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
      {/* ================== VAT report ================== */}

          <TabsContent value="vat" className="mt-4">
  <Card>
    <CardHeader>
      <CardTitle className="text-xl">VAT Report (SARS summary)</CardTitle>
      <CardDescription>
        For the period {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}
      </CardDescription>
    </CardHeader>
    <CardContent>
      {!vatData ? (
        <div className="text-sm text-gray-500">No VAT data for this period.</div>
      ) : (
        <>
          <div className="mb-4 text-sm">
            <div className="flex justify-between"><span>Output VAT (Box 1A)</span><span className="font-mono">{formatCurrency(vatData.results.output_vat_1A)}</span></div>
            <div className="flex justify-between"><span>Input VAT (Box 1B)</span><span className="font-mono">{formatCurrency(vatData.results.input_vat_1B)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="font-semibold">Net VAT – Payable(+) / Refund(-) (Box 1C)</span>
              <span className="font-mono font-semibold">{formatCurrency(vatData.results.net_vat_1C)}</span>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="font-semibold mb-2">Support</h4>
            <div className="flex justify-between"><span>Taxable supplies (excl)</span><span className="font-mono">{formatCurrency(vatData.results.taxable_supplies_excl)}</span></div>
            <div className="flex justify-between"><span>Zero-rated supplies</span><span className="font-mono">{formatCurrency(vatData.results.zero_rated_supplies)}</span></div>
            <div className="flex justify-between"><span>Exempt supplies</span><span className="font-mono">{formatCurrency(vatData.results.exempt_supplies)}</span></div>
          </div>

          <div className="mt-6 text-xs text-muted-foreground">
            Accounts used: VAT Payable #{vatData.accounts.vatPayableId ?? 'n/a'}, VAT Input #{vatData.accounts.vatInputId ?? 'n/a'}, Sales Revenue #{vatData.accounts.salesRevenueId ?? 'n/a'}.
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
                        {!showCompare && <TableHead className="text-right">{`Amount (${symbol})`}</TableHead>}
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
