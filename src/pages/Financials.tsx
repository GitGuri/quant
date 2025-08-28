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

interface BalanceSheetData {
  assets: BalanceSheetLineItem[];
  liabilities: BalanceSheetLineItem[];
  equity: BalanceSheetLineItem[];
}

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

const openBlobInNewTab = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const Financials = () => {
  const navigate = useNavigate();
  const { latestProcessedTransactions } = useFinancials();
  const { toast } = useToast();

  const [fromDate, setFromDate] = useState('2025-01-01');
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trialBalanceData, setTrialBalanceData] = useState<any[]>([]);
  const [incomeStatementData, setIncomeStatementData] = useState<any[]>([]);
  // Update state to use the new interface
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData>({ assets: [], liabilities: [], equity: [] });
  const [cashflowData, setCashflowData] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow-statement'>('income-statement');

  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('income-statement');

  const reportTypes = [
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'income-statement', label: 'Income Statement' },
    { id: 'balance-sheet', label: 'Balance Sheet' },
    { id: 'cash-flow-statement', label: 'Cashflow Statement' },
  ] as const;

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return 'R 0.00';
  
  // Remove negative sign by taking absolute value
  const absoluteAmount = Math.abs(Number(amount));
  
  return `R ${parseFloat(absoluteAmount.toFixed(2)).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
};

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
      console.error("Error fetching financial data:", err);
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

  const toArray = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
    return [];
  };

  const num = (n: any) => Number(n ?? 0);

  const buildIncomeStatementLines = (data: any) => {
    const lines: { item: string; amount: number; type?: string }[] = [];
    const t = data?.totals || {};
    const otherInc = data?.breakdown?.otherIncome || {};
    const expenses = Array.isArray(data?.breakdown?.expenses) ? data.breakdown.expenses : [];

    lines.push({ item: 'Sales', amount: Number(t.totalSales || 0), type: 'detail' });
    lines.push({ item: 'Less: Cost of Sales', amount: Number(t.cogs || 0), type: 'detail' });
    lines.push({ item: 'Gross Profit / (Loss)', amount: Number(t.grossProfit || 0), type: 'subtotal' });

    const otherKeys = Object.keys(otherInc);
    if ((Number(t.interestIncome || 0) > 0) || otherKeys.length) {
      lines.push({ item: 'Add: Other Income', amount: 0, type: 'header' });
      if (Number(t.interestIncome || 0) > 0) {
        lines.push({ item: '  Interest Income', amount: Number(t.interestIncome), type: 'detail' });
      }
      for (const k of otherKeys) {
        lines.push({ item: `  ${k}`, amount: Number(otherInc[k] || 0), type: 'detail' });
      }
    }

    const grossIncome = Number(t.grossProfit || 0) + Number(t.interestIncome || 0) + Number(t.otherIncome || 0);
    lines.push({ item: 'Gross Income', amount: grossIncome, type: 'subtotal' });

    lines.push({ item: 'Less: Expenses', amount: 0, type: 'header' });
    for (const e of expenses) {
      lines.push({ item: `  ${e.category}`, amount: Number(e.amount || 0), type: 'detail-expense' });
    }
    lines.push({ item: 'Total Expenses', amount: Number(t.totalExpenses || 0), type: 'subtotal' });

    const npl = Number(t.netProfitLoss || 0);
    lines.push({
      item: npl >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period',
      amount: Math.abs(npl),
      type: 'total'
    });

    return lines;
  };

  // ✅ UPDATED: The normalize function now includes the "Presentation Adjustments" section
// === Balance Sheet normalizer: mirror PDF layout ===
const normalizeBalanceSheetFromServer = (raw: any): BalanceSheetData => {
  const root = raw?.data ?? raw;

  // Prefer explicit sections if provided, otherwise use the existing structure
  const S = root.sections ?? {};
  const A = S.assets ?? root.assets ?? {};
  const EL = S.equityAndLiabilities ?? root.equityAndLiabilities ?? {};
  const E = S.equity ?? EL.equity ?? {};
  const L = S.liabilities ?? EL.liabilities ?? {};

  // ---- helpers
  const toLines = (arrLike: any) =>
    (Array.isArray(arrLike) ? arrLike : []).map((it: any) => ({
      item: String(it.item ?? it.name ?? it.label ?? ''),
      amount: num(it.amount ?? it.value ?? 0),
    }));

  const pushIfNumber = (arr: BalanceSheetLineItem[], label: string, n: any) => {
    if (typeof n === 'number' && !Number.isNaN(n)) {
      arr.push({ item: label, amount: num(n) });
    }
  };

  // ===== ASSETS =====
  const assets: BalanceSheetLineItem[] = [];

  // Current Assets
  const CA = A.current ?? {};
  assets.push({ item: 'Current Assets', amount: 0, isSubheader: true });
  toLines(CA.lines).forEach(l => assets.push(l));
  if (typeof CA.totalCurrentAssets === 'number') {
    assets.push({ item: 'Total Current Assets', amount: num(CA.totalCurrentAssets), isTotal: true });
  }

  // Non-current / Fixed Assets
  const NCA = A.nonCurrent ?? {};
  const FA = NCA.fixedAssets ?? {}; // if server breaks out further
  const FAT = (NCA.totals ?? FA.totals) ?? NCA?.totals ?? {};
  assets.push({ item: 'Non-current Assets', amount: 0, isSubheader: true });
  pushIfNumber(assets, 'Fixed Assets at Cost', FAT.totalFixedAssetsAtCost);
  pushIfNumber(assets, 'Less: Accumulated Depreciation', FAT.totalAccumulatedDepreciation);
  pushIfNumber(assets, 'Net Book Value of Fixed Assets', FAT.netBookValue);
  if (typeof FAT.netBookValue === 'number') {
    assets.push({ item: 'Total Non-Current Assets', amount: num(FAT.netBookValue), isTotal: true });
  }

  const A_TOTALS = A.totals ?? {};
  assets.push({
    item: 'TOTAL ASSETS',
    amount: num(A_TOTALS.totalAssets ?? (num(CA.totalCurrentAssets) + num(FAT.netBookValue))),
    isTotal: true,
    isSubheader: true,
  });

  // ===== LIABILITIES =====
  const liabilities: BalanceSheetLineItem[] = [];
  const L_C = L.current ?? {};
  const L_NC = L.nonCurrent ?? {};

  liabilities.push({ item: 'Current Liabilities', amount: 0, isSubheader: true });
  toLines(L_C.lines).forEach(l => liabilities.push(l));
  pushIfNumber(liabilities, 'Total Current Liabilities', L_C.totalCurrentLiabilities);
  liabilities.push({ item: 'Non-Current Liabilities', amount: 0, isSubheader: true });
  toLines(L_NC.lines).forEach(l => liabilities.push(l));
  pushIfNumber(liabilities, 'Total Non-Current Liabilities', L_NC.totalNonCurrentLiabilities);

  const totalLiabs = num(L_C.totalCurrentLiabilities) + num(L_NC.totalNonCurrentLiabilities);
  liabilities.push({ item: 'TOTAL LIABILITIES', amount: totalLiabs, isTotal: true, isSubheader: true });

  // ===== EQUITY =====
  const equity: BalanceSheetLineItem[] = [];
  equity.push({ item: 'Equity', amount: 0, isSubheader: true });

  toLines(E.lines).forEach(l => equity.push(l));
  pushIfNumber(equity, 'Opening Retained Earnings', E.openingRetained);

  // Period P/L (from BS payload or incomeStatementData)
  const periodPL =
    (root.incomeStatementData?.totals?.netProfitLoss) ??
    (typeof E.periodPL === 'number' ? E.periodPL : undefined);
  if (typeof periodPL === 'number') {
    equity.push({
      item: periodPL >= 0 ? 'Add: Net Profit for the period' : 'Less: Net Loss for the period',
      amount: Math.abs(periodPL),
    });
  }

  pushIfNumber(equity, 'Retained Earnings (to date)', E.retainedToDate);

  // Optional presentation adjustments
  const adjustments = (EL?.totals?.adjustments ?? E?.adjustments);
  if (Array.isArray(adjustments) && adjustments.length) {
    equity.push({ item: 'Presentation Adjustments', amount: 0, isSubheader: true });
    for (const adj of adjustments) {
      // support both "label: R 1,234" and { item, amount }
      if (typeof adj === 'string') {
        const [lbl, amtRaw] = adj.split(': ');
        const amt = parseFloat(String(amtRaw ?? '').replace(/[R,\s]/g, '')) || 0;
        equity.push({ item: `  ${lbl}`, amount: amt, isAdjustment: true });
      } else if (adj && typeof adj === 'object') {
        equity.push({
          item: `  ${String(adj.item ?? adj.label ?? '')}`,
          amount: num(adj.amount ?? adj.value),
          isAdjustment: true
        });
      }
    }
  }

  const EQ_TOTAL = num(E.totalEquity ??
    (equity.reduce((s, it) => s + (it.isSubheader ? 0 : num(it.amount)), 0)));

  equity.push({ item: 'TOTAL EQUITY', amount: EQ_TOTAL, isTotal: true, isSubheader: true });

  return { assets, liabilities, equity };
};

// --- Cash Flow normalizer: keep sections + add subtotals ---
// === Cash Flow normalizer: match server JSON (data.sections.*) ===
const normalizeCashflow = (raw: any) => {
  if (!raw) return [];

  // Server returns { data: { sections: { operating|investing|financing }, totals: { netChange } } }
  const root = raw.data ?? raw;
  const sectionsSrc = root.sections ?? root;

  const mapItems = (sec: any) =>
    (Array.isArray(sec?.items) ? sec.items : [])
      .map((it: any) => ({
        item: it.item ?? it.name ?? it.label ?? it.description ?? '',
        amount: num(it.amount ?? it.value),
      }))
      .filter((r: any) => r.item || r.amount);

  const op = sectionsSrc.operating ?? {};
  const inv = sectionsSrc.investing ?? {};
  const fin = sectionsSrc.financing ?? {};

  const operating = {
    category: op.label ?? 'Operating Activities',
    items: mapItems(op),
    total: typeof op.total === 'number' ? op.total : 0,
    showSubtotal: true,
  };
  const investing = {
    category: inv.label ?? 'Investing Activities',
    items: mapItems(inv),
    total: typeof inv.total === 'number' ? inv.total : 0,
    showSubtotal: true,
  };
  const financing = {
    category: fin.label ?? 'Financing Activities',
    items: mapItems(fin),
    total: typeof fin.total === 'number' ? fin.total : 0,
    showSubtotal: true,
  };

  const net = typeof root.totals?.netChange === 'number'
    ? root.totals.netChange
    : (operating.total + investing.total + financing.total);

  return [
    operating,
    investing,
    financing,
    { category: 'Net Increase / (Decrease) in Cash', items: [], total: net, showSubtotal: false }
  ];
};



  const fetchServerStatement = useCallback(
    async (type: typeof reportTypes[number]['id']) => {
      if (!token) return;

      try {
        const qs = new URLSearchParams({
          documentType: type,
          startDate: fromDate,
          endDate: toDate,
          format: 'json',
        });
        const url = `${API_BASE_URL}/generate-financial-document?${qs.toString()}`;

        const res = await fetch(url, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch ${type} JSON: ${res.status} ${res.statusText}`);
        }

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Expected JSON but got ${ct}. First bytes: ${text.slice(0, 40)}...`);
        }

        const payload = await res.json();
        const data = payload?.data ?? payload;

        if (type === 'income-statement') {
          const lines = buildIncomeStatementLines(data);
          setIncomeStatementData(lines);
        }

        if (type === 'trial-balance') {
          const rowsRaw = data?.rows ?? data?.data?.rows ?? [];
          const rows = toArray(rowsRaw).map((r: any) => ({
            account: r.account ?? r.name ?? r.label ?? '',
            debit: num(r.debit),
            credit: num(r.credit),
          }));
          setTrialBalanceData(rows);
        }

        if (type === 'balance-sheet') {
          const normalized = normalizeBalanceSheetFromServer(data);
          setBalanceSheetData(normalized);
        }

        if (type === 'cash-flow-statement') {
          const normalizedSections = normalizeCashflow(data);
          setCashflowData(normalizedSections);
        }
      } catch (err: any) {
        console.error(err);
        toast({
          title: 'Failed to load statement',
          description: err.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [fromDate, toDate, token, toast]
  );

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchServerStatement(activeTab);
  }, [activeTab, fromDate, toDate, fetchServerStatement, isAuthenticated, token]);

  const handleDownload = async () => {
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
        throw new Error(text || `HTTP ${resp.status}`);
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
        description: err?.message || "There was an error. Please try again.",
        variant: "destructive",
      });
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
                <Select onValueChange={setSelectedDocumentType} defaultValue={selectedDocumentType}>
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
              <Button onClick={handleDownload} className="w-full sm:w-auto mt-7">
                Download Report
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          defaultValue="income-statement"
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as typeof activeTab)
          }
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
                    {incomeStatementData.map((item: any, index: number) => (
                      <TableRow key={index} className={item.type === 'total' || item.type === 'subtotal' ? 'font-bold border-t-2 border-b-2' : ''}>
                        <TableCell className={item.type === 'detail-expense' ? 'pl-8' : ''}>{item.item}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
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
                    {trialBalanceData.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{item.account}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.debit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.credit)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>TOTALS</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trialBalanceData.reduce((sum, item) => sum + Number(item.debit || 0), 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trialBalanceData.reduce((sum, item) => sum + Number(item.credit || 0), 0))}
                      </TableCell>
                    </TableRow>
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
                      {balanceSheetData.assets.map((item: any, index: number) => (
                        <div key={`asset-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                          <span>{item.item}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3 mt-6">EQUITY AND LIABILITIES</h3>
                    <div className="space-y-2 ml-4">
                      {/* Liabilities */}
                      {balanceSheetData.liabilities.map((item: any, index: number) => (
                        <div key={`liab-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                          <span>{item.item}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}

                      {/* Equity */}
                      {balanceSheetData.equity.map((item: any, index: number) => (
                        <div key={`equity-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                          <span>{item.item}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}

                      <div className="flex justify-between py-1 font-bold border-t-2 pt-2 text-lg">
                        <span>TOTAL EQUITY AND LIABILITIES</span>
                        <span className="font-mono">
                          {formatCurrency(
                            (balanceSheetData.liabilities.find(i => i.item === 'TOTAL LIABILITIES')?.amount || 0) +
                            (balanceSheetData.equity.find(i => i.item === 'TOTAL EQUITY')?.amount || 0)
                          )}
                        </span>
                      </div>
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
        {cashflowData.map((section: any, sectionIndex: number) => {
          const isNetLine = section.category === 'Net Increase / (Decrease) in Cash';

          // Nice subtotal label per section
          const subtotalLabel =
            section.total >= 0
              ? `Net cash from ${section.category}`
              : `Net cash used in ${section.category}`;

          return (
            <div key={sectionIndex}>
              <h3
                className={`font-semibold text-lg mb-3 ${isNetLine ? 'mt-6' : ''}`}
              >
                {section.category}
              </h3>

              {/* Detail items */}
              {section.items.length > 0 ? (
                <div className="space-y-2 ml-4">
                  {section.items.map((item: any, itemIndex: number) => (
                    <div
                      key={itemIndex}
                      className="flex justify-between py-1"
                    >
                      <span>{item.item}</span>
                      <span className="font-mono">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}

                  {/* Subtotal for the section */}
                  {section.showSubtotal && (
                    <div className="flex justify-between py-1 font-bold border-t pt-2">
                      <span>{subtotalLabel}</span>
                      <span className="font-mono">{formatCurrency(section.total)}</span>
                    </div>
                  )}
                </div>
              ) : (
                // Net line (no detail items; just the bold total)
                isNetLine && (
                  <div className="flex justify-between py-2 font-bold border-t-2 text-lg">
                    <span>{section.category}</span>
                    <span className="font-mono">{formatCurrency(section.total)}</span>
                  </div>
                )
              )}
            </div>
          );
        })}

        {cashflowData.length === 0 && (
          <p className="text-center text-gray-500 py-4">
            No cash flow data available for the selected period, or data structure is unexpected.
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