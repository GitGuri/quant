// SuperAgentDashboard.tsx — PART 1/2 (mobile + OC-friendly)
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
import { useAuth } from '@/AuthPage';

import {
  Users, TrendingUp, CreditCard, DollarSign, Trash2, Pencil, Search, Calendar, X, Eye, Edit, Send, Bell, MessageSquare
} from 'lucide-react';

import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js';

// NEW: tabs + badge (detail sections)
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
// motion
import { motion } from 'framer-motion';

// Full-page form
import CustomerFormFullPage from '@/pages/CustomerForm';

// OPTIONAL: shadcn Textarea
let Textarea: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Textarea = require('@/components/ui/textarea').Textarea;
} catch {
  // fallback to native <textarea>
}

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

// ================= Config =================
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

// ================= Types =================
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
  payments: number;
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

// Clients & Applications
interface SalesClientRow {
  customerName: string;
  totalPaidAllTime: number;
  paidThisMonth: number;
  expectedCommissionMonth: number;
  lastPaymentDate: string | null; // ISO
  agentUserId?: string;
  agentName?: string;
  agentCode?: string | null;
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
    id: string | number;
    date: string | null;
    totalAmount: number;
    paymentType: string | null;
    amountPaid: number | null;
    changeGiven: number | null;
    creditAmount: number | null;
    remainingCreditAmount: number | null;
  }>;
}
interface Application {
  id: string;
  name?: string;
  surname?: string;
  id_number?: string;
  total_amount?: number;
  created_at?: string | null;
  status?: string;
  agent_name?: string | null;
  agent_code?: string | null;
}

