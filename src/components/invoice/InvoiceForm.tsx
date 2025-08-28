import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useAuth } from '../../AuthPage'; // Import useAuth

// --- ADD/MOVE THESE INTERFACE DEFINITIONS HERE ---
// These interfaces are now defined and exported directly from InvoiceForm.tsx
export interface InvoiceLineItem {
  id?: string; // Optional for new line items, populated on edit
  product_service_id: string | null; // Can be null for custom items
  product_service_name?: string; // For display, comes from backend JOIN (not sent to backend)
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number; // Decimal (e.g., 0.15)
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null; // Can be null if customer_name is used
  customer_name: string;
  customer_email?: string; // Optional, might be from backend
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[]; // Optional in case it's not populated initially
}

// --- InvoiceFormData and other interfaces remain as is ---
interface InvoiceFormData {
  invoice_number: string;
  customer_id: string | null; // Null if new customer or not yet selected
  customer_name_manual?: string; // For new or free-text customer entry
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
  // email: string; // Not strictly needed for form, but good to have if we ever pre-fill
}

interface InvoiceFormProps {
  invoice?: Invoice; // Now using the locally defined Invoice interface
  onClose: () => void;
  onSubmitSuccess: () => void;
}

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Define your API base URL

const generateInvoiceNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
};

const VAT_OPTIONS = [
  { value: 0.00, label: '0%' },
  { value: 0.15, label: '15%' },
];

