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
import { useAuth } from '../../AuthPage'; // Corrected import path for useAuth

// Define API Base URL
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

// Re-defining interfaces based on your provided backend structure for Quotations
export interface QuotationLineItem { // Exported for potential reuse
  id?: string;
  product_service_id: string | null;
  product_service_name?: string; // For display, comes from backend JOIN
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}

export interface Quotation { // Exported for potential reuse
  id: string;
  quotation_number: string;
  customer_id: string | null; // Allow null if new customer or temporary state
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
  customer_id: string | null; // Allow null if new customer or temporary state
  customer_name_manual?: string; // For new or free-text customer entry
  quotation_date: string;
  expiry_date: string; // Added for quotations
  status: string;
  currency: string;
  notes: string;
  line_items: QuotationLineItem[];
}

// This interface should match the ProductFrontend interface from your backend's types.ts
interface ProductService {
  id: string;
  name: string;
  description: string;
  price: number; // This is 'price' (number) from ProductFrontend, maps to unit_price in quotation line item
  costPrice?: number;
  sku?: string;
  isService: boolean;
  stock: number;
  vatRate: number; // Decimal (e.g., 0.15)
  category: string;
  unit: string;
}

interface Customer {
  id: string;
  name: string;
}

interface QuotationFormProps {
  quotation?: Quotation; // The quotation object if editing, now using the local interface
  onClose: () => void;
  onSubmitSuccess: () => void;
}

