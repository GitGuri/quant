// src/pages/payroll/LeaveManagement.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Select, DatePicker, Input, Space,
  Tag, message, Statistic, Tooltip, Divider, Row, Col, Typography
} from 'antd';
import {
  CalendarOutlined, PlusOutlined, CheckOutlined, CloseOutlined,
  InfoCircleOutlined, CommentOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { motion } from 'framer-motion';
import { useAuth } from '../../AuthPage';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
dayjs.extend(isSameOrAfter);

const { Text } = Typography;

export interface Employee {
  id: string;
  name: string;
  position?: string;
  email?: string;
}

type LeaveType = 'annual' | 'sick' | 'unpaid' | 'family' | 'study';
type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  user_id?: string | null;          // ← add if your API returns it
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string | null;
  status: LeaveStatus;
  created_at?: string;
  manager_comment?: string | null;
  approver_user_id?: string | null;
  decided_at?: string | null;

  // optional (from API joins)
  person_name?: string | null;      // ← add
  person_position?: string | null;  // ← add
  applicant_user_id?: string | null;
  company_id?: string | null;
}


type Balances = Partial<Record<LeaveType, number>>;

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

const DEFAULT_ENTITLEMENTS: Required<Balances> = {
  annual: 15, sick: 10, family: 3, study: 5, unpaid: Number.POSITIVE_INFINITY
};

const IS_PAID: Record<LeaveType, boolean> = {
  annual: true, sick: true, family: true, study: true, unpaid: false
};

interface OrgPerson {
  id: string;
  name: string;
  email?: string;
  position?: string;
  source?: 'user' | 'employee';
  role?: string;
}

interface Props {
  employees: Employee[];                // fallback list
  onRefreshAll?: () => Promise<void>;   // optional parent refetch
}

