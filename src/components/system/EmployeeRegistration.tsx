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
  Divider,
  Switch,
  Tooltip,
} from 'antd';
import type { Employee } from '../../types/payroll';
import moment from 'moment';
import { useAuth } from '../../AuthPage';

const { Option } = Select;
const { Title, Text } = Typography;

interface EmployeeRegistrationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Employee | null;
}

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

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
    if (!isOpen) return;

    if (initialData) {
      let bankDetails = {
        accountHolder: '',
        bankName: '',
        accountNumber: '',
        branchCode: '',
      };

      if ((initialData as any).bank_details) {
        bankDetails = {
          accountHolder: (initialData as any).bank_details.account_holder || '',
          bankName: (initialData as any).bank_details.bank_name || '',
          accountNumber: (initialData as any).bank_details.account_number || '',
          branchCode: (initialData as any).bank_details.branch_code || '',
        };
      } else if ((initialData as any).bankDetails) {
        bankDetails = {
          accountHolder: (initialData as any).bankDetails.accountHolder || '',
          bankName: (initialData as any).bankDetails.bankName || '',
          accountNumber: (initialData as any).bankDetails.accountNumber || '',
          branchCode: (initialData as any).bankDetails.branchCode || '',
        };
      } else {
        bankDetails = {
          accountHolder: (initialData as any).account_holder || '',
          bankName: (initialData as any).bank_name || '',
          accountNumber: (initialData as any).account_number || '',
          branchCode: (initialData as any).branch_code || '',
        };
      }

      const inc_paye = (initialData as any).include_paye;
      const inc_uif_emp = (initialData as any).include_uif_employee;
      const inc_uif_empr = (initialData as any).include_uif_employer;
      const inc_sdl = (initialData as any).include_sdl;
      const sdl_exempt = (initialData as any).sdl_exempt;
      const uif_exempt_reason = (initialData as any).uif_exempt_reason || '';
      const tax_directive_rate =
        (initialData as any).tax_directive_rate !== null &&
        (initialData as any).tax_directive_rate !== undefined
          ? Number((initialData as any).tax_directive_rate)
          : undefined;

      form.setFieldsValue({
        name: (initialData as any).name || '',
        position: (initialData as any).position || '',
        email: (initialData as any).email || '',
        idNumber: (initialData as any).id_number || (initialData as any).idNumber || '',
        phone: (initialData as any).phone || '',
        startDate: (initialData as any).start_date ? moment((initialData as any).start_date) : null,
        paymentType: (initialData as any).payment_type || (initialData as any).paymentType || 'salary',
        baseSalary:
          (initialData as any).base_salary !== null
            ? (initialData as any).base_salary
            : (initialData as any).baseSalary || 0,
        hourlyRate:
          (initialData as any).hourly_rate !== null
            ? (initialData as any).hourly_rate
            : (initialData as any).hourlyRate || 0,
        bankDetails,

        include_paye: typeof inc_paye === 'boolean' ? inc_paye : true,
        include_uif_employee: typeof inc_uif_emp === 'boolean' ? inc_uif_emp : true,
        include_uif_employer: typeof inc_uif_empr === 'boolean' ? inc_uif_empr : true,
        include_sdl: typeof inc_sdl === 'boolean' ? inc_sdl : true,
        sdl_exempt: typeof sdl_exempt === 'boolean' ? sdl_exempt : false,
        uif_exempt_reason,
        tax_directive_rate,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        paymentType: 'salary',
        baseSalary: 0,
        hourlyRate: 0,
        startDate: null,
        bankDetails: {
          accountHolder: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
        },
        include_paye: true,
        include_uif_employee: true,
        include_uif_employer: true,
        include_sdl: true,
        sdl_exempt: false,
        uif_exempt_reason: '',
        tax_directive_rate: undefined,
      });
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
        include_paye: !!values.include_paye,
        include_uif_employee: !!values.include_uif_employee,
        include_uif_employer: !!values.include_uif_employer,
        include_sdl: !!values.include_sdl,
        sdl_exempt: !!values.sdl_exempt,
        uif_exempt_reason: values.uif_exempt_reason || null,
        tax_directive_rate:
          values.tax_directive_rate === undefined || values.tax_directive_rate === null
            ? null
            : Number(values.tax_directive_rate),
      };

      let response: Response;
      if (initialData && (initialData as any).id) {
        response = await fetch(`${API_BASE_URL}/employees/${(initialData as any).id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${API_BASE_URL}/employees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

await response.json();
message.success(initialData ? 'Employee updated successfully!' : 'Employee added successfully!');

// 🔔 notify lists to refetch
window.dispatchEvent(new CustomEvent('employee:saved'));

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
      destroyOnClose
      width={680}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          paymentType: 'salary',
          baseSalary: 0,
          hourlyRate: 0,
          startDate: null,
          bankDetails: {
            accountHolder: '',
            bankName: '',
            accountNumber: '',
            branchCode: '',
          },
          include_paye: true,
          include_uif_employee: true,
          include_uif_employer: true,
          include_sdl: true,
          sdl_exempt: false,
          uif_exempt_reason: '',
          tax_directive_rate: undefined,
        }}
      >
        <Title level={5}>Basic Details</Title>
        <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Please enter employee full name' }]}>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name="position" label="Position" rules={[{ required: true, message: 'Please enter employee position' }]}>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name="idNumber" label="ID Number" rules={[{ required: true, message: 'Please enter employee ID number' }]}>
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name="phone" label="Phone Number">
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item name="startDate" label="Start Date" rules={[{ required: true, message: 'Please select start date' }]}>
          <DatePicker style={{ width: '100%' }} disabled={loading || !isAuthenticated} />
        </Form.Item>

        <Divider />

        <Title level={5}>Remuneration</Title>
        <Form.Item
          name="paymentType"
          label="Payment Type"
          rules={[{ required: true, message: 'Please select payment type' }]}
        >
          <Select disabled={loading || !isAuthenticated}>
            <Option value="salary">Salary</Option>
            <Option value="hourly">Hourly</Option>
          </Select>
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(p, c) => p.paymentType !== c.paymentType}>
          {({ getFieldValue }) =>
            getFieldValue('paymentType') === 'salary' ? (
              <Form.Item
                name="baseSalary"
                label="Base Salary (R)"
                rules={[{ required: true, message: 'Please enter base salary' }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  disabled={loading || !isAuthenticated}
                  formatter={(v) => `R ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => (v || '').replace(/R\s?|(,*)/g, '') as any}
                />
              </Form.Item>
            ) : (
              <Form.Item
                name="hourlyRate"
                label="Hourly Rate (R)"
                rules={[{ required: true, message: 'Please enter hourly rate' }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  disabled={loading || !isAuthenticated}
                  formatter={(v) => `R ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => (v || '').replace(/R\s?|(,*)/g, '') as any}
                />
              </Form.Item>
            )
          }
        </Form.Item>

        <Divider />

        <Title level={5}>Bank Details</Title>
        <Form.Item
          name={['bankDetails', 'accountHolder']}
          label="Account Holder Name"
          rules={[{ required: true, message: 'Please enter account holder name' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'bankName']}
          label="Bank Name"
          rules={[{ required: true, message: 'Please enter bank name' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'accountNumber']}
          label="Account Number"
          rules={[{ required: true, message: 'Please enter account number' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>
        <Form.Item
          name={['bankDetails', 'branchCode']}
          label="Branch Code"
          rules={[{ required: true, message: 'Please enter branch code' }]}
        >
          <Input disabled={loading || !isAuthenticated} />
        </Form.Item>

        <Divider />

        <Title level={5}>Statutory Settings</Title>

        {/* Each switch is bound to form via valuePropName="checked" */}
        <Form.Item name="include_paye" valuePropName="checked">
          <Space align="center">
            <Switch disabled={loading || !isAuthenticated} />
            <Text>Include PAYE (employee deduction)</Text>
          </Space>
        </Form.Item>

        <Form.Item name="include_uif_employee" valuePropName="checked">
          <Space align="center">
            <Switch disabled={loading || !isAuthenticated} />
            <Text>Include UIF — Employee</Text>
          </Space>
        </Form.Item>

        <Form.Item name="include_uif_employer" valuePropName="checked">
          <Space align="center">
            <Switch disabled={loading || !isAuthenticated} />
            <Tooltip title="Employer UIF (company contribution). Not deducted from employee's net. Stored for reporting.">
              <Text>Include UIF — Employer</Text>
            </Tooltip>
          </Space>
        </Form.Item>

        <Form.Item name="include_sdl" valuePropName="checked">
          <Space align="center">
            <Switch disabled={loading || !isAuthenticated} />
            <Tooltip title="SDL is an employer contribution. Not deducted from employee's net.">
              <Text>Include SDL</Text>
            </Tooltip>
          </Space>
        </Form.Item>

        <Form.Item name="sdl_exempt" valuePropName="checked">
          <Space align="center">
            <Switch disabled={loading || !isAuthenticated} />
            <Text>SDL Exempt</Text>
          </Space>
        </Form.Item>

        <Form.Item name="uif_exempt_reason" label="UIF Exempt Reason (optional)">
          <Input.TextArea rows={2} placeholder="Reason (if UIF is exempt for this employee/employer)" />
        </Form.Item>

        <Form.Item
          name="tax_directive_rate"
          label="Tax Directive Rate % (optional)"
          tooltip="If set, PAYE will be calculated as gross * (rate/100) instead of standard brackets."
        >
          <InputNumber min={0} max={100} precision={2} style={{ width: 180 }} />
        </Form.Item>

        <Form.Item style={{ marginTop: 16 }}>
          <Space>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading} disabled={!isAuthenticated}>
              {initialData ? 'Update Employee' : 'Add Employee'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EmployeeRegistration;
