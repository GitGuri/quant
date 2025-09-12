import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Tag, Modal, Input, Typography, Row, Col,
  message, Grid, Empty, Spin, Table, Form, InputNumber, DatePicker, Drawer, Tabs
} from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import { useAuth } from '../../AuthPage';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { RangePicker } = DatePicker;

const API_BASE_URL = 'https://quantnow.onrender.com';

interface Teller {
  id: string;           // users.user_id
  name: string;
  email: string;
  phone: string;
  position: string;
  userRole: 'teller' | 'manager';
  branch: string;
}

interface ExpectedCash {
  cash: number;
  bank: number;
  credit: number;
}

/** Drawer data types */
interface ReconRow {
  day: string;                 // recon_date
  expected_cash: number;
  counted_cash: number;
  variance: number;            // negative = short, positive = over
  notes: string | null;
  recorded_by?: string;
  created_at?: string;
}

interface MissedRow {
  day: string;                 // a date within range with sales but no reconciliation
  cash: number;                // expected cash that day
  bank: number;
  credit: number;
}

/** ---- helpers ---- */
const n = (v: any) => Number(v ?? 0);                     // safe number
const money = (v: any) => `R${n(v).toFixed(2)}`;          // money format
const mapRecon = (r: any): ReconRow => ({
  day: r.day,
  expected_cash: n(r.expected_cash),
  counted_cash: n(r.counted_cash),
  variance: n(r.variance),
  notes: r.notes ?? null,
  recorded_by: r.recorded_by,
  created_at: r.created_at,
});
const mapMissed = (r: any): MissedRow => ({
  day: r.day,
  cash: n(r.cash),
  bank: n(r.bank),
  credit: n(r.credit),
});

