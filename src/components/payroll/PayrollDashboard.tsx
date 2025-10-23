import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Space, Statistic, Button, DatePicker } from 'antd';
import {
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '../../components/ui/tabs';
import { EmployeeList } from '../system/EmployeeList';
import PayslipGenerator from '../payroll/PayslipGenerator';
import EmployeeRegistration from '../system/EmployeeRegistration';
import TimeTracking from './TimeTracking';
import { Header } from '../layout/Header';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../AuthPage';
import dayjs from 'dayjs';
import type { Employee } from '../../types/payroll';
import LeaveManagement from './LeaveManagement';
import { useCurrency } from '../../contexts/CurrencyContext'; // ⬅️ add

import { LeaveSettings } from './LeaveSettings';
const { Title } = Typography;
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

const PayrollDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const { isAuthenticated } = useAuth();
  const roles = JSON.parse(localStorage.getItem('userRoles') || '[]') as string[];
  const isAdmin = roles.map(r => r.toLowerCase()).some(r => r === 'admin' || r === 'owner');
  const rolesLower = roles.map(r => r.toLowerCase());
const canSeeEmployeeManagement = rolesLower.some(r =>
  ['payroll', 'owner', 'admin'].includes(r)
);

const defaultTab = canSeeEmployeeManagement ? 'employees' : 'leave';
  const token = localStorage.getItem('token');

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const { symbol, fmt } = useCurrency(); // ⬅️ add


  /** Fetch employees */
  const fetchEmployees = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setEmployees([]);
      setLoading(false);
      setError('Please log in to view payroll data.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('Failed to fetch employees');
      const data = await res.json();
      setEmployees(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, isAuthenticated, token]);

  /** Fetch total hours from /time-entries/summary */
  const fetchTimeSummaries = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD'),
      });
      const res = await fetch(`${API_BASE_URL}/time-entries/summary?${qs}`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();

      if (!Array.isArray(data)) return;

      // ✅ Merge total_hours into employees list (handles employee_id or user_id)
      setEmployees(prev =>
        prev.map(emp => {
          const match = data.find(
            (x: any) =>
              String(x.employee_id) === String(emp.id) ||
              String(x.user_id) === String(emp.user_id)
          );
          return {
            ...emp,
            hours_worked_total: match ? match.total_hours : 0,
          };
        })
      );
    } catch (err) {
      console.error('Failed to fetch summaries', err);
    }
  }, [range, getAuthHeaders]);

  /** Initial data load */
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    (async () => {
      setLoading(true);
      await fetchEmployees();
      await fetchTimeSummaries();
      setLoading(false);
    })();
  }, [fetchEmployees, fetchTimeSummaries, isAuthenticated, token]);

  /** Sync selected employee whenever totals update */
  useEffect(() => {
    if (!selectedEmployee) return;
    const updated = employees.find(e => e.id === selectedEmployee.id);
    if (updated && updated.hours_worked_total !== selectedEmployee.hours_worked_total) {
      setSelectedEmployee(updated);
    }
  }, [employees, selectedEmployee]);

  const handleEmployeeActionSuccess = async () => {
    await fetchEmployees();
    await fetchTimeSummaries();
    setSelectedEmployee(null);
    setEditingEmployee(null);
    setIsEditModalOpen(false);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditModalOpen(true);
  };

  /** Compute totals */
  const totalEmployees = employees.length;
  const totalHours = employees.reduce(
    (sum, emp) => sum + (parseFloat(emp.hours_worked_total as any) || 0),
    0
  );
  const totalPayroll = employees.reduce((sum, emp) => {
    let monthlyPay = 0;
    if (emp.payment_type === 'salary') {
      monthlyPay = parseFloat(emp.base_salary as any) || 0;
    } else if (emp.payment_type === 'hourly') {
      const hours = parseFloat(emp.hours_worked_total as any) || 0;
      const rate = parseFloat(emp.hourly_rate as any) || 0;
      monthlyPay = hours * rate;
    }
    return sum + monthlyPay;
  }, 0);

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <p className='ml-2 text-lg'>Loading payroll data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center h-full text-red-600'>
        <p className='text-lg font-semibold'>Error: {error}</p>
        <Button onClick={fetchEmployees} className='mt-4'>Retry</Button>
      </div>
    );
  }

  return (
    <div className='flex-1 overflow-hidden'>
      <motion.div className='p-6 h-full overflow-y-auto'>
        <Header title='Payroll Management' />

        {/* Date Range Filter */}
        <Row gutter={[24, 24]} className='m-8'>
          <Col>
            <Space>
              <DatePicker.RangePicker
                value={range}
                onChange={(v) => v && setRange(v as [dayjs.Dayjs, dayjs.Dayjs])}
                format='YYYY-MM-DD'
              />
              <Button type='primary' onClick={fetchTimeSummaries}>
                Refresh Period Totals
              </Button>
            </Space>
          </Col>
        </Row>

        {/* KPI Cards */}
        <Row gutter={[24, 24]} className='m-8'>
          <Col xs={24} sm={12} lg={8}>
            <Card className='text-center shadow-lg border-0 bg-blue-50'>
              <Space direction='vertical'>
                <TeamOutlined className='text-3xl text-blue-600' />
                <Statistic title='Total Employees' value={totalEmployees} />
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card className='text-center shadow-lg border-0 bg-green-50'>
              <Space direction='vertical'>
                <UserOutlined className='text-3xl text-green-600' />
                <Statistic title='Total Hours' value={totalHours.toFixed(2)} />
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card className='text-center shadow-lg border-0 bg-purple-50'>
              <Space direction='vertical'>
                <DollarOutlined className='text-3xl text-purple-600' />
                <Statistic
  title='Total Payroll'
  value={totalPayroll}                 // pass the raw number
  formatter={(v) => fmt(Number(v))}    // ⬅️ currency-aware format
/>

              </Space>
            </Card>
          </Col>
        </Row>

        {/* Tabs */}
<Tabs defaultValue={defaultTab} className="w-full">
  <TabsList className={`grid w-full ${canSeeEmployeeManagement ? 'grid-cols-4' : 'grid-cols-3'} mb-6`}>
    {canSeeEmployeeManagement && (
      <TabsTrigger value="employees">Employee Management</TabsTrigger>
    )}
    <TabsTrigger value="time-tracking">Time Tracking</TabsTrigger>
    <TabsTrigger value="leave">
      <CalendarOutlined />Leave
    </TabsTrigger>
    {isAdmin && (
      <TabsTrigger value="leave-settings">
        <CalendarOutlined /> Settings
      </TabsTrigger>
    )}
  </TabsList>






{canSeeEmployeeManagement && (
  <TabsContent value="employees">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-semibold">Employees</h2>
      <Button
        type="primary"
        onClick={() => {
          setEditingEmployee(null);
          setIsEditModalOpen(true);
        }}
      >
        Add Employee
      </Button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <EmployeeList
          employees={employees}
          onEmployeeActionSuccess={handleEmployeeActionSuccess}
          onSelectEmployee={setSelectedEmployee}
          selectedEmployee={selectedEmployee}
          onEditEmployee={handleEditEmployee}
        />
      </div>
      <div className="lg:col-span-1">
        <PayslipGenerator employee={selectedEmployee} range={range} />
      </div>
    </div>
  </TabsContent>
)}


          <TabsContent value='time-tracking'>
            <TimeTracking
              employees={employees}
              onUpdateEmployeeHours={handleEmployeeActionSuccess}
              onTimeEntryActionSuccess={handleEmployeeActionSuccess}
            />
          </TabsContent>

                      <TabsContent value='leave' className='space-y-6'>
  <LeaveManagement
    employees={employees}
     onRefreshAll={handleEmployeeActionSuccess}
 />
 </TabsContent>

 <TabsContent value="leave-settings">
  <LeaveSettings />
</TabsContent>
        </Tabs>
      </motion.div>

      <EmployeeRegistration
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEmployeeActionSuccess}
        initialData={editingEmployee}
      />
    </div>
  );
};

export default PayrollDashboard;
