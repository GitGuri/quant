// src/pages/inventory/SupplierManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, Search, Eye, Edit, Truck, Trash2, Loader2 } from 'lucide-react';
import { SupplierForm } from './SupplierForm'; // Assuming this component exists and handles form input
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge'; // Import the Badge component

// Define the unified Supplier interface to accommodate data from both /api/suppliers and /vendors
interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  // Fields from /api/suppliers
  vatNumber?: string; // Maps to backend 'vat_number'
  totalPurchased?: number; // Maps to backend 'total_purchased'
  // Fields from /vendors (old/alternative)
  contactPerson?: string; // Maps to backend 'contact_person'
  taxId?: string; // Maps to backend 'tax_id'
  source: 'api/suppliers' | 'vendors'; // To track the origin of the data
}

// This interface defines the data structure that the form will *emit* when saved.
// It aligns with the /api/suppliers endpoint's expected payload for creation/update.
interface SupplierSaveData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string; // This field will capture both vatNumber and taxId from the UI
}

export function SupplierManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | undefined>(
    undefined
  );
  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3000/api/suppliers', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data: Supplier[] = await response.json();
      setSuppliers(data);
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
      setError('Failed to load suppliers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const filteredSuppliers = suppliers.filter(
    supplier =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateSupplier = async (supplierData: SupplierSaveData) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch('http://localhost:3000/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
        body: JSON.stringify(supplierData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to create supplier.');
      }

      toast({
        title: 'Success',
        description: 'Supplier created successfully.',
      });
      setIsFormDialogOpen(false);
      await fetchSuppliers(); // Refresh data after successful creation
    } catch (err) {
      console.error('Error creating supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to create supplier: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSupplier = async (id: string, supplierData: SupplierSaveData) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch(`http://localhost:3000/api/suppliers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
        body: JSON.stringify(supplierData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to update supplier.');
      }

      toast({
        title: 'Success',
        description: 'Supplier updated successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentSupplier(undefined); // Clear current supplier
      await fetchSuppliers(); // Refresh data after successful update
    } catch (err) {
      console.error('Error updating supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to update supplier: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch(`http://localhost:3000/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(), // Add authorization header
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to delete supplier.');
      }

      toast({
        title: 'Success',
        description: 'Supplier deleted successfully.',
      });
      await fetchSuppliers(); // Refresh data after successful deletion
    } catch (err) {
      console.error('Error deleting supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to delete supplier: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setCurrentSupplier(supplier);
    setIsFormDialogOpen(true);
  };

  const handleFormSave = (formData: SupplierSaveData) => {
    if (currentSupplier) {
      handleUpdateSupplier(currentSupplier.id, formData);
    } else {
      handleCreateSupplier(formData);
    }
  };

  const handleFormCancel = () => {
    setIsFormDialogOpen(false);
    setCurrentSupplier(undefined);
  };

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-xl font-medium'>Supplier Management</CardTitle>
        <div className='flex items-center space-x-2'>
          <Input
            placeholder='Search suppliers...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='max-w-sm'
            icon={<Search className='h-4 w-4 text-muted-foreground' />}
          />
          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setCurrentSupplier(undefined)}>
                <Plus className='mr-2 h-4 w-4' /> New Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                <DialogTitle>
                  {currentSupplier ? 'Edit Supplier' : 'Create New Supplier'}
                </DialogTitle>
              </DialogHeader>
              <SupplierForm
                supplier={currentSupplier}
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
                  <TableHead>VAT/Tax No.</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className='text-center'>
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map(supplier => (
                    <TableRow key={supplier.id}>
                      <TableCell className='font-medium'>{supplier.name}</TableCell>
                      <TableCell>{supplier.email || 'N/A'}</TableCell>
                      <TableCell>{supplier.phone || 'N/A'}</TableCell>
                      <TableCell>{supplier.vatNumber || supplier.taxId || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={supplier.source === 'api/suppliers' ? 'default' : 'secondary'}>
                          {supplier.source === 'api/suppliers' ? 'API' : 'Legacy'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end space-x-2'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleEditSupplier(supplier)}
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
                                <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {supplier.name}?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteSupplier(supplier.id)}
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