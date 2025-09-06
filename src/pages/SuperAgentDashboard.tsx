import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../AuthPage';

import {
  Users, TrendingUp, CreditCard, DollarSign, Filter, Trash2, Pencil, Search, Award, Calendar, BarChart2, X
} from 'lucide-react';

import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

/* ===================== Types ===================== */
interface Agent {
  id: string;
  displayName: string;
  email: string;
  user_id: string;
  roles: string[];
  agent_code: string | null;
  territory: string | null;
  commission_rate: number | null; // fraction (0.1 = 10%)
  target_monthly_registrations: number | null;
  target_monthly_sales: number | null;
  date_onboarded: string | null;
  performance_score: number | null;
  is_active: boolean;
}

type AgentWithStats = Agent & {
  registrationsThisMonth: number;
  registrationsAllTime: number;
  totalPaidThisMonth: number;
  totalPaidAllTime: number;
  expectedCommissionThisMonth: number;
};

interface TeamChartPoint {
  month: string;
  registrations: number;
  payments: number; // count of successful payments in that month (your existing API)
}

interface AgentMonthlyPoint {
  month: string;
  registrations: number;
  paymentsTotal: number;
  commissionAt10: number;
}

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  agent_code: string | null;
  registrations: number;
  paid_total: number;
  commission_month: number;
}

interface Leaderboard {
  byCommission: Array<{ agentId: string; agentName: string; commission: number }>;
  byRegistrations: Array<{ agentId: string; agentName: string; registrations: number }>;
}

interface PaymentCounters {
  successCount: number;
  pendingCount: number;
  failedCount: number;
}

