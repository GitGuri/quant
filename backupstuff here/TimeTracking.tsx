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

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

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

type TimeEntryStatus = 'open' | 'pending' | 'approved' | 'rejected';

type TimeEntry = {
  id: string;
  employee_id: string | null;  // null if plain user
  user_id?: string | null;     // returned by API for user-only rows
  date: string;                // 'YYYY-MM-DD'
  clock_in: string;            // ISO
  clock_out?: string | null;   // ISO
  break_minutes?: number | null;
  notes?: string | null;
  status: TimeEntryStatus;
  hours_worked?: number | null; // server value after clock-out
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
  const isAdmin = roles.map(r => r.toLowerCase()).some(r => r === 'admin' || r === 'owner') || single === 'admin' || single === 'owner';
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
    s === 'rejected' ? 'red'    : 'blue';
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
  onTimeEntryActionSuccess,
  onUpdateEmployeeHours
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
            id: String(u.id),
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
  () => entries.find(e =>
    e.user_id && String(e.user_id) === userId && !e.clock_out && e.status === 'open'
  ),
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
        qs.set('user_only_id', effectiveQueryTarget.id);
      } // 'all' => no extra param (company wide)

      const r = await fetch(`${API_BASE_URL}/time?${qs}`, { headers: { ...authHeaders() } });
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
      const r = await fetch(`${API_BASE_URL}/me/clock-in`, {
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
      const r = await fetch(`${API_BASE_URL}/me/clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({})
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to clock out');

      setEntries(prev => prev.map(e => (!e.clock_out && e.status === 'open' ? { ...e, ...data } : e)));
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
      const r = await fetch(`${API_BASE_URL}/time/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Approve failed');
      setEntries(prev => prev.map(e => (e.id === id ? { ...e, status: 'approved' } : e)));
      message.success('Approved');
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Failed to approve');
    }
  }, [onTimeEntryActionSuccess]);

  const reject = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/time/${id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Reject failed');
      setEntries(prev => prev.map(e => (e.id === id ? { ...e, status: 'rejected' } : e)));
      message.success('Rejected');
      onTimeEntryActionSuccess?.();
    } catch (e: any) {
      message.error(e?.message || 'Failed to reject');
    }
  }, [onTimeEntryActionSuccess]);

  /** Expected hours (employee only) */
  const [hoursModal, setHoursModal] = useState(false);
  const [hoursForm] = Form.useForm();

  const currentSelectionIsEmployee = useMemo(() => {
    if (!isAdmin || personFilter === 'me' || personFilter === 'all') return false;
    const p = parseKey(personFilter);
    return p.kind === 'employee';
  }, [isAdmin, personFilter]);

  const openHoursModal = (empId: string, current?: number | null) => {
    hoursForm.resetFields();
    hoursForm.setFieldsValue({ employee_id: empId, expected_daily_hours: current ?? 8 });
    setHoursModal(true);
  };

  const saveExpectedHours = async () => {
    try {
      const vals = await hoursForm.validateFields();
      const r = await fetch(`${API_BASE_URL}/employees/${vals.employee_id}/expected-hours`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ expected_daily_hours: vals.expected_daily_hours })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to save expected hours');
      message.success('Expected hours saved');
      setHoursModal(false);
      await onUpdateEmployeeHours?.();
    } catch (e: any) {
      message.error(e?.message || 'Could not save expected hours');
    }
  };

  /** Reminders for the current user */
  const reminderTimerRef = useRef<number | null>(null);
  const scheduleReminders = useCallback(() => {
    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    if (!myOpenEntry) return;

    const msSinceIn = dayjs().diff(dayjs(myOpenEntry.clock_in), 'millisecond');
    const fiveH = 5 * 60 * 60 * 1000;
    const eightH = 8 * 60 * 60 * 1000;
    const nextNudge = msSinceIn < fiveH ? fiveH - msSinceIn : Math.max(0, eightH - msSinceIn);
    if (nextNudge <= 0) return;

    reminderTimerRef.current = window.setTimeout(async () => {
      message.info('Reminder: you appear to be clocked in — don’t forget to clock out when you’re done.');
      try {
        await fetch(`${API_BASE_URL}/time/reminders/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({})
        });
      } catch { /* no-op */ }
      if (msSinceIn < fiveH) {
        const remain = eightH - fiveH;
        reminderTimerRef.current = window.setTimeout(() => {
          message.warning('Second reminder: Please clock out if you are finished.');
        }, remain) as unknown as number;
      }
    }, nextNudge) as unknown as number;
  }, [myOpenEntry]);

  useEffect(() => {
    scheduleReminders();
    return () => {
      if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    };
  }, [scheduleReminders]);

  /** Table columns */
  const columns = [
    {
      title: 'Person',
      dataIndex: 'employee_id',
      key: 'emp',
      render: (_: any, r: TimeEntry) => {
        const id = (r.user_id && String(r.user_id)) || (r.employee_id && String(r.employee_id)) || '';
        const expected = expectedOf(id);
        return (
          <Space>
            <FieldTimeOutlined />
            <div>
              <div>{nameOf(id)}</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Exp: {expected ?? 8}h / day {expected === null ? '(user)' : '(employee)'}
              </div>
            </div>
          </Space>
        );
      },
      sorter: (a: TimeEntry, b: TimeEntry) => {
        const idA = (a.user_id as any) || a.employee_id || '';
        const idB = (b.user_id as any) || b.employee_id || '';
        return nameOf(String(idA)).localeCompare(nameOf(String(idB)));
      }
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
        const id = (r.user_id as any) || r.employee_id || '';
        const expectedMinutes = (expectedOf(String(id)) ?? 8) * 60;
        const over = mins > expectedMinutes + 5;
        return (
          <Space>
            <span>{minutesToHHMM(mins)}</span>
            {expectedMinutes > 0 && (
              <Tag color={over ? 'red' : 'default'}>{over ? 'Over expected' : 'Within expected'}</Tag>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: statusTag,
      filters: [
        { text: 'Open', value: 'open' },
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' }
      ],
      onFilter: (val: any, r: TimeEntry) => r.status === val
    },
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

            {/* Admin filter */}
            {isAdmin && (
              <Select
                style={{ width: 300 }}
                value={personFilter}
                onChange={setPersonFilter}
                optionLabelProp="label"
                showSearch
                filterOption={(input, option) =>
                  ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())
                }
              >
                <Select.Option value="all" label="All (Company)">All (Company)</Select.Option>
                <Select.Option value="me"  label="Me">Me</Select.Option>

                {people.filter(p => p.kind === 'employee').length > 0 && (
                  <Select.OptGroup label="Employees">
                    {people.filter(p => p.kind === 'employee').map(p => (
                      <Select.Option key={p.key} value={p.key} label={p.label}>{p.label}</Select.Option>
                    ))}
                  </Select.OptGroup>
                )}

                {people.filter(p => p.kind === 'user').length > 0 && (
                  <Select.OptGroup label="Users">
                    {people.filter(p => p.kind === 'user').map(p => (
                      <Select.Option key={p.key} value={p.key} label={p.label}>{p.label}</Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
              </Select>
            )}

            <Button icon={<ReloadOutlined />} onClick={fetchEntries}>Refresh</Button>

            {/* Expected hours (only if employee selected) */}
            {isAdmin && currentSelectionIsEmployee && (() => {
              const { id } = parseKey(personFilter);
              return (
                <Button icon={<BellOutlined />} onClick={() => openHoursModal(id, expectedOf(id))}>
                  Set Expected Hours
                </Button>
              );
            })()}

            {/* Clock controls for current user */}
            {myOpenEntry && (
              <Tag icon={<ClockCircleOutlined />} color="blue" style={{ fontSize: 14, padding: '4px 10px' }}>
                CLOCK IN ACTIVE
              </Tag>
            )}
            {!myOpenEntry ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={clockIn}>Clock In</Button>
            ) : (
              <Button danger icon={<FieldTimeOutlined />} onClick={clockOut}>Clock Out</Button>
            )}
          </Space>
        }
        className="shadow-lg border-0"
      >
        <Table rowKey="id" loading={loading} dataSource={entries} columns={columns as any} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title="Set Expected Daily Hours"
        open={hoursModal}
        onCancel={() => setHoursModal(false)}
        onOk={saveExpectedHours}
        okText="Save"
        destroyOnClose
      >
        <Form layout="vertical" form={hoursForm}>
          <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
            <Select placeholder="Select employee">
              {employees.map(e => <Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="expected_daily_hours" label="Expected hours (per day)" rules={[{ required: true }]}>
            <InputNumber min={1} max={24} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TimeTracking;
