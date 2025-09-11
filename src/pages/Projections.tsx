import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import HighchartsMore from 'highcharts/highcharts-more';
import { TrendingUp, Calendar, BarChart3, FolderKanban, Loader2, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../AuthPage';
import axios from 'axios';
import { format, subDays, differenceInMonths } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Initialize the Highcharts-more module for waterfall charts
if (typeof HighchartsMore === 'function') HighchartsMore(Highcharts);

// IMPORTANT: Replace with your actual backend API URL
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Ensure this matches your backend

// Define types for projection data
interface ProjectionDataPoint {
  period: string;
  sales: number;
  costs: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
}

// Define type for custom overrides
interface CustomOverrides {
  [periodKey: string]: {
    [metricKey: string]: number | string; // Can be a number for direct override or string for percentage adjustment (e.g., "+5%")
  };
}

// Define the structure for the baseline data fetched from the backend
interface BaselineData {
  sales: number;
  costOfGoods: number;
  operatingExpenses: number;
  otherExpenses: number;
  totalExpenses: number;
  // Add other relevant fields if your backend sends them
}

const Projections = () => {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const [revenueGrowthRate, setRevenueGrowthRate] = useState(5);
  const [costGrowthRate, setCostGrowthRate] = useState(3);
  const [expenseGrowthRate, setExpenseGrowthRate] = useState(2);
  const [baselineData, setBaselineData] = useState<BaselineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('12-months');

  // State for custom period dates and download selection
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customProjectionData, setCustomProjectionData] = useState<ProjectionDataPoint[]>([]);
  const [downloadPeriod, setDownloadPeriod] = useState('12-months');

  // --- NEW STATE FOR CUSTOM OVERRIDES ---
  const [customOverrides, setCustomOverrides] = useState<CustomOverrides>({});
  // State to track which cell is currently being edited
  const [editingCell, setEditingCell] = useState<{
    tab: string;
    periodKey: string;
    metricKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  // --- END NEW STATE ---

  // Memoized function to get authentication headers
  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // Use useCallback to memoize the function and prevent unnecessary re-creations
  const fetchBaselineData = useCallback(
    async (startDate?: string, endDate?: string) => {
      setIsRefreshing(true);

      if (!isAuthenticated || !token) {
        setIsLoading(false);
        setIsRefreshing(false);
        toast({
          title: 'Error',
          description: 'Authentication required. Please log in to view projections.',
          variant: 'destructive',
        });
        return;
      }

      try {
        // --- Call the NEW backend endpoint ---
        let url = `${API_BASE_URL}/api/projections/historical-baseline`;
        // --- Pass the date range as query parameters ---
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (params.toString()) url += `?${params.toString()}`;

        const response = await axios.get<BaselineData>(url, {
          headers: getAuthHeaders(),
        });

        // --- Update state with the data from the new endpoint ---
        setBaselineData(response.data); // response.data should match the BaselineData interface

        toast({
          title: 'Success',
          description: 'Financial baseline data loaded successfully from journal entries.',
          variant: 'default',
        });
      } catch (error: any) {
        console.error('Error fetching baseline data from journal:', error);
        toast({
          title: 'Error',
          description: `Failed to load financial baseline data. ${error.response?.data?.error || error.message}`,
          variant: 'destructive',
        });
        setBaselineData(null);
      } finally {
        setIsRefreshing(false);
        setIsLoading(false);
      }
    },
    [getAuthHeaders, isAuthenticated, token, toast]
  );

  // Initial data fetch on component mount and when activeTab changes
  useEffect(() => {
    if (isAuthenticated && token) {
      if (activeTab === '12-months' || activeTab === '5-years') {
        // Default to last 12 months for initial fetch if no dates provided
        const defaultEndDate = format(new Date(), 'yyyy-MM-dd');
        const defaultStartDate = format(subDays(new Date(), 365), 'yyyy-MM-dd');
        fetchBaselineData(defaultStartDate, defaultEndDate);
      }
    }
  }, [isAuthenticated, token, fetchBaselineData, activeTab]);

  // Handle data fetch for custom period
  const handleCustomFetch = async () => {
    if (!customStartDate || !customEndDate) {
      toast({
        title: 'Error',
        description: 'Please select both start and end dates.',
        variant: 'destructive',
      });
      return;
    }
    await fetchBaselineData(customStartDate, customEndDate);
  };

  // Use useEffect to generate custom projections whenever baselineData changes after a custom fetch
  useEffect(() => {
    if (activeTab === 'custom' && baselineData) {
      try {
        const startDate = new Date(customStartDate);
        const endDate = new Date(customEndDate);
        const numberOfMonths = differenceInMonths(endDate, startDate) + 1;

        const customProjections = generateProjectionData(numberOfMonths, false, 'custom'); // Pass 'custom' tab identifier
        setCustomProjectionData(customProjections);

      } catch (error) {
        console.error("Error generating custom projection data:", error);
        setCustomProjectionData([]);
      }
    }
  }, [baselineData, activeTab, customStartDate, customEndDate, customOverrides]); // Add customOverrides to dependencies


  // --- UPDATED: generateProjectionData to incorporate custom overrides ---
  const generateProjectionData = (periods: number, isYearly = false, tabId: string = '12-months') => {
    if (!baselineData) return [];

    const data: ProjectionDataPoint[] = [];
    const periodLabel = isYearly ? 'Year' : 'Month';

    // Baseline (period 0)
    const baselineGrossProfit = baselineData.sales - baselineData.costOfGoods;
    const baselineNetProfit = baselineGrossProfit - baselineData.totalExpenses;
    data.push({
      period: 'Baseline',
      sales: Math.round(baselineData.sales),
      costs: Math.round(baselineData.costOfGoods),
      expenses: Math.round(baselineData.totalExpenses),
      grossProfit: Math.round(baselineGrossProfit),
      netProfit: Math.round(baselineNetProfit),
    });

    for (let i = 1; i <= periods; i++) { // Start from 1 for projected periods
      const multiplier = isYearly ? i : i / 12; // Adjusted to align with periods
      const currentPeriodKey = `${tabId}-${i}`;

      let currentSales = baselineData.sales * Math.pow(1 + revenueGrowthRate / 100, multiplier);
      let currentCosts = baselineData.costOfGoods * Math.pow(1 + costGrowthRate / 100, multiplier);
      let currentExpenses = baselineData.totalExpenses * Math.pow(1 + expenseGrowthRate / 100, multiplier);

      // Apply custom overrides if they exist for this period and metric
      const periodOverrides = customOverrides[currentPeriodKey];

      if (periodOverrides) {
        // Sales override
        if (periodOverrides.sales !== undefined) {
          if (typeof periodOverrides.sales === 'number') {
            currentSales = periodOverrides.sales;
          } else if (typeof periodOverrides.sales === 'string' && periodOverrides.sales.endsWith('%')) {
            const percent = parseFloat(periodOverrides.sales) / 100;
            currentSales = currentSales * (1 + percent);
          }
        }

        // Costs override
        if (periodOverrides.costs !== undefined) {
          if (typeof periodOverrides.costs === 'number') {
            currentCosts = periodOverrides.costs;
          } else if (typeof periodOverrides.costs === 'string' && periodOverrides.costs.endsWith('%')) {
            const percent = parseFloat(periodOverrides.costs) / 100;
            currentCosts = currentCosts * (1 + percent);
          }
        }

        // Expenses override
        if (periodOverrides.expenses !== undefined) {
          if (typeof periodOverrides.expenses === 'number') {
            currentExpenses = periodOverrides.expenses;
          } else if (typeof periodOverrides.expenses === 'string' && periodOverrides.expenses.endsWith('%')) {
            const percent = parseFloat(periodOverrides.expenses) / 100;
            currentExpenses = currentExpenses * (1 + percent);
          }
        }
      }

      // Recalculate gross and net profit based on potentially overridden values
      const grossProfit = currentSales - currentCosts;
      const netProfit = grossProfit - currentExpenses;

      data.push({
        period: `${periodLabel} ${i}`,
        sales: Math.round(currentSales),
        costs: Math.round(currentCosts),
        expenses: Math.round(currentExpenses),
        grossProfit: Math.round(grossProfit),
        netProfit: Math.round(netProfit),
      });
    }
    return data;
  };
  // --- END UPDATED: generateProjectionData ---


  // Helper to transform data for the inverted table (metrics as rows, periods as columns)
  const transformToInvertedTableData = (projectionData: ProjectionDataPoint[]) => {
    if (!projectionData || projectionData.length === 0)
      return { headers: [], rows: [] };

    const headers = projectionData.map((d) => d.period);
    const metrics = [
      { key: 'sales', label: 'Sales' },
      { key: 'costs', label: 'Cost of Goods' },
      { key: 'grossProfit', label: 'Gross Profit' },
      { key: 'expenses', label: 'Total Expenses' },
      { key: 'netProfit', label: 'Net Profit' },
    ];

    const rows = metrics.map((metric) => {
      const rowData = {
        metric: metric.label,
        values: projectionData.map((d) => d[metric.key as keyof ProjectionDataPoint]),
      };
      return rowData;
    });

    return { headers, rows };
  };

  const createChartOptions = (data: ProjectionDataPoint[], title: string) => {
    if (!data || data.length === 0) {
      return {
        title: { text: title },
        series: [],
        noData: {
          style: { fontWeight: 'bold', fontSize: '15px' },
          position: { verticalAlign: 'middle' },
          text: 'No data available to display chart.',
        },
      };
    }

    return {
      chart: {
        type: 'line',
        height: 400,
      },
      title: {
        text: title,
      },
      xAxis: {
        categories: data.map((d) => d.period),
      },
      yAxis: {
        title: {
          text: 'Amount (R)',
        },
        labels: {
          formatter: function (this: Highcharts.AxisLabelsFormatterContextObject) {
            return 'R' + Highcharts.numberFormat(this.value as number, 0, '.', ',');
          },
        },
      },
      tooltip: {
        formatter: function (this: Highcharts.TooltipFormatterContextObject) {
          return `<b>${this.series.name}</b><br/>${this.x}: R${Highcharts.numberFormat(
            this.y as number,
            0,
            '.',
            ','
          )}`;
        },
      },
      series: [
        {
          name: 'Sales',
          data: data.map((d) => d.sales),
          color: '#3b82f6',
        },
        {
          name: 'Gross Profit',
          data: data.map((d) => d.grossProfit),
          color: '#10b981',
        },
        {
          name: 'Net Profit',
          data: data.map((d) => d.netProfit),
          color: '#8b5cf6',
        },
      ] as Highcharts.SeriesOptionsType[],
      legend: {
        enabled: true,
      },
      credits: {
        enabled: false,
      },
    };
  };

  const createWaterfallOptions = (data: ProjectionDataPoint[]) => {
    if (!data || data.length === 0) {
      return {
        title: { text: 'Profit & Loss Waterfall - Latest Projection' },
        series: [],
        noData: {
          style: { fontWeight: 'bold', fontSize: '15px' },
          position: { verticalAlign: 'middle' },
          text: 'No data available to display chart.',
        },
      };
    }

    const latestData = data[data.length - 1];
    return {
      chart: {
        type: 'waterfall',
        height: 400,
      },
      title: {
        text: 'Profit & Loss Waterfall - Latest Projection',
      },
      xAxis: {
        type: 'category',
      },
      yAxis: {
        title: {
          text: 'Amount (R)',
        },
        labels: {
          formatter: function (this: Highcharts.AxisLabelsFormatterContextObject) {
            return 'R' + Highcharts.numberFormat(this.value as number, 0, '.', ',');
          },
        },
      },
      tooltip: {
        formatter: function (this: Highcharts.TooltipFormatterContextObject) {
          return `<b>${this.point.name}</b><br/>R${Highcharts.numberFormat(
            this.y as number,
            0,
            '.',
            ','
          )}`;
        },
      },
      series: [
        {
          upColor: '#10b981',
          color: '#ef4444',
          data: [
            {
              name: 'Sales',
              y: latestData.sales,
            },
            {
              name: 'Cost of Goods',
              y: -latestData.costs,
            },
            {
              name: 'Gross Profit',
              isIntermediateSum: true,
              color: '#3b82f6',
            },
            {
              name: 'Expenses',
              y: -latestData.expenses,
            },
            {
              name: 'Net Profit',
              isSum: true,
              color: '#8b5cf6',
            },
          ],
        },
      ] as Highcharts.SeriesOptionsType[],
      credits: {
        enabled: false,
      },
    };
  };

  // --- UPDATED: Memoized projection data to re-generate when customOverrides change ---
  const projectionData12Months = useMemo(() =>
    baselineData ? generateProjectionData(12, false, '12-months') : [],
    [baselineData, revenueGrowthRate, costGrowthRate, expenseGrowthRate, customOverrides]
  );
  const projectionData5Years = useMemo(() =>
    baselineData ? generateProjectionData(5, true, '5-years') : [],
    [baselineData, revenueGrowthRate, costGrowthRate, expenseGrowthRate, customOverrides]
  );
  // Custom projection data is already handled by its own useEffect, which depends on customOverrides

  const getProjectionData = useMemo(() => {
    switch (downloadPeriod) {
      case '12-months':
        return projectionData12Months;
      case '5-years':
        return projectionData5Years;
      case 'custom':
        return customProjectionData;
      default:
        return [];
    }
  }, [downloadPeriod, projectionData12Months, projectionData5Years, customProjectionData]);

  const inverted12MonthData = transformToInvertedTableData(projectionData12Months);
  const inverted5YearData = transformToInvertedTableData(projectionData5Years);
  const invertedCustomData = transformToInvertedTableData(customProjectionData);

  const downloadCSV = useCallback((data: ProjectionDataPoint[], filename: string) => {
    if (!data || data.length === 0) {
      toast({
        title: 'No Data',
        description: 'No data available to download.',
        variant: 'destructive',
      });
      return;
    }

    const invertedData = transformToInvertedTableData(data);
    const headers = ['Metric', ...invertedData.headers];

    let csvContent = headers.map(header => `"${header}"`).join(',') + '\n';

    invertedData.rows.forEach(row => {
      const rowValues = [`"${row.metric}"`, ...row.values.map(value => value.toString())];
      csvContent += rowValues.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [toast]); // Removed transformToInvertedTableData from dependencies as it's not needed

  const downloadPDF = useCallback((data: ProjectionDataPoint[], title: string, filename: string) => {
    if (!data || data.length === 0) {
      toast({
        title: 'No Data',
        description: 'No data available to download.',
        variant: 'destructive',
      });
      return;
    }

    const doc = new jsPDF();

    // --- Add a title page or header ---
    doc.setFontSize(22);
    doc.text(title, 14, 20);
    doc.setFontSize(12);
    doc.text('Financial Report Generated: ' + new Date().toLocaleDateString(), 14, 30);

    // --- Add Projections Table ---
    const invertedData = transformToInvertedTableData(data);
    const tableHeaders = invertedData.headers;
    const tableRows = invertedData.rows.map(row => [row.metric, ...row.values.map(val => 'R' + val.toLocaleString('en-ZA'))]);

    (doc as any).autoTable({
      startY: 40,
      head: [['Metric', ...tableHeaders]],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: '#f1f5f9' },
      styles: { fontSize: 10, cellPadding: 2, overflow: 'linebreak' },
    });

    // --- Add Profit Analysis Waterfall Table ---
    if (data.length > 0) {
      const latestData = data[data.length - 1];
      const profitAnalysisData = [
        ['Sales', 'R' + latestData.sales.toLocaleString('en-ZA')],
        ['Cost of Goods', 'R' + (-latestData.costs).toLocaleString('en-ZA')],
        ['Gross Profit', 'R' + (latestData.grossProfit).toLocaleString('en-ZA')],
        ['Expenses', 'R' + (-latestData.expenses).toLocaleString('en-ZA')],
        ['Net Profit', 'R' + (latestData.netProfit).toLocaleString('en-ZA')],
      ];

      const startY = (doc as any).autoTable.previous.finalY + 10;
      doc.addPage();
      doc.setFontSize(16);
      doc.text('Profit & Loss Analysis: ' + data[data.length - 1].period, 14, 20);

      (doc as any).autoTable({
        startY: 30,
        head: [['Metric', 'Amount']],
        body: profitAnalysisData,
        theme: 'striped',
        headStyles: { fillColor: '#f1f5f9' },
        styles: { fontSize: 10, cellPadding: 2, overflow: 'linebreak' },
      });
    }

    doc.save(filename);
  }, [toast]); // Removed transformToInvertedTableData from dependencies as it's not needed


  // --- NEW: Handlers for inline editing ---
  const handleCellClick = (tab: string, periodKey: string, metricKey: string, currentValue: number | string) => {
    // Only allow editing for non-baseline rows and specific metrics
    if (periodKey === 'Baseline' || metricKey === 'grossProfit' || metricKey === 'netProfit') {
      return;
    }
    setEditingCell({ tab, periodKey, metricKey });
    // If there's an existing override, use that value, otherwise use the displayed number
    const overrideValue = customOverrides[periodKey]?.[metricKey];
    setEditValue(overrideValue !== undefined ? String(overrideValue) : String(currentValue));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleEditSave = () => {
    if (!editingCell) return;

    const { tab, periodKey, metricKey } = editingCell;
    let newValue: number | string = editValue.trim();

    // Validate and parse input
    if (newValue === '') { // Clear override if input is empty
      setCustomOverrides(prev => {
        const newOverrides = { ...prev };
        if (newOverrides[periodKey]) {
          delete newOverrides[periodKey][metricKey];
          // If no more overrides for this period, remove the period entry
          if (Object.keys(newOverrides[periodKey]).length === 0) {
            delete newOverrides[periodKey];
          }
        }
        return newOverrides;
      });
    } else if (newValue.endsWith('%')) {
      const parsedPercent = parseFloat(newValue.slice(0, -1));
      if (!isNaN(parsedPercent)) {
        newValue = (parsedPercent > 0 ? `+${parsedPercent}%` : `${parsedPercent}%`); // Store as "+X%" or "-X%"
      } else {
        toast({ title: "Invalid Input", description: "Percentage must be a number followed by '%'.", variant: "destructive" });
        setEditingCell(null);
        return;
      }
    } else {
      const parsedNumber = parseFloat(newValue);
      if (!isNaN(parsedNumber)) {
        newValue = parsedNumber;
      } else {
        toast({ title: "Invalid Input", description: "Please enter a number or a percentage (e.g., '5%' or '+5%').", variant: "destructive" });
        setEditingCell(null);
        return;
      }
    }

    setCustomOverrides(prev => ({
      ...prev,
      [periodKey]: {
        ...prev[periodKey],
        [metricKey]: newValue,
      },
    }));
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const isCellEditable = (periodKey: string, metricKey: string) => {
    // Prevent editing for 'Baseline' and calculated metrics
    return periodKey !== 'Baseline' && metricKey !== 'grossProfit' && metricKey !== 'netProfit';
  };
  // --- END NEW: Handlers for inline editing ---


  // Helper function to render table rows with editable cells
  const renderTableRows = (data: { metric: string; values: (string | number)[]; }[], currentTab: string) => {
    // Map metric labels to their respective keys for easier lookup
    const metricKeyMap: { [label: string]: string } = {
      'Sales': 'sales',
      'Cost of Goods': 'costs',
      'Gross Profit': 'grossProfit',
      'Total Expenses': 'expenses',
      'Net Profit': 'netProfit',
    };

    return data.map((row, rowIndex) => (
      <tr
        key={row.metric}
        className={row.metric === 'Baseline' ? 'bg-blue-50' : ''}
      >
        <td className='border border-border p-3 font-medium'>
          {row.metric}
        </td>
        {row.values.map((value, colIndex) => {
          const periodName = inverted12MonthData.headers[colIndex] || inverted5YearData.headers[colIndex] || invertedCustomData.headers[colIndex];
          const periodKey = periodName === 'Baseline' ? 'Baseline' : `${currentTab}-${colIndex}`; // Use colIndex for periodKey in custom
          const metricKey = metricKeyMap[row.metric];

          // Determine if this cell is currently being edited
          const isCurrentlyEditing = editingCell?.tab === currentTab &&
            editingCell?.periodKey === periodKey &&
            editingCell?.metricKey === metricKey;

          // Check if there's an override for this specific cell
          const hasOverride = customOverrides[periodKey]?.[metricKey] !== undefined;

          // Display value based on override or calculated, formatted
          const displayValue = `R${Number(value).toLocaleString('en-ZA')}`;

          return (
            <td
              key={colIndex}
              className={`border border-border p-3 text-right relative ${isCellEditable(periodKey, metricKey) ? 'cursor-pointer hover:bg-gray-100' : ''} ${hasOverride ? 'bg-yellow-50' : ''}`}
              onClick={() => isCellEditable(periodKey, metricKey) && handleCellClick(currentTab, periodKey, metricKey, value)}
            >
              {isCurrentlyEditing ? (
                <Input
                  type="text" // Allow text to support percentage input
                  value={editValue}
                  onChange={handleEditChange}
                  onBlur={handleEditSave}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-full text-right h-8 p-1 text-sm bg-white"
                />
              ) : (
                <span className={hasOverride ? 'font-semibold text-yellow-800' : ''}>
                  {displayValue}
                </span>
              )}
            </td>
          );
        })}
      </tr>
    ));
  };


  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='Financial Projections' />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className='space-y-6'
      >
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center justify-between'>
              <span className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5' />
                Projection Parameters
              </span>
              <Button
                onClick={() => {
                  const defaultEndDate = format(new Date(), 'yyyy-MM-dd');
                  const defaultStartDate = format(subDays(new Date(), 365), 'yyyy-MM-dd');
                  fetchBaselineData(defaultStartDate, defaultEndDate);
                }}
                disabled={isRefreshing || !isAuthenticated || !token || (activeTab !== '12-months' && activeTab !== '5-years')}
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Refreshing...
                  </>
                ) : (
                  'Project'
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
              <div>
                <Label htmlFor='revenue-growth'>Revenue Growth Rate (%)</Label>
                <Input
                  id='revenue-growth'
                  type='number'
                  value={revenueGrowthRate}
                  onChange={(e) => setRevenueGrowthRate(Number(e.target.value))}
                  min='0'
                  max='100'
                  step='0.1'
                  disabled={isLoading || !isAuthenticated || !token}
                />
              </div>
              <div>
                <Label htmlFor='cost-growth'>Direct Costs Growth Rate (%)</Label>
                <Input
                  id='cost-growth'
                  type='number'
                  value={costGrowthRate}
                  onChange={(e) => setCostGrowthRate(Number(e.target.value))}
                  min='0'
                  max='100'
                  step='0.1'
                  disabled={isLoading || !isAuthenticated || !token}
                />
              </div>
              <div>
                <Label htmlFor='expense-growth'>Expenses Growth Rate (%)</Label>
                <Input
                  id='expense-growth'
                  type='number'
                  value={expenseGrowthRate}
                  onChange={(e) => setExpenseGrowthRate(Number(e.target.value))}
                  min='0'
                  max='100'
                  step='0.1'
                  disabled={isLoading || !isAuthenticated || !token}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Download Buttons */}
        <div className='flex items-center gap-2 p-4 border rounded-md shadow-sm bg-background'>
          <Label htmlFor='download-period-select' className='text-sm font-medium'>
            Select Period:
          </Label>
          <select
            id='download-period-select'
            value={downloadPeriod}
            onChange={(e) => setDownloadPeriod(e.target.value)}
            className='h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='12-months'>12 Months</option>
            <option value='5-years'>5 Years</option>
            <option value='custom' disabled={customProjectionData.length === 0}>
              Custom Period
            </option>
          </select>
          <Button
            size='sm'
            onClick={() => downloadCSV(getProjectionData, `${downloadPeriod}-projection.csv`)}
            disabled={!getProjectionData || getProjectionData.length === 0}
          >
            <Download className='h-4 w-4 mr-2' />
            Download Projections CSV
          </Button>
          <Button
            size='sm'
            onClick={() => downloadPDF(getProjectionData, `Financial Projections - ${downloadPeriod}`, `${downloadPeriod}-projection.pdf`)}
            disabled={!getProjectionData || getProjectionData.length === 0}
            variant="outline"
          >
            <Download className='h-4 w-4 mr-2' />
            Download PDF
          </Button>
        </div>

        {isLoading ? (
          <div className='flex justify-center items-center h-96'>
            <Loader2 className='h-12 w-12 animate-spin text-gray-500' />
          </div>
        ) : (
          <Tabs defaultValue='12-months' className='w-full' onValueChange={setActiveTab}>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='12-months' className='flex items-center gap-2'>
                <Calendar className='h-4 w-4' />
                12 Months
              </TabsTrigger>
              <TabsTrigger value='5-years' className='flex items-center gap-2'>
                <TrendingUp className='h-4 w-4' />5 Years
              </TabsTrigger>
              <TabsTrigger value='custom' className='flex items-center gap-2'>
                <BarChart3 className='h-4 w-4' />
                Custom Period
              </TabsTrigger>
            </TabsList>

            <TabsContent value='12-months' className='space-y-6'>
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                    <CardTitle>12-Month Projection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={createChartOptions(
                        projectionData12Months,
                        '12-Month Financial Projection'
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Profit Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={createWaterfallOptions(projectionData12Months)}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                  <CardTitle>Detailed 12-Month Projections (Inverted)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='overflow-x-auto'>
                    <table className='w-full border-collapse border border-border'>
                      <thead>
                        <tr className='bg-muted'>
                          <th className='border border-border p-3 text-left'>Metric</th>
                          {inverted12MonthData.headers.map((header, index) => (
                            <th key={index} className='border border-border p-3 text-right'>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {renderTableRows(inverted12MonthData.rows, '12-months')}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='5-years' className='space-y-6'>
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                    <CardTitle>5-Year Projection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={createChartOptions(
                        projectionData5Years,
                        '5-Year Financial Projection'
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Year 5 Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={createWaterfallOptions(projectionData5Years)}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                  <CardTitle>5-Year Summary Projections (Inverted)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='overflow-x-auto'>
                    <table className='w-full border-collapse border border-border'>
                      <thead>
                        <tr className='bg-muted'>
                          <th className='border border-border p-3 text-left'>Metric</th>
                          {inverted5YearData.headers.map((header, index) => (
                            <th key={index} className='border border-border p-3 text-right'>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {renderTableRows(inverted5YearData.rows, '5-years')}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='custom' className='space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Custom Period</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <Label htmlFor='custom-start-date'>Start Date</Label>
                      <Input
                        id='custom-start-date'
                        type='date'
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        disabled={isRefreshing}
                      />
                    </div>
                    <div>
                      <Label htmlFor='custom-end-date'>End Date</Label>
                      <Input
                        id='custom-end-date'
                        type='date'
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        disabled={isRefreshing}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCustomFetch}
                    className='mt-4 w-full'
                    disabled={isRefreshing || !isAuthenticated || !token}
                  >
                    {isRefreshing ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Fetching...
                      </>
                    ) : (
                      'Fetch Baseline Data & Generate Projections'
                    )}
                  </Button>
                </CardContent>
              </Card>

              {customProjectionData.length > 0 && (
                <>
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                    <Card>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                        <CardTitle>Custom Period Financial Projection</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={createChartOptions(
                            customProjectionData,
                            'Custom Period Financial Projection'
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Profit Analysis (Latest Projection)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={createWaterfallOptions(customProjectionData)}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                      <CardTitle>Detailed Custom Projections (Inverted)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='overflow-x-auto'>
                        <table className='w-full border-collapse border border-border'>
                          <thead>
                            <tr className='bg-muted'>
                              <th className='border border-border p-3 text-left'>Metric</th>
                              {invertedCustomData.headers.map((header, index) => (
                                <th key={index} className='border border-border p-3 text-right'>
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {renderTableRows(invertedCustomData.rows, 'custom')}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              {customProjectionData.length === 0 && (
                <p className='text-muted-foreground text-center'>
                  Select a date range and click "Fetch" to see custom period financials.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </motion.div>
    </div>
  );
};

export default Projections;