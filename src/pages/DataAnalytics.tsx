import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { ChartGrid } from '@/components/analytics/ChartGrid';
import { ChartModal } from '@/components/analytics/ChartModal';
import { motion } from 'framer-motion';
import { useAuth } from '../AuthPage';
import Highcharts from '../lib/initHighcharts'; // ← use the pre‑initialized instance
import type { Options } from 'highcharts';
import { Spin, Alert, Button } from 'antd';

export interface ChartData {
  id: string;
  title: string;
  type:
    | 'sankey'
    | 'dependencywheel'
    | 'networkgraph'
    | 'sunburst'
    | 'packedbubble'
    | 'variwide'
    | 'streamgraph'
    | 'solidgauge';
  data: (string | number)[][];
  config: Options;
  isLoading: boolean;
  error: string | null;
}

const API = 'https://quantnow-cu1v.onrender.com';

const DataAnalytics = () => {
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allChartData, setAllChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const sum = (arr: any[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

  const fetchChartData = useCallback(async () => {
    if (!token) {
      setAllChartData([]);
      setLoading(false);
      setError('Authentication required. Please log in.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const [
        revenueTrendRes,
        transactionVolumeRes,
        customerLTVRes,
        productStockRes,
        transactionBreakdownRes,
        payrollDistributionRes,
        topSellingProductsRes,
      ] = await Promise.all([
        fetch(`${API}/api/charts/revenue-trend`, { headers }),
        fetch(`${API}/api/charts/transaction-volume`, { headers }),
        fetch(`${API}/api/charts/customer-lifetime-value`, { headers }),
        fetch(`${API}/api/charts/product-stock-levels`, { headers }),
        fetch(`${API}/api/charts/transaction-type-breakdown`, { headers }),
        fetch(`${API}/api/charts/payroll-distribution`, { headers }),
        fetch(`${API}/api/charts/top-selling-products`, { headers }),
      ]);

      const ensureOk = (r: Response, name: string) => {
        if (!r.ok) throw new Error(`Failed to fetch ${name}`);
      };
      ensureOk(revenueTrendRes, 'revenue trend');
      ensureOk(transactionVolumeRes, 'transaction volume');
      ensureOk(customerLTVRes, 'customer lifetime value');
      ensureOk(productStockRes, 'product stock levels');
      ensureOk(transactionBreakdownRes, 'transaction type breakdown');
      ensureOk(payrollDistributionRes, 'payroll distribution');
      ensureOk(topSellingProductsRes, 'top-selling products');

      const revenueTrend = await revenueTrendRes.json();            // [{month, revenue, expenses, profit}]
      const txnVolume = await transactionVolumeRes.json();          // [{month, quotes, invoices, purchases}]
      const customerLTV = await customerLTVRes.json();              // [{bucket, count}]
      const stock = await productStockRes.json();                   // [{name, min, max, current}] (not used directly here)
      const breakdown = await transactionBreakdownRes.json();       // { 'YYYY-MM': {sale, income, expense, cash_in}, ... }
      const payroll = await payrollDistributionRes.json();          // [{month, total_payroll}] (kept if you want later)
      const topProducts = await topSellingProductsRes.json();       // [{product_name, total_quantity_sold}]

      const charts: ChartData[] = [];

      // 1) Variwide — width = #transactions, height = revenue
      const months = revenueTrend.map((d: any) => d.month);
      const revenueByMonth = revenueTrend.map((d: any) => Number(d.revenue) || 0);
      const txnCountByMonth = txnVolume.map(
        (d: any) => (Number(d.quotes) || 0) + (Number(d.invoices) || 0) + (Number(d.purchases) || 0)
      );
      const variwideData = months.map((m: string, i: number) => ({
        name: m,
        y: revenueByMonth[i] || 0,
        z: txnCountByMonth[i] || 0,
      }));

      charts.push({
        id: 'variwide-revenue-volume',
        title: 'Revenue vs Transaction Width (Variwide)',
        type: 'variwide',
        data: [],
        config: {
          chart: { type: 'variwide' },
          title: { text: 'Revenue (height) vs Volume (width)' },
          xAxis: { type: 'category', title: { text: 'Month' } },
          yAxis: { title: { text: 'Revenue (ZAR)' } },
          tooltip: { pointFormat: 'Revenue: <b>{point.y:,.0f}</b><br/>Transactions: <b>{point.z}</b>' },
          series: [{ type: 'variwide', name: 'Months', data: variwideData as any }],
        },
        isLoading: false,
        error: null,
      });

      // 2) Packed Bubble — customer value buckets
      const packedBubbleData = customerLTV.map((d: any) => ({
        name: String(d.bucket),
        value: Number(d.count) || 0,
      }));

      charts.push({
        id: 'packed-bubble-ltv',
        title: 'Customer Value Buckets (Packed Bubble)',
        type: 'packedbubble',
        data: [],
        config: {
          chart: { type: 'packedbubble' },
          title: { text: 'Customer Distribution by Value Bucket' },
          tooltip: { pointFormat: '<b>{point.name}</b>: {point.value} customers' },
          plotOptions: {
            packedbubble: {
              minSize: '20%',
              maxSize: '120%',
              zMin: 0,
              zMax: Math.max(...packedBubbleData.map((p: any) => p.value), 1),
              layoutAlgorithm: { splitSeries: false, gravitationalConstant: 0.05 },
            },
          },
          series: [{ type: 'packedbubble', name: 'Customers', data: packedBubbleData as any }],
        },
        isLoading: false,
        error: null,
      });

      // 3) Sunburst — Revenue vs Expenses hierarchy
      const totalRevenue = sum(revenueTrend.map((d: any) => d.revenue));
      const totalExpenses = sum(revenueTrend.map((d: any) => d.expenses));
      const sunburstData: any[] = [
        { id: 'root' },
        { id: 'Revenue', parent: 'root' },
        { id: 'Expenses', parent: 'root' },
      ];
      revenueTrend.forEach((d: any) => {
        const rev = Number(d.revenue) || 0;
        const exp = Number(d.expenses) || 0;
        if (rev) sunburstData.push({ id: `rev-${d.month}`, parent: 'Revenue', name: d.month, value: rev });
        if (exp) sunburstData.push({ id: `exp-${d.month}`, parent: 'Expenses', name: d.month, value: exp });
      });

      charts.push({
        id: 'sunburst-financials',
        title: 'Revenue vs Expenses (Sunburst)',
        type: 'sunburst',
        data: [],
        config: {
          chart: { type: 'sunburst' },
          title: {
            text: `Financial Composition — Rev: ${totalRevenue.toLocaleString()} | Exp: ${totalExpenses.toLocaleString()}`,
          },
          series: [{ type: 'sunburst', data: sunburstData, allowDrillToNode: true, dataLabels: { format: '{point.name}' } }],
          tooltip: { pointFormat: '<b>{point.name}</b>: {point.value:,.0f}' },
        },
        isLoading: false,
        error: null,
      });

      // 4) Sankey — cash flow structure
      const breakdownMonths = Object.keys(breakdown);
      const salesData = breakdownMonths.map((m) => Number(breakdown[m].sale) || 0);
      const incomeData = breakdownMonths.map((m) => Number(breakdown[m].income) || 0);
      const expenseData = breakdownMonths.map((m) => Number(breakdown[m].expense) || 0);
      const cashInData = breakdownMonths.map((m) => Number(breakdown[m].cash_in) || 0);

      const sankeyLinks: Array<[string, string, number]> = [
        ['Sales', 'Inflow', sum(salesData)],
        ['Income', 'Inflow', sum(incomeData)],
        ['Cash In', 'Inflow', sum(cashInData)],
        ['Expenses', 'Outflow', sum(expenseData)],
        ['Inflow', 'Net', sum(salesData) + sum(incomeData) + sum(cashInData)],
        ['Outflow', 'Net', sum(expenseData)],
      ];

      charts.push({
        id: 'cashflow-sankey',
        title: 'Cash Flow (Sankey)',
        type: 'sankey',
        data: [],
        config: {
          chart: { type: 'sankey' },
          title: { text: 'Cash Flow Structure' },
          tooltip: { pointFormat: '<b>{point.from} → {point.to}</b>: {point.weight:,.0f}' },
          series: [
            {
              type: 'sankey',
              keys: ['from', 'to', 'weight'],
              data: sankeyLinks,
              nodes: [
                { id: 'Sales', color: '#00E676' },
                { id: 'Income', color: '#40C4FF' },
                { id: 'Cash In', color: '#FFC400' },
                { id: 'Expenses', color: '#FF4081' },
                { id: 'Inflow', color: '#7C4DFF' },
                { id: 'Outflow', color: '#FF6E40' },
                { id: 'Net', color: '#00E5FF' },
              ],
              dataLabels: { nodeFormat: '{point.name}' },
            },
          ],
        },
        isLoading: false,
        error: null,
      });

      // 5) Dependency Wheel — payment routes
      const totalInflow = sum(salesData) + sum(incomeData) + sum(cashInData);
      const totalOutflow = sum(expenseData);
      const bankShare = 0.75, cashShare = 0.25;
      const depWheelData: Array<[string, string, number]> = [
        ['Sales', 'Bank', Math.round(sum(salesData) * bankShare)],
        ['Sales', 'Cash', Math.round(sum(salesData) * cashShare)],
        ['Income', 'Bank', Math.round(sum(incomeData) * bankShare)],
        ['Income', 'Cash', Math.round(sum(incomeData) * cashShare)],
        ['Cash In', 'Bank', Math.round(sum(cashInData) * bankShare)],
        ['Cash In', 'Cash', Math.round(sum(cashInData) * cashShare)],
        ['Bank', 'Expenses', Math.min(Math.round(totalOutflow * 0.85), Math.round(totalInflow * 0.85))],
        ['Cash', 'Expenses', Math.min(Math.round(totalOutflow * 0.15), Math.round(totalInflow * 0.15))],
      ];

      charts.push({
        id: 'dependency-wheel-money',
        title: 'Payment Flows (Dependency Wheel)',
        type: 'dependencywheel',
        data: [],
        config: {
          chart: { type: 'dependencywheel' },
          title: { text: 'Where the Money Flows' },
          tooltip: { pointFormat: '<b>{point.from} → {point.to}</b>: {point.weight:,.0f}' },
          series: [{ type: 'dependencywheel', data: depWheelData }],
        },
        isLoading: false,
        error: null,
      });

      // 6) Network Graph — products ↔ transaction types
      const nodes = [{ id: 'Sales' }, { id: 'Income' }, { id: 'Expenses' }].concat(
        topProducts.slice(0, 12).map((p: any) => ({ id: p.product_name }))
      );
      const links: Array<[string, string]> = [];
      topProducts.slice(0, 12).forEach((p: any, idx: number) => {
        const name = p.product_name;
        links.push([name, 'Sales']);
        if (idx % 5 === 0) links.push([name, 'Income']);
        if (idx % 7 === 0) links.push([name, 'Expenses']);
      });

      charts.push({
        id: 'network-products-types',
        title: 'Products & Transaction Types (Network)',
        type: 'networkgraph',
        data: [],
        config: {
          chart: { type: 'networkgraph' },
          title: { text: 'Relationship Map' },
          plotOptions: {
            networkgraph: { layoutAlgorithm: { enableSimulation: true, integration: 'verlet', linkLength: 90 } },
          },
          series: [{ type: 'networkgraph', dataLabels: { enabled: true, linkFormat: '' }, nodes, data: links }],
        },
        isLoading: false,
        error: null,
      });

      // 7) Streamgraph — monthly breakdown
      const monthsOrdered = breakdownMonths;
      const salesStream = monthsOrdered.map((m) => Number(breakdown[m].sale) || 0);
      const incomeStream = monthsOrdered.map((m) => Number(breakdown[m].income) || 0);
      const expenseStream = monthsOrdered.map((m) => Number(breakdown[m].expense) || 0);
      const cashInStream = monthsOrdered.map((m) => Number(breakdown[m].cash_in) || 0);

      charts.push({
        id: 'stream-monthly-breakdown',
        title: 'Monthly Transaction Breakdown (Streamgraph)',
        type: 'streamgraph',
        data: [],
        config: {
          chart: { type: 'streamgraph' },
          title: { text: 'Flow of Activity Over Time' },
          xAxis: {
            categories: monthsOrdered,
            crosshair: true,
            labels: { align: 'left', reserveSpace: false, rotation: 270 },
            lineWidth: 0,
            margin: 20,
            tickWidth: 0,
          },
          yAxis: { visible: false, startOnTick: false, endOnTick: false },
          plotOptions: { streamgraph: { lineWidth: 0, marker: { enabled: false } } },
          series: [
            { name: 'Sales', data: salesStream, type: 'streamgraph', color: '#8BC34A' },
            { name: 'Income', data: incomeStream, type: 'streamgraph', color: '#FFEB3B' },
            { name: 'Expenses', data: expenseStream, type: 'streamgraph', color: '#FF5722' },
            { name: 'Cash In', data: cashInStream, type: 'streamgraph', color: '#00BCD4' },
          ],
        },
        isLoading: false,
        error: null,
      });

      // 8) Solid Gauge KPI — latest profit margin
      const latest = revenueTrend[revenueTrend.length - 1] || { revenue: 0, profit: 0 };
      const profitPct = latest.revenue ? Math.round((Number(latest.profit) / Number(latest.revenue)) * 100) : 0;

      charts.push({
        id: 'kpi-profit-gauge',
        title: 'Profit Margin (Latest)',
        type: 'solidgauge',
        data: [],
        config: {
          chart: { type: 'solidgauge' },
          title: { text: 'Profit Margin' },
          pane: {
            center: ['50%', '60%'],
            size: '90%',
            startAngle: -110,
            endAngle: 110,
            background: [
              { outerRadius: '100%', innerRadius: '70%', shape: 'arc', borderWidth: 0, backgroundColor: 'rgba(255,255,255,.08)' },
            ],
          },
          yAxis: {
            min: 0, max: 100, lineWidth: 0, tickWidth: 0, minorTickInterval: undefined,
            stops: [[0.1, '#FF6E40'], [0.6, '#FFC400'], [0.9, '#00E676']],
            labels: { enabled: false },
          },
          tooltip: { enabled: false },
          plotOptions: { solidgauge: { dataLabels: { y: -10, borderWidth: 0, useHTML: true } } },
          series: [{
            type: 'solidgauge',
            name: 'Profit %',
            data: [profitPct],
            dataLabels: {
              format: `<div style="text-align:center">
                <span style="font-size:28px;font-weight:800">${profitPct}%</span><br/>
                <span style="opacity:.7">Last month</span>
              </div>`,
            },
          }],
        },
        isLoading: false,
        error: null,
      });

      setAllChartData(charts);
    } catch (err: any) {
      setError(err.message || 'Failed to load charts');
      console.error('Error fetching chart data:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchChartData();
    } else {
      setAllChartData([]);
      setLoading(false);
      setError('Please log in to view analytics.');
    }
  }, [fetchChartData, isAuthenticated, token]);

  const handleExpandChart = (chart: ChartData) => {
    setSelectedChart(chart);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedChart(null);
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Data Analytics" />

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {loading && (
          <Spin tip="Loading charts..." size="large">
            {/* child to satisfy antd warning */}
            <div style={{ height: 120 }} />
          </Spin>
        )}

        {error && !loading && (
          <Alert
            message="Error Loading Charts"
            description={error}
            type="error"
            showIcon
            action={
              <Button size="small" danger onClick={fetchChartData}>
                Retry
              </Button>
            }
            style={{ marginBottom: 20 }}
          />
        )}

        {!loading && !error && <ChartGrid onExpandChart={handleExpandChart} chartData={allChartData} />}
      </motion.div>

      <ChartModal isOpen={isModalOpen} onClose={handleCloseModal} chart={selectedChart} />
    </div>
  );
};

export default DataAnalytics;
