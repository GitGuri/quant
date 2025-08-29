// src/pages/DataAnalytics.tsx
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { useAuth } from '../AuthPage';
import Highcharts from '../lib/initHighcharts';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Spin, Alert, Button, Select, Card } from 'antd';
import type { SelectProps } from 'antd';

// --- Add interfaces for new data structures ---
interface DailySalesDataPoint {
  date: string; // 'YYYY-MM-DD' - This is correct from the backend
  total_sales_amount: number;
}

interface MonthlyExpenseDataPoint {
  month: string; // 'YYYY-MM-DD' (first day of the month)
  [category: string]: number | string; // Index signature for dynamic categories
}
// --- End new interfaces ---

export interface ChartData {
  id: string;
  title: string;
  type:
    | 'dependencywheel'
    | 'networkgraph'
    | 'sunburst'
    | 'packedbubble'
    | 'variwide'
    | 'solidgauge'
    | 'columnrange' // For Bar Race
    | 'heatmap';    // For Heatmaps (Calendar or Regular)
  data: (string | number)[][];
  config: Options;
  isLoading: boolean;
  error: string | null;
}

const API = 'https://quantnow-cu1v.onrender.com';

const DataAnalytics = () => {
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>(['variwide-revenue-volume']);
  const [allChartData, setAllChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableCharts, setAvailableCharts] = useState<{ id: string; title: string }[]>([]);

  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const sum = (arr: any[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

  const fetchChartData = useCallback(async () => {
    if (!token) {
      setAllChartData([]);
      setAvailableCharts([]);
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
        dailySalesRes,
        monthlyExpensesRes,
      ] = await Promise.all([
        fetch(`${API}/api/charts/revenue-trend`, { headers }),
        fetch(`${API}/api/charts/transaction-volume`, { headers }),
        fetch(`${API}/api/charts/customer-lifetime-value`, { headers }),
        fetch(`${API}/api/charts/product-stock-levels`, { headers }),
        fetch(`${API}/api/charts/transaction-type-breakdown`, { headers }),
        fetch(`${API}/api/charts/payroll-distribution`, { headers }),
        fetch(`${API}/api/charts/top-selling-products`, { headers }),
        fetch(`${API}/api/charts/daily-sales-aggregation`, { headers }),
        fetch(`${API}/api/charts/monthly-expenses`, { headers }),
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
      ensureOk(dailySalesRes, 'daily sales aggregation');
      ensureOk(monthlyExpensesRes, 'monthly expenses');

      const revenueTrend = await revenueTrendRes.json();
      const txnVolume = await transactionVolumeRes.json();
      const customerLTV = await customerLTVRes.json();
      const stock = await productStockRes.json();
      const breakdown = await transactionBreakdownRes.json();
      const payroll = await payrollDistributionRes.json();
      const topProducts = await topSellingProductsRes.json();
      const dailySalesData: DailySalesDataPoint[] = await dailySalesRes.json();
      const monthlyExpensesData: MonthlyExpenseDataPoint[] = await monthlyExpensesRes.json();

      const charts: ChartData[] = [];

      // 1) Variwide — width = #transactions, height = revenue
      const months = revenueTrend.map((d: any) => d.month);
      const revenueByMonth = revenueTrend.map((d: any) => Number(d.revenue) || 0);
      const txnCountByMonth = txnVolume.map(
        (d: any) =>
          (Number(d.quotes) || 0) + (Number(d.invoices) || 0) + (Number(d.purchases) || 0)
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

      // 4) Dependency Wheel — payment routes
      const breakdownMonths = Object.keys(breakdown);
      const salesData = breakdownMonths.map((m) => Number(breakdown[m].sale) || 0);
      const incomeData = breakdownMonths.map((m) => Number(breakdown[m].income) || 0);
      const expenseData = breakdownMonths.map((m) => Number(breakdown[m].expense) || 0);
      const cashInData = breakdownMonths.map((m) => Number(breakdown[m].cash_in) || 0);

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

      // 5) Network Graph — products ↔ transaction types
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

      // --- NEW: 6) Bar Race - Monthly Expenses by Category ---
      if (monthlyExpensesData && monthlyExpensesData.length > 0) {
        const expenseCategories = Object.keys(monthlyExpensesData[0] || {}).filter(key => key !== 'month');
        
        const barRaceCategories = monthlyExpensesData.map(item => {
            const date = new Date(item.month);
            return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' });
        });

        const barRaceSeries = expenseCategories.map(category => {
            return {
                name: category.replace(/_/g, ' '),
                type: 'columnrange' as const,
                data: monthlyExpensesData.map((item, index) => ({
                    y: item[category] || 0,
                    name: barRaceCategories[index]
                })),
            };
        });

        charts.push({
            id: 'bar-race-expenses',
            title: 'Monthly Expenses by Category (Bar Race)',
            type: 'columnrange',
            data: [],
            config: {
                chart: {
                    type: 'columnrange',
                    inverted: true,
                },
                title: { text: 'Monthly Expenses by Category' },
                subtitle: { text: 'See how expense categories compete over time' },
                xAxis: {
                    categories: barRaceCategories
                },
                yAxis: {
                    title: { text: 'Amount (ZAR)' }
                },
                legend: {
                    enabled: true
                },
                plotOptions: {
                    series: {
                        grouping: false,
                        borderWidth: 0,
                        dataLabels: [{
                            enabled: true,
                        }, {
                            enabled: true,
                            format: 'R {point.y:,.0f}',
                            inside: true,
                            style: {
                                color: 'white',
                                textOutline: 'none',
                                fontWeight: 'normal',
                                fontSize: '10px'
                            }
                        }]
                    }
                },
                tooltip: {
                    headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
                    pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>R {point.y:,.2f}</b><br/>'
                },
                series: barRaceSeries
            },
            isLoading: false,
            error: null,
        });
      } else {
          charts.push({
            id: 'bar-race-expenses',
            title: 'Monthly Expenses by Category (Bar Race)',
            type: 'columnrange',
            data: [],
            config: {
              title: { text: 'Monthly Expenses by Category' },
              subtitle: { text: 'No expense data available for bar race.' },
              series: []
            },
            isLoading: false,
            error: 'No expense data available.',
          });
      }
      // --- END NEW: Bar Race ---

      // --- NEW: 7) Calendar Heatmap - Daily Sales ---
      if (dailySalesData && dailySalesData.length > 0) {
        // --- Data Processing Logic for Monthly Calendar View ---
        interface CalendarDayData {
          date: Date;
          weekIndex: number;
          dayOfWeek: number;
          value: number;
          displayDate: string;
        }

        // 1. Determine the overall date range
        const dates = dailySalesData.map(d => new Date(d.date));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

        // 2. Find the start of the first week (Monday of the week containing the earliest sale)
        const startCalendarDate = new Date(minDate);
        startCalendarDate.setDate(minDate.getDate() - minDate.getDay() + 1); // Adjust for Mon as start of week

        // 3. Find the end of the last week (Sunday of the week containing the latest sale)
        const endCalendarDate = new Date(maxDate);
        endCalendarDate.setDate(maxDate.getDate() + (7 - maxDate.getDay())); // Adjust for Sun as end of week

        // 4. Create a map of existing sales data for quick lookup
        const salesMap: Record<string, number> = {};
        dailySalesData.forEach(item => {
          salesMap[item.date] = item.total_sales_amount;
        });

        // 5. Generate all days in the calendar range
        const calendarDays: CalendarDayData[] = [];
        const currentDate = new Date(startCalendarDate);
        let weekCounter = 0; // To track week index for X-axis

        while (currentDate <= endCalendarDate) {
          // Check if we are starting a new week (Monday)
          if (currentDate.getDay() === 1) { 
            weekCounter++;
          }

          const dateString = currentDate.toISOString().split('T')[0];
          const value = salesMap[dateString] || 0;

          // Corrected: Use 0-based indexing where 0=Monday, 1=Tuesday, ..., 6=Sunday
          const dayOfWeek = currentDate.getDay(); // This returns 0=Sunday, 1=Monday, ..., 6=Saturday
          const correctedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

          calendarDays.push({
            date: new Date(currentDate),
            weekIndex: weekCounter - 1, // Make it 0-based
            dayOfWeek: correctedDayOfWeek,
            value: value,
            displayDate: dateString
          });

          currentDate.setDate(currentDate.getDate() + 1);
        }

        // 6. Prepare data for Highcharts heatmap
        const heatmapData: [number, number, number][] = calendarDays.map(day => [
          day.weekIndex,
          day.dayOfWeek,
          day.value
        ]);

        // 7. Prepare X and Y axis categories
        const xAxisCategories: string[] = [];
        if (calendarDays.length > 0) {
            const uniqueWeeks = Array.from(new Set(calendarDays.map(d => d.weekIndex))).sort((a, b) => a - b);
            xAxisCategories.push(...uniqueWeeks.map(weekNum => `Week ${weekNum + 1}`));
        }

        // Y-axis: Days of the week (corrected order: Mon, Tue, Wed, Thu, Fri, Sat, Sun)
        const yAxisCategories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // --- End Data Processing ---

        charts.push({
            id: 'calendar-heatmap-sales',
            title: 'Daily Sales Amount (Monthly Calendar View)',
            type: 'heatmap',
            data: [],
            config: {
                chart: {
                    type: 'heatmap',
                    marginTop: 40,
                    marginBottom: 80,
                    plotBorderWidth: 1,
                    height: 400
                },
                title: { text: 'Daily Sales Amount' },
                xAxis: {
                    categories: xAxisCategories,
                    title: { text: 'Weeks' },
                    labels: {
                        align: 'center',
                        rotation: -45,
                        style: {
                            fontSize: '9px'
                        }
                    }
                },
                yAxis: {
                    categories: yAxisCategories,
                    title: { text: 'Day of Week' },
                    reversed: false
                },
                colorAxis: {
                    min: 0,
                },
                legend: {
                    enabled: true,
                    align: 'right',
                    layout: 'vertical',
                    margin: 0,
                    verticalAlign: 'top',
                    y: 25,
                    symbolHeight: 200
                },
                tooltip: {
                    formatter: function (this: Highcharts.TooltipFormatterContextObject) {
                        const weekLabel = this.series.xAxis.categories[this.point.x];
                        const dayLabel = this.series.yAxis.categories[this.point.y];
                        const value = this.point.value;
                        const dataPoint = calendarDays.find(d => 
                            d.weekIndex === this.point.x && d.dayOfWeek === this.point.y
                        );
                        const dateString = dataPoint ? dataPoint.displayDate : 'N/A';
                        return `<b>${dateString}</b><br/>
                                ${weekLabel}, ${dayLabel}: <br/>
                                Sales: <b>R ${value?.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
                    }
                },
                series: [{
                    name: 'Daily Sales (ZAR)',
                    type: 'heatmap',
                    borderWidth: 0,
                    data: heatmapData,
                    dataLabels: {
                        enabled: false,
                        format: '{point.value:,.0f}'
                    },
                }]
            },
            isLoading: false,
            error: null,
        });
      } else {
          charts.push({
            id: 'calendar-heatmap-sales',
            title: 'Daily Sales Amount (Monthly Calendar View)',
            type: 'heatmap',
            data: [],
            config: {
              title: { text: 'Daily Sales Amount' },
              subtitle: { text: 'No daily sales data available for heatmap.' },
              series: []
            },
            isLoading: false,
            error: 'No daily sales data available.',
          });
      }
      // --- END NEW: Calendar Heatmap ---

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
      setAvailableCharts(charts.map(c => ({ id: c.id, title: c.title })));
    } catch (err: any) {
      setError(err.message || 'Failed to load charts');
      console.error('Error fetching chart data:', err);
      setAvailableCharts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchChartData();
    } else {
      setAllChartData([]);
      setAvailableCharts([]);
      setLoading(false);
      setError('Please log in to view analytics.');
    }
  }, [fetchChartData, isAuthenticated, token]);

  const handleChartSelectionChange: SelectProps['onChange'] = (value: string | string[]) => {
    const selectedIds = Array.isArray(value) ? value : [value];
    setSelectedChartIds(selectedIds);
  };

  const selectedCharts = allChartData.filter(chart => selectedChartIds.includes(chart.id));

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Data Analytics" />

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {loading && (
          <Spin tip="Loading charts..." size="large">
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

        {!loading && !error && (
          <>
            <div className="mb-6">
              <label htmlFor="chart-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select Chart(s)
              </label>
              <Select
                id="chart-selector"
                mode="multiple"
                allowClear
                style={{ width: '100%' }}
                placeholder="Please select a chart"
                value={selectedChartIds}
                onChange={handleChartSelectionChange}
                options={availableCharts.map(chart => ({
                  label: chart.title,
                  value: chart.id,
                }))}
              />
            </div>

            {selectedCharts.length > 0 ? (
              <div className="space-y-6">
                {selectedCharts.map((chart) => (
                  <Card 
                    key={chart.id} 
                    title={chart.title} 
                    className="w-full shadow-lg rounded-2xl bg-white dark:bg-gray-800"
                    headStyle={{ fontWeight: 'bold' }}
                  >
                    {chart.error ? (
                      <Alert
                        message="Chart Error"
                        description={chart.error}
                        type="warning"
                        showIcon
                      />
                    ) : (
                      <HighchartsReact 
                        highcharts={Highcharts} 
                        options={chart.config} 
                        containerProps={{ style: { height: '100%', width: '100%' } }}
                      />
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Alert
                message="No Chart Selected"
                description="Please select a chart from the dropdown above to view it."
                type="info"
                showIcon
              />
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default DataAnalytics;