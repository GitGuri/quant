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
import HighchartsPareto from 'highcharts/modules/pareto'; // Import pareto module
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../AuthPage';

// Initialize Highcharts modules
HighchartsSunburst(Highcharts);
HighchartsPareto(Highcharts);

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

interface RevenueDataPoint {
  month: string;
  profit: number;
  expenses: number;
  revenue: number;
}

// Data structure for the Sunburst Chart
interface SunburstDataPoint {
  id: string;
  parent?: string;
  name: string;
  value?: number;
  color?: string;
}

// Data structure for Pareto chart (Revenue by Product)
interface ParetoDataPoint {
  id: string;
  name: string;
  value: number;
}

export function DashboardCharts({ startDate, endDate }: { startDate: Date | null, endDate: Date | null }) {
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [sunburstData, setSunburstData] = useState<SunburstDataPoint[]>([]); // State for Sunburst
  const [paretoData, setParetoData] = useState<ParetoDataPoint[]>([]); // New state for Pareto
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(true);
  const [isLoadingSunburst, setIsLoadingSunburst] = useState(true); // Loading state for Sunburst
  const [isLoadingPareto, setIsLoadingPareto] = useState(true); // New loading state for Pareto
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [sunburstError, setSunburstError] = useState<string | null>(null); // Error state for Sunburst
  const [paretoError, setParetoError] = useState<string | null>(null); // New error state for Pareto

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

  // Fetch Sunburst Data (Re-introduced)
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
      // This endpoint needs to be implemented in your backend if it doesn't exist
      const url = `${API_BASE_URL}/api/charts/sales-expenses-sunburst${queryParams}`;
      console.log('Fetching sunburst data from URL:', url);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        // Fallback or error if endpoint not implemented
        throw new Error(`Endpoint not implemented or HTTP error! status: ${response.status}`);
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

  // Fetch Pareto Data (New function)
  const fetchParetoData = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for pareto data.');
      setParetoData([]);
      setIsLoadingPareto(false);
      return;
    }

    setIsLoadingPareto(true);
    setParetoError(null);
    try {
      const queryParams = getPeriodQueryParams();
      const url = `${API_BASE_URL}/api/charts/revenue-by-product${queryParams}`; // Using existing endpoint
      console.log('Fetching pareto data from URL:', url);

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
      const data: ParetoDataPoint[] = await response.json();
      setParetoData(data);
    } catch (err: any) {
      console.error('Error fetching pareto data:', err);
      setParetoError(err.message || 'Failed to load revenue by product data.');
    } finally {
      setIsLoadingPareto(false);
    }
  }, [getPeriodQueryParams, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchRevenueData();
      fetchSunburstData(); // Fetch Sunburst data
      fetchParetoData(); // Fetch Pareto data
    } else {
      setRevenueData([]);
      setSunburstData([]); // Clear Sunburst data
      setParetoData([]); // Clear Pareto data
      setIsLoadingRevenue(false);
      setIsLoadingSunburst(false); // Set Sunburst loading to false
      setIsLoadingPareto(false); // Set Pareto loading to false
      setRevenueError('Please log in to view charts.');
      setSunburstError('Please log in to view charts.'); // Set Sunburst error
      setParetoError('Please log in to view charts.'); // Set Pareto error
    }
  }, [fetchRevenueData, fetchSunburstData, fetchParetoData, isAuthenticated, token, startDate, endDate]);

  const getDateRangeString = () => {
    const start = startDate ? startDate.toLocaleDateString() : '';
    const end = endDate ? endDate.toLocaleDateString() : '';

    if (start && end && start === end) return `for ${start}`;
    if (start && end) return `from ${start} to ${end}`;
    if (start) return `from ${start}`;
    if (end) return `until ${end}`;
    return '';
  };

  const revenueOptions = {
    chart: {
      height: '100%', // Set a fixed height for the revenue trend chart
    },
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

  // Highcharts options for the Sunburst Chart (Re-introduced)
  const sunburstOptions = {
    chart: {
      height: '100%', // Set a fixed height for the sunburst chart
      type: 'sunburst'
    },
    title: {
      text: `Sales and Expenses ${getDateRangeString()}`
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
        levelIs: 'custom',
        colorByPoint: true
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
      pointFormat: '<b>{point.name}</b>: {point.value}'
    }
  };


  // Highcharts options for the new Pareto Chart
  const paretoOptions = {
    chart: {
      type: 'column',
      height: 700, // Set a fixed height for the pareto chart
    },
    title: {
      text: `Revenue by Product/Service (Pareto Chart) ${getDateRangeString()}`
    },
    subtitle: {
      text: 'Identifying key revenue contributors'
    },
    xAxis: {
      categories: paretoData.map(item => item.name),
      crosshair: true,
      title: {
        text: 'Products/Services'
      }
    },
    yAxis: [{
      title: {
        text: 'Revenue (ZAR)'
      }
    }, {
      title: {
        text: 'Cumulative Percentage'
      },
      min: 0,
      max: 100,
      opposite: true,
      labels: {
        format: '{value}%'
      }
    }],
    tooltip: {
      shared: true,
      valuePrefix: 'R'
    },
    series: [{
      name: 'Revenue',
      type: 'column',
      data: paretoData.map(item => item.value),
      color: '#4CAF50', // Green for revenue bars
      zIndex: 1, // Ensure columns are below the line
    }, {
      name: 'Cumulative Percentage',
      type: 'pareto',
      yAxis: 1,
      linkedTo: 'revenue-series', // Link to the first series by ID
      color: '#FF9800', // Orange for the Pareto line
      dataLabels: {
        enabled: true,
        format: '{point.y:.1f}%'
      },
      tooltip: {
        valueSuffix: '%'
      }
    }],
    // Assign an ID to the first series for linking with Pareto series
    plotOptions: {
        series: {
            id: 'revenue-series' // This ID links the Pareto series to this column series
        }
    }
  };


  return (
    <div className='grid grid-cols-1 gap-6 mb-6'> {/* Main grid for stacking sections */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'> {/* First row for line and sunburst */}
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

        {/* SUNBURST CHART (Re-introduced as the second chart) */}
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
                <div className='flex justify-center items-center h-60'>
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

      {/* NEW PARETO CHART FOR REVENUE BY PRODUCT (as a third chart, spanning full width below) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className='lg:col-span-2' // Make it span full width in a new row
      >
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Product/Service (Pareto Chart)</CardTitle>
            <CardDescription>Visualizing major revenue contributors</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPareto ? (
              <div className='flex justify-center items-center h-60'>
                <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                <span className='ml-2 text-gray-600'>Loading revenue by product data...</span>
              </div>
            ) : paretoError ? (
              <div className='text-center text-red-500 p-4 border border-red-300 rounded-md h-60 flex flex-col justify-center items-center'>
                <p>Error: {paretoError}</p>
                <Button onClick={fetchParetoData} className='mt-2'>Retry</Button>
              </div>
            ) : (
              <HighchartsReact highcharts={Highcharts} options={paretoOptions} />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
