import React, { useEffect, useState } from 'react';
import { Card, Table, InputNumber, Button, message, Space, Typography, Tag } from 'antd';
import { SaveOutlined, SettingOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

type LeaveType = 'annual' | 'sick' | 'family' | 'study' | 'unpaid';

const COLOR_MAP: Record<LeaveType, string> = {
  annual: 'blue',
  sick: 'red',
  family: 'purple',
  study: 'gold',
  unpaid: 'default',
};

const DEFAULTS: Record<LeaveType, number> = {
  annual: 15,
  sick: 10,
  family: 3,
  study: 5,
  unpaid: Infinity,
};

export const LeaveSettings: React.FC = () => {
  const token = localStorage.getItem('token') || '';
  const [rows, setRows] = useState<{ leave_type: LeaveType; total_days: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchEntitlements = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/leave/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Failed to load entitlements');
      const data = await r.json();
      const merged = (Object.keys(DEFAULTS) as LeaveType[]).map(type => {
        const existing = data.find((d: any) => d.leave_type === type);
        return { leave_type: type, total_days: existing?.total_days ?? DEFAULTS[type] };
      });
      setRows(merged);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const saveEntitlement = async (type: LeaveType, total_days: number) => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/leave/entitlements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leave_type: type, total_days }),
      });
      if (!r.ok) throw new Error('Failed to save entitlement');
      message.success('Updated successfully');
      await fetchEntitlements();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, []);

  const columns = [
    {
      title: 'Leave Type',
      dataIndex: 'leave_type',
      render: (type: LeaveType) => <Tag color={COLOR_MAP[type]}>{type.toUpperCase()}</Tag>,
    },
    {
      title: 'Days Allowed',
      dataIndex: 'total_days',
      render: (val: number, record: any) => (
        <InputNumber
          min={0}
          max={365}
          defaultValue={val}
          disabled={record.leave_type === 'unpaid'}
          onBlur={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (!isNaN(v)) saveEntitlement(record.leave_type, v);
          }}
        />
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        title={
          <Space>
            <SettingOutlined />
            <Title level={4} style={{ margin: 0 }}>
              Leave Settings (Company Entitlements)
            </Title>
          </Space>
        }
        className="shadow-lg border-0"
      >
        <Text type="secondary">
          Set standard leave allowances for your company. These apply to all employees unless modified individually.
        </Text>
        <Table
          className="mt-4"
          rowKey="leave_type"
          columns={columns}
          dataSource={rows}
          pagination={false}
          loading={saving}
        />
      </Card>
    </motion.div>
  );
};