/* ===================== Helpers ===================== */
const formatCurrency = (n?: number | null) =>
  typeof n === 'number'
    ? `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const monthLabel = (m: string) => (m ? m : 'all time');

/* ===================== Component ===================== */
const SuperAgentDashboard: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';
  const { toast } = useToast();

  // === Filter: default to ALL TIME (empty string)
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // data
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [teamChart, setTeamChart] = useState<TeamChartPoint[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [counters, setCounters] = useState<PaymentCounters | null>(null);

  // ui
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // table state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof AgentWithStats | null; direction: 'asc' | 'desc' }>({
    key: null, direction: 'asc',
  });

  // detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAgent, setDetailAgent] = useState<AgentWithStats | null>(null);
  const [detailSeries, setDetailSeries] = useState<AgentMonthlyPoint[] | null>(null);

  // edit/delete
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentWithStats | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Agent>>({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<AgentWithStats | null>(null);

  // fetch
  const fetchMain = async () => {
    if (!isAuthenticated || !token) {
      setError('User not authenticated.');
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const params = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : '';

      const [agentsRes, chartRes, lbCommRes, lbRegsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/super-agent/agents-with-stats${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/super-agent/dashboard/chart-data?period=last_5_months`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/super-agent/leaderboard${params ? `${params}&` : '?'}metric=commission&limit=10`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/super-agent/leaderboard${params ? `${params}&` : '?'}metric=applications&limit=10`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!agentsRes.ok) throw new Error(`Agents ${agentsRes.status}`);
      if (!chartRes.ok) throw new Error(`Chart ${chartRes.status}`);

      const agentsData: AgentWithStats[] = await agentsRes.json();
      setAgents(agentsData);

      const teamChartData: TeamChartPoint[] = await chartRes.json();
      setTeamChart(teamChartData);

      const lb: Leaderboard = { byCommission: [], byRegistrations: [] };
      if (lbCommRes.ok) {
        const rows: LeaderboardRow[] = await lbCommRes.json();
        lb.byCommission = rows.map(r => ({ agentId: r.user_id, agentName: r.display_name, commission: Number(r.commission_month || 0) }));
      }
      if (lbRegsRes.ok) {
        const rows: LeaderboardRow[] = await lbRegsRes.json();
        lb.byRegistrations = rows.map(r => ({ agentId: r.user_id, agentName: r.display_name, registrations: Number(r.registrations || 0) }));
      }
      setLeaderboard(lb);

      // only load per-status counts when a month is selected (all-time counts would be huge / not supported)
      if (selectedMonth) {
        try {
          const countersRes = await fetch(
            `${API_BASE_URL}/api/super-agent/payments-counters?month=${encodeURIComponent(selectedMonth)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (countersRes.ok) {
            const c = await countersRes.json();
            setCounters({
              successCount: Number(c?.successCount ?? 0),
              pendingCount: Number(c?.pendingCount ?? 0),
              failedCount: Number(c?.failedCount ?? 0),
            });
          } else {
            setCounters({ successCount: 0, pendingCount: 0, failedCount: 0 });
          }
        } catch {
          setCounters({ successCount: 0, pendingCount: 0, failedCount: 0 });
        }
      } else {
        setCounters(null); // show “—” on count cards for all-time
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data.');
      toast({ title: 'Fetch Error', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, selectedMonth]);

  // ======== KPIs (switch between ALL TIME vs MONTH) =========
  const kpis = useMemo(() => {
    const sum = <K extends keyof AgentWithStats>(key: K, fallback = 0) =>
      agents.reduce((s, a) => s + Number((a[key] as any) ?? fallback), 0);

    if (!selectedMonth) {
      // ALL TIME
      const totalAgents = agents.length;
      const regsAll = sum('registrationsAllTime');
      const paidAll = sum('totalPaidAllTime');
      const commissionAll = agents.reduce((s, a) => {
        const rate = (a.commission_rate ?? 0.1);
        return s + (rate * (a.totalPaidAllTime ?? 0));
      }, 0);

      return {
        scopeLabel: 'all time',
        totalAgents,
        registrations: regsAll,
        paidAmount: paidAll,
        commission: commissionAll,
        successCount: undefined as number | undefined, // show as —
        pendingCount: undefined as number | undefined,
        failedCount: undefined as number | undefined,
      };
    }

    // BY MONTH
    const totalAgents = agents.length;
    const regsMonth = sum('registrationsThisMonth');
    const paidMonth = sum('totalPaidThisMonth');
    const commissionMonth = sum('expectedCommissionThisMonth');

    return {
      scopeLabel: selectedMonth,
      totalAgents,
      registrations: regsMonth,
      paidAmount: paidMonth,
      commission: commissionMonth,
      successCount: counters?.successCount ?? 0,
      pendingCount: counters?.pendingCount ?? 0,
      failedCount: counters?.failedCount ?? 0,
    };
  }, [agents, counters, selectedMonth]);

  // sorting & filtering
  const handleSort = (key: keyof AgentWithStats) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedAgents = useMemo(() => {
    if (!sortConfig.key) return agents;
    const { key, direction } = sortConfig;
    return [...agents].sort((a, b) => {
      const av = a[key] as any, bv = b[key] as any;
      if (av == null && bv == null) return 0;
      if (av == null) return direction === 'asc' ? -1 : 1;
      if (bv == null) return direction === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return direction === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase(), bs = String(bv).toLowerCase();
      if (as < bs) return direction === 'asc' ? -1 : 1;
      if (as > bs) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [agents, sortConfig]);

  const filteredAgents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sortedAgents;
    return sortedAgents.filter(a =>
      [
        a.displayName, a.email, a.agent_code ?? '', a.territory ?? '',
        (a.expectedCommissionThisMonth ?? '').toString(),
        (a.totalPaidThisMonth ?? '').toString(),
        (a.registrationsThisMonth ?? '').toString(),
      ].join(' ').toLowerCase().includes(q)
    );
  }, [sortedAgents, searchTerm]);

  // charts
  const barChartData = useMemo(() => ({
    labels: teamChart.map(d => d.month),
    datasets: [{
      label: 'Total Registrations',
      data: teamChart.map(d => d.registrations),
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
    }],
  }), [teamChart]);

  const lineChartData = useMemo(() => ({
    labels: teamChart.map(d => d.month),
    datasets: [{
      label: 'Total Successful Payments (count)',
      data: teamChart.map(d => d.payments),
      fill: false,
      borderColor: 'rgb(54, 162, 235)',
      backgroundColor: 'rgba(54, 162, 235, 0.2)',
      tension: 0.25,
    }],
  }), [teamChart]);

  const barChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Monthly Registrations (All Agents)' } }, scales: { y: { beginAtZero: true } } };
  const lineChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' as const }, title: { display: true, text: 'Monthly Successful Payments Trend (count)' } }, scales: { y: { beginAtZero: true } } };

  // detail dialog
  const openAgentDetail = async (agent: AgentWithStats) => {
    if (!token) return;
    setDetailAgent(agent);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailSeries(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/super-agent/agent/${encodeURIComponent(agent.user_id)}/chart-data?period=last_5_months`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const series: AgentMonthlyPoint[] = await res.json();
        setDetailSeries(series);
      } else {
        setDetailSeries([]);
      }
    } catch (e: any) {
      console.error(e);
      setDetailSeries([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEditClick = (agent: AgentWithStats) => {
    setEditingAgent(agent);
    setEditFormData({
      displayName: agent.displayName,
      email: agent.email,
      territory: agent.territory ?? '',
      commission_rate: agent.commission_rate ?? 0.1,
      agent_code: agent.agent_code ?? '',
      target_monthly_registrations: agent.target_monthly_registrations ?? 50,
      target_monthly_sales: agent.target_monthly_sales ?? 0,
      performance_score: agent.performance_score ?? 0,
    });
    setIsEditDialogOpen(true);
  };
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value }));
  };
  const handleSaveEdit = async () => {
    if (!editingAgent || !token) return;
    try {
      const payload: any = { ...editFormData };
      if (typeof payload.commission_rate === 'number' && payload.commission_rate > 1) {
        payload.commission_rate = payload.commission_rate / 100;
      }
      const res = await fetch(`${API_BASE_URL}/api/agents/${editingAgent.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setAgents(prev => prev.map(a => a.user_id === editingAgent.user_id ? { ...a, ...editFormData } as AgentWithStats : a));
      setIsEditDialogOpen(false);
      toast({ title: 'Updated', description: 'Agent updated successfully.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };
  const handleDeleteClick = (agent: AgentWithStats) => { setDeletingAgent(agent); setIsDeleteDialogOpen(true); };
  const handleConfirmDelete = async () => {
    if (!deletingAgent || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/${deletingAgent.user_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      setAgents(prev => prev.filter(a => a.user_id !== deletingAgent.user_id));
      setIsDeleteDialogOpen(false);
      toast({ title: 'Deleted', description: 'Agent deleted.' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <Header title="Super Agent Dashboard" />
        <div className="h-64 grid place-items-center text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <Header title="Super Agent Dashboard" />
        <div className="rounded-lg border p-6 text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <Header title="Super Agent Dashboard" />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.totalAgents}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Registrations ({monthLabel(selectedMonth)})</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.registrations}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Successful Payments (count)</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{kpis.successCount ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">Paid amount: {formatCurrency(kpis.paidAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Pending / Failed (count)</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis.pendingCount === undefined || kpis.failedCount === undefined
                ? '—'
                : (kpis.pendingCount + kpis.failedCount)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{kpis.pendingCount ?? '—'} Pending</span> /{' '}
              <span className="text-red-600">{kpis.failedCount ?? '—'} Failed</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Commission ({monthLabel(selectedMonth)})</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.commission)}</div></CardContent>
        </Card>
      </div>

      {/* Filter row BELOW the KPIs */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="month" className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Month filter
          </Label>
          <input
            id="month"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border rounded-md p-2 text-sm"
            placeholder="YYYY-MM"
          />
          {selectedMonth && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedMonth('')}>
              <X className="h-4 w-4 mr-1" /> Clear (All time)
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-medium">{monthLabel(selectedMonth)}</span>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Top Commission</CardTitle>
              <CardDescription>Agents ranked by commission in {selectedMonth || 'current month*'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(leaderboard?.byCommission ?? []).slice(0, 10).map((r, i) => (
                <div key={r.agentId} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold">{i + 1}</span>
                    <span className="font-medium">{r.agentName}</span>
                  </div>
                  <div className="font-semibold">{formatCurrency(r.commission)}</div>
                </div>
              ))}
              {(!leaderboard || (leaderboard.byCommission?.length ?? 0) === 0) && (
                <div className="text-sm text-muted-foreground">No leaderboard data yet.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5" /> Top Registrations</CardTitle>
              <CardDescription>Agents ranked by registrations in {selectedMonth || 'current month*'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(leaderboard?.byRegistrations ?? []).slice(0, 10).map((r, i) => (
                <div key={r.agentId} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold">{i + 1}</span>
                    <span className="font-medium">{r.agentName}</span>
                  </div>
                  <div className="font-semibold">{r.registrations}</div>
                </div>
              ))}
              {(!leaderboard || (leaderboard.byRegistrations?.length ?? 0) === 0) && (
                <div className="text-sm text-muted-foreground">No leaderboard data yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-80">
          <CardHeader>
            <CardTitle>Team Registration Trend</CardTitle>
            <CardDescription>Aggregate registrations over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <Bar data={barChartData} options={barChartOptions} />
          </CardContent>
        </Card>
        <Card className="h-80">
          <CardHeader>
            <CardTitle>Payments Trend</CardTitle>
            <CardDescription>Successful payments trend (count) over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <Line data={lineChartData} options={lineChartOptions} />
          </CardContent>
        </Card>
      </div>

      {/* Agents table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Click a row to see full profile & monthly commission.</CardDescription>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 w-[320px]"
              placeholder="Search name, email, code, territory, commission, paid, regs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]" onClick={() => handleSort('agent_code')}>
                    Code {sortConfig.key === 'agent_code' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('displayName')}>
                    Name {sortConfig.key === 'displayName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('email')}>
                    Email {sortConfig.key === 'email' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('territory')}>
                    Territory {sortConfig.key === 'territory' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('expectedCommissionThisMonth')}>
                    Comm. (month) {sortConfig.key === 'expectedCommissionThisMonth' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('totalPaidThisMonth')}>
                    Paid (month) {sortConfig.key === 'totalPaidThisMonth' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead onClick={() => handleSort('registrationsThisMonth')}>
                    Regs. (month) {sortConfig.key === 'registrationsThisMonth' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead className="text-center" onClick={() => handleSort('is_active')}>
                    Status {sortConfig.key === 'is_active' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.length > 0 ? filteredAgents.map((agent) => (
                  <TableRow
                    key={agent.user_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-row-action]')) return;
                      openAgentDetail(agent);
                    }}
                  >
                    <TableCell className="font-mono">{agent.agent_code ?? '—'}</TableCell>
                    <TableCell>{agent.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{agent.email}</TableCell>
                    <TableCell>{agent.territory ?? '—'}</TableCell>
                    <TableCell>{formatCurrency(agent.expectedCommissionThisMonth ?? 0)}</TableCell>
                    <TableCell>{formatCurrency(agent.totalPaidThisMonth ?? 0)}</TableCell>
                    <TableCell>{agent.registrationsThisMonth ?? 0}</TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${agent.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    </TableCell>
                    <TableCell className="text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                      <Button data-row-action variant="ghost" size="sm" onClick={() => handleEditClick(agent)}>
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </Button>
                      <Button data-row-action variant="ghost" size="sm" onClick={() => { setDeletingAgent(agent); setIsDeleteDialogOpen(true); }}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No agents found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Agent Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) { setDetailOpen(false); setDetailAgent(null); setDetailSeries(null); }}}>
        <DialogContent className="w-[92vw] max-w-5xl max-h-[90vh] overflow-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Agent Details</DialogTitle>
            <DialogDescription>5-month trend & monthly commission</DialogDescription>
          </DialogHeader>

          {!detailAgent ? (
            <div className="py-12 text-center text-muted-foreground">No agent selected.</div>
          ) : detailLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading agent trend…</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Agent</CardTitle>
                    <CardDescription>{detailAgent.email}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="font-semibold">{detailAgent.displayName}</div>
                    <div className="text-sm text-muted-foreground">Code: {detailAgent.agent_code ?? '—'}</div>
                    <div className="text-sm text-muted-foreground">Territory: {detailAgent.territory ?? '—'}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Commission ({selectedMonth || 'month'})</CardTitle>
                    <CardDescription>{((detailAgent.commission_rate ?? 0.1) * 100).toFixed(0)}% of paid</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(detailAgent.expectedCommissionThisMonth ?? 0)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Paid ({selectedMonth || 'month'})</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(detailAgent.totalPaidThisMonth ?? 0)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Registrations ({selectedMonth || 'month'})</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {detailAgent.registrationsThisMonth ?? 0}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Last 5 Months</CardTitle>
                  <CardDescription>Registrations & payments (with commission)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    {detailSeries && detailSeries.length ? (
                      <Line
                        data={{
                          labels: detailSeries.map(p => p.month),
                          datasets: [
                            {
                              label: 'Payments (sum total_amount)',
                              data: detailSeries.map(p => p.paymentsTotal),
                              borderColor: 'rgb(99,102,241)',
                              backgroundColor: 'rgba(99,102,241,.2)',
                              tension: 0.25,
                              yAxisID: 'y',
                            },
                            {
                              label: 'Registrations',
                              data: detailSeries.map(p => p.registrations),
                              borderColor: 'rgb(16,185,129)',
                              backgroundColor: 'rgba(16,185,129,.2)',
                              tension: 0.25,
                              yAxisID: 'y1',
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { beginAtZero: true, position: 'left' },
                            y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
                          },
                          plugins: { legend: { position: 'top' as const } },
                        }}
                      />
                    ) : (
                      <div className="h-full grid place-items-center text-muted-foreground">
                        No trend data.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingAgent && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Agent</DialogTitle>
              <DialogDescription>Update agent profile details and code.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="displayName" className="text-right">Name</Label>
                <Input id="displayName" name="displayName" value={(editFormData.displayName as string) || ''} onChange={handleEditChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">Email</Label>
                <Input id="email" name="email" value={(editFormData.email as string) || ''} onChange={handleEditChange} className="col-span-3" type="email" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="agent_code" className="text-right">Agent Code</Label>
                <Input id="agent_code" name="agent_code" value={(editFormData.agent_code as string) ?? ''} onChange={handleEditChange} className="col-span-3" placeholder="e.g. AGT-001" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="territory" className="text-right">Territory</Label>
                <Input id="territory" name="territory" value={(editFormData.territory as string) || ''} onChange={handleEditChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="commission_rate" className="text-right">Comm. Rate (%)</Label>
                <Input
                  id="commission_rate"
                  name="commission_rate"
                  value={
                    editFormData.commission_rate !== null && editFormData.commission_rate !== undefined && (editFormData.commission_rate as any) !== ''
                      ? String((editFormData.commission_rate as number) * 100)
                      : '10'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') return setEditFormData(p => ({ ...p, commission_rate: '' as any }));
                    const n = parseFloat(v);
                    setEditFormData(p => ({ ...p, commission_rate: isNaN(n) ? ('' as any) : n / 100 }));
                  }}
                  className="col-span-3" type="number" step="0.01"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="target_monthly_registrations" className="text-right">Regs. Target</Label>
                <Input id="target_monthly_registrations" name="target_monthly_registrations" value={(editFormData.target_monthly_registrations as number | string) ?? ''} onChange={handleEditChange} className="col-span-3" type="number" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="target_monthly_sales" className="text-right">Sales Target</Label>
                <Input id="target_monthly_sales" name="target_monthly_sales" value={(editFormData.target_monthly_sales as number | string) ?? ''} onChange={handleEditChange} className="col-span-3" type="number" step="0.01" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deletingAgent && (
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deletingAgent.displayName}</strong>? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SuperAgentDashboard;