// Messaging
type ChatMessage = {
  id: number;
  sender_user_id: string;
  receiver_user_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

// Notifications
type NotificationRow = {
  id: number;
  sender_user_id: string;
  receiver_user_id: string;
  message: string;
  created_at: string;
  is_read: boolean | null;
};

// ================= Helpers =================
const formatCurrency = (n?: number | null) =>
  typeof n === 'number'
    ? `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const monthLabel = (m: string) => (m ? m : 'all time');

const toAppName = (a: Application) =>
  `${(a.name || '').trim()} ${(a.surname || '').trim()}`.trim();

// ================= Component =================
const SuperAgentDashboard: React.FC = () => {
  const { isAuthenticated, userName } = useAuth();
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';
  const { toast } = useToast();

  // global month filter
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

  // ===== Agent Detail Dialog =====
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAgent, setDetailAgent] = useState<AgentWithStats | null>(null);
  const [detailSeries, setDetailSeries] = useState<AgentMonthlyPoint[] | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'clients' | 'applications'>('overview');

  // Clients tab (per agent)
  const [agentClientsLoading, setAgentClientsLoading] = useState(false);
  const [agentClients, setAgentClients] = useState<SalesClientRow[]>([]);
  const [agentClientsSearch, setAgentClientsSearch] = useState('');

  // Applications tab (per agent)
  const [agentAppsLoading, setAgentAppsLoading] = useState(false);
  const [agentApps, setAgentApps] = useState<Application[]>([]);
  const [agentAppsSearch, setAgentAppsSearch] = useState('');

  // team clients (ALL agents)
  const [teamClientsLoading, setTeamClientsLoading] = useState(false);
  const [teamClients, setTeamClients] = useState<SalesClientRow[]>([]);
  const [teamClientsSearch, setTeamClientsSearch] = useState('');
  const [teamAppsLoading, setTeamAppsLoading] = useState(false);
  const [teamApps, setTeamApps] = useState<Application[]>([]);
  const [teamAppsSearch, setTeamAppsSearch] = useState('');
  // client history
  const [clientDetailOpen, setClientDetailOpen] = useState(false);
  const [clientDetailLoading, setClientDetailLoading] = useState(false);
  const [clientDetail, setClientDetail] = useState<ClientHistory | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);
  const [selectedCustomerAgentId, setSelectedCustomerAgentId] = useState<string | null>(null);

  // application full-page dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'view' | 'edit'>('view');
  const [currentApp, setCurrentApp] = useState<any | null>(null);

  // ===== Edit Agent dialog =====
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentWithStats | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Agent & {
    commission_rate_display?: string | number;
  }>>({});

  // ===== Two-way Chat state =====
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<{ id: string; name: string } | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // ===== Notifications state =====
  const [unreadByUser, setUnreadByUser] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [enableSound, setEnableSound] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [lastNotifSeenAt, setLastNotifSeenAt] = useState<number>(0); // epoch ms
  const notifyAudio = useMemo(() => {
    try { return new Audio('/notify.mp3'); } catch { return null; }
  }, []);

  // ===== Chat helpers =====
  const { toast: _toastShim } = { toast }; // silence lints

  const fetchThread = async (withUserId: string) => {
    if (!token) return;
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/thread/${encodeURIComponent(withUserId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const rows: ChatMessage[] = await res.json();
      setChatMessages(rows);
    } catch (e: any) {
      console.error('fetchThread error', e);
      setChatMessages([]);
      toast({ title: 'Chat error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setChatLoading(false);
    }
  };

  const markThreadRead = async (withUserId: string) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/api/messages/mark-read/${encodeURIComponent(withUserId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* noop */ }
  };

  // ===== Notifications helpers =====
  const markNotificationsReadForUser = async (senderId: string) => {
    if (!token) return;
    const pending = notifications.filter(n => !n.is_read && n.sender_user_id === senderId);
    if (pending.length === 0) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => n.sender_user_id === senderId ? { ...n, is_read: true } : n));

    await Promise.allSettled(
      pending.map(n =>
        fetch(`${API_BASE_URL}/api/notifications/${n.id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    );
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const rows: NotificationRow[] = await res.json();

      setNotifications(rows);

      if (lastNotifSeenAt === 0 && rows.length) {
        const newestTs = Math.max(...rows.map(r => new Date(r.created_at).getTime()).filter(x => !isNaN(x)));
        if (isFinite(newestTs)) setLastNotifSeenAt(newestTs);
        return; // don't toast on first bulk load
      }

      const newlyArrived = rows.filter(n => {
        const ts = new Date(n.created_at).getTime();
        return !isNaN(ts) && ts > lastNotifSeenAt;
      });

      if (newlyArrived.length) {
        const newestTs = Math.max(...newlyArrived.map(n => new Date(n.created_at).getTime()));
        if (isFinite(newestTs)) setLastNotifSeenAt(newestTs);

        newlyArrived.forEach(n => {
          const senderId = n.sender_user_id;
          setUnreadByUser(prev => {
            const next = { ...prev, [senderId]: (prev[senderId] ?? 0) + 1 };
            setTotalUnread(Object.values(next).reduce((a, b) => a + b, 0));
            return next;
          });

          toast({ title: 'New message', description: (n.message || '').slice(0, 140) });

          if (enableSound && notifyAudio) {
            notifyAudio.currentTime = 0;
            notifyAudio.play().catch(() => {});
          }
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('New message', { body: (n.message || '').slice(0, 100) });
          }
        });
      }
    } catch {
      // swallow polling errors
    }
  };

  // ===== Open chat =====
  const openChat = async (agent: AgentWithStats) => {
    setChatTarget({ id: agent.user_id, name: agent.displayName });
    setChatOpen(true);
    await fetchThread(agent.user_id);
    await markThreadRead(agent.user_id);
    await markNotificationsReadForUser(agent.user_id);

    // Clear local unread badge for this agent
    setUnreadByUser(prev => {
      if (!prev[agent.user_id]) return prev;
      const next = { ...prev };
      delete next[agent.user_id];
      setTotalUnread(Object.values(next).reduce((a, b) => a + b, 0));
      return next;
    });
  };

  const sendChat = async () => {
    if (!token || !chatTarget) return;
    const body = chatInput.trim();
    if (!body) return;

    setChatSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiver_user_id: chatTarget.id, body }),
      });
      if (!res.ok) throw new Error(await res.text());
      setChatInput('');
      await fetchThread(chatTarget.id);
    } catch (e: any) {
      toast({ title: 'Send failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setChatSending(false);
    }
  };

  // ===== Effects =====
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Poll notifications every 10s
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 10000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  // Refresh open chat thread every 5s
  useEffect(() => {
    if (!chatOpen || !chatTarget?.id) return;
    const iv = setInterval(() => fetchThread(chatTarget.id), 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatTarget?.id]);

  // ===== fetch main =====
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

      if (selectedMonth) {
        try {
          const scRes = await fetch(
            `${API_BASE_URL}/api/super-agent/successful-payments-count?month=${encodeURIComponent(selectedMonth)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (scRes.ok) {
            const { successCount } = await scRes.json();
            setCounters({
              successCount: Number(successCount ?? 0),
              pendingCount: undefined as any,
              failedCount: undefined as any,
            });
          } else {
            setCounters({ successCount: 0, pendingCount: undefined as any, failedCount: undefined as any });
          }
        } catch {
          setCounters({ successCount: 0, pendingCount: undefined as any, failedCount: undefined as any });
        }
      } else {
        setCounters(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data.');
      toast({ title: 'Fetch Error', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // team clients aggregated (loaded in Part 2 UI)
  const fetchTeamClients = async () => {
    if (!token) return;
    setTeamClientsLoading(true);
    try {
      const all: SalesClientRow[] = [];
      for (const a of agents) {
        const url = new URL(`${API_BASE_URL}/api/my-clients`);
        if (selectedMonth) url.searchParams.set('month', selectedMonth);
        url.searchParams.set('agentUserId', a.user_id);

        const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) continue;
        const rows: SalesClientRow[] = await res.json();
        rows.forEach(r => {
          all.push({
            ...r,
            agentUserId: a.user_id,
            agentName: a.displayName,
            agentCode: a.agent_code ?? null,
          });
        });
      }
      setTeamClients(all.sort((x, y) =>
        (new Date(y.lastPaymentDate ?? 0).getTime()) - (new Date(x.lastPaymentDate ?? 0).getTime())
      ));
    } catch (e) {
      console.error('fetchTeamClients error', e);
      setTeamClients([]);
    } finally {
      setTeamClientsLoading(false);
    }
  };

  useEffect(() => {
    fetchMain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, selectedMonth]);

  useEffect(() => {
    if (agents.length) fetchTeamClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, selectedMonth]);

  // === Applications across team ===
  const fetchTeamApplications = async () => {
    if (!token) return;
    setTeamAppsLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/super-agent/applications`);
      if (selectedMonth) url.searchParams.set('month', selectedMonth);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const apps: Application[] = await res.json();
      setTeamApps(apps);
    } catch (e) {
      console.error('fetchTeamApplications error', e);
      setTeamApps([]);
    } finally {
      setTeamAppsLoading(false);
    }
  };
  useEffect(() => {
    fetchTeamApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, token, isAuthenticated]);

  // ======== KPIs =========
  const kpis = useMemo(() => {
    const sum = <K extends keyof AgentWithStats>(key: K, fallback = 0) =>
      agents.reduce((s, a) => s + Number((a[key] as any) ?? fallback), 0);

    if (!selectedMonth) {
      const totalAgents = agents.length;
      const regsAll = sum('registrationsAllTime');
      const paidAll = sum('totalPaidAllTime');
      const commissionAll = agents.reduce((s, a) => {
        const rate = (a.commission_rate ?? 0.1);
        return s + (rate * (a.totalPaidAllTime ?? 0));
      }, 0);

      return {
        totalAgents,
        registrations: regsAll,
        paidAmount: paidAll,
        commission: commissionAll,
        successCount: undefined as number | undefined,
        pendingCount: undefined as number | undefined,
        failedCount: undefined as number | undefined,
      };
    }

    const totalAgents = agents.length;
    const regsMonth = sum('registrationsThisMonth');
    const paidMonth = sum('totalPaidThisMonth');
    const commissionMonth = sum('expectedCommissionThisMonth');

    return {
      totalAgents,
      registrations: regsMonth,
      paidAmount: paidMonth,
      commission: commissionMonth,
      successCount: counters?.successCount ?? 0,
      pendingCount: counters?.pendingCount ?? 0,
      failedCount: counters?.failedCount ?? 0,
    };
  }, [agents, counters, selectedMonth]);

  // sorting & filtering (agents table)
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

  // ========= Per-agent helpers =========
  const fetchAgentClients = async (agentUserId: string) => {
    if (!token) return;
    setAgentClientsLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/my-clients`);
      if (selectedMonth) url.searchParams.set('month', selectedMonth);
      url.searchParams.set('agentUserId', agentUserId);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const rows: SalesClientRow[] = await res.json();
      setAgentClients(rows);
    } catch (e: any) {
      console.error('fetchAgentClients error', e);
      setAgentClients([]);
      toast({ title: 'Clients error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setAgentClientsLoading(false);
    }
  };

  const fetchAgentApplications = async (agentUserId: string) => {
    if (!token) return;
    setAgentAppsLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/super-agent/agent/${encodeURIComponent(agentUserId)}/applications`);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const apps: Application[] = await res.json();
      setAgentApps(apps);
    } catch (e: any) {
      console.error('fetchAgentApplications error', e);
      setAgentApps([]);
    } finally {
      setAgentAppsLoading(false);
    }
  };

  const openClientHistory = async (customerName: string, agentUserId?: string) => {
    if (!token) return;
    setSelectedCustomerName(customerName);
    setSelectedCustomerAgentId(agentUserId ?? (detailAgent?.user_id || null));
    setClientDetailOpen(true);
    setClientDetailLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/my-client-history`);
      url.searchParams.set('customerName', customerName);
      if (selectedMonth) url.searchParams.set('month', selectedMonth);
      if (agentUserId) url.searchParams.set('agentUserId', agentUserId);

      const res = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const data: ClientHistory = await res.json();
      setClientDetail(data);
    } catch (e) {
      console.error(e);
      setClientDetail(null);
    } finally {
      setClientDetailLoading(false);
    }
  };

  const openApplicationByName = (fullName: string, apps: Application[]) => {
    const target = apps.find(a => toAppName(a).toLowerCase() === fullName.trim().toLowerCase());
    if (target) {
      setCurrentApp({
        ...target,
        firstName: target.name || '',
        lastName: target.surname || '',
      });
      setFormMode('view');
      setIsFormOpen(true);
    } else {
      toast({ title: 'Not found', description: 'No matching application found for this client.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!detailOpen || !detailAgent || !token) return;
      setDetailLoading(true);
      setDetailSeries(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/super-agent/agent/${encodeURIComponent(detailAgent.user_id)}/chart-data?period=last_5_months`,
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

      // Preload the tab data
      fetchAgentClients(detailAgent.user_id);
      fetchAgentApplications(detailAgent.user_id);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOpen, detailAgent?.user_id]);

  useEffect(() => {
    if (detailOpen && detailAgent) {
      fetchAgentClients(detailAgent.user_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  // ======= Edit Agent handlers =======
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    if (name === 'commission_rate_display') {
      const asNum = value === '' ? '' : Number(value);
      setEditFormData(prev => ({
        ...prev,
        commission_rate_display: value,
        commission_rate: value === '' || isNaN(asNum) ? ('' as any) : Number((asNum / 100).toFixed(6))
      }));
      return;
    }
    if (type === 'checkbox') {
      setEditFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }
    setEditFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingAgent || !token) return;

    const pct = Number(editFormData.commission_rate_display ?? 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: 'Invalid commission', description: 'Commission must be between 0 and 100%.', variant: 'destructive' });
      return;
    }

    const payload: any = {
      displayName: editFormData.displayName,
      email: editFormData.email,
      agent_code: (editFormData.agent_code ?? '').toString().trim() || null,
      territory: (editFormData.territory ?? '').toString().trim() || null,
      commission_rate: Number((pct / 100).toFixed(6)),
      target_monthly_registrations: editFormData.target_monthly_registrations ?? 0,
      target_monthly_sales: editFormData.target_monthly_sales ?? 0,
      performance_score: editFormData.performance_score ?? 0,
      is_active: !!editFormData.is_active,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/${editingAgent.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      // reflect changes in table state
      setAgents(prev =>
        prev.map(a => a.user_id === editingAgent.user_id
          ? { ...a, ...payload, commission_rate: payload.commission_rate }
          : a)
      );

      setIsEditDialogOpen(false);
      toast({ title: 'Agent updated', description: 'Changes saved successfully.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  // ====== Loading & Errors ======
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

  // ====== Render (PART 1/2 up to Agents) ======
  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <Header title="Super Agent Dashboard" />

      {/* Welcome + Month Filter + Notifications */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Welcome back, {userName || 'Super Agent'}!</h2>
          <p className="text-muted-foreground">Team performance & client insights.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month filter */}
          <div className="flex items-center gap-2">
            <Label htmlFor="month" className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Month
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
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Notifications bell */}
          <div className="relative">
            <Button aria-label="Notifications" variant="ghost" size="sm" onClick={() => setNotifDropdownOpen(v => !v)}>
              <Bell className="h-5 w-5" />
              {totalUnread > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] px-2 py-[2px]">
                  {totalUnread}
                </span>
              )}
            </Button>
            {notifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-md border bg-background shadow-lg z-20">
                <div className="p-2 text-sm font-medium border-b">Unread messages</div>
                <div className="max-h-64 overflow-auto">
                  {Object.keys(unreadByUser).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No unread right now.</div>
                  ) : (
                    agents
                      .filter(a => (unreadByUser[a.user_id] ?? 0) > 0)
                      .sort((a, b) => (unreadByUser[b.user_id] ?? 0) - (unreadByUser[a.user_id] ?? 0))
                      .map(a => (
                        <button
                          key={a.user_id}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
                          onClick={() => {
                            setNotifDropdownOpen(false);
                            openChat(a);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate">{a.displayName}</span>
                          </span>
                          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] px-2 py-[2px]">
                            {unreadByUser[a.user_id] ?? 0}
                          </span>
                        </button>
                      ))
                  )}
                </div>

                {/* Recent notifications */}
                <div className="border-t">
                  <div className="p-2 text-xs text-muted-foreground">Recent</div>
                  <div className="max-h-48 overflow-auto">
                    {notifications.slice(0, 10).map(n => (
                      <button
                        key={n.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50"
                        onClick={() => {
                          setNotifDropdownOpen(false);
                          const a = agents.find(x => x.user_id === n.sender_user_id);
                          if (a) openChat(a);
                        }}
                      >
                        <div className="text-xs opacity-70">{new Date(n.created_at).toLocaleString('en-ZA')}</div>
                        <div className="truncate">{n.message}</div>
                      </button>
                    ))}
                    {notifications.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">No notifications yet.</div>
                    )}
                  </div>
                </div>

                <div className="p-2 border-t flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={enableSound}
                      onChange={(e) => setEnableSound(e.target.checked)}
                    />
                    Sound
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => setNotifDropdownOpen(false)}>Close</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm">Commission ({monthLabel(selectedMonth)})</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.commission)}</div></CardContent>
        </Card>
      </div>

      {/* Team Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-64 sm:h-80">
          <CardHeader>
            <CardTitle>Team Registration Trend</CardTitle>
            <CardDescription>Aggregate registrations over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent className="h-48 sm:h-64">
            <Bar data={barChartData} options={barChartOptions} />
          </CardContent>
        </Card>
        <Card className="h-64 sm:h-80">
          <CardHeader>
            <CardTitle>Payments Trend</CardTitle>
            <CardDescription>Successful payments trend (count) over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent className="h-48 sm:h-64">
            <Line data={lineChartData} options={lineChartOptions} />
          </CardContent>
        </Card>
      </div>

      {/* Agents */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Tap a card or row to view tabs. Pencil to edit. Paper plane to chat.</CardDescription>
          </div>
          <div className="relative w-full md:w-auto">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 w-full sm:w-[320px]"
              placeholder="Search name, email, code, territory, commission, paid, regs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          {/* Mobile (≤ md): stacked agent cards */}
          <div className="md:hidden space-y-2">
            {filteredAgents.length ? filteredAgents.map((agent) => (
              <Card
                key={agent.user_id}
                className="p-3"
                onClick={() => {
                  setDetailAgent(agent);
                  setDetailOpen(true);
                  setDetailLoading(true);
                  setDetailSeries(null);
                  setDetailTab('overview');
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{agent.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">{agent.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{agent.agent_code ?? '—'}</span> • {agent.territory ?? '—'}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button aria-label="View details" variant="ghost" size="icon" onClick={() => {
                      setDetailAgent(agent);
                      setDetailOpen(true);
                      setDetailLoading(true);
                      setDetailSeries(null);
                      setDetailTab('overview');
                    }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button aria-label="Edit agent" variant="ghost" size="icon" onClick={() => {
                      setEditingAgent(agent);
                      setEditFormData({
                        displayName: agent.displayName,
                        email: agent.email,
                        agent_code: agent.agent_code ?? '',
                        territory: agent.territory ?? '',
                        commission_rate: agent.commission_rate ?? 0.1,
                        commission_rate_display: ((agent.commission_rate ?? 0.1) * 100).toFixed(2),
                        target_monthly_registrations: agent.target_monthly_registrations ?? 0,
                        target_monthly_sales: agent.target_monthly_sales ?? 0,
                        performance_score: agent.performance_score ?? 0,
                        is_active: agent.is_active,
                      });
                      setIsEditDialogOpen(true);
                    }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <button
                      aria-label="Message agent"
                      className="relative inline-flex items-center justify-center rounded-md p-2 hover:bg-muted/60"
                      onClick={(e) => { e.stopPropagation(); openChat(agent); }}
                      title="Message Agent"
                    >
                      <Send className="w-4 h-4" />
                      {(unreadByUser[agent.user_id] ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] h-4 min-w-4 px-[4px]">
                          {unreadByUser[agent.user_id]}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Commission</div>
                    <div className="font-medium">{formatCurrency(agent.expectedCommissionThisMonth ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Paid</div>
                    <div className="font-medium">{formatCurrency(agent.totalPaidThisMonth ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Regs</div>
                    <div className="font-medium">{agent.registrationsThisMonth ?? 0}</div>
                  </div>
                </div>
              </Card>
            )) : (
              <div className="text-sm text-muted-foreground p-3">No agents found.</div>
            )}
          </div>

          {/* Desktop (≥ md): original table */}
          <div className="hidden md:block overflow-x-auto">
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
                      setDetailAgent(agent);
                      setDetailOpen(true);
                      setDetailLoading(true);
                      setDetailSeries(null);
                      setDetailTab('overview');
                    }}
                  >
                    <TableCell className="font-mono">{agent.agent_code ?? '—'}</TableCell>
                    <TableCell>{agent.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{agent.email}</TableCell>
                    <TableCell>{agent.territory ?? '—'}</TableCell>
                    <TableCell>{formatCurrency(agent.expectedCommissionThisMonth ?? 0)}</TableCell>
                    <TableCell>{formatCurrency(agent.totalPaidThisMonth ?? 0)}</TableCell>
                    <TableCell>{agent.registrationsThisMonth ?? 0}</TableCell>

                    <TableCell className="text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                      <Button aria-label="View details" data-row-action variant="ghost" size="sm" onClick={() => {
                        setDetailAgent(agent);
                        setDetailOpen(true);
                        setDetailLoading(true);
                        setDetailSeries(null);
                        setDetailTab('overview');
                      }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button aria-label="Edit agent" data-row-action variant="ghost" size="sm" onClick={() => {
                        setEditingAgent(agent);
                        setEditFormData({
                          displayName: agent.displayName,
                          email: agent.email,
                          agent_code: agent.agent_code ?? '',
                          territory: agent.territory ?? '',
                          commission_rate: agent.commission_rate ?? 0.1,
                          commission_rate_display: ((agent.commission_rate ?? 0.1) * 100).toFixed(2),
                          target_monthly_registrations: agent.target_monthly_registrations ?? 0,
                          target_monthly_sales: agent.target_monthly_sales ?? 0,
                          performance_score: agent.performance_score ?? 0,
                          is_active: agent.is_active,
                        });
                        setIsEditDialogOpen(true);
                      }}>
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </Button>

                      <button
                        aria-label="Message agent"
                        data-row-action
                        className="relative inline-flex items-center justify-center rounded-md px-2 py-1 hover:bg-muted/60"
                        onClick={() => openChat(agent)}
                        title="Message Agent"
                      >
                        <Send className="w-4 h-4" />
                        {(unreadByUser[agent.user_id] ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] h-4 min-w-4 px-[4px]">
                            {unreadByUser[agent.user_id]}
                          </span>
                        )}
                      </button>
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
      {/* ===== Team Clients (ALL your agents) ===== */}
      <Card className="h-[440px] md:h-[480px] flex flex-col">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Team Clients</CardTitle>
            <CardDescription>All clients attributed to agents under you.</CardDescription>
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 w-full sm:w-[260px]"
                placeholder="Search customer or agent"
                value={teamClientsSearch}
                onChange={(e) => setTeamClientsSearch(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Month: <span className="font-medium">{monthLabel(selectedMonth)}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 flex-1 overflow-hidden">
          {teamClientsLoading ? (
            <div className="h-full grid place-items-center text-muted-foreground">
              Loading team clients…
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden h-full overflow-y-auto p-3 space-y-2">
                {(teamClientsSearch
                  ? teamClients.filter(r =>
                      (r.customerName || '').toLowerCase().includes(teamClientsSearch.toLowerCase()) ||
                      (r.agentName || '').toLowerCase().includes(teamClientsSearch.toLowerCase())
                    )
                  : teamClients
                ).map((row, idx) => (
                  <Card key={`${row.customerName}-${row.agentUserId}-${idx}`} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{row.customerName || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.agentName || '—'} • <span className="font-mono">{row.agentCode || '—'}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Last: {row.lastPaymentDate ? new Date(row.lastPaymentDate).toLocaleDateString('en-ZA') : '—'}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <Button aria-label="View client history" variant="ghost" size="icon" onClick={() => openClientHistory(row.customerName, row.agentUserId)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Open application"
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            let apps = agentApps;
                            if (!detailAgent || detailAgent.user_id !== row.agentUserId) {
                              await fetchAgentApplications(row.agentUserId || '');
                              apps = agentApps; // state may lag slightly
                              setTimeout(() => openApplicationByName(row.customerName, apps), 50);
                              return;
                            }
                            openApplicationByName(row.customerName, apps);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Paid (month)</div>
                        <div className="font-medium">{formatCurrency(row.paidThisMonth)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Commission</div>
                        <div className="font-medium">{formatCurrency(row.expectedCommissionMonth)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total</div>
                        <div className="font-medium">{formatCurrency(row.totalPaidAllTime)}</div>
                      </div>
                    </div>
                  </Card>
                ))}
                {teamClients.length === 0 && (
                  <div className="text-sm text-muted-foreground">No team clients found.</div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block h-full w-full overflow-x-auto">
                <div className="h-full overflow-y-auto">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Last Payment</TableHead>
                        <TableHead className="text-right">Paid (month)</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Total (all time)</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {(teamClientsSearch
                        ? teamClients.filter(r =>
                            (r.customerName || '').toLowerCase().includes(teamClientsSearch.toLowerCase()) ||
                            (r.agentName || '').toLowerCase().includes(teamClientsSearch.toLowerCase())
                          )
                        : teamClients
                      ).map((row, idx) => (
                        <TableRow key={`${row.customerName}-${row.agentUserId}-${idx}`}>
                          <TableCell className="font-medium">{row.customerName || '—'}</TableCell>
                          <TableCell>{row.agentName || '—'}</TableCell>
                          <TableCell className="font-mono">{row.agentCode || '—'}</TableCell>
                          <TableCell>
                            {row.lastPaymentDate
                              ? new Date(row.lastPaymentDate).toLocaleDateString('en-ZA')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.paidThisMonth)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.expectedCommissionMonth)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totalPaidAllTime)}</TableCell>
                          <TableCell className="text-center space-x-1">
                            <Button
                              aria-label="View client history"
                              variant="ghost"
                              size="sm"
                              onClick={() => openClientHistory(row.customerName, row.agentUserId)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label="Open application"
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                let apps = agentApps;
                                if (!detailAgent || detailAgent.user_id !== row.agentUserId) {
                                  await fetchAgentApplications(row.agentUserId || '');
                                  apps = agentApps;
                                  setTimeout(() => openApplicationByName(row.customerName, apps), 50);
                                  return;
                                }
                                openApplicationByName(row.customerName, apps);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}

                      {teamClients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                            No team clients found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ===== Team Applications (ALL your agents) ===== */}
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Team Applications</CardTitle>
            <CardDescription>All applications captured by agents under you.</CardDescription>
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 w-full sm:w-[260px]"
                placeholder="Search name / ID / agent"
                value={teamAppsSearch}
                onChange={(e) => setTeamAppsSearch(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Month: <span className="font-medium">{monthLabel(selectedMonth)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {teamAppsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading team applications…</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2 p-1">
                {(teamAppsSearch
                  ? teamApps.filter(a => {
                      const q = teamAppsSearch.toLowerCase();
                      return (
                        toAppName(a).toLowerCase().includes(q) ||
                        (a.id_number || '').toLowerCase().includes(q) ||
                        (a.agent_name || '').toLowerCase().includes(q) ||
                        (a.agent_code || '').toLowerCase().includes(q)
                      );
                    })
                  : teamApps
                ).map(app => (
                  <Card key={app.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{toAppName(app) || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          ID: <span className="font-mono">{app.id_number || '—'}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {app.agent_name || '—'} • <span className="font-mono">{app.agent_code || '—'}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <Button
                          aria-label="View application"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentApp({
                              ...app,
                              firstName: app.name || '',
                              lastName: app.surname || '',
                            });
                            setFormMode('view');
                            setIsFormOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Edit application"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentApp({
                              ...app,
                              firstName: app.name || '',
                              lastName: app.surname || '',
                            });
                            setFormMode('edit');
                            setIsFormOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="font-medium">{app.created_at ? new Date(app.created_at).toLocaleDateString('en-ZA') : '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-medium">{formatCurrency(app.total_amount ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Status</div>
                        <div className="font-medium">{app.status || '—'}</div>
                      </div>
                    </div>
                  </Card>
                ))}
                {teamApps.length === 0 && (
                  <div className="text-sm text-muted-foreground">No applications found.</div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>ID Number</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(teamAppsSearch
                      ? teamApps.filter(a => {
                          const q = teamAppsSearch.toLowerCase();
                          return (
                            toAppName(a).toLowerCase().includes(q) ||
                            (a.id_number || '').toLowerCase().includes(q) ||
                            (a.agent_name || '').toLowerCase().includes(q) ||
                            (a.agent_code || '').toLowerCase().includes(q)
                          );
                        })
                      : teamApps
                    ).map(app => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{toAppName(app) || '—'}</TableCell>
                        <TableCell className="font-mono">{app.id_number || '—'}</TableCell>
                        <TableCell>{app.agent_name || '—'}</TableCell>
                        <TableCell className="font-mono">{app.agent_code || '—'}</TableCell>
                        <TableCell>{app.created_at ? new Date(app.created_at).toLocaleDateString('en-ZA') : '—'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(app.total_amount ?? 0)}</TableCell>
                        <TableCell className="text-center space-x-1">
                          <Button
                            aria-label="View application"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCurrentApp({
                                ...app,
                                firstName: app.name || '',
                                lastName: app.surname || '',
                              });
                              setFormMode('view');
                              setIsFormOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="Edit application"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCurrentApp({
                                ...app,
                                firstName: app.name || '',
                                lastName: app.surname || '',
                              });
                              setFormMode('edit');
                              setIsFormOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {teamApps.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                          No applications found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ===== Agent Detail Dialog (tabs) ===== */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDetailOpen(false);
            setDetailAgent(null);
            setDetailSeries(null);
            setAgentClients([]);
            setAgentApps([]);
          }
        }}
      >
        <DialogContent
          className="
            w-[96vw]
            sm:max-w-[95vw]
            lg:max-w-[1100px]
            max-h-[90vh]
            overflow-hidden
            p-0
            rounded-2xl
          "
        >
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <DialogHeader className="px-6 py-4">
              <DialogTitle className="text-lg">Agent Details</DialogTitle>
              <DialogDescription>Overview, clients & applications</DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-4 sm:px-6 pb-6 pt-4 overflow-y-auto max-h-[calc(90vh-72px)]">
            {!detailAgent ? (
              <div className="py-12 text-center text-muted-foreground">No agent selected.</div>
            ) : detailLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading agent data…</div>
            ) : (
              <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)} className="space-y-6">
                <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="clients">Clients</TabsTrigger>
                  <TabsTrigger value="applications">Applications</TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-stretch lg:justify-between gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                      <Card className="h-full">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Agent</CardTitle>
                          <CardDescription className="truncate">{detailAgent.email}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="font-semibold">{detailAgent.displayName}</div>
                          <div className="text-sm text-muted-foreground">Code: {detailAgent.agent_code ?? '—'}</div>
                          <div className="text-sm text-muted-foreground">Territory: {detailAgent.territory ?? '—'}</div>
                        </CardContent>
                      </Card>

                      <Card className="h-full">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Commission ({selectedMonth || 'month'})</CardTitle>
                          <CardDescription>{((detailAgent.commission_rate ?? 0.1) * 100).toFixed(0)}% of paid</CardDescription>
                        </CardHeader>
                        <CardContent className="text-2xl font-bold">
                          {formatCurrency(detailAgent.expectedCommissionThisMonth ?? 0)}
                        </CardContent>
                      </Card>

                      <Card className="h-full">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Paid ({selectedMonth || 'month'})</CardTitle>
                        </CardHeader>
                        <CardContent className="text-2xl font-bold">
                          {formatCurrency(detailAgent.totalPaidThisMonth ?? 0)}
                        </CardContent>
                      </Card>

                      <Card className="h-full">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Registrations ({selectedMonth || 'month'})</CardTitle>
                        </CardHeader>
                        <CardContent className="text-2xl font-bold">
                          {detailAgent.registrationsThisMonth ?? 0}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="shrink-0">
                      <Button aria-label="Message this agent" onClick={() => openChat(detailAgent)} title="Message this agent">
                        <Send className="h-4 w-4 mr-2" /> Message
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Last 5 Months</CardTitle>
                      <CardDescription>Registrations & payments (with commission)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px] sm:h-[320px]">
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
                </TabsContent>

                {/* Clients tab */}
                <TabsContent value="clients" className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">Clients for {detailAgent.displayName}</h3>
                      <Badge variant="secondary">{agentClients.length}</Badge>
                    </div>
                    <div className="relative w-full sm:w-auto">
                      <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 w-full sm:w-[280px]"
                        placeholder="Search client name"
                        value={agentClientsSearch}
                        onChange={(e) => setAgentClientsSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="py-3">
                      <CardDescription>
                        {agentClientsLoading ? 'Loading clients…' : `${agentClients.length} client(s)`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Last Payment</TableHead>
                              <TableHead className="text-right">Paid (month)</TableHead>
                              <TableHead className="text-right">Commission</TableHead>
                              <TableHead className="text-right">Total (all time)</TableHead>
                              <TableHead className="text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(agentClientsSearch
                              ? agentClients.filter(c =>
                                  c.customerName?.toLowerCase().includes(agentClientsSearch.toLowerCase())
                                )
                              : agentClients
                            ).map((c) => (
                              <TableRow key={c.customerName}>
                                <TableCell className="font-medium">{c.customerName || '—'}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleString('en-ZA') : '—'}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(c.paidThisMonth)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(c.expectedCommissionMonth)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(c.totalPaidAllTime)}</TableCell>
                                <TableCell className="text-center space-x-1">
                                  <Button aria-label="View client history" variant="ghost" size="sm" onClick={() => openClientHistory(c.customerName, detailAgent.user_id)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button aria-label="Open application" variant="ghost" size="sm" onClick={() => openApplicationByName(c.customerName, agentApps)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {!agentClientsLoading && agentClients.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                  No clients found.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Applications tab */}
                <TabsContent value="applications" className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">Applications for {detailAgent.displayName}</h3>
                      <Badge variant="secondary">{agentApps.length}</Badge>
                    </div>
                    <div className="relative w-full sm:w-auto">
                      <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 w-full sm:w-[280px]"
                        placeholder="Search name / ID"
                        value={agentAppsSearch}
                        onChange={(e) => setAgentAppsSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <Card>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>ID Number</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(agentAppsSearch ? agentApps.filter(a => {
                              const q = agentAppsSearch.toLowerCase();
                              return toAppName(a).toLowerCase().includes(q) || (a.id_number || '').toLowerCase().includes(q);
                            }) : agentApps).map(app => (
                              <TableRow key={app.id}>
                                <TableCell className="font-medium">{toAppName(app) || '—'}</TableCell>
                                <TableCell className="font-mono">{app.id_number || '—'}</TableCell>
                                <TableCell>{app.created_at ? new Date(app.created_at).toLocaleDateString('en-ZA') : '—'}</TableCell>
                                <TableCell>{app.status || '—'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(app.total_amount ?? 0)}</TableCell>
                                <TableCell className="text-center space-x-1">
                                  <Button
                                    aria-label="View application"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCurrentApp({
                                        ...app,
                                        firstName: app.name || '',
                                        lastName: app.surname || '',
                                      });
                                      setFormMode('view');
                                      setIsFormOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    aria-label="Edit application"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCurrentApp({
                                        ...app,
                                        firstName: app.name || '',
                                        lastName: app.surname || '',
                                      });
                                      setFormMode('edit');
                                      setIsFormOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {agentApps.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No applications found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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
            setSelectedCustomerAgentId(null);
          }
        }}
      >
        <DialogContent className="w-[96vw] sm:w-[90vw] max-w-5xl max-h-[90vh] overflow-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
            <DialogDescription>Profile & payment history</DialogDescription>
          </DialogHeader>

          {clientDetailLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : clientDetail ? (
            <div className="space-y-6">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total (All-time)</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {formatCurrency(clientDetail.aggregate.totalPaidAllTime)}
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Paid in {selectedMonth || 'month'}</CardTitle></CardHeader>
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
                      onChange={(e) => setSelectedMonth(e.target.value)}
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

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const agentId = selectedCustomerAgentId || detailAgent?.user_id || '';
                    if (!agentId) return;
                    await fetchAgentApplications(agentId);
                    openApplicationByName(clientDetail.customerName, agentApps);
                  }}
                >
                  Open Application
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Select a client to view history.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-page Application Form dialog */}
      <Dialog open={isFormOpen} onOpenChange={(o) => !o && setIsFormOpen(false)}>
        <DialogContent className="w-screen h-screen max-w-none sm:max-w-none p-0 overflow-hidden rounded-none">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{formMode === 'view' ? 'View Application' : 'Edit Application'}</DialogTitle>
            <DialogDescription>{formMode === 'view' ? 'Read-only preview of the application.' : 'Update details and save.'}</DialogDescription>
          </DialogHeader>
          <div className="h-[calc(100vh-88px)] overflow-auto px-4 pb-4">
            {currentApp && (
              <CustomerFormFullPage
                application={currentApp}
                embed
                // @ts-expect-error if CustomerForm supports mode
                mode={formMode}
                onSave={async () => {}}
                onCancel={() => setIsFormOpen(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Agent Dialog ===== */}
      {editingAgent && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent
            className="w-[96vw] sm:max-w-xl max-h-[85vh] p-0 overflow-hidden rounded-xl flex flex-col"
          >
            {/* Sticky header */}
            <DialogHeader className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 py-4">
              <DialogTitle>Edit Agent</DialogTitle>
              <DialogDescription>
                Update agent profile, code, territory, commission & targets.
              </DialogDescription>
            </DialogHeader>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 pt-4">
              {/* Numbers snapshot */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs">Regs (month / all)</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {editingAgent.registrationsThisMonth} / {editingAgent.registrationsAllTime}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs">Paid (month / all)</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {formatCurrency(editingAgent.totalPaidThisMonth)} / {formatCurrency(editingAgent.totalPaidAllTime)}
                  </CardContent>
                </Card>
                <Card className="col-span-2">
                  <CardHeader className="pb-1"><CardTitle className="text-xs">Expected Commission (month)</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {formatCurrency(editingAgent.expectedCommissionThisMonth)}
                  </CardContent>
                </Card>
              </div>

              {/* Form */}
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="displayName" className="text-right">Name</Label>
                  <Input id="displayName" name="displayName" value={(editFormData.displayName as string) || ''} onChange={handleEditChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <Input id="email" name="email" value={(editFormData.email as string) || ''} onChange={handleEditChange} className="col-span-3" type="email" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="agent_code" className="text-right">Agent Code</Label>
                  <Input id="agent_code" name="agent_code" value={(editFormData.agent_code as string) ?? ''} onChange={handleEditChange} className="col-span-3" placeholder="e.g. AGT-001" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="territory" className="text-right">Territory</Label>
                  <Input id="territory" name="territory" value={(editFormData.territory as string) || ''} onChange={handleEditChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="commission_rate_display" className="text-right">Comm. Rate (%)</Label>
                  <Input
                    id="commission_rate_display"
                    name="commission_rate_display"
                    value={(editFormData.commission_rate_display as string | number) ?? 10}
                    onChange={handleEditChange}
                    className="col-span-3" type="number" step="0.01" min={0} max={100}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="target_monthly_registrations" className="text-right">Regs Target</Label>
                  <Input id="target_monthly_registrations" name="target_monthly_registrations" value={(editFormData.target_monthly_registrations as number | string) ?? ''} onChange={handleEditChange} className="col-span-3" type="number" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="target_monthly_sales" className="text-right">Sales Target</Label>
                  <Input id="target_monthly_sales" name="target_monthly_sales" value={(editFormData.target_monthly_sales as number | string) ?? ''} onChange={handleEditChange} className="col-span-3" type="number" step="0.01" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="performance_score" className="text-right">Perf. Score</Label>
                  <Input id="performance_score" name="performance_score" value={(editFormData.performance_score as number | string) ?? ''} onChange={handleEditChange} className="col-span-3" type="number" step="1" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="is_active" className="text-right">Active</Label>
                  <input id="is_active" name="is_active" type="checkbox" checked={!!editFormData.is_active} onChange={handleEditChange} className="col-span-3 h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 z-10 border-t bg-background/80 backdrop-blur px-6 py-3">
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit}>Save changes</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ===== Two-way Chat Dialog ===== */}
      <Dialog open={chatOpen} onOpenChange={(o) => { if (!o) { setChatOpen(false); setChatTarget(null); setChatMessages([]); } }}>
        <DialogContent className="w-[96vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conversation</DialogTitle>
            <DialogDescription>
              {chatTarget ? `With: ${chatTarget.name}` : 'Select an agent to chat'}
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-md h-[360px] overflow-y-auto p-3 space-y-3">
            {chatLoading ? (
              <div className="text-sm text-muted-foreground">Loading thread…</div>
            ) : chatMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground">No messages yet. Say hello 👋</div>
            ) : (
              chatMessages.map((m) => {
                const isMine = m.sender_user_id !== chatTarget?.id;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-md px-3 py-2 ${isMine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                    <div className="mt-1 text-[10px] opacity-70">
                      {new Date(m.created_at).toLocaleString('en-ZA')}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="grid gap-2">
            {Textarea ? (
              <Textarea
                placeholder="Type your message…"
                value={chatInput}
                onChange={(e: any) => setChatInput(e.target.value)}
                rows={3}
              />
            ) : (
              <textarea
                placeholder="Type your message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                rows={3}
                className="w-full border rounded-md p-2 text-sm"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setChatOpen(false)}>Close</Button>
              <Button onClick={sendChat} disabled={chatSending || !chatTarget || !chatInput.trim()}>
                <Send className="h-4 w-4 mr-2" />
                {chatSending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAgentDashboard;
