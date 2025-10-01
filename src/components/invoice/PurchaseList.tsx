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
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, Eye, Edit, ShoppingCart, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog, // Keep Dialog for View Details
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PurchaseForm } from './PurchaseForm'; // Ensure this path is correct
import { useToast } from '@/components/ui/use-toast'; // Import useToast

// Define API Base URL
const API_BASE_URL = 'http://localhost:3000';

// --- Interfaces to match backend API responses for Purchases ---
interface PurchaseLineItem {
  id?: string;
  product_service_id: string | null;
  product_service_name?: string; // For display (from JOIN in backend)
  description: string;
  quantity: number;
  unit_cost: number; // Matches backend 'unit_cost'
  line_total: number;
  tax_rate: number;
}

interface Purchase {
  id: string;
  po_number: string; // Matches backend 'po_number'
  vendor_id: string; // Matches backend 'vendor_id'
  vendor_name: string; // Matches backend 'vendor_name'
  order_date: string; // Matches backend 'order_date'
  delivery_date: string | null; // Matches backend 'delivery_date'
  total_amount: number; // Ensure this is a number after parsing from DB
  status: 'Draft' | 'Ordered' | 'Received' | 'Paid'; // Matches backend enum/status
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: PurchaseLineItem[]; // Only present when fetching single purchase
}

interface Supplier { // Renamed from Customer for clarity in Purchase context
  id: string;
  name: string;
}

