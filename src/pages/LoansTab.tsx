// src/pages/LoansTab.tsx


import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Space,
  Typography,
  Tag,
  message,
  Divider,
} from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ---------------- API base + dynamic auth headers ----------------
const API_BASE = 'https://quantnow-sa1e.onrender.com'

function getAuthHeaders() {
  const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return tk
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }
    : { 'Content-Type': 'application/json' };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
 const res = await fetch(`${API_BASE}${path}`, {
     ...init,
     headers: {
       ...getAuthHeaders(),
       ...(init?.headers || {}),
     },

    credentials: 'omit'
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error || j?.detail || msg;
    } catch {
      try { msg = await res.text(); } catch {}
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ---------------- Types ----------------
type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface LoansTabProps {
  // Keep these minimal; they’re derived from your Accounting lists
  assets: Array<{ id: string | number; name: string }>;
  accounts: Array<{ id: string | number; name: string; code?: string; type: AccountType }>;
}

interface LoanRow {
  id: string;
  user_id: string;
  asset_id: number;
  asset_name: string;
  lender_name: string | null;
  liability_account_id: number;
  start_date: string;            // YYYY-MM-DD
  principal: number;
  interest_rate: number;         // decimal p.a. (0.135 = 13.5%)
  term_months: number;
  payment_day: number;           // 1..28
  payment_amount: number | null; // if blank and method=amortised we compute
  method: 'amortised' | 'interest_only';
  compounding: string;
  notes: string | null;
  created_at: string;
}

interface ScheduleRow {
  id: string;
  user_id: string;
  loan_id: string;
  period_no: number;
  period_start: string;
  period_end: string;
  due_date: string;
  opening_balance: number;
  interest: number;
  principal: number;
  payment: number;
  closing_balance: number;
  accrued_interest_entry_id: number | null;
  payment_entry_id: number | null;
}

// ---------------- Component ----------------
const LoansTab: React.FC<LoansTabProps> = ({ assets, accounts }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LoanRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [scheduleLoan, setScheduleLoan] = useState<LoanRow | null>(null);

  const [repayOpen, setRepayOpen] = useState(false);
  const [repayForm] = Form.useForm();
  const [repayLoan, setRepayLoan] = useState<LoanRow | null>(null);

  const [accrueOpen, setAccrueOpen] = useState(false);
  const [accrueForm] = Form.useForm();
  const [accrueLoan, setAccrueLoan] = useState<LoanRow | null>(null);

  // Derive account buckets from props (same data you use elsewhere)
  const liabilityAccounts = useMemo(
    () => accounts.filter(a => a.type === 'Liability'),
    [accounts]
  );
  const bankAccounts = useMemo(
    () => accounts.filter(a => a.type === 'Asset'),
    [accounts]
  );
  const expenseAccounts = useMemo(
    () => accounts.filter(a => a.type === 'Expense'),
    [accounts]
  );

  // ---------- Load loans ----------
  async function loadLoans() {
    const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!tk) { setRows([]); return; }
    setLoading(true);
    try {
      const loans = await api<LoanRow[]>('/loans');
      setRows(loans);
    } catch (e: any) {
      message.error(`Failed to load loans: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLoans();
    // Refresh if token changes (login/logout in another tab)
    function onStorage(e: StorageEvent) {
      if (e.key === 'token') loadLoans();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ---------- Create Loan ----------
  async function onCreateLoan() {
    try {
      const v = await createForm.validateFields();
      const payload = {
        asset_id: Number(v.asset_id),
        lender_name: v.lender_name || null,
        liability_account_id: Number(v.liability_account_id),
        start_date: v.start_date.format('YYYY-MM-DD'),
        principal: Number(v.principal),
        interest_rate: Number(v.interest_rate),
        term_months: Number(v.term_months),
        payment_day: Number(v.payment_day),
        payment_amount: v.payment_amount == null ? null : Number(v.payment_amount),
        method: v.method,
        compounding: 'monthly',
        notes: v.notes || null,
      };
      await api('/loans', { method: 'POST', body: JSON.stringify(payload) });
      message.success('Loan created');
      setCreateOpen(false);
      createForm.resetFields();
      loadLoans();
    } catch (e: any) {
      if (e?.errorFields) return; // antd form errors
      message.error(e.message || 'Failed to create loan');
    }
  }

  // ---------- Schedule ----------
  async function buildSchedule(loan: LoanRow, overwrite = false) {
    try {
      await api(`/loans/${loan.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ overwrite }),
      });
      message.success('Schedule built');
      viewSchedule(loan);
    } catch (e: any) {
      message.error(e.message || 'Failed to build schedule');
    }
  }

  async function viewSchedule(loan: LoanRow) {
    try {
      const sched = await api<ScheduleRow[]>(`/loans/${loan.id}/schedule`);
      setScheduleLoan(loan);
      setScheduleRows(sched);
      setScheduleOpen(true);
    } catch (e: any) {
      message.error(e.message || 'Failed to fetch schedule');
    }
  }

  // ---------- Accrue Interest ----------
  function openAccrue(loan: LoanRow) {
    setAccrueLoan(loan);
    accrueForm.resetFields();
    setAccrueOpen(true);
  }

  async function doAccrue() {
    try {
      const v = await accrueForm.validateFields();
      const payload = {
        period_no: v.period_no == null ? undefined : Number(v.period_no),
        entryDate: v.entry_date ? v.entry_date.format('YYYY-MM-DD') : undefined,
        interest_expense_account_id: Number(v.interest_expense_account_id),
      };
      await api(`/loans/${accrueLoan!.id}/accrue-interest`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      message.success('Interest accrued');
      setAccrueOpen(false);
      if (scheduleOpen && scheduleLoan) viewSchedule(scheduleLoan); // refresh if open
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message || 'Failed to accrue interest');
    }
  }

  // ---------- Repayment ----------
  function openRepay(loan: LoanRow) {
    setRepayLoan(loan);
    repayForm.resetFields();
    setRepayOpen(true);
  }

  async function doRepay() {
    try {
      const v = await repayForm.validateFields();
      const payload = {
        period_no: v.period_no == null ? undefined : Number(v.period_no),
        entryDate: v.entry_date ? v.entry_date.format('YYYY-MM-DD') : undefined,
        bank_account_id: Number(v.bank_account_id),
        interest_expense_account_id: v.alreadyAccrued ? undefined : Number(v.interest_expense_account_id),
        amount: v.amount == null ? undefined : Number(v.amount),
        alreadyAccrued: !!v.alreadyAccrued,
      };
      await api(`/loans/${repayLoan!.id}/repayment`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      message.success('Repayment posted');
      setRepayOpen(false);
      if (scheduleOpen && scheduleLoan) viewSchedule(scheduleLoan); // refresh if open
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message || 'Failed to post repayment');
    }
  }

  // ---------- Columns ----------
  const columns = [
    { title: 'Asset', dataIndex: 'asset_name', key: 'asset' },
    { title: 'Lender', dataIndex: 'lender_name', key: 'lender', render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: 'Start', dataIndex: 'start_date', key: 'start', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: 'Principal', dataIndex: 'principal', key: 'principal', render: (n: number) => n.toLocaleString() },
    { title: 'Rate (p.a.)', dataIndex: 'interest_rate', key: 'rate', render: (r: number) => `${(r * 100).toFixed(2)}%` },
    { title: 'Term', dataIndex: 'term_months', key: 'term' },
    { title: 'Pay day', dataIndex: 'payment_day', key: 'payment_day' },
    {
      title: 'Method', dataIndex: 'method', key: 'method',
      render: (m: string) => <Tag color={m === 'amortised' ? 'blue' : 'gold'}>{m}</Tag>
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, rec: LoanRow) => (
        <Space>
          <Button size="small" onClick={() => viewSchedule(rec)}>View schedule</Button>
          <Button size="small" onClick={() => buildSchedule(rec)}>Build schedule</Button>
          <Button size="small" onClick={() => buildSchedule(rec, true)} danger>Rebuild</Button>
          <Button size="small" onClick={() => openAccrue(rec)}>Accrue</Button>
          <Button size="small" type="primary" onClick={() => openRepay(rec)}>Repay</Button>
        </Space>
      )
    }
  ];

  return (
    <Card bordered={false} style={{ background: 'transparent' }}>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Loans</Title>
          <Text type="secondary">
            SARS-aware handling: interest is expensed (no VAT), principal reduces liability; assets depreciate separately in your register.
          </Text>
        </div>
        <Space>
          <Button type="primary" onClick={() => setCreateOpen(true)}>New Loan</Button>
          <Button onClick={loadLoans}>Refresh</Button>
        </Space>
      </Space>

      <Divider />

      <Table
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns as any}
        rowKey={(r) => r.id}
      />

      {/* Create Loan Modal */}
      <Modal
        open={createOpen}
        title="Create Loan"
        onCancel={() => setCreateOpen(false)}
        onOk={onCreateLoan}
        okText="Create"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="Asset" name="asset_id" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select asset">
              {assets.map(a => (
                <Select.Option key={String(a.id)} value={String(a.id)}>
                  {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Lender (optional)" name="lender_name">
            <Input placeholder="Bank / Finance house" />
          </Form.Item>
          <Form.Item label="Liability Account" name="liability_account_id" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select loan liability">
              {liabilityAccounts.map(a => (
                <Select.Option key={String(a.id)} value={String(a.id)}>
                  {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Start Date" name="start_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Principal" name="principal" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item
            label="Interest Rate (decimal p.a.)"
            name="interest_rate"
            rules={[{ required: true }]}
            tooltip="e.g., 0.135 for 13.5%"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.001} />
          </Form.Item>
          <Form.Item label="Term (months)" name="term_months" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item label="Payment Day (1..28)" name="payment_day" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} max={28} />
          </Form.Item>
          <Form.Item label="Payment Amount (optional)" name="payment_amount">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="Method" name="method" initialValue="amortised" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="amortised">Amortised</Select.Option>
              <Select.Option value="interest_only">Interest only</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Text type="secondary">
            SARS note: Interest on genuine loan finance for income-producing assets is typically deductible; interest is not subject to VAT.
            Depreciation remains in your asset register/tax book.
          </Text>
        </Form>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        open={scheduleOpen}
        title={`Schedule — ${scheduleLoan?.asset_name || ''}`}
        onCancel={() => setScheduleOpen(false)}
        footer={null}
        width={1000}
      >
        <Table
          size="small"
          dataSource={scheduleRows}
          rowKey={(r) => r.id}
          pagination={{ pageSize: 12 }}
          columns={[
            { title: 'P#', dataIndex: 'period_no', width: 70 },
            { title: 'Due', dataIndex: 'due_date', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
            { title: 'Opening', dataIndex: 'opening_balance', render: (n: number) => n.toLocaleString() },
            { title: 'Interest', dataIndex: 'interest', render: (n: number) => n.toLocaleString() },
            { title: 'Principal', dataIndex: 'principal', render: (n: number) => n.toLocaleString() },
            { title: 'Payment', dataIndex: 'payment', render: (n: number) => n.toLocaleString() },
            { title: 'Closing', dataIndex: 'closing_balance', render: (n: number) => n.toLocaleString() },
            { title: 'Accrued JE', dataIndex: 'accrued_interest_entry_id', render: (v: number | null) => v ? <Tag>{v}</Tag> : <Tag color="default">—</Tag> },
            { title: 'Payment JE', dataIndex: 'payment_entry_id', render: (v: number | null) => v ? <Tag>{v}</Tag> : <Tag color="default">—</Tag> },
          ]}
        />
      </Modal>

      {/* Accrue Interest Modal */}
      <Modal
        open={accrueOpen}
        title={`Accrue Interest — ${accrueLoan?.asset_name || ''}`}
        onCancel={() => setAccrueOpen(false)}
        onOk={doAccrue}
        okText="Accrue"
        destroyOnClose
      >
        <Form form={accrueForm} layout="vertical">
          <Form.Item label="Period # (optional)" name="period_no">
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item label="Entry Date (optional)" name="entry_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Interest Expense Account" name="interest_expense_account_id" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select interest expense">
              {expenseAccounts.map(a => (
                <Select.Option key={String(a.id)} value={String(a.id)}>
                  {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Text type="secondary">SARS note: interest is expensed (section 24J/11(a)); no VAT is posted on interest.</Text>
        </Form>
      </Modal>

      {/* Repayment Modal */}
      <Modal
        open={repayOpen}
        title={`Repayment — ${repayLoan?.asset_name || ''}`}
        onCancel={() => setRepayOpen(false)}
        onOk={doRepay}
        okText="Post"
        destroyOnClose
      >
        <Form form={repayForm} layout="vertical">
          <Form.Item label="Period # (optional)" name="period_no">
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item label="Entry Date (optional)" name="entry_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Bank Account" name="bank_account_id" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select bank/cash">
              {bankAccounts.map(a => (
                <Select.Option key={String(a.id)} value={String(a.id)}>
                  {a.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Already Accrued This Period?" name="alreadyAccrued" initialValue={false}>
            <Select>
              <Select.Option value={false}>No — expense interest now</Select.Option>
              <Select.Option value={true}>Yes — only reduce liability</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.alreadyAccrued !== cur.alreadyAccrued} noStyle>
            {({ getFieldValue }) =>
              !getFieldValue('alreadyAccrued') ? (
                <Form.Item label="Interest Expense Account" name="interest_expense_account_id" rules={[{ required: true }]}>
                  <Select showSearch placeholder="Select interest expense">
                    {expenseAccounts.map(a => (
                      <Select.Option key={String(a.id)} value={String(a.id)}>
                        {a.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item label="Amount (optional)" name="amount" tooltip="Defaults to schedule payment if blank">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Text type="secondary">
            Cash out is credited to Bank. Principal reduces the loan liability; interest (if not accrued) is expensed. No VAT posted on interest.
          </Text>
        </Form>
      </Modal>
    </Card>
  );
};

export default LoansTab;
