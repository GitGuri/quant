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
import { useCurrency } from '../../contexts/CurrencyContext';


// 🧰 offline utilities
import { fetchWithCache, enqueueRequest, flushQueue } from '../../offline';

const { Title, Text } = Typography;

// A simple debounce utility function to replace the lodash import
const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout | null;
  return function (...args: any[]) {
    const context = this;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

// IMPORTANT: Replace with your actual backend API URL
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

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

  let onTimePaid = 0;
  let onTrack = 0;
  let lateOrOverdue = 0;

  const today = new Date().toISOString().slice(0, 10);

  history.forEach(sale => {
    const due = sale.due_date ? sale.due_date.slice(0, 10) : null;
    const fullyPaid = sale.remaining_credit_amount <= 0;
    if (!due) {
      if (fullyPaid) onTimePaid++;
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

  // Cache of computed scores by customer id
  const [scoreCache, setScoreCache] = useState<Record<number, CreditScoreInfo>>({});

  const { isAuthenticated, user } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // flush queued requests when connection returns
  useEffect(() => {
    const onOnline = () => {
      flushQueue().then(() => {
        if (tab === 'payments') {
          fetchCreditSales();
        } else {
          if (selectedCustomer) fetchCustomerCreditHistory();
          fetchCustomers();
        }
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedCustomer]);

  // --- API Fetching (with offline cache) ---
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthenticated || !token) {
        messageApi.warning('Please log in to load customers.');
        setCustomersList([]);
        return;
      }
      const { data, fromCache } = await fetchWithCache<CustomerBackend[]>(
        'credit:customers',
        `${API_BASE_URL}/api/customers`,
        { headers: getAuthHeaders() }
      );
      const list = (data || []).sort((a, b) => a.name.localeCompare(b.name));
      setCustomersList(list);
      if (fromCache) messageApi.info('Showing cached customers (offline).');
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
      const { data, fromCache } = await fetchWithCache<SaleBackend[]>(
        'credit:outstanding',
        `${API_BASE_URL}/api/credit-sales`,
        { headers: getAuthHeaders() }
      );
      setOutstandingCredits(data || []);
      if (fromCache) messageApi.info('Showing cached credit sales (offline).');
      else messageApi.success('Credit sales loaded.');
    } catch (error) {
      console.error('Failed to fetch credit sales:', error);
      messageApi.error('Failed to load credit sales.');
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
      const key = `credit:history:${selectedCustomer.id}`;
      const url = `${API_BASE_URL}/api/sales/customer/${selectedCustomer.id}/credit-history`;
      const { data, fromCache } = await fetchWithCache<SaleBackend[]>(key, url, { headers: getAuthHeaders() });

      const sanitized = (data || []).map(item => ({
        ...item,
        total_amount: parseFloat(item.total_amount as any),
        remaining_credit_amount: parseFloat(item.remaining_credit_amount as any),
      }));

      setHistoryCredits(
        sanitized.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
      );

      if (fromCache) messageApi.info('Showing cached credit history (offline).');
      else messageApi.success(`Credit history for ${selectedCustomer.name} loaded.`);
    } catch (error) {
      console.error('Failed to fetch customer credit history:', error);
      messageApi.error(`Failed to load credit history for ${selectedCustomer.name}.`);
      setHistoryCredits([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer, isAuthenticated, token, getAuthHeaders, messageApi]);

  // Use debounce to prevent excessive updates while typing
  const debouncedSetSearchText = useCallback(
    debounce((text: string) => setSearchText(text), 300),
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
      const payload = {
        customerId: selectedCredit.customer_id,
        saleId: selectedCredit.id,
        amountPaid: payAmount,
        paymentMethod: 'Cash', // could be made user-selectable
        description: `Payment for Sale ID ${selectedCredit.id}`,
        recordedBy: user?.name,
      };
      const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

      // offline-first: if offline, enqueue; if online but error, also enqueue
      if (!navigator.onLine) {
        await enqueueRequest(`${API_BASE_URL}/api/credit-payments`, 'POST', payload, headers);
        messageApi.info('Offline: payment queued and will sync automatically.');
      } else {
        const res = await fetch(`${API_BASE_URL}/api/credit-payments`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          // if server/network issue, queue it
          await enqueueRequest(`${API_BASE_URL}/api/credit-payments`, 'POST', payload, headers);
          messageApi.info('Network/server issue: payment queued to sync later.');
        } else {
          messageApi.success('Payment recorded successfully!');
        }
      }

      setModalVisible(false);
      setSelectedCredit(null);

      // try to flush & refresh views
      await flushQueue();
      fetchCreditSales();
      if (tab === 'history' && selectedCustomer) {
        fetchCustomerCreditHistory();
      }
    } catch (error) {
      console.error('Error making payment:', error);
      await enqueueRequest(`${API_BASE_URL}/api/credit-payments`, 'POST', {
        customerId: selectedCredit.customer_id,
        saleId: selectedCredit.id,
        amountPaid: parseFloat(paymentAmount),
        paymentMethod: 'Cash',
        description: `Payment for Sale ID ${selectedCredit.id}`,
        recordedBy: user?.name,
      }, { 'Content-Type': 'application/json', ...getAuthHeaders() });
      messageApi.info('Network error: payment queued to sync later.');
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

  // ===== Lazy score tag (Payments tab): fetches history per customer once and caches it (with offline cache) =====
  const CreditScoreTagLazy: React.FC<{ customerId: number }> = ({ customerId }) => {
    const cached = scoreCache[customerId];

    useEffect(() => {
      let ignore = false;
      const load = async () => {
        if (cached || !isAuthenticated || !token) return;
        try {
          const key = `credit:score:hist:${customerId}`;
          const url = `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`;
          const { data } = await fetchWithCache<SaleBackend[]>(key, url, { headers: getAuthHeaders() });
          const info = computeCreditScoreFromHistory(data || []);
          if (!ignore) setScoreCache(prev => ({ ...prev, [customerId]: info }));
        } catch {
          if (!ignore) {
            setScoreCache(prev => ({
              ...prev,
              [customerId]: { score: 50, label: 'Unknown', color: 'default' },
            }));
          }
        }
      };
      load();
      return () => { ignore = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId, isAuthenticated, token]);

    const display = cached ?? { score: 0, label: 'Unknown', color: 'default' };
    return <Tag color={(display.color as any) || 'default'}>{`Score: ${display.score || '—'}${display.score ? ` (${display.label})` : ''}`}</Tag>;
  };
  const { fmt, symbol } = useCurrency();
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
                          <b>{fmt(credit.remaining_credit_amount)}</b>
                        </div>
                        <div>
                          Due:{' '}
                          {credit.due_date ? credit.due_date.split('T')[0] : 'N/A'}
                        </div>
                      </Col>
                      <Col style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <Tag color={color}>{status}</Tag>
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
                  if (isAuthenticated) setCustomerModal(true);
                  else messageApi.error('Authentication required to select customers.');
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
                              Original Amount: <b>{fmt(c.total_amount)}</b>
                            </div>
                            <div>
                              Paid: <b>{fmt(paidAmount)}</b>
                            </div>
                            <div>
                              Due Date: {c.due_date ? c.due_date.split('T')[0] : 'N/A'}
                            </div>
                            {c.remaining_credit_amount > 0 && (
                              <div>
                                Remaining: <b>{fmt(c.remaining_credit_amount)}</b>
                              </div>
                            )}
                          </Col>
                          <Col style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                            <Tag color={color}>{status}</Tag>
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
                Remaining: <b>{fmt(selectedCredit.remaining_credit_amount)}</b>
              </Text>
              <div style={{ margin: '12px 0' }} />
              <Input
                type="number"
                placeholder={`Enter amount (max ${fmt(selectedCredit.remaining_credit_amount)})`}

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
                      (Due: {fmt(item.balance_due)})
                    </Text>
                  )}
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
    if (!token) return true;
    const headers = { Authorization: `Bearer ${token}` };
    // use fetchWithCache so this also works offline (best-effort)
    const key = `credit:guard:${customerId}`;
    const url = `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`;
    const { data } = await fetchWithCache<SaleBackend[]>(key, url, { headers });
    const info = computeCreditScoreFromHistory(data || []);
    return info.score >= minScore;
  } catch {
    // If we cannot compute the score, allow (flip to false for strict mode)
    return true;
  }
}
