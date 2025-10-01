import { useEffect, useState, useCallback } from 'react' // Added useCallback
import {
  Typography,
  Row,
  Col,
  Divider,
  Select,
  List,
  Card,
  Spin,
  Badge,
  Grid,
  message // Import message for error handling
} from 'antd'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import {
  ShoppingCartOutlined,
  AppstoreOutlined,
  ExclamationCircleOutlined,
  AlertOutlined,
  LineChartOutlined
} from '@ant-design/icons'
import type { Product } from '../types/type'
import dayjs from 'dayjs'
import { useAuth } from '../AuthPage'; // Re-add useAuth

const { Text } = Typography
const { useBreakpoint } = Grid
// REMOVE THIS LINE: const [messageApi, contextHolder] = message.useMessage(); // Define useMessage at the top level


const now = dayjs()
const months = Array.from({ length: now.month() + 1 }, (_, i) =>
  dayjs().month(i).format('MMM')
)
const monthKeys = Array.from({ length: now.month() + 1 }, (_, i) =>
  dayjs().month(i).format('YYYY-MM')
)

// Define a type for the fetched sales data from the backend
interface FetchedSaleItem {
    saleId: string;
    createdAt: Date; // Will be a Date object after transformation
    product_id: string; // This is the ID of the product or service
    product_name: string;
    quantity: number;
    unit_price_at_sale: number;
}

type Props = {
  products: Product[]
}

const productIcon = (item?: Product) => {
  if (!item) return <AppstoreOutlined style={{ color: '#bcbcbc' }} />
  const name = (item.name || '').toLowerCase()
  if (item.type === 'service') {
    return <AppstoreOutlined style={{ color: '#1976d2' }} />
  }
  if (name.includes('meal') || name.includes('food') || name.includes('rice'))
    return <AppstoreOutlined style={{ color: '#ff9800' }} />
  return <ShoppingCartOutlined style={{ color: '#1890ff' }} />
}

const asDisplayValue = (item: Product) =>
  item.type === 'service'
    ? Number(item.availableValue ?? 0)
    : Number(item.qty ?? 0)
const asDisplayPrice = (item: Product) =>
  Number(item.unitPrice ?? item.price ?? 0)

