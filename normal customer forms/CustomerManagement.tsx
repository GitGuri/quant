// src/pages/CustomerManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// --- Import Icons ---
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Users,
  CircleDollarSign, // High Value Icon
  Coins,            // Low Value Icon
  Repeat,          // Frequent Buyer Icon
  Gem             // Big Spender Icon
} from 'lucide-react';
// --- End Import Icons ---
import { CustomerForm } from './CustomerForm';
import { useToast } from '@/hooks/use-toast';

interface CustomField {
  id: number;
  name: string;
  value: string;
}

// --- Updated Customer Interface to Match Backend Response ---
interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string; // Maps to tax_id from backend
  status?: 'Active' | 'Inactive';
  customFields?: CustomField[];
  totalInvoiced: number;       // From backend aggregation
  numberOfPurchases: number;   // From backend aggregation
  averageOrderValue: number;   // Calculated by backend
}
// --- End Updated Customer Interface ---

interface CustomerSaveData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  customFields?: string;
}

// --- Define Customer Clusters ---
type CustomerCluster = 'All' | 'High Value' | 'Low Value' | 'Frequent Buyer' | 'Big Spender';

// --- Updated Cluster Tabs with Proper Icons ---
const CLUSTER_TABS: { value: CustomerCluster; label: string; icon: React.ReactNode }[] = [
  { value: 'All', label: 'All Customers', icon: <Users className="h-4 w-4 mr-2" /> },
  { value: 'High Value', label: 'High Value', icon: <CircleDollarSign className="h-4 w-4 mr-2" /> },
  { value: 'Low Value', label: 'Low Value', icon: <Coins className="h-4 w-4 mr-2" /> },
  { value: 'Frequent Buyer', label: 'Frequent Buyers', icon: <Repeat className="h-4 w-4 mr-2" /> },
  { value: 'Big Spender', label: 'Big Spenders', icon: <Gem className="h-4 w-4 mr-2" /> },
];
// --- End Define Customer Clusters ---

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | undefined>(undefined);
  // --- State for Customer Clustering ---
  const [activeCluster, setActiveCluster] = useState<CustomerCluster>('All');
  // --- End State for Customer Clustering ---
  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    // console.log('Frontend: Token from localStorage in getAuthHeaders:', token ? token.substring(0, 10) + '...' : 'NONE'); // Optional debug log
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  // --- Fetch Customers with Cluster Data from Backend ---
  const fetchCustomersWithClusterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      // console.log('Frontend: Headers for fetchCustomersWithClusterData:', headers); // Optional debug log

      // --- CALL THE NEW BACKEND ENDPOINT ---
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/cluster-data`, {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });
      // --- END CALL THE NEW BACKEND ENDPOINT ---

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend response for ${response.status}:`, errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // --- RECEIVE DATA WITH METRICS FROM BACKEND ---
      const data: Customer[] = await response.json();
      // --- END RECEIVE DATA WITH METRICS ---
      
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch clustered customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);
  // --- End Fetch Customers with Cluster Data ---

  // --- Effect to Fetch Data on Mount and Search Change ---
  useEffect(() => {
    // console.log('Frontend: useEffect in CustomerManagement triggered.'); // Optional debug log
    fetchCustomersWithClusterData();
  }, [fetchCustomersWithClusterData, searchTerm]); // Add searchTerm if backend handles search, otherwise remove
  // --- End Effect to Fetch Data ---

  const handleFormSave = async (customerData: Customer) => {
    const payload: CustomerSaveData = {
      name: customerData.name,
      email: customerData.email,
      phone: customerData.phone,
      address: customerData.address,
      vatNumber: customerData.vatNumber,
      customFields: JSON.stringify(customerData.customFields?.filter(f => f.name.trim() !== '') || []),
    };

    if (currentCustomer) {
      await handleUpdateCustomer(currentCustomer.id, payload);
    } else {
      await handleCreateCustomer(payload);
    }
  };

  const handleCreateCustomer = async (customerData: CustomerSaveData) => {
    setLoading(true);
    try {
      const response = await fetch('https://quantnow-sa1e.onrender.com/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(customerData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to create customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer created successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentCustomer(undefined);
      await fetchCustomersWithClusterData(); // Refresh data
    } catch (err) {
      console.error('Error creating customer:', err);
      toast({
        title: 'Error',
        description: `Failed to create customer: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCustomer = async (id: string, customerData: CustomerSaveData) => {
    setLoading(true);
    try {
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(customerData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to update customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer updated successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentCustomer(undefined);
      await fetchCustomersWithClusterData(); // Refresh data
    } catch (err) {
      console.error('Error updating customer:', err);
      toast({
        title: 'Error',
        description: `Failed to update customer: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to delete customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer deleted successfully.',
      });
      await fetchCustomersWithClusterData(); // Refresh data
    } catch (err) {
      console.error('Error deleting customer:', err);
      toast({
        title: 'Error',
        description: `Failed to delete customer: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setCurrentCustomer(customer);
    setIsFormDialogOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormDialogOpen(false);
    setCurrentCustomer(undefined);
  };

  // --- Function to Filter Customers by Cluster ---
  const filterCustomersByCluster = useCallback((cluster: CustomerCluster): Customer[] => {
    if (cluster === 'All') {
      return customers;
    }

    return customers.filter(customer => {
      // Use the metrics provided by the backend
      const totalInvoiced = customer.totalInvoiced ?? 0;
      const numberOfPurchases = customer.numberOfPurchases ?? 0;
      const averageOrderValue = customer.averageOrderValue ?? 0;

      switch (cluster) {
        case 'High Value':
          return totalInvoiced > 1000; // Example threshold
        case 'Low Value':
          return totalInvoiced <= 500; // Example threshold
        case 'Frequent Buyer':
          return numberOfPurchases > 5; // Example threshold
        case 'Big Spender':
          return averageOrderValue > 200; // Example threshold
        default:
          return true; // Should not happen, but safe default
      }
    });
  }, [customers]);
  // --- End Function to Filter Customers by Cluster ---

  // Filter customers based on active cluster and search term
  const filteredCustomers = filterCustomersByCluster(activeCluster).filter(
    customer =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.phone && customer.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (customer.vatNumber && customer.vatNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2'>
        <CardTitle className='text-xl font-medium'>Customer Management</CardTitle>
        <div className='flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto'>
          <Input
            placeholder='Search customers...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='max-w-sm'
          />
          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setCurrentCustomer(undefined)} className='w-full sm:w-auto'>
                <Plus className='mr-2 h-4 w-4' /> New Customer
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                <DialogTitle>
                  {currentCustomer ? 'Edit Customer' : 'Create New Customer'}
                </DialogTitle>
              </DialogHeader>
              <CustomerForm
                customer={currentCustomer}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* --- Tabs for Customer Clusters --- */}
        <Tabs value={activeCluster} onValueChange={(value) => setActiveCluster(value as CustomerCluster)} className="w-full mb-4">
          <TabsList className="grid w-full grid-cols-5">
            {CLUSTER_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center justify-center">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.value}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {CLUSTER_TABS.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              {loading ? (
                <div className='flex justify-center items-center h-40'>
                  <Loader2 className='h-8 w-8 animate-spin' />
                </div>
              ) : error ? (
                <div className='text-red-500 text-center py-4'>{error}</div>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>VAT Number</TableHead>
                        <TableHead className="text-right">Total Invoiced (R)</TableHead>
                        <TableHead className="text-right">Purchases</TableHead>
                        <TableHead className="text-right">Avg Order (R)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className='text-center'>
                            No customers found in this cluster matching your search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCustomers.map(customer => (
                          <TableRow key={customer.id}>
                            <TableCell className='font-medium'>{customer.name}</TableCell>
                            <TableCell>{customer.email}</TableCell>
                            <TableCell>{customer.phone || 'N/A'}</TableCell>
                            <TableCell>{customer.vatNumber || 'N/A'}</TableCell>
                            <TableCell className="text-right">R{customer.totalInvoiced.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{customer.numberOfPurchases}</TableCell>
                            <TableCell className="text-right">R{customer.averageOrderValue.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={customer.status === 'Active' ? 'default' : 'secondary'}>
                                {customer.status || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex justify-end space-x-2'>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => handleEditCustomer(customer)}
                                >
                                  <Edit className='h-4 w-4' />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant='ghost' size='sm'>
                                      <Trash2 className='h-4 w-4' />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete {customer.name}?
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteCustomer(customer.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        {/* --- End Tabs for Customer Clusters --- */}
      </CardContent>
    </Card>
  );
}