// Function to generate a new quotation number
const generateQuotationNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  // Adding a small random number to ensure uniqueness if multiple forms are opened very quickly
  const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `QUO-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
};

// Define fixed VAT rate options
const VAT_OPTIONS = [
  { value: 0.00, label: '0%' },
  { value: 0.15, label: '15%' },
];

export function QuotationForm({ quotation, onClose, onSubmitSuccess }: QuotationFormProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth(); // Get authentication status from useAuth
  const token = localStorage.getItem('token'); // Retrieve the token explicitly from localStorage

  // Helper to calculate default expiry date (e.g., 30 days from now)
  const getDefaultExpiryDate = (quotationDateString: string) => {
    const quotationDate = new Date(quotationDateString);
    const expiryDate = new Date(quotationDate);
    expiryDate.setDate(quotationDate.getDate() + 30); // Default 30 days later
    return expiryDate.toISOString().split('T')[0];
  };

  const initialQuotationDate = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<QuotationFormData>({
    // Autogenerate quotation number only if creating a new quotation
    quotation_number: quotation ? quotation.quotation_number : generateQuotationNumber(),
    customer_id: null,
    customer_name_manual: '',
    quotation_date: initialQuotationDate,
    expiry_date: getDefaultExpiryDate(initialQuotationDate), // Set default expiry date
    status: 'Draft',
    currency: 'R',
    notes: '',
    line_items: [],
  });

  const [productsServices, setProductsServices] = useState<ProductService[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // --- State for customer search ---
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false); // To control visibility of suggestions

  const customerInputRef = useRef<HTMLInputElement>(null); // Ref for the customer input

  // --- Debounce hook for customer search ---
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

  // --- useEffect to Fetch Products/Services and Populate Form for Editing ---
  useEffect(() => {
    const fetchProducts = async () => {
      if (!isAuthenticated || !token) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to load products and services.',
          variant: 'destructive',
        });
        setProductsServices([]); // Clear products if not authenticated
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          headers: {
            'Authorization': `Bearer ${token}`, // Use the retrieved token
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

    if (isAuthenticated && token) {
        fetchProducts();
    } else {
        setProductsServices([]); // Clear if not authenticated
    }


    // If 'quotation' prop is provided (for editing), populate the form
    if (quotation) {
      setFormData({
        quotation_number: quotation.quotation_number || '',
        customer_id: quotation.customer_id || null,
        customer_name_manual: quotation.customer_id ? '' : (quotation.customer_name || ''), // If no ID, assume manual
        quotation_date: quotation.quotation_date ? new Date(quotation.quotation_date).toISOString().split('T')[0] : initialQuotationDate,
        expiry_date: quotation.expiry_date ? new Date(quotation.expiry_date).toISOString().split('T')[0] : getDefaultExpiryDate(quotation.quotation_date || initialQuotationDate), // Set default expiry date if not provided
        status: quotation.status || 'Draft',
        currency: quotation.currency || 'R',
        notes: quotation.notes || '',
        line_items: quotation.line_items?.map((item: any) => ({
          ...item,
          // Ensure these are parsed as numbers and default to 0 if parsing fails or value is null/undefined
          quantity: parseFloat(item.quantity || 0) || 0,
          unit_price: parseFloat(item.unit_price || 0) || 0,
          tax_rate: parseFloat(item.tax_rate || 0) || 0, // Tax rate should be decimal from backend
          line_total: parseFloat(item.line_total || 0) || 0,
        })) || [],
      });
      // Set initial customerSearchQuery for display
      if (quotation.customer_id) {
        const fetchInitialCustomer = async () => {
          if (!isAuthenticated || !token) return; // Ensure authenticated and token exists before fetching

          try {
            const res = await fetch(`${API_BASE_URL}/api/customers/${quotation.customer_id}`, {
              headers: {
                'Authorization': `Bearer ${token}`, // Use the retrieved token
              },
            });
            if (res.ok) {
              const data = await res.json();
              setCustomerSearchQuery(data.name); // Initialize customerSearchQuery
            }
          } catch (err) {
            console.error('Failed to fetch initial customer:', err);
          }
        };
        fetchInitialCustomer();
      } else if (quotation.customer_name) { // Use quotation.customer_name for manual if no customer_id
        setCustomerSearchQuery(quotation.customer_name); // Initialize customerSearchQuery
      }
    }
  }, [quotation, toast, isAuthenticated, token, initialQuotationDate]); // Added isAuthenticated and token to dependencies

  // --- useEffect to fetch customer suggestions based on debounced search query ---
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
        setShowCustomerSuggestions(false); // Hide suggestions if query is too short
        return;
      }

      setIsSearchingCustomers(true);
      setShowCustomerSuggestions(true); // Show suggestions when searching
      try {
        const res = await fetch(`${API_BASE_URL}/api/customers/search?query=${encodeURIComponent(debouncedCustomerSearchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${token}`, // Use the retrieved token
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

    if (isAuthenticated && token) {
        fetchCustomerSuggestions();
    } else {
        setCustomerSuggestions([]);
        setIsSearchingCustomers(false);
        setShowCustomerSuggestions(false);
    }
  }, [debouncedCustomerSearchQuery, toast, isAuthenticated, token]); // Added isAuthenticated and token to dependencies


  // --- useEffect to Calculate Total Amount ---
  useEffect(() => {
    const calculatedTotal = formData.line_items.reduce(
      (sum, item) => sum + (item.line_total || 0),
      0
    );
    setTotalAmount(calculatedTotal);
  }, [formData.line_items]);

  // --- Handlers for Form Data ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCustomerSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerSearchQuery(value); // Directly update the input's controlling state
    setFormData(prev => ({ ...prev, customer_id: null, customer_name_manual: value }));
    setShowCustomerSuggestions(true); // Always show suggestions when typing
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
    setCustomerSuggestions([]); // Clear suggestions after selection
    setShowCustomerSuggestions(false); // Hide suggestions after selection
  };

  // Handle clicks outside the customer search input/suggestions to close suggestions
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


  // --- Handlers for Line Items ---
  const handleLineItemChange = (index: number, field: keyof QuotationLineItem, value: any) => {
    const updatedItems = [...formData.line_items];
    let itemToUpdate = { ...updatedItems[index] };

    // Special handling for tax_rate, which is now a select
    if (field === 'tax_rate') {
      const parsedValue = parseFloat(value);
      itemToUpdate[field] = isNaN(parsedValue) ? 0 : parsedValue;
    } else if (['quantity', 'unit_price'].includes(field)) {
      const parsedValue = parseFloat(value);
      itemToUpdate[field] = isNaN(parsedValue) ? 0 : parsedValue;
    } else {
      itemToUpdate[field] = value;
    }

    // Recalculate line_total based on potentially updated values
    const qty = itemToUpdate.quantity;
    const price = itemToUpdate.unit_price;
    const taxRate = itemToUpdate.tax_rate;

    // Ensure all components for calculation are numbers
    const calculatedLineTotal = qty * price * (1 + taxRate); // Line total includes VAT
    itemToUpdate.line_total = parseFloat(calculatedLineTotal.toFixed(2)); // Ensure 2 decimal places

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
      item.unit_price = product.price; // Use product.price (from ProductService interface)
      item.quantity = item.quantity || 1; // Default to 1 if not set
      item.tax_rate = product.vatRate ?? 0.00; // Use product's vatRate if available, else 0

      // Recalculate line_total after product selection (including VAT)
      item.line_total = parseFloat((item.quantity * item.unit_price * (1 + item.tax_rate)).toFixed(2));
    } else {
      // This is for "Custom Item" where no product is selected
      item.product_service_id = null;
      // Clear description only if it was previously set by a product, otherwise keep user input
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
          tax_rate: 0.15, // Default to 15% VAT for consistency with Invoices
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

  // --- Form Submission Handler ---
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

    // Client-side validation
    if (
      !formData.quotation_number ||
      !formData.quotation_date ||
      !formData.expiry_date || // Expiry date is required for quotations
      formData.line_items.length === 0
    ) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required quotation details and add at least one line item.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Customer validation: either customer_id must be set, or customer_name_manual must be non-empty
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
      !item.description || item.quantity <= 0 || item.unit_price <= 0
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

    // Prepare payload
    const payload: Omit<QuotationFormData, 'customer_name_manual'> & { customer_name?: string; total_amount: number; } = {
        ...formData,
        total_amount: totalAmount,
    };

    // Corrected logic for customer_id vs customer_name
    if (payload.customer_id) {
      // If customer_id is selected, ensure customer_name_manual is NOT sent
      delete payload.customer_name_manual;
      // The backend will use payload.customer_id
    } else {
      // If no customer_id, ensure customer_name is set from manual input
      payload.customer_name = formData.customer_name_manual?.trim();
      if (!payload.customer_name) { // Double check if manual name is empty
        toast({
          title: 'Validation Error',
          description: 'Customer name is required for new customers if no existing customer is selected.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      delete payload.customer_id; // Ensure customer_id is not sent if creating new customer
      delete payload.customer_name_manual; // Remove frontend-only field
    }

    // --- CRITICAL FIX: Add /api/ prefix to the URL ---
    const url = quotation ? `${API_BASE_URL}/api/quotations/${quotation.id}` : `${API_BASE_URL}/api/quotations`;
    const method = quotation ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Use the retrieved token
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      toast({
        title: quotation ? 'Quotation Updated' : 'Quotation Created',
        description: `Quotation ${formData.quotation_number} has been successfully ${quotation ? 'updated' : 'created'}.`,
        variant: 'default',
      });

      onSubmitSuccess();
      onClose();
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: 'Submission Failed',
        description: `Failed to ${quotation ? 'update' : 'create'} quotation: ${error instanceof Error ? error.message : String(error)}.`,
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
              disabled={isLoading}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <CardTitle>Quotation Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='quotation_number'>Quotation Number</Label>
              <Input
                id='quotation_number'
                name='quotation_number'
                value={formData.quotation_number}
                onChange={handleInputChange}
                placeholder='e.g., QUO-2024-001'
                required
                disabled={!isAuthenticated || isLoading}
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
                            onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick(customer); }} // Prevent blurring on click
                          >
                            {customer.name}
                          </div>
                        ))}
                        {customerSearchQuery.length > 0 &&
                          !customerSuggestions.some(c => c.name.toLowerCase() === customerSearchQuery.toLowerCase()) && (
                            <div
                              className="px-4 py-2 cursor-pointer hover:bg-gray-100 border-t"
                              onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick('free-text-entry'); }} // Prevent blurring on click
                            >
                              Use "{customerSearchQuery}" (New Customer)
                            </div>
                          )}
                      </>
                    ) : (
                      customerSearchQuery.length >= 2 && !isSearchingCustomers && (
                        <div
                          className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                          onMouseDown={(e) => { e.preventDefault(); handleCustomerSuggestionClick('free-text-entry'); }} // Prevent blurring on click
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
              <Label htmlFor='quotation_date'>Quotation Date</Label>
              <Input
                id='quotation_date'
                name='quotation_date'
                type='date'
                value={formData.quotation_date}
                onChange={handleInputChange}
                required
                disabled={!isAuthenticated || isLoading}
              />
            </div>
            <div>
              <Label htmlFor='expiry_date'>Expiry Date</Label>
              <Input
                id='expiry_date'
                name='expiry_date'
                type='date'
                value={formData.expiry_date}
                onChange={handleInputChange}
                required
                disabled={!isAuthenticated || isLoading}
              />
            </div>
            <div>
              <Label htmlFor='status'>Status</Label>
              <Select
                name='status'
                value={formData.status}
                onValueChange={value => handleSelectChange('status', value)}
                required
                disabled={!isAuthenticated || isLoading}
              >
                <SelectTrigger id='status'>
                  <SelectValue placeholder='Select Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='Draft'>Draft</SelectItem>
                  <SelectItem value='Sent'>Sent</SelectItem>
                  <SelectItem value='Accepted'>Accepted</SelectItem>
                  <SelectItem value='Declined'>Declined</SelectItem>
                  <SelectItem value='Expired'>Expired</SelectItem>
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
        <CardContent>
          <div>
            <Label htmlFor='notes'>Notes</Label>
            <Textarea
              id='notes'
              name='notes'
              value={formData.notes}
              onChange={handleInputChange}
              placeholder='Any additional notes for the quotation...'
              rows={3}
              disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
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
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
              <div>
                <Label htmlFor={`tax_rate-${index}`}>Tax Rate</Label>
                <Select
                  name='tax_rate'
                  value={item.tax_rate.toString()} // Convert number to string for Select component
                  onValueChange={value => handleLineItemChange(index, 'tax_rate', value)} // Value is already a string
                  disabled={!isAuthenticated || isLoading}
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
                <Button type='button' variant='ghost' size='sm' onClick={() => removeLineItem(index)} disabled={!isAuthenticated || isLoading}>
                  <XCircle className='h-4 w-4 text-red-500' />
                </Button>
              </div>
            </div>
          ))}
          <Button type='button' variant='outline' onClick={addLineItem} className='w-full' disabled={!isAuthenticated || isLoading}>
            <Plus className='h-4 w-4 mr-2' /> Add Line Item
          </Button>
        </CardContent>
      </Card>

      <div className='text-right text-xl font-bold mt-4'>
        Total Quotation Amount: {formData.currency}{totalAmount.toFixed(2)}
      </div>

      <div className='flex justify-end gap-2 mt-6'>
        <Button type='button' variant='outline' onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type='submit' disabled={!isAuthenticated || isLoading}>
          {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {quotation ? 'Update Quotation' : 'Create Quotation'}
        </Button>
      </div>
    </form>
  );
}
