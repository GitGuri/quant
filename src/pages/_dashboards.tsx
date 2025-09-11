// src/pages/_dashboards.tsx
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

export const DASHBOARD_SALES_IDS = [
  'sales-trend',             // Orders (col) + Revenue (line)
  'aov-trend',               // Computed from revenue/volume
  'payment-mix',             // From /api/analytics/sales/payment-mix
  'top-products-pareto',     // From /api/charts/top-selling-products
  'calendar-heatmap-sales',  // From /api/charts/daily-sales-aggregation
  'sales-funnel',            // Built from transaction-volume
] as const;

export const DASHBOARDS: Record<DashboardKey, DashboardDef> = {
  sales: {
    label: 'Sales',
    description: 'Orders & revenue trend, AOV, payment mix, top products, calendar, funnel',
    color: 'geekblue',
    icon: <BarChartOutlined />,
    chartIds: [...DASHBOARD_SALES_IDS],
  },
  finance: {
    label: 'Finance',
    description: 'Revenue vs expenses, expense race, profit KPI',
    color: 'volcano',
    icon: <AreaChartOutlined />,
    chartIds: ['sunburst-financials', 'bar-race-expenses', 'kpi-profit-gauge'],
  },
  customers: {
    label: 'Customers',
    description: 'Customer value buckets & distribution',
    color: 'green',
    icon: <PieChartOutlined />,
    chartIds: ['packed-bubble-ltv'],
  },
  products: {
    label: 'Products',
    description: 'Product relationships & motion',
    color: 'purple',
    icon: <LineChartOutlined />,
    chartIds: ['network-products-types'],
  },
};
