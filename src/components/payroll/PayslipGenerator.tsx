// PayslipGenerator.tsx
import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Descriptions,
  Space,
  Typography,
  Divider,
  Alert,
  message
} from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import { type Employee } from '../../types/payroll';
import { useAuth } from '../../AuthPage';

const { Title, Text } = Typography;

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

interface PayrollCalculation {
  grossSalary: number;
  paye: number;
  uif: number;
  sdl: number;
  totalDeductions: number;
  netSalary: number;
}

interface CompanyProfile {
  company: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  company_logo_path?: string | null;
  companyLogoUrl?: string | null;
}

const calculatePayroll = (employee: Employee): PayrollCalculation => {
  let grossSalary = 0;
  const baseSalary = parseFloat(employee.base_salary as any) ?? 0;
  const hourlyRate = parseFloat(employee.hourly_rate as any) ?? 0;
  const hoursWorkedTotal = parseFloat(employee.hours_worked_total as any) ?? 0;

  if (employee.payment_type === 'salary') {
    grossSalary = baseSalary;
  } else if (employee.payment_type === 'hourly') {
    grossSalary = hoursWorkedTotal * hourlyRate;
  }

  const paye = grossSalary * 0.18;
  const uif = Math.min(grossSalary * 0.01, 177.12);
  const sdl = grossSalary * 0.01;

  const totalDeductions = paye + uif;
  const netSalary = grossSalary - totalDeductions;

  return { grossSalary, paye, uif, sdl, totalDeductions, netSalary };
};

interface PayslipGeneratorProps {
  employee: Employee | null;
}

/** ---------- small helpers for nicer banking section ---------- */
const maskAccountNumber = (acct?: string | null, showLast = 4) => {
  if (!acct) return 'N/A';
  const digits = acct.replace(/\s+/g, '');
  const masked = digits
    .split('')
    .map((ch, i) => (i < Math.max(0, digits.length - showLast) ? '•' : ch))
    .join('');
  // group in 4s for readability
  return masked.replace(/(.{4})/g, '$1 ').trim();
};

const addKeyValue = (
  pdf: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number
) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(`${label}`, x, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(value || 'N/A', x, y + 5);
  return y + 12;
};

