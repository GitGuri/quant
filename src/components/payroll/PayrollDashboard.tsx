// PayrollDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Row, Col, Card, Space, Button, Statistic, DatePicker, App, message as antdMessage,
} from 'antd'
import {
  TeamOutlined, UserOutlined, DollarOutlined, PlayCircleOutlined, ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import { useAuth } from '../../AuthPage'
import type { Employee } from '../../types/payroll'
import { Header } from '../layout/Header'
import { Loader2 } from 'lucide-react'

import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../components/ui/tabs'

import { EmployeeList } from '../system/EmployeeList'
import PayslipGenerator from '../payroll/PayslipGenerator'
import EmployeeRegistration from '../system/EmployeeRegistration'
import TimeTracking from './TimeTracking'
import LeaveManagement from './LeaveManagement'
import { LeaveSettings } from './LeaveSettings'
import { useCurrency } from '../../contexts/CurrencyContext'

const { RangePicker } = DatePicker

// -------------------- API base --------------------
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

const PayrollDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningPayrun, setRunningPayrun] = useState(false)

  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])

  const { isAuthenticated } = useAuth()
  const roles = JSON.parse(localStorage.getItem('userRoles') || '[]') as string[]
  const rolesLower = roles.map(r => r.toLowerCase())
  const isAdmin = rolesLower.some(r => r === 'admin' || r === 'owner')
  const canSeeEmployeeManagement = rolesLower.some(r =>
    ['payroll', 'owner', 'admin'].includes(r)
  )
  const defaultTab = canSeeEmployeeManagement ? 'employees' : 'leave'

  const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : null
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
  const { fmt } = useCurrency()
  const { message } = App.useApp()

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [token])

  // ---------- Fetch employees ----------
  const fetchEmployees = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setEmployees([])
      setLoading(false)
      setError('Please log in to view payroll data.')
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      if (!res.ok) throw new Error('Failed to fetch employees')
      const data = await res.json()
      setEmployees(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employees')
    }
  }, [getAuthHeaders, isAuthenticated, token])

  // ---------- Fetch time summaries ----------
  const fetchTimeSummaries = useCallback(async () => {
    if (!isAuthenticated || !token) return
    try {
      const qs = new URLSearchParams({
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD'),
      })
      const res = await fetch(`${API_BASE_URL}/time-entries/summary?${qs}`, {
        headers: { ...getAuthHeaders() },
      })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data)) return
      setEmployees(prev =>
        prev.map(emp => {
          const match = data.find(
            (x: any) =>
              String(x.employee_id) === String(emp.id) ||
              String(x.user_id) === String(emp.user_id)
          )
          return {
            ...emp,
            hours_worked_total: match ? match.total_hours : 0,
          }
        })
      )
    } catch {
      // silent — KPI fallback still works
    }
  }, [range, getAuthHeaders, isAuthenticated, token])

  // ---------- Initial load ----------
  useEffect(() => {
    if (!isAuthenticated || !token) return
    ;(async () => {
      setLoading(true)
      await fetchEmployees()
      await fetchTimeSummaries()
      setLoading(false)
    })()
  }, [fetchEmployees, fetchTimeSummaries, isAuthenticated, token])

  // Keep selected employee in sync if their hours changed
  useEffect(() => {
    if (!selectedEmployee) return
    const updated = employees.find(e => e.id === selectedEmployee.id)
    if (updated && updated.hours_worked_total !== selectedEmployee.hours_worked_total) {
      setSelectedEmployee(updated)
    }
  }, [employees, selectedEmployee])

  const handleEmployeeActionSuccess = async () => {
    await fetchEmployees()
    await fetchTimeSummaries()
    setSelectedEmployee(null)
    setEditingEmployee(null)
    setIsEditModalOpen(false)
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setIsEditModalOpen(true)
  }

  // ---------- KPIs ----------
  const totalEmployees = employees.length
  const totalHours = employees.reduce(
    (sum, emp) => sum + (parseFloat(emp.hours_worked_total as any) || 0),
    0
  )
  const totalPayroll = employees.reduce((sum, emp) => {
    let monthlyPay = 0
    if ((emp.payment_type || '').toLowerCase() === 'salary') {
      monthlyPay = parseFloat(emp.base_salary as any) || 0
    } else {
      const hours = parseFloat(emp.hours_worked_total as any) || 0
      const rate = parseFloat(emp.hourly_rate as any) || 0
      monthlyPay = hours * rate
    }
    return sum + monthlyPay
  }, 0)

  // ---------- Helpers ----------
  const isSameMonth = (a: dayjs.Dayjs, b: dayjs.Dayjs) =>
    a.year() === b.year() && a.month() === b.month()
  const monthToken = (d: dayjs.Dayjs) => d.format('YYYY-MM')

  const computeGrossForMonth = (list: Employee[]) => {
    let gross = 0
    for (const emp of list) {
      if ((emp.payment_type || '').toLowerCase() === 'hourly') {
        const hrs = Number(emp.hours_worked_total as any) || 0
        const rate = Number(emp.hourly_rate as any) || 0
        gross += hrs * rate
      } else {
        gross += Number(emp.base_salary as any) || 0
      }
    }
    return Number(gross.toFixed(2))
  }

  // ---------- Mapping bootstrap ----------
  // Sends sensible default account *names* the backend may use to create/find IDs.
  // Safe to call even if the route doesn't exist (we swallow 404/405).
  const ensurePayrollMappingIfEndpointExists = useCallback(async () => {
    const defaults = {
      exp_salaries_account_name: 'Salaries & Wages',
      exp_employer_uif_account_name: 'Employer UIF Expense',
      exp_employer_sdl_account_name: 'SDL Expense',
      liab_netpay_clearing_account_name: 'Net Pay Clearing',
      liab_paye_account_name: 'PAYE Payable',
      liab_uif_account_name: 'UIF Payable',
      liab_sdl_account_name: 'SDL Payable',
      bank_default_account_name: 'Bank',
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/payroll/mapping/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ createIfMissing: true, defaults }),
      })

      if (resp.ok) return true

      // If your server doesn't have this route, don't block payrun
      if (resp.status === 404 || resp.status === 405) return true

      // If server returns 400 here, surface a helpful hint once.
      if (resp.status === 400) {
        const txt = await resp.text().catch(() => '')
        antdMessage.error(
          txt?.includes('mapping not configured')
            ? 'Payroll mapping not configured. Set it up in Accounting → Payroll Mapping (or create the ensure endpoint to auto-map).'
            : `Mapping ensure failed (${resp.status}). ${txt.slice(0, 200)}`
        )
        return false
      }

      return true
    } catch {
      // Don’t block payrun on transient issues
      return true
    }
  }, [authHeaders])

  // ---------- Payrun ----------
  const runPayrun = async () => {
    if (!isAuthenticated || !token) {
      antdMessage.error('Please log in.')
      return
    }
    if (!range?.[0] || !range?.[1] || !isSameMonth(range[0], range[1])) {
      antdMessage.error('Pick a single month (start and end must be within the same month).')
      return
    }

    setRunningPayrun(true)
    try {
      const month = monthToken(range[0])

      // Try to auto-bootstrap mapping (if your server supports it)
      const mappingOk = await ensurePayrollMappingIfEndpointExists()
      if (!mappingOk) {
        setRunningPayrun(false)
        return
      }

      // refresh hours for this month before computing gross
      await fetchTimeSummaries()

      const gross = computeGrossForMonth(employees)
      if (gross <= 0) throw new Error('Gross is 0 for the selected month — nothing to post.')

      // Get statutory totals (PAYE/UIF/SDL) from EMP201
      const emp201Resp = await fetch(
        `${API_BASE_URL}/compliance/emp201?month=${encodeURIComponent(month)}`,
        { headers: { ...authHeaders, Accept: 'application/json' } }
      )
      if (!emp201Resp.ok) {
        const serverText = await emp201Resp.text().catch(() => '')
        throw new Error(`EMP201 failed (${emp201Resp.status}) ${serverText.slice(0, 300)}`)
      }
      const emp201 = await emp201Resp.json()
      const paye = Number(emp201?.totals?.paye || 0)
      const uif_employee = Number(emp201?.breakdown?.uif_employee || 0)
      const uif_employer = Number(emp201?.breakdown?.uif_employer || 0)
      const sdl_employer = Number(emp201?.totals?.sdl || 0)

      const payload = {
        month,
        totals: { gross, paye, uif_employee, uif_employer, sdl_employer },
      }

      const resp = await fetch(`${API_BASE_URL}/payroll/payrun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        // eslint-disable-next-line no-console
        console.error('Payrun error body:', text)

        // Special-case: show an actionable hint for mapping
        if (resp.status === 400 && text.includes('mapping not configured')) {
          throw new Error(
            'Payroll account mapping not configured. Open Accounting → Payroll Mapping and set:\n' +
            '• Salaries & Wages (Expense)\n' +
            '• Employer UIF Expense (Expense)\n' +
            '• SDL Expense (Expense)\n' +
            '• Net Pay Clearing (Liability)\n' +
            '• PAYE Payable (Liability)\n' +
            '• UIF Payable (Liability)\n' +
            '• SDL Payable (Liability)\n' +
            '• Bank (Asset)\n' +
            'Then try the payrun again.'
          )
        }

        throw new Error(`Payrun failed (${resp.status}). ${text.slice(0, 400)}`)
      }

      const result = await resp.json().catch(() => ({}))

      message.success({
        content: (
          <div>
            <div><b>Payrun posted</b> for {month}</div>
            <div className="text-xs">
              Gross: {fmt(gross)} · PAYE: {fmt(paye)} · UIF(e): {fmt(uif_employee)} · UIF(r): {fmt(uif_employer)} · SDL: {fmt(sdl_employer)}
              {result?.entry_id ? <div>Journal ID: {result.entry_id}</div> : null}
            </div>
          </div>
        ),
        duration: 6,
      })

      await fetchEmployees()
      await fetchTimeSummaries()
    } catch (err: any) {
      antdMessage.error(err?.message || 'Failed to run payrun')
    } finally {
      setRunningPayrun(false)
    }
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-2 text-lg">Loading payroll data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-600">
        <p className="text-lg font-semibold">Error: {error}</p>
        <Button onClick={fetchEmployees} className="mt-4" icon={<ReloadOutlined />}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      <motion.div className="p-6 h-full overflow-y-auto">
        <Header title="Payroll Management" />

        {/* Payrun Bar */}
        <Card className="m-8 shadow-sm" bodyStyle={{ paddingBottom: 16, paddingTop: 16 }}>
          <Row gutter={[16, 16]} align="middle" justify="space-between">
            <Col xs={24} md={12}>
              <Space wrap>
                <RangePicker
                  value={range}
                  onChange={(v) => v && setRange(v as [dayjs.Dayjs, dayjs.Dayjs])}
                  format="YYYY-MM-DD"
                />
                <Button onClick={fetchTimeSummaries} icon={<ReloadOutlined />}>
                  Refresh Period Totals
                </Button>
              </Space>
            </Col>
            <Col xs={24} md="auto">
              <Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={runningPayrun}
                  onClick={runPayrun}
                >
                  Run Payrun (Post Journals)
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* KPI Cards */}
        <Row gutter={[24, 24]} className="m-8">
          <Col xs={24} sm={12} lg={8}>
            <Card className="text-center shadow-lg border-0 bg-blue-50">
              <Space direction="vertical">
                <TeamOutlined className="text-3xl text-blue-600" />
                <Statistic title="Total Employees" value={totalEmployees} />
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card className="text-center shadow-lg border-0 bg-green-50">
              <Space direction="vertical">
                <UserOutlined className="text-3xl text-green-600" />
                <Statistic title="Total Hours" value={totalHours.toFixed(2)} />
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card className="text-center shadow-lg border-0 bg-purple-50">
              <Space direction="vertical">
                <DollarOutlined className="text-3xl text-purple-600" />
                <Statistic
                  title="Total Payroll"
                  value={totalPayroll}
                  formatter={(v) => fmt(Number(v))}
                />
              </Space>
            </Card>
          </Col>
        </Row>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList
            className={`grid w-full ${canSeeEmployeeManagement ? 'grid-cols-4' : 'grid-cols-3'} mb-6`}
          >
            {canSeeEmployeeManagement && (
              <TabsTrigger value="employees">Employee Management</TabsTrigger>
            )}
            <TabsTrigger value="time-tracking">Time Tracking</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            {isAdmin && <TabsTrigger value="leave-settings">Settings</TabsTrigger>}
          </TabsList>

          {canSeeEmployeeManagement && (
            <TabsContent value="employees">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Employees</h2>
                <Button
                  type="primary"
                  onClick={() => {
                    setEditingEmployee(null)
                    setIsEditModalOpen(true)
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

          <TabsContent value="time-tracking">
            <TimeTracking
              employees={employees}
              onUpdateEmployeeHours={handleEmployeeActionSuccess}
              onTimeEntryActionSuccess={handleEmployeeActionSuccess}
            />
          </TabsContent>

          <TabsContent value="leave" className="space-y-6">
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
  )
}

export default PayrollDashboard
