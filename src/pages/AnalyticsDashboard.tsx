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
} from 'antd';
import Highcharts from '@/lib/initHighcharts';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthPage';

// dashboards map — make sure Sales has the 7 new chartIds listed in my note above
import { DASHBOARDS } from './_dashboards';

// ---------- light types ----------
type DashboardKey = keyof typeof DASHBOARDS;

type PaymentSlice = { name: string; y: number };

interface SalesTrendPoint { period: string; orders: number; revenue: number }
interface AOVPoint { period: string; aov: number }
interface TopProduct { name: string; revenue: number }
interface FunnelStage { name: string; count: number }
interface DailySalesDataPoint { date: string; total_sales_amount: number }

interface ChartData {
  id: string;
  title: string;
  config: Options;
  error?: string | null;
}

// ---------- API base ----------
const API = 'https://quantnow-cu1v.onrender.com';

export default function AnalyticsDashboard() {
  const { dashKey } = useParams<{ dashKey: DashboardKey }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
    finance: {
      total_rev: 0,
      total_exp: 0,
      net_profit: 0,
      latest_profit_pct: 0,
    },
    customers: {
      total_customers: 0,
      top_bucket_name: '',
      top_bucket_count: 0,
    },
    products: {
      low_stock_count: 0,
      top_product_name: '',
      top_product_revenue: 0,
    },
  });

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const ensureOk = (r: Response, name: string) => {
    if (!r.ok) throw new Error(`Failed to fetch ${name}`);
  };

  // ------------------------ FETCHERS (Sales) ------------------------
  const fetchSales = useCallback(async () => {
    // endpoints proposed earlier (and compatible with what you already have)
    const [
      salesTrendRes,
      aovRes,
      mixRes,
      paretoRes,
      heatmapRes,
      funnelRes,
      histoRes,

      // optional for latest profit gauge
      revenueTrendRes,
    ] = await Promise.all([
      fetch(`${API}/api/charts/sales-trend`, { headers }),
      fetch(`${API}/api/charts/aov-trend`, { headers }),
      fetch(`${API}/api/charts/payment-mix`, { headers }),
      fetch(`${API}/api/charts/top-products-pareto?limit=20`, { headers }),
      fetch(`${API}/api/charts/daily-sales-aggregation`, { headers }),
      fetch(`${API}/api/charts/sales-funnel`, { headers }),
      fetch(`${API}/api/charts/order-values-histogram`, { headers }),

      // optional existing one from your backend
      fetch(`${API}/api/charts/revenue-trend`, { headers }),
    ]);

    ensureOk(salesTrendRes, 'sales-trend');
    ensureOk(aovRes, 'aov-trend');
    ensureOk(mixRes, 'payment-mix');
    ensureOk(paretoRes, 'top-products-pareto');
    ensureOk(heatmapRes, 'daily-sales-aggregation');
    ensureOk(funnelRes, 'sales-funnel');
    ensureOk(histoRes, 'order-values-histogram');
    // optional
    if (revenueTrendRes.status !== 200) {
      // ignore; not all stacks have profit in revenue-trend
    }

    const salesTrendJson: { points: SalesTrendPoint[] } = await salesTrendRes.json();
    const aovJson: { points: AOVPoint[] } = await aovRes.json();
    const mixJson: { mix: PaymentSlice[] } = await mixRes.json();
    const paretoJson: { products: TopProduct[] } = await paretoRes.json();
    const heatmapJson: DailySalesDataPoint[] = await heatmapRes.json();
    const funnelJson: { stages: FunnelStage[] } = await funnelRes.json();
    const histogramJson: { values: number[] } = await histoRes.json();
    const revenueTrendJson: any[] = revenueTrendRes.ok ? await revenueTrendRes.json() : [];

    const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

    // ~~~ Charts ~~~

    // 1) Sales Trend (column orders + line revenue)
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
        yAxis: [
          { title: { text: 'Orders' } },
          { title: { text: 'Revenue (ZAR)' }, opposite: true },
        ],
        tooltip: { shared: true },
        series: [
          { type: 'column', name: 'Orders', data: sOrders },
          { type: 'line', name: 'Revenue', yAxis: 1, data: sRevenue },
        ],
      },
    };

    // 2) AOV Trend (line)
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

    // 3) Payment Mix (donut)
    const pmix = (mixJson.mix || []).filter(Boolean);
    const paymentMix: ChartData = {
      id: 'payment-mix',
      title: 'Payment Mix',
      config: {
        title: { text: 'Payment Mix' },
        plotOptions: {
          pie: {
            innerSize: '60%',
            dataLabels: { enabled: true, format: '{point.name}: {point.percentage:.1f}%' },
          },
        },
        series: [
          {
            type: 'pie',
            name: 'Amount',
            data: pmix.map((m) => [m.name || m.type, Number(m.y ?? m.amount ?? 0)]) as any,
          },
        ],
      },
    };

    // 4) Top Products (Pareto)
    const topProducts = (paretoJson.products || []).filter(Boolean);
    const pCats = topProducts.map((p) => p.name);
    const pVals = topProducts.map((p) => Number(p.revenue || 0));
    const topProductsPareto: ChartData = {
      id: 'top-products-pareto',
      title: 'Top Products (Pareto)',
      config: {
        title: { text: 'Top Products (Pareto)' },
        xAxis: { categories: pCats },
        yAxis: [
          { title: { text: 'Revenue (ZAR)' } },
          { title: { text: 'Cumulative %' }, max: 100, opposite: true },
        ],
        series: [
          { type: 'column', name: 'Revenue', data: pVals },
          { type: 'pareto', name: 'Cumulative %', yAxis: 1, baseSeries: 0 },
        ],
        tooltip: { shared: true },
      },
    };

    // 5) Daily Sales Heatmap (calendar style)
    const ds = heatmapJson || [];
    const dates = ds.map((d) => new Date(d.date));
    let heatConfig: ChartData;
    if (dates.length) {
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      const startCal = new Date(minDate);
      startCal.setDate(minDate.getDate() - minDate.getDay() + 1);
      const endCal = new Date(maxDate);
      endCal.setDate(maxDate.getDate() + (7 - maxDate.getDay()));

      const salesMap: Record<string, number> = {};
      ds.forEach((item) => (salesMap[item.date] = item.total_sales_amount));

      const heatCells: [number, number, number][] = [];
      const xCats: string[] = [];
      const yCats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weeks: number[] = [];

      const iter = new Date(startCal);
      let weekIdx = -1;
      while (iter <= endCal) {
        if (iter.getDay() === 1) {
          weekIdx += 1;
          weeks.push(weekIdx);
        }
        const dayOfWeek = iter.getDay();
        const yIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const key = iter.toISOString().slice(0, 10);
        const val = Number(salesMap[key] || 0);
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
          legend: {
            enabled: true,
            align: 'right',
            layout: 'vertical',
            verticalAlign: 'top',
            y: 25,
            symbolHeight: 200,
          },
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
    } else {
      heatConfig = {
        id: 'calendar-heatmap-sales',
        title: 'Daily Sales Amount',
        config: { title: { text: 'Daily Sales Amount' }, subtitle: { text: 'No data' }, series: [] },
        error: 'No daily sales data available.',
      };
    }

    // 6) Sales Funnel
    const stages = (funnelJson.stages || []).filter(Boolean);
    const salesFunnel: ChartData = {
      id: 'sales-funnel',
      title: 'Sales Funnel',
      config: {
        title: { text: 'Sales Funnel' },
        series: [{ type: 'funnel', name: 'Count', data: stages.map((s) => [s.name, s.count]) as any }],
      },
    };

    // 7) Order Value Distribution (histogram)
    const values = (histogramJson.values || []).map(Number);
    const orderHistogram: ChartData = {
      id: 'order-values-histogram',
      title: 'Order Value Distribution',
      config: {
        title: { text: 'Order Value Distribution' },
        series: [
          { type: 'histogram', baseSeries: 'orders', binWidth: undefined },
          { id: 'orders', type: 'scatter', data: values, visible: false },
        ],
        xAxis: [{ title: { text: 'Order Value (ZAR)' } }],
        yAxis: [{ title: { text: 'Frequency' } }],
      },
    };

    // Optionally compute latest profit % from revenue-trend if it has profit
    let latestProfitPct = 0;
    if (Array.isArray(revenueTrendJson) && revenueTrendJson.length) {
      const last = revenueTrendJson[revenueTrendJson.length - 1];
      const rev = Number(last?.revenue || 0);
      const prof = Number(last?.profit || 0);
      latestProfitPct = rev ? Math.round((100 * prof) / rev) : 0;
    }

    // Push only charts the Sales dashboard expects (order matches your card layout)
    const salesCharts: ChartData[] = [
      salesTrend,
      aovTrend,
      paymentMix,
      topProductsPareto,
      heatConfig,
      salesFunnel,
      orderHistogram,
    ];

    setCharts(salesCharts);

    // --- KPIs ---
    const totalPayments = sum(pmix.map((p) => Number(p.y ?? p.amount ?? 0)));
    const credit = pmix.find((p) => (p.name || '').toLowerCase() === 'credit');
    const creditPct = totalPayments ? Math.round((100 * Number(credit?.y ?? credit?.amount ?? 0)) / totalPayments) : 0;

    const totalOrders = sum(sOrders);
    const totalRevenue = sum(sRevenue);
    const overallAOV = totalOrders ? totalRevenue / totalOrders : 0;

    setKpi((prev) => ({
      ...prev,
      sales: {
        ...prev.sales,
        aov: Number(overallAOV.toFixed(2)),
        returning_orders: 0, // fill if you add endpoint
        new_orders: totalOrders, // naive stand-in; replace with your repeat/new split
        anonymous_orders: 0, // fill if you add endpoint
        payment_ratio: pmix,
        credit_ratio_pct: creditPct,
        latest_profit_pct: latestProfitPct,
      },
      finance: { ...prev.finance, latest_profit_pct: latestProfitPct },
    }));
  }, [headers]);

  // ------------------------ FETCHERS (Other dashboards) ------------------------
  // You can extend these if you want Finance/Customers/Products charts here too.
  const fetchOther = useCallback(async () => {
    // Example: keep your existing finance charts if you want
    // For brevity, we only render Sales charts in this file.
    setCharts([]);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) {
      setCharts([]);
      setLoading(false);
      setErr('Please log in to view analytics.');
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      if (dashKey === 'sales') {
        await fetchSales();
      } else {
        await fetchOther();
      }
    } catch (e: any) {
      console.error('AnalyticsDashboard error:', e);
      setErr(e?.message || 'Failed to load analytics.');
      setCharts([]);
    } finally {
      setLoading(false);
    }
  }, [dashKey, token, fetchSales, fetchOther]);

  useEffect(() => {
    if (!dashKey || !DASHBOARDS[dashKey]) {
      navigate('/analytics');
      return;
    }
    if (isAuthenticated && token) fetchData();
    else {
      setCharts([]);
      setLoading(false);
      setErr('Please log in to view analytics.');
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
          <Statistic
            title="Orders"
            value={kpi.sales.new_orders}
            suffix={<span style={{ opacity: 0.7 }}> total</span>}
          />
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
              {kpi.sales.payment_ratio
                .map((p) => `${p.name}: R ${Number(p.y || 0).toLocaleString('en-ZA')}`)
                .join(' · ')}
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

  const renderKPIs = () => {
    switch (dashKey) {
      case 'sales':
        return <SalesKPIs />;
      default:
        return null; // extend for finance/customers/products if you add those charts here
    }
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
          action={
            <Button size="small" danger onClick={fetchData}>
              Retry
            </Button>
          }
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
                <Card
                  key={chart.id}
                  title={chart.title}
                  className="w-full shadow-lg rounded-2xl bg-white dark:bg-gray-800"
                >
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
        </>
      )}
    </div>
  );
}
