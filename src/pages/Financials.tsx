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

// --- Types you already had ---
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

// New interfaces for the fetched balance sheet data
interface BalanceSheetLineItem {
  item: string;
  amount: number;
  isTotal?: boolean;
  isSubheader?: boolean;
  isAdjustment?: boolean;
}

// --- UPDATED: Enhanced balance sheet response (matches what your API returns) ---
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
// --- END UPDATED ---

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

// Interfaces for the data returned by the specific API endpoints
interface ApiIncomeStatementSection {
  section: string;
  amount: number;
  accounts: {
    name: string;
    amount: number;
  }[];
}

interface ApiBalanceSheetSection {
  section: string;
  value: string; // API returns string numbers
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
  amount: string; // API returns string numbers
}

interface ApiCashFlowGrouped {
  operating?: ApiCashFlowSectionItem[];
  investing?: ApiCashFlowSectionItem[];
  financing?: ApiCashFlowSectionItem[];
}

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

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

const Financials = () => {
  const navigate = useNavigate();
  const { latestProcessedTransactions } = useFinancials();
  const { toast } = useToast();

  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const oneYearAgo = new Date(today.setFullYear(today.getFullYear() - 1));
    return oneYearAgo.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trialBalanceData, setTrialBalanceData] = useState<ApiTrialBalanceItem[]>([]);
  const [incomeStatementData, setIncomeStatementData] = useState<{ item: string; amount: number | ''; type?: string }[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData>({
    assets: [], liabilities: [], equity: [],
    totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
  });
  const [cashflowData, setCashflowData] = useState<{ category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[]>([]);

  const [activeTab, setActiveTab] = useState<'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow-statement'>('income-statement');

  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('income-statement');

  const reportTypes = [
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'income-statement', label: 'Income Statement' },
    { id: 'balance-sheet', label: 'Balance Sheet' },
    { id: 'cash-flow-statement', label: 'Cashflow Statement' },
  ] as const;
  type ReportId = typeof reportTypes[number]['id'];

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  // ---------- Helpers (updated to blank zero values) ----------
  const ZEPS = 0.005; // ~half-cent; treat tiny values as zero

  const num = (n: any) => {
    const parsed = parseFloat(String(n));
    return isNaN(parsed) ? 0 : parsed;
  };

  const isZeroish = (n: any) => Math.abs(Number(n) || 0) < ZEPS;
  const nonZero = (n: number) => !isZeroish(n);

  const toMoney = (val: number): string =>
    `R ${Math.abs(Number(val)).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Use this in cells: blank if zero/empty, otherwise formatted
  const moneyOrBlank = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '';
    const v = Number(amount);
    if (!isFinite(v) || isZeroish(v)) return '';
    return toMoney(v);
  };

  // For totals / equality lines (always show)
  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '';
    return toMoney(Number(amount));
  };
  // ---------- End helpers ----------

  // ---------- CSV helpers (front-end only) ----------
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

  // blank zero-ish values; otherwise 2dp number (no currency symbol in CSV)
  const csvAmount = (val: number | string | null | undefined, { alwaysShow = false } = {}) => {
    if (val === null || val === undefined) return '';
    const n = Number(val);
    if (!isFinite(n)) return '';
    if (!alwaysShow && isZeroish(n)) return '';
    return Math.abs(n).toFixed(2);
  };
  // ---------- end CSV helpers ----------

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
      setAllTransactions([]);
      setAllAccounts([]);
      setAllAssets([]);
      setIsLoading(false);
    }
  }, [fetchAllData, isAuthenticated, token]);

  // --- Income Statement ---
  const buildIncomeStatementLines = (sections: ApiIncomeStatementSection[] | undefined) => {
    const lines: { item: string; amount: number | ''; type?: string }[] = [];
    if (!sections || !Array.isArray(sections)) {
      console.warn("Invalid income statement data received:", sections);
      return lines;
    }

    const sectionMap: Record<string, ApiIncomeStatementSection> = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    // Revenue
    const revenueSection = sectionMap['revenue'];
    if (revenueSection && revenueSection.accounts?.length > 0) {
      lines.push({ item: 'Revenue', amount: '', type: 'header' });
      revenueSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail' });
      });
      if (nonZero(revenueSection.amount)) lines.push({ item: 'Total Revenue', amount: revenueSection.amount, type: 'subtotal' });
    }

    // COGS
    const cogsSection = sectionMap['cogs'];
    if (cogsSection && cogsSection.accounts.some(a => nonZero(a.amount))) {
      lines.push({ item: 'Less: Cost of Goods Sold', amount: '', type: 'header' });
      cogsSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail-expense' });
      });
      if (nonZero(cogsSection.amount)) lines.push({ item: 'Total Cost of Goods Sold', amount: cogsSection.amount, type: 'subtotal' });
    }

    // Gross Profit
    const totalRevenue = revenueSection?.amount || 0;
    const totalCogs = cogsSection?.amount || 0;
    const grossProfit = totalRevenue - totalCogs;
    if (nonZero(grossProfit)) lines.push({ item: 'Gross Profit', amount: grossProfit, type: 'subtotal' });

    // Other Income
    const otherIncomeSection = sectionMap['other_income'];
    if (otherIncomeSection && otherIncomeSection.accounts.some(a => nonZero(a.amount))) {
      lines.push({ item: 'Other Income', amount: '', type: 'header' });
      otherIncomeSection.accounts.forEach(acc => {
        if (nonZero(acc.amount)) lines.push({ item: `  ${acc.name}`, amount: acc.amount, type: 'detail' });
      });
      if (nonZero(otherIncomeSection.amount)) lines.push({ item: 'Total Other Income', amount: otherIncomeSection.amount, type: 'subtotal' });
    }

    // Expenses
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

    // Net Profit/Loss
    const netProfitLoss = (revenueSection?.amount || 0) - (cogsSection?.amount || 0) + (otherIncomeSection?.amount || 0) - totalExpenses;
    lines.push({
      item: netProfitLoss >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period',
      amount: Math.abs(netProfitLoss),
      type: 'total'
    });

    return lines;
  };

  // --- Balance Sheet (derive everything needed on client) ---
  const normalizeBalanceSheetFromServer = (response: ApiBalanceSheetResponse | undefined): BalanceSheetData => {
    const assets: BalanceSheetLineItem[] = [];
    const liabilities: BalanceSheetLineItem[] = [];
    const equity: BalanceSheetLineItem[] = [];

    if (!response) {
      console.warn("No balance sheet payload");
      return {
        assets, liabilities, equity,
        totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
      };
    }

    // Safely coerce numbers
    const openingEquity = num(response.equityBreakdown?.opening ?? response.openingEquity);
    const periodProfit = num(response.equityBreakdown?.periodProfit ?? response.netProfitLoss);
    const priorRetained = num(response.equityBreakdown?.priorRetained ?? 0);
    const sinceInception = num(response.equityBreakdown?.sinceInception ?? 0);
    const equityAccounts = num(response.equityBreakdown?.equityAccounts ?? response.closingEquity ?? 0);
    const otherEquityMovements = num(response.otherEquityMovements ?? 0);

    const currentAssets = num(response.assets?.current ?? 0);
    const nonCurrentAssets = num(response.assets?.non_current ?? 0);
    const currentLiabs = num(response.liabilities?.current ?? 0);
    const nonCurrentLiabs = num(response.liabilities?.non_current ?? 0);

    const totalAssets = currentAssets + nonCurrentAssets;
    const totalLiabilities = currentLiabs + nonCurrentLiabs;

    const totalEquityPreferred =
      num(response.control?.effective?.equityComputed) ||
      num(response.equityBreakdown?.totalComputed) ||
      (equityAccounts + sinceInception) ||
      (openingEquity + periodProfit + otherEquityMovements);

    const totalEquityAndLiabilities = totalLiabilities + totalEquityPreferred;
    const diff = Number((totalAssets - totalEquityAndLiabilities).toFixed(2));

    // Assets section
    assets.push({ item: 'Current Assets', amount: 0, isSubheader: true });
    if (nonZero(currentAssets)) assets.push({ item: '  Current Assets', amount: currentAssets });
    assets.push({ item: 'Total Current Assets', amount: currentAssets, isTotal: true });

    assets.push({ item: 'Non-current Assets', amount: 0, isSubheader: true });
    if (nonZero(nonCurrentAssets)) assets.push({ item: '  Non-current Assets', amount: nonCurrentAssets });
    assets.push({ item: 'Total Non-Current Assets', amount: nonCurrentAssets, isTotal: true });

    assets.push({ item: 'TOTAL ASSETS', amount: totalAssets, isTotal: true, isSubheader: true });

    // Liabilities section
    liabilities.push({ item: 'Current Liabilities', amount: 0, isSubheader: true });
    if (nonZero(currentLiabs)) liabilities.push({ item: '  Current Liabilities', amount: currentLiabs });
    liabilities.push({ item: 'Total Current Liabilities', amount: currentLiabs, isTotal: true });

    liabilities.push({ item: 'Non-Current Liabilities', amount: 0, isSubheader: true });
    if (nonZero(nonCurrentLiabs)) liabilities.push({ item: '  Non-Current Liabilities', amount: nonCurrentLiabs });
    liabilities.push({ item: 'Total Non-Current Liabilities', amount: nonCurrentLiabs, isTotal: true });

    liabilities.push({ item: 'TOTAL LIABILITIES', amount: totalLiabilities, isTotal: true, isSubheader: true });

    // Equity section
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
    equity.push({ item: 'TOTAL EQUITY', amount: totalEquityPreferred, isTotal: true, isSubheader: true });

    // Append combined total under liabilities block
    const liabilitiesWithGrand = [...liabilities, {
      item: 'TOTAL EQUITY AND LIABILITIES',
      amount: totalEquityAndLiabilities,
      isTotal: true,
      isSubheader: true
    }];

    return {
      assets,
      liabilities: liabilitiesWithGrand,
      equity,
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity: totalEquityPreferred,
        totalEquityAndLiabilities,
        diff
      }
    };
  };

  // --- Cashflow ---
  const normalizeCashflow = (groupedSections: ApiCashFlowGrouped | undefined) => {
    const sections: { category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[] = [];
    if (!groupedSections || typeof groupedSections !== 'object') {
      console.warn("Invalid cash flow data received:", groupedSections);
      return sections;
    }

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
  };

  const fetchServerStatement = useCallback(
    async (type: ReportId) => {
      if (!token) return;

      try {
        let url = '';
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

        switch (type) {
          case 'income-statement':
            url = `${API_BASE_URL}/reports/income-statement?start=${fromDate}&end=${toDate}`;
            break;
          case 'balance-sheet':
            url = `${API_BASE_URL}/reports/balance-sheet?asOf=${toDate}&start=${fromDate}&debug=1`;
            break;
          case 'trial-balance':
            url = `${API_BASE_URL}/reports/trial-balance?start=${fromDate}&end=${toDate}`;
            break;
          case 'cash-flow-statement':
            url = `${API_BASE_URL}/reports/cash-flow?start=${fromDate}&end=${toDate}`;
            break;
          default:
            throw new Error(`Unsupported report type: ${type}`);
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to fetch ${type}: ${res.status} ${res.statusText}. Details: ${errorText}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Expected JSON for ${type} but got ${contentType}. First bytes: ${text.slice(0, 100)}...`);
        }

        const payload = await res.json();

        if (type === 'income-statement') {
          const sections = payload?.sections as ApiIncomeStatementSection[] | undefined;
          const lines = buildIncomeStatementLines(sections);
          setIncomeStatementData(lines);
        }

        if (type === 'trial-balance') {
          const items = payload?.items as ApiTrialBalanceItem[] | undefined;
          setTrialBalanceData(items || []);
        }

        if (type === 'balance-sheet') {
          const response = payload as ApiBalanceSheetResponse | undefined;
          const normalized = normalizeBalanceSheetFromServer(response);
          setBalanceSheetData(normalized);
        }

        if (type === 'cash-flow-statement') {
          const groupedSections = payload?.sections as ApiCashFlowGrouped | undefined;
          const normalizedSections = normalizeCashflow(groupedSections);
          setCashflowData(normalizedSections);
        }
      } catch (err: any) {
        console.error(`Error fetching ${type}:`, err);
        toast({
          title: `Failed to load ${type.replace(/-/g, ' ')}`,
          description: err.message || 'Please try again.',
          variant: 'destructive',
        });
        switch (type) {
          case 'income-statement': setIncomeStatementData([]); break;
          case 'trial-balance': setTrialBalanceData([]); break;
          case 'balance-sheet':
            setBalanceSheetData({
              assets: [], liabilities: [], equity: [],
              totals: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalEquityAndLiabilities: 0, diff: 0 }
            });
            break;
          case 'cash-flow-statement': setCashflowData([]); break;
        }
      }
    },
    [fromDate, toDate, token, toast]
  );

  // Keep old behavior (load when tab changes)
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchServerStatement(activeTab);
  }, [activeTab, fromDate, toDate, fetchServerStatement, isAuthenticated, token]);

  // NEW: prefetch all four so CSV/ZIP always has data without swapping tabs
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    (['income-statement','trial-balance','balance-sheet','cash-flow-statement'] as ReportId[])
      .forEach((t) => fetchServerStatement(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, isAuthenticated, token]);

  // ------- PDF (existing) -------
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

  // ------- CSV builders (front-end only) -------
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
        rows.push([
          l.item,
          csvAmount(typeof l.amount === 'number' ? l.amount : null, { alwaysShow: isTotalish })
        ]);
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
        rows.push([
          `${i.code} - ${i.name}`,
          csvAmount(num(i.balance_debit)),
          csvAmount(num(i.balance_credit)),
        ]);
      });

      // Totals
      const totalDebit = (trialBalanceData || []).reduce((s, i) => s + num(i.balance_debit), 0);
      const totalCredit = (trialBalanceData || []).reduce((s, i) => s + num(i.balance_credit), 0);
      rows.push(['TOTALS', csvAmount(totalDebit, { alwaysShow: true }), csvAmount(totalCredit, { alwaysShow: true })]);

      return rows;
    }

    if (type === 'balance-sheet') {
      rows.push(['Balance Sheet']);
      rows.push([`As of ${new Date(toDate).toLocaleDateString('en-ZA')}`]);
      pushBlank();

      // Assets
      rows.push(['ASSETS']);
      rows.push(['Item', 'Amount (R)']);
      (balanceSheetData.assets || [])
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([
          li.item,
          li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })
        ]));

      pushBlank();

      // Equity & Liabilities
      rows.push(['EQUITY AND LIABILITIES']);
      rows.push(['Item', 'Amount (R)']);
      (balanceSheetData.liabilities || [])
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([
          li.item,
          li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })
        ]));

      (balanceSheetData.equity || [])
        .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
        .forEach(li => rows.push([
          li.item,
          li.isSubheader ? '' : csvAmount(li.amount, { alwaysShow: li.isTotal })
        ]));

      pushBlank();
      rows.push(['TOTAL ASSETS', csvAmount(balanceSheetData.totals.totalAssets, { alwaysShow: true })]);
      rows.push(['TOTAL EQUITY AND LIABILITIES', csvAmount(balanceSheetData.totals.totalEquityAndLiabilities, { alwaysShow: true })]);

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
          // Net line only
          rows.push(['', csvAmount(section.total, { alwaysShow: true })]);
          pushBlank();
        }
      });

      return rows;
    }

    rows.push(['No data available.']);
    return rows;
  };

  const handleDownloadCsv = () => {
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
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const ids: ReportId[] = ['income-statement','trial-balance','balance-sheet','cash-flow-statement'];
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto p-4 sm:p-6 lg:p-8"
      >
        <Button
          onClick={() => navigate('/dashboard')}
          className="mb-6 flex items-center"
          variant="outline"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>

        <Card className="mb-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-800 dark:text-gray-200">Financial Reports</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              View and generate various financial statements for your business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
              <div className="flex-1 w-full sm:w-auto">
                <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Date
                </label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1 w-full sm:w-auto">
                <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To Date
                </label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full"
                />
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

              {/* PDF / CSV / ZIP buttons */}
              <div className="flex gap-2 mt-7">
                <Button onClick={handleDownloadPdf} className="w-full sm:w-auto">
                  Download PDF
                </Button>
                <Button onClick={handleDownloadCsv} variant="secondary" className="w-full sm:w-auto">
                  Download CSV
                </Button>
                <Button onClick={handleDownloadCsvZip} variant="outline" className="w-full sm:w-auto">
                  Download CSV (ZIP)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs
          defaultValue="income-statement"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            {reportTypes.map((report) => (
              <TabsTrigger key={report.id} value={report.id}>
                {report.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Income Statement */}
          <TabsContent value="income-statement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Income Statement</CardTitle>
                <CardDescription>
                  For the period {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Amount (R)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeStatementData && incomeStatementData.length > 0 ? (
                      (incomeStatementData
                        .filter(l => typeof l.amount !== 'number' || nonZero(l.amount))
                      ).map((item, index) => {
                        const isTotalish = item.type === 'total' || item.type === 'subtotal';
                        const isHeaderish = item.type === 'header' || item.type === 'subheader';
                        const isExpenseDetail = item.type === 'detail-expense';

                        return (
                          <TableRow
                            key={index}
                            className={[
                              isTotalish ? 'font-bold border-t-2 border-b-2' : '',
                              isHeaderish ? 'font-semibold text-gray-800' : '',
                            ].join(' ')}
                          >
                            <TableCell className={isExpenseDetail ? 'pl-8' : ''}>
                              {item.item}
                            </TableCell>
                            <TableCell className="text-right">
                              {typeof item.amount === 'number' ? moneyOrBlank(item.amount) : ''}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-gray-500">
                          No data available for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trial Balance */}
          <TabsContent value="trial-balance" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Trial Balance</CardTitle>
                <CardDescription>
                  As of {new Date(toDate).toLocaleDateString('en-ZA')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit (R)</TableHead>
                      <TableHead className="text-right">Credit (R)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalanceData && trialBalanceData.length > 0 ? (
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
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-gray-500">
                          No data available for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Balance Sheet */}
          <TabsContent value="balance-sheet" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Balance Sheet</CardTitle>
                <CardDescription>
                  As of {new Date(toDate).toLocaleDateString('en-ZA')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Assets */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3">ASSETS</h3>
                    <div className="space-y-2 ml-4">
                      {balanceSheetData.assets && balanceSheetData.assets.length > 0 ? (
                        balanceSheetData.assets
                          .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
                          .map((item, index) => (
                            <div
                              key={`asset-${index}`}
                              className={`flex justify-between py-1
                                ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                                ${item.isSubheader ? 'font-semibold text-md !mt-4' : ''}
                                ${item.isAdjustment ? 'pl-4' : ''}`}
                            >
                              <span>{item.item}</span>
                              <span className="font-mono">
                                {item.isSubheader ? '' : moneyOrBlank(item.amount)}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="text-gray-500">No asset data available.</p>
                      )}
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3 mt-6">EQUITY AND LIABILITIES</h3>
                    <div className="space-y-2 ml-4">
                      {/* Liabilities */}
                      {balanceSheetData.liabilities && balanceSheetData.liabilities.length > 0 ? (
                        balanceSheetData.liabilities
                          .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
                          .map((item, index) => (
                            <div
                              key={`liab-${index}`}
                              className={`flex justify-between py-1
                                ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                                ${item.isSubheader ? 'font-semibold text-md !mt-4' : ''}
                                ${item.isAdjustment ? 'pl-4' : ''}`}
                            >
                              <span>{item.item}</span>
                              <span className="font-mono">
                                {item.isSubheader ? '' : moneyOrBlank(item.amount)}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="text-gray-500">No liability data available.</p>
                      )}

                      {/* Equity */}
                      {balanceSheetData.equity && balanceSheetData.equity.length > 0 ? (
                        balanceSheetData.equity
                          .filter(li => li.isTotal || li.isSubheader || nonZero(li.amount))
                          .map((item, index) => (
                            <div
                              key={`equity-${index}`}
                              className={`flex justify-between py-1
                                ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                                ${item.isSubheader ? 'font-semibold text-md !mt-4' : ''}
                                ${item.isAdjustment ? 'pl-4' : ''}`}
                            >
                              <span>{item.item}</span>
                              <span className="font-mono">
                                {item.isSubheader ? '' : moneyOrBlank(item.amount)}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="text-gray-500">No equity data available.</p>
                      )}
                    </div>
                  </div>

                  {/* Equality Check */}
                  <div className="mt-6 border-t pt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">TOTAL ASSETS</span>
                      <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalAssets)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">TOTAL EQUITY AND LIABILITIES</span>
                      <span className="font-mono">{formatCurrency(balanceSheetData.totals.totalEquityAndLiabilities)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cashflow */}
          <TabsContent value="cash-flow-statement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Cash Flow Statement</CardTitle>
                <CardDescription>
                  For the period {new Date(fromDate).toLocaleDateString('en-ZA')} to {new Date(toDate).toLocaleDateString('en-ZA')}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-6">
                  {cashflowData && cashflowData.length > 0 ? (
                    cashflowData
                      .filter(section => {
                        const isNetLine = section.category === 'Net Increase / (Decrease) in Cash';
                        return isNetLine || section.items.length > 0 || nonZero(section.total);
                      })
                      .map((section, sectionIndex) => {
                        const isNetLine = section.category === 'Net Increase / (Decrease) in Cash';
                        const subtotalLabel =
                          section.total >= 0
                            ? `Net cash from ${section.category}`
                            : `Net cash used in ${section.category}`;

                        return (
                          <div key={sectionIndex}>
                            <h3 className={`font-semibold text-lg mb-3 ${isNetLine ? 'mt-6' : ''}`}>
                              {section.category}
                            </h3>

                            {section.items.length > 0 ? (
                              <div className="space-y-2 ml-4">
                                {section.items.map((item, itemIndex) => (
                                  <div key={itemIndex} className="flex justify-between py-1">
                                    <span>{item.item}</span>
                                    <span className="font-mono">{formatCurrency(item.amount)}</span>
                                  </div>
                                ))}

                                {section.showSubtotal && (
                                  <div className="flex justify-between py-1 font-bold border-t pt-2">
                                    <span>{subtotalLabel}</span>
                                    <span className="font-mono">{formatCurrency(section.total)}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              isNetLine && (
                                <div className="flex justify-between py-2 font-bold border-t-2 text-lg">
                                  <span>{section.category}</span>
                                  <span className="font-mono">{formatCurrency(section.total)}</span>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-center text-gray-500 py-4">
                      No cash flow data available for the selected period.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default Financials;