const POSDashboard = ({ products }: Props) => {
  // MOVE IT HERE:
  const [messageApi, contextHolder] = message.useMessage(); // Define useMessage inside the functional component

  const [loading, setLoading] = useState(true)
  const [monthlySales, setMonthlySales] = useState<{
    [productId: string]: number[]
  }>({})
  // Use product ID for trend selection, it's more reliable than name
  const [trendProductId, setTrendProductId] = useState<string | undefined>(undefined);
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { isAuthenticated } = useAuth(); // Re-introduce useAuth

  // --- Fetch sales and aggregate monthly sales for each product (from backend) ---
  const fetchMonthlySales = useCallback(async () => {
    if (!isAuthenticated) {
      console.warn('POSDashboard: Not authenticated. Skipping sales fetch.');
      setMonthlySales({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
        const token = localStorage.getItem('token'); // Get the token from local storage
        if (!token) {
            throw new Error('No authentication token found.');
        }

        // Use process.env.REACT_APP_BACKEND_URL for consistency
        const res = await fetch(`http://localhost:3000/api/dashboard/sales`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || 'Failed to fetch sales data');
        }

        const data: FetchedSaleItem[] = await res.json();

        const salesPerProduct: { [productId: string]: number[] } = {};

        for (const item of data) {
            const date = new Date(item.createdAt); // Ensure it's a Date object
            if (isNaN(date.getTime())) { // Check for invalid dates
                console.warn('Invalid date encountered:', item.createdAt);
                continue;
            }

            const monthKey = dayjs(date).format('YYYY-MM');
            const monthIdx = monthKeys.indexOf(monthKey);

            if (monthIdx === -1) { // Skip if month is outside our current range
                continue;
            }

            if (!salesPerProduct[item.product_id]) {
                salesPerProduct[item.product_id] = Array(months.length).fill(0);
            }
            salesPerProduct[item.product_id][monthIdx] += Number(item.quantity || 0);
        }
        setMonthlySales(salesPerProduct);
        messageApi.success('Sales data loaded successfully!');
    } catch (error: any) {
        console.error('Error fetching sales data:', error);
        messageApi.error(`Failed to load sales data: ${error.message}`);
        setMonthlySales({}); // Clear sales data on error
    } finally {
        setLoading(false);
    }
  }, [isAuthenticated, messageApi]); // Add messageApi to useCallback dependencies

  useEffect(() => {
    fetchMonthlySales();
  }, [fetchMonthlySales]); // Dependency on fetchMonthlySales (which depends on isAuthenticated and messageApi)

  // Low stock alert: only products (not services) where qty <= minQty
  const alerts = products.filter(
    p => p.type !== 'service' && asDisplayValue(p) <= (Number(p.minQty) || 0)
  )

  // Total count of all products and services
  const totalProductsAndServicesCount = products.length;

  const lowStockCount = alerts.length

  // Metrics
  const totalValue = products.reduce(
    (sum, p) => sum + asDisplayValue(p) * asDisplayPrice(p),
    0
  )

  // --- Trends ---
  // Find the selected product using its ID from trendProductId state
  const selectedProduct = products.find(p => p.id === trendProductId);
  const trendProductName = selectedProduct?.name || ''; // Name for display in chart title

  const lineData =
    selectedProduct?.id && monthlySales[selectedProduct.id]
      ? monthlySales[selectedProduct.id]
      : Array(months.length).fill(0);

  // Calculate total units sold per month across all products/services
  const barData = months.map((_, i) => {
    let totalUnitsSoldInMonth = 0;
    for (const productId in monthlySales) {
        if (monthlySales[productId][i] !== undefined) {
            totalUnitsSoldInMonth += monthlySales[productId][i];
        }
    }
    return totalUnitsSoldInMonth;
  });

  const topThree = [...products]
    .map(p => ({
      ...p,
      // For top sellers, sum the quantities from monthlySales for that product/service
      sold: monthlySales[p.id]
        ? monthlySales[p.id].reduce((a, b) => a + b, 0)
        : 0
    }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 3)

  // Highcharts configs (always show labels, small font for mobile)
  const dataLabelStyle = {
    fontWeight: 'bold',
    fontSize: isMobile ? '11px' : '13px'
  }

  const miniBarOptions = {
    chart: {
      type: 'column',
      height: isMobile ? 200 : 240,
      backgroundColor: 'transparent'
    },
    title: {
      text: '', // Title hidden, as it's typically "Top Sellers" handled by Divider
      style: { fontSize: isMobile ? 14 : 16 }
    },
    xAxis: {
      categories: topThree.map(p => p.name),
      labels: {
        style: { fontSize: isMobile ? 11 : 13 },
      }
    },
    yAxis: {
      title: { text: 'Units Sold', style: { fontSize: isMobile ? 11 : 13 } },
      visible: true
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y} units sold</b>' },
    plotOptions: {
      column: {
        dataLabels: {
          enabled: true,
          format: '{y}',
          crop: false,
          overflow: 'allow',
          style: dataLabelStyle
        }
      }
    },
    series: [
      {
        type: 'column',
        name: 'Units Sold',
        data: topThree.map(p => p.sold),
        color: '#1976D2'
      }
    ]
  }

  const trendLineOptions = {
    chart: {
      type: 'areaspline',
      height: isMobile ? 200 : 240,
      backgroundColor: 'transparent'
    },
    title: {
      text: `Monthly Sales Trend: ${trendProductName}`, // Use trendProductName
      style: { fontSize: isMobile ? 14 : 16 }
    },
    xAxis: {
      categories: months,
      labels: { style: { fontSize: isMobile ? 11 : 13 } },
      title: { text: 'Month', style: { fontSize: isMobile ? 11 : 13 } }
    },
    yAxis: {
      title: { text: 'Units Sold', style: { fontSize: isMobile ? 11 : 13 } },
      gridLineWidth: 0
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { valueSuffix: ' units' },
    plotOptions: {
      areaspline: {
        dataLabels: {
          enabled: true,
          format: '{y}',
          crop: false,
          overflow: 'allow',
          style: dataLabelStyle
        }
      }
    },
    series: [
      {
        name: trendProductName, // Use trendProductName
        data: lineData,
        color: '#6C63FF',
        fillOpacity: 0.15,
        marker: { radius: isMobile ? 3 : 5 }
      }
    ]
  }

  const barChartOptions = {
    chart: {
      type: 'column',
      height: isMobile ? 240 : 260,
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Total Units Sold (All Products & Services)', // Updated title
      style: { fontSize: isMobile ? 14 : 16 }
    },
    xAxis: {
      categories: months,
      title: { text: 'Month', style: { fontSize: isMobile ? 11 : 13 } }
    },
    yAxis: {
      title: { text: 'Units Sold', style: { fontSize: isMobile ? 11 : 13 } }
    },
    credits: { enabled: false },
    tooltip: { valueSuffix: ' units' },
    plotOptions: {
      column: {
        dataLabels: {
          enabled: true,
          format: '{y}',
          crop: false,
          overflow: 'allow',
          style: dataLabelStyle
        }
      }
    },
    series: [
      {
        name: 'Total Units Sold',
        data: barData,
        color: '#6C63FF'
      }
    ]
  }

  // Effect to set initial trendProductId or adjust if selected product is gone
  useEffect(() => {
    if (products.length > 0) {
        // If no product is selected or the current selected product is no longer in the list
        if (!trendProductId || !products.some(p => p.id === trendProductId)) {
            setTrendProductId(products[0].id); // Set to the first product's ID
        }
    } else {
        setTrendProductId(undefined); // Clear if no products available
    }
  }, [products, trendProductId]); // Dependency on products and trendProductId

  // Responsive cards: stack on mobile, row on desktop
  return (
    <div>
        {contextHolder} {/* Renders message notifications */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" tip="Loading dashboard data..." />
        </div>
      ) : (
        <>
          <Row
            gutter={[isMobile ? 0 : 16, 16]}
            justify={isMobile ? 'center' : 'space-between'}
            style={{ marginBottom: 18 }}
          >
            <Col xs={24} sm={24} md={8}>
              <Card
                size='small'
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  background: '#F5F7FA',
                  marginBottom: isMobile ? 12 : 0
                }}
                bodyStyle={{
                  padding: isMobile ? 12 : 18
                }}
              >
                <AppstoreOutlined
                  style={{
                    color: '#1976d2',
                    fontSize: isMobile ? 24 : 32,
                    marginBottom: 6
                  }}
                />
                <Text type='secondary' style={{ fontSize: isMobile ? 12 : 13 }}>
                  Total Products & Services
                </Text>
                <div style={{ fontWeight: 700, fontSize: isMobile ? 26 : 32 }}>
                  {totalProductsAndServicesCount}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Card
                size='small'
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  background: '#FFF2F0',
                  marginBottom: isMobile ? 12 : 0
                }}
                bodyStyle={{
                  padding: isMobile ? 12 : 18
                }}
              >
                <AlertOutlined
                  style={{
                    color: '#e53935',
                    fontSize: isMobile ? 24 : 32,
                    marginBottom: 6
                  }}
                />
                <Text type='secondary' style={{ fontSize: isMobile ? 12 : 13 }}>
                  Low Stock
                </Text>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#e53935',
                    fontSize: isMobile ? 26 : 32
                  }}
                >
                  {lowStockCount}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <Card
                size='small'
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  background: '#EFF7FE'
                }}
                bodyStyle={{
                  padding: isMobile ? 12 : 18
                }}
              >
                <LineChartOutlined
                  style={{
                    color: '#1890ff',
                    fontSize: isMobile ? 24 : 32,
                    marginBottom: 6
                  }}
                />
                <Text type='secondary' style={{ fontSize: isMobile ? 12 : 13 }}>
                  Inventory Value
                </Text>
                <div style={{ fontWeight: 700, fontSize: isMobile ? 20 : 22 }}>
                  R{totalValue.toFixed(2)}
                </div>
              </Card>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }}>
            Top Sellers (Units Sold)
          </Divider>
          <HighchartsReact
            highcharts={Highcharts}
            options={miniBarOptions}
            containerProps={{ style: { width: '100%' } }}
          />

          <Divider style={{ margin: '18px 0' }}>Monthly Sales Overview</Divider>
          <HighchartsReact
            highcharts={Highcharts}
            options={barChartOptions}
            containerProps={{ style: { width: '100%' } }}
          />
          <Divider>Product Trend</Divider>
          {products.length > 0 ? ( // Only show select if products exist
              <Select
                showSearch
                virtual
                style={{
                  width: '100%',
                  maxWidth: 350,
                  margin: '0 auto 18px auto',
                  display: 'block'
                }}
                placeholder='Select Product'
                value={trendProductId} // Use product ID as the value
                options={products.map(p => ({
                  label: (
                    <span>
                      {productIcon(p)} {p.name}
                    </span>
                  ),
                  value: p.id // Use product ID as the option value
                }))}
                onChange={setTrendProductId} // Directly set the ID when an option is selected
                filterOption={(input, option) =>
                  (option?.label as any)?.props?.children?.[1] // Access the name part of the label
                    ?.toLowerCase()
                    .includes(input.toLowerCase())
                }
                optionLabelProp='label'
                disabled={!isAuthenticated}
              />
          ) : (
              <Text type="secondary">No products or services available for trend analysis.</Text>
          )}

          <HighchartsReact
            highcharts={Highcharts}
            options={trendLineOptions}
            containerProps={{ style: { width: '100%' } }}
          />

          <Divider>
            Alerts{' '}
            <Badge
              count={alerts.length}
              style={{
                backgroundColor: alerts.length > 0 ? '#f5222d' : '#bcbcbc',
                marginLeft: 10
              }}
              showZero
            />
          </Divider>
          {alerts.length === 0 ? (
            <Text type='secondary'>No critical alerts.</Text>
          ) : (
            <List
              itemLayout='horizontal'
              dataSource={alerts}
              renderItem={(item: Product) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={productIcon(item)}
                    title={
                      <span style={{ color: '#E53935', fontWeight: 700 }}>
                        {item.name}
                      </span>
                    }
                    description={
                      <span>
                        <b>Stock:</b> {asDisplayValue(item)} &nbsp;|&nbsp;
                        <b>Min Required:</b> {item.minQty ?? 0}
                      </span>
                    }
                  />
                </List.Item>
              )}
              style={{
                background: '#FDECEA',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

export default POSDashboard