// PayslipGenerator.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Button,
  Descriptions,
  Space,
  Typography,
  Divider,
  Alert,
  message,
  Switch,
  Row,
  Col,
  Tag
} from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import { type Employee } from '../../types/payroll';
import { useAuth } from '../../AuthPage';

import { useCurrency } from '../../contexts/CurrencyContext';


const { Title, Text } = Typography;

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

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

type DeductionPrefs = {
  includePAYE: boolean;
  includeUIF: boolean;
  includeSDL: boolean;
};

const DED_PREFS_KEY = 'payslip:deduction_prefs:v1';

const defaultDeductionPrefs: DeductionPrefs = {
  includePAYE: true,
  includeUIF: true,
  includeSDL: true,
};



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

  // Base calculations (South Africa typical placeholders)
  const paye = grossSalary * 0.18;
  const uif = Math.min(grossSalary * 0.01, 177.12);
  const sdl = grossSalary * 0.01;

  // Historical code had SDL excluded from total; keep "base" but we will override with prefs below
  const totalDeductions = paye + uif;
  const netSalary = grossSalary - totalDeductions;

  return { grossSalary, paye, uif, sdl, totalDeductions, netSalary };
};

interface PayslipGeneratorProps {
  employee: Employee | null;
}

/** ---------- helpers ---------- */
const maskAccountNumber = (acct?: string | null, showLast = 4) => {
  if (!acct) return 'N/A';
  const digits = acct.replace(/\s+/g, '');
  const masked = digits
    .split('')
    .map((ch, i) => (i < Math.max(0, digits.length - showLast) ? '•' : ch))
    .join('');
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

/** Compute effective totals based on toggle prefs */
const applyPrefs = (base: PayrollCalculation, prefs: DeductionPrefs) => {
  const { grossSalary, paye, uif, sdl } = base;
  let total = 0;
  if (prefs.includePAYE) total += paye;
  if (prefs.includeUIF) total += uif;
  if (prefs.includeSDL) total += sdl;
  const net = grossSalary - total;
  return {
    effectiveTotalDeductions: total,
    effectiveNetSalary: net,
  };
};

/** --------------------------- component --------------------------- */
const PayslipGenerator: React.FC<PayslipGeneratorProps> = ({ employee }) => {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<boolean>(false);
  const { symbol, fmt } = useCurrency();
  const [prefs, setPrefs] = useState<DeductionPrefs>(() => {
    try {
      const saved = localStorage.getItem(DED_PREFS_KEY);
      return saved ? { ...defaultDeductionPrefs, ...JSON.parse(saved) } : defaultDeductionPrefs;
    } catch {
      return defaultDeductionPrefs;
    }
  });

  // persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(DED_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  const payrollData: PayrollCalculation | null = useMemo(
    () => (employee ? calculatePayroll(employee) : null),
    [employee]
  );

  const effective = useMemo(() => {
    if (!payrollData) return null;
    return applyPrefs(payrollData, prefs);
  }, [payrollData, prefs]);

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

  /** ---------------- PDF generator (respects toggles) ---------------- */
  const generatePDF = async () => {
    if (!employee || !payrollData || !companyProfile || !effective) {
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
    const F = (n: number) => fmt(Number(n || 0));


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

    // top of details
    const detailsTopY = y + 8;

    /** Left column coordinates */
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
  `${isHourly ? 'Hourly Rate' : 'Base Salary'}: ${F(isHourly ? Number(employee.hourly_rate || 0) : Number(employee.base_salary || 0))}`,
  leftX,
  leftY
); leftY += 6.5;
pdf.text(`Gross Salary: ${F(payrollData.grossSalary)}`, leftX, leftY); leftY += 12;


    // Deductions (respect toggles)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Deductions', leftX, leftY);
    leftY += 9;

    pdf.setFont('helvetica', 'normal');
pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
if (prefs.includePAYE) pdf.text(`PAYE: ${F(payrollData.paye)}`, leftX, leftY); else pdf.text(`PAYE: Excluded`, leftX, leftY); leftY += 6.5;
if (prefs.includeUIF) pdf.text(`UIF: ${F(payrollData.uif)}`, leftX, leftY); else pdf.text(`UIF: Excluded`, leftX, leftY); leftY += 6.5;
if (prefs.includeSDL) pdf.text(`SDL: ${F(payrollData.sdl)}`, leftX, leftY); else pdf.text(`SDL: Excluded`, leftX, leftY); leftY += 6.5;

pdf.setFont('helvetica', 'bold');
pdf.text(`Total Deductions: ${F(effective.effectiveTotalDeductions)}`, leftX, leftY);
leftY += 14;


    // Net Salary
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 100, 0);
    const net = `Net Salary: ${F(effective.effectiveNetSalary)}`;
    pdf.text(net, pageWidth / 2, Math.max(leftY, detailsTopY) + 4, { align: 'center' });
    pdf.setTextColor(0, 0, 0);

    /** Right column: Banking Details card */
    const rightX = pageWidth * 0.58;
    const cardW = pageWidth - rightX - margin;
    let cardY = detailsTopY;

    pdf.setFillColor(245, 245, 245);
    // @ts-ignore
    pdf.roundedRect(rightX, cardY, cardW, 68, 3, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Banking Details', rightX + 6, cardY + 10);

    pdf.setDrawColor(210, 210, 210);
    pdf.line(rightX + 6, cardY + 14, rightX + cardW - 6, cardY + 14);

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

  if (!payrollData || !effective) {
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
    children: fmt(
      employee.payment_type === 'hourly'
        ? Number(employee.hourly_rate || 0)
        : Number(employee.base_salary || 0)
    ),
  },
  {
    key: 'gross',
    label: 'Gross Salary',
    children: <Text strong className="text-green-600">{fmt(payrollData.grossSalary)}</Text>,
  },
];


const deductionItems = [
  {
    key: 'paye',
    label: 'PAYE',
    children: prefs.includePAYE ? fmt(payrollData.paye) : <Tag color="default">Excluded</Tag>,
  },
  {
    key: 'uif',
    label: 'UIF',
    children: prefs.includeUIF ? fmt(payrollData.uif) : <Tag color="default">Excluded</Tag>,
  },
  {
    key: 'sdl',
    label: 'SDL',
    children: prefs.includeSDL ? fmt(payrollData.sdl) : <Tag color="default">Excluded</Tag>,
  },
  {
    key: 'total',
    label: 'Total Deductions',
    children: (
      <Text strong className="text-red-600">
        {fmt(effective.effectiveTotalDeductions)}
      </Text>
    ),
  },
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
            message='Configurable deductions'
            description='Toggle PAYE, UIF and SDL on/off below. Your selection is remembered in this browser.'
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

          {/* Deduction Toggles */}
{/* Deduction Toggles — cleaner, non-squashed layout */}
<Card size="small" title="Deductions (toggle to include/exclude)">
  <Row gutter={[12, 12]}>
    <Col xs={24} sm={12} md={8}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch
          checked={prefs.includePAYE}
          onChange={(v) => setPrefs((p) => ({ ...p, includePAYE: v }))}
        />
        <div style={{ lineHeight: 1.1 }}>
          
          <div style={{ fontSize: 12, color: '#666' }}>PAYE</div>
        </div>
      </div>
    </Col>

    <Col xs={24} sm={12} md={8}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch
          checked={prefs.includeUIF}
          onChange={(v) => setPrefs((p) => ({ ...p, includeUIF: v }))}
        />
        <div style={{ lineHeight: 1.1 }}>
          
          <div style={{ fontSize: 12, color: '#666' }}>UIF</div>
        </div>
      </div>
    </Col>

    <Col xs={24} sm={12} md={8}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch
          checked={prefs.includeSDL}
          onChange={(v) => setPrefs((p) => ({ ...p, includeSDL: v }))}
        />
        <div style={{ lineHeight: 1.1 }}>
          
          <div style={{ fontSize: 12, color: '#666' }}>SDL</div>
        </div>
      </div>
    </Col>
  </Row>

  <div style={{ marginTop: 12 }}>
    <Button size="small" onClick={() => setPrefs(defaultDeductionPrefs)}>
      Reset to defaults
    </Button>
  </div>
</Card>


          <Descriptions title='Employee Details' bordered size='small' column={1} items={employeeItems} />
          <Descriptions title='Earnings' bordered size='small' column={1} items={earningsItems} />
          <Descriptions title='Deductions' bordered size='small' column={1} items={deductionItems} />

          {/* Bank details */}
          <Descriptions title='Banking Details' bordered size='small' column={1} items={bankItems} />

          <Divider>Net Salary</Divider>
          <div className='text-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200'>
<Title level={3} className="text-green-700 mb-0">
  {fmt(effective.effectiveNetSalary)}
</Title>

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

          {/* Compliance nudge */}
          <Alert
            type='warning'
            showIcon
            message='Note'
            description='If you exclude statutory deductions (e.g., PAYE/UIF/SDL), ensure this aligns with your payroll policy and local regulations.'
          />
        </Space>
      </Card>
    </motion.div>
  );
};

export default PayslipGenerator;