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

// --- UPDATED: New interface for the enhanced balance sheet response ---
interface ApiBalanceSheetResponse {
  asOf: string;
  sections: ApiBalanceSheetSection[];
  openingEquity: number;
  netProfitLoss: number;
  closingEquity: number;
  assets: {
    current: number;
    non_current: number;
  };
  liabilities: {
    current: number;
    non_current: number;
  };
}
// --- END UPDATED ---

interface BalanceSheetData {
  assets: BalanceSheetLineItem[];
  liabilities: BalanceSheetLineItem[];
  equity: BalanceSheetLineItem[]; // This will now contain the detailed breakdown
}

// Interfaces for the data returned by the specific API endpoints
interface ApiIncomeStatementSection {
  section: string;
  amount: string; // API returns string numbers
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
  const [incomeStatementData, setIncomeStatementData] = useState<{ item: string; amount: number; type?: string }[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData>({ assets: [], liabilities: [], equity: [] });
  const [cashflowData, setCashflowData] = useState<{ category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[]>([]);

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


  // --- Helper functions for data processing ---
  const num = (n: any) => {
    const parsed = parseFloat(String(n));
    return isNaN(parsed) ? 0 : parsed;
  };

  // --- Data Normalization Functions ---
  const buildIncomeStatementLines = (sections: ApiIncomeStatementSection[] | undefined) => {
    const lines: { item: string; amount: number; type?: string }[] = [];
    if (!sections || !Array.isArray(sections)) {
        console.warn("Invalid income statement data received:", sections);
        return lines;
    }

    const sectionMap: Record<string, number> = {};
    sections.forEach(s => {
        sectionMap[s.section] = num(s.amount);
    });

    lines.push({ item: 'Sales Revenue', amount: sectionMap['revenue'] || 0, type: 'detail' });
    const grossProfit = (sectionMap['revenue'] || 0) - 0;
    lines.push({ item: 'Gross Profit / (Loss)', amount: grossProfit, type: 'subtotal' });

    const otherIncomeSections = Object.keys(sectionMap).filter(k => k === 'other_income');
    if (otherIncomeSections.length > 0 || sectionMap['other_income'] > 0) {
        lines.push({ item: 'Add: Other Income', amount: 0, type: 'header' });
        lines.push({ item: '  Other Income', amount: sectionMap['other_income'] || 0, type: 'detail' });
    }

    const grossIncome = grossProfit + (sectionMap['other_income'] || 0);
    lines.push({ item: 'Gross Income', amount: grossIncome, type: 'subtotal' });

    lines.push({ item: 'Less: Expenses', amount: 0, type: 'header' });
    if (sectionMap['operating_expenses'] !== undefined) {
        lines.push({ item: '  Operating Expenses', amount: sectionMap['operating_expenses'], type: 'detail-expense' });
    }
    Object.keys(sectionMap).forEach(key => {
        if (key !== 'revenue' && key !== 'other_income' && key !== 'operating_expenses' && sectionMap[key] > 0) {
             lines.push({ item: `  ${key.replace(/_/g, ' ')}`, amount: sectionMap[key], type: 'detail-expense' });
        }
    });

    const totalExpenses = Object.keys(sectionMap)
        .filter(k => k !== 'revenue' && k !== 'other_income')
        .reduce((sum, k) => sum + sectionMap[k], 0);
    lines.push({ item: 'Total Expenses', amount: totalExpenses, type: 'subtotal' });

    const netProfitLoss = grossIncome - totalExpenses;
    lines.push({
      item: netProfitLoss >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period',
      amount: Math.abs(netProfitLoss),
      type: 'total'
    });

    return lines;
  };

  // --- UPDATED: Enhanced Balance Sheet Normalization ---
  const normalizeBalanceSheetFromServer = (response: ApiBalanceSheetResponse | undefined): BalanceSheetData => {
    const assets: BalanceSheetLineItem[] = [];
    const liabilities: BalanceSheetLineItem[] = [];
    const equity: BalanceSheetLineItem[] = [];

    if (!response || !Array.isArray(response.sections)) {
        console.warn("Invalid balance sheet data received:", response);
        return { assets, liabilities, equity };
    }

    const { sections, openingEquity, netProfitLoss, closingEquity, assets: assetsData, liabilities: liabilitiesData } = response;

    // Group sections by type for easier access
    const sectionMap: Record<string, number> = {};
    sections.forEach(s => {
        sectionMap[s.section] = num(s.value);
    });

    // --- ASSETS ---
    assets.push({ item: 'Current Assets', amount: 0, isSubheader: true });
    if (assetsData.current !== undefined) {
        assets.push({ item: '  Current Assets', amount: assetsData.current });
    }
    if (assetsData.current !== undefined) {
        assets.push({ item: 'Total Current Assets', amount: assetsData.current, isTotal: true });
    }

    assets.push({ item: 'Non-current Assets', amount: 0, isSubheader: true });
    if (assetsData.non_current !== undefined) {
        assets.push({ item: '  Non-current Assets', amount: assetsData.non_current });
    }
    if (assetsData.non_current !== undefined) {
        assets.push({ item: 'Total Non-Current Assets', amount: assetsData.non_current, isTotal: true });
    }

    const totalAssets = (assetsData.current || 0) + (assetsData.non_current || 0);
    assets.push({
        item: 'TOTAL ASSETS',
        amount: totalAssets,
        isTotal: true,
        isSubheader: true,
    });

    // --- LIABILITIES ---
    liabilities.push({ item: 'Current Liabilities', amount: 0, isSubheader: true });
    if (liabilitiesData.current !== undefined) {
        liabilities.push({ item: '  Current Liabilities', amount: liabilitiesData.current });
    }
    if (liabilitiesData.current !== undefined) {
        liabilities.push({ item: 'Total Current Liabilities', amount: liabilitiesData.current, isTotal: true });
    }

    liabilities.push({ item: 'Non-Current Liabilities', amount: 0, isSubheader: true });
    if (liabilitiesData.non_current !== undefined) {
        liabilities.push({ item: '  Non-Current Liabilities', amount: liabilitiesData.non_current });
    }
    if (liabilitiesData.non_current !== undefined) {
        liabilities.push({ item: 'Total Non-Current Liabilities', amount: liabilitiesData.non_current, isTotal: true });
    }

    const totalLiabilities = (liabilitiesData.current || 0) + (liabilitiesData.non_current || 0);
    liabilities.push({ item: 'TOTAL LIABILITIES', amount: totalLiabilities, isTotal: true, isSubheader: true });

    // --- EQUITY (MODIFIED to show detailed breakdown) ---
    equity.push({ item: 'Equity', amount: 0, isSubheader: true });
    
    // Show the detailed breakdown as requested
    equity.push({ item: '  Opening Balance', amount: openingEquity });
    equity.push({ 
      item: netProfitLoss >= 0 ? '  Net Profit for Period' : '  Net Loss for Period', 
      amount: Math.abs(netProfitLoss) 
    });
    equity.push({ 
      item: 'TOTAL EQUITY', 
      amount: closingEquity, 
      isTotal: true, 
      isSubheader: true 
    });

    return { assets, liabilities, equity };
  };
  // --- END UPDATED ---

  const normalizeCashflow = (groupedSections: ApiCashFlowGrouped | undefined) => {
    const sections: { category: string; items: { item: string; amount: number }[]; total: number; showSubtotal: boolean }[] = [];

    if (!groupedSections || typeof groupedSections !== 'object') {
        console.warn("Invalid cash flow data received:", groupedSections);
        return sections;
    }

    const categories = ['operating', 'investing', 'financing'];
    let netChange = 0;

    categories.forEach(cat => {
        const itemsRaw = groupedSections[cat as keyof ApiCashFlowGrouped];
        if (Array.isArray(itemsRaw)) {
            const items = itemsRaw.map(i => ({
                item: i.line,
                amount: num(i.amount)
            }));
            const total = items.reduce((sum, item) => sum + item.amount, 0);
            netChange += total;
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
  };

  const fetchServerStatement = useCallback(
    async (type: typeof reportTypes[number]['id']) => {
      if (!token) return;

      try {
        let url = '';
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

        switch (type) {
          case 'income-statement':
            url = `${API_BASE_URL}/reports/income-statement?start=${fromDate}&end=${toDate}`;
            break;
          case 'balance-sheet':
            url = `${API_BASE_URL}/reports/balance-sheet?asOf=${toDate}`;
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
        console.log(`Fetched raw data for ${type}:`, payload);

        if (type === 'income-statement') {
          const sections = payload?.sections as ApiIncomeStatementSection[] | undefined;
          const lines = buildIncomeStatementLines(sections);
          setIncomeStatementData(lines);
        }

        if (type === 'trial-balance') {
          const items = payload?.items as ApiTrialBalanceItem[] | undefined;
          setTrialBalanceData(items || []);
        }

        // --- UPDATED: Handle the new balance sheet response structure ---
        if (type === 'balance-sheet') {
          const response = payload as ApiBalanceSheetResponse | undefined;
          const normalized = normalizeBalanceSheetFromServer(response);
          
          // Calculate and add the final total line
          const totalAssets = normalized.assets.find(item => item.item === 'TOTAL ASSETS')?.amount || 0;
          const totalLiabilities = normalized.liabilities.find(item => item.item === 'TOTAL LIABILITIES')?.amount || 0;
          const totalEquity = normalized.equity.find(item => item.item === 'TOTAL EQUITY')?.amount || 0;
          const totalEquityAndLiabilities = totalLiabilities + totalEquity;
          
          // Add the final total line to liabilities section for display
          const liabilitiesWithTotal = [...normalized.liabilities];
          liabilitiesWithTotal.push({ 
            item: 'TOTAL EQUITY AND LIABILITIES', 
            amount: totalEquityAndLiabilities, 
            isTotal: true, 
            isSubheader: true 
          });
          
          setBalanceSheetData({
            assets: normalized.assets,
            liabilities: liabilitiesWithTotal,
            equity: normalized.equity
          });
        }
        // --- END UPDATED ---

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
            case 'balance-sheet': setBalanceSheetData({ assets: [], liabilities: [], equity: [] }); break;
            case 'cash-flow-statement': setCashflowData([]); break;
        }
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
                    {incomeStatementData && incomeStatementData.length > 0 ? (
                      incomeStatementData.map((item, index) => (
                        <TableRow key={index} className={item.type === 'total' || item.type === 'subtotal' ? 'font-bold border-t-2 border-b-2' : ''}>
                          <TableCell className={item.type === 'detail-expense' ? 'pl-8' : ''}>{item.item}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))
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
                        {trialBalanceData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.code} - {item.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(num(item.balance_debit))}</TableCell>
                            <TableCell className="text-right">{formatCurrency(num(item.balance_credit))}</TableCell>
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
                        balanceSheetData.assets.map((item, index) => (
                          <div key={`asset-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                            <span>{item.item}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
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
                        balanceSheetData.liabilities.map((item, index) => (
                          <div key={`liab-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                            <span>{item.item}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">No liability data available.</p>
                      )}

                      {/* Equity - Show detailed breakdown */}
                      {balanceSheetData.equity && balanceSheetData.equity.length > 0 ? (
                        balanceSheetData.equity.map((item, index) => (
                          <div key={`equity-${index}`} className={`flex justify-between py-1
                            ${item.isTotal ? 'font-bold border-t pt-2' : ''}
                            ${item.isSubheader ? 'font-medium text-md !mt-4' : ''}
                            ${item.isAdjustment ? 'pl-4' : ''}
                          `}>
                            <span>{item.item}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">No equity data available.</p>
                      )}
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
                    cashflowData.map((section, sectionIndex) => {
                      const isNetLine = section.category === 'Net Increase / (Decrease) in Cash';

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

                          {section.items.length > 0 ? (
                            <div className="space-y-2 ml-4">
                              {section.items.map((item, itemIndex) => (
                                <div
                                  key={itemIndex}
                                  className="flex justify-between py-1"
                                >
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