import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card,
  Tabs,
  Tag,
  Button,
  Modal,
  Input,
  Spin,
  Typography,
  message,
  Row,
  Col,
} from 'antd';
import { UserOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../../AuthPage';
import axios from 'axios';

const { Title, Text } = Typography;

// A simple debounce utility function to replace the lodash import
const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout | null;
  return function (...args: any[]) {
    const context = this;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, delay);
  };
};

// IMPORTANT: Replace with your actual backend API URL
const API_BASE_URL = 'https://quantnow.onrender.com';

// --- Updated Interfaces to match Backend (public.customers, public.sales) ---
interface CustomerBackend {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  total_invoiced: number;
  balance_due: number; // From public.customers
}

interface SaleBackend {
  id: number; // Sale ID
  customer_id: number; // Customer ID
  customer_name: string; // From JOIN in backend
  total_amount: number;
  payment_method: 'Cash' | 'Credit' | 'Bank'; // Renamed from payment_type to match the backend
  remaining_credit_amount: number; // From public.sales
  due_date: string | null;
  sale_date: string; // Renamed from created_at to match the backend
}

// ===== Credit Score Types & Helpers =====
type ScoreColor = 'green' | 'blue' | 'orange' | 'red' | 'default';
interface CreditScoreInfo {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
  color: ScoreColor;
}

const scoreFromRatio = (ratio: number): CreditScoreInfo => {
  // Clamp ratio 0..1 and map to score
  const r = Math.max(0, Math.min(1, ratio));
  const score = Math.round(r * 100);
  if (score > 90) return { score, label: 'Excellent', color: 'green' };
  if (score > 70) return { score, label: 'Good', color: 'blue' };
  if (score > 50) return { score, label: 'Fair', color: 'orange' };
  return { score, label: 'Poor', color: 'red' };
};

// Heuristic: compute a score from credit history we already have
const computeCreditScoreFromHistory = (history: SaleBackend[] | undefined | null): CreditScoreInfo => {
  if (!history || history.length === 0) return { score: 50, label: 'Unknown', color: 'default' };

  let onTimePaid = 0;   // fully paid before or on the due date
  let onTrack = 0;      // not fully paid yet but due date still in future/today
  let lateOrOverdue = 0; // overdue or likely late

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  history.forEach(sale => {
    const due = sale.due_date ? sale.due_date.slice(0, 10) : null;
    const fullyPaid = sale.remaining_credit_amount <= 0;
    if (!due) {
      // no due date → treat fully paid as on-time unknown, unpaid as neutral
      if (fullyPaid) onTimePaid++;
      return;
    }
    if (fullyPaid) {
      // If it's fully paid and we can't tell pay date, assume on-time if due is not in the past
      if (due >= today) onTimePaid++;
      else lateOrOverdue++; // conservative penalty if due already past
    } else {
      // Not fully paid yet
      if (due < today) lateOrOverdue++; // overdue
      else onTrack++; // still on track
    }
  });

  const total = onTimePaid + onTrack + lateOrOverdue;
  const ratio = total > 0 ? (onTimePaid * 1.0 + onTrack * 0.6) / total : 0.5; // weight onTrack as partial credit
  return scoreFromRatio(ratio);
};

