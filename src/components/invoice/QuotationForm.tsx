import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Define API Base URL
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

// ===== Types =====
export interface QuotationLineItem {
  id?: string;
  product_service_id: string | null;
  product_service_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email?: string;
  quotation_date: string;
  expiry_date: string;
  status: string;
  currency: string;
  notes: string;
  total_amount: number;
  line_items: QuotationLineItem[];
  created_at: string;
  updated_at: string;
}

interface QuotationFormData {
  quotation_number: string;
  customer_id: string | null;
  customer_name_manual?: string;
  quotation_date: string;
  expiry_date: string;
  status: string;
  currency: string;
  notes: string;
  line_items: QuotationLineItem[];
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

interface QuotationFormProps {
  quotation?: Quotation;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

// ===== Helpers =====
const generateQuotationNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `QUO-${y}${m}${d}-${hh}${mm}${ss}-${r}`;
};

const VAT_OPTIONS = [
  { value: 0.0, label: '0%' },
  { value: 0.15, label: '15%' },
];

// ===== Banking block helpers (same behavior as invoice) =====
type BankDetails = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType?: string;
  swift?: string;
  referenceHint?: string;
};

const QUOTATION_BANK_LOCAL_KEY = 'quotationBankDefaults_v1';

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
  const trimmedNotes = (notes || '').trim();

  if (!newBlock.trim()) {
    // remove existing block if present
    return trimmedNotes.replace(re, '').trim();
  }
  if (trimmedNotes.includes(startMarker)) {
    // replace
    return trimmedNotes.replace(re, newBlock).trim();
  }
  // append
  return [trimmedNotes, newBlock].filter(Boolean).join('\n\n').trim();
}