// --- PurchaseList Component ---
export function PurchaseList() {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPurchaseForm, setShowPurchaseForm] = useState(false); // Controls full-screen form visibility
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); // For View details (still a modal)
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null); // For editing or viewing
  const [purchaseToDelete, setPurchaseToDelete] = useState<string | null>(null); // State for AlertDialog deletion confirmation
  const [isLoadingList, setIsLoadingList] = useState(true); // Loading state for the purchase list
  const [isFormLoading, setIsFormLoading] = useState(false); // New: Loading state for the form details

  // Function to fetch purchases from the backend
  const fetchPurchases = useCallback(async () => {
    setIsLoadingList(true); // Start loading
    try {
      // Corrected API path
      const response = await fetch(`${API_BASE_URL}/api/purchases`); // Using '/api/purchases' endpoint
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch purchase orders');
      }
      const data: Purchase[] = await response.json();
      // Ensure total_amount and dates are correctly parsed/formatted
      setPurchases(data.map(po => ({
        ...po,
        total_amount: parseFloat(po.total_amount as any) || 0, // Convert to number if it comes as string
        order_date: new Date(po.order_date).toISOString().split('T')[0], // Format date for consistency
        delivery_date: po.delivery_date ? new Date(po.delivery_date).toISOString().split('T')[0] : null, // Format date or keep null
      })));
    } catch (error: any) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load purchase orders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingList(false); // End loading
    }
  }, [toast]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-green-100 text-green-800';
      case 'Received':
        return 'bg-blue-100 text-blue-800';
      case 'Ordered':
        return 'bg-yellow-100 text-yellow-800';
      case 'Draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredPurchases = purchases.filter(
    purchase =>
      purchase.po_number.toLowerCase().includes(searchTerm.toLowerCase()) || // Changed to po_number
      purchase.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) // Changed to vendor_name
  );

  const handleNewPurchaseClick = () => {
    setSelectedPurchase(null); // Clear selected purchase for new creation
    setShowPurchaseForm(true); // Show full-screen form
  };

  const handleEditPurchaseClick = async (purchase: Purchase) => {
    setIsFormLoading(true); // Start loading form data
    setShowPurchaseForm(true); // Show the full-screen form container immediately
    try {
      // Fetch the detailed purchase, including line items
      const response = await fetch(`${API_BASE_URL}/api/purchases/${purchase.id}`); // Using '/api/purchases/:id' endpoint
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch purchase order details for editing.');
      }
      const detailedPurchase: Purchase = await response.json();
      // Ensure numeric values are parsed correctly for display
      detailedPurchase.total_amount = parseFloat(detailedPurchase.total_amount as any) || 0;
      detailedPurchase.line_items = detailedPurchase.line_items?.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity as any) || 0,
        unit_cost: parseFloat(item.unit_cost as any) || 0, // Use unit_cost
        line_total: parseFloat(item.line_total as any) || 0,
        tax_rate: parseFloat(item.tax_rate as any) || 0,
      })) || [];

      setSelectedPurchase(detailedPurchase); // Set the detailed purchase for the form
    } catch (error: any) {
      console.error('Error fetching purchase order details for edit:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load purchase order details for editing. Please try again.',
        variant: 'destructive',
      });
      setShowPurchaseForm(false); // Hide the form if loading fails
    } finally {
      setIsFormLoading(false); // End loading form data
    }
  };

  const handleViewPurchaseClick = async (purchase: Purchase) => {
    try {
      // Corrected API path for single purchase with line items
      const response = await fetch(`${API_BASE_URL}/api/purchases/${purchase.id}`); // Using '/api/purchases/:id' endpoint
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch purchase order details');
      }
      const detailedPurchase: Purchase = await response.json();
      // Ensure numeric values are parsed correctly for display
      detailedPurchase.total_amount = parseFloat(detailedPurchase.total_amount as any) || 0;
      detailedPurchase.line_items = detailedPurchase.line_items?.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity as any) || 0,
        unit_cost: parseFloat(item.unit_cost as any) || 0, // Use unit_cost
        line_total: parseFloat(item.line_total as any) || 0,
        tax_rate: parseFloat(item.tax_rate as any) || 0,
      })) || [];

      setSelectedPurchase(detailedPurchase);
      setIsViewModalOpen(true);
    } catch (error: any) {
      console.error('Error fetching purchase order details:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load purchase order details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Prepare for deletion confirmation dialog
  const confirmDeletePurchase = (purchaseId: string) => {
    setPurchaseToDelete(purchaseId);
  };

  const handleDeletePurchase = async () => {
    if (!purchaseToDelete) return; // Should not happen if triggered by AlertDialogAction

    try {
      // Corrected API path for deletion
      const response = await fetch(`${API_BASE_URL}/api/purchases/${purchaseToDelete}`, { // Using '/api/purchases/:id' DELETE endpoint
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete purchase order');
      }
      // Remove from local state
      setPurchases(prev => prev.filter(po => po.id !== purchaseToDelete));
      toast({
        title: 'Purchase Order Deleted',
        description: 'The purchase order has been successfully deleted.',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Deletion Failed',
        description: error.message || `Failed to delete purchase order. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setPurchaseToDelete(null); // Reset deletion state
    }
  };

  const handleFormSubmitSuccess = () => {
    setShowPurchaseForm(false); // Hide full-screen form
    fetchPurchases(); // Refresh the list after create/update
  };

  // Render the PurchaseForm full-screen if showPurchaseForm is true
  if (showPurchaseForm) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {selectedPurchase ? 'Edit Purchase Order' : 'Create New Purchase Order'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {selectedPurchase
              ? `Editing purchase order ${selectedPurchase.po_number}.`
              : 'Fill in the details to create a new purchase order.'}
          </p>
          {/* Add a loading indicator here for the form */}
          {isFormLoading ? (
            <div className='flex justify-center items-center h-40'>
              <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
              <span className='ml-2 text-gray-600'>Loading purchase order details...</span>
            </div>
          ) : (
            <PurchaseForm
              purchase={selectedPurchase} // Pass selected purchase for editing
              onClose={() => setShowPurchaseForm(false)} // Close full-screen form
              onSubmitSuccess={handleFormSubmitSuccess}
            />
          )}
        </div>
      </div>
    );
  }

  // Otherwise, render the PurchaseList as normal
  return (
    <Card>
      <CardHeader>
        <div className='flex justify-between items-center'>
          <CardTitle className='flex items-center gap-2'>
            <ShoppingCart className='h-5 w-5' />
            Purchase Orders
          </CardTitle>
          {/* Button to open the full-screen form */}
          <Button onClick={handleNewPurchaseClick}>
            <Plus className='h-4 w-4 mr-2' />
            New Purchase Order
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-4'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search purchase orders by number or supplier...'
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className='pl-10'
            />
          </div>
        </div>

        {isLoadingList ? (
          <div className='flex justify-center items-center h-40'>
            <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
            <span className='ml-2 text-gray-600'>Loading purchase orders...</span>
          </div>
        ) : (
          <div className='border rounded-lg overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className='text-center py-8 text-muted-foreground'>
                      No purchase orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPurchases.map(purchase => (
                    <TableRow key={purchase.id}>
                      <TableCell className='font-medium'>{purchase.po_number}</TableCell>
                      <TableCell>{purchase.vendor_name}</TableCell>
                      <TableCell>{new Date(purchase.order_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell>
                        {purchase.delivery_date
                          ? new Date(purchase.delivery_date).toLocaleDateString('en-ZA')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        R
                        {(purchase.total_amount).toLocaleString('en-ZA', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant='secondary' className={getStatusColor(purchase.status)}>
                          {purchase.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Button variant='ghost' size='sm' onClick={() => handleViewPurchaseClick(purchase)}>
                            <Eye className='h-4 w-4' />
                          </Button>
                          <Button variant='ghost' size='sm' onClick={() => handleEditPurchaseClick(purchase)}>
                            <Edit className='h-4 w-4' />
                          </Button>
                          {/* AlertDialog for deletion confirmation */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant='ghost' size='sm' onClick={() => confirmDeletePurchase(purchase.id)}>
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete purchase order {purchase.po_number}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeletePurchase}>
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

      {/* View Purchase Details Modal (remains a modal) */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Purchase Order Details: {selectedPurchase?.po_number}</DialogTitle>
            <DialogDescription>Detailed view of the selected purchase order.</DialogDescription>
          </DialogHeader>
          {selectedPurchase ? (
            <div className='space-y-4 text-sm'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <p>
                    <strong>Supplier:</strong> {selectedPurchase.vendor_name}
                  </p>
                  <p>
                    <strong>Order Date:</strong> {new Date(selectedPurchase.order_date).toLocaleDateString('en-ZA')}
                  </p>
                  <p>
                    <strong>Delivery Date:</strong>{' '}
                    {selectedPurchase.delivery_date
                      ? new Date(selectedPurchase.delivery_date).toLocaleDateString('en-ZA')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Status:</strong>{' '}
                    <Badge variant='secondary' className={getStatusColor(selectedPurchase.status)}>
                      {selectedPurchase.status.toUpperCase()}
                    </Badge>
                  </p>
                  <p>
                    <strong>Total Amount:</strong> {selectedPurchase.currency}
                    {(selectedPurchase.total_amount).toLocaleString('en-ZA', {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <p>
                    <strong>Currency:</strong> {selectedPurchase.currency}
                  </p>
                </div>
              </div>
              {selectedPurchase.notes && (
                <p>
                  <strong>Notes:</strong> {selectedPurchase.notes}
                </p>
              )}

              <h3 className='font-semibold text-lg mt-6'>Line Items</h3>
              {selectedPurchase.line_items && selectedPurchase.line_items.length > 0 ? (
                <div className='border rounded-lg overflow-hidden'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product/Service</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Tax Rate</TableHead>
                        <TableHead>Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPurchase.line_items.map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell>{item.product_service_name || 'Custom Item'}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>R{(item.unit_cost ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{((item.tax_rate ?? 0) * 100).toFixed(2)}%</TableCell>
                          <TableCell>R{(item.line_total ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className='text-muted-foreground'>No line items for this purchase order.</p>
              )}
            </div>
          ) : (
            <div className='flex justify-center items-center h-40 text-muted-foreground'>
              Select a purchase order to view its details.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