const LeaveManagement: React.FC<Props> = ({ employees, onRefreshAll }) => {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token') || '';
  const roles = JSON.parse(localStorage.getItem('userRoles') || '[]') as string[];
  const isAdmin = roles.map(r => r.toLowerCase()).some(r => r === 'admin' || r === 'owner');
  const myUserId = localStorage.getItem('userId') || '';

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);

  // People (users + employees) — admins see everyone; members see self
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const peopleMap = useMemo(() => {
    const map = new Map<string, OrgPerson>();
    for (const p of people) map.set(p.id, p);
    for (const e of employees) if (!map.has(e.id)) map.set(e.id, e as OrgPerson);
    return map;
  }, [people, employees]);

  const nameOf = (id: string) => peopleMap.get(id)?.name || employees.find(e => e.id === id)?.name || 'Unknown';
  const positionOf = (id: string) => peopleMap.get(id)?.position || '';

  // Create modal
  const [openModal, setOpenModal] = useState(false);
  const [form] = Form.useForm();

  // Decision modal (single source of truth)
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<LeaveStatus>('approved');
  const [decisionNote, setDecisionNote] = useState('');

  // Balances
  const [selectedPersonId, setSelectedPersonId] = useState<string>(isAdmin ? '' : myUserId);
  const effectivePersonId = selectedPersonId || (isAdmin ? people[0]?.id : myUserId) || '';
  const [balances, setBalances] = useState<Balances | null>(null);

  // ---- fetch org people for admins ----
  const fetchPeople = useCallback(async () => {
    if (!isAdmin || !token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/org/people`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(`Failed to load people (${r.status})`);
      const data: OrgPerson[] = await r.json();
      setPeople(data);
    } catch (e: any) {
      console.warn(e?.message || e);
      // still usable with provided employees prop
    }
  }, [isAdmin, token]);

  // ---- fetch requests ----
  const fetchRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/leave' : '/me/leave';
      const r = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(`Failed to load leave (${r.status})`);
      const data: LeaveRequest[] = await r.json();
      setRequests(data);
    } catch (e: any) {
      message.error(e?.message || 'Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token]);

  // ---- fetch balances (optional) ----
  const fetchBalances = useCallback(async (personId: string) => {
    if (!token || !personId) { setBalances(null); return; }
    try {
      const r = await fetch(`${API_BASE_URL}/leave/balances?employee_id=${encodeURIComponent(personId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { setBalances(DEFAULT_ENTITLEMENTS); return; }
      const data = (await r.json()) as Balances;
      setBalances({ ...DEFAULT_ENTITLEMENTS, ...(data || {}) });
    } catch {
      setBalances(DEFAULT_ENTITLEMENTS);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchPeople();
    fetchRequests();
  }, [isAuthenticated, token, fetchPeople, fetchRequests]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchBalances(effectivePersonId);
  }, [isAuthenticated, token, effectivePersonId, fetchBalances]);

  // ---- stats (single definition) ----
  const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);
  const upcomingApproved = useMemo(() => {
    const today = dayjs().startOf('day');
    return requests.filter(r => r.status === 'approved' && dayjs(r.end_date).isSameOrAfter(today));
  }, [requests]);

  // ---- create ----
  const handleCreate = async (values: any) => {
    if (!token) return message.error('Not authenticated');
    try {
      const [start, end]: [Dayjs, Dayjs] = values.range;
      const selectedId: string = isAdmin ? values.person_id : myUserId;

      // entitlement guard (except unpaid)
      if (balances && values.type !== 'unpaid') {
        const days = Math.max(1, end.diff(start, 'day') + 1);
        const left = balances[values.type as LeaveType] ?? DEFAULT_ENTITLEMENTS[values.type as LeaveType];
        if (Number.isFinite(left) && days > (left || 0)) {
          return message.error(`Requested ${days} day(s) exceeds remaining ${values.type} leave (${left} left).`);
        }
      }

      const payload = {
        employee_id: selectedId,
        type: values.type as LeaveType,
        start_date: start.format('YYYY-MM-DD'),
        end_date: end.format('YYYY-MM-DD'),
        reason: values.reason || null,
      };

      // Admin filing on behalf of another person → use employees/:id/leave
      const adminOnBehalf = isAdmin && selectedId !== myUserId;
      const url = adminOnBehalf ? `/employees/${selectedId}/leave` : `/me/leave`;

      const r = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to submit leave');

      message.success('Leave request submitted');
      setOpenModal(false);
      form.resetFields();
      await fetchRequests();
      if (onRefreshAll) await onRefreshAll();
      fetchBalances(selectedId);
    } catch (e: any) {
      message.error(e?.message || 'Failed to submit leave request');
    }
  };

  // ---- decisions (single definition) ----
  const openDecision = (id: string, status: LeaveStatus) => {
    setDecisionId(id);
    setDecisionStatus(status);
    setDecisionNote('');
    setDecisionOpen(true);
  };

  const applyDecision = async () => {
    if (!token || !decisionId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/leave/${decisionId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: decisionStatus, manager_comment: decisionNote || null }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Failed to ${decisionStatus} leave`);
      message.success(`Leave ${decisionStatus}`);
      setDecisionOpen(false);
      setDecisionId(null);
      await fetchRequests();
      if (onRefreshAll) await onRefreshAll();
    } catch (e: any) {
      message.error(e?.message || 'Failed to update leave');
    }
  };

  // ---- table ----
const columns = [
  {
    title: 'Person',
    dataIndex: 'employee_id',
    key: 'emp',
    render: (_: any, r: LeaveRequest) => {
      const displayName =
        r.person_name ||
        (r.employee_id ? nameOf(r.employee_id) : '') ||
        (r.user_id || '') ||
        r.employee_id ||
        'Unknown';

      const displayPos =
        r.person_position ||
        (r.employee_id ? positionOf(r.employee_id) : '') ||
        '';

      return (
        <>
          <div>{displayName}</div>
          <div style={{ color: '#999', fontSize: 12 }}>{displayPos}</div>
        </>
      );
    },
    sorter: (a: LeaveRequest, b: LeaveRequest) => {
      const na =
        a.person_name ||
        (a.employee_id ? nameOf(a.employee_id) : '') ||
        (a.user_id || '') ||
        '';
      const nb =
        b.person_name ||
        (b.employee_id ? nameOf(b.employee_id) : '') ||
        (b.user_id || '') ||
        '';
      return na.localeCompare(nb);
    },
  },

    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      filters: [
        { text: 'Annual', value: 'annual' },
        { text: 'Sick', value: 'sick' },
        { text: 'Family', value: 'family' },
        { text: 'Study', value: 'study' },
        { text: 'Unpaid', value: 'unpaid' },
      ],
      onFilter: (val: any, r: LeaveRequest) => r.type === val,
      render: (t: LeaveType) => {
        const color: Record<LeaveType, string> = { annual: 'blue', sick: 'red', family: 'purple', study: 'gold', unpaid: 'default' };
        return (
          <Space>
            <Tag color={color[t] || 'default'}>{t.toUpperCase()}</Tag>
            <Tag color={IS_PAID[t] ? 'green' : 'default'}>{IS_PAID[t] ? 'PAID' : 'UNPAID'}</Tag>
          </Space>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_: any, r: LeaveRequest) =>
        `${dayjs(r.start_date).format('DD MMM YYYY')} → ${dayjs(r.end_date).format('DD MMM YYYY')} (${r.days} day${r.days !== 1 ? 's' : ''})`,
      sorter: (a: LeaveRequest, b: LeaveRequest) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf(),
    },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (x: string) => x || '—', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (val: any, r: LeaveRequest) => r.status === val,
      render: (s: LeaveStatus) => <Tag color={s === 'approved' ? 'green' : s === 'pending' ? 'orange' : 'red'}>{s.toUpperCase()}</Tag>,
    },
    { title: 'Manager Note', dataIndex: 'manager_comment', key: 'manager_comment', render: (x: string) => x || '—', ellipsis: true },
    {
      title: 'Actions',
      key: 'act',
      render: (_: any, r: LeaveRequest) => {
        if (!isAdmin || r.status !== 'pending') return <span>—</span>;
        return (
          <Space>
            <Tooltip title="Approve with note">
              <Button type="primary" icon={<CheckOutlined />} onClick={() => openDecision(r.id, 'approved')} className="bg-green-500 border-0" size="small">
                Approve
              </Button>
            </Tooltip>
            <Tooltip title="Reject with note">
              <Button danger icon={<CloseOutlined />} onClick={() => openDecision(r.id, 'rejected')} size="small">
                Reject
              </Button>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="text-center shadow-lg border-0 bg-gradient-to-br from-blue-50 to-blue-100">
          <Statistic title="Total Requests" value={requests.length} />
        </Card>
        <Card className="text-center shadow-lg border-0 bg-gradient-to-br from-orange-50 to-orange-100">
          <Statistic title="Pending" value={pendingCount} />
        </Card>
        <Card className="text-center shadow-lg border-0 bg-gradient-to-br from-green-50 to-green-100">
          <Statistic title="Upcoming Approved" value={upcomingApproved.length} />
        </Card>
      </div>

      <Card
        title={<Space><CalendarOutlined /> Leave Management</Space>}
        extra={
          <Space>
            <Space>
              <Text strong>Balances for:</Text>
              <Select
                style={{ minWidth: 240 }}
                value={effectivePersonId}
                onChange={(v) => setSelectedPersonId(v)}
                disabled={!isAdmin && !!myUserId}
              >
                {(isAdmin ? (people.length ? people : employees) : employees.filter(e => e.id === myUserId)).map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.name} {p.position ? `— ${p.position}` : ''}
                  </Select.Option>
                ))}
                {!isAdmin && !employees.find(e => e.id === myUserId) && (
                  <Select.Option key={myUserId} value={myUserId}>
                    Me
                  </Select.Option>
                )}
              </Select>
            </Space>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                form.setFieldsValue({
                  person_id: isAdmin ? effectivePersonId : myUserId,
                });
                setOpenModal(true);
              }}
              className="bg-gradient-to-r from-blue-500 to-purple-600 border-0"
            >
              Request Leave
            </Button>
          </Space>
        }
        className="shadow-lg border-0"
        headStyle={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontSize: 18, fontWeight: 'bold' }}
      >
        {/* Balances */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {(['annual', 'sick', 'family', 'study', 'unpaid'] as LeaveType[]).map((lt) => {
            const left =
              (balances?.[lt] ??
                (Number.isFinite(DEFAULT_ENTITLEMENTS[lt])
                  ? DEFAULT_ENTITLEMENTS[lt]
                  : undefined)) ?? '—';
            const paid = IS_PAID[lt];
            const color = lt === 'annual' ? 'blue' : lt === 'sick' ? 'red' : lt === 'family' ? 'purple' : lt === 'study' ? 'gold' : 'default';
            return (
              <Col key={lt} xs={12} md={8} lg={6}>
                <Card size="small" className="shadow-sm">
                  <Space align="center">
                    <Tag color={color} style={{ marginRight: 4 }}>{lt.toUpperCase()}</Tag>
                    <Text type={paid ? 'success' : undefined}>{paid ? 'PAID' : 'UNPAID'}</Text>
                  </Space>
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary">Remaining: {left === Infinity ? '∞' : left ?? '—'} day{left === 1 ? '' : 's'}</Text>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        <Divider />

        <Table
          rowKey="id"
          columns={columns as any}
          dataSource={requests}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create modal */}
      <Modal
        title={<Space><CalendarOutlined /> Request Leave</Space>}
        open={openModal}
        onCancel={() => setOpenModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form layout="vertical" form={form} onFinish={handleCreate}>
          <Form.Item
            name="person_id"
            label="Person"
            rules={[{ required: true, message: 'Please select a person' }]}
          >
            {isAdmin ? (
              <Select placeholder="Select person">
                {(people.length ? people : employees).map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.name} {p.position ? `— ${p.position}` : ''}
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <Select value={myUserId} disabled>
                <Select.Option value={myUserId}>Me</Select.Option>
              </Select>
            )}
          </Form.Item>

          <Form.Item name="type" label="Leave type" rules={[{ required: true }]}>
            <Select placeholder="Choose type">
              <Select.Option value="annual">Annual (paid)</Select.Option>
              <Select.Option value="sick">Sick (paid)</Select.Option>
              <Select.Option value="family">Family Responsibility (paid)</Select.Option>
              <Select.Option value="study">Study (paid)</Select.Option>
              <Select.Option value="unpaid">Unpaid</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="range" label="Date range" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="reason"
            label={<Space>Reason (optional) <Tooltip title="A short note helps your manager decide"><InfoCircleOutlined /></Tooltip></Space>}
          >
            <Input.TextArea rows={3} placeholder="Optional note" />
          </Form.Item>

          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setOpenModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">Submit</Button>
          </Space>
        </Form>
      </Modal>

      {/* Decision modal */}
      <Modal
        title={<Space><CommentOutlined /> {decisionStatus === 'approved' ? 'Approve' : 'Reject'} Leave</Space>}
        open={decisionOpen}
        onCancel={() => setDecisionOpen(false)}
        onOk={applyDecision}
        okText={decisionStatus === 'approved' ? 'Approve' : 'Reject'}
        okButtonProps={{ type: 'primary', danger: decisionStatus !== 'approved' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">Add a short note to the employee (optional). This will be saved with the decision.</Text>
          <Input.TextArea
            rows={4}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="e.g., Approved — ensure handover before Friday."
          />
          <Space>
            <Button
              onClick={() => setDecisionStatus('approved')}
              icon={<CheckOutlined />}
              type={decisionStatus === 'approved' ? 'primary' : 'default'}
            >
              Approve
            </Button>
            <Button
              onClick={() => setDecisionStatus('rejected')}
              icon={<CloseOutlined />}
              danger
              type={decisionStatus === 'rejected' ? 'primary' : 'default'}
            >
              Reject
            </Button>
          </Space>
        </Space>
      </Modal>
    </motion.div>
  );
};

export default LeaveManagement;
