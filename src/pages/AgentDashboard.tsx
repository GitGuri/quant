import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, TrendingUp, CreditCard, Calendar, Target, Plus, Eye, Download, Bell, Edit, Trash2 } from 'lucide-react';
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

// IMPORTANT: this is your CustomerForm "full page" component that renders the A4 form UI.
// It only needs the small "mode" enhancement shown below in the CustomerForm.tsx snippet.
import CustomerFormFullPage from '@/pages/CustomerForm'; // adjust import to your path

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

// Types (aligned to your backend responses)
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
  // ... (other fields exist on the server; we only need some for the table & form)
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

type FormMode = 'view' | 'edit' | 'create';
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

const AgentDashboard: React.FC = () => {
  const { userName, isAuthenticated } = useAuth();

  // tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'notifications'>('overview');

  // dashboard & table data
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [applications, setApplications] = useState<Application[]>([]); // keep full objects for View/Edit
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // dialog/form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [currentApp, setCurrentApp] = useState<any | null>(null);

  // delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
    const count = apps.length;
    return {
      total_registrations: count,
      successful_payments: Math.floor(count * 0.85),
      pending_payments: Math.floor(count * 0.10),
      failed_payments: Math.floor(count * 0.05),
      monthly_target: 50,
      monthlyRegistrations: [
        { month: 'Jan', count: 5 },
        { month: 'Feb', count: 8 },
        { month: 'Mar', count: 12 },
        { month: 'Apr', count: 10 },
        { month: 'May', count },
      ],
      weeklyPerformance: [
        { week: 'Week 1', count: 85 },
        { week: 'Week 2', count: 92 },
        { week: 'Week 3', count: 78 },
        { week: 'Week 4', count: 95 },
      ],
    };
  };

  // fetch
  useEffect(() => {
    const run = async () => {
      setIsDashboardLoading(true);
      setIsClientsLoading(true);
      setError(null);

      try {
        if (!isAuthenticated || !token) {
          setClients([]);
          setApplications([]);
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

        const res = await fetch(`${API_BASE_URL}/api/applications`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Failed to fetch applications: ${res.status} ${t}`);
        }

        const apps: Application[] = await res.json();
        setApplications(apps);
        setClients(apps.map(toClient));
        setAgentStats(deriveStats(apps));
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Failed to load dashboard data.');
      } finally {
        setIsClientsLoading(false);
        setIsDashboardLoading(false);
      }
    };

    run();
  }, [isAuthenticated, token]);

  // charts
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
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Monthly Registrations (Mocked)' } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 5 } } },
  };

  const lineChartData = useMemo(() => ({
    labels: agentStats?.weeklyPerformance.map(w => w.week) || [],
    datasets: [
      {
        label: 'Performance %',
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
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Weekly Performance Trend (Mocked)' } },
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
    plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Payment Status Breakdown (Mocked)' } },
    cutout: '50%' as const,
  };

  const progressPercentage =
    agentStats && agentStats.monthly_target > 0
      ? Math.round((agentStats.total_registrations / agentStats.monthly_target) * 100)
      : 0;

  // open dialog helpers
  const openView = (id: string) => {
    const app = applications.find(a => a.id === id);
    if (!app) return;
    // map backend -> CustomerForm shape
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

  // save handler from form (create/update)
  const saveApp = async (payloadFromForm: any) => {
    if (!token) return;

    // Map CustomerForm first/last back to backend's name/surname
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
      method: isEdit ? 'PATCH': 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Save failed: ${res.status} ${t}`);
    }

    // refetch list
    const appsRes = await fetch(`${API_BASE_URL}/api/applications`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const apps: Application[] = await appsRes.json();
    setApplications(apps);
    setClients(apps.map(toClient));
    setAgentStats(deriveStats(apps));
    closeForm();
  };

  // delete flow
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
    // refresh
    const appsRes = await fetch(`${API_BASE_URL}/api/applications`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const apps: Application[] = await appsRes.json();
    setApplications(apps);
    setClients(apps.map(toClient));
    setAgentStats(deriveStats(apps));
    setPendingDeleteId(null);
  };

  // notifications (mock)
  const [notifications, setNotifications] = useState([
    { id: 1, message: 'New client registration pending approval', time: '2 hours ago', read: false },
    { id: 2, message: 'Payment received for client ZP12340', time: '5 hours ago', read: true },
    { id: 3, message: 'Monthly target updated to 50 registrations', time: '1 day ago', read: true },
  ]);
  const markAsRead = (id: number) => setNotifications(n => n.map(x => (x.id === id ? { ...x, read: true } : x)));
  const markAllAsRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })));

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
            <p className="text-muted-foreground">Here’s what’s happening with your clients.</p>
          </div>
          <div className="flex gap-2">
            
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />Export Report</Button>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex space-x-4 border-b">
          <Button variant={activeTab === 'overview' ? 'default' : 'ghost'} onClick={() => setActiveTab('overview')} className="gap-2">
            <TrendingUp className="h-4 w-4" />Overview
          </Button>
          <Button variant={activeTab === 'clients' ? 'default' : 'ghost'} onClick={() => setActiveTab('clients')} className="gap-2">
            <Users className="h-4 w-4" />My Clients
          </Button>
          <Button variant={activeTab === 'notifications' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('notifications')} className="gap-2 relative">
            <Bell className="h-4 w-4" />Notifications
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{agentStats.total_registrations}</div>
                  <p className="text-xs text-muted-foreground">Total Clients</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Successful Payments</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{agentStats.successful_payments}</div>
                  <p className="text-xs text-muted-foreground">Processed (Mocked)</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Target</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{agentStats.monthly_target}</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(Math.max(progressPercentage, 0), 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{progressPercentage}% Achieved</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending/Failed</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(agentStats.pending_payments || 0) + (agentStats.failed_payments || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-yellow-600">{agentStats.pending_payments} Pending</span> /{' '}
                    <span className="text-red-600">{agentStats.failed_payments} Failed</span>
                  </p>
                </CardContent>
              </Card>
            </div>

<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Registration Trend</CardTitle><CardDescription>Your registration activity (Mocked).</CardDescription></CardHeader>
                <CardContent>
                  <div className="h-[300px]"> {/* 👈 Added wrapper with fixed height */}
                    <Bar data={barChartData} options={barChartOptions} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Payment Status</CardTitle><CardDescription>Distribution of outcomes (Mocked).</CardDescription></CardHeader>
                <CardContent>
                  <div className="h-[300px]"> {/* 👈 Added wrapper with fixed height */}
                    <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Weekly Performance</CardTitle><CardDescription>Your performance trend (Mocked).</CardDescription></CardHeader>
              <CardContent>
                <div className="h-[300px]"> {/* 👈 Added wrapper with fixed height */}
                  <Line data={lineChartData} options={lineChartOptions} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Clients */}
        {activeTab === 'clients' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Clients</CardTitle>
                <CardDescription>All applications loaded from the server.</CardDescription>
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
                        {clients.length > 0 ? (
                          clients.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">{c.clientId}</TableCell>
                              <TableCell>{c.name}</TableCell>
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
                                {c.amount > 0
                                  ? `R${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : '-'}
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

     {/* Form dialog (View/Edit/New) */}
{/* Form dialog (View/Edit/New) */}
<Dialog open={isFormOpen} onOpenChange={(o) => !o && closeForm()}>
  <DialogContent
    // full screen modal (overrides shadcn's sm:max-w)
    className="w-screen h-screen max-w-none sm:max-w-none p-0 overflow-hidden rounded-none"
  >
    <DialogHeader className="px-6 pt-6 pb-2">
      <DialogTitle>
        {formMode === 'view' ? 'View Application' : formMode === 'edit' ? 'Edit Application' : 'New Application'}
      </DialogTitle>
      <DialogDescription>
        {formMode === 'view' ? 'Read-only preview of the application.' : 'Update details and save.'}
      </DialogDescription>
    </DialogHeader>

    {/* fills remaining height of the full-screen sheet */}
    <div className="h-[calc(100vh-88px)] overflow-auto px-4 pb-4">
      {currentApp && (
        <CustomerFormFullPage
          application={currentApp}
          embed                // 👈 NEW: tell the form it lives inside a modal
          // @ts-expect-error if you wired a mode prop
          mode={formMode}
          onSave={async (a: any) => { try { await saveApp(a); } catch (e: any) { alert(e.message); } }}
          onCancel={closeForm}
        />
      )}
    </div>
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
