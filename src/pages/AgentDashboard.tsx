// src/pages/AgentDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/AuthPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp, CreditCard, Calendar, Target } from 'lucide-react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const AgentDashboard = () => {
  const { userName } = useAuth();
  // --- Hardcoded Data for Agent Dashboard ---
  const agentStats = {
    totalRegistrations: 42,
    successfulPayments: 38,
    pendingPayments: 3,
    failedPayments: 1,
    monthlyTarget: 50,
    monthlyRegistrations: [5, 7, 10, 8, 12], // Last 5 months
    paymentStatusData: {
      successful: 38,
      pending: 3,
      failed: 1,
    },
  };

  const barChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Registrations',
        data: agentStats.monthlyRegistrations,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Monthly Registrations' },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
            stepSize: 5 // Make Y-axis increments clearer
        }
      },
    },
  };

  const doughnutChartData = {
    labels: ['Successful', 'Pending', 'Failed'],
    datasets: [
      {
        data: [
          agentStats.paymentStatusData.successful,
          agentStats.paymentStatusData.pending,
          agentStats.paymentStatusData.failed,
        ],
        backgroundColor: ['#4CAF50', '#FFC107', '#F44336'], // Green, Amber, Red
        borderColor: ['#388E3C', '#FFA000', '#D32F2F'],
        borderWidth: 1,
      },
    ],
  };

  const doughnutChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Payment Status Breakdown' },
    },
    cutout: '50%', // Make it a doughnut, not a pie
  };

  const progressPercentage = Math.round((agentStats.totalRegistrations / agentStats.monthlyTarget) * 100);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {userName || 'Agent'}!</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agentStats.totalRegistrations}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{agentStats.successfulPayments}</div>
            <p className="text-xs text-muted-foreground">Processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Target</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agentStats.monthlyTarget}</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${progressPercentage > 100 ? 100 : progressPercentage}%` }}
              ></div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progressPercentage}% Achieved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending/Failed</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agentStats.pendingPayments + agentStats.failedPayments}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{agentStats.pendingPayments} Pending</span> /{' '}
              <span className="text-red-600">{agentStats.failedPayments} Failed</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Registration Trend</CardTitle>
            <CardDescription>Your registration activity over the last 5 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <Bar data={barChartData} options={barChartOptions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Distribution of payment outcomes for your clients.</CardDescription>
          </CardHeader>
          <CardContent>
            <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity / Notes Section (Placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest actions and updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li className="flex items-center">
              <Badge className="mr-2">Info</Badge>
              <span>You registered a new client (ID: ZP12345) 2 hours ago.</span>
            </li>
            <li className="flex items-center">
              <Badge variant="secondary" className="mr-2">Payment</Badge>
              <span>Payment for client (ID: ZP12340) was successfully processed.</span>
            </li>
            <li className="flex items-center">
              <Badge variant="outline" className="mr-2">Update</Badge>
              <span>Your monthly target has been updated to 50 registrations.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentDashboard;