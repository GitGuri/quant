import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, CreditCard, DollarSign, Filter, Trash2, Pencil, Calendar } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '../AuthPage';
import { useToast } from '@/components/ui/use-toast';

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Ensure this matches your backend URL

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Define types for your data
interface Agent {
  id: string;
  displayName: string;
  email: string;
  user_id: string;
  roles: string[];
  agent_code: string | null;
  territory: string | null;
  commission_rate: number | null;
  // New fields from the agents table
  target_monthly_registrations: number | null;
  target_monthly_sales: number | null;
  date_onboarded: string | null;
  performance_score: number | null;
  is_active: boolean;
}

interface DashboardStats {
  totalAgents: number;
  totalRegistrations: number;
  totalSuccessfulPayments: number;
  totalPendingPayments: number;
  totalFailedPayments: number;
  totalCommissionEarned: number;
}

interface ChartDataPoint {
  month: string;
  registrations: number;
  payments: number;
}

const SuperAgentDashboard = () => {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const { toast } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Agent | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  // State for Edit Dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Agent>>({});

  // State for Delete Dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const fetchData = async () => {
    if (!isAuthenticated || !token) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Agents (Simulating a richer response with all fields)
      // NOTE: The backend endpoint provided by the user does not return all fields, so we're mocking the response to demonstrate the UI.
      // Your actual backend would need to be updated to return these fields.
      const agentsResponse = await fetch(`${API_BASE_URL}/api/my-agents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!agentsResponse.ok) throw new Error(`Failed to fetch agents: ${agentsResponse.status}`);
      const agentsDataRaw: Agent[] = await agentsResponse.json();
      const agentsData = agentsDataRaw.map(agent => ({
        ...agent,
        target_monthly_registrations: Math.floor(Math.random() * 50) + 10,
        target_monthly_sales: parseFloat((Math.random() * 10000 + 500).toFixed(2)),
        date_onboarded: new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)).toISOString(),
        performance_score: parseFloat((Math.random() * 100).toFixed(2)),
        is_active: Math.random() > 0.1,
      }));
      setAgents(agentsData);

      // 2. Fetch Dashboard Stats
      const statsResponse = await fetch(`${API_BASE_URL}/api/super-agent/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!statsResponse.ok) throw new Error(`Failed to fetch stats: ${statsResponse.status}`);
      const statsData: DashboardStats = await statsResponse.json();
      setStats(statsData);

      // 3. Fetch Chart Data
      const chartResponse = await fetch(`${API_BASE_URL}/api/super-agent/dashboard/chart-data?period=last_5_months`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!chartResponse.ok) throw new Error(`Failed to fetch chart data: ${chartResponse.status}`);
      const chartDataRaw: ChartDataPoint[] = await chartResponse.json();
      setChartData(chartDataRaw);

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError((err instanceof Error ? err.message : 'An error occurred while fetching data.'));
      toast({
        title: "Fetch Error",
        description: (err instanceof Error ? err.message : 'Failed to load dashboard data.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated, token]);

  const handleSort = (key: keyof Agent) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const aValue = a[sortConfig.key!] as any;
    const bValue = b[sortConfig.key!] as any;

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
    if (bValue == null) return sortConfig.direction === 'asc' ? 1 : -1;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    }

    const aStr = String(aValue);
    const bStr = String(bValue);
    if (aStr < bStr) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aStr > bStr) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const filteredAgents = sortedAgents.filter(agent =>
    agent.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (agent.agent_code && agent.agent_code.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Prepare Chart Data for Chart.js
  const barChartData = {
    labels: chartData.map(d => d.month),
    datasets: [
      {
        label: 'Total Registrations',
        data: chartData.map(d => d.registrations),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  const lineChartData = {
    labels: chartData.map(d => d.month),
    datasets: [
      {
        label: 'Total Successful Payments',
        data: chartData.map(d => d.payments),
        fill: false,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        tension: 0.1,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Monthly Registrations (All Agents)' },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Monthly Successful Payments Trend' },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  // Handle Edit/Save functionality
  const handleEditClick = (agent: Agent) => {
    setEditingAgent(agent);
    setEditFormData({ ...agent });
    setIsEditDialogOpen(true);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setEditFormData(prevState => ({
      ...prevState,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingAgent || !token) return;

    try {
      // Placeholder for your backend PATCH endpoint
      // You would implement this on your backend to update the agent details
      const response = await fetch(`${API_BASE_URL}/api/agents/${editingAgent.user_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update agent: ${response.status}`);
      }

      // Optimistically update the local state
      setAgents(agents.map(agent =>
        agent.user_id === editingAgent.user_id ? { ...agent, ...editFormData } as Agent : agent
      ));
      setIsEditDialogOpen(false);
      toast({
        title: "Success!",
        description: "Agent details updated successfully.",
      });
    } catch (err) {
      console.error("Error updating agent:", err);
      toast({
        title: "Update Error",
        description: (err instanceof Error ? err.message : 'Failed to update agent details.'),
        variant: "destructive",
      });
    }
  };

  // Handle Delete functionality
  const handleDeleteClick = (agent: Agent) => {
    setDeletingAgent(agent);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingAgent || !token) return;

    try {
      // Placeholder for your backend DELETE endpoint
      // You would implement this on your backend to delete the agent
      const response = await fetch(`${API_BASE_URL}/api/agents/${deletingAgent.user_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete agent: ${response.status}`);
      }

      // Update the local state to remove the agent
      setAgents(agents.filter(agent => agent.user_id !== deletingAgent.user_id));
      setIsDeleteDialogOpen(false);
      setDeletingAgent(null);
      toast({
        title: "Success!",
        description: "Agent deleted successfully.",
      });
    } catch (err) {
      console.error("Error deleting agent:", err);
      toast({
        title: "Deletion Error",
        description: (err instanceof Error ? err.message : 'Failed to delete agent.'),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <Header title="Super Agent Dashboard" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-blue-500 border-opacity-25"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <Header title="Super Agent Dashboard" />
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <Header title="Super Agent Dashboard" />
      <div className="space-y-6">
        {/* Overall KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalAgents ?? 'N/A'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalRegistrations ?? 'N/A'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Successful Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.totalSuccessfulPayments ?? 'N/A'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending/Failed</CardTitle>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats?.totalPendingPayments ?? 0) + (stats?.totalFailedPayments ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-yellow-600">{stats?.totalPendingPayments ?? 0} Pending</span> /{' '}
                <span className="text-red-600">{stats?.totalFailedPayments ?? 0} Failed</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commission (R)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R{(stats?.totalCommissionEarned ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
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
              <CardDescription>Successful payments trend over the last 5 months.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <Line data={lineChartData} options={lineChartOptions} />
            </CardContent>
          </Card>
        </div>

        {/* Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Performance</CardTitle>
            <CardDescription>A detailed view of each agent's contributions.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex items-center py-4">
              <Input
                placeholder="Filter agents by name, email, or code..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="overflow-x-auto max-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Agent ID</TableHead>
                    <TableHead onClick={() => handleSort('agent_code')} className="cursor-pointer min-w-[120px]">
                      Code {sortConfig.key === 'agent_code' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('displayName')} className="cursor-pointer min-w-[150px]">
                      Name {sortConfig.key === 'displayName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('email')} className="cursor-pointer min-w-[200px]">
                      Email {sortConfig.key === 'email' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('territory')} className="cursor-pointer min-w-[120px]">
                      Territory {sortConfig.key === 'territory' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('commission_rate')} className="cursor-pointer text-right min-w-[120px]">
                      Comm. Rate {sortConfig.key === 'commission_rate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('target_monthly_registrations')} className="text-right cursor-pointer min-w-[120px]">
                      Regs. Target {sortConfig.key === 'target_monthly_registrations' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('target_monthly_sales')} className="text-right cursor-pointer min-w-[120px]">
                      Sales Target {sortConfig.key === 'target_monthly_sales' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('performance_score')} className="text-right cursor-pointer min-w-[120px]">
                      Perf. Score {sortConfig.key === 'performance_score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('is_active')} className="text-center cursor-pointer min-w-[100px]">
                      Status {sortConfig.key === 'is_active' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead onClick={() => handleSort('date_onboarded')} className="text-center cursor-pointer min-w-[120px]">
                      Onboarded {sortConfig.key === 'date_onboarded' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead className="text-center min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgents.length > 0 ? (
                    filteredAgents.map((agent) => (
                      <TableRow key={agent.user_id}>
                        <TableCell className="font-medium text-xs">{(agent.user_id).substring(0, 8)}</TableCell>
                        <TableCell className="font-mono text-sm">{agent.agent_code || 'N/A'}</TableCell>
                        <TableCell className="font-medium">{agent.displayName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{agent.email}</TableCell>
                        <TableCell className="text-sm">{agent.territory || 'N/A'}</TableCell>
                        <TableCell className="text-right text-sm">
                          {agent.commission_rate !== null ? `${(agent.commission_rate * 100).toFixed(2)}%` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">{agent.target_monthly_registrations ?? 'N/A'}</TableCell>
                        <TableCell className="text-right">R{(agent.target_monthly_sales ?? 0).toLocaleString('en-ZA')}</TableCell>
                        <TableCell className="text-right">{agent.performance_score ?? 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block w-3 h-3 rounded-full ${agent.is_active ? 'bg-green-500' : 'bg-red-500'}`} title={agent.is_active ? 'Active' : 'Inactive'}></span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {agent.date_onboarded ? new Date(agent.date_onboarded).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell className="text-center space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditClick(agent)}>
                            <Pencil className="w-4 h-4 text-gray-500" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(agent)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-4 text-muted-foreground">
                        No agents found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Agent Dialog */}
      {editingAgent && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Agent</DialogTitle>
              <DialogDescription>
                Make changes to the agent's profile here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="displayName" className="text-right">
                  Name
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  value={editFormData.displayName || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  value={editFormData.email || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                  type="email"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="territory" className="text-right">
                  Territory
                </Label>
                <Input
                  id="territory"
                  name="territory"
                  value={editFormData.territory || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="commission_rate" className="text-right">
                  Comm. Rate (%)
                </Label>
                <Input
                  id="commission_rate"
                  name="commission_rate"
                  value={editFormData.commission_rate !== null && editFormData.commission_rate !== undefined ? (editFormData.commission_rate * 100).toString() : ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setEditFormData(prevState => ({ ...prevState, commission_rate: isNaN(value) ? null : value / 100 }));
                  }}
                  className="col-span-3"
                  type="number"
                  step="0.01"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="target_monthly_registrations" className="text-right">
                  Regs. Target
                </Label>
                <Input
                  id="target_monthly_registrations"
                  name="target_monthly_registrations"
                  value={editFormData.target_monthly_registrations || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                  type="number"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="target_monthly_sales" className="text-right">
                  Sales Target
                </Label>
                <Input
                  id="target_monthly_sales"
                  name="target_monthly_sales"
                  value={editFormData.target_monthly_sales || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                  type="number"
                  step="0.01"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="performance_score" className="text-right">
                  Perf. Score
                </Label>
                <Input
                  id="performance_score"
                  name="performance_score"
                  value={editFormData.performance_score || ''}
                  onChange={handleEditChange}
                  className="col-span-3"
                  type="number"
                  step="0.01"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsEditDialogOpen(false)} variant="ghost">Cancel</Button>
              <Button onClick={handleSaveEdit}>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Agent Confirmation Dialog */}
      {deletingAgent && (
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the agent <strong>{deletingAgent.displayName}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setIsDeleteDialogOpen(false)} variant="ghost">Cancel</Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SuperAgentDashboard;