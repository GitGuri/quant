import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  DatePicker,
  Space,
  InputNumber,
  message,
  Typography,
} from 'antd';
import type { Employee } from '../../types/payroll'; // Ensure this path is correct
 // Ensure this path is correct
import moment from 'moment';
import { useAuth } from '../../AuthPage'; // Import useAuth

const { Option } = Select;

interface EmployeeRegistrationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Employee | null; // For editing existing employee
}

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Your backend API base URL

const EmployeeRegistration: React.FC<EmployeeRegistrationProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth(); // Only isAuthenticated is needed
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Set form fields for editing
        form.setFieldsValue({
          ...initialData,
          startDate: moment(initialData.startDate), // Convert string to moment object for DatePicker
          bankDetails: initialData.bankDetails || {}, // Ensure bankDetails is an object
        });
      } else {
        // Reset form for adding new employee
        form.resetFields();
        form.setFieldsValue({
          paymentType: 'salary', // Default to salary
          baseSalary: 0,
          hourlyRate: 0,
          hoursWorked: 0,
          bankDetails: {
            accountHolder: '',
            bankName: '',
            accountNumber: '',
            branchCode: '',
          },
        });
      }
    }
  }, [isOpen, initialData, form]);

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const handleSubmit = async (values: Employee) => {
    if (!isAuthenticated) {
      message.error('You must be logged in to perform this action.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...values,
        startDate: values.startDate ? moment(values.startDate).toISOString() : undefined, // Convert moment to ISO string
        // Ensure bankDetails is correctly structured, even if empty
        bankDetails: values.bankDetails || {
          accountHolder: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
        },
      };

      let response;
      if (initialData) {
        // Update existing employee
        response = await fetch(`${API_BASE_URL}/employees/${initialData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Add new employee
        response = await fetch(`${API_BASE_URL}/employees`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      message.success(
        initialData ? 'Employee updated successfully!' : 'Employee added successfully!'
      );
      onSuccess(); // Trigger data refresh in parent
      onClose(); // Close modal
    } catch (error: any) {
      console.error('Error submitting employee data:', error);
      message.error(`Failed to ${initialData ? 'update' : 'add'} employee: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={initialData ? 'Edit Employee' : 'Add New Employee'}
      open={isOpen}
      onCancel={onClose}
      footer={null} // Custom footer for buttons
      destroyOnClose={true} // Ensures form resets when closed
    >
      <Form
        form={form}
        layout='vertical'
        onFinish={handleSubmit}
        initialValues={{
          paymentType: 'salary',
          baseSalary: 0,
          hourlyRate: 0,
          hoursWorked: 0,
          bankDetails: {
            accountHolder: '',
            bankName: '',
            accountNumber: '',
            branchCode: '',
          },
        }}
      >
        <Form.Item
          name='name'
          label='Full Name'
          rules={[{ required: true, message: 'Please enter employee full name' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='position'
          label='Position'
          rules={[{ required: true, message: 'Please enter employee position' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='email'
          label='Email'
          rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='idNumber' // Changed from id_number
          label='ID Number'
          rules={[{ required: true, message: 'Please enter employee ID number' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name='phone' label='Phone Number'>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='startDate' // Changed from start_date
          label='Start Date'
          rules={[{ required: true, message: 'Please select start date' }]}
        >
          <DatePicker style={{ width: '100%' }} disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='paymentType' // Changed from payment_type
          label='Payment Type'
          rules={[{ required: true, message: 'Please select payment type' }]}
        >
          <Select disabled={loading || !isAuthenticated}>
            <Option value='salary'>Salary</Option>
            <Option value='hourly'>Hourly</Option>
          </Select>
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues.paymentType !== currentValues.paymentType
          }
        >
          {({ getFieldValue }) =>
            getFieldValue('paymentType') === 'salary' ? (
              <Form.Item
                name='baseSalary' // Changed from base_salary
                label='Base Salary (R)'
                rules={[{ required: true, message: 'Please enter base salary' }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  disabled={loading || !isAuthenticated}
                />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name='hourlyRate' // Changed from hourly_rate
                  label='Hourly Rate (R)'
                  rules={[{ required: true, message: 'Please enter hourly rate' }]}
                >
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    disabled={loading || !isAuthenticated}
                  />
                </Form.Item>
                <Form.Item
                  name='hoursWorked' // Changed from hours_worked_total
                  label='Total Hours Worked (for initial setup)'
                >
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    disabled={loading || !isAuthenticated}
                  />
                </Form.Item>
              </>
            )
          }
        </Form.Item>

        <Typography.Title level={5}>Bank Details</Typography.Title>
        <Form.Item
          name={['bankDetails', 'accountHolder']} // Changed from account_holder
          label='Account Holder Name'
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'bankName']} // Changed from bank_name
          label='Bank Name'
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'accountNumber']} // Changed from account_number
          label='Account Number'
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'branchCode']} // Changed from branch_code
          label='Branch Code'
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type='primary' htmlType='submit' loading={loading} disabled={!isAuthenticated}>
              {initialData ? 'Update Employee' : 'Add Employee'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EmployeeRegistration;
