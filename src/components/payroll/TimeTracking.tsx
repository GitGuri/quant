import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Input,
  Space,
  Tag,
  message,
  Spin // Added Spin for loading indicator
} from 'antd';
import {
  ClockCircleOutlined,
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined // Added LoadingOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useAuth } from '../../AuthPage'; // Import useAuth

// Define the Employee and TimeEntry types to match your backend API structure
// Assuming Employee.id is a string (UUID)
export interface Employee {
  id: string; // UUID from backend
  name: string;
  email: string;
  position: string;
  id_number: string;
  contact_number: string;
  address: string;
  start_date: string;
  payment_type: 'hourly' | 'salary';
  base_salary: number | null; // <-- Change this
  hourly_rate: number | null; // <-- Change this
  hours_worked_total: number; // <-- Change this
  bank_name: string | null;
  account_number: string | null;
  branch_code: string | null;
  bankDetails?: { // If your backend also sends a nested bankDetails object
    bank_id: string;
    account_holder: string;
    bank_name: string;
    account_number: string;
    branch_code: string;
  };
}

export interface TimeEntry {
  id: string; // UUID from backend
  employee_id: string; // References Employee.id (UUID)
  date: string; // YYYY-MM-DD
  hours_worked: number; // Snake case for backend consistency
  description: string;
  status: 'pending' | 'approved' | 'rejected' | null; // Changed to allow null
}

const { Option } = Select;
const { TextArea } = Input;

interface TimeTrackingProps {
  employees: Employee[]; // List of employees, likely passed from PayrollDashboard
  onTimeEntryActionSuccess: () => Promise<void>; // Callback to refresh employee list in parent
  onUpdateEmployeeHours: () => Promise<void>; // Callback to update employee hours in parent
}

const API_BASE_URL = 'https://quantnow.onrender.com'; // Define your API base URL

const TimeTracking: React.FC<TimeTrackingProps> = ({
  employees,
  onTimeEntryActionSuccess,
  onUpdateEmployeeHours
}) => {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isAuthenticated } = useAuth(); // Get authentication status
  const token = localStorage.getItem('token'); // Retrieve the token

  // Memoized function to fetch time entries from the backend
  const fetchTimeEntries = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for time entries.');
      setTimeEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let allEntries: TimeEntry[] = [];
      // Fetch all time entries from the backend (assuming a general endpoint exists or iterate)
      // If a general /api/time-entries endpoint existed, it would be more efficient.
      // For now, we'll iterate through employees to fetch their entries.
      for (const employee of employees) {
        try {
          const response = await fetch(`${API_BASE_URL}/employees/${employee.id}/time-entries`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`, // Include the JWT token
            },
          });
          if (!response.ok) {
            console.warn(`Failed to fetch time entries for employee ${employee.id}: ${response.status}`);
            continue;
          }
          const data: TimeEntry[] = await response.json();
          allEntries = allEntries.concat(data);
        } catch (innerError) {
          console.error(`Error fetching time entries for employee ${employee.id}:`, innerError);
        }
      }
      setTimeEntries(allEntries);
    } catch (error) {
      console.error('Error fetching time entries (overall):', error);
      message.error(`Failed to load time entries: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [employees, token]); // Dependency on employees and token

  // Fetch time entries on component mount and when employees or auth state change
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchTimeEntries();
    } else {
      setTimeEntries([]);
      setIsLoading(false);
    }
  }, [fetchTimeEntries, isAuthenticated, token]);

  const handleAddTimeEntry = async (values: any) => {
    if (!token) {
      message.error('You are not authenticated. Please log in to add time entries.');
      return;
    }

    console.log("1. handleAddTimeEntry STARTED with values:", values);
    setIsSubmitting(true);
    try {
      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        hours_worked: values.hoursWorked,
        description: values.description,
        status: 'pending'
      };

      console.log("2. Sending payload to backend:", payload);

      const response = await fetch(`${API_BASE_URL}/employees/${values.employeeId}/time-entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
        body: JSON.stringify(payload)
      });

      console.log("3. Backend response status:", response.status);
      const responseData = await response.json();
      console.log("4. Backend response data:", responseData);


      if (!response.ok) {
        throw new Error(responseData.error || `Failed to add time entry: ${response.status}`);
      }

      form.resetFields();
      setIsModalVisible(false);
      message.success('Time entry added successfully and awaiting approval!');
      await fetchTimeEntries();
      await onTimeEntryActionSuccess(); // Trigger parent refresh
      console.log("5. Time entry successfully added and UI updated.");
    } catch (error) {
      console.error('Error adding time entry:', error);
      message.error(`Failed to add time entry: ${error instanceof Error ? error.message : String(error)}`);
      console.log("6. Error caught during time entry addition.");
    } finally {
      setIsSubmitting(false);
      console.log("7. isSubmitting set to false.");
    }
  };

  const handleApproveEntry = async (entryId: string, employeeId: string, hoursWorked: number) => {
    if (!token) {
      message.error('You are not authenticated. Please log in to approve time entries.');
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Update Time Entry status in backend
      const timeEntryUpdateResponse = await fetch(`${API_BASE_URL}/time-entries/${entryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
        body: JSON.stringify({ status: 'approved' })
      });

      if (!timeEntryUpdateResponse.ok) {
        const errorData = await timeEntryUpdateResponse.json().catch(() => ({ error: 'Unknown error.' }));
        throw new Error(errorData.error || `Failed to approve time entry: ${timeEntryUpdateResponse.status}`);
      }

      // Step 2: Update Employee's total hours in backend
      const employee = employees.find(emp => emp.id === employeeId);
      if (!employee) {
        throw new Error('Employee not found for hours update.');
      }



      // Step 3: Refresh local state and parent's employee data
      await fetchTimeEntries();
      await onUpdateEmployeeHours(); // Tell parent to re-fetch employees

      message.success('Time entry approved and employee hours updated!');
    } catch (error) {
      console.error('Error approving time entry:', error);
      message.error(`Failed to approve time entry: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectEntry = async (entryId: string) => {
    if (!token) {
      message.error('You are not authenticated. Please log in to reject time entries.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/time-entries/${entryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        throw new Error(errorData.error || `Failed to reject time entry: ${response.status}`);
      }

      setTimeEntries(prev => prev.filter(e => e.id !== entryId));
      message.info('Time entry rejected and removed.');
      await onTimeEntryActionSuccess(); // Trigger parent refresh
    } catch (error) {
      console.error('Error rejecting time entry:', error);
      message.error(`Failed to reject time entry: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(emp => emp.id === employeeId);
    return employee ? employee.name : 'Unknown Employee';
  };

  const columns = [
    {
      title: 'Employee',
      dataIndex: 'employee_id',
      key: 'employee',
      render: (employee_id: string) => getEmployeeName(employee_id)
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Hours Worked',
      dataIndex: 'hours_worked',
      key: 'hoursWorked',
      render: (hours: number) => `${hours}h`
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || 'No description'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: 'pending' | 'approved' | 'rejected' | null) => {
        const displayStatus = status || 'unknown';
        let color: string;
        switch (displayStatus) {
          case 'approved':
            color = 'green';
            break;
          case 'pending':
            color = 'orange';
            break;
          case 'rejected':
            color = 'red';
            break;
          default:
            color = 'default';
        }
        return (
          <Tag color={color}>
            {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record: TimeEntry) => {
        if (record.status === 'approved') {
          return <Tag color='green'>Approved</Tag>;
        }
        if (record.status === 'rejected') {
          return <Tag color='red'>Rejected</Tag>;
        }
        return (
          <Space>
            <Button
              type='primary'
              size='small'
              icon={<CheckOutlined />}
              onClick={() => handleApproveEntry(record.id, record.employee_id, record.hours_worked)}
              className='bg-green-500 hover:bg-green-600 border-0'
              loading={isLoading}
            >
              Approve
            </Button>
            <Button
              danger
              size='small'
              icon={<CloseOutlined />}
              onClick={() => handleRejectEntry(record.id)}
              loading={isLoading}
            >
              Reject
            </Button>
          </Space>
        );
      }
    }
  ];

  const pendingEntries = timeEntries.filter(entry => entry.status === 'pending').length;
  const totalHoursThisWeek = timeEntries
    .filter(entry => dayjs(entry.date).isAfter(dayjs().startOf('week')) && entry.status === 'approved')
    .reduce((sum, entry) => sum + entry.hours_worked, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
        <Card className='text-center shadow-lg border-0 bg-gradient-to-br from-blue-50 to-blue-100'>
          <div className='text-2xl font-bold text-blue-600'>
            {timeEntries.length}
          </div>
          <div className='text-gray-600'>Total Entries</div>
        </Card>
        <Card className='text-center shadow-lg border-0 bg-gradient-to-br from-orange-50 to-orange-100'>
          <div className='text-2xl font-bold text-orange-600'>
            {pendingEntries}
          </div>
          <div className='text-gray-600'>Pending Approval</div>
        </Card>
        <Card className='text-center shadow-lg border-0 bg-gradient-to-br from-green-50 to-green-100'>
          <div className='text-2xl font-bold text-green-600'>
            {totalHoursThisWeek}h
          </div>
          <div className='text-gray-600'>Hours This Week (Approved)</div>
        </Card>
      </div>

      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            Time Tracking Register
          </Space>
        }
        extra={
          <Button
            type='primary'
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setIsModalVisible(true);
            }}
            className='bg-gradient-to-r from-blue-500 to-purple-600 border-0'
          >
            Add Time Entry
          </Button>
        }
        className='shadow-lg border-0'
        headStyle={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          fontSize: '18px',
          fontWeight: 'bold'
        }}
      >
        <Table
          columns={columns}
          dataSource={timeEntries}
          rowKey='id'
          pagination={{ pageSize: 10 }}
          scroll={{ x: true }}
          loading={isLoading}
        />
      </Card>

      <Modal
        title='Add Time Entry'
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        confirmLoading={isSubmitting}
      >
        <Form
          form={form}
          layout='vertical'
          onFinish={handleAddTimeEntry}
          onFinishFailed={(errorInfo) => {
            console.error("Form validation failed:", errorInfo);
            message.error("Please correct the form errors before submitting.");
            setIsSubmitting(false);
          }}
          initialValues={{ date: dayjs() }}
        >
          <Form.Item
            name='employeeId'
            label='Employee'
            rules={[{ required: true, message: 'Please select an employee' }]}
          >
            <Select placeholder='Select employee' loading={employees.length === 0 && isLoading}>
              {employees.map(employee => (
                <Option key={employee.id} value={employee.id}>
                  {employee.name} - {employee.position}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name='date'
            label='Date'
            rules={[{ required: true, message: 'Please select date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name='hoursWorked'
            label='Hours Worked'
            rules={[
              { required: true, message: 'Please enter hours worked' },
              {
                type: 'number',
                min: 0.5,
                max: 24,
                message: 'Hours must be between 0.5 and 24'
              }
            ]}
          >
            <InputNumber
              min={0.5}
              max={24}
              step={0.5}
              style={{ width: '100%' }}
              placeholder='Enter hours worked'
            />
          </Form.Item>

          <Form.Item name='description' label='Description (Optional)'>
            <TextArea rows={3} placeholder='Enter work description...' />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type='primary' htmlType='submit' loading={isSubmitting}>
                Add Entry
              </Button>
              <Button onClick={() => setIsModalVisible(false)} disabled={isSubmitting}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default TimeTracking;
