// src/pages/AnalyticsHub.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { useAuth } from '../AuthPage';
import {
  Card,
  Row,
  Col,
  Tag,
  Space,
  Button,
  Alert,
  Spin,
} from 'antd';
import {
  AppstoreOutlined,
  ReloadOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
} from '@ant-design/icons';


// --- Dashboard presets (ids should match your chart ids used on AnalyticsDashboard) ---
const DASHBOARDS: Record<
  string,
  { label: string; description: string; color: string; icon: React.ReactNode; chartIds: string[] }
> = {
  sales: {
    label: 'Sales',
    description: 'Sales trends, daily heatmap, flows & product links',
    color: 'geekblue',
    icon: <BarChartOutlined />,
    chartIds: [
      'variwide-revenue-volume',
      'calendar-heatmap-sales',
      'dependency-wheel-money',
      'network-products-types',
    ],
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

};

const AnalyticsHub = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // If you want to kick unauthenticated users out immediately, do it here.
  useEffect(() => {
    // no-op: keep user on hub but show an auth message below
  }, []);

  const handleOpen = (key: keyof typeof DASHBOARDS) => {
    navigate(`/analytics/${key}`);
  };

  const handleOpenCustom = () => {
    navigate(`/analytics/custom`);
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Analytics" />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Auth Gate */}
        {authLoading ? (
          <Spin tip="Checking authentication…" size="large">
            <div style={{ height: 120 }} />
          </Spin>
        ) : !isAuthenticated || !token ? (
          <Alert
            type="warning"
            showIcon
            message="Authentication required"
            description="Please log in to view and open dashboards."
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {/* Hub Card */}
        <Card
          className="w-full shadow-md rounded-2xl mb-6"
          title={
            <Space align="center">
              <AppstoreOutlined />
              <span style={{ fontWeight: 700 }}>Dashboards</span>
              <Tag>Hub</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => window.location.reload()}
              >
                Refresh
              </Button>
              <Button size="small" onClick={handleOpenCustom}>
                Custom
              </Button>
            </Space>
          }
        >
          <Row gutter={[16, 16]}>
            {Object.entries(DASHBOARDS).map(([key, d]) => (
              <Col xs={24} sm={12} md={12} lg={6} key={key}>
                <Card
                  hoverable
                  className="rounded-xl"
                  onClick={() => isAuthenticated && token ? handleOpen(key as keyof typeof DASHBOARDS) : null}
                  style={{
                    cursor: isAuthenticated && token ? 'pointer' : 'not-allowed',
                    opacity: isAuthenticated && token ? 1 : 0.6,
                  }}
                >
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space size="small" align="center">
                      {d.icon}
                      <span style={{ fontWeight: 700 }}>{d.label}</span>
                    </Space>

                    <div style={{ fontSize: 12, opacity: 0.8 }}>{d.description}</div>

                    <div>
                      {d.chartIds.map((id) => (
                        <Tag key={id} color={d.color} style={{ marginBottom: 6 }}>
                          {id.replace(/-/g, ' ')}
                        </Tag>
                      ))}
                    </div>

                    <Button type="primary" block disabled={!isAuthenticated || !token}>
                      Open {d.label}
                    </Button>
                  </Space>
                </Card>
              </Col>
            ))}

            {/* Optional: a visible Custom card as well */}

            
          </Row>
        </Card>

        {/* Optional: Helpful note */}
        <Alert
          type="info"
          showIcon
          message="Tip"
          description="Click a card to open its dedicated dashboard at /analytics/:dashKey. You can also open the Custom dashboard to pick any chart combination."
        />
      </motion.div>
    </div>
  );
};

export default AnalyticsHub;
