import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, XCircle, Loader2, ChevronLeft } from 'lucide-react';

import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../../AuthPage';

// --- Interfaces ---
export interface InvoiceLineItem {
  id?: string;
  product_service_id: string | null;
  product_service_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email?: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
}

interface InvoiceFormData {
  invoice_number: string;
  customer_id: string | null;
  customer_name_manual?: string;
  invoice_date: string;
  due_date: string;
  status: string;
  currency: string;
  notes: string;
  line_items: InvoiceLineItem[];
}

interface ProductService {
  id: string;
  name: string;
  description: string;
  price: number;
  costPrice?: number;
  sku?: string;
  isService: boolean;
  stock: number;
  vatRate: number;
  category: string;
  unit: string;
}

interface Customer {
  id: string;
  name: string;
}

interface InvoiceFormProps {
  invoice?: Invoice;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

const generateInvoiceNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${y}${m}${d}-${hh}${mm}${ss}-${r}`;
};

const VAT_OPTIONS = [
  { value: 0.0, label: '0%' },
  { value: 0.15, label: '15%' },
];

// ===== Banking helpers (same pattern as quotations) =====
type BankDetails = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType?: string;
  swift?: string;
  referenceHint?: string;
};

const INVOICE_BANK_LOCAL_KEY = 'invoiceBankDefaults_v1';

function renderBankBlock(bd: Partial<BankDetails>, currencySymbol: string) {
  const lines: string[] = [];
  if (bd.accountName) lines.push(`Account Name: ${bd.accountName}`);
  if (bd.bankName) lines.push(`Bank: ${bd.bankName}`);
  if (bd.accountNumber) lines.push(`Account Number: ${bd.accountNumber}`);
  if (bd.branchCode) lines.push(`Branch Code: ${bd.branchCode}`);
  if (bd.accountType) lines.push(`Account Type: ${bd.accountType}`);
  if (bd.swift) lines.push(`SWIFT/BIC: ${bd.swift}`);
  if (bd.referenceHint) lines.push(`Reference: ${bd.referenceHint}`);

  if (!lines.length) return '';
  return [
    '— Payment Details —',
    `Preferred Currency: ${currencySymbol}`,
    ...lines,
    '',
  ].join('\n');
}

function upsertBankBlockIntoNotes(notes: string, newBlock: string) {
  const startMarker = '— Payment Details —';
  const re = new RegExp(`${startMarker}[\\s\\S]*?$`, 'm');
  const trimmed = (notes || '').trim();
  if (!newBlock.trim()) {
    // remove if exists
    return trimmed.replace(re, '').trim();
  }
  if (trimmed.includes(startMarker)) {
    // replace existing block
    return trimmed.replace(re, newBlock).trim();
  }
  // append
  return [trimmed, newBlock].filter(Boolean).join('\n\n').trim();
}

export function InvoiceForm({ invoice, onClose, onSubmitSuccess }: InvoiceFormProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const getDefaultDueDate = (invoiceDateString: string) => {
    const invoiceDate = new Date(invoiceDateString);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(invoiceDate.getDate() + 7);
    return dueDate.toISOString().split('T')[0];
  };

  const initialInvoiceDate = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<InvoiceFormData>({
    invoice_number: invoice ? invoice.invoice_number : generateInvoiceNumber(),
    customer_id: null,
    customer_name_manual: '',
    invoice_date: initialInvoiceDate,
    due_date: getDefaultDueDate(initialInvoiceDate),
    status: 'Draft',
    currency: 'ZAR',
    notes: '',
    line_items: [],
  });

  const [productsServices, setProductsServices] = useState<ProductService[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);

  // debounce
  const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
      const handler = setTimeout(() => setDebouncedValue(value), delay);
      return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
  };
  const debouncedCustomerSearchQuery = useDebounce(customerSearchQuery, 500);

  // ===== Banking UI state =====
  const [bankDetails, setBankDetails] = useState<BankDetails>(() => {
    try {
      const raw = localStorage.getItem(INVOICE_BANK_LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      accountName: '',
      bankName: '',
      accountNumber: '',
      branchCode: '',
      accountType: '',
      swift: '',
      referenceHint: 'Please use the invoice number as reference',
    };
  });
  const [includeBankInNotes, setIncludeBankInNotes] = useState(true);
  const [saveBankAsDefault, setSaveBankAsDefault] = useState(false);

  const bankPreview = useMemo(
    () => (includeBankInNotes ? renderBankBlock(bankDetails, formData.currency) : ''),
    [includeBankInNotes, bankDetails, formData.currency]
  );

  useEffect(() => {
    if (saveBankAsDefault) {
      try {
        localStorage.setItem(INVOICE_BANK_LOCAL_KEY, JSON.stringify(bankDetails));
      } catch {}
    }
  }, [saveBankAsDefault, bankDetails]);

  // Products load + edit hydrate
  useEffect(() => {
    const fetchProducts = async () => {
      if (!isAuthenticated || !token) {
        setProductsServices([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data: ProductService[] = await res.json();
        setProductsServices(data);
      } catch (e: any) {
        console.error('Failed to fetch products/services:', e);
        toast({
          title: 'Error',
          description: e.message || 'Failed to load products and services.',
          variant: 'destructive',
        });
      }
    };

    if (isAuthenticated && token) {
      fetchProducts();
    } else {
      setProductsServices([]);
    }

    // Hydrate when editing
    if (invoice) {
      setFormData({
        invoice_number: invoice.invoice_number || '',
        customer_id: invoice.customer_id || null,
        customer_name_manual: invoice.customer_id ? '' : (invoice.customer_name || ''),
        invoice_date: invoice.invoice_date
          ? new Date(invoice.invoice_date).toISOString().split('T')[0]
          : initialInvoiceDate,
        due_date: invoice.due_date
          ? new Date(invoice.due_date).toISOString().split('T')[0]
          : getDefaultDueDate(invoice.invoice_date || initialInvoiceDate),
        status: invoice.status || 'Draft',
        currency: invoice.currency || 'ZAR',
        notes: invoice.notes || '',
        line_items:
          invoice.line_items?.map((item: any) => ({
            ...item,
            quantity: parseFloat(item.quantity) || 0,
            unit_price: parseFloat(item.unit_price) || 0,
            tax_rate: parseFloat(item.tax_rate) || 0,
            line_total: parseFloat(item.line_total) || 0,
          })) || [],
      });

      if (invoice.customer_id) {
        const fetchInitialCustomer = async () => {
          if (!isAuthenticated || !token) return;
          try {
            const res = await fetch(`${API_BASE_URL}/api/customers/${invoice.customer_id}`, {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              setCustomerSearchQuery(data.name);
            } else {
              setCustomerSearchQuery(invoice.customer_name || '');
            }
          } catch {
            setCustomerSearchQuery(invoice.customer_name || '');
          }
        };
        fetchInitialCustomer();
      } else if (invoice.customer_name) {
        setCustomerSearchQuery(invoice.customer_name);
      }
    }
  }, [invoice, toast, initialInvoiceDate, isAuthenticated, token]);

  // Customer suggestions
  useEffect(() => {
    const fetchCustomerSuggestions = async () => {
      if (!isAuthenticated || !token) {
        setCustomerSuggestions([]);
        setIsSearchingCustomers(false);
        setShowCustomerSuggestions(false);
        return;
      }
      if (debouncedCustomerSearchQuery.length < 2) {
        setCustomerSuggestions([]);
        setIsSearchingCustomers(false);
        setShowCustomerSuggestions(false);
        return;
      }
      setIsSearchingCustomers(true);
      setShowCustomerSuggestions(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/customers/search?query=${encodeURIComponent(debouncedCustomerSearchQuery)}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data: Customer[] = await res.json();
        setCustomerSuggestions(data);
      } catch (e: any) {
        console.error('Failed to fetch customer suggestions:', e);
        toast({
          title: 'Error',
          description: e.message || 'Failed to search customers.',
          variant: 'destructive',
        });
        setCustomerSuggestions([]);
      } finally {
        setIsSearchingCustomers(false);
      }
    };

    if (isAuthenticated && token) fetchCustomerSuggestions();
    else {
      setCustomerSuggestions([]);
      setIsSearchingCustomers(false);
      setShowCustomerSuggestions(false);
    }
  }, [debouncedCustomerSearchQuery, toast, isAuthenticated, token]);

  // totals
  useEffect(() => {
    const total = formData.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    setTotalAmount(total);
  }, [formData.line_items]);

  // handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCustomerSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerSearchQuery(value);
    setFormData(prev => ({ ...prev, customer_id: null, customer_name_manual: value }));
    setShowCustomerSuggestions(true);
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleCustomerSuggestionClick = (customer: Customer | 'free-text-entry') => {
    if (customer === 'free-text-entry') {
      const trimmed = customerSearchQuery.trim();
      setFormData(prev => ({ ...prev, customer_id: null, customer_name_manual: trimmed }));
      setCustomerSearchQuery(trimmed);
    } else {
      const selected = customerSuggestions.find(c => c.id === customer.id);
      if (selected) {
        setFormData(prev => ({ ...prev, customer_id: selected.id, customer_name_manual: '' }));
        setCustomerSearchQuery(selected.name);
      }
    }
    setCustomerSuggestions([]);
    setShowCustomerSuggestions(false);
  };

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updated = [...formData.line_items];
    let item = { ...updated[index] };

    if (field === 'quantity' || field === 'unit_price' || field === 'tax_rate') {
      const parsed = parseFloat(value);
      (item as any)[field] = isNaN(parsed) ? 0 : parsed;
    } else {
      (item as any)[field] = value;
    }

    const qty = item.quantity || 0;
    const price = item.unit_price || 0;
    const tax = item.tax_rate || 0;
    item.line_total = parseFloat((qty * price * (1 + tax)).toFixed(2));

    updated[index] = item;
    setFormData(prev => ({ ...prev, line_items: updated }));
  };

  const handleProductServiceSelect = (index: number, productId: string) => {
    const product = productsServices.find(p => p.id === productId);
    const updated = [...formData.line_items];
    const item = { ...updated[index] };

    if (product) {
      item.product_service_id = product.id;
      item.description = product.name;
      item.unit_price = product.price;
      item.quantity = item.quantity || 1;
      item.tax_rate = product.vatRate ?? 0.0;
      item.line_total = parseFloat((item.quantity * item.unit_price * (1 + item.tax_rate)).toFixed(2));
    } else {
      item.product_service_id = null;
      if (updated[index].product_service_id && productsServices.some(p => p.id === updated[index].product_service_id)) {
        item.description = '';
      }
      item.unit_price = 0;
      item.quantity = 0;
      item.tax_rate = 0.0;
      item.line_total = 0;
    }
    updated[index] = item;
    setFormData(prev => ({ ...prev, line_items: updated }));
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      line_items: [
        ...prev.line_items,
        {
          product_service_id: null,
          description: '',
          quantity: 0,
          unit_price: 0,
          line_total: 0,
          tax_rate: 0,
        },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== index),
    }));
  };

  // ===== submit =====
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!isAuthenticated || !token) {
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to create/update invoices.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (!formData.invoice_number || !formData.invoice_date || !formData.due_date || formData.line_items.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required invoice details and add at least one line item.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (!formData.customer_id && !formData.customer_name_manual?.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please select an existing customer or enter a new customer name.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const invalid = formData.line_items.some(i => !i.description?.trim() || i.quantity <= 0 || i.unit_price <= 0);
    if (invalid) {
      toast({
        title: 'Line Item Error',
        description: 'Each line item must have a description, a positive quantity, and a positive unit price.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Build notes incl. Payment Details block
    let finalNotes = formData.notes || '';
    if (includeBankInNotes) {
      const block = renderBankBlock(bankDetails, formData.currency);
      finalNotes = upsertBankBlockIntoNotes(finalNotes, block);
    } else {
      // remove if user disabled appending
      finalNotes = upsertBankBlockIntoNotes(finalNotes, '');
    }

    const total_amount = formData.line_items.reduce((sum, i) => sum + (i.line_total || 0), 0);

    const payload: Omit<InvoiceFormData, 'customer_name_manual'> & { customer_name?: string; total_amount: number } = {
      ...formData,
      notes: finalNotes,
      total_amount,
    };

    if (payload.customer_id) {
      delete (payload as any).customer_name_manual;
    } else {
      payload.customer_name = formData.customer_name_manual?.trim();
      if (!payload.customer_name) {
        toast({
          title: 'Validation Error',
          description: 'Customer name is required for new customers if no existing customer is selected.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      delete (payload as any).customer_id;
      delete (payload as any).customer_name_manual;
    }

    const url = invoice ? `${API_BASE_URL}/api/invoices/${invoice.id}` : `${API_BASE_URL}/api/invoices`;
    const method = invoice ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      if (saveBankAsDefault) {
        try {
          localStorage.setItem(INVOICE_BANK_LOCAL_KEY, JSON.stringify(bankDetails));
        } catch {}
      }

      toast({
        title: invoice ? 'Invoice Updated' : 'Invoice Created',
        description: `Invoice ${formData.invoice_number} has been successfully ${invoice ? 'updated' : 'created'}.`,
        variant: 'default',
      });

      onSubmitSuccess();
      onClose();
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: 'Submission Failed',
        description: `Failed to ${invoice ? 'update' : 'create'} invoice: ${error?.message || String(error)}.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ===== render =====
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={onClose} className="rounded-full" disabled={isLoading}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <CardTitle>Invoice Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input
                id="invoice_number"
                name="invoice_number"
                value={formData.invoice_number}
                onChange={handleInputChange}
                placeholder="e.g., INV-2024-001"
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="customer_search">Customer</Label>
              <div className="relative" ref={customerInputRef}>
                <Input
                  id="customer_search"
                  type="text"
                  value={customerSearchQuery}
                  onChange={handleCustomerSearchInputChange}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  placeholder="Search or enter customer name"
                  className="mb-2"
                  autoComplete="off"
                  disabled={isLoading}
                />
                {isSearchingCustomers && customerSearchQuery.length >= 2 && (
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
                  </div>
                )}
                {customerSearchQuery.length < 2 && !formData.customer_id && !isSearchingCustomers && (
                  <p className="text-sm text-muted-foreground mt-1">Type at least 2 characters to search for customers.</p>
                )}
                {showCustomerSuggestions && (customerSuggestions.length > 0 || customerSearchQuery.length >= 2) && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                    {customerSuggestions.length > 0 ? (
                      <>
                        <div className="px-4 py-2 text-sm font-semibold text-gray-500 border-b">Existing Customers</div>
                        {customerSuggestions.map(customer => (
                          <div
                            key={customer.id}
                            className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                            onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick(customer); }}
                          >
                            {customer.name}
                          </div>
                        ))}
                        {customerSearchQuery.length > 0 &&
                          !customerSuggestions.some(c => c.name.toLowerCase() === customerSearchQuery.toLowerCase()) && (
                            <div
                              className="px-4 py-2 cursor-pointer hover:bg-gray-100 border-t"
                              onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick('free-text-entry'); }}
                            >
                              Use "{customerSearchQuery}" (New Customer)
                            </div>
                          )}
                      </>
                    ) : (
                      customerSearchQuery.length >= 2 && !isSearchingCustomers && (
                        <div
                          className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                          onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick('free-text-entry'); }}
                        >
                          No existing customers found. Use "{customerSearchQuery}" as a New Customer
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input
                id="invoice_date"
                name="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                value={formData.due_date}
                onChange={handleInputChange}
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={formData.status}
                onValueChange={value => handleSelectChange('status', value)}
                required
                disabled={isLoading}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Sent">Sent</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                placeholder="e.g., ZAR"
                required
                disabled={isLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Any additional notes for the invoice..."
              rows={3}
              disabled={isLoading}
            />
            {includeBankInNotes && bankPreview && (
              <div className="mt-2 rounded-md border bg-muted/50 p-3 text-sm">
                <div className="font-medium mb-1">Will append:</div>
                <pre className="whitespace-pre-wrap">{bankPreview}</pre>
              </div>
            )}
          </div>

          {/* Banking details */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-base">Payment / Banking Details</Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeBankInNotes}
                    onChange={(e) => setIncludeBankInNotes(e.target.checked)}
                  />
                  Append to notes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveBankAsDefault}
                    onChange={(e) => setSaveBankAsDefault(e.target.checked)}
                  />
                  Save as default
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Account Name</Label>
                <Input
                  value={bankDetails.accountName}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                  placeholder="e.g., Q Analytics (Pty) Ltd"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>Bank</Label>
                <Input
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                  placeholder="e.g., FNB / ABSA / Standard Bank"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input
                  value={bankDetails.accountNumber}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                  placeholder="e.g., 1234567890"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>Branch Code</Label>
                <Input
                  value={bankDetails.branchCode}
                  onChange={(e) => setBankDetails({ ...bankDetails, branchCode: e.target.value })}
                  placeholder="e.g., 250655"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>Account Type (optional)</Label>
                <Input
                  value={bankDetails.accountType || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
                  placeholder="Cheque / Savings / Business"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>SWIFT/BIC (optional)</Label>
                <Input
                  value={bankDetails.swift || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, swift: e.target.value })}
                  placeholder="For international payments"
                  disabled={isLoading}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Reference Hint (optional)</Label>
                <Input
                  value={bankDetails.referenceHint || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, referenceHint: e.target.value })}
                  placeholder="e.g., Use invoice number as reference"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const block = renderBankBlock(bankDetails, formData.currency);
                  setFormData(fd => ({ ...fd, notes: upsertBankBlockIntoNotes(fd.notes || '', block) }));
                }}
                disabled={isLoading}
              >
                Insert into notes now
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setBankDetails({
                    accountName: '',
                    bankName: '',
                    accountNumber: '',
                    branchCode: '',
                    accountType: '',
                    swift: '',
                    referenceHint: '',
                  })
                }
                disabled={isLoading}
              >
                Clear fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.line_items.map((item, index) => (
            <div key={item.id || index} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end border-b pb-4 last:border-b-0 last:pb-0">
              <div className="md:col-span-2">
                <Label htmlFor={`product_service_id-${index}`}>Product/Service</Label>
                <Select
                  name={`product_service_id-${index}`}
                  value={item.product_service_id || 'custom-item'}
                  onValueChange={(value) => handleProductServiceSelect(index, value === 'custom-item' ? '' : value)}
                  disabled={isLoading}
                >
                  <SelectTrigger id={`product_service_id-${index}`}>
                    <SelectValue placeholder="Select Product/Service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom-item">Custom Item</SelectItem>
                    {productsServices.map(ps => (
                      <SelectItem key={ps.id} value={ps.id}>
                        {ps.name} ({formData.currency}{(ps.price ?? 0).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`description-${index}`}>Description</Label>
                <Input
                  id={`description-${index}`}
                  name="description"
                  value={item.description}
                  onChange={e => handleLineItemChange(index, 'description', e.target.value)}
                  placeholder="Description"
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor={`quantity-${index}`}>Qty</Label>
                <Input
                  id={`quantity-${index}`}
                  name="quantity"
                  type="number"
                  value={item.quantity}
                  onChange={e => handleLineItemChange(index, 'quantity', e.target.value)}
                  placeholder="Qty"
                  min="0"
                  step="0.01"
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor={`unit_price-${index}`}>Unit Price</Label>
                <Input
                  id={`unit_price-${index}`}
                  name="unit_price"
                  type="number"
                  value={item.unit_price}
                  onChange={e => handleLineItemChange(index, 'unit_price', e.target.value)}
                  placeholder="Price"
                  min="0"
                  step="0.01"
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor={`tax_rate-${index}`}>Tax Rate</Label>
                <Select
                  name="tax_rate"
                  value={item.tax_rate.toString()}
                  onValueChange={value => handleLineItemChange(index, 'tax_rate', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger id={`tax_rate-${index}`}>
                    <SelectValue placeholder="Select VAT" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Label className="whitespace-nowrap">
                  Total: {formData.currency}{(item.line_total ?? 0).toFixed(2)}
                </Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(index)} disabled={isLoading}>
                  <XCircle className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addLineItem} className="w-full" disabled={isLoading}>
            <Plus className="h-4 w-4 mr-2" /> Add Line Item
          </Button>
        </CardContent>
      </Card>

      <div className="text-right text-xl font-bold mt-4">
        Total Invoice Amount: {formData.currency}{totalAmount.toFixed(2)}
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {invoice ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}
