import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, TrendingUp, CreditCard, Calendar, Target, Eye, Download, Bell, Edit, Trash2, Search } from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { motion } from 'framer-motion';
import { useAuth } from '@/AuthPage';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

import CustomerFormFullPage from '@/pages/CustomerForm'; // your A4 form

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

// ==================== Types ====================
interface Application {
  id: string;
  name?: string;
  surname?: string;
  id_number?: string;
  total_amount?: number;
  commencement_date?: string | null;
  declaration_date?: string | null;
  created_at?: string | null;
  deduction_date?: string | null;
  status?: 'Active' | 'Pending' | 'Completed' | 'Failed';
}

interface Client {
  id: string;
  clientId: string;
  name: string;
  date: string;
  status: 'Active' | 'Pending' | 'Completed' | 'Failed';
  amount: number;
}

interface AgentStats {
  total_registrations: number;
  successful_payments: number;
  pending_payments: number;
  failed_payments: number;
  monthly_target: number;
  monthlyRegistrations: { month: string; count: number }[];
  weeklyPerformance: { week: string; count: number }[];
}

// Sales view row (from /api/my-clients with month filter)
interface SalesClientRow {
  customerName: string;
  totalPaidAllTime: number;
  paidThisMonth: number;
  expectedCommissionMonth: number;
  lastPaymentDate: string | null; // ISO
}

interface ClientHistory {
  customerName: string;
  active: boolean;
  aggregate: {
    totalPaidAllTime: number;
    paidThisMonth: number;
    expectedCommissionMonth: number;
    lastPaymentDate: string | null;
  };
  payments: Array<{
    id: number;
    date: string | null;
    totalAmount: number;
    paymentType: string;
    amountPaid: number | null;
    changeGiven: number | null;
    creditAmount: number | null;
    remainingCreditAmount: number | null;
  }>;
}

type FormMode = 'view' | 'edit' | 'create';

// ==================== Config ====================
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

