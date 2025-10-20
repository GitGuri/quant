import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, InputNumber, Select, DatePicker,
  Space, Tag, Tooltip, message
} from 'antd';
import {
  CheckOutlined, CloseOutlined, FieldTimeOutlined, BellOutlined,
  ClockCircleOutlined, PlusOutlined, ReloadOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

/** === Types === */
type Employee = {
  id: string;
  name: string;
  email?: string | null;
  position?: string | null;
  expected_daily_hours?: number | null;
};

type UserLite = {
  id: string; // user account id
  name: string;
  email?: string | null;
};

type TimeEntryStatus = 'pending' | 'approved' | 'rejected';

type TimeEntry = {
  id: string;
  employee_id: string | null;      // null if not linked to employees table
  user_id?: string | null;         // who created/owns the entry (logged-in user)
  date: string;                    // 'YYYY-MM-DD' (entry_date)
  clock_in: string;                // ISO
  clock_out?: string | null;       // ISO
  break_minutes?: number | null;
  notes?: string | null;
  status: TimeEntryStatus;
  hours_worked?: number | null;    // server value after clock-out/manual add
  created_at?: string;
  updated_at?: string;
};

interface Props {
  employees: Employee[];
  usersProp?: UserLite[];
  onUpdateEmployeeHours?: () => Promise<void> | void;
  onTimeEntryActionSuccess?: () => Promise<void> | void;
}

/** === Helpers === */
const num = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);
const minutesToHHMM = (mins: number) => {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h}:${mm}`;
};

const useAuthBits = () => {
  const token = localStorage.getItem('token') || '';
  const userId = localStorage.getItem('userId') || '';
  const roles = JSON.parse(localStorage.getItem('userRoles') || '[]') as string[];
  const single = (localStorage.getItem('userRole') || localStorage.getItem('role') || '').toLowerCase();
  const isAdmin =
    roles.map(r => r.toLowerCase()).some(r => r === 'admin' || r === 'owner') ||
    single === 'admin' || single === 'owner';
  return { token, userId, isAdmin };
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const statusTag = (s: TimeEntryStatus) => {
  const color =
    s === 'approved' ? 'green' :
    s === 'pending'  ? 'orange' :
    s === 'rejected' ? 'red'    : 'default';
  return <Tag color={color} style={{ textTransform: 'uppercase' }}>{s}</Tag>;
};

const computeDurationMins = (e: TimeEntry) => {
  if (!e.clock_in) return 0;
  const start = dayjs(e.clock_in);
  const end = e.clock_out ? dayjs(e.clock_out) : dayjs();
  let total = end.diff(start, 'minute');
  total -= num(e.break_minutes);
  return Math.max(0, total);
};

/** Unified ids for filter */
const makeEmpKey = (id: string) => `emp:${id}`;
const makeUsrKey = (id: string) => `usr:${id}`;
const parseKey = (k: string) => {
  if (k === 'me') return { kind: 'me' as const, id: '' };
  if (k === 'all') return { kind: 'all' as const, id: '' };
  if (k.startsWith('emp:')) return { kind: 'employee' as const, id: k.slice(4) };
  if (k.startsWith('usr:')) return { kind: 'user' as const, id: k.slice(4) };
  return { kind: 'user' as const, id: k };
};

const TimeTracking: React.FC<Props> = ({
  employees,
  usersProp,
  onUpdateEmployeeHours,
  onTimeEntryActionSuccess
}) => {
  const { token, userId, isAdmin } = useAuthBits();

  /** Users fetch (if not supplied) */
  const [users, setUsers] = useState<UserLite[]>(usersProp || []);
  const fetchUsers = useCallback(async () => {
    if (usersProp) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/users`, { headers: { ...authHeaders() } });
      if (!r.ok) return setUsers([]);
      const data = await r.json();
      const mapped: UserLite[] = Array.isArray(data)
        ? data.map((u: any) => ({
            id: String(u.id ?? u.user_id),
            name: u.name || u.full_name || u.email || 'User',
            email: u.email
          }))
        : [];
      setUsers(mapped);
    } catch {
      setUsers([]);
    }
  }, [usersProp]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  /** People = Employees ∪ Users */
  const people = useMemo(() => {
    const empIds = new Set(employees.map(e => e.id));
    const list: Array<{ key: string; label: string; kind: 'employee'|'user'; rawId: string; expected?: number|null }> = [];

    employees.forEach(e => list.push({
      key: makeEmpKey(e.id), label: e.name || e.email || e.id,
      kind: 'employee', rawId: e.id, expected: e.expected_daily_hours ?? null
    }));

    users.forEach(u => {
      if (!empIds.has(u.id)) {
        list.push({
          key: makeUsrKey(u.id), label: u.name || u.email || u.id,
          kind: 'user', rawId: u.id, expected: null
        });
      }
    });

    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, users]);

  /** Entries + filters */
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const end = dayjs().endOf('day');
    const start = end.clone().subtract(30, 'day').startOf('day');
    return [start, end];
  });

  // Admins default to All, regulars default to Me
  const [personFilter, setPersonFilter] = useState<string>(isAdmin ? 'all' : 'me');

  const effectiveQueryTarget = useMemo(() => {
    const parsed = parseKey(personFilter);
    if (!isAdmin || parsed.kind === 'me') return { kind: 'user' as const, id: userId };
    if (parsed.kind === 'all') return { kind: 'all' as const, id: '' };
    return parsed;
  }, [isAdmin, personFilter, userId]);

  const expectedOf = (id: string): number | null =>
    employees.find(e => e.id === id)?.expected_daily_hours ?? null;

  const nameOf = (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (emp) return emp.name || emp.email || id;
    const usr = users.find(u => u.id === id);
    return usr ? (usr.name || usr.email || id) : id;
  };

  /** Detect my open entry for the clock-out button */
  const myOpenEntry = useMemo(
    () => entries.find(e => e.user_id && String(e.user_id) === userId && !e.clock_out),
    [entries, userId]
  );

  /** Load entries (company-scoped) */
  const fetchEntries = useCallback(async () => {
    if (!token) return setEntries([]);
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD'),
      });

      if (effectiveQueryTarget.kind === 'employee') {
        qs.set('employee_id', effectiveQueryTarget.id);
      } else if (effectiveQueryTarget.kind === 'user') {
        qs.set('user_id', effectiveQueryTarget.id);
      } // 'all' => no extra param (company-wide)

      const r = await fetch(`${API_BASE_URL}/time-entries?${qs}`, { headers: { ...authHeaders() } });
      if (!r.ok) throw new Error(`Failed to load time entries (${r.status})`);
      const data: TimeEntry[] = await r.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (e: any) {
      message.error(e?.message || 'Failed to load time entries');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [token, range, effectiveQueryTarget]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  /** Clock in/out */
  const clockIn = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/time-entries/clock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({})
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to clock in');

      setEntries(prev => [data as TimeEntry, ...prev]);
      message.success('Clocked in');
      await fetchEntries();
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Could not clock in');
    }
  }, [fetchEntries, onTimeEntryActionSuccess]);

  const clockOut = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/time-entries/clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to clock out');

      message.success('Clocked out — submitted for approval');
      await fetchEntries();
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Could not clock out');
    }
  }, [fetchEntries, onTimeEntryActionSuccess]);

  /** Approvals (admin only) */
  const approve = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/time-entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: 'approved' })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Approve failed');
      message.success('Approved');
      await fetchEntries();
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Failed to approve');
    }
  }, [fetchEntries, onTimeEntryActionSuccess]);

  const reject = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/time-entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: 'rejected' })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Reject failed');
      message.success('Rejected');
      await fetchEntries();
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Failed to reject');
    }
  }, [fetchEntries, onTimeEntryActionSuccess]);

  /** Manual Add (admin only) */
  const [manualModal, setManualModal] = useState(false);
  const [manualForm] = Form.useForm();

  const openManualModal = () => {
    manualForm.resetFields();
    setManualModal(true);
  };

  const saveManualEntry = async () => {
    try {
      const vals = await manualForm.validateFields();
      const endpoint = vals.employee_id
        ? `${API_BASE_URL}/employees/${vals.employee_id}/time-entries`
        : `${API_BASE_URL}/time-entries/manual`;

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          date: vals.date.format('YYYY-MM-DD'),
          hours_worked: vals.hours_worked,
          description: vals.notes,
          status: vals.status,
          name: vals.manual_name
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to add entry');
      message.success('Manual entry added');
      setManualModal(false);
      await fetchEntries();
    } catch (e: any) {
      message.error(e?.message || 'Could not add manual entry');
    }
  };

  /** Table columns */
  const columns = [
{
  title: 'Person',
  dataIndex: 'employee_id',
  key: 'emp',
  render: (_: any, r: any) => {
    const id = (r.user_id && String(r.user_id)) || (r.employee_id && String(r.employee_id)) || '';
    return (
      <Space>
        <FieldTimeOutlined />
        <div>
          <div>{r.person_name || nameOf(id)}</div>
          {r.person_position && (
            <div style={{ fontSize: 12, color: '#888' }}>{r.person_position}</div>
          )}
        </div>
      </Space>
    );
  },
},

    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => dayjs(d).format('DD MMM YYYY'),
      sorter: (a: TimeEntry, b: TimeEntry) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf()
    },
    { title: 'Clock In', dataIndex: 'clock_in', key: 'in', render: (x: string) => dayjs(x).format('HH:mm') },
    { title: 'Clock Out', dataIndex: 'clock_out', key: 'out', render: (x: string | null) => x ? dayjs(x).format('HH:mm') : <Tag color="blue">OPEN</Tag> },
    { title: 'Break', dataIndex: 'break_minutes', key: 'break', render: (m: number) => `${num(m)} min` },
    {
      title: 'Hours',
      key: 'hours',
      render: (_: any, r: TimeEntry) => {
        const mins = r.hours_worked != null ? Math.round(num(r.hours_worked) * 60) : computeDurationMins(r);
        return <span>{minutesToHHMM(mins)}</span>;
      }
    },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    {
      title: 'Actions',
      key: 'act',
      render: (_: any, r: TimeEntry) => {
        if (!isAdmin) return <span>—</span>;
        if (r.status === 'pending') {
          return (
            <Space>
              <Tooltip title="Approve">
                <Button type="primary" icon={<CheckOutlined />} onClick={() => approve(r.id)} className="bg-green-500 border-0" size="small" />
              </Tooltip>
              <Tooltip title="Reject">
                <Button danger icon={<CloseOutlined />} onClick={() => reject(r.id)} size="small" />
              </Tooltip>
            </Space>
          );
        }
        return <span>—</span>;
      }
    }
  ];

  /** UI */
  return (
    <div className="space-y-6">
      <Card
        title={<Space><ClockCircleOutlined /> Time Tracking</Space>}
        extra={
          <Space wrap>
            <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />

            {isAdmin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openManualModal}>
                Add Manual Entry
              </Button>
            )}

            <Button icon={<ReloadOutlined />} onClick={fetchEntries}>Refresh</Button>

            {/* Clock controls for current user */}
            {!myOpenEntry ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={clockIn}>Clock In</Button>
            ) : (
              <Button danger icon={<FieldTimeOutlined />} onClick={clockOut}>Clock Out</Button>
            )}
          </Space>
        }
        className="shadow-lg border-0"
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={entries}
          columns={columns as any}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Manual Add Entry Modal (Admin only) */}
      <Modal
        title="Add Manual Time Entry"
        open={manualModal}
        onCancel={() => setManualModal(false)}
        onOk={saveManualEntry}
        okText="Save Entry"
        destroyOnClose
      >
        <Form layout="vertical" form={manualForm}>
          <Form.Item label="Employee " name="employee_id">
            <Select
              allowClear
              placeholder="Select existing employee"
              showSearch
              optionFilterProp="children"
            >
              {employees.map(e => (
                <Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>



          <Form.Item label="Date" name="date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Hours Worked" name="hours_worked" rules={[{ required: true }]}>
            <InputNumber min={0} max={24} step={0.25} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Notes / Description" name="notes">
            <textarea className="ant-input" placeholder="Optional notes" />
          </Form.Item>

          <Form.Item label="Status" name="status" initialValue="pending">
            <Select>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="approved">Approved</Select.Option>
              <Select.Option value="rejected">Rejected</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TimeTracking;