export default function CashInScreen() {
  const [messageApi, contextHolder] = message.useMessage();
  const screens = useBreakpoint();
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [tellers, setTellers] = useState<Teller[]>([]);
  const [tellerExpectedCash, setTellerExpectedCash] = useState<Record<string, ExpectedCash>>({});
  const [bizDate, setBizDate] = useState<Dayjs>(dayjs());  // dashboard date (defaults to today)

  const [reconciliationModalVisible, setReconciliationModalVisible] = useState(false);
  const [selectedTeller, setSelectedTeller] = useState<Teller | null>(null);
  const [countedCash, setCountedCash] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');

  const [loadingTellers, setLoadingTellers] = useState(true);
  const [loadingExpectedCash, setLoadingExpectedCash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tellerSearch, setTellerSearch] = useState('');

  /** Inspector (drawer) state */
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTeller, setInspectorTeller] = useState<Teller | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  const [histLoading, setHistLoading] = useState(false);
  const [histRows, setHistRows] = useState<ReconRow[]>([]);

  const [missLoading, setMissLoading] = useState(false);
  const [missRows, setMissRows] = useState<MissedRow[]>([]);

  const [shortLoading, setShortLoading] = useState(false);
  const [shortRows, setShortRows] = useState<ReconRow[]>([]);
  const [shortTotals, setShortTotals] = useState({ days: 0, total_expected: 0, total_counted: 0, total_shortage: 0 });

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // 1) Load tellers who made sales on bizDate (your existing endpoint)
  const fetchTellers = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setTellers([]);
      setLoadingTellers(false);
      return;
    }
    setLoadingTellers(true);
    try {
      const res = await axios.get<Teller[]>(
        `${API_BASE_URL}/api/tellers`,
        { headers: getAuthHeaders(), params: { date: bizDate.format('YYYY-MM-DD') } }
      );
      setTellers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch tellers:', err);
      messageApi.error('Failed to load tellers.');
      setTellers([]);
    } finally {
      setLoadingTellers(false);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi, bizDate]);

  // 2) Load expected cash map for bizDate (your existing endpoint)
  const fetchExpectedCash = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setTellerExpectedCash({});
      setLoadingExpectedCash(false);
      return;
    }
    setLoadingExpectedCash(true);
    try {
      const res = await axios.get<Record<string, any>>(
        `${API_BASE_URL}/api/reconciliation/expected`,
        {
          headers: getAuthHeaders(),
          params: { date: bizDate.format('YYYY-MM-DD') },
        }
      );
      // coerce numbers in map
      const raw = res.data || {};
      const coerced: Record<string, ExpectedCash> = {};
      Object.keys(raw).forEach(k => {
        coerced[k] = {
          cash: n(raw[k]?.cash),
          bank: n(raw[k]?.bank),
          credit: n(raw[k]?.credit),
        };
      });
      setTellerExpectedCash(coerced);
    } catch (err) {
      console.error('Failed to fetch expected cash:', err);
      messageApi.error('Failed to load expected cash data.');
      setTellerExpectedCash({});
    } finally {
      setLoadingExpectedCash(false);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi, bizDate]);

  useEffect(() => { fetchTellers(); }, [fetchTellers]);
  useEffect(() => { fetchExpectedCash(); }, [fetchExpectedCash]);

  /** Drawer loaders */
  const fromStr = range[0].format('YYYY-MM-DD');
  const toStr = range[1].format('YYYY-MM-DD');

  const loadHistory = useCallback(async (tellerId: string) => {
    setHistLoading(true);
    try {
      const res = await axios.get<{ rows: any[] }>(
        `${API_BASE_URL}/api/reconciliation/history`,
        { headers: getAuthHeaders(), params: { tellerId, from: fromStr, to: toStr } }
      );
      setHistRows((res.data?.rows || []).map(mapRecon));
    } catch (e) {
      console.error(e);
      messageApi.error('Failed to load history.');
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  }, [getAuthHeaders, messageApi, fromStr, toStr]);

  const loadMissed = useCallback(async (tellerId: string) => {
    setMissLoading(true);
    try {
      const res = await axios.get<{ rows: any[] }>(
        `${API_BASE_URL}/api/reconciliation/missed-days`,
        { headers: getAuthHeaders(), params: { tellerId, from: fromStr, to: toStr } }
      );
      setMissRows((res.data?.rows || []).map(mapMissed));
    } catch (e) {
      console.error(e);
      messageApi.error('Failed to load missed days.');
      setMissRows([]);
    } finally {
      setMissLoading(false);
    }
  }, [getAuthHeaders, messageApi, fromStr, toStr]);

  const loadShort = useCallback(async (tellerId: string) => {
    setShortLoading(true);
    try {
      const res = await axios.get<{ rows: any[]; totals: any }>(
        `${API_BASE_URL}/api/reconciliation/short-days`,
        { headers: getAuthHeaders(), params: { tellerId, from: fromStr, to: toStr } }
      );
      setShortRows((res.data?.rows || []).map(mapRecon));
      const t = res.data?.totals ?? {};
      setShortTotals({
        days: n(t.days),
        total_expected: n(t.total_expected),
        total_counted: n(t.total_counted),
        total_shortage: n(t.total_shortage),
      });
    } catch (e) {
      console.error(e);
      messageApi.error('Failed to load short days.');
      setShortRows([]);
      setShortTotals({ days: 0, total_expected: 0, total_counted: 0, total_shortage: 0 });
    } finally {
      setShortLoading(false);
    }
  }, [getAuthHeaders, messageApi, fromStr, toStr]);

  // Open modal
  const openReconciliationModal = (teller: Teller) => {
    if (!isAuthenticated) {
      messageApi.error('Please log in to record reconciliation.');
      return;
    }
    setSelectedTeller(teller);
    setCountedCash(null);
    setNotes('');
    setReconciliationModalVisible(true);
  };

  // Open inspector drawer
  const openInspector = (teller: Teller) => {
    setInspectorTeller(teller);
    setInspectorOpen(true);
    // kick off loads
    loadHistory(teller.id);
    loadMissed(teller.id);
    loadShort(teller.id);
  };

  // Reload drawer data when range changes
  useEffect(() => {
    if (inspectorOpen && inspectorTeller) {
      loadHistory(inspectorTeller.id);
      loadMissed(inspectorTeller.id);
      loadShort(inspectorTeller.id);
    }
  }, [range, inspectorOpen, inspectorTeller, loadHistory, loadMissed, loadShort]);

  // Submit reconciliation
  const handleSubmit = async () => {
    if (!isAuthenticated || !selectedTeller) {
      messageApi.error('Authentication or teller information missing.');
      return;
    }
    const expectedCash = n(tellerExpectedCash[selectedTeller.id]?.cash);
    if (countedCash === null || Number.isNaN(countedCash)) {
      messageApi.error('Please enter the counted cash amount.');
      return;
    }
    const variance = Number((countedCash - expectedCash).toFixed(2));

    setSubmitting(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/reconciliation/submit`,
        {
          tellerId: selectedTeller.id,                 // users.user_id
          expectedCash,
          countedCash,
          variance,
          notes,
          date: bizDate.format('YYYY-MM-DD'),          // business day = dashboard date
        },
        { headers: getAuthHeaders() }
      );

      messageApi.success(`Reconciliation recorded for ${selectedTeller.name}.`);
      setReconciliationModalVisible(false);
      setSelectedTeller(null);
      setCountedCash(null);
      setNotes('');
      // Refresh dashboard data
      fetchExpectedCash();
      fetchTellers();
    } catch (err: any) {
      console.error('Failed to submit reconciliation:', err);
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        messageApi.warning('A reconciliation for this teller and date already exists.');
      } else {
        messageApi.error('Failed to submit reconciliation report.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const expectedCashForSelected: ExpectedCash =
    selectedTeller ? (tellerExpectedCash[selectedTeller.id] || { cash: 0, bank: 0, credit: 0 }) : { cash: 0, bank: 0, credit: 0 };

  const varianceDisplay =
    countedCash == null
      ? 0
      : Number((countedCash - n(expectedCashForSelected.cash)).toFixed(2));

  // Filter list (show tellers with cash sales for the selected date)
  const tellerData = tellers.filter((t) => {
    const hasCashToday = n(tellerExpectedCash[t.id]?.cash) > 0;
    const matchesSearch =
      !tellerSearch ||
      t.name.toLowerCase().includes(tellerSearch.toLowerCase()) ||
      (t.branch || '').toLowerCase().includes(tellerSearch.toLowerCase());
    return hasCashToday && matchesSearch;
  });

  return (
    <>
      {contextHolder}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 12 }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 18 }}>
          Teller Reconciliation Dashboard
        </Title>

        <Row align="middle" justify="space-between" style={{ marginBottom: 12 }}>
          <Col>
            <Text type="secondary">Business day:</Text>{' '}
            <DatePicker
              allowClear={false}
              value={bizDate}
              onChange={(d) => setBizDate(d || dayjs())}
              disabled={!isAuthenticated}
              style={{ width: 160 }}
            />
          </Col>
          <Col>
            <Button onClick={fetchExpectedCash} disabled={!isAuthenticated || loadingExpectedCash}>
              Refresh
            </Button>
          </Col>
        </Row>

        {loadingTellers || loadingExpectedCash ? (
          <div style={{ textAlign: 'center', marginTop: 50 }}>
            <Spin size="large" tip="Loading data..." />
          </div>
        ) : (
          <>
            <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>
              Tellers with Cash Sales on {bizDate.format('YYYY-MM-DD')}
            </Title>

            <Input.Search
              placeholder="Search teller or branch..."
              allowClear
              value={tellerSearch}
              onChange={(e) => setTellerSearch(e.target.value)}
              disabled={!isAuthenticated}
              style={{ marginBottom: 16 }}
            />

            <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 8, marginBottom: 24 }}>
              {tellerData.length === 0 ? (
                <Empty description="No tellers with cash sales found" />
              ) : screens.md ? (
                <Table
                  dataSource={tellerData}
                  rowKey="id"
                  pagination={{ pageSize: 8 }}
                  columns={[
                    {
                      title: 'Teller',
                      dataIndex: 'name',
                      key: 'name',
                      render: (name, record) => (
                        <span>
                          {name} {record.branch ? <Tag>{record.branch}</Tag> : null}
                        </span>
                      ),
                    },
                    {
                      title: 'Expected Cash In',
                      key: 'expected',
                      render: (_, rec) => <span>{money(tellerExpectedCash[rec.id]?.cash)}</span>,
                    },
                    {
                      title: 'Actions',
                      key: 'action',
                      align: 'center',
                      render: (_, rec) => (
                        <Row gutter={8} justify="center">
                          <Col>
                            <Button onClick={() => openInspector(rec)} disabled={!isAuthenticated}>
                              View Record
                            </Button>
                          </Col>
                          <Col>
                            <Button
                              type="primary"
                              onClick={() => openReconciliationModal(rec)}
                              disabled={!isAuthenticated || submitting}
                            >
                              Record Reconciliation
                            </Button>
                          </Col>
                        </Row>
                      ),
                    },
                  ]}
                />
              ) : (
                <Row gutter={[10, 12]}>
                  {tellerData.map((item) => (
                    <Col xs={24} key={item.id}>
                      <Card
                        style={{ borderRadius: 10, background: '#fff', marginBottom: 12 }}
                        styles={{ body: { padding: 14 } }}
                        hoverable
                      >
                        <Row align="middle" justify="space-between">
                          <Col onClick={() => openInspector(item)} style={{ cursor: 'pointer' }}>
                            <Text strong>{item.name}</Text>
                            <div style={{ color: '#888' }}>
                              Branch: {item.branch || '—'}
                            </div>
                            <div>
                              <b>Expected Cash In:</b> {money(tellerExpectedCash[item.id]?.cash)}
                            </div>
                          </Col>
                          <Col>
                            <Row gutter={8}>
                              <Col>
                                <Button onClick={() => openInspector(item)}>View</Button>
                              </Col>
                              <Col>
                                <Button
                                  type="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openReconciliationModal(item);
                                  }}
                                  disabled={!isAuthenticated || submitting}
                                >
                                  Record
                                </Button>
                              </Col>
                            </Row>
                          </Col>
                        </Row>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </div>
          </>
        )}

        {/* --- Reconciliation Modal --- */}
        <Modal
          open={reconciliationModalVisible}
          title={selectedTeller ? `Daily Reconciliation: ${selectedTeller.name}` : ''}
          onCancel={() => setReconciliationModalVisible(false)}
          footer={null}
          centered
          destroyOnClose
          width={420}
          styles={{ body: { padding: 24 } }}
        >
          {selectedTeller && (
            <Form layout="vertical" onFinish={handleSubmit}>
              <Text strong>Branch: {selectedTeller.branch || '—'}</Text>
              <br />
              <div style={{ margin: '10px 0' }}>
                <Text>
                  <span style={{ color: '#1677ff' }}>Bank Sales:</span>{' '}
                  <b>{money(expectedCashForSelected.bank)}</b>
                </Text>
                <br />
                <Text>
                  <span style={{ color: '#faad14' }}>Credit Sales:</span>{' '}
                  <b>{money(expectedCashForSelected.credit)}</b>
                </Text>
              </div>

              <Form.Item label="Expected Cash In" style={{ marginBottom: 0 }}>
                <Input addonBefore={<DollarOutlined />} value={money(expectedCashForSelected.cash)} disabled />
              </Form.Item>

              <Form.Item
                label="Counted Cash"
                name="countedCash"
                rules={[{ required: true, message: 'Please enter the counted cash.' }]}
                style={{ marginTop: 16 }}
              >
                <InputNumber
                  addonBefore={<DollarOutlined />}
                  style={{ width: '100%' }}
                  placeholder="Enter actual cash amount"
                  value={countedCash as number | null}
                  onChange={(value) => setCountedCash(typeof value === 'number' ? value : null)}
                  min={0}
                  step={0.01}
                  precision={2}
                  disabled={submitting}
                />
              </Form.Item>

              <Form.Item label="Variance" style={{ marginBottom: 0 }}>
                <Input
                  value={money(varianceDisplay)}
                  style={{
                    color: varianceDisplay === 0 ? 'green' : varianceDisplay > 0 ? 'blue' : 'red',
                    fontWeight: 'bold',
                  }}
                  disabled
                />
              </Form.Item>

              <Form.Item label="Notes (if variance exists)" name="notes" style={{ marginTop: 16 }}>
                <Input.TextArea
                  rows={3}
                  placeholder="Explain any discrepancies..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                />
              </Form.Item>

              <Row gutter={8}>
                <Col span={12}>
                  <Button block onClick={() => setReconciliationModalVisible(false)} disabled={submitting}>
                    Cancel
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    type="primary"
                    block
                    htmlType="submit"
                    loading={submitting}
                    disabled={countedCash === null}
                  >
                    Submit Reconciliation
                  </Button>
                </Col>
              </Row>
            </Form>
          )}
        </Modal>

        {/* --- Teller Inspector Drawer --- */}
        <Drawer
          title={inspectorTeller ? `Record for ${inspectorTeller.name}` : 'Record'}
          open={inspectorOpen}
          width={720}
          onClose={() => setInspectorOpen(false)}
          destroyOnClose
          extra={
            <RangePicker
              allowClear={false}
              value={range}
              onChange={(vals) => {
                if (!vals || vals.length !== 2) return;
                setRange([vals[0]!, vals[1]!]);
              }}
            />
          }
        >
          <Tabs
            items={[
              {
                key: 'history',
                label: 'History',
                children: (
                  <Spin spinning={histLoading}>
                    <Table
                      rowKey={(r) => `${r.day}`}
                      dataSource={histRows}
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Day', dataIndex: 'day', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
                        { title: 'Expected', dataIndex: 'expected_cash', render: (v: number) => money(v) },
                        { title: 'Counted', dataIndex: 'counted_cash', render: (v: number) => money(v) },
                        {
                          title: 'Variance',
                          dataIndex: 'variance',
                          render: (v: number) => (
                            <span style={{ color: v < 0 ? 'red' : v > 0 ? 'blue' : 'inherit', fontWeight: 600 }}>
                              {money(v)}
                            </span>
                          ),
                        },
                        { title: 'Notes', dataIndex: 'notes', ellipsis: true },
                      ]}
                    />
                  </Spin>
                ),
              },
              {
                key: 'missed',
                label: 'Missed days',
                children: (
                  <Spin spinning={missLoading}>
                    <Table
                      rowKey={(r) => `${r.day}`}
                      dataSource={missRows}
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Day', dataIndex: 'day', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
                        { title: 'Expected cash', dataIndex: 'cash', render: (v: number) => money(v) },
                        { title: 'Bank', dataIndex: 'bank', render: (v: number) => money(v) },
                        { title: 'Credit', dataIndex: 'credit', render: (v: number) => money(v) },
                        {
                          title: 'Action',
                          render: (_, r: MissedRow) => (
                            <Button
                              type="link"
                              onClick={() => {
                                setBizDate(dayjs(r.day));
                                if (inspectorTeller) {
                                  openReconciliationModal(inspectorTeller);
                                }
                              }}
                            >
                              Record now
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </Spin>
                ),
              },
              {
                key: 'short',
                label: 'Short days',
                children: (
                  <Spin spinning={shortLoading}>
                    <div style={{ marginBottom: 8 }}>
                      <Text>
                        <b>{shortTotals.days}</b> days short · Expected
                        <b> {money(shortTotals.total_expected)}</b> · Counted
                        <b> {money(shortTotals.total_counted)}</b> · Total shortage
                        <b style={{ color: 'red' }}> {money(shortTotals.total_shortage)}</b>
                      </Text>
                    </div>
                    <Table
                      rowKey={(r) => `${r.day}`}
                      dataSource={shortRows}
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Day', dataIndex: 'day', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
                        { title: 'Expected', dataIndex: 'expected_cash', render: (v: number) => money(v) },
                        { title: 'Counted', dataIndex: 'counted_cash', render: (v: number) => money(v) },
                        {
                          title: 'Shortage',
                          dataIndex: 'variance',
                          render: (v: number) => (
                            <span style={{ color: 'red', fontWeight: 600 }}>
                              {money(v)}
                            </span>
                          ),
                        },
                        { title: 'Notes', dataIndex: 'notes', ellipsis: true },
                        {
                          title: 'Action',
                          render: (_, r: ReconRow) => (
                            <Button
                              type="link"
                              onClick={() => {
                                if (!inspectorTeller) return;
                                setBizDate(dayjs(r.day));
                                setSelectedTeller(inspectorTeller);
                                setCountedCash(r.counted_cash);
                                setNotes(r.notes || '');
                                setReconciliationModalVisible(true);
                              }}
                            >
                              Review
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </Spin>
                ),
              },
            ]}
          />
        </Drawer>
      </div>
    </>
  );
}
