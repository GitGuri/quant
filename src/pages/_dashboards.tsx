import type { ReactNode } from 'react';
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
} from '@ant-design/icons';

export type DashboardKey = 'sales' | 'finance' | 'customers' | 'products';

export type DashboardDef = {
  label: string;
  description: string;
  color: string;
  icon: ReactNode;
  chartIds: string[];
};

export const DASHBOARDS: Record<DashboardKey, DashboardDef> = {
  sales: {
    label: 'Sales',
    description: 'Sales trends, AOV, payment mix, heatmap, funnel & distribution (includes forecasts)',
    color: 'geekblue',
    icon: <BarChartOutlined />,
    chartIds: [
      'sales-trend', // Historical
      //'aov-trend',   // Historical
      // --- Add Forecast Chart IDs ---
      'forecast-sales-trend', // New Forecast Chart
      'forecast-aov-trend',   // New Forecast Chart
      // --- End of additions ---
      'payment-mix',
      'top-products-pareto',
      'calendar-heatmap-sales',
      'sales-funnel',
      'order-values-histogram',
    ],
  },
finance: {
  label: 'Finance',
  description: 'Revenue vs expenses, expense trend, profit KPI (includes Prophet forecasts)',
  color: 'volcano',
  icon: <AreaChartOutlined />,
  chartIds: [
    'income-waterfall',                 // ⟵ was 'sunburst-financials'
    'bar-race-expenses',
    'kpi-profit-gauge',
    'forecast-profit-trend-prophet',
    'forecast-revenue-trend-prophet',
    'forecast-expenses-trend-prophet',
  ],
},

customers: {
  label: 'Customers',
  description: 'CLV share, overdue risk, churn watch',
  color: 'green',
  icon: <PieChartOutlined />,
  chartIds: ['cust-clv-donut', 'cust-overdue-bubbles', 'cust-churn-buckets'],
},

};
