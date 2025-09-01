// src/pages/SuperAgentDashboard.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import { Badge } from '@/components/ui/badge'; // Not used in this version
import { Users, TrendingUp, CreditCard, DollarSign, Filter } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement, // <-- MUST BE IMPORTED FOR LINE CHARTS
  Title,
  Tooltip,
  Legend,
} from 'chart.js'; // Make sure this import is present
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
// import { Button } from '@/components/ui/button'; // Not used in this version
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Not used in this version

// --- REGISTER ELEMENTS ---
// Make sure PointElement is included in the register call
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement, // <-- MUST BE REGISTERED FOR LINE CHARTS
  Title,
  Tooltip,
  Legend
);

const SuperAgentDashboard = () => {
  // --- Hardcoded Data for Super Agent Dashboard ---
  const overallStats = {
    totalAgents: 12,
    totalRegistrations: 485,
    totalSuccessfulPayments: 450,
    totalPendingPayments: 25,
    totalFailedPayments: 10,
    totalCommissionEarned: 12500.0, // Example value
    monthlyRegistrations: [85, 92, 110, 105, 93], // Last 5 months
    monthlyPayments: [420, 445, 480, 460, 445], // Last 5 months
  };

  const agentsData = [
    { id: 1, name: 'Agent Alpha', registrations: 42, payments: 38, pending: 3, failed: 1, commission: 1200.0 },
    { id: 2, name: 'Agent Beta', registrations: 38, payments: 35, pending: 2, failed: 1, commission: 1100.0 },
    { id: 3, name: 'Agent Gamma', registrations: 50, payments: 48, pending: 1, failed: 1, commission: 1400.0 },
    { id: 4, name: 'Agent Delta', registrations: 35, payments: 32, pending: 2, failed: 1, commission: 1000.0 },
    { id: 5, name: 'Agent Epsilon', registrations: 45, payments: 42, pending: 2, failed: 1, commission: 1250.0 },
    // ... more agents
  ];

  const barChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Total Registrations',
        data: overallStats.monthlyRegistrations,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Monthly Registrations (All Agents)' },
    },
    scales: {
      y: {
        beginAtZero: true,
         ticks: {
            stepSize: 20 // Make Y-axis increments clearer
        }
      },
    },
  };

  const lineChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Total Successful Payments',
        data: overallStats.monthlyPayments,
        fill: false,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        tension: 0.1, // Smooth line
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Monthly Successful Payments Trend' },
    },
    scales: {
      y: {
        beginAtZero: true,
         ticks: {
            stepSize: 50 // Make Y-axis increments clearer
        }
      },
    },
  };

  // --- State for Filtering ---
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof typeof agentsData[0] | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const handleSort = (key: keyof typeof agentsData[0]) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAgents = [...agentsData];
  if (sortConfig.key) {
    sortedAgents.sort((a, b) => {
      // @ts-ignore - Simple sorting, assumes all values are comparable
      if (a[sortConfig.key!] < b[sortConfig.key!]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      // @ts-ignore
      if (a[sortConfig.key!] > b[sortConfig.key!]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  const filteredAgents = sortedAgents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Super Agent Dashboard</h1>
        <p className="text-muted-foreground">Overview of your team's performance.</p>
      </div>

      {/* Overall KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalAgents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalRegistrations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overallStats.totalSuccessfulPayments}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending/Failed</CardTitle>
             <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overallStats.totalPendingPayments + overallStats.totalFailedPayments}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{overallStats.totalPendingPayments} Pending</span> /{' '}
              <span className="text-red-600">{overallStats.totalFailedPayments} Failed</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission (R)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R{overallStats.totalCommissionEarned.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Registration Trend</CardTitle>
            <CardDescription>Aggregate registrations over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <Bar data={barChartData} options={barChartOptions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payments Trend</CardTitle>
            <CardDescription>Successful payments trend over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent>
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
              placeholder="Filter agents..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="max-w-sm"
            />
            {/* You can add more filters here (e.g., sort by commission) */}
            {/* <Select>
              <SelectTrigger className="w-[180px] ml-2">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="registrations">Registrations</SelectItem>
                <SelectItem value="payments">Payments</SelectItem>
                <SelectItem value="commission">Commission</SelectItem>
              </SelectContent>
            </Select> */}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Agent ID</TableHead>
                <TableHead onClick={() => handleSort('name')} className="cursor-pointer">
                  Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead onClick={() => handleSort('registrations')} className="cursor-pointer text-right">
                  Registrations {sortConfig.key === 'registrations' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead onClick={() => handleSort('payments')} className="cursor-pointer text-right">
                  Payments {sortConfig.key === 'payments' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead onClick={() => handleSort('pending')} className="cursor-pointer text-right">
                  Pending {sortConfig.key === 'pending' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead onClick={() => handleSort('failed')} className="cursor-pointer text-right">
                  Failed {sortConfig.key === 'failed' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead onClick={() => handleSort('commission')} className="cursor-pointer text-right">
                  Commission (R) {sortConfig.key === 'commission' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">A-{agent.id.toString().padStart(3, '0')}</TableCell>
                  <TableCell>{agent.name}</TableCell>
                  <TableCell className="text-right">{agent.registrations}</TableCell>
                  <TableCell className="text-right text-green-600">{agent.payments}</TableCell>
                  <TableCell className="text-right text-yellow-600">{agent.pending}</TableCell>
                  <TableCell className="text-right text-red-600">{agent.failed}</TableCell>
                  <TableCell className="text-right font-medium">
                    R{agent.commission.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAgentDashboard;