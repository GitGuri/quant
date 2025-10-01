// src/components/staff/EmployeeRegistration.tsx
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
import type { Employee } from '../../types/payroll';
import moment from 'moment';
import { useAuth } from '../../AuthPage';

const { Option } = Select;

interface EmployeeRegistrationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Employee | null;
}

const API_BASE_URL = 'http://localhost:3000';

const EmployeeRegistration: React.FC<EmployeeRegistrationProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Extract bank details with comprehensive fallback handling
        let bankDetails = {
          accountHolder: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
        };

        // Handle different possible bank details structures
        if (initialData.bank_details) {
          // Database structure (snake_case)
          bankDetails = {
            accountHolder: initialData.bank_details.account_holder || '',
            bankName: initialData.bank_details.bank_name || '',
            accountNumber: initialData.bank_details.account_number || '',
            branchCode: initialData.bank_details.branch_code || '',
          };
        } else if (initialData.bankDetails) {
          // Form structure (camelCase)
          bankDetails = {
            accountHolder: initialData.bankDetails.accountHolder || '',
            bankName: initialData.bankDetails.bankName || '',
            accountNumber: initialData.bankDetails.accountNumber || '',
            branchCode: initialData.bankDetails.branchCode || '',
          };
        } else {
          // Individual fields (view modal compatibility)
          bankDetails = {
            accountHolder: initialData.account_holder || '',
            bankName: initialData.bank_name || '',
            accountNumber: initialData.account_number || '',
            branchCode: initialData.branch_code || '',
          };
        }

        // Set form fields for editing
        form.setFieldsValue({
          name: initialData.name || '',
          position: initialData.position || '',
          email: initialData.email || '',
          idNumber: initialData.id_number || initialData.idNumber || '',
          phone: initialData.phone || '',
          startDate: initialData.start_date ? moment(initialData.start_date) : null,
          paymentType: initialData.payment_type || initialData.paymentType || 'salary',
          baseSalary: initialData.base_salary !== null ? initialData.base_salary : (initialData.baseSalary || 0),
          hourlyRate: initialData.hourly_rate !== null ? initialData.hourly_rate : (initialData.hourlyRate || 0),
          hoursWorked: initialData.hours_worked_total || initialData.hoursWorked || 0,
          bankDetails: bankDetails,
        });
      } else {
        // Reset form for adding new employee
        form.resetFields();
        form.setFieldsValue({
          paymentType: 'salary',
          baseSalary: 0,
          hourlyRate: 0,
          hoursWorked: 0,
          startDate: null,
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

  const handleSubmit = async (values: any) => {
    if (!isAuthenticated) {
      message.error('You must be logged in to perform this action.');
      return;
    }

    setLoading(true);
    try {
      // Prepare the payload with correct field names
      const payload = {
        name: values.name,
        position: values.position,
        email: values.email,
        idNumber: values.idNumber,
        phone: values.phone,
        startDate: values.startDate ? moment(values.startDate).format('YYYY-MM-DD') : null,
        paymentType: values.paymentType,
        baseSalary: values.paymentType === 'salary' ? values.baseSalary : null,
        hourlyRate: values.paymentType === 'hourly' ? values.hourlyRate : null,
        bankDetails: {
          accountHolder: values.bankDetails.accountHolder,
          bankName: values.bankDetails.bankName,
          accountNumber: values.bankDetails.accountNumber,
          branchCode: values.bankDetails.branchCode,
        },
      };

      let response;
      if (initialData && initialData.id) {
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

      const result = await response.json();
      message.success(
        initialData ? 'Employee updated successfully!' : 'Employee added successfully!'
      );
      onSuccess();
      onClose();
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
      footer={null}
      destroyOnClose={true}
      width={600}
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
          startDate: null,
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
          name='idNumber'
          label='ID Number'
          rules={[{ required: true, message: 'Please enter employee ID number' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name='phone' label='Phone Number'>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='startDate'
          label='Start Date'
          rules={[{ required: true, message: 'Please select start date' }]}
        >
          <DatePicker style={{ width: '100%' }} disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name='paymentType'
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
                name='baseSalary'
                label='Base Salary (R)'
                rules={[{ required: true, message: 'Please enter base salary' }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  disabled={loading || !isAuthenticated}
                  formatter={value => `R ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/R\s?|(,*)/g, '') as any}
                />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name='hourlyRate'
                  label='Hourly Rate (R)'
                  rules={[{ required: true, message: 'Please enter hourly rate' }]}
                >
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    disabled={loading || !isAuthenticated}
                    formatter={value => `R ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={value => value!.replace(/R\s?|(,*)/g, '') as any}
                  />
                </Form.Item>
                <Form.Item
                  name='hoursWorked'
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
          name={['bankDetails', 'accountHolder']}
          label='Account Holder Name'
          rules={[{ required: true, message: 'Please enter account holder name' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'bankName']}
          label='Bank Name'
          rules={[{ required: true, message: 'Please enter bank name' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'accountNumber']}
          label='Account Number'
          rules={[{ required: true, message: 'Please enter account number' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'branchCode']}
          label='Branch Code'
          rules={[{ required: true, message: 'Please enter branch code' }]}
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