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
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Search, Eye, Edit, Truck, Trash2, Loader2 } from 'lucide-react';
import { SupplierForm } from './SupplierForm';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const API_BASE = 'https://quantnow-sa1e.onrender.com';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

// Unified Supplier interface
interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;

  // from /api/suppliers
  vatNumber?: string;
  totalPurchased?: number;
  balance?: number; // actual balance_due from backend

  // optional legacy/extra fields
  contactPerson?: string;
  taxId?: string;

  source: 'api/suppliers' | 'vendors';
}

// Form payload for create/update
interface SupplierSaveData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
}

// Aging + invoices for a supplier
interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  amount: number;
  balance: number;
  status: 'open' | 'overdue' | 'paid' | 'partial';
}

interface SupplierAging {
  supplierId: string;
  balance: number;
  agingBuckets: {
    current: number;
    '30': number;
    '60': number;
    '90': number;
    '120+': number;
  };
  invoices: SupplierInvoice[];
}

// Payment form data for recording a repayment
type PaymentMethod = 'CASH' | 'BANK' | 'OTHER';

interface PaymentFormData {
  amount: number;
  date: string; // YYYY-MM-DD
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

// -----------------------------------------------------------------------------
// Helper formatting
// -----------------------------------------------------------------------------
function fmtMoney(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function normalizeDateString(d: string | undefined | null): string {
  if (!d) return '';
  // Works for both '2025-11-07' and '2025-11-07T22:00:00.000Z'
  if (d.length >= 10) return d.slice(0, 10);
  return d;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export function SupplierManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | undefined>(
    undefined
  );

  // Aging / details dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [agingLoading, setAgingLoading] = useState(false);
  const [selectedSupplierForDetail, setSelectedSupplierForDetail] =
    useState<Supplier | null>(null);
  const [selectedSupplierAging, setSelectedSupplierAging] =
    useState<SupplierAging | null>(null);

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(() => ({
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    method: 'BANK',
    reference: '',
    note: '',
  }));

  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  function withBust(url: string) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}__ts=${Date.now()}`;
  }

  // ---------------------------------------------------------------------------
  // Fetch suppliers (base list)
  // ---------------------------------------------------------------------------
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();

    try {
      const response = await fetch(withBust(`${API_BASE}/api/suppliers`), {
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        cache: 'no-store',
        signal: ac.signal,
      });

      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);

      const raw: any[] = await response.json();

      const mapped: Supplier[] = raw.map((s: any) => ({
        id: String(s.id),
        name: s.name,
        email: s.email ?? undefined,
        phone: s.phone ?? undefined,
        address: s.address ?? undefined,
        vatNumber:
          s.vat_number ??
          s.vatNumber ??
          s.tax_id ??
          s.taxId ??
          undefined,
        totalPurchased: s.total_purchased ?? s.totalPurchased ?? 0,
        // 🔑 use balance_due if present so the table shows real balance
        balance:
          typeof s.balance === 'number'
            ? s.balance
            : typeof s.balance_due === 'number'
            ? s.balance_due
            : typeof s.total_outstanding === 'number'
            ? s.total_outstanding
            : undefined,
        contactPerson: s.contact_person ?? s.contactPerson ?? undefined,
        taxId: s.tax_id ?? s.taxId ?? undefined,
        source: 'api/suppliers',
      }));

      setSuppliers(mapped);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch suppliers:', err);
        setError('Failed to load suppliers. Please try again.');
      }
    } finally {
      setLoading(false);
    }

    return () => ac.abort();
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------
  const filteredSuppliers = suppliers.filter((supplier) => {
    const term = searchTerm.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(term) ||
      supplier.email?.toLowerCase().includes(term) ||
      supplier.phone?.toLowerCase().includes(term)
    );
  });

  // ---------------------------------------------------------------------------
  // CRUD: create / update / delete
  // ---------------------------------------------------------------------------
  const handleCreateSupplier = async (supplierData: SupplierSaveData) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/suppliers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: supplierData.name,
          email: supplierData.email ?? null,
          phone: supplierData.phone ?? null,
          address: supplierData.address ?? null,
          vatNumber: supplierData.vatNumber ?? null,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.message || 'Failed to create supplier.'
        );
      }

      toast({
        title: 'Success',
        description: 'Supplier created successfully.',
      });
      setIsFormDialogOpen(false);
      await fetchSuppliers();
    } catch (err) {
      console.error('Error creating supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to create supplier: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSupplier = async (
    id: string,
    supplierData: SupplierSaveData
  ) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: supplierData.name,
          email: supplierData.email ?? null,
          phone: supplierData.phone ?? null,
          address: supplierData.address ?? null,
          vatNumber: supplierData.vatNumber ?? null,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(
          errorBody.message || 'Failed to update supplier.'
        );
      }

      const updatedRaw = await res.json();
      const updated: Supplier = {
        id: String(updatedRaw.id),
        name: updatedRaw.name,
        email: updatedRaw.email ?? undefined,
        phone: updatedRaw.phone ?? undefined,
        address: updatedRaw.address ?? undefined,
        vatNumber:
          updatedRaw.vat_number ??
          updatedRaw.vatNumber ??
          updatedRaw.tax_id ??
          undefined,
        totalPurchased:
          updatedRaw.total_purchased ?? updatedRaw.totalPurchased ?? 0,
        balance:
          typeof updatedRaw.balance === 'number'
            ? updatedRaw.balance
            : typeof updatedRaw.balance_due === 'number'
            ? updatedRaw.balance_due
            : typeof updatedRaw.total_outstanding === 'number'
            ? updatedRaw.total_outstanding
            : undefined,
        contactPerson:
          updatedRaw.contact_person ?? updatedRaw.contactPerson ?? undefined,
        taxId: updatedRaw.tax_id ?? updatedRaw.taxId ?? undefined,
        source: 'api/suppliers',
      };

      // Optimistic replace
      setSuppliers((prev) =>
        prev.map((s) => (String(s.id) === String(id) ? updated : s))
      );

      toast({ title: 'Success', description: 'Supplier updated successfully.' });
      setIsFormDialogOpen(false);
      setCurrentSupplier(undefined);

      // Background reconcile
      fetchSuppliers();
    } catch (err) {
      console.error('Error updating supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to update supplier: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(
          errorBody.message || 'Failed to delete supplier.'
        );
      }

      // Optimistic remove
      setSuppliers((prev) =>
        prev.filter((s) => String(s.id) !== String(id))
      );

      toast({
        title: 'Success',
        description: 'Supplier deleted successfully.',
      });

      // Background reconcile
      fetchSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      toast({
        title: 'Error',
        description: `Failed to delete supplier: ${
          err instanceof Error ? err.message : String(err)
        }`,
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

  // ---------------------------------------------------------------------------
  // Aging: load + open dialog
  // ---------------------------------------------------------------------------
  const fetchSupplierAging = useCallback(
    async (supplierId: string) => {
      setAgingLoading(true);
      setSelectedSupplierAging(null);
      try {
        const res = await fetch(
          withBust(`${API_BASE}/api/suppliers/${supplierId}/aging`),
          {
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            cache: 'no-store',
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to load supplier aging');
        }

        const data = await res.json();
        const aging: SupplierAging = {
          supplierId,
          balance: data.balance ?? 0,
          agingBuckets: {
            current: data.aging?.current ?? 0,
            '30': data.aging?.['30'] ?? 0,
            '60': data.aging?.['60'] ?? 0,
            '90': data.aging?.['90'] ?? 0,
            '120+': data.aging?.['120+'] ?? 0,
          },
          invoices: Array.isArray(data.invoices)
            ? data.invoices.map((inv: any) => {
                const amount = Number(
                  inv.amount ?? inv.total_amount ?? inv.total ?? 0
                );
                const balance = Number(
                  inv.balance ?? inv.balance_due ?? inv.outstanding ?? 0
                );

                const rawStatus = String(inv.status || '').toLowerCase();
                let status: 'open' | 'overdue' | 'paid' | 'partial';
                if (rawStatus === 'paid') status = 'paid';
                else if (rawStatus === 'overdue') status = 'overdue';
                else if (rawStatus === 'partial') status = 'partial';
                else status = balance > 0 ? 'open' : 'paid';

                return {
                  id: String(inv.id),
                  invoiceNumber:
                    inv.invoice_number ?? inv.invoiceNumber ?? '',
                  invoiceDate: normalizeDateString(
                    inv.invoice_date ?? inv.invoiceDate
                  ),
                  dueDate: normalizeDateString(
                    inv.due_date ?? inv.dueDate
                  ),
                  amount,
                  balance,
                  status,
                };
              })
            : [],
        };

        setSelectedSupplierAging(aging);
      } catch (err) {
        console.error('Failed to load aging:', err);
        toast({
          title: 'Error',
          description: `Failed to load supplier aging: ${
            err instanceof Error ? err.message : String(err)
          }`,
          variant: 'destructive',
        });
      } finally {
        setAgingLoading(false);
      }
    },
    [getAuthHeaders, toast]
  );

  const handleViewAging = (supplier: Supplier) => {
    setSelectedSupplierForDetail(supplier);
    setDetailDialogOpen(true);
    fetchSupplierAging(supplier.id);
  };

  // ---------------------------------------------------------------------------
  // Payment (repayment) dialog
  // ---------------------------------------------------------------------------
  const openPaymentDialog = (supplier: Supplier) => {
    setSelectedSupplierForDetail(supplier);
    setPaymentForm({
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      method: 'BANK',
      reference: '',
      note: '',
    });
    setPaymentDialogOpen(true);
  };

  const handleSubmitPayment = async () => {
    if (!selectedSupplierForDetail) return;
    if (!paymentForm.amount || paymentForm.amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a payment amount greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    setPaymentLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/suppliers/${selectedSupplierForDetail.id}/payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            amount: paymentForm.amount,
            date: paymentForm.date,
            method: paymentForm.method,
            reference: paymentForm.reference || null,
            note: paymentForm.note || null,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.message || 'Failed to record supplier payment.'
        );
      }

      toast({
        title: 'Payment recorded',
        description: `Payment of ${fmtMoney(
          paymentForm.amount
        )} recorded for ${selectedSupplierForDetail.name}.`,
      });

      setPaymentDialogOpen(false);
      setPaymentForm({
        amount: 0,
        date: new Date().toISOString().slice(0, 10),
        method: 'BANK',
        reference: '',
        note: '',
      });

      // Refresh supplier list + aging info if dialog open
      fetchSuppliers();
      if (detailDialogOpen) {
        fetchSupplierAging(selectedSupplierForDetail.id);
      }
    } catch (err) {
      console.error('Error posting supplier payment:', err);
      toast({
        title: 'Error',
        description: `Failed to record payment: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-medium">
          Supplier Management
        </CardTitle>
        <div className="flex items-center space-x-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setCurrentSupplier(undefined)}>
                <Plus className="mr-2 h-4 w-4" /> New Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
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
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center py-4">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>VAT/Tax No.</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">
                        {supplier.name}
                      </TableCell>
                      <TableCell>{supplier.email || 'N/A'}</TableCell>
                      <TableCell>{supplier.phone || 'N/A'}</TableCell>
                      <TableCell>
                        {supplier.vatNumber || supplier.taxId || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {supplier.balance != null ? (
                          <span
                            className={
                              supplier.balance > 0
                                ? 'text-red-600 font-semibold'
                                : 'text-green-600 font-semibold'
                            }
                          >
                            {fmtMoney(supplier.balance)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            supplier.source === 'api/suppliers'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {supplier.source === 'api/suppliers'
                            ? 'API'
                            : 'Legacy'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewAging(supplier)}
                            title="View aging & invoices"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentDialog(supplier)}
                            title="Record payment"
                          >
                            <Truck className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSupplier(supplier)}
                            title="Edit supplier"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Delete supplier"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Supplier
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete{' '}
                                  <strong>{supplier.name}</strong>? This action
                                  cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleDeleteSupplier(supplier.id)
                                  }
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

      {/* ------------------------------------------------------------------ */}
      {/* Aging / detail dialog                                              */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Supplier Aging
              {selectedSupplierForDetail
                ? ` – ${selectedSupplierForDetail.name}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          {agingLoading || !selectedSupplierAging ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Total Outstanding
                  </div>
                  <div className="text-xl font-semibold">
                    {fmtMoney(selectedSupplierAging.balance)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                  {[
                    ['Current', selectedSupplierAging.agingBuckets.current],
                    ['30 days', selectedSupplierAging.agingBuckets['30']],
                    ['60 days', selectedSupplierAging.agingBuckets['60']],
                    ['90 days', selectedSupplierAging.agingBuckets['90']],
                    ['120+ days', selectedSupplierAging.agingBuckets['120+']],
                  ].map(([label, value]) => (
                    <div key={label as string} className="text-center">
                      <div className="text-muted-foreground">{label}</div>
                      <div className="font-medium">
                        {fmtMoney(value as number)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSupplierAging.invoices.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-sm text-muted-foreground"
                        >
                          No outstanding invoices.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedSupplierAging.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>
                            {inv.invoiceNumber || `INV-${inv.id}`}
                          </TableCell>
                          <TableCell>{inv.invoiceDate || '—'}</TableCell>
                          <TableCell>{inv.dueDate || '—'}</TableCell>
                          <TableCell className="text-right">
                            {fmtMoney(inv.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtMoney(inv.balance)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inv.status === 'overdue'
                                  ? 'destructive'
                                  : inv.status === 'paid'
                                  ? 'secondary'
                                  : 'default'
                              }
                            >
                              {inv.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Payment dialog                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              Record Payment
              {selectedSupplierForDetail
                ? ` – ${selectedSupplierForDetail.name}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Amount
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={paymentForm.amount || ''}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    amount: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Date
              </label>
              <Input
                type="date"
                value={paymentForm.date}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Method
              </label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={paymentForm.method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    method: e.target.value as PaymentMethod,
                  }))
                }
              >
                <option value="BANK">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Reference (optional)
              </label>
              <Input
                value={paymentForm.reference ?? ''}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Note (optional)
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                rows={3}
                value={paymentForm.note ?? ''}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    note: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPaymentDialogOpen(false)}
                disabled={paymentLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitPayment}
                disabled={paymentLoading}
              >
                {paymentLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
