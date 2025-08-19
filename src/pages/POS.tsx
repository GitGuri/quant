import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Table,
  Typography,
  Select,
  Tag,
  Divider,
  Grid,
  Form,
  InputNumber,
  message,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  UserAddOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { useAuth } from '../AuthPage';

const useBreakpoint = Grid.useBreakpoint;
const { Title, Text } = Typography;
const { Option } = Select;

// --- START: MODIFIED TYPES TO MATCH BACKEND API ---
interface ProductDB {
  id: number;
  name: string;
  description: string | null;
  unit_price: number;
  cost_price: number | null;
  sku: string | null;
  is_service: boolean;
  stock_quantity: number;
  created_at: Date;
  updated_at: Date;
  tax_rate_id: number | null;
  category: string | null;
  unit: string | null;
  tax_rate_value?: number;
}

interface CustomerFrontend {
  id: string; // keep as string (safer for large IDs)
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  totalInvoiced: number;
  balanceDue?: number;
  creditLimit?: number;
}

type CartItem = (
  | ProductDB
  | {
      id: string; // for custom items
      name: string;
      description: string;
      unit_price: number;
      is_service: boolean;
      tax_rate_value: number;
    }
) & { quantity: number; subtotal: number };

type PaymentType = 'Cash' | 'Bank' | 'Credit';
// --- END: MODIFIED TYPES TO MATCH BACKEND API ---

const API_BASE_URL = 'https://quantnow.onrender.com'; // <-- set your API URL

// ===== Credit Score (frontend-only, flag not block) =====
type ScoreColor = 'green' | 'blue' | 'orange' | 'red' | 'default';
interface CreditScoreInfo {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
  color: ScoreColor;
}
const MIN_SCORE = 60; // threshold to FLAG (not block)

const scoreFromRatio = (ratio: number): CreditScoreInfo => {
  const r = Math.max(0, Math.min(1, ratio));
  const score = Math.round(r * 100);
  if (score > 90) return { score, label: 'Excellent', color: 'green' };
  if (score > 70) return { score, label: 'Good', color: 'blue' };
  if (score > 50) return { score, label: 'Fair', color: 'orange' };
  return { score, label: 'Poor', color: 'red' };
};

interface SaleHistoryRow {
  id: number;
  customer_id: number | string;
  total_amount: number;
  remaining_credit_amount: number;
  due_date: string | null; // ISO
  sale_date: string; // ISO
}

const computeCreditScoreFromHistory = (
  history: SaleHistoryRow[] | undefined | null,
): CreditScoreInfo => {
  if (!history || history.length === 0)
    return { score: 50, label: 'Unknown', color: 'default' };

  const today = new Date().toISOString().slice(0, 10);
  let onTimePaid = 0;
  let onTrack = 0;
  let lateOrOverdue = 0;

  history.forEach((h) => {
    const due = h.due_date ? h.due_date.slice(0, 10) : null;
    const fullyPaid = h.remaining_credit_amount <= 0;

    if (!due) {
      if (fullyPaid) onTimePaid++; // assume neutral-good if no due date but paid
      return;
    }
    if (fullyPaid) {
      if (due >= today) onTimePaid++;
      else lateOrOverdue++;
    } else {
      if (due < today) lateOrOverdue++;
      else onTrack++;
    }
  });

  const total = onTimePaid + onTrack + lateOrOverdue;
  const ratio = total > 0 ? (onTimePaid * 1.0 + onTrack * 0.6) / total : 0.5;
  return scoreFromRatio(ratio);
};