export function QuotationForm({ quotation, onClose, onSubmitSuccess }: QuotationFormProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const getDefaultExpiryDate = (quotationDateString: string) => {
    const quotationDate = new Date(quotationDateString);
    const expiryDate = new Date(quotationDate);
    expiryDate.setDate(quotationDate.getDate() + 30);
    return expiryDate.toISOString().split('T')[0];
  };

  const initialQuotationDate = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<QuotationFormData>({
    quotation_number: quotation ? quotation.quotation_number : generateQuotationNumber(),
    customer_id: null,
    customer_name_manual: '',
    quotation_date: initialQuotationDate,
    expiry_date: getDefaultExpiryDate(initialQuotationDate),
    status: 'Draft',
    currency: 'R',
    notes: '',
    line_items: [],
  });

  const [productsServices, setProductsServices] = useState<ProductService[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Customer search UI
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);

  // Debounce
  const useDebounce = (value: string, delay: number) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
  };
  const debouncedCustomerSearchQuery = useDebounce(customerSearchQuery, 500);

  // ===== Banking details UI state =====
  const [bankDetails, setBankDetails] = useState<BankDetails>(() => {
    try {
      const raw = localStorage.getItem(QUOTATION_BANK_LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      accountName: '',
      bankName: '',
      accountNumber: '',
      branchCode: '',
      accountType: '',
      swift: '',
      referenceHint: 'Please use the quotation number as reference',
    };
  });
  const [includeBankInNotes, setIncludeBankInNotes] = useState(true);
  const [saveBankAsDefault, setSaveBankAsDefault] = useState(false);

  const bankPreview = useMemo(
    () => (includeBankInNotes ? renderBankBlock(bankDetails, formData.currency) : ''),
    [includeBankInNotes, bankDetails, formData.currency]
  );

  // Save defaults
  useEffect(() => {
    if (saveBankAsDefault) {
      try {
        localStorage.setItem(QUOTATION_BANK_LOCAL_KEY, JSON.stringify(bankDetails));
      } catch {}
    }
  }, [saveBankAsDefault, bankDetails]);

  // Load products
  useEffect(() => {
    const fetchProducts = async () => {
      if (!isAuthenticated || !token) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to load products and services.',
          variant: 'destructive',
        });
        setProductsServices([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          headers: { Authorization: `Bearer ${token}` },
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

    if (isAuthenticated && token) fetchProducts();
    else setProductsServices([]);

    // Populate when editing
    if (quotation) {
      setFormData({
        quotation_number: quotation.quotation_number || '',
        customer_id: quotation.customer_id || null,
        customer_name_manual: quotation.customer_id ? '' : (quotation.customer_name || ''),
        quotation_date: quotation.quotation_date
          ? new Date(quotation.quotation_date).toISOString().split('T')[0]
          : initialQuotationDate,
        expiry_date: quotation.expiry_date
          ? new Date(quotation.expiry_date).toISOString().split('T')[0]
          : getDefaultExpiryDate(quotation.quotation_date || initialQuotationDate),
        status: quotation.status || 'Draft',
        currency: quotation.currency || 'R',
        notes: quotation.notes || '',
        line_items:
          quotation.line_items?.map((item: any) => ({
            ...item,
            quantity: parseFloat(item.quantity || 0) || 0,
            unit_price: parseFloat(item.unit_price || 0) || 0,
            tax_rate: parseFloat(item.tax_rate || 0) || 0,
            line_total: parseFloat(item.line_total || 0) || 0,
          })) || [],
      });

      // Pre-display customer name
      if (quotation.customer_id) {
        (async () => {
          if (!isAuthenticated || !token) return;
          try {
            const r = await fetch(`${API_BASE_URL}/api/customers/${quotation.customer_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (r.ok) {
              const data = await r.json();
              setCustomerSearchQuery(data.name);
            }
          } catch (err) {
            console.error('Failed to fetch initial customer:', err);
          }
        })();
      } else if (quotation.customer_name) {
        setCustomerSearchQuery(quotation.customer_name);
      }
    }
  }, [quotation, toast, isAuthenticated, token, initialQuotationDate]);

  // Search customers
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
          { headers: { Authorization: `Bearer ${token}` } }
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

  // Totals
  useEffect(() => {
    const total = formData.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    setTotalAmount(total);
  }, [formData.line_items]);

  // ===== Handlers =====
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
    const handleClickOutside = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleLineItemChange = (index: number, field: keyof QuotationLineItem, value: any) => {
    const updated = [...formData.line_items];
    let item = { ...updated[index] };

    if (field === 'tax_rate') {
      const parsed = parseFloat(value);
      item[field] = isNaN(parsed) ? 0 : parsed;
    } else if (field === 'quantity' || field === 'unit_price') {
      const parsed = parseFloat(value);
      item[field] = isNaN(parsed) ? 0 : parsed;
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

  // ===== Submit =====
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!isAuthenticated || !token) {
      toast({
        title: 'Authentication Required',
        description: 'You must be logged in to create or update quotations.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Validation
    if (!formData.quotation_number || !formData.quotation_date || !formData.expiry_date || formData.line_items.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required quotation details and add at least one line item.',
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

    const invalidItem = formData.line_items.some(i => !i.description || i.quantity <= 0 || i.unit_price <= 0);
    if (invalidItem) {
      toast({
        title: 'Line Item Error',
        description: 'Each line item must have a description, a positive quantity, and a positive unit price.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Build notes with bank block
    let finalNotes = formData.notes || '';
    if (includeBankInNotes) {
      const block = renderBankBlock(bankDetails, formData.currency);
      finalNotes = upsertBankBlockIntoNotes(finalNotes, block);
    } else {
      // strip any existing block if user disabled it
      finalNotes = upsertBankBlockIntoNotes(finalNotes, '');
    }

    const total_amount = formData.line_items.reduce((sum, i) => sum + (i.line_total || 0), 0);

    const payload: Omit<QuotationFormData, 'customer_name_manual'> & {
      customer_name?: string;
      total_amount: number;
    } = {
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

    const url = quotation ? `${API_BASE_URL}/api/quotations/${quotation.id}` : `${API_BASE_URL}/api/quotations`;
    const method = quotation ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (saveBankAsDefault) {
        try {
          localStorage.setItem(QUOTATION_BANK_LOCAL_KEY, JSON.stringify(bankDetails));
        } catch {}
      }

      toast({
        title: quotation ? 'Quotation Updated' : 'Quotation Created',
        description: `Quotation ${formData.quotation_number} has been successfully ${quotation ? 'updated' : 'created'}.`,
        variant: 'default',
      });

      onSubmitSuccess();
      onClose();
    } catch (e: any) {
      console.error('Submission error:', e);
      toast({
        title: 'Submission Failed',
        description: `Failed to ${quotation ? 'update' : 'create'} quotation: ${e?.message || String(e)}.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Render =====
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full"
              disabled={isLoading}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <CardTitle>Quotation Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quotation_number">Quotation Number</Label>
              <Input
                id="quotation_number"
                name="quotation_number"
                value={formData.quotation_number}
                onChange={handleInputChange}
                placeholder="e.g., QUO-2024-001"
                required
                disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
              <Label htmlFor="quotation_date">Quotation Date</Label>
              <Input
                id="quotation_date"
                name="quotation_date"
                type="date"
                value={formData.quotation_date}
                onChange={handleInputChange}
                required
                disabled={!isAuthenticated || isLoading}
              />
            </div>
            <div>
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                name="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={handleInputChange}
                required
                disabled={!isAuthenticated || isLoading}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={formData.status}
                onValueChange={value => handleSelectChange('status', value)}
                required
                disabled={!isAuthenticated || isLoading}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Sent">Sent</SelectItem>
                  <SelectItem value="Accepted">Accepted</SelectItem>
                  <SelectItem value="Declined">Declined</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
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
              placeholder="Any additional notes for the quotation..."
              rows={3}
              disabled={!isAuthenticated || isLoading}
            />
            {includeBankInNotes && bankPreview && (
              <div className="mt-2 rounded-md border bg-muted/50 p-3 text-sm">
                <div className="font-medium mb-1">Will append:</div>
                <pre className="whitespace-pre-wrap">{bankPreview}</pre>
              </div>
            )}
          </div>

          {/* Banking details section */}
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
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label>Bank</Label>
                <Input
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                  placeholder="e.g., FNB / ABSA / Standard Bank"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input
                  value={bankDetails.accountNumber}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                  placeholder="e.g., 1234567890"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label>Branch Code</Label>
                <Input
                  value={bankDetails.branchCode}
                  onChange={(e) => setBankDetails({ ...bankDetails, branchCode: e.target.value })}
                  placeholder="e.g., 250655"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label>Account Type (optional)</Label>
                <Input
                  value={bankDetails.accountType || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
                  placeholder="Cheque / Savings / Business"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label>SWIFT/BIC (optional)</Label>
                <Input
                  value={bankDetails.swift || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, swift: e.target.value })}
                  placeholder="For international payments"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Reference Hint (optional)</Label>
                <Input
                  value={bankDetails.referenceHint || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, referenceHint: e.target.value })}
                  placeholder="e.g., Use quotation number as reference"
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const block = renderBankBlock(bankDetails, formData.currency);
                  setFormData((fd) => ({ ...fd, notes: upsertBankBlockIntoNotes(fd.notes || '', block) }));
                }}
                disabled={!isAuthenticated || isLoading}
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
                disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label htmlFor={`tax_rate-${index}`}>Tax Rate</Label>
                <Select
                  name="tax_rate"
                  value={item.tax_rate.toString()}
                  onValueChange={value => handleLineItemChange(index, 'tax_rate', value)}
                  disabled={!isAuthenticated || isLoading}
                >
                  <SelectTrigger id={`tax_rate-${index}`}>
                    <SelectValue placeholder="Select VAT" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Label className="whitespace-nowrap">
                  Total: {formData.currency}{(item.line_total ?? 0).toFixed(2)}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLineItem(index)}
                  disabled={!isAuthenticated || isLoading}
                >
                  <XCircle className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addLineItem}
            className="w-full"
            disabled={!isAuthenticated || isLoading}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Line Item
          </Button>
        </CardContent>
      </Card>

      <div className="text-right text-xl font-bold mt-4">
        Total Quotation Amount: {formData.currency}{totalAmount.toFixed(2)}
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isAuthenticated || isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {quotation ? 'Update Quotation' : 'Create Quotation'}
        </Button>
      </div>
    </form>
  );
}