// ==================== Helpers ====================
const formatCurrency = (n?: number | null) =>
  typeof n === 'number'
    ? `R${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const formatDateZA = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-ZA') : '—';

// ==================== Component ====================
const AgentDashboard: React.FC = () => {
  const { userName, isAuthenticated } = useAuth();

  // tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'notifications'>('overview');

  // dashboard & table data
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [salesClients, setSalesClients] = useState<SalesClientRow[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // dialog/form state (applications)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [currentApp, setCurrentApp] = useState<any | null>(null);

  // delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // month filter for sales/commission
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  });

  // search
  const [searchApps, setSearchApps] = useState('');
  const [searchSales, setSearchSales] = useState('');

  // client detail dialog state
  const [clientDetailOpen, setClientDetailOpen] = useState(false);
  const [clientDetailLoading, setClientDetailLoading] = useState(false);
  const [clientDetail, setClientDetail] = useState<ClientHistory | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const toClient = (app: Application): Client => ({
    id: app.id,
    clientId: app.id_number || 'N/A',
    name: `${app.name || ''} ${app.surname || ''}`.trim() || 'Unknown',
    date: app.deduction_date
      ? app.deduction_date
      : (app.created_at ? new Date(app.created_at).toLocaleDateString('en-ZA') : '—'),
    status: app.status || 'Active',
    amount: app.total_amount ?? 0,
  });

  const deriveStats = (apps: Application[]): AgentStats => {
    const totalRegistrations = apps.length;
    const successfulPayments = apps.filter(app => app.status === 'Completed').length;
    const pendingPayments = apps.filter(app => app.status === 'Pending').length;
    const failedPayments = apps.filter(app => app.status === 'Failed').length;

    const monthlyCounts: Record<string, number> = {};
    apps.forEach(app => {
      const date = app.created_at ? new Date(app.created_at) : null;
      if (date) {
        const month = date.toLocaleString('en-ZA', { month: 'short' });
        monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
      }
    });

    const monthlyRegistrations = Object.keys(monthlyCounts)
      .map(month => ({ month, count: monthlyCounts[month] }))
      .sort((a, b) => {
        const order = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return order.indexOf(a.month) - order.indexOf(b.month);
      });

    const weeklyCounts: Record<string, number> = {};
    const today = new Date();
    const startOfLastFourWeeks = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 28);
    const weekNumber = (date: Date) => Math.ceil(date.getDate() / 7);

    apps.forEach(app => {
      const date = app.created_at ? new Date(app.created_at) : null;
      if (date && date >= startOfLastFourWeeks) {
        const week = `Week ${weekNumber(date)}`;
        weeklyCounts[week] = (weeklyCounts[week] || 0) + 1;
      }
    });

    const weeklyPerformance = Object.keys(weeklyCounts)
      .map(week => ({ week, count: weeklyCounts[week] }))
      .sort((a, b) => {
        const weekA = parseInt(a.week.replace('Week ', ''), 10);
        const weekB = parseInt(b.week.replace('Week ', ''), 10);
        return weekA - weekB;
      });

    const monthlyTarget = 50;

    return {
      total_registrations: totalRegistrations,
      successful_payments: successfulPayments,
      pending_payments: pendingPayments,
      failed_payments: failedPayments,
      monthly_target: monthlyTarget,
      monthlyRegistrations,
      weeklyPerformance,
    };
  };

  // =============== Fetch both endpoints (month-aware for sales) ===============
  useEffect(() => {
    const run = async () => {
      setIsDashboardLoading(true);
      setIsClientsLoading(true);
      setError(null);

      try {
        if (!isAuthenticated || !token) {
          setClients([]);
          setApplications([]);
          setSalesClients([]);
          setAgentStats({
            total_registrations: 0,
            successful_payments: 0,
            pending_payments: 0,
            failed_payments: 0,
            monthly_target: 50,
            monthlyRegistrations: [],
            weeklyPerformance: [],
          });
          return;
        }

        const [appsRes, myClientsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/applications`, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/my-clients?month=${encodeURIComponent(selectedMonth)}`, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!appsRes.ok) {
          const t = await appsRes.text();
          throw new Error(`Failed to fetch applications: ${appsRes.status} ${t}`);
        }

        const apps: Application[] = await appsRes.json();
        setApplications(apps);
        setClients(apps.map(toClient));
        setAgentStats(deriveStats(apps));

        if (myClientsRes.ok) {
          const salesRows: SalesClientRow[] = await myClientsRes.json();
          setSalesClients(salesRows);
        } else {
          console.warn('GET /api/my-clients failed; continuing without sales list');
          setSalesClients([]);
        }
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Failed to load dashboard data.');
      } finally {
        setIsClientsLoading(false);
        setIsDashboardLoading(false);
      }
    };

    run();
  }, [isAuthenticated, token, selectedMonth]);

  // Refetch client details when month changes (if dialog open)
  useEffect(() => {
    const refetchDetail = async () => {
      if (!clientDetailOpen || !selectedCustomerName || !token) return;
      setClientDetailLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/my-client-history?customerName=${encodeURIComponent(selectedCustomerName)}&month=${encodeURIComponent(selectedMonth)}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data: ClientHistory = await res.json();
        setClientDetail(data);
      } catch (e) {
        console.error(e);
      } finally {
        setClientDetailLoading(false);
      }
    };
    refetchDetail();
  }, [clientDetailOpen, selectedCustomerName, selectedMonth, token]);

  // =============== Filters ===============
  const filteredApplications = useMemo(() => {
    if (!searchApps.trim()) return clients;
    const q = searchApps.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.clientId.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  }, [clients, searchApps]);

  const filteredSales = useMemo(() => {
    if (!searchSales.trim()) return salesClients;
    const q = searchSales.toLowerCase();
    return salesClients.filter(s => s.customerName?.toLowerCase().includes(q));
  }, [salesClients, searchSales]);

  // =============== Charts (registrations) ===============
  const barChartData = useMemo(() => ({
    labels: agentStats?.monthlyRegistrations.map(m => m.month) || [],
    datasets: [
      {
        label: 'Registrations',
        data: agentStats?.monthlyRegistrations.map(m => m.count) || [],
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  }), [agentStats]);

  const barChartOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Monthly Registrations' } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  const lineChartData = useMemo(() => ({
    labels: agentStats?.weeklyPerformance.map(w => w.week) || [],
    datasets: [
      {
        label: 'Registrations',
        data: agentStats?.weeklyPerformance.map(w => w.count) || [],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
      },
    ],
  }), [agentStats]);

  const lineChartOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Weekly Registrations Trend' } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  const doughnutChartData = useMemo(() => ({
    labels: ['Successful', 'Pending', 'Failed'],
    datasets: [
      {
        data: [
          agentStats?.successful_payments ?? 0,
          agentStats?.pending_payments ?? 0,
          agentStats?.failed_payments ?? 0,
        ],
        backgroundColor: ['#4CAF50', '#FFC107', '#F44336'],
        borderColor: ['#388E3C', '#FFA000', '#D32F2F'],
        borderWidth: 1,
      },
    ],
  }), [agentStats]);

  const doughnutChartOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Payment Status Breakdown' } },
    cutout: '50%' as const,
  };

  const progressPercentage =
    agentStats && agentStats.monthly_target > 0
      ? Math.round((agentStats.total_registrations / agentStats.monthly_target) * 100)
      : 0;

  // =============== Month summary from salesClients (NEW) ===============
  const totalPaidThisMonth = useMemo(
    () => salesClients.reduce((sum, r) => sum + (r.paidThisMonth || 0), 0),
    [salesClients]
  );

  const monthlyCommission = useMemo(
    () => salesClients.reduce((sum, r) => sum + (r.expectedCommissionMonth || 0), 0),
    [salesClients]
  );

  const clientsPaidCount = useMemo(
    () => salesClients.filter(r => (r.paidThisMonth || 0) > 0).length,
    [salesClients]
  );

  const clientsNoPaymentCount = useMemo(
    () => Math.max(salesClients.length - clientsPaidCount, 0),
    [salesClients, clientsPaidCount]
  );

  const paidSplitData = useMemo(() => ({
    labels: ['Paid', 'No Payment'],
    datasets: [{
      data: [clientsPaidCount, clientsNoPaymentCount],
      backgroundColor: ['#4CAF50', '#F44336'],
      borderColor: ['#2E7D32', '#C62828'],
      borderWidth: 1,
    }],
  }), [clientsPaidCount, clientsNoPaymentCount]);

  const paidSplitOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: `Client Payment Split (${selectedMonth})` } },
    cutout: '55%' as const,
  };

  const top5 = useMemo(() => {
    return [...salesClients]
      .sort((a, b) => (b.paidThisMonth || 0) - (a.paidThisMonth || 0))
      .slice(0, 5);
  }, [salesClients]);

  const topCustomersData = useMemo(() => ({
    labels: top5.map(x => x.customerName || '—'),
    datasets: [{
      label: `Paid in ${selectedMonth}`,
      data: top5.map(x => x.paidThisMonth || 0),
      backgroundColor: 'rgba(54, 162, 235, 0.6)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1,
    }]
  }), [top5, selectedMonth]);

  const topCustomersOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Top 5 Customers (by paid this month)' } },
    scales: { y: { beginAtZero: true } }
  };

  // =============== View/Edit dialog handlers ===============
  const openView = (id: string) => {
    const app = applications.find(a => a.id === id);
    if (!app) return;
    setCurrentApp({
      ...app,
      firstName: app.name || '',
      lastName: app.surname || '',
    });
    setFormMode('view');
    setIsFormOpen(true);
  };

  const openEdit = (id: string) => {
    const app = applications.find(a => a.id === id);
    if (!app) return;
    setCurrentApp({
      ...app,
      firstName: app.name || '',
      lastName: app.surname || '',
    });
    setFormMode('edit');
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setCurrentApp(null);
  };

  // =============== Save (create/update) ===============
  const saveApp = async (payloadFromForm: any) => {
    if (!token) return;

    const payload = {
      ...payloadFromForm,
      name: payloadFromForm.firstName || '',
      surname: payloadFromForm.lastName || '',
    };

    const isEdit = Boolean(currentApp?.id);
    const url = isEdit
      ? `${API_BASE_URL}/api/applications/${currentApp.id}`
      : `${API_BASE_URL}/api/applications`;

    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Save failed: ${res.status} ${t}`);
    }

    const appsRes = await fetch(`${API_BASE_URL}/api/applications`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const apps: Application[] = await appsRes.json();
    setApplications(apps);
    setClients(apps.map(toClient));
    setAgentStats(deriveStats(apps));
    closeForm();
  };

  // =============== Delete flow ===============
  const confirmDelete = (id: string) => setPendingDeleteId(id);
  const cancelDelete = () => setPendingDeleteId(null);

  const doDelete = async () => {
    if (!pendingDeleteId || !token) return;
    const res = await fetch(`${API_BASE_URL}/api/applications/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      alert(`Delete failed: ${res.status} ${t}`);
      return;
    }
    const appsRes = await fetch(`${API_BASE_URL}/api/applications`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const apps: Application[] = await appsRes.json();
    setApplications(apps);
    setClients(apps.map(toClient));
    setAgentStats(deriveStats(apps));
    setPendingDeleteId(null);
  };

  // =============== Notifications (mock) ===============
  const [notifications, setNotifications] = useState([
    { id: 1, message: 'New client registration pending approval', time: '2 hours ago', read: false },
    { id: 2, message: 'Payment received for client ZP12340', time: '5 hours ago', read: true },
    { id: 3, message: 'Monthly target updated to 50 registrations', time: '1 day ago', read: true },
  ]);
  const markAsRead = (id: number) => setNotifications(n => n.map(x => (x.id === id ? { ...x, read: true } : x)));
  const markAllAsRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })));

  // =============== Client Detail ===============
  const openClientDetail = async (customerName: string) => {
    if (!token) return;
    setSelectedCustomerName(customerName);
    setClientDetailOpen(true);
    setClientDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/my-client-history?customerName=${encodeURIComponent(customerName)}&month=${encodeURIComponent(selectedMonth)}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ClientHistory = await res.json();
      setClientDetail(data);
    } catch (e:any) {
      console.error(e);
      setClientDetail(null);
    } finally {
      setClientDetailLoading(false);
    }
  };

  if (isDashboardLoading) {
    return <div className="flex-1 flex items-center justify-center p-8">
      <p className="text-xl text-muted-foreground">Loading dashboard data...</p>
    </div>;
  }
  if (error) {
    return <div className="flex-1 flex flex-col items-center justify-center p-8">
      <p className="text-xl text-destructive mb-2">Error: {error}</p>
      <p className="text-muted-foreground">Please try again later.</p>
    </div>;
  }

  const isOverviewDataReady = agentStats !== null;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Agent Dashboard" />

      <div className="space-y-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Welcome back, {userName || 'Agent'}!</h2>
            <p className="text-muted-foreground">Sales & registrations snapshot.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />Export Report</Button>
          </div>
        </motion.div>



{/* Tabs */}
<div className="flex flex-wrap items-center gap-2 border-b px-1 py-2">
  <Button
    variant={activeTab === 'overview' ? 'default' : 'ghost'}
    onClick={() => setActiveTab('overview')}
    className="gap-2"
  >
    <TrendingUp className="h-4 w-4" />
    Overview
  </Button>

  <Button
    variant={activeTab === 'clients' ? 'default' : 'ghost'}
    onClick={() => setActiveTab('clients')}
    className="gap-2"
  >
    <Users className="h-4 w-4" />
    My Clients
  </Button>

  <Button
    variant={activeTab === 'notifications' ? 'default' : 'ghost'}
    onClick={() => setActiveTab('notifications')}
    className="gap-2 relative"
  >
    <Bell className="h-4 w-4" />
    Notifications
    {notifications.filter(n => !n.read).length > 0 && (
      <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 justify-center">
        {notifications.filter(n => !n.read).length}
      </Badge>
    )}
  </Button>
</div>



        {/* Overview */}
        {activeTab === 'overview' && isOverviewDataReady && agentStats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Month picker (shared with tables/modals) */}
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Month</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border rounded-md p-2 text-sm"
                />
              </div>
            </div>

            {/* Sales month KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Commission (10%)</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyCommission)}</div>
                  <p className="text-xs text-muted-foreground">For {selectedMonth}</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Collected</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalPaidThisMonth)}</div>
                  <p className="text-xs text-muted-foreground">Paid in {selectedMonth}</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Clients Paid</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{clientsPaidCount}</div>
                  <p className="text-xs text-muted-foreground">At least one payment</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">No Payment</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{clientsNoPaymentCount}</div>
                  <p className="text-xs text-muted-foreground">No payment in {selectedMonth}</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts row: Paid split + Top customers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Split</CardTitle>
                  <CardDescription>Clients who paid vs didn’t this month</CardDescription>
                </CardHeader>
                <CardContent>
                  {salesClients.length > 0 ? (
                    <Doughnut data={paidSplitData} options={paidSplitOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-[220px] text-muted-foreground">
                      No sales data for {selectedMonth}.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top Customers</CardTitle>
                  <CardDescription>Highest contributors in {selectedMonth}</CardDescription>
                </CardHeader>
                <CardContent>
                  {top5.length > 0 ? (
                    <Bar data={topCustomersData} options={topCustomersOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-[220px] text-muted-foreground">
                      No paid customers in {selectedMonth}.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Registration analytics (keep) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <Card className="lg:col-span-3">
    <CardHeader>
      <CardTitle>Registration Trend</CardTitle>
      <CardDescription>Your registration activity.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[500px]"> {/* make it tall */}
        {agentStats.monthlyRegistrations.length > 0 ? (
          <Bar data={barChartData} options={barChartOptions} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No monthly registration data available.
          </div>
        )}
      </div>
    </CardContent>
  </Card>
</div>


            <Card>
              <CardHeader>
                <CardTitle>Weekly Performance</CardTitle>
                <CardDescription>Your registration trend</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-full">
                  {agentStats.weeklyPerformance.length > 0 ? (
                    <Line data={lineChartData} options={lineChartOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No weekly performance data available.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Clients */}
        {activeTab === 'clients' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Applications-based clients */}
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <CardTitle>All Clients (Applications)</CardTitle>
                  <CardDescription>Applications loaded from the server.</CardDescription>
                </div>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchApps}
                    onChange={(e) => setSearchApps(e.target.value)}
                    placeholder="Search by name / ID number / status"
                    className="pl-8 pr-3 py-2 border rounded-md text-sm w-[260px]"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {isClientsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading clients…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApplications.length > 0 ? (
                          filteredApplications.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">{c.clientId}</TableCell>
                              <TableCell className="max-w-[260px] truncate" title={c.name}>{c.name}</TableCell>
                              <TableCell>{c.date}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  c.status.toLowerCase() === 'active' ? 'default'
                                    : c.status.toLowerCase() === 'pending' ? 'secondary'
                                    : c.status.toLowerCase() === 'completed' ? 'outline'
                                    : 'destructive'
                                }>
                                  {c.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {c.amount > 0 ? formatCurrency(c.amount) : '—'}
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button variant="ghost" size="sm" className="gap-1" onClick={() => openView(c.id)}>
                                  <Eye className="h-4 w-4" />View
                                </Button>
                                <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(c.id)}>
                                  <Edit className="h-4 w-4" />Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => confirmDelete(c.id)}>
                                  <Trash2 className="h-4 w-4" />Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No clients found.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sales-based clients (month filter) */}
            <Card>
              <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Sales Clients</CardTitle>
                    <Badge>Active</Badge>
                  </div>
                  <CardDescription>Totals and monthly commission (scoped to your branch/code).</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchSales}
                      onChange={(e) => setSearchSales(e.target.value)}
                      placeholder="Search customer name"
                      className="pl-8 pr-3 py-2 border rounded-md text-sm w-[240px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Month</span>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="border rounded-md p-2 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isClientsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading sales clients…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Last Payment</TableHead>
                          <TableHead className="text-right">Total (All-time)</TableHead>
                          <TableHead className="text-right">Paid This Month</TableHead>
                          <TableHead className="text-right">Expected Commission (10%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales.length > 0 ? (
                          filteredSales.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">
                                <button
                                  className="underline underline-offset-2 hover:opacity-80"
                                  onClick={() => openClientDetail(row.customerName)}
                                  title="View client details & history"
                                >
                                  {row.customerName || '—'}
                                </button>
                              </TableCell>
                              <TableCell>{row.lastPaymentDate ? new Date(row.lastPaymentDate).toLocaleDateString('en-ZA') : '—'}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.totalPaidAllTime ?? 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.paidThisMonth ?? 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.expectedCommissionMonth ?? 0)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                              No sales clients found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Notifications</CardTitle><CardDescription>Stay updated with important alerts</CardDescription></div>
                <Button variant="outline" onClick={markAllAsRead}>Mark all as read</Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notifications.map((n) => (
                    <div key={n.id} className={`p-4 rounded-lg border ${n.read ? 'bg-muted/30' : 'bg-background border-primary/20'}`}>
                      <div className="flex justify-between">
                        <p className={n.read ? '' : 'font-medium'}>{n.message}</p>
                        <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)} disabled={n.read}>
                          {n.read ? 'Read' : 'Mark as read'}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{n.time}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Application Form dialog (View/Edit/New) */}
      <Dialog open={isFormOpen} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="w-screen h-screen max-w-none sm:max-w-none p-0 overflow-hidden rounded-none">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>
              {formMode === 'view' ? 'View Application' : formMode === 'edit' ? 'Edit Application' : 'New Application'}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'view' ? 'Read-only preview of the application.' : 'Update details and save.'}
            </DialogDescription>
          </DialogHeader>

          <div className="h-[calc(100vh-88px)] overflow-auto px-4 pb-4">
            {currentApp && (
              <CustomerFormFullPage
                application={currentApp}
                embed
                // @ts-expect-error if CustomerForm supports mode
                mode={formMode}
                onSave={async (a: any) => { try { await saveApp(a); } catch (e: any) { alert(e.message); } }}
                onCancel={closeForm}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Details dialog */}
      <Dialog
        open={clientDetailOpen}
        onOpenChange={(o) => {
          if (!o) {
            setClientDetailOpen(false);
            setClientDetail(null);
            setSelectedCustomerName(null);
          }
        }}
      >
        <DialogContent className="w-[90vw] max-w-5xl max-h-[90vh] overflow-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
            <DialogDescription>Profile & payment history</DialogDescription>
          </DialogHeader>

          {clientDetailLoading && (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          )}

          {!clientDetailLoading && clientDetail && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold tracking-wide">{clientDetail.customerName}</h3>
                  <p className="text-sm text-muted-foreground">
                    Last payment: {clientDetail.aggregate.lastPaymentDate
                      ? new Date(clientDetail.aggregate.lastPaymentDate).toLocaleDateString('en-ZA')
                      : '—'}
                  </p>
                </div>
                <Badge variant={clientDetail.active ? 'default' : 'secondary'}>
                  {clientDetail.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Aggregates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total (All-time)</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(clientDetail.aggregate.totalPaidAllTime)}
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Paid in {selectedMonth}</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(clientDetail.aggregate.paidThisMonth)}
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Commission (10%)</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(clientDetail.aggregate.expectedCommissionMonth)}
                  </CardContent>
                </Card>
              </div>

              {/* Payment history */}
              <Card className="shadow-sm">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle>Payment History</CardTitle>
                    <CardDescription>Latest transactions for this client</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Month</span>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)} // triggers refetch for table & dialog
                      className="border rounded-md p-2 text-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Amount Paid</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead className="text-right">Remaining Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientDetail.payments.length > 0 ? clientDetail.payments.map(p => (
                          <TableRow key={p.id}>
                            <TableCell>{p.date ? new Date(p.date).toLocaleDateString('en-ZA') : '—'}</TableCell>
                            <TableCell>{p.paymentType || '—'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.totalAmount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.amountPaid ?? 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.creditAmount ?? 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.remainingCreditAmount ?? 0)}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                              No payments found for this client.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Open Application (best-effort by name) */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!clientDetail) return;
                    const target = applications.find(a =>
                      (`${(a.name||'').trim()} ${(a.surname||'').trim()}`.trim()).toLowerCase()
                      === clientDetail.customerName.trim().toLowerCase()
                    );
                    if (target) {
                      setCurrentApp({
                        ...target,
                        firstName: target.name || '',
                        lastName: target.surname || '',
                      });
                      setFormMode('view');
                      setIsFormOpen(true);
                    } else {
                      alert('No matching application found for this client name.');
                    }
                  }}
                >
                  Open Application
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(pendingDeleteId)} onOpenChange={(o) => !o && cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected application record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={doDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AgentDashboard;