export default function POSScreen() {
  const [messageApi, contextHolder] = message.useMessage();
  const screens = useBreakpoint();

  const [customers, setCustomers] = useState<CustomerFrontend[]>([]);
  const [products, setProducts] = useState<ProductDB[]>([]);

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerFrontend | null>(null);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerForm] = Form.useForm();
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<ProductDB | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productQty, setProductQty] = useState(1);

  // Custom product state
  const [showCustomProductForm, setShowCustomProductForm] = useState(false);
  const [customProductName, setCustomProductName] = useState('');
  const [customProductUnitPrice, setCustomProductUnitPrice] = useState<number>(0);
  const [customProductDescription, setCustomProductDescription] = useState('');
  const [customProductTaxRate, setCustomProductTaxRate] = useState<number>(0.15);

  const [cart, setCart] = useState<CartItem[]>([]);

  const [paymentType, setPaymentType] = useState<PaymentType>('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);

  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // Declare isLoading state
  const [isLoading, setIsLoading] = useState(false);

  // Cache scores by customer id (string)
  const [creditScoreCache, setCreditScoreCache] = useState<
    Record<string, CreditScoreInfo>
  >({});

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // Fetch score & cache when customer is selected
  const fetchAndCacheCustomerScore = useCallback(
    async (customerId: string) => {
      if (!isAuthenticated || !token) return;
      if (creditScoreCache[customerId]) return; // already cached

      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`,
          { headers: getAuthHeaders() },
        );
        if (!resp.ok) throw new Error(`Score fetch failed: ${resp.status}`);
        const history: SaleHistoryRow[] = await resp.json();

        const info = computeCreditScoreFromHistory(history);
        setCreditScoreCache((prev) => ({ ...prev, [customerId]: info }));
      } catch (e) {
        setCreditScoreCache((prev) => ({
          ...prev,
          [customerId]: { score: 50, label: 'Unknown', color: 'default' },
        }));
      }
    },
    [isAuthenticated, token, getAuthHeaders, creditScoreCache],
  );

  useEffect(() => {
    if (selectedCustomer?.id) {
      fetchAndCacheCustomerScore(selectedCustomer.id);
    }
  }, [selectedCustomer?.id, fetchAndCacheCustomerScore]);

  // Fetch customers & products
  useEffect(() => {
    async function fetchCustomers() {
      if (!isAuthenticated || !token) {
        messageApi.warning('Please log in to load customers.');
        setCustomers([]);
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: CustomerFrontend[] = await response.json();
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers:', error);
        messageApi.error('Failed to fetch customers.');
      } finally {
        setIsLoading(false);
      }
    }

    async function fetchProducts() {
      if (!isAuthenticated || !token) {
        messageApi.warning('Please log in to load products.');
        setProducts([]);
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/products-services`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: ProductDB[] = await response.json();
        setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
        messageApi.error('Failed to fetch products.');
      } finally {
        setIsLoading(false);
      }
    }

    if (isAuthenticated && token) {
      fetchCustomers();
      fetchProducts();
    } else {
      setCustomers([]);
      setProducts([]);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi]);

  // Add to cart
  const addToCart = () => {
    if (!isAuthenticated) {
      messageApi.error('Authentication required to add items to cart.');
      return;
    }

    let itemToAdd: CartItem | null = null;

    if (showCustomProductForm) {
      if (!customProductName.trim() || customProductUnitPrice <= 0 || productQty <= 0) {
        messageApi.error(
          'Please enter a valid name, positive price, and positive quantity for the custom item.',
        );
        return;
      }
      itemToAdd = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: customProductName.trim(),
        description: customProductDescription.trim() || 'Custom item',
        unit_price: customProductUnitPrice,
        is_service: false,
        tax_rate_value: customProductTaxRate,
        quantity: productQty,
        subtotal: productQty * customProductUnitPrice * (1 + customProductTaxRate),
      };
    } else {
      if (!selectedProduct || productQty < 1) return;

      const availableQty = selectedProduct.stock_quantity ?? 0;
      const alreadyInCart = cart.find((i) => i.id === selectedProduct.id)?.quantity ?? 0;
      if (productQty + alreadyInCart > availableQty) {
        messageApi.error(
          `Not enough stock for "${selectedProduct.name}". Only ${
            availableQty - alreadyInCart
          } units available.`,
        );
        return;
      }
      itemToAdd = {
        ...selectedProduct,
        quantity: productQty,
        subtotal:
          productQty *
          selectedProduct.unit_price *
          (1 + (selectedProduct.tax_rate_value ?? 0)),
      };
    }

    if (!itemToAdd) return;

    const existing = cart.find((i) => i.id === itemToAdd!.id);
    if (existing) {
      setCart(
        cart.map((i) =>
          i.id === itemToAdd!.id
            ? {
                ...i,
                quantity: i.quantity + itemToAdd!.quantity,
                subtotal:
                  (i.quantity + itemToAdd!.quantity) *
                  i.unit_price *
                  (1 + (i.tax_rate_value ?? 0)),
              }
            : i,
        ),
      );
    } else {
      setCart([...cart, itemToAdd]);
    }

    // reset selectors
    setSelectedProduct(null);
    setProductQty(1);
    setProductModal(false);
    setShowCustomProductForm(false);
    setCustomProductName('');
    setCustomProductUnitPrice(0);
    setCustomProductDescription('');
    setCustomProductTaxRate(0.15);
  };

  const removeFromCart = (id: number | string) =>
    setCart(cart.filter((i) => i.id !== id));

  // Add customer
  const [newCustomerFormInstance] = Form.useForm(); // keep your form instance
  const handleAddCustomer = async (values: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    taxId?: string;
  }) => {
    if (!isAuthenticated || !token) {
      messageApi.error('Authentication required to add new customers.');
      return;
    }
    setIsLoading(true);
    try {
      const existingCustomerResponse = await fetch(
        `${API_BASE_URL}/api/customers?search=${values.phone}`,
        {
          headers: getAuthHeaders(),
        },
      );
      const existingCustomers: CustomerFrontend[] =
        await existingCustomerResponse.json();
      const existing = existingCustomers.find(
        (c) => c.phone?.replace(/\D/g, '') === values.phone.replace(/\D/g, ''),
      );

      if (existing) {
        setSelectedCustomer(existing);
        messageApi.info(
          'Customer with that phone number already exists. Selected existing record.',
        );
      } else {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            name: values.name,
            phone: values.phone,
            email: values.email || null,
            address: values.address || null,
            vatNumber: values.taxId || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.detail || errorData.error || 'Failed to add new customer.',
          );
        }

        const newCustomer: CustomerFrontend = await response.json();
        setCustomers((prev) => [...prev, newCustomer]);
        setSelectedCustomer(newCustomer);
        messageApi.success('New customer added and selected.');
      }
    } catch (error: any) {
      console.error('Error adding customer:', error);
      messageApi.error(error.message || 'Failed to add new customer.');
    } finally {
      setIsLoading(false);
      setCustomerModal(false);
      setShowNewCustomer(false);
      newCustomerForm.resetFields();
    }
  };

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const change = paymentType === 'Cash' ? amountPaid - total : 0;

  const handleSubmit = async () => {
    if (!isAuthenticated || !token) {
      messageApi.error('Authentication required to submit sales.');
      return;
    }
    if (cart.length === 0) {
      messageApi.warning('Add at least one product to the cart');
      return;
    }

    if (paymentType === 'Credit') {
      if (!selectedCustomer) {
        messageApi.error('Customer not selected for credit sale.');
        return;
      }

      // Credit limit check (block if exceeded)
      const currentBalance = selectedCustomer.balanceDue || 0;
      const customerCreditLimit = selectedCustomer.creditLimit || Infinity;
      if (
        customerCreditLimit !== Infinity &&
        currentBalance + total > customerCreditLimit
      ) {
        messageApi.error(
          `Credit limit exceeded for ${selectedCustomer.name}. Current balance: R${currentBalance.toFixed(
            2,
          )}, Credit limit: R${customerCreditLimit.toFixed(
            2,
          )}. This sale would put balance at R${(currentBalance + total).toFixed(
            2,
          )}.`,
        );
        return;
      }

      // Flag low score (DO NOT block)
      try {
        if (selectedCustomer?.id && !creditScoreCache[selectedCustomer.id]) {
          await fetchAndCacheCustomerScore(selectedCustomer.id);
        }
        const info = selectedCustomer?.id
          ? creditScoreCache[selectedCustomer.id]
          : undefined;
        if (info && info.score < MIN_SCORE) {
          messageApi.warning(
            `Customer credit score is ${info.score} (${info.label}). Proceeding anyway — please ensure policy is followed.`,
          );
        }
      } catch {
        // ignore failures — never block on score
      }
    }

    setIsLoading(true);
    try {
      const salePayload = {
        cart: cart.map((item) => {
          const isRealProduct = typeof item.id === 'number';
          return {
            ...(isRealProduct ? { id: item.id } : {}),
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            is_service: (item as any).is_service || false,
            tax_rate_value: (item as any).tax_rate_value ?? 0,
          };
        }),
        paymentType,
        total,
        customer: selectedCustomer
          ? { id: selectedCustomer.id, name: selectedCustomer.name }
          : null,
        amountPaid: paymentType === 'Cash' ? amountPaid : 0,
        change: paymentType === 'Cash' ? change : 0,
        dueDate: paymentType === 'Credit' ? dueDate : null,
        tellerName: 'Dummy Teller',
        branch: 'Dummy Branch',
        companyName: 'DummyCo',
      };

      const response = await fetch(`${API_BASE_URL}/api/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(salePayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit sale.');
      }

      // Re-fetch products for fresh stock
      try {
        const productsResponse = await fetch(`${API_BASE_URL}/products-services`, {
          headers: getAuthHeaders(),
        });
        if (productsResponse.ok) {
          const updatedProductsFromAPI: ProductDB[] =
            await productsResponse.json();
          setProducts(updatedProductsFromAPI);
        }
      } catch (fetchError) {
        console.warn('Error re-fetching products:', fetchError);
      }

      setCart([]);
      setAmountPaid(0);
      setDueDate(null);
      setSelectedCustomer(null);
      setPaymentType('Cash');
      messageApi.success('Sale submitted and recorded successfully!');
    } catch (err: any) {
      console.error('Error during sale submission:', err);
      messageApi.error(err.message || 'Could not save sale.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div style={{ padding: 18, maxWidth: 650, margin: '0 auto' }}>
        <Title level={3}>Point of Sale</Title>

        {/* Customer Select */}
        <Card
          style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => setCustomerModal(true)}
          bodyStyle={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Text strong>
              {selectedCustomer ? selectedCustomer.name : 'Select Customer (Optional)'}
            </Text>
            <div style={{ fontSize: 12, color: '#888' }}>
              {selectedCustomer?.phone}
            </div>
            {selectedCustomer?.balanceDue !== undefined && (
              <div
                style={{
                  fontSize: 12,
                  color: selectedCustomer.balanceDue > 0 ? 'red' : '#888',
                }}
              >
                Outstanding Balance: R{(selectedCustomer.balanceDue || 0).toFixed(2)}
              </div>
            )}
            {selectedCustomer?.creditLimit !== undefined &&
              selectedCustomer.creditLimit > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  Credit Limit: R{(selectedCustomer.creditLimit || 0).toFixed(2)}
                </div>
              )}

            {/* Credit Score Tag (if cached/loaded) */}
            {selectedCustomer?.id && creditScoreCache[selectedCustomer.id] && (
              <div style={{ marginTop: 6 }}>
                <Tag color={creditScoreCache[selectedCustomer.id].color}>
                  {`Score: ${creditScoreCache[selectedCustomer.id].score} (${creditScoreCache[selectedCustomer.id].label})`}
                </Tag>
              </div>
            )}
          </div>
          <UserAddOutlined />
        </Card>

        {/* Product Select */}
        <Card
          style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => {
            setSelectedProduct(null);
            setShowCustomProductForm(false);
            setProductModal(true);
          }}
          bodyStyle={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Text strong>
              {selectedProduct ? selectedProduct.name : 'Select Product'}
            </Text>
            <div style={{ fontSize: 12, color: '#888' }}>
              {selectedProduct ? `Price: R${selectedProduct.unit_price.toFixed(2)}` : ''}{' '}
            </div>
            {selectedProduct && (
              <div style={{ fontSize: 12, color: '#888' }}>
                Stock: {selectedProduct.stock_quantity ?? 0} {selectedProduct.unit || ''}
              </div>
            )}
          </div>
          <ShoppingCartOutlined />
        </Card>

        {/* Quantity & Add to Cart */}
        <Row gutter={6} align="middle" style={{ marginBottom: 10 }}>
          <Col>
            <Button
              size="small"
              onClick={() => setProductQty((q) => Math.max(1, q - 1))}
              disabled={
                !isAuthenticated ||
                isLoading ||
                (!selectedProduct && !showCustomProductForm)
              }
            >
              -
            </Button>
          </Col>
          <Col>
            <InputNumber
              min={1}
              value={productQty}
              onChange={(value) => setProductQty(value ?? 1)}
              style={{ width: 60 }}
              disabled={
                !isAuthenticated ||
                isLoading ||
                (!selectedProduct && !showCustomProductForm)
              }
            />
          </Col>
          <Col>
            <Button
              size="small"
              onClick={() => {
                const max = selectedProduct?.stock_quantity ?? Infinity;
                setProductQty((q) => Math.min(q + 1, max));
              }}
              disabled={
                !isAuthenticated ||
                isLoading ||
                (!selectedProduct && !showCustomProductForm)
              }
            >
              +
            </Button>
          </Col>
          <Col>
            <Button
              type="primary"
              onClick={addToCart}
              disabled={
                !isAuthenticated ||
                isLoading ||
                (!selectedProduct && !showCustomProductForm) ||
                (showCustomProductForm &&
                  (!customProductName.trim() || customProductUnitPrice <= 0))
              }
            >
              Add to Cart
            </Button>
          </Col>
        </Row>

        {/* Cart */}
        <Card title="Cart" style={{ marginBottom: 14 }}>
          {isLoading && (
            <Spin
              tip="Loading products and customers..."
              style={{ display: 'block', margin: '20px auto' }}
            />
          )}
          {!isLoading && screens.md ? (
            <Table
              dataSource={cart}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Product', dataIndex: 'name' },
                { title: 'Qty', dataIndex: 'quantity' },
                {
                  title: 'Unit Price',
                  dataIndex: 'unit_price',
                  render: (price: number) => `R${price.toFixed(2)}`,
                },
                {
                  title: 'Total',
                  render: (_: any, r: any) => `R${r.subtotal.toFixed(2)}`,
                },
                {
                  title: 'Action',
                  render: (_: any, r: any) => (
                    <Button
                      danger
                      size="small"
                      onClick={() => removeFromCart(r.id)}
                      disabled={!isAuthenticated}
                    >
                      Remove
                    </Button>
                  ),
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={3}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell>R{total.toFixed(2)}</Table.Summary.Cell>
                  <Table.Summary.Cell />
                </Table.Summary.Row>
              )}
            />
          ) : !isLoading && cart.length === 0 ? (
            <Text type="secondary">Cart is empty</Text>
          ) : (
            !isLoading &&
            cart.map((item) => (
              <Card key={item.id} size="small" style={{ marginBottom: 6 }}>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Text strong>{item.name}</Text>{' '}
                    <Tag>
                      {item.quantity} x R{item.unit_price.toFixed(2)}{' '}
                    </Tag>
                    <div>Total: R{item.subtotal.toFixed(2)}</div>
                  </Col>
                  <Col>
                    <Button
                      size="small"
                      danger
                      onClick={() => removeFromCart(item.id)}
                      disabled={!isAuthenticated}
                    >
                      Remove
                    </Button>
                  </Col>
                </Row>
              </Card>
            ))
          )}
        </Card>

        {/* Payment and Submit */}
        <Card>
          <Row gutter={12} align="middle">
            <Col flex="1 1 auto">
              <Text strong>Payment Method</Text>
              <Select
                value={paymentType}
                onChange={setPaymentType}
                style={{ width: '100%' }}
                disabled={!isAuthenticated || isLoading}
              >
                <Option value="Cash">Cash</Option>
                <Option value="Bank">Bank</Option>
                <Option value="Credit">Credit</Option>
              </Select>
            </Col>

            {paymentType === 'Cash' && (
              <Col flex="1 1 auto">
                <Text>Amount Paid</Text>
                <InputNumber
                  min={0}
                  value={amountPaid}
                  onChange={(value) => setAmountPaid(value ?? 0)}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                />
                <div>
                  <Text strong>
                    Change:&nbsp;
                    <span style={{ color: change < 0 ? 'red' : 'green' }}>
                      {change < 0 ? 'Insufficient' : `R${change.toFixed(2)}`}
                    </span>
                  </Text>
                </div>
              </Col>
            )}

            {paymentType === 'Credit' && (
              <Col flex="1 1 auto">
                <Text>Due Date</Text>
                <Input
                  type="date"
                  value={dueDate || ''}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                />
                {selectedCustomer && (
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    {selectedCustomer.id &&
                      creditScoreCache[selectedCustomer.id] && (
                        <Tag color={creditScoreCache[selectedCustomer.id].color}>
                          {`Score: ${creditScoreCache[selectedCustomer.id].score} (${creditScoreCache[selectedCustomer.id].label})`}
                        </Tag>
                      )}
                    <Text type="warning" style={{ color: 'orange' }}>
                      Credit selected. Please review customer’s score and limit.
                    </Text>
                  </div>
                )}
              </Col>
            )}
          </Row>

          <Divider />
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <Text strong>Total: R{total.toFixed(2)}</Text>
          </div>
          <Button
            type="primary"
            block
            onClick={handleSubmit}
            disabled={
              !isAuthenticated ||
              isLoading ||
              cart.length === 0 ||
              (paymentType === 'Cash' && amountPaid < total) ||
              (paymentType === 'Credit' && !selectedCustomer)
            }
          >
            Submit Sale
          </Button>
        </Card>

        {/* ----------- Modals ----------- */}
        <Modal
          open={customerModal}
          onCancel={() => {
            setCustomerModal(false);
            setShowNewCustomer(false);
          }}
          footer={null}
          title="Select Customer"
        >
          <Input
            placeholder="Search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            style={{ marginBottom: 10 }}
            disabled={!isAuthenticated || isLoading}
          />
          <div style={{ maxHeight: 270, overflowY: 'auto' }}>
            {customers
              .filter(
                (c) =>
                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.phone?.includes(customerSearch) ||
                  c.email?.toLowerCase().includes(customerSearch.toLowerCase()),
              )
              .map((c) => (
                <Card
                  key={c.id}
                  style={{ marginBottom: 7, cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setCustomerModal(false);
                    // score will auto-load via useEffect
                  }}
                  size="small"
                  bodyStyle={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <Text strong>{c.name}</Text>
                    <div style={{ fontSize: 13, color: '#888' }}>{c.phone}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{c.email}</div>
                    {/* Show cached score if present */}
                    {creditScoreCache[c.id] && (
                      <div style={{ marginTop: 6 }}>
                        <Tag color={creditScoreCache[c.id].color}>
                          {`Score: ${creditScoreCache[c.id].score} (${creditScoreCache[c.id].label})`}
                        </Tag>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
          </div>

          {!showNewCustomer ? (
            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => setShowNewCustomer(true)}
              disabled={!isAuthenticated || isLoading}
            >
              Add New Customer
            </Button>
          ) : (
            <Form
              form={newCustomerForm}
              onFinish={handleAddCustomer}
              layout="vertical"
              style={{ marginTop: 12 }}
            >
              <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="phone" label="Phone Number" rules={[{ required: true }]}>
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email (Optional)"
                rules={[{ type: 'email', message: 'Please enter a valid email!' }]}
              >
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="address" label="Address (Optional)">
                <Input.TextArea rows={2} disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="taxId" label="Tax ID / VAT Number (Optional)">
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Button htmlType="submit" type="primary" block disabled={!isAuthenticated || isLoading}>
                Save & Select
              </Button>
            </Form>
          )}
        </Modal>

        <Modal
          open={productModal}
          onCancel={() => {
            setProductModal(false);
            setShowCustomProductForm(false);
            setSelectedProduct(null);
            setProductQty(1);
            setCustomProductName('');
            setCustomProductUnitPrice(0);
            setCustomProductDescription('');
            setCustomProductTaxRate(0.15);
          }}
          footer={null}
          title="Select Product"
        >
          {!showCustomProductForm ? (
            <>
              <Input
                placeholder="Search existing products"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ marginBottom: 10 }}
                disabled={!isAuthenticated || isLoading}
              />
              <div style={{ maxHeight: 270, overflowY: 'auto', marginBottom: 10 }}>
                {products.length === 0 ? (
                  <Text type="secondary">No products found. Check your API endpoint.</Text>
                ) : (
                  products
                    .filter(
                      (p) =>
                        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                        p.sku?.toLowerCase().includes(productSearch.toLowerCase()),
                    )
                    .map((p) => (
                      <Card
                        key={p.id}
                        style={{ marginBottom: 7, cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedProduct(p);
                          setProductQty(1);
                          setProductModal(false);
                        }}
                        size="small"
                        bodyStyle={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <Text strong>{p.name}</Text>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            Price: R{p.unit_price.toFixed(2)} {p.is_service ? '(Service)' : ''}
                          </div>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            Stock: {p.stock_quantity ?? 0} {p.unit || ''}
                          </div>
                        </div>
                      </Card>
                    ))
                )}
              </div>
              <Button
                block
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setShowCustomProductForm(true)}
                disabled={!isAuthenticated || isLoading}
              >
                Add Custom Product/Service
              </Button>
            </>
          ) : (
            <Form layout="vertical">
              <Form.Item label="Custom Product/Service Name" required>
                <Input
                  value={customProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  placeholder="E.g., Custom Repair, Consultation Fee"
                  disabled={!isAuthenticated || isLoading}
                />
              </Form.Item>
              <Form.Item label="Unit Price" required>
                <InputNumber
                  min={0.01}
                  step={0.01}
                  value={customProductUnitPrice}
                  onChange={(value) => setCustomProductUnitPrice(value ?? 0)}
                  style={{ width: '100%' }}
                  formatter={(value) => `R ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value) => (value || '').replace(/R\s?|(,*)/g, '') as unknown as number}
                  disabled={!isAuthenticated || isLoading}
                />
              </Form.Item>
              <Form.Item label="Description (Optional)">
                <Input.TextArea
                  rows={2}
                  value={customProductDescription}
                  onChange={(e) => setCustomProductDescription(e.target.value)}
                  placeholder="Brief description of the custom item"
                  disabled={!isAuthenticated || isLoading}
                />
              </Form.Item>
              <Form.Item label="Tax Rate" required>
                <Select
                  value={customProductTaxRate.toString()}
                  onChange={(value) => setCustomProductTaxRate(parseFloat(value))}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                >
                  <Option value="0">0%</Option>
                  <Option value="0.15">15%</Option>
                </Select>
              </Form.Item>
              <Button
                type="primary"
                block
                onClick={addToCart}
                disabled={
                  !isAuthenticated ||
                  isLoading ||
                  !customProductName.trim() ||
                  customProductUnitPrice <= 0 ||
                  productQty <= 0
                }
              >
                Add Custom Item to Cart
              </Button>
              <Button
                block
                type="default"
                style={{ marginTop: 8 }}
                onClick={() => setShowCustomProductForm(false)}
                disabled={!isAuthenticated || isLoading}
              >
                Back to Existing Products
              </Button>
            </Form>
          )}
        </Modal>
      </div>
    </>
  );
}