// ===== Component =====
const CreditPaymentsScreen: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [tab, setTab] = useState<'payments' | 'history'>('payments');
  const [outstandingCredits, setOutstandingCredits] = useState<SaleBackend[]>([]);
  const [historyCredits, setHistoryCredits] = useState<SaleBackend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCredit, setSelectedCredit] = useState<SaleBackend | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerBackend | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [customersList, setCustomersList] = useState<CustomerBackend[]>([]);

  // Cache of computed scores by customer id (so we can show on Payments tab without changing backend)
  const [scoreCache, setScoreCache] = useState<Record<number, CreditScoreInfo>>({});

  const { isAuthenticated, user } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const getAuthHeaders = useCallback(() => {
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, [token]);

  // --- API Fetching Functions ---
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthenticated || !token) {
        messageApi.warning('Please log in to load customers.');
        setCustomersList([]);
        return;
      }
      const response = await axios.get<CustomerBackend[]>(
        `${API_BASE_URL}/api/customers`,
        { headers: getAuthHeaders() }
      );
      setCustomersList(response.data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      messageApi.error('Failed to load customers.');
      setCustomersList([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi]);

  const fetchCreditSales = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthenticated || !token) {
        messageApi.warning('Please log in to load credits.');
        setOutstandingCredits([]);
        setLoading(false);
        return;
      }
      const response = await axios.get<SaleBackend[]>(
        `${API_BASE_URL}/api/credit-sales`,
        { headers: getAuthHeaders() }
      );

      if (response.data.length === 0) {
        console.warn('API returned an empty array for credit sales.');
      }

      setOutstandingCredits(response.data);
      messageApi.success('Credit sales loaded successfully.');
    } catch (error) {
      console.error('Failed to fetch credit sales:', error);
      messageApi.error('Failed to load credit sales. Please check your backend API.');
      setOutstandingCredits([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi]);

  const fetchCustomerCreditHistory = useCallback(async () => {
    if (!selectedCustomer?.id || !isAuthenticated || !token) {
      setHistoryCredits([]);
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get<SaleBackend[]>(
        `${API_BASE_URL}/api/sales/customer/${selectedCustomer.id}/credit-history`,
        { headers: getAuthHeaders() }
      );

      // The backend should now return numbers, but we'll do an extra check to be safe
      const sanitizedData = response.data.map(item => ({
        ...item,
        total_amount: parseFloat(item.total_amount as any),
        remaining_credit_amount: parseFloat(item.remaining_credit_amount as any),
      }));

      setHistoryCredits(
        sanitizedData.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
      );
      messageApi.success(`Credit history for ${selectedCustomer.name} loaded.`);
    } catch (error) {
      console.error('Failed to fetch customer credit history:', error);
      messageApi.error(`Failed to load credit history for ${selectedCustomer.name}.`);
      setHistoryCredits([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer, isAuthenticated, token, getAuthHeaders, messageApi]);

  // Use debounce to prevent excessive API calls while typing
  const debouncedSetSearchText = useCallback(
    debounce((text: string) => {
      setSearchText(text);
    }, 300),
    []
  );

  useEffect(() => {
    if (tab === 'payments') {
      fetchCreditSales();
    } else if (tab === 'history') {
      fetchCustomers();
    }
  }, [tab, fetchCreditSales, fetchCustomers]);

  useEffect(() => {
    if (tab === 'history' && selectedCustomer) {
      fetchCustomerCreditHistory();
    } else if (tab === 'history' && !selectedCustomer) {
      setHistoryCredits([]);
    }
  }, [tab, selectedCustomer, fetchCustomerCreditHistory]);

  const filteredCustomers = customersList.filter(c =>
    c.name?.toLowerCase().includes(searchText.toLowerCase())
  );

  const openModal = (credit: SaleBackend) => {
    if (!isAuthenticated) {
      messageApi.error('Authentication required to make payments.');
      return;
    }
    setSelectedCredit(credit);
    setPaymentAmount('');
    setModalVisible(true);
  };

  const handlePayment = async () => {
    if (!selectedCredit || !isAuthenticated || !token) {
      messageApi.error('Authentication or credit not selected.');
      return;
    }
    const payAmount = parseFloat(paymentAmount);
    if (!payAmount || payAmount <= 0 || payAmount > selectedCredit.remaining_credit_amount) {
      messageApi.warning('Invalid payment amount or exceeds remaining balance.');
      return;
    }

    setLoading(true);
    try {
      // --- FIX: Corrected API endpoint to credit-payments ---
      await axios.post(
        `${API_BASE_URL}/api/credit-payments`,
        {
          customerId: selectedCredit.customer_id,
          saleId: selectedCredit.id,
          amountPaid: payAmount,
          paymentMethod: 'Cash', // This could be a dynamic user selection
          description: `Payment for Sale ID ${selectedCredit.id}`,
          recordedBy: user?.name,
        },
        { headers: getAuthHeaders() }
      );

      messageApi.success('Payment recorded successfully!');
      setModalVisible(false);
      setSelectedCredit(null);
      // Refresh the data after a successful payment
      fetchCreditSales();
      if (tab === 'history' && selectedCustomer) {
        fetchCustomerCreditHistory();
      }
    } catch (error) {
      console.error('Error making payment:', error);
      messageApi.error('Failed to record payment.');
    } finally {
      setLoading(false);
    }
  };

  const dueStatus = (credit: SaleBackend): [string, string] => {
    if (credit.remaining_credit_amount <= 0) return ['Paid', 'blue'];
    if (!credit.due_date) return ['On Time', 'green'];
    const today = new Date().toISOString().slice(0, 10);
    const due = credit.due_date.slice(0, 10);
    if (due < today) return ['Overdue', 'red'];
    if (due === today) return ['Due Today', 'gold'];
    return ['On Time', 'green'];
  };

  const cardStyle: React.CSSProperties = {
    marginBottom: 16,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    cursor: 'pointer',
  };

  // ===== Lazy score tag (Payments tab): fetches history per customer once and caches it =====
  const CreditScoreTagLazy: React.FC<{ customerId: number }> = ({ customerId }) => {
    const cached = scoreCache[customerId];

    useEffect(() => {
      let ignore = false;
      const load = async () => {
        if (cached || !isAuthenticated || !token) return;
        try {
          const resp = await axios.get<SaleBackend[]>(
            `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`,
            { headers: getAuthHeaders() }
          );
          const info = computeCreditScoreFromHistory(resp.data);
          if (!ignore) {
            setScoreCache(prev => ({ ...prev, [customerId]: info }));
          }
        } catch (e) {
          if (!ignore) {
            setScoreCache(prev => ({
              ...prev,
              [customerId]: { score: 50, label: 'Unknown', color: 'default' },
            }));
          }
        }
      };
      load();
      return () => {
        ignore = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId, isAuthenticated, token]);

    const display = cached ?? { score: 0, label: 'Unknown', color: 'default' };
    return <Tag color={display.color}>{`Score: ${display.score || '—'}${display.score ? ` (${display.label})` : ''}`}</Tag>;
  };

  // ===== Derived score (History tab): uses already fetched history =====
  const selectedCustomerScore = useMemo(() => {
    return computeCreditScoreFromHistory(historyCredits);
  }, [historyCredits]);

  return (
    <>
      {contextHolder}
      <div style={{ padding: 12, maxWidth: 480, margin: '0 auto' }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 8 }}>
          Credit Payments
        </Title>

        <Tabs
          activeKey={tab}
          onChange={(key) => {
            setTab(key as 'payments' | 'history');
            setSelectedCustomer(null);
            setSearchText('');
          }}
          centered
          items={[
            { key: 'payments', label: 'Payments' },
            { key: 'history', label: 'History' },
          ]}
          style={{ marginBottom: 18 }}
        />

        <div style={{ minHeight: 380 }}>
          {tab === 'payments' ? (
            loading ? (
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <Spin />
              </div>
            ) : outstandingCredits.length === 0 ? (
              <Text
                type="secondary"
                style={{ display: 'block', marginTop: 40, textAlign: 'center' }}
              >
                No outstanding credit sales found.
              </Text>
            ) : (
              outstandingCredits.map((credit) => {
                const [status, color] = dueStatus(credit);
                return (
                  <Card
                    key={credit.id}
                    style={cardStyle}
                    onClick={() => openModal(credit)}
                    styles={{ body: { padding: 16 } }}
                  >
                    <Row align="middle" wrap={false}>
                      <Col flex="auto">
                        <Text strong style={{ color: '#111' }}>
                          {credit.customer_name}
                        </Text>
                        <div>
                          Amount Due:{' '}
                          <b>R{credit.remaining_credit_amount.toFixed(2)}</b>
                        </div>
                        <div>
                          Due:{' '}
                          {credit.due_date ? credit.due_date.split('T')[0] : 'N/A'}
                        </div>
                      </Col>
                      <Col style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <Tag color={color}>{status}</Tag>
                        {/* Lazy score tag per customer (cached) */}
                        <CreditScoreTagLazy customerId={credit.customer_id} />
                      </Col>
                    </Row>
                  </Card>
                );
              })
            )
          ) : (
            <>
              {/* Customer Picker */}
              <Card
                style={{
                  ...cardStyle,
                  padding: 8,
                  cursor: 'pointer',
                  marginBottom: 16,
                }}
                onClick={() => {
                  if (isAuthenticated) {
                    setCustomerModal(true);
                  } else {
                    messageApi.error('Authentication required to select customers.');
                  }
                }}
              >
                <Row align="middle">
                  <Col>
                    <UserOutlined style={{ fontSize: 18, marginRight: 8 }} />
                    {selectedCustomer ? `Customer: ${selectedCustomer.name}` : 'Select Customer'}
                  </Col>
                  <Col flex="auto" style={{ textAlign: 'right' }}>
                    <SearchOutlined />
                  </Col>
                </Row>
              </Card>

              {/* Credit History */}
              {loading && selectedCustomer ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}>
                  <Spin />
                </div>
              ) : selectedCustomer && historyCredits.length > 0 ? (
                <>
                  {/* Show score for the selected customer */}
                  <div style={{ marginBottom: 8, textAlign: 'right' }}>
                    <Tag color={selectedCustomerScore.color}>
                      {`Score: ${selectedCustomerScore.score} (${selectedCustomerScore.label})`}
                    </Tag>
                  </div>

                  {historyCredits.map((c) => {
                    const [status, color] = dueStatus(c);
                    const paidAmount = c.total_amount - c.remaining_credit_amount;
                    return (
                      <Card
                        key={`${c.id}-${c.sale_date}`}
                        style={cardStyle}
                        onClick={() => openModal(c)}
                        styles={{ body: { padding: 16 } }}
                      >
                        <Row align="middle" wrap={false}>
                          <Col flex="auto">
                            <Text strong>{c.customer_name}</Text>
                            <div>
                              Original Amount: <b>R{c.total_amount.toFixed(2)}</b>
                            </div>
                            <div>
                              Paid: <b>R{paidAmount.toFixed(2)}</b>
                            </div>
                            <div>
                              Due Date: {c.due_date ? c.due_date.split('T')[0] : 'N/A'}
                            </div>
                            {c.remaining_credit_amount > 0 && (
                              <div>
                                Remaining: <b>R{c.remaining_credit_amount.toFixed(2)}</b>
                              </div>
                            )}
                          </Col>
                          <Col style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                            <Tag color={color}>{status}</Tag>
                            {/* Also show score on each card for consistency */}
                            <Tag color={selectedCustomerScore.color}>
                              {`Score: ${selectedCustomerScore.score} (${selectedCustomerScore.label})`}
                            </Tag>
                          </Col>
                        </Row>
                      </Card>
                    );
                  })}
                </>
              ) : (
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    marginTop: 40,
                    textAlign: 'center',
                  }}
                >
                  {selectedCustomer
                    ? 'No previous credits found for this customer.'
                    : 'Please select a customer to view their history.'}
                </Text>
              )}
            </>
          )}
        </div>

        {/* Payment Modal */}
        <Modal
          open={modalVisible}
          centered
          footer={null}
          onCancel={() => setModalVisible(false)}
          destroyOnHidden
          width={340}
          styles={{ body: { padding: 24 } }}
        >
          {selectedCredit && (
            <>
              <Title level={5} style={{ marginBottom: 4 }}>
                Pay {selectedCredit.customer_name}
              </Title>
              <Text>
                Remaining: <b>R{selectedCredit.remaining_credit_amount.toFixed(2)}</b>
              </Text>
              <div style={{ margin: '12px 0' }} />
              <Input
                type="number"
                placeholder={`Enter amount (max R${selectedCredit.remaining_credit_amount.toFixed(2)})`}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{ margin: '12px 0 6px 0' }}
                min={0}
                max={selectedCredit.remaining_credit_amount}
                disabled={!isAuthenticated || loading}
              />
              <Button type="primary" block onClick={handlePayment} disabled={!isAuthenticated || loading}>
                Confirm Payment
              </Button>
            </>
          )}
        </Modal>

        {/* Customer Selector Modal */}
        <Modal
          open={customerModal}
          centered
          footer={null}
          onCancel={() => setCustomerModal(false)}
          destroyOnHidden
          width={340}
          styles={{ body: { padding: 20 } }}
        >
          <Title level={5} style={{ marginBottom: 12 }}>
            Select Customer
          </Title>
          <Input
            placeholder="Search by name..."
            value={searchText}
            allowClear
            onChange={(e) => debouncedSetSearchText(e.target.value)}
            style={{ marginBottom: 10 }}
            disabled={!isAuthenticated}
          />
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((item) => (
                <Card
                  key={item.id}
                  style={{ marginBottom: 8, cursor: 'pointer', padding: 8 }}
                  styles={{ body: { padding: 10 } }}
                  onClick={() => {
                    if (isAuthenticated) {
                      setSelectedCustomer(item);
                      setCustomerModal(false);
                      setHistoryCredits([]);
                      setLoading(true);
                    } else {
                      messageApi.error('Authentication required to select customers.');
                    }
                  }}
                >
                  <Text>{item.name}</Text>
                  {item.balance_due > 0 && (
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      (Due: R{item.balance_due.toFixed(2)})
                    </Text>
                  )}
                  {/* Optional: if you want a quick cached score in the picker too */}
                  {scoreCache[item.id] && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color={scoreCache[item.id].color}>
                        {`Score: ${scoreCache[item.id].score} (${scoreCache[item.id].label})`}
                      </Tag>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <Text type="secondary">No customers found.</Text>
            )}
          </div>
        </Modal>
      </div>
    </>
  );
};

export default CreditPaymentsScreen;

/**
 * ===== FRONTEND-ONLY GUARD FOR NEW CREDIT SALES =====
 * Import this in your POS/Checkout file and call before allowing "payment_method = Credit".
 *
 * Example:
 *   const ok = await canCustomerTakeNewCredit(customerId, token);
 *   if (!ok) { show message & block "Credit" option }
 */
export async function canCustomerTakeNewCredit(
  customerId: number,
  token?: string,
  minScore: number = 60,
): Promise<boolean> {
  try {
    if (!token) return true; // if not authenticated context here, don't hard-block
    const headers = { Authorization: `Bearer ${token}` };
    const resp = await axios.get<SaleBackend[]>(
      `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`,
      { headers }
    );
    const info = computeCreditScoreFromHistory(resp.data);
    return info.score >= minScore;
  } catch {
    // If we cannot compute the score, allow but you can flip to false if you prefer strict
    return true;
  }
}