/** --------------------------- component --------------------------- */
const PayslipGenerator: React.FC<PayslipGeneratorProps> = ({ employee }) => {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<boolean>(false);

  const payrollData: PayrollCalculation | null = employee
    ? calculatePayroll(employee)
    : null;

  useEffect(() => {
    const fetchCompanyProfile = async () => {
      if (!isAuthenticated || !token || !employee) {
        setCompanyProfile(null);
        return;
      }
      setLoadingCompany(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          const body = await response.text();
          console.error(`Profile error ${response.status}: ${body?.slice(0, 500)}`);
          throw new Error(`Profile request failed (${response.status})`);
        }
        const userData = await response.json();

        const profileData: CompanyProfile = {
          company: userData.company || 'Your Company Name',
          address: userData.address || '',
          city: userData.city || '',
          province: userData.province || '',
          postal_code: userData.postal_code || '',
          country: userData.country || '',
          phone: userData.phone || '',
          email: userData.email || '',
          company_logo_path: userData.company_logo_path || null,
          companyLogoUrl: null
        };

        if (profileData.company_logo_path) {
          const logoRes = await fetch(`${API_BASE_URL}/api/profile/logo-url`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (logoRes.ok) {
            const { logoUrl } = await logoRes.json();
            profileData.companyLogoUrl = logoUrl;
          } else {
            console.warn('Logo URL fetch failed:', logoRes.status);
          }
        }

        setCompanyProfile(profileData);
      } catch (err: any) {
        console.error('Error fetching company profile:', err);
        message.error('Failed to load company information.');
        setCompanyProfile({
          company: 'Company Name (Error Loading)'
        } as CompanyProfile);
      } finally {
        setLoadingCompany(false);
      }
    };

    fetchCompanyProfile();
  }, [isAuthenticated, token, employee]);

  if (!isAuthenticated || !token) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <Card
          className='shadow-lg border-0 bg-white/80 backdrop-blur-sm'
          headStyle={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
          title='Payslip Generator'
        >
          <div className='text-center py-8'>
            <FileTextOutlined className='text-6xl text-gray-300 mb-4' />
            <Text className='text-gray-500'>Please log in to generate payslips.</Text>
          </div>
        </Card>
      </motion.div>
    );
  }

  /** ---------------- PDF generator with improved Banking Details ---------------- */
  const generatePDF = async () => {
    if (!employee || !payrollData || !companyProfile) {
      message.error('Missing data to generate payslip.');
      return;
    }

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    const margin = 20;
    const currentDate = new Date().toLocaleDateString('en-ZA');

    let y = margin;

    // Logo (right)
    if (companyProfile.companyLogoUrl) {
      try {
        const r = await fetch(companyProfile.companyLogoUrl);
        if (r.ok) {
          const blob = await r.blob();
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          pdf.addImage(dataUrl, 'PNG', pageWidth - margin - 30, y, 30, 15);
        }
      } catch (e) {
        console.warn('Logo add failed', e);
      }
    }

    // Company name (center)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    const companyName = companyProfile.company || 'Your Company Name';
    pdf.text(companyName, pageWidth / 2, y + 10, { align: 'center' });

    // Address block
    y += 20;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const parts = [companyProfile.address, companyProfile.city, companyProfile.province, companyProfile.postal_code, companyProfile.country]
      .filter(Boolean)
      .join(', ');
    if (parts) {
      const lines = pdf.splitTextToSize(parts, pageWidth - 2 * margin);
      lines.forEach((line: string) => {
        pdf.text(line, pageWidth / 2, y, { align: 'center' });
        y += 6;
      });
    }
    if (companyProfile.phone) {
      pdf.text(`Phone: ${companyProfile.phone}`, pageWidth / 2, y, { align: 'center' });
      y += 6;
    }
    if (companyProfile.email) {
      pdf.text(`Email: ${companyProfile.email}`, pageWidth / 2, y, { align: 'center' });
      y += 8;
    }

    // Divider
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Title + Pay Period
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('PAYSLIP', pageWidth / 2, y, { align: 'center' });
    y += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.text(`Pay Period: ${currentDate}`, pageWidth - margin, y, { align: 'right' });

    // top of details (for aligning the banking box)
    const detailsTopY = y + 8;

    /** Left column coordinates (employee/earnings/deductions) */
    const leftX = margin;
    let leftY = detailsTopY;

    // Employee Details
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Employee Details', leftX, leftY);
    leftY += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`Name: ${employee.name}`, leftX, leftY); leftY += 6.5;
    pdf.text(`Position: ${employee.position || 'N/A'}`, leftX, leftY); leftY += 6.5;
    pdf.text(`ID Number: ${employee.id_number || 'N/A'}`, leftX, leftY); leftY += 6.5;
    pdf.text(`Email: ${employee.email}`, leftX, leftY); leftY += 12;

    // Earnings
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Earnings', leftX, leftY);
    leftY += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`Total Hours Worked: ${employee.hours_worked_total ?? 0}h`, leftX, leftY); leftY += 6.5;
    const isHourly = employee.payment_type === 'hourly';
    pdf.text(
      `${isHourly ? 'Hourly Rate' : 'Base Salary'}: R${
        (isHourly ? parseFloat(employee.hourly_rate as any) ?? 0 : parseFloat(employee.base_salary as any) ?? 0).toFixed(2)
      }`, leftX, leftY
    ); leftY += 6.5;
    pdf.text(`Gross Salary: R${payrollData.grossSalary.toFixed(2)}`, leftX, leftY); leftY += 12;

    // Deductions
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Deductions', leftX, leftY);
    leftY += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`PAYE: R${payrollData.paye.toFixed(2)}`, leftX, leftY); leftY += 6.5;
    pdf.text(`UIF: R${payrollData.uif.toFixed(2)}`, leftX, leftY); leftY += 6.5;
    pdf.text(`SDL: R${payrollData.sdl.toFixed(2)}`, leftX, leftY); leftY += 6.5;

    pdf.setFont('helvetica', 'bold');
    pdf.text(`Total Deductions: R${payrollData.totalDeductions.toFixed(2)}`, leftX, leftY);
    leftY += 14;

    // Net Salary (center emphasis)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 100, 0);
    const net = `Net Salary: R${payrollData.netSalary.toFixed(2)}`;
    pdf.text(net, pageWidth / 2, Math.max(leftY, detailsTopY) + 4, { align: 'center' });
    pdf.setTextColor(0, 0, 0);

    /** Right column: Banking Details card */
    const rightX = pageWidth * 0.58; // start the right column a bit past middle
    const cardW = pageWidth - rightX - margin;
    let cardY = detailsTopY;

    // Card background
    pdf.setFillColor(245, 245, 245); // light gray
    // @ts-ignore - roundedRect exists in jsPDF typings
    pdf.roundedRect(rightX, cardY, cardW, 68, 3, 3, 'F');

    // Card title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Banking Details', rightX + 6, cardY + 10);

    // Divider inside card
    pdf.setDrawColor(210, 210, 210);
    pdf.line(rightX + 6, cardY + 14, rightX + cardW - 6, cardY + 14);

    // Key/values
    let kvY = cardY + 22;
    kvY = addKeyValue(pdf, 'Bank', employee.bank_name || 'N/A', rightX + 6, kvY);
    kvY = addKeyValue(pdf, 'Account Holder', employee.account_holder || 'N/A', rightX + 6, kvY);
    kvY = addKeyValue(pdf, 'Account Number', maskAccountNumber(employee.account_number), rightX + 6, kvY);
    kvY = addKeyValue(pdf, 'Branch Code', employee.branch_code || 'N/A', rightX + 6, kvY);

    // Footer timestamp
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Generated on: ${currentDate}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    pdf.save(
      `payslip-${employee.name.replace(/\s+/g, '-').toLowerCase()}-${currentDate}.pdf`
    );
  };

  if (!employee) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <Card
          className='shadow-lg border-0 bg-white/80 backdrop-blur-sm'
          headStyle={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
          title='Payslip Generator'
        >
          <div className='text-center py-8'>
            <FileTextOutlined className='text-6xl text-gray-300 mb-4' />
            <Text className='text-gray-500'>Select an employee to generate payslip</Text>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (!payrollData) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <Card
          className='shadow-lg border-0 bg-white/80 backdrop-blur-sm'
          headStyle={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
          title='Payslip Generator'
        >
          <div className='text-center py-8'>
            <FileTextOutlined className='text-6xl text-gray-300 mb-4' />
            <Text className='text-gray-500'>
              Error calculating payroll for the selected employee. Please check employee data.
            </Text>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (loadingCompany) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <Card
          className='shadow-lg border-0 bg-white/80 backdrop-blur-sm'
          headStyle={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
          title='Payslip Generator'
        >
          <div className='text-center py-8'>
            <Text className='text-gray-500'>Loading company information...</Text>
          </div>
        </Card>
      </motion.div>
    );
  }

  const employeeItems = [
    { key: 'name', label: 'Employee Name', children: employee.name },
    { key: 'position', label: 'Position', children: employee.position || 'N/A' },
    { key: 'id_number', label: 'ID Number', children: employee.id_number || 'N/A' },
    { key: 'email', label: 'Email', children: employee.email }
  ];

  const earningsItems = [
    { key: 'hours', label: 'Total Hours Worked', children: `${employee.hours_worked_total ?? 0}h` },
    {
      key: 'rate',
      label: employee.payment_type === 'hourly' ? 'Hourly Rate' : 'Base Salary',
      children: `R${
        (employee.payment_type === 'hourly'
          ? (parseFloat(employee.hourly_rate as any) ?? 0)
          : (parseFloat(employee.base_salary as any) ?? 0)
        ).toFixed(2)}`
    },
    {
      key: 'gross',
      label: 'Gross Salary',
      children: <Text strong className='text-green-600'>R{payrollData.grossSalary.toFixed(2)}</Text>
    }
  ];

  const deductionItems = [
    { key: 'paye', label: 'PAYE', children: `R${payrollData.paye.toFixed(2)}` },
    { key: 'uif', label: 'UIF', children: `R${payrollData.uif.toFixed(2)}` },
    { key: 'sdl', label: 'SDL', children: `R${payrollData.sdl.toFixed(2)}` },
    {
      key: 'total',
      label: 'Total Deductions',
      children: <Text strong className='text-red-600'>R{payrollData.totalDeductions.toFixed(2)}</Text>
    }
  ];

  const bankItems = [
    { key: 'bank', label: 'Bank', children: employee.bank_name || 'N/A' },
    { key: 'holder', label: 'Account Holder', children: employee.account_holder || 'N/A' },
    { key: 'number', label: 'Account Number', children: <Text code>{maskAccountNumber(employee.account_number)}</Text> },
    { key: 'branch', label: 'Branch Code', children: employee.branch_code || 'N/A' }
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      <Card
        className='shadow-lg border-0 bg-white/80 backdrop-blur-sm'
        headStyle={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white',
          fontSize: '18px',
          fontWeight: 'bold'
        }}
        title='Payslip Generator'
      >
        <Space direction='vertical' size='large' className='w-full'>
          <Alert
            message='South African Tax Compliant'
            description='Calculations include PAYE, UIF, and SDL as per SARS regulations'
            type='info'
            showIcon
          />

          {companyProfile && (
            <Card size='small' title='Company Information' className='bg-blue-50'>
              <Text strong>{companyProfile.company}</Text><br />
              {companyProfile.address && (
                <Text>
                  {companyProfile.address}
                  {companyProfile.city && `, ${companyProfile.city}`}
                  {companyProfile.province && `, ${companyProfile.province}`}
                  {companyProfile.postal_code && `, ${companyProfile.postal_code}`}
                  {companyProfile.country && `, ${companyProfile.country}`}
                </Text>
              )}
              {companyProfile.phone && (<><br /><Text>Phone: {companyProfile.phone}</Text></>)}
              {companyProfile.email && (<><br /><Text>Email: {companyProfile.email}</Text></>)}
            </Card>
          )}

          <Descriptions title='Employee Details' bordered size='small' column={1} items={employeeItems} />
          <Descriptions title='Earnings' bordered size='small' column={1} items={earningsItems} />
          <Descriptions title='Deductions' bordered size='small' column={1} items={deductionItems} />

          {/* prettier on-screen bank section with masked account no. */}
          <Descriptions title='Banking Details' bordered size='small' column={1} items={bankItems} />

          <Divider>Net Salary</Divider>
          <div className='text-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200'>
            <Title level={3} className='text-green-700 mb-0'>R{payrollData.netSalary.toFixed(2)}</Title>
          </div>

          <Button
            type='primary'
            size='large'
            icon={<DownloadOutlined />}
            onClick={generatePDF}
            className='w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-0'
            loading={loadingCompany}
          >
            Generate & Download Payslip
          </Button>
        </Space>
      </Card>
    </motion.div>
  );
};

export default PayslipGenerator;
