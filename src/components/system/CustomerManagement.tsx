import { useState, useEffect, useCallback } from 'react';
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
import { Plus, Search, Edit, Trash2, Loader2 } from 'lucide-react';
import { CustomerForm } from './CustomerForm';
import { useToast } from '@/hooks/use-toast';

interface CustomField {
  id: number;
  name: string;
  value: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  status?: 'Active' | 'Inactive';
  customFields?: CustomField[];
  totalInvoiced?: number;
}

interface CustomerSaveData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  customFields?: string;
}

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | undefined>(
    undefined
  );
  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    console.log('Frontend: Token from localStorage in getAuthHeaders:', token ? token.substring(0, 10) + '...' : 'NONE');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      console.log('Frontend: Headers for fetchCustomers:', headers);

      const response = await fetch(`https://quantnow.onrender.com/api/customers${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`, {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend response for ${response.status}:`, errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: any[] = await response.json();
      const formattedCustomers: Customer[] = data.map(customerDb => {
        let parsedCustomFields: CustomField[] = [];
        if (customerDb.custom_fields) {
          try {
            parsedCustomFields = JSON.parse(customerDb.custom_fields);
            parsedCustomFields = parsedCustomFields.map(field => ({ ...field, id: field.id || Date.now() }));
          } catch (e) {
            console.error("Error parsing custom fields JSON for customer", customerDb.id, ":", e);
            parsedCustomFields = [];
          }
        }

        return {
          id: customerDb.id.toString(),
          name: customerDb.name,
          email: customerDb.email,
          phone: customerDb.phone,
          address: customerDb.address,
          vatNumber: customerDb.tax_id,
          status: customerDb.status || 'Active',
          totalInvoiced: parseFloat(customerDb.total_invoiced || '0.00'),
          customFields: parsedCustomFields,
        };
      });

      setCustomers(formattedCustomers);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, searchTerm]);

  useEffect(() => {
    console.log('Frontend: useEffect in CustomerManagement triggered.');
    fetchCustomers();
  }, [fetchCustomers]);

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
      const response = await fetch('https://quantnow.onrender.com/api/customers', {
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
      await fetchCustomers();
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
      const response = await fetch(`https://quantnow.onrender.com/api/customers/${id}`, {
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
      await fetchCustomers();
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
      const response = await fetch(`https://quantnow.onrender.com/api/customers/${id}`, {
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
      await fetchCustomers();
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
  
  // ADD THIS FUNCTION
  const handleFormCancel = () => {
    setIsFormDialogOpen(false);
    setCurrentCustomer(undefined);
  };

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-xl font-medium'>Customer Management</CardTitle>
        <div className='flex items-center space-x-2'>
          <Input
            placeholder='Search customers...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='max-w-sm'
          />
          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setCurrentCustomer(undefined)}>
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
                  <TableHead>Address</TableHead>
                  <TableHead>VAT Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className='text-center'>
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.filter(
                    customer =>
                      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      customer.vatNumber?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className='font-medium'>{customer.name}</TableCell>
                      <TableCell>{customer.email}</TableCell>
                      <TableCell>{customer.phone || 'N/A'}</TableCell>
                      <TableCell>{customer.address || 'N/A'}</TableCell>
                      <TableCell>{customer.vatNumber || 'N/A'}</TableCell>
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
      </CardContent>
    </Card>
  );
}