export function InvoiceForm({ invoice, onClose, onSubmitSuccess }: InvoiceFormProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth(); // Get authentication status
  const token = localStorage.getItem('token'); // Retrieve the token

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

  const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
      return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
  };

  const debouncedCustomerSearchQuery = useDebounce(customerSearchQuery, 500);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!token) {
        console.warn('No token found. User is not authenticated for products/services.');
        setProductsServices([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`, // Include the JWT token
          },
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
        }
        const data: ProductService[] = await res.json();
        setProductsServices(data);
      } catch (error: any) {
        console.error('Failed to fetch products/services:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load products and services. Please try again.',
          variant: 'destructive',
        });
      }
    };

    if (isAuthenticated && token) { // Only fetch if authenticated
      fetchProducts();
    } else {
      setProductsServices([]);
    }


    if (invoice) {
      setFormData({
        invoice_number: invoice.invoice_number || '',
        customer_id: invoice.customer_id || null,
        customer_name_manual: invoice.customer_id ? '' : (invoice.customer_name || ''),
        invoice_date: invoice.invoice_date ? new Date(invoice.invoice_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        due_date: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : getDefaultDueDate(invoice.invoice_date || initialInvoiceDate),
        status: invoice.status || 'Draft',
        currency: invoice.currency || 'ZAR',
        notes: invoice.notes || '',
        line_items: invoice.line_items?.map((item: any) => ({
          ...item,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          tax_rate: parseFloat(item.tax_rate) || 0,
          line_total: parseFloat(item.line_total) || 0,
        })) || [],
      });

      if (invoice.customer_id) {
        const fetchInitialCustomer = async () => {
          if (!token) return; // Ensure token exists for this fetch
          try {
            const res = await fetch(`${API_BASE_URL}/api/customers/${invoice.customer_id}`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`, // Include the JWT token
              },
            });
            if (res.ok) {
              const data = await res.json();
              setCustomerSearchQuery(data.name);
            } else {
              console.warn(`Customer with ID ${invoice.customer_id} not found.`);
              setCustomerSearchQuery(invoice.customer_name || '');
            }
          } catch (err) {
            console.error('Failed to fetch initial customer:', err);
            setCustomerSearchQuery(invoice.customer_name || '');
          }
        };
        if (isAuthenticated && token) { // Only fetch if authenticated
          fetchInitialCustomer();
        }
      } else if (invoice.customer_name) {
        setCustomerSearchQuery(invoice.customer_name);
      }
    }
  }, [invoice, toast, initialInvoiceDate, isAuthenticated, token]); // Add isAuthenticated and token to dependencies

  useEffect(() => {
    const fetchCustomerSuggestions = async () => {
      if (debouncedCustomerSearchQuery.length < 2) {
        setCustomerSuggestions([]);
        setIsSearchingCustomers(false);
        setShowCustomerSuggestions(false);
        return;
      }
      if (!token) {
        console.warn('No token found. User is not authenticated for customer search.');
        setCustomerSuggestions([]);
        setIsSearchingCustomers(false);
        setShowCustomerSuggestions(false);
        return;
      }

      setIsSearchingCustomers(true);
      setShowCustomerSuggestions(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/customers/search?query=${encodeURIComponent(debouncedCustomerSearchQuery)}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`, // Include the JWT token
          },
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
        }
        const data: Customer[] = await res.json();
        setCustomerSuggestions(data);
      } catch (error: any) {
        console.error('Failed to fetch customer suggestions:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to search customers. Please try again.',
          variant: 'destructive',
        });
        setCustomerSuggestions([]);
      } finally {
        setIsSearchingCustomers(false);
      }
    };

    if (isAuthenticated && token) { // Only fetch if authenticated
      fetchCustomerSuggestions();
    } else {
      setCustomerSuggestions([]);
      setIsSearchingCustomers(false);
      setShowCustomerSuggestions(false);
    }
  }, [debouncedCustomerSearchQuery, toast, isAuthenticated, token]); // Add isAuthenticated and token to dependencies

  useEffect(() => {
    const calculatedTotal = formData.line_items.reduce(
      (sum, item) => sum + (item.line_total || 0),
      0
    );
    setTotalAmount(calculatedTotal);
  }, [formData.line_items]);

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

  const handleCustomerSuggestionClick = (customer: Customer | 'free-text-entry') => {
    if (customer === 'free-text-entry') {
      const trimmedQuery = customerSearchQuery.trim();
      setFormData(prev => ({
        ...prev,
        customer_id: null,
        customer_name_manual: trimmedQuery,
      }));
      setCustomerSearchQuery(trimmedQuery);
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updatedItems = [...formData.line_items];
    let itemToUpdate = { ...updatedItems[index] };

    if (['quantity', 'unit_price', 'tax_rate'].includes(field)) {
        const parsedValue = parseFloat(value);
        itemToUpdate[field] = isNaN(parsedValue) ? 0 : parsedValue;
    } else {
      itemToUpdate[field] = value;
    }

    const qty = itemToUpdate.quantity;
    const price = itemToUpdate.unit_price;
    const taxRate = itemToUpdate.tax_rate;

    const calculatedLineTotal = qty * price * (1 + taxRate);
    itemToUpdate.line_total = parseFloat(calculatedLineTotal.toFixed(2));

    updatedItems[index] = itemToUpdate;
    setFormData(prev => ({ ...prev, line_items: updatedItems }));
  };

  const handleProductServiceSelect = (index: number, productId: string) => {
    const product = productsServices.find(p => p.id === productId);
    const updatedItems = [...formData.line_items];
    const item = { ...updatedItems[index] };

    if (product) {
      item.product_service_id = product.id;
      item.description = product.name;
      item.unit_price = product.price;
      item.quantity = item.quantity || 1;
      item.tax_rate = product.vatRate ?? 0.00;
      item.line_total = parseFloat((item.quantity * item.unit_price * (1 + item.tax_rate)).toFixed(2));
    } else {
      item.product_service_id = null;
      if (updatedItems[index].product_service_id && productsServices.some(p => p.id === updatedItems[index].product_service_id)) {
        item.description = '';
      }
      item.unit_price = 0;
      item.quantity = 0;
      item.tax_rate = 0.00;
      item.line_total = 0;
    }
    updatedItems[index] = item;
    setFormData(prev => ({ ...prev, line_items: updatedItems }));
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
          tax_rate: 0.15,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!token) {
      console.warn('No token found. Cannot submit invoice.');
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to create/update invoices.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (
      !formData.invoice_number ||
      !formData.invoice_date ||
      !formData.due_date ||
      formData.line_items.length === 0
    ) {
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

    const invalidLineItem = formData.line_items.some(item =>
      !item.description?.trim() || item.quantity <= 0 || item.unit_price <= 0
    );
    if (invalidLineItem) {
      toast({
        title: 'Line Item Error',
        description: 'Each line item must have a description, a positive quantity, and a positive unit price.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const payload: Omit<InvoiceFormData, 'customer_name_manual'> & { customer_name?: string; total_amount: number; } = {
        ...formData,
        total_amount: totalAmount,
    };

    if (payload.customer_id) {
        delete payload.customer_name_manual;
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
        delete payload.customer_id;
        delete payload.customer_name_manual;
    }

    const url = invoice ? `${API_BASE_URL}/api/invoices/${invoice.id}` : `${API_BASE_URL}/api/invoices`;
    const method = invoice ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      toast({
        title: invoice ? 'Invoice Updated' : 'Invoice Created',
        description: `Invoice ${formData.invoice_number} has been successfully ${invoice ? 'updated' : 'created'}.`,
        variant: 'default',
      });

      onSubmitSuccess();
      onClose();
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: 'Submission Failed',
        description: `Failed to ${invoice ? 'update' : 'create'} invoice: ${error instanceof Error ? error.message : String(error)}.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <CardTitle>Invoice Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='invoice_number'>Invoice Number</Label>
              <Input
                id='invoice_number'
                name='invoice_number'
                value={formData.invoice_number}
                onChange={handleInputChange}
                placeholder='e.g., INV-2024-001'
                required
              />
            </div>
            <div>
              <Label htmlFor='customer_search'>Customer</Label>
              <div className="relative">
                <Input
                  id="customer_search"
                  type="text"
                  value={customerSearchQuery}
                  onChange={handleCustomerSearchInputChange}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  placeholder="Search or enter customer name"
                  className="mb-2"
                  ref={customerInputRef}
                  autoComplete="off"
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
              <Label htmlFor='invoice_date'>Invoice Date</Label>
              <Input
                id='invoice_date'
                name='invoice_date'
                type='date'
                value={formData.invoice_date}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <Label htmlFor='due_date'>Due Date</Label>
              <Input
                id='due_date'
                name='due_date'
                type='date'
                value={formData.due_date}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <Label htmlFor='status'>Status</Label>
              <Select
                name='status'
                value={formData.status}
                onValueChange={value => handleSelectChange('status', value)}
                required
              >
                <SelectTrigger id='status'>
                  <SelectValue placeholder='Select Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='Draft'>Draft</SelectItem>
                  <SelectItem value='Sent'>Sent</SelectItem>
                  <SelectItem value='Paid'>Paid</SelectItem>
                  <SelectItem value='Overdue'>Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor='currency'>Currency</Label>
              <Input
                id='currency'
                name='currency'
                value={formData.currency}
                onChange={handleInputChange}
                placeholder='e.g., ZAR'
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor='notes'>Notes</Label>
            <Textarea
              id='notes'
              name='notes'
              value={formData.notes}
              onChange={handleInputChange}
              placeholder='Any additional notes for the invoice...'
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {formData.line_items.map((item, index) => (
            <div key={item.id || index} className='grid grid-cols-1 md:grid-cols-6 gap-3 items-end border-b pb-4 last:border-b-0 last:pb-0'>
              <div className='md:col-span-2'>
                <Label htmlFor={`product_service_id-${index}`}>Product/Service</Label>
                <Select
                  name={`product_service_id-${index}`}
                  value={item.product_service_id || 'custom-item'}
                  onValueChange={value => handleProductServiceSelect(index, value === 'custom-item' ? '' : value)}
                >
                  <SelectTrigger id={`product_service_id-${index}`}>
                    <SelectValue placeholder='Select Product/Service' />
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
                  name='description'
                  value={item.description}
                  onChange={e => handleLineItemChange(index, 'description', e.target.value)}
                  placeholder='Description'
                  required
                />
              </div>
              <div>
                <Label htmlFor={`quantity-${index}`}>Qty</Label>
                <Input
                  id={`quantity-${index}`}
                  name='quantity'
                  type='number'
                  value={item.quantity}
                  onChange={e => handleLineItemChange(index, 'quantity', e.target.value)}
                  placeholder='Qty'
                  min='0'
                  step='0.01'
                  required
                />
              </div>
              <div>
                <Label htmlFor={`unit_price-${index}`}>Unit Price</Label>
                <Input
                  id={`unit_price-${index}`}
                  name='unit_price'
                  type='number'
                  value={item.unit_price}
                  onChange={e => handleLineItemChange(index, 'unit_price', e.target.value)}
                  placeholder='Price'
                  min='0'
                  step='0.01'
                  required
                />
              </div>
              <div>
                <Label htmlFor={`tax_rate-${index}`}>Tax Rate</Label>
                <Select
                  name='tax_rate'
                  value={item.tax_rate.toString()}
                  onValueChange={value => handleLineItemChange(index, 'tax_rate', value)}
                >
                  <SelectTrigger id={`tax_rate-${index}`}>
                    <SelectValue placeholder='Select VAT' />
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
              <div className='flex items-center justify-end gap-2'>
                <Label className='whitespace-nowrap'>
                  Total: {formData.currency}{(item.line_total ?? 0).toFixed(2)}
                </Label>
                <Button type='button' variant='ghost' size='sm' onClick={() => removeLineItem(index)}>
                  <XCircle className='h-4 w-4 text-red-500' />
                </Button>
              </div>
            </div>
          ))}
          <Button type='button' variant='outline' onClick={addLineItem} className='w-full'>
            <Plus className='h-4 w-4 mr-2' /> Add Line Item
          </Button>
        </CardContent>
      </Card>

      <div className='text-right text-xl font-bold mt-4'>
        Total Invoice Amount: {formData.currency}{totalAmount.toFixed(2)}
      </div>

      <div className='flex justify-end gap-2 mt-6'>
        <Button type='button' variant='outline' onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type='submit' disabled={isLoading}>
          {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {invoice ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}
