import { useState, useEffect, useCallback } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, DollarSign, Divide, Loader2 } from 'lucide-react'; // Added DollarSign, Divide for icons
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../AuthPage'; // Corrected import path for useAuth

const API_BASE_URL = 'https://quantnow.onrender.com'; // Changed to localhost:3000 based on previous context

interface StatResponse {
    count?: number; // For count-based stats like clients
    value?: number; // For value-based stats like revenue/expenses
    previousCount?: number;
    previousValue?: number;
    changePercentage?: number;
    changeType?: 'increase' | 'decrease' | 'neutral';
}

// Update component props to accept a date range
export function StatsCards({ startDate, endDate }: { startDate: Date | null, endDate: Date | null }) {
    const [clientStats, setClientStats] = useState<StatResponse | null>(null);
    const [revenueStats, setRevenueStats] = useState<StatResponse | null>(null); // New state for Revenue
    const [expenseStats, setExpenseStats] = useState<StatResponse | null>(null); // New state for Expenses
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { isAuthenticated } = useAuth(); // Get authentication status
    const token = localStorage.getItem('token'); // Retrieve the token

    // Helper function to format date for API
    const formatDateForApi = (date: Date | null): string | null => {
        if (!date) return null;
        if (isNaN(date.getTime())) {
            console.warn("Invalid Date object provided:", date);
            return null;
        }
        return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    };

    // Construct query parameters for the date range
    const getPeriodQueryParams = useCallback(() => {
        const params = new URLSearchParams();
        const formattedStartDate = formatDateForApi(startDate);
        const formattedEndDate = formatDateForApi(endDate);

        if (formattedStartDate) {
            params.append('startDate', formattedStartDate);
        }
        if (formattedEndDate) {
            params.append('endDate', formattedEndDate);
        }
        return params.toString() ? `?${params.toString()}` : '';
    }, [startDate, endDate]);

    const fetchStats = useCallback(async () => {
        if (!token) {
            console.warn('No token found. User is not authenticated for stats cards.');
            setClientStats(null);
            setRevenueStats(null);
            setExpenseStats(null);
            setIsLoading(false);
            setError('Please log in to view statistics.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const queryParams = getPeriodQueryParams(); // Use the new helper
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`, // Include the JWT token
            };

            const [
                clientsRes,
                revenueRes, // New fetch for Revenue
                expensesRes, // New fetch for Expenses
            ] = await Promise.all([
                fetch(`${API_BASE_URL}/api/stats/clients${queryParams}`, { headers }),
                fetch(`${API_BASE_URL}/api/stats/revenue${queryParams}`, { headers }), // New API call
                fetch(`${API_BASE_URL}/api/stats/expenses${queryParams}`, { headers }), // New API call
            ]);

            // Check each response individually
            if (!clientsRes.ok) {
                const errorData = await clientsRes.json();
                throw new Error(errorData.error || `Failed to fetch clients stats: ${clientsRes.status}`);
            }
            if (!revenueRes.ok) {
                const errorData = await revenueRes.json();
                throw new Error(errorData.error || `Failed to fetch revenue stats: ${revenueRes.status}`);
            }
            if (!expensesRes.ok) {
                const errorData = await expensesRes.json();
                throw new Error(errorData.error || `Failed to fetch expenses stats: ${expensesRes.status}`);
            }

            const clientData: StatResponse = await clientsRes.json();
            const revenueData: StatResponse = await revenueRes.json();
            const expensesData: StatResponse = await expensesRes.json();

            setClientStats(clientData);
            setRevenueStats(revenueData);
            setExpenseStats(expensesData);

        } catch (err: any) {
            console.error('Error fetching stats:', err);
            setError(err.message || 'Failed to load dashboard statistics.');
            setClientStats(null); // Clear stats on error
            setRevenueStats(null);
            setExpenseStats(null);
        } finally {
            setIsLoading(false);
        }
    }, [getPeriodQueryParams, token]);

    useEffect(() => {
        if (isAuthenticated && token) {
            fetchStats();
        } else {
            setClientStats(null);
            setRevenueStats(null);
            setExpenseStats(null);
            setIsLoading(false);
            setError('Please log in to view statistics.');
        }
    }, [fetchStats, isAuthenticated, token]);

    // Helper to format change string
    const formatChange = (percentage: number | undefined, type: 'increase' | 'decrease' | 'neutral' | undefined) => {
        if (percentage === undefined || type === undefined) {
            return '→ 0.00%';
        }
        const symbol = type === 'increase' ? '↑' : type === 'decrease' ? '↓' : '→';
        return `${symbol} ${Math.abs(percentage).toFixed(2)}%`;
    };

    const stats = [
        {
            title: 'Clients',
            value: clientStats?.count !== undefined ? clientStats.count.toLocaleString() : 'Loading...',
            change: formatChange(clientStats?.changePercentage, clientStats?.changeType),
            changeType: clientStats?.changeType || 'neutral',
            icon: Users,
            color: 'text-blue-600'
        },
        {
            title: 'Revenue',
            value: revenueStats?.value !== undefined ? `R${revenueStats.value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : 'Loading...',
            change: formatChange(revenueStats?.changePercentage, revenueStats?.changeType),
            changeType: revenueStats?.changeType || 'neutral',
            icon: DollarSign, // Using DollarSign for revenue
            color: 'text-green-600'
        },
        {
            title: 'Expenses',
            value: expenseStats?.value !== undefined ? `R${expenseStats.value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : 'Loading...',
            change: formatChange(expenseStats?.changePercentage, expenseStats?.changeType),
            // For expenses, an 'increase' in value usually means a negative trend, so we can adjust the badge color logic here
            changeType: expenseStats?.changeType === 'increase' ? 'decrease' : expenseStats?.changeType === 'decrease' ? 'increase' : 'neutral',
            icon: Divide, // Using Divide for expenses
            color: 'text-red-600' // Red for expenses
        }
    ];

    if (isLoading) {
        return (
            <div className='flex justify-center items-center h-40'>
                <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                <span className='ml-2 text-gray-600'>Loading statistics...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className='text-center text-red-500 p-4 border border-red-300 rounded-md'>
                <p>Error: {error}</p>
                <Button onClick={fetchStats} className='mt-2'>Retry</Button>
            </div>
        );
    }

    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'> {/* Adjusted grid columns */}
            {stats.map((stat, index) => (
                <motion.div
                    key={stat.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                    <Card>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>
                                {stat.title}
                            </CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className='text-2xl font-bold'>{stat.value}</div>
                            <Badge
                                variant={
                                    stat.changeType === 'increase' ? 'default' : stat.changeType === 'decrease' ? 'destructive' : 'secondary'
                                }
                                className='mt-1'
                            >
                                {stat.change}
                            </Badge>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
}
