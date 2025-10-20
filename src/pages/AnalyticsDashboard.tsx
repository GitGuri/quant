// src/pages/AnalyticsDashboard.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';

import {
  Card,
  Alert,
  Button,
  Spin,
  Space,
  Tag,
  Row,
  Col,
  Statistic,
  Progress,
  Tooltip,
  Table,
  Input,
  Select,
  Drawer,
  Descriptions,
  Empty,
  Typography,
} from 'antd';

import { ArrowLeftOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { AlertTriangle } from 'lucide-react';

import Highcharts from '@/lib/initHighcharts';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';

import { useAuth } from '../AuthPage';
import { DASHBOARDS } from './_dashboards';

const { Text } = Typography;

// ---------- types ----------
type DashboardKey = keyof typeof DASHBOARDS;

type PaymentSlice = { name: string; y: number };

interface SalesTrendPoint { period: string; orders: number; revenue: number }
interface AOVPoint { period: string; aov: number }
interface TopProduct { name: string; revenue: number }
interface FunnelStage { name: string; count: number }
interface DailySalesDataPoint { date: string; total_sales_amount: number }
// Income Statement (single period) from /reports/income-statement
interface IncomeStatementSection {
  section: string;               // 'revenue' | 'cogs' | 'operating_expenses' | 'finance_costs' | ...
  amount: number;                // already sign-fixed server-side
  accounts: { name: string; amount: number }[];
}
interface IncomeStatementResp {
  period: { start: string; end: string };
  sections: IncomeStatementSection[];
}

interface ChartData {
  id: string;
  title: string;
  config: Options;
  error?: string | null;
}

// Finance Prophet points
interface ProphetProfitPoint {
  period: string;
  profit_pred: number;
  profit_lo: number;
  profit_hi: number;
}
interface ProphetRevenuePoint {
  period: string;
  revenue_pred: number;
  revenue_lo: number;
  revenue_hi: number;
}
interface ProphetExpensesPoint {
  period: string;
  expenses_pred: number;
  expenses_lo: number;
  expenses_hi: number;
}

// Sales forecasts
interface ForecastSalesPoint {
  period: string;
  orders_pred: number;
  orders_lo: number;
  orders_hi: number;
  revenue_pred: number;
  revenue_lo: number;
  revenue_hi: number;
}
interface ForecastAOVPoint {
  period: string;
  aov_pred: number;
  aov_lo: number;
  aov_hi: number;
}

// Customers API shapes
interface ClvItem { customer_id: number; customer_name: string; clv: number }
interface OverduePoint { name: string; y: number }
interface ChurnItem {
  customer_id: number;
  customer_name: string;
  last_purchase_date: string | null;
  is_churn_risk: boolean;
  days_since_last: number | null;
}

// /api/customers/cluster-data
interface CustomerClusterData {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  status: string;
  totalInvoiced: number;
  numberOfPurchases: number;
  averageOrderValue: number;
}

// For quick churn tables
interface ChurnRiskItem {
  customer_id: number;
  customer_name: string;
  last_purchase_date: string | null;
  is_churn_risk: boolean;
  days_since_last: number | null;
}

// Purchase history
interface PurchaseItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPriceAtSale: number;
  subtotal: number;
}
interface PurchaseSale {
  id: number;
  totalAmount: number;
  paymentType: string | null;
  amountPaid: number | null;
  changeGiven: number | null;
  creditAmount: number | null;
  remainingCreditAmount: number | null;
  dueDate: string | null;   // yyyy-mm-dd
  saleDate: string | null;  // ISO
  items: PurchaseItem[];
}

// ---------- API base ----------
const API = 'https://quantnow-sa1e.onrender.com'

export default function AnalyticsDashboard() {
  const { dashKey } = useParams<{ dashKey: DashboardKey }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Customers page state (data + helpers)
  const [customerDetails, setCustomerDetails] = useState<{
    clusterData: CustomerClusterData[];
    churnRiskSoon: ChurnRiskItem[];
    longTermInactive: ChurnItem[];
  } | null>(null);

  const [searchText, setSearchText] = useState('');
  const [clusterFilter, setClusterFilter] = useState<string | undefined>(undefined);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState<CustomerClusterData | null>(null);
  const [historyData, setHistoryData] = useState<PurchaseSale[] | null>(null);

  // KPI state
  const [kpi, setKpi] = useState({
    sales: {
      aov: 0,
      returning_orders: 0,
      new_orders: 0,
      anonymous_orders: 0,
      payment_ratio: [] as PaymentSlice[],
      credit_ratio_pct: 0,
      latest_profit_pct: 0,
    },
    customers: {
      at_risk_count: 0,
      median_days_since_last: 0,
      total_overdue_top: 0,
    },
  });

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const ensureOk = (r: Response, name: string) => {
    if (!r.ok) throw new Error(`Failed to fetch ${name}`);
  };

  // helper: try a URL and return undefined if it fails or isn't an array
  const tryArrayJson = async <T,>(url: string): Promise<T[] | undefined> => {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) return undefined;
      const j = await r.json();
      return Array.isArray(j) ? (j as T[]) : undefined;
    } catch {
      return undefined;
    }
  };

  // ------------------------ FETCHERS (Sales) ------------------------
  const fetchSales = useCallback(async () => {
    const [
      salesTrendRes,
      aovRes,
      mixRes,
      paretoRes,
      funnelRes,
      histoRes,
      heatmapJson,
      revenueTrendJson,
      forecastSalesTrendRes,
      forecastAovTrendRes,
    ] = await Promise.all([
      fetch(`${API}/api/charts/sales-trend`, { headers }),
      fetch(`${API}/api/charts/aov-trend`, { headers }),
      fetch(`${API}/api/charts/payment-mix`, { headers }),
      fetch(`${API}/api/charts/top-products-pareto?limit=20`, { headers }),
      fetch(`${API}/api/charts/sales-funnel`, { headers }),
      fetch(`${API}/api/charts/order-values-histogram`, { headers }),
      tryArrayJson<DailySalesDataPoint>(`${API}/api/charts/daily-sales-aggregation`),
      tryArrayJson<any>(`${API}/api/charts/revenue-trend`),
      fetch(`${API}/api/forecast/sales-trend?granularity=month&horizon=6`, { headers }),
      fetch(`${API}/api/forecast/aov-trend?granularity=month&horizon=6`, { headers }),
    ]);

    ensureOk(salesTrendRes, 'sales-trend');
    ensureOk(aovRes, 'aov-trend');
    ensureOk(mixRes, 'payment-mix');
    ensureOk(paretoRes, 'top-products-pareto');
    ensureOk(funnelRes, 'sales-funnel');
    ensureOk(histoRes, 'order-values-histogram');
    ensureOk(forecastSalesTrendRes, 'forecast/sales-trend');
    ensureOk(forecastAovTrendRes, 'forecast/aov-trend');

    const salesTrendJson: { points: SalesTrendPoint[] } = await salesTrendRes.json();
    const aovJson: { points: AOVPoint[] } = await aovRes.json();
    const mixJson: { mix: PaymentSlice[] } = await mixRes.json();
    const paretoJson: { products: TopProduct[] } = await paretoRes.json();
    const funnelJson: { stages: FunnelStage[] } = await funnelRes.json();
    const histogramJson: { values: number[] } = await histoRes.json();

    const forecastSalesTrendJson: {
      granularity: string; from: string; to: string; history: SalesTrendPoint[]; forecast: ForecastSalesPoint[];
    } = await forecastSalesTrendRes.json();

    const forecastAovTrendJson: {
      granularity: string; from: string; to: string; history: AOVPoint[]; forecast: ForecastAOVPoint[];
    } = await forecastAovTrendRes.json();

    // Historical charts
    const sPoints = salesTrendJson.points || [];
    const sCats = sPoints.map((p) => p.period);
    const sOrders = sPoints.map((p) => p.orders);
    const sRevenue = sPoints.map((p) => p.revenue);
    const salesTrend: ChartData = {
      id: 'sales-trend',
      title: 'Sales Trend (Orders & Revenue)',
      config: {
        title: { text: 'Sales Trend' },
        xAxis: { categories: sCats },
        yAxis: [{ title: { text: 'Orders' } }, { title: { text: 'Revenue (ZAR)' }, opposite: true }],
        tooltip: { shared: true },
        series: [
          { type: 'column', name: 'Orders', data: sOrders },
          { type: 'line', name: 'Revenue', yAxis: 1, data: sRevenue },
        ],
      },
    };

    const aPoints = aovJson.points || [];
    const aCats = aPoints.map((p) => p.period);
    const aVals = aPoints.map((p) => p.aov);
    const aovTrend: ChartData = {
      id: 'aov-trend',
      title: 'Average Order Value',
      config: {
        title: { text: 'Average Order Value' },
        xAxis: { categories: aCats },
        yAxis: { title: { text: 'AOV (ZAR)' } },
        series: [{ type: 'line', name: 'AOV', data: aVals }],
      },
    };

    // Forecast charts
    const forecastSalesPoints = forecastSalesTrendJson.forecast || [];
    const forecastSalesCats = forecastSalesPoints.map((p) => p.period);
    const forecastSalesTrend: ChartData = {
      id: 'forecast-sales-trend',
      title: `Sales Forecast (${forecastSalesTrendJson.granularity})`,
      config: {
        title: { text: `Sales Forecast (${forecastSalesTrendJson.granularity})` },
        subtitle: { text: `Based on data from ${forecastSalesTrendJson.from} to ${forecastSalesTrendJson.to}` },
        xAxis: { categories: forecastSalesCats },
        yAxis: [{ title: { text: 'Orders' } }, { title: { text: 'Revenue (ZAR)' }, opposite: true }],
        tooltip: { shared: true },
        series: [
          { type: 'arearange', name: 'Orders Forecast Range', data: forecastSalesPoints.map(p => [p.orders_lo, p.orders_hi]) as any, color: Highcharts.getOptions().colors?.[0], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', zIndex: 0 },
          { type: 'line', name: 'Orders Forecast', data: forecastSalesPoints.map(p => p.orders_pred), color: Highcharts.getOptions().colors?.[0], zIndex: 1 },
          { type: 'arearange', name: 'Revenue Forecast Range', data: forecastSalesPoints.map(p => [p.revenue_lo, p.revenue_hi]) as any, color: Highcharts.getOptions().colors?.[1], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', yAxis: 1, zIndex: 0 },
          { type: 'line', name: 'Revenue Forecast', data: forecastSalesPoints.map(p => p.revenue_pred), color: Highcharts.getOptions().colors?.[1], yAxis: 1, zIndex: 1 },
        ],
      },
    };

    const forecastAovPoints = forecastAovTrendJson.forecast || [];
    const forecastAovCats = forecastAovPoints.map((p) => p.period);
    const forecastAovTrend: ChartData = {
      id: 'forecast-aov-trend',
      title: `AOV Forecast (${forecastAovTrendJson.granularity})`,
      config: {
        title: { text: `AOV Forecast (${forecastAovTrendJson.granularity})` },
        subtitle: { text: `Based on data from ${forecastAovTrendJson.from} to ${forecastAovTrendJson.to}` },
        xAxis: { categories: forecastAovCats },
        yAxis: { title: { text: 'AOV (ZAR)' } },
        series: [
          { type: 'arearange', name: 'AOV Forecast Range', data: forecastAovPoints.map(p => [p.aov_lo, p.aov_hi]) as any, color: Highcharts.getOptions().colors?.[0], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', zIndex: 0 },
          { type: 'line', name: 'AOV Forecast', data: forecastAovPoints.map(p => p.aov_pred), color: Highcharts.getOptions().colors?.[0], zIndex: 1 },
        ],
      },
    };

    // Payment mix
    const pmix = (mixJson.mix || []).filter(Boolean);
    const paymentMix: ChartData = {
      id: 'payment-mix', title: 'Payment Mix',
      config: {
        title: { text: 'Payment Mix' },
        plotOptions: { pie: { innerSize: '60%', dataLabels: { enabled: true, format: '{point.name}: {point.percentage:.1f}%' } } },
        series: [{ type: 'pie', name: 'Amount', data: pmix.map((m: any) => [m.name || m.type, Number(m.y ?? m.amount ?? 0)]) as any }],
      },
    };

    // Top products
    const topProducts = (paretoJson.products || []).filter(Boolean);
    const pCats = topProducts.map((p) => p.name);
    const pVals = topProducts.map((p) => Number(p.revenue || 0));
    const topProductsPareto: ChartData = {
      id: 'top-products-pareto', title: 'Top Products (Pareto)',
      config: {
        title: { text: 'Top Products (Pareto)' },
        xAxis: { categories: pCats },
        yAxis: [{ title: { text: 'Revenue (ZAR)' } }, { title: { text: 'Cumulative %' }, max: 100, opposite: true }],
        series: [{ type: 'column', name: 'Revenue', data: pVals }, { type: 'pareto', name: 'Cumulative %', yAxis: 1, baseSeries: 0 } as any],
        tooltip: { shared: true },
      },
    };

    // Heatmap optional
    let heatConfig: ChartData = {
      id: 'calendar-heatmap-sales',
      title: 'Daily Sales Amount',
      config: { title: { text: 'Daily Sales Amount' }, subtitle: { text: 'No data' }, series: [] },
      error: 'No daily sales data available.',
    };

    if (Array.isArray(heatmapJson) && heatmapJson.length) {
      const ds = heatmapJson;
      const dates = ds.map((d) => new Date(d.date));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      const startCal = new Date(minDate);
      startCal.setDate(minDate.getDay() === 0 ? minDate.getDate() - 6 : minDate.getDate() - (minDate.getDay() - 1));
      const endCal = new Date(maxDate);
      const daysToAdd = maxDate.getDay() === 0 ? 0 : 7 - maxDate.getDay();
      endCal.setDate(maxDate.getDate() + daysToAdd);

      const salesMap: Record<string, number> = {};
      ds.forEach((item) => (salesMap[item.date] = Number(item.total_sales_amount) || 0));

      const heatCells: [number, number, number][] = [];
      const yCats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weeks: number[] = [];
      const iter = new Date(startCal);
      let weekIdx = -1;

      while (iter <= endCal) {
        if (iter.getDay() === 1 || (iter.getDay() === 0 && weeks.length === 0)) {
          weekIdx += 1;
          weeks.push(weekIdx);
        }
        const dayOfWeek = iter.getDay();
        const yIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const key = iter.toISOString().slice(0, 10);
        const val = salesMap[key] || 0;
        heatCells.push([weekIdx, yIndex, val]);
        iter.setDate(iter.getDate() + 1);
      }

      const weekLabels = weeks.map((w) => `Week ${w + 1}`);

      heatConfig = {
        id: 'calendar-heatmap-sales',
        title: 'Daily Sales Amount',
        config: {
          chart: { type: 'heatmap', height: 400, marginTop: 40, marginBottom: 80, plotBorderWidth: 1 },
          title: { text: 'Daily Sales Amount' },
          xAxis: { categories: weekLabels, title: { text: 'Weeks' } },
          yAxis: { categories: yCats, title: { text: 'Day of Week' }, reversed: false },
          colorAxis: { min: 0 },
          legend: { enabled: true, align: 'right', layout: 'vertical', verticalAlign: 'top', y: 25, symbolHeight: 200 },
          tooltip: {
            formatter: function (this: Highcharts.TooltipFormatterContextObject) {
              const w = this.series.xAxis.categories[this.point.x];
              const d = this.series.yAxis.categories[this.point.y];
              return `<b>${d}</b> — ${w}<br/>Sales: <b>R ${Number(this.point.value ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
            },
          },
          series: [{ type: 'heatmap', name: 'Daily Sales', data: heatCells, borderWidth: 0 }],
        },
      };
    }

    // Funnel
    const stages = (funnelJson.stages || []).filter(Boolean);
    const salesFunnel: ChartData = {
      id: 'sales-funnel',
      title: 'Sales Funnel',
      config: {
        title: { text: 'Sales Funnel' },
        series: [{ type: 'funnel', name: 'Count', data: stages.map((s) => [s.name, s.count]) as any }],
      },
    };

    // Histogram
    const values = (histogramJson.values || []).map(Number);
    const orderHistogram: ChartData = {
      id: 'order-values-histogram',
      title: 'Order Value Distribution',
      config: {
        title: { text: 'Order Value Distribution' },
        series: [{ type: 'histogram', baseSeries: 'orders', binWidth: undefined } as any, { id: 'orders', type: 'scatter', data: values, visible: false }],
        xAxis: [{ title: { text: 'Order Value (ZAR)' } }],
        yAxis: [{ title: { text: 'Frequency' } }],
      },
    };

    // Optional: profit %
    let latestProfitPct = 0;
    if (Array.isArray(revenueTrendJson) && revenueTrendJson.length) {
      const last = revenueTrendJson[revenueTrendJson.length - 1] as any;
      const rev = Number(last?.revenue || 0);
      const prof = Number(last?.profit || 0);
      latestProfitPct = rev ? Math.round((100 * prof) / rev) : 0;
    }

    setCharts([
      salesTrend,
      aovTrend,
      forecastSalesTrend,
      forecastAovTrend,
      paymentMix,
      topProductsPareto,
      heatConfig,
      salesFunnel,
      orderHistogram,
    ]);

    const totalPayments = pmix.reduce((a, m: any) => a + Number(m.y ?? m.amount ?? 0), 0);
    const credit = pmix.find((p: any) => (p.name || '').toLowerCase() === 'credit');
    const creditPct = totalPayments ? Math.round((100 * Number(credit?.y ?? credit?.amount ?? 0)) / totalPayments) : 0;
    const totalOrders = sOrders.reduce((a, b) => a + (Number(b) || 0), 0);
    const totalRevenue = sRevenue.reduce((a, b) => a + (Number(b) || 0), 0);
    const overallAOV = totalOrders ? totalRevenue / totalOrders : 0;

    setKpi((prev) => ({
      ...prev,
      sales: {
        ...prev.sales,
        aov: Number(overallAOV.toFixed(2)),
        returning_orders: 0,
        new_orders: totalOrders,
        anonymous_orders: 0,
        payment_ratio: pmix as any,
        credit_ratio_pct: creditPct,
        latest_profit_pct: latestProfitPct,
      },
    }));
  }, [headers]);

  // ---------- Finance ----------
  interface ISPoint { period: string; revenue: number; cogs: number; expenses: number; profit: number }
  interface ExpenseTrendJson { categories: string[]; series: { name: string; data: number[] }[] }

const fetchFinance = useCallback(async () => {
  // pick a sensible default period: current month to date
  const today = new Date();
  const endISO = today.toISOString().slice(0, 10);
  const startISO = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const [
    revenueTrendRes,
    expenseTrendRes,
    forecastProfitRes,
    forecastRevenueRes,
    forecastExpensesRes,
    // NEW: single-period income statement (for Waterfall)
    incomeStatementRes,
  ] = await Promise.all([
    fetch(`${API}/api/analytics/finance/income-statement`, { headers }),
    fetch(`${API}/api/charts/finance/expense-trend`, { headers }),
    fetch(`${API}/api/forecast/finance/profit-trend-prophet?horizon=6&frequency=M`, { headers }),
    fetch(`${API}/api/forecast/finance/revenue-trend-prophet?horizon=6&frequency=M`, { headers }),
    fetch(`${API}/api/forecast/finance/expenses-trend-prophet?horizon=6&frequency=M`, { headers }),
    fetch(`${API}/reports/income-statement?start=${startISO}&end=${endISO}`, { headers }), // ⟵ NEW
  ]);

  ensureOk(revenueTrendRes, 'analytics/finance/income-statement');
  ensureOk(expenseTrendRes, 'charts/finance/expense-trend');
  ensureOk(forecastProfitRes, 'forecast/finance/profit-trend-prophet');
  ensureOk(forecastRevenueRes, 'forecast/finance/revenue-trend-prophet');
  ensureOk(forecastExpensesRes, 'forecast/finance/expenses-trend-prophet');
  ensureOk(incomeStatementRes, 'reports/income-statement');

  const isJson: { points: ISPoint[] } = await revenueTrendRes.json();
  const expJson: ExpenseTrendJson = await expenseTrendRes.json();
  const forecastProfitJson = await forecastProfitRes.json();
  const forecastRevenueJson = await forecastRevenueRes.json();
  const forecastExpensesJson = await forecastExpensesRes.json();

  // -------- Waterfall data from /reports/income-statement (NEW) --------
  const isPeriod: IncomeStatementResp = await incomeStatementRes.json();
  const sections = isPeriod.sections || [];
  const secMap = Object.fromEntries(
    sections.map(s => [String(s.section).toLowerCase(), Number(s.amount || 0)])
  );

  const revenue = Math.abs(secMap['revenue'] ?? 0);
  const cogs = Math.abs(secMap['cogs'] ?? 0);
  const opex = Math.abs(secMap['operating_expenses'] ?? 0);
  const finCosts = Math.abs(secMap['finance_costs'] ?? 0);

  const incomeWaterfall: ChartData = {
    id: 'income-waterfall',
    title: `Income Statement (${isPeriod.period.start} → ${isPeriod.period.end})`,
    config: {
      chart: { type: 'waterfall', height: 420 },
      title: { text: 'Income Statement' },
      xAxis: { type: 'category' },
      yAxis: { title: { text: 'Amount (ZAR)' } },
      tooltip: {
        pointFormatter: function () {
          // @ts-ignore
          return `<b>R ${Highcharts.numberFormat(this.y, 0)}</b>`;
        }
      },
      series: [{
        type: 'waterfall',
        upColor: '#52c41a',
        color: '#ff4d4f',
        dataLabels: {
          enabled: true,
          formatter: function () {
            // @ts-ignore
            return `R ${Highcharts.numberFormat(this.y, 0)}`;
          },
          style: { fontWeight: '600' }
        },
        data: [
          { name: 'Revenue', y: revenue, color: '#52c41a' },
          { name: 'COGS',    y: -cogs },
          { name: 'Operating Exp', y: -opex },
          { name: 'Finance Costs', y: -finCosts },
          { name: 'Net Profit', isSum: true, color: '#1677ff' },
        ]
      }]
    },
  };
  // -------- end Waterfall --------

  // ----- Expense Trend (make bars more readable, as discussed) -----
  const expTrend: ChartData = {
    id: 'bar-race-expenses',
    title: 'Expense Trend by Account (Monthly)',
    config: {
      chart: {
        type: 'column',
        height: 480,
        zoomType: 'x',
        scrollablePlotArea: { minWidth: 1200, scrollPositionX: 1 }
      },
      title: { text: 'Expenses by Account' },
      xAxis: {
        categories: expJson.categories,
        crosshair: true,
        labels: { rotation: -25 }
      },
      yAxis: { title: { text: 'Amount (ZAR)' }, gridLineColor: '#f0f0f0' },
      legend: { enabled: true },
      tooltip: {
        shared: true,
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>R {point.y:,.0f}</b><br/>'
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          pointWidth: 22,
          groupPadding: 0.08,
          pointPadding: 0.1,
          dataLabels: {
            enabled: true,
            formatter: function () {
              const y = (this as any).y || 0;
              return y >= 1000 ? `R ${Highcharts.numberFormat(y, 0)}` : '';
            }
          }
          // stacking: 'normal', // uncomment if you prefer stacked columns
        }
      },
      series: expJson.series.map(s => ({ type: 'column', name: s.name, data: s.data })),
    },
  };

  // ----- Profit gauge from monthly IS (unchanged) -----
  const latest = isJson.points[isJson.points.length - 1] || { revenue: 0, profit: 0 };
  const marginPct = latest.revenue ? Math.round((100 * latest.profit) / latest.revenue) : 0;
  const profitGauge: ChartData = {
    id: 'kpi-profit-gauge',
    title: 'Profit Margin (Latest Month)',
    config: {
      chart: { type: 'solidgauge' },
      title: { text: 'Profit Margin' },
      pane: { startAngle: -90, endAngle: 90, background: null } as any,
      yAxis: { min: -50, max: 70, tickPositions: [-50, -25, 0, 25, 50, 70] } as any,
      tooltip: { enabled: false },
      series: [{
        type: 'solidgauge',
        data: [marginPct],
        dataLabels: { useHTML: true, format: '<div style="text-align:center"><span style="font-size:22px">{y}%</span></div>' },
      } as any],
    },
  };

  // ----- Forecast charts (unchanged from your version) -----
  const forecastProfitPoints = forecastProfitJson.forecast || [];
  const forecastProfitCats = forecastProfitPoints.map((p: any) => p.period);
  const forecastProfitTrend: ChartData = {
    id: 'forecast-profit-trend-prophet',
    title: `Profit Forecast (Prophet)`,
    config: {
      title: { text: `Profit Forecast (Prophet)` },
      subtitle: { text: `Based on data from ${forecastProfitJson.from} to ${forecastProfitJson.to}` },
      xAxis: { categories: forecastProfitCats },
      yAxis: { title: { text: 'Profit (ZAR)' } },
      series: [
        { type: 'arearange', name: 'Profit Forecast Range', data: forecastProfitPoints.map((p: any) => [p.profit_lo, p.profit_hi]) as any, color: Highcharts.getOptions().colors?.[3], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', zIndex: 0 },
        { type: 'line', name: 'Profit Forecast', data: forecastProfitPoints.map((p: any) => p.profit_pred), color: Highcharts.getOptions().colors?.[3], zIndex: 1 },
      ],
    },
  };

  const forecastRevenuePoints = (forecastRevenueJson.forecast || []) as ProphetRevenuePoint[];
  const forecastRevenueCats = forecastRevenuePoints.map(p => p.period);
  const forecastRevenueTrend: ChartData = {
    id: 'forecast-revenue-trend-prophet',
    title: `Revenue Forecast (Prophet)`,
    config: {
      title: { text: `Revenue Forecast (Prophet)` },
      subtitle: { text: `Based on data from ${forecastRevenueJson.from} to ${forecastRevenueJson.to}` },
      xAxis: { categories: forecastRevenueCats },
      yAxis: { title: { text: 'Revenue (ZAR)' } },
      series: [
        { type: 'arearange', name: 'Revenue Forecast Range', data: forecastRevenuePoints.map(p => [p.revenue_lo, p.revenue_hi]) as any, color: Highcharts.getOptions().colors?.[4], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', zIndex: 0 },
        { type: 'line', name: 'Revenue Forecast', data: forecastRevenuePoints.map(p => p.revenue_pred), color: Highcharts.getOptions().colors?.[4], zIndex: 1 },
      ],
    },
  };

  const forecastExpensesPoints = (forecastExpensesJson.forecast || []) as ProphetExpensesPoint[];
  const forecastExpensesCats = forecastExpensesPoints.map(p => p.period);
  const forecastExpensesTrend: ChartData = {
    id: 'forecast-expenses-trend-prophet',
    title: `Expenses Forecast (Prophet)`,
    config: {
      title: { text: `Expenses Forecast (Prophet)` },
      subtitle: { text: `Based on data from ${forecastExpensesJson.from} to ${forecastExpensesJson.to}` },
      xAxis: { categories: forecastExpensesCats },
      yAxis: { title: { text: 'Expenses (ZAR)' } },
      series: [
        { type: 'arearange', name: 'Expenses Forecast Range', data: forecastExpensesPoints.map(p => [p.expenses_lo, p.expenses_hi]) as any, color: Highcharts.getOptions().colors?.[5], fillOpacity: 0.3, lineWidth: 0, linkedTo: ':previous', zIndex: 0 },
        { type: 'line', name: 'Expenses Forecast', data: forecastExpensesPoints.map(p => p.expenses_pred), color: Highcharts.getOptions().colors?.[5], zIndex: 1 }
      ],
    },
  };

  setCharts([
    incomeWaterfall,       // ⟵ now driven by /reports/income-statement
    expTrend,
    profitGauge,
    forecastProfitTrend,
    forecastRevenueTrend,
    forecastExpensesTrend,
  ]);
}, [headers, API]);


  // ---------- Products (declared before fetchData to avoid TDZ) ----------
  const fetchProducts = useCallback(async () => {
    const [lowStockRes, profitRes, deadRes] = await Promise.all([
      fetch(`${API}/api/analytics/products/low-stock?threshold=10&limit=30`, { headers }),
      fetch(`${API}/api/analytics/products/profitability?sort=profit&limit=60`, { headers }),
      fetch(`${API}/api/analytics/products/dead-stock?days=90&limit=40`, { headers }),
    ]);
    ensureOk(lowStockRes, 'products/low-stock');
    ensureOk(profitRes, 'products/profitability');
    ensureOk(deadRes, 'products/dead-stock');

    const lowJson = await lowStockRes.json();
    const profJson = await profitRes.json();
    const deadJson = await deadRes.json();

    const lowStock: ChartData = {
      id: 'prod-low-stock',
      title: 'Low Stock (<= threshold)',
      config: {
        title: { text: 'Low Stock' },
        xAxis: { categories: lowJson.items.map((x:any)=>x.product_name) },
        yAxis: { title: { text: 'Units in stock' } },
        series: [{ type: 'column', name: 'Stock', data: lowJson.items.map((x:any)=>Number(x.stock_quantity||0)) }],
        tooltip: { pointFormat: 'Stock: <b>{point.y}</b>' },
      },
    };

    const scatterData = profJson.items.map((p:any)=>({
      name: p.product_name,
      x: Number(p.units||0),
      y: Number(p.profit||0),
      margin: Number(p.margin_pct||0),
      revenue: Number(p.revenue||0),
    }));
    const profitScatter: ChartData = {
      id: 'prod-profit-scatter',
      title: 'Profitability by Product',
      config: {
        chart: { type: 'scatter' },
        title: { text: 'Profit vs Units (hover labels)' },
        xAxis: { title: { text: 'Units sold' } },
        yAxis: { title: { text: 'Profit (R)' } },
        tooltip: {
          pointFormatter: function() {
            // @ts-ignore
            return `<b>${this.name}</b><br/>Units: ${this.x}<br/>Profit: R ${this.y.toLocaleString('en-ZA')}<br/>Margin: ${this.options.margin}%<br/>Revenue: R ${this.options.revenue.toLocaleString('en-ZA')}`;
          }
        },
        series: [{ type: 'scatter', name: 'Products', data: scatterData as any }],
      },
    };

    const deadStock: ChartData = {
      id: 'prod-dead-stock',
      title: `Dead/Slow Stock (no sales in last ${deadJson.days} days)`,
      config: {
        title: { text: 'Dead / Slow Stock' },
        xAxis: { categories: deadJson.items.map((x:any)=>x.product_name), labels: { rotation: -30 } },
        yAxis: { title: { text: 'Days since last sale' } },
        series: [{ type: 'column', name: 'Days', data: deadJson.items.map((x:any)=>Number(x.days_since_last||0)) }],
        tooltip: { pointFormat: 'Days: <b>{point.y}</b>' },
      },
    };

    setCharts([lowStock, profitScatter, deadStock]);
  }, [headers]);

  // ---------- Customers ----------
  const fetchCustomers = useCallback(async () => {
    const [clvRes, overdueRes, churnRes, clusterRes] = await Promise.all([
      fetch(`${API}/api/analytics/customers/top-clv?limit=12`, { headers }),
      fetch(`${API}/api/charts/customers/overdue-top?limit=20`, { headers }),
      fetch(`${API}/api/analytics/customers/churn?months=3`, { headers }),
      fetch(`${API}/api/customers/cluster-data`, { headers }),
    ]);

    ensureOk(clvRes, 'customers/top-clv');
    ensureOk(overdueRes, 'customers/overdue-top');
    ensureOk(churnRes, 'customers/churn');
    ensureOk(clusterRes, 'customers/cluster-data');

    const clvJson: { items: ClvItem[] } = await clvRes.json();
    const overdueJson: { series: OverduePoint[] } = await overdueRes.json();
    const churnJson: { items: ChurnItem[]; months: number } = await churnRes.json();
    const clusterData: CustomerClusterData[] = await clusterRes.json();

    // Charts (keep as before)
    const clvTop = (clvJson.items || []).slice(0, 10);
    const rest = (clvJson.items || []).slice(10).reduce((a, b) => a + (b.clv || 0), 0);
    const clvDonut: ChartData = {
      id: 'cust-clv-donut',
      title: 'Share of Lifetime Value (Top 10 + Others)',
      config: {
        title: { text: 'Customer CLV Share' },
        tooltip: { pointFormat: 'R <b>{point.y:,.2f}</b> ({point.percentage:.1f}%)' },
        plotOptions: { pie: { innerSize: '60%', dataLabels: { enabled: true, format: '{point.name}: {point.percentage:.1f}%'} } },
        series: [{
          type: 'pie',
          name: 'CLV',
          data: [
            ...clvTop.map(x => ({ name: x.customer_name, y: Number(x.clv || 0) })),
            ...(rest > 0 ? [{ name: 'Others', y: Number(rest) }] : []),
          ],
        }],
      },
    };

    const od = (overdueJson.series || []).filter(p => (p.y || 0) > 0);
    const overdueBubbles: ChartData = {
      id: 'cust-overdue-bubbles',
      title: 'Overdue Balances (Bubble size = amount)',
      config: {
        chart: { type: 'bubble' },
        title: { text: 'Overdue Customers' },
        xAxis: { title: { text: 'Rank (by overdue)' }, categories: od.map((_, i) => String(i + 1)) },
        yAxis: { title: { text: 'Overdue (ZAR)' } },
        tooltip: {
          useHTML: true,
          pointFormatter: function () {
            // @ts-ignore
            return `<b>${this.name}</b><br/>Overdue: R ${Number(this.z || this.y).toLocaleString('en-ZA')}`;
          },
        },
        plotOptions: { bubble: { minSize: 8, maxSize: 60, dataLabels: { enabled: true, format: '{point.name}' } } },
        series: [{
          type: 'bubble',
          name: 'Overdue',
          data: od.map((p, idx) => ({ x: idx + 1, y: Number(p.y || 0), z: Number(p.y || 0), name: p.name })),
        }],
      },
    };

    const churnItems = churnJson.items || [];
    const buckets: Record<string, number> = { 'Never': 0, '0–30': 0, '31–60': 0, '61–90': 0, '> 90': 0 };
    churnItems.forEach(c => {
      if (c.days_since_last === null) { buckets['Never'] += 1; return; }
      const d = Number(c.days_since_last);
      if (d <= 30) buckets['0–30'] += 1;
      else if (d <= 60) buckets['31–60'] += 1;
      else if (d <= 90) buckets['61–90'] += 1;
      else buckets['> 90'] += 1;
    });
    const churnBuckets: ChartData = {
      id: 'cust-churn-buckets',
      title: `Churn Watch — Inactive by Days Since Last Purchase (>${churnJson.months} months)`,
      config: {
        chart: { type: 'column' },
        title: { text: 'Churn Buckets' },
        xAxis: { categories: Object.keys(buckets), title: { text: 'Inactivity bucket' } },
        yAxis: { title: { text: 'Customers (count)' }, allowDecimals: false },
        tooltip: { pointFormat: '<b>{point.y}</b> customers' },
        series: [{ type: 'column', name: 'Customers', data: Object.values(buckets) }],
      },
    };

    setCharts([clvDonut, overdueBubbles, churnBuckets]);

    // KPIs
    const atRiskCount = churnItems.filter(x => x.is_churn_risk).length;
    const days = churnItems
      .map(x => x.days_since_last)
      .filter((n): n is number => Number.isFinite(n as number))
      .sort((a, b) => (a as number) - (b as number)) as number[];
    const mid = Math.floor(days.length / 2);
    const median = days.length ? (days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2) : 0;
    const totalOverdueTop = od.reduce((a, b) => a + (Number(b.y) || 0), 0);
    setKpi(prev => ({
      ...prev,
      customers: {
        at_risk_count: atRiskCount,
        median_days_since_last: Math.round(median),
        total_overdue_top: Math.round(totalOverdueTop),
      },
    }));

    // Quick lists
    const churnRiskCustomers: ChurnRiskItem[] = churnItems.filter(item => item.is_churn_risk);
    const churnRiskSoon = [...churnRiskCustomers].sort(
      (a, b) => (a.days_since_last ?? Number.MAX_SAFE_INTEGER) - (b.days_since_last ?? Number.MAX_SAFE_INTEGER)
    ).slice(0, 5);

    const longTermInactive = churnItems
      .filter(item => item.is_churn_risk && item.days_since_last !== null)
      .sort((a, b) => (b.days_since_last ?? 0) - (a.days_since_last ?? 0))
      .slice(0, 5);

    setCustomerDetails({ clusterData, churnRiskSoon, longTermInactive });
  }, [headers]);

  // ------------------------ FETCHER multiplexer ------------------------
  const fetchData = useCallback(async () => {
    if (!token) {
      setCharts([]);
      setLoading(false);
      setErr('Please log in to view analytics.');
      setCustomerDetails(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setCustomerDetails(null);

    try {
      if (dashKey === 'sales')       await fetchSales();
      else if (dashKey === 'finance')   await fetchFinance();
      else if (dashKey === 'customers') await fetchCustomers();
      else if (dashKey === 'products')  await fetchProducts();
      else setCharts([]);
    } catch (e: any) {
      console.error('AnalyticsDashboard error:', e);
      setErr(e?.message || 'Failed to load analytics.');
      setCharts([]);
      setCustomerDetails(null);
    } finally {
      setLoading(false);
    }
  }, [dashKey, token, fetchSales, fetchFinance, fetchCustomers, fetchProducts]);

  useEffect(() => {
    if (!dashKey || !DASHBOARDS[dashKey]) {
      navigate('/analytics');
      return;
    }
    if (isAuthenticated && token) {
      void fetchData();
    } else {
      setCharts([]);
      setLoading(false);
      setErr('Please log in to view analytics.');
      setCustomerDetails(null);
    }
  }, [dashKey, isAuthenticated, token, fetchData, navigate]);

  if (!dashKey || !DASHBOARDS[dashKey]) return null;
  const cfg = DASHBOARDS[dashKey];

  // ------------------------ KPI STRIPS ------------------------
  const SalesKPIs = () => (
    <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={
              <Space>
                Average Order Value
                <Tooltip title="Average order value for the current range">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
            value={kpi.sales.aov}
            precision={2}
            prefix="R "
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic title="Orders" value={kpi.sales.new_orders} suffix={<span style={{ opacity: 0.7 }}> total</span>} />
          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12 }}>
            Returning: {kpi.sales.returning_orders} · Anonymous: {kpi.sales.anonymous_orders}
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic title="Credit Mix" value={kpi.sales.credit_ratio_pct} suffix="%" />
          <div style={{ marginTop: 10 }}>
            <Progress percent={kpi.sales.credit_ratio_pct} size="small" />
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
              Latest mix shown in chart →
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic title="Latest Profit Margin" value={kpi.sales.latest_profit_pct} suffix="%" />
        </Card>
      </Col>
    </Row>
  );

  const CustomersKPIs = () => (
    <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
      <Col xs={24} sm={12} md={8}>
        <Card><Statistic title="Customers at Risk (churn)" value={kpi.customers.at_risk_count} /></Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card><Statistic title="Median Days Since Last Purchase" value={kpi.customers.median_days_since_last} /></Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card><Statistic title="Sum of Top Overdue (R)" value={kpi.customers.total_overdue_top} precision={0} /></Card>
      </Col>
    </Row>
  );

  const renderKPIs = () => {
    switch (dashKey) {
      case 'sales': return <SalesKPIs />;
      case 'customers': return <CustomersKPIs />;
      default: return null;
    }
  };

  // ---------- Customers: cluster + table + drawers ----------
  const deriveCluster = (c: CustomerClusterData): string => {
    // Simple rule-based clustering (client-side, non-destructive)
    const highAOV = c.averageOrderValue >= 1000;
    const highRevenue = c.totalInvoiced >= 20000;
    const frequent = c.numberOfPurchases >= 5;

    if (highRevenue && frequent) return 'High Value';
    if (frequent && !highRevenue) return 'Loyal';
    if (c.numberOfPurchases === 0) return 'New';
    if (c.numberOfPurchases <= 2 && c.totalInvoiced < 3000) return 'Dormant';
    return 'At Risk';
  };

  const clusterTagColor: Record<string, string> = {
    'High Value': 'green',
    'Loyal': 'blue',
    'At Risk': 'volcano',
    'New': 'purple',
    'Dormant': 'gold',
  };

  const filteredClusterData = useMemo(() => {
    const cd = customerDetails?.clusterData || [];
    const bySearch = searchText.trim()
      ? cd.filter(c =>
          [c.name, c.email, c.phone, c.address].some(v => (v || '').toLowerCase().includes(searchText.toLowerCase()))
        )
      : cd;

    const byCluster = clusterFilter
      ? bySearch.filter(c => deriveCluster(c) === clusterFilter)
      : bySearch;

    return byCluster;
  }, [customerDetails, searchText, clusterFilter]);

  const openHistory = async (row: CustomerClusterData) => {
    setHistoryFor(row);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/api/customers/${row.id}/purchase-history`, { headers });
      ensureOk(res, 'customers/:id/purchase-history');
      const json: PurchaseSale[] = await res.json();
      setHistoryData(json);
    } catch (e) {
      console.error(e);
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const customerColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: CustomerClusterData, b: CustomerClusterData) => a.name.localeCompare(b.name),
      render: (val: string, row: CustomerClusterData) => (
        <Space direction="vertical" size={0}>
          <Text strong>{val}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.email || '—'}</Text>
        </Space>
      ),
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    {
      title: 'Purchases',
      dataIndex: 'numberOfPurchases',
      key: 'numberOfPurchases',
      sorter: (a: CustomerClusterData, b: CustomerClusterData) => a.numberOfPurchases - b.numberOfPurchases,
      align: 'right' as const,
    },
    {
      title: 'AOV (R)',
      dataIndex: 'averageOrderValue',
      key: 'averageOrderValue',
      sorter: (a: CustomerClusterData, b: CustomerClusterData) => a.averageOrderValue - b.averageOrderValue,
      render: (v: number) => (v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      align: 'right' as const,
    },
    {
      title: 'Total Invoiced (R)',
      dataIndex: 'totalInvoiced',
      key: 'totalInvoiced',
      sorter: (a: CustomerClusterData, b: CustomerClusterData) => a.totalInvoiced - b.totalInvoiced,
      render: (v: number) => (v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      align: 'right' as const,
    },
    {
      title: 'Cluster',
      key: 'cluster',
      render: (_: any, row: CustomerClusterData) => {
        const label = deriveCluster(row);
        return <Tag color={clusterTagColor[label] || 'default'}>{label}</Tag>;
      },
      filters: [
        { text: 'High Value', value: 'High Value' },
        { text: 'Loyal', value: 'Loyal' },
        { text: 'At Risk', value: 'At Risk' },
        { text: 'New', value: 'New' },
        { text: 'Dormant', value: 'Dormant' },
      ],
      onFilter: (val: any, row: CustomerClusterData) => deriveCluster(row) === val,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, row: CustomerClusterData) => (
        <Button size="small" onClick={() => openHistory(row)}>View History</Button>
      ),
    },
  ];

  const CustomerQuickTable = ({
    title,
    icon,
    rows,
  }: {
    title: string;
    icon?: React.ReactNode;
    rows: { name: string; last?: string; days?: number | null }[];
  }) => (
    <Card title={<Space>{icon}{title}</Space>} size="small">
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No customers" />
      ) : (
        <Table
          dataSource={rows.map((r, i) => ({ key: i, ...r }))}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Last Purchase', dataIndex: 'last' },
            { title: 'Days Since', dataIndex: 'days', align: 'right' as const },
          ]}
          size="small"
          pagination={false}
        />
      )}
    </Card>
  );

  const renderCustomerSection = () => {
    if (dashKey !== 'customers') return null;

    const churnSoonRows =
      customerDetails?.churnRiskSoon.map(c => ({
        name: c.customer_name,
        last: c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleDateString() : 'Never',
        days: c.days_since_last ?? null,
      })) || [];

    const longInactiveRows =
      customerDetails?.longTermInactive.map(c => ({
        name: c.customer_name,
        last: c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleDateString() : 'Never',
        days: c.days_since_last ?? null,
      })) || [];

    return (
      <>
        <Card className="mb-4" title="Customers">
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <Input
                prefix={<SearchOutlined />}
                placeholder="Search name, email, phone, address…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} md={12}>
              <Space>
                <span>Cluster:</span>
                <Select
                  style={{ minWidth: 180 }}
                  allowClear
                  placeholder="All"
                  options={[
                    { label: 'High Value', value: 'High Value' },
                    { label: 'Loyal', value: 'Loyal' },
                    { label: 'At Risk', value: 'At Risk' },
                    { label: 'New', value: 'New' },
                    { label: 'Dormant', value: 'Dormant' },
                  ]}
                  value={clusterFilter}
                  onChange={setClusterFilter}
                />
              </Space>
            </Col>
          </Row>

          <Table<CustomerClusterData>
            rowKey="id"
            dataSource={filteredClusterData}
            columns={customerColumns as any}
            pagination={{ pageSize: 10, showSizeChanger: true }}
          />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <CustomerQuickTable
              title="About to Churn"
              icon={<AlertTriangle size={18} className="text-yellow-500" />}
              rows={churnSoonRows}
            />
          </Col>
          <Col xs={24} md={12}>
            <CustomerQuickTable
              title="Long-Term Inactive"
              rows={longInactiveRows}
            />
          </Col>
        </Row>

        <Drawer
          title={historyFor ? `Purchase History — ${historyFor.name}` : 'Purchase History'}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          width={720}
        >
          {historyLoading ? (
            <Spin />
          ) : !historyData || historyData.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No purchases found" />
          ) : (
            historyData.map((sale) => (
              <Card key={sale.id} className="mb-3" title={`Sale #${sale.id}`}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Date">{sale.saleDate ? new Date(sale.saleDate).toLocaleString() : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Payment Type">{sale.paymentType || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Total Amount">R {sale.totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</Descriptions.Item>
                  {sale.creditAmount != null && <Descriptions.Item label="Credit Amount">R {sale.creditAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</Descriptions.Item>}
                  {sale.remainingCreditAmount != null && <Descriptions.Item label="Remaining Credit">R {sale.remainingCreditAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</Descriptions.Item>}
                  {sale.dueDate && <Descriptions.Item label="Due Date">{sale.dueDate}</Descriptions.Item>}
                </Descriptions>

                <Table
                  size="small"
                  pagination={false}
                  dataSource={sale.items.map((it, i) => ({ key: i, ...it }))}
                  columns={[
                    { title: 'Product', dataIndex: 'productName' },
                    { title: 'Qty', dataIndex: 'quantity', align: 'right' as const },
                    { title: 'Unit Price (R)', dataIndex: 'unitPriceAtSale', align: 'right' as const,
                      render: (v: number) => (v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 }) },
                    { title: 'Subtotal (R)', dataIndex: 'subtotal', align: 'right' as const,
                      render: (v: number) => (v ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 }) },
                  ]}
                />
              </Card>
            ))
          )}
        </Drawer>
      </>
    );
  };

  // ------------------------ RENDER ------------------------
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title={`${cfg.label} Dashboard`} />
      <Space style={{ marginBottom: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/analytics')}>
          Back to Dashboards
        </Button>
        <Tag color={cfg.color}>{cfg.label}</Tag>
      </Space>

      {loading && (
        <Spin tip="Loading…" size="large">
          <div style={{ height: 120 }} />
        </Spin>
      )}

      {err && !loading && (
        <Alert
          message="Error Loading Charts"
          description={err}
          type="error"
          showIcon
          action={<Button size="small" danger onClick={fetchData}>Retry</Button>}
          style={{ marginBottom: 20 }}
        />
      )}

      {!loading && !err && (
        <>
          {renderKPIs()}

          {charts.length ? (
            charts
              .filter((c) => DASHBOARDS[dashKey].chartIds.includes(c.id))
              .map((chart) => (
                <Card key={chart.id} title={chart.title} className="w-full shadow-lg rounded-2xl bg-white dark:bg-gray-800">
                  {chart.error ? (
                    <Alert message="Chart Error" description={chart.error} type="warning" showIcon />
                  ) : (
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={chart.config}
                      containerProps={{ style: { height: '100%', width: '100%' } }}
                    />
                  )}
                </Card>
              ))
          ) : (
            <Alert type="info" showIcon message="No charts" description="This dashboard has no charts." />
          )}

          {/* Customers extras (table + drawers) */}
          {renderCustomerSection()}
        </>
      )}
    </div>
  );
}
