import { useState, useEffect, useCallback } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, DollarSign, Divide, TrendingUp, TrendingDown, Coins, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../AuthPage';

const API_BASE_URL = 'http://localhost:3000https://quantnow-cu1v.onrender.com'; // Ensure this matches your backend URL

interface StatResponse {
    count?: number;
    value?: number;
    previousCount?: number;
    previousValue?: number;
    changePercentage?: number;
    changeType?: 'increase' | 'decrease' | 'neutral';
}

export function StatsCards({ startDate, endDate }: { startDate: Date | null, endDate: Date | null }) {
    const [clientStats, setClientStats] = useState<StatResponse | null>(null);
    const [revenueStats, setRevenueStats] = useState<StatResponse | null>(null);
    const [expenseStats, setExpenseStats] = useState<StatResponse | null>(null);
    const [profitabilityStats, setProfitabilityStats] = useState<StatResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { isAuthenticated } = useAuth();
    const token = localStorage.getItem('token');

    const formatDateForApi = (date: Date | null): string | null => {
        if (!date) return null;
        if (isNaN(date.getTime())) {
            console.warn("Invalid Date object provided:", date);
            return null;
        }
        return date.toISOString().split('T')[0];
    };

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
            setIsLoading(false);
            setError('Please log in to view statistics.');
            // Set stats to null or initial state
            setClientStats(null);
            setRevenueStats(null);
            setExpenseStats(null);
            setProfitabilityStats(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const queryParams = getPeriodQueryParams();
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };

            // --- Fetch all stats concurrently ---
            const [
                // Note: The /api/stats/clients endpoint might need adjustment if it relied on transactions
                // For now, we'll keep it, but it might not reflect journal-based data accurately.
                clientsRes,
                revenueRes,
                expensesRes,
                profitabilityRes,
            ] = await Promise.all([
                fetch(`${API_BASE_URL}/api/stats/clients${queryParams}`, { headers }),
                fetch(`${API_BASE_URL}/api/stats/revenue${queryParams}`, { headers }),
                fetch(`${API_BASE_URL}/api/stats/expenses${queryParams}`, { headers }),
                fetch(`${API_BASE_URL}/api/stats/profitability${queryParams}`, { headers }),
            ]);

            // --- Process Client Stats ---
            let clientData: StatResponse = { count: 0 }; // Default
            if (clientsRes.ok) {
                clientData = await clientsRes.json();
            } else {
                console.error('Failed to fetch client stats:', await clientsRes.text());
                // Optionally set an error state specifically for clients if needed
                // For now, we'll just use the default or null
            }
            setClientStats(clientData);

            // --- Process Revenue Stats ---
            if (!revenueRes.ok) {
                const errorData = await revenueRes.json().catch(() => ({})); // Handle potential JSON parse errors
                throw new Error(errorData.error || `Failed to fetch revenue stats: ${revenueRes.status} ${revenueRes.statusText}`);
            }
            const revenueData: StatResponse = await revenueRes.json();
            setRevenueStats(revenueData);

            // --- Process Expenses Stats ---
            if (!expensesRes.ok) {
                const errorData = await expensesRes.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch expenses stats: ${expensesRes.status} ${expensesRes.statusText}`);
            }
            const expensesData: StatResponse = await expensesRes.json();
            setExpenseStats(expensesData);

            // --- Process Profitability Stats ---
            if (!profitabilityRes.ok) {
                const errorData = await profitabilityRes.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch profitability stats: ${profitabilityRes.status} ${profitabilityRes.statusText}`);
            }
            const profitabilityData: StatResponse = await profitabilityRes.json();
            setProfitabilityStats(profitabilityData);

        } catch (err: any) {
            console.error('Error fetching stats:', err);
            setError(err.message || 'Failed to load dashboard statistics.');
            // Clear stats on error
            setClientStats(null);
            setRevenueStats(null);
            setExpenseStats(null);
            setProfitabilityStats(null);
        } finally {
            setIsLoading(false);
        }
    }, [getPeriodQueryParams, token]); // Dependencies are correct

    useEffect(() => {
        if (isAuthenticated && token) {
            fetchStats();
        } else {
            // Clear data and set state if not authenticated
            setIsLoading(false);
            setError('Please log in to view statistics.');
            setClientStats(null);
            setRevenueStats(null);
            setExpenseStats(null);
            setProfitabilityStats(null);
        }
    }, [fetchStats, isAuthenticated, token]); // Dependencies are correct

    const formatChange = (percentage: number | undefined, type: 'increase' | 'decrease' | 'neutral' | undefined) => {
        if (percentage === undefined || type === undefined) {
            return '→ 0.00%';
        }
        const symbol = type === 'increase' ? '↑' : type === 'decrease' ? '↓' : '→';
        // Ensure percentage is a number before calling toFixed
        const formattedPercentage = typeof percentage === 'number' ? Math.abs(percentage).toFixed(2) : '0.00';
        return `${symbol} ${formattedPercentage}%`;
    };

    // Prepare data for rendering cards
    const stats = [
        {
            title: 'Clients',
            value: clientStats?.count !== undefined ? clientStats.count.toLocaleString() : 'N/A', // Or 'Loading...' if preferred
            change: formatChange(clientStats?.changePercentage, clientStats?.changeType),
            changeType: clientStats?.changeType || 'neutral',
            icon: Users,
            color: 'text-blue-600'
        },
        {
            title: 'Revenue',
            value: revenueStats?.value !== undefined ? `R${Number(revenueStats.value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
            change: formatChange(revenueStats?.changePercentage, revenueStats?.changeType),
            changeType: revenueStats?.changeType || 'neutral',
            icon: DollarSign,
            color: 'text-green-600'
        },
        {
            title: 'Expenses',
            value: expenseStats?.value !== undefined ? `R${Number(expenseStats.value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
            // Expenses change type logic: An increase in expenses is often seen negatively
            // So, if the backend reports 'increase' for expenses, we might want to show it as 'decrease' visually (or just keep it)
            // Let's keep the backend's logic for now, but be aware.
            change: formatChange(expenseStats?.changePercentage, expenseStats?.changeType),
            changeType: expenseStats?.changeType || 'neutral', // Keep backend logic
            icon: Divide, // Consider Expense icon if available
            color: 'text-red-600'
        },
        {
            title: 'Profitability',
            value: profitabilityStats?.value !== undefined ? `R${Number(profitabilityStats.value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
            change: formatChange(profitabilityStats?.changePercentage, profitabilityStats?.changeType),
            changeType: profitabilityStats?.changeType || 'neutral',
            icon: Coins, // TrendingUp/Down might also be suitable
            // Color based on profitability change or value?
            color: profitabilityStats?.changeType === 'increase' ? 'text-green-600' :
                   profitabilityStats?.changeType === 'decrease' ? 'text-red-600' : 'text-gray-600'
            // Alternative: Color based on profit value itself (positive/negative)
            // color: (profitabilityStats?.value !== undefined && profitabilityStats.value >= 0) ? 'text-green-600' : 'text-red-600'
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
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
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
                            {/* Only show the badge if there's a meaningful change to display */}
                            {(stat.change && stat.change !== '→ 0.00%') || stat.changeType !== 'neutral' ? (
                                <Badge
                                    variant={
                                        stat.changeType === 'increase' ? 'default' :
                                        stat.changeType === 'decrease' ? 'destructive' : 'secondary'
                                    }
                                    className='mt-1'
                                >
                                    {stat.change}
                                </Badge>
                            ) : null}
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
}