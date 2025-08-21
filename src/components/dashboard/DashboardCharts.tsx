import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';
import HighchartsSunburst from 'highcharts/modules/sunburst'; // Import sunburst module
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../AuthPage'; // Import useAuth

// Initialize the sunburst module for Highcharts
HighchartsSunburst(Highcharts);

const API_BASE_URL = 'https://quantnow.onrender.com';

interface RevenueDataPoint {
  month: string;
  profit: number;
  expenses: number;
  revenue: number;
}

// Data structure for the Sunburst Chart (example, adjust based on actual backend data)
interface SunburstDataPoint {
  id: string;
  parent?: string;
  name: string;
  value?: number;
  color?: string; // Optional: for custom colors if needed
}

// Update component props to accept a date range
export function DashboardCharts({ startDate, endDate }: { startDate: Date | null, endDate: Date | null }) {
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [sunburstData, setSunburstData] = useState<SunburstDataPoint[]>([]); // New state for sunburst
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(true);
  const [isLoadingSunburst, setIsLoadingSunburst] = useState(true); // New loading state
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [sunburstError, setSunburstError] = useState<string | null>(null); // New error state

  const { isAuthenticated } = useAuth(); // Get authentication status
  const token = localStorage.getItem('token'); // Retrieve the token as specified

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

  // Fetch Revenue Trend Data
  const fetchRevenueData = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for revenue data.');
      setRevenueData([]);
      setIsLoadingRevenue(false);
      return;
    }

    setIsLoadingRevenue(true);
    setRevenueError(null);
    try {
      const queryParams = getPeriodQueryParams();
      const url = `${API_BASE_URL}/api/charts/revenue-trend${queryParams}`;
      console.log('Fetching revenue data from URL:', url);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: RevenueDataPoint[] = await response.json();
      setRevenueData(data);
    } catch (err: any) {
      console.error('Error fetching revenue data:', err);
      setRevenueError(err.message || 'Failed to load revenue data.');
    } finally {
      setIsLoadingRevenue(false);
    }
  }, [getPeriodQueryParams, token]);

  // Fetch Sunburst Data (New)
  const fetchSunburstData = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for sunburst data.');
      setSunburstData([]);
      setIsLoadingSunburst(false);
      return;
    }

    setIsLoadingSunburst(true);
    setSunburstError(null);
    try {
      const queryParams = getPeriodQueryParams();
      // You'll need to create this API endpoint on your backend
      const url = `${API_BASE_URL}/api/charts/sales-expenses-sunburst${queryParams}`;
      console.log('Fetching sunburst data from URL:', url);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: SunburstDataPoint[] = await response.json();
      setSunburstData(data);
    } catch (err: any) {
      console.error('Error fetching sunburst data:', err);
      setSunburstError(err.message || 'Failed to load sales and expenses data.');
    } finally {
      setIsLoadingSunburst(false);
    }
  }, [getPeriodQueryParams, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchRevenueData();
      fetchSunburstData(); // Call the new fetch function
    } else {
      setRevenueData([]);
      setSunburstData([]); // Clear sunburst data as well
      setIsLoadingRevenue(false);
      setIsLoadingSunburst(false); // Set sunburst loading to false
      setRevenueError('Please log in to view charts.');
      setSunburstError('Please log in to view charts.'); // Set sunburst error
    }
  }, [fetchRevenueData, fetchSunburstData, isAuthenticated, token, startDate, endDate]);

  // Generate date range string for titles
  const getDateRangeString = () => {
    const start = startDate ? startDate.toLocaleDateString() : '';
    const end = endDate ? endDate.toLocaleDateString() : '';

    if (start && end && start === end) return `for ${start}`;
    if (start && end) return `from ${start} to ${end}`;
    if (start) return `from ${start}`;
    if (end) return `until ${end}`;
    return ''; // No date range selected
  };

  // Highcharts options for Revenue Trend (unchanged)
  const revenueOptions = {
    title: { text: `Revenue Trend (Profit vs Expenses) ${getDateRangeString()}` },
    xAxis: { categories: revenueData.map(item => item.month) },
    yAxis: { title: { text: 'Amount (ZAR)' } },
    tooltip: { shared: true },
    series: [
      {
        name: 'Profit',
        data: revenueData.map(item => item.profit),
        type: 'line',
        color: '#2563eb'
      },
      {
        name: 'Expenses',
        data: revenueData.map(item => item.expenses),
        type: 'line',
        color: '#10b981'
      },
      {
        name: 'Revenue',
        data: revenueData.map(item => item.revenue),
        type: 'line',
        color: '#f59e0b'
      }
    ]
  };

  // Highcharts options for the new Sunburst Chart
  const sunburstOptions = {
    chart: {
      height: '100%', // Make it fill the card height
      type: 'sunburst' // Set chart type to sunburst
    },
    title: {
      text: `Sales and Expenses ${getDateRangeString()}` // Dynamic title
    },
    subtitle: {
      text: 'Hierarchical view of financial categories'
    },
    series: [{
      type: 'sunburst',
      data: sunburstData, // Use the fetched sunburst data
      allowDrillToNode: true,
      cursor: 'pointer',
      dataLabels: {
        format: '{point.name}',
        filter: {
          property: 'innerArcLength',
          operator: '>',
          value: 16
        },
        style: {
          textOutline: 'none'
        }
      },
      levels: [{
        level: 1,
        levelIs: 'custom', // Corrected syntax here
        colorByPoint: true // Ensures top-level nodes have distinct colors
      }, {
        level: 2,
        colorByPoint: true,
        dataLabels: {
          rotationMode: 'circular'
        }
      }, {
        level: 3,
        colorByPoint: true,
        dataLabels: {
          rotationMode: 'circular'
        }
      }]
    }],
    tooltip: {
      headerFormat: '',
      pointFormat: '<b>{point.name}</b>: {point.value}' // Customize tooltip
    }
  };


  return (
    <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6'>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend (Profit vs Expenses)</CardTitle>
            <CardDescription>
              Monthly financial performance overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRevenue ? (
              <div className='flex justify-center items-center h-60'>
                <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                <span className='ml-2 text-gray-600'>Loading revenue chart...</span>
              </div>
            ) : revenueError ? (
              <div className='text-center text-red-500 p-4 border border-red-300 rounded-md h-60 flex flex-col justify-center items-center'>
                <p>Error: {revenueError}</p>
                <Button onClick={fetchRevenueData} className='mt-2'>Retry</Button>
              </div>
            ) : (
              <HighchartsReact highcharts={Highcharts} options={revenueOptions} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* NEW SUNBURST CHART */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Sales and Expenses</CardTitle>
            <CardDescription>Hierarchical view of financial breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSunburst ? (
              <div className='flex justify-center items-align-center h-60'>
                <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                <span className='ml-2 text-gray-600'>Loading sales and expenses data...</span>
              </div>
            ) : sunburstError ? (
              <div className='text-center text-red-500 p-4 border border-red-300 rounded-md h-60 flex flex-col justify-center items-center'>
                <p>Error: {sunburstError}</p>
                <Button onClick={fetchSunburstData} className='mt-2'>Retry</Button>
              </div>
            ) : (
              <HighchartsReact highcharts={Highcharts} options={sunburstOptions} />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
