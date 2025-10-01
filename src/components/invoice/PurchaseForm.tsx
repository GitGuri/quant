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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

import { useToast } from '@/components/ui/use-toast';

// Define API Base URL
const API_BASE_URL = 'http://localhost:3000';

// Re-defining interfaces based on your provided backend structure for Purchases
interface PurchaseLineItem {
  id?: string;
  product_service_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number; // Matches backend 'unit_cost'
  line_total: number;
  tax_rate: number;
}

interface PurchaseFormData {
  purchase_order_number: string;
  supplier_id: string | null; // Matches backend 'vendor_id'
  supplier_name_manual?: string; // For new or free-text supplier entry
  order_date: string; // Matches backend 'order_date'
  delivery_date: string; // Matches backend 'delivery_date'
  status: string;
  currency: string;
  notes: string;
  line_items: PurchaseLineItem[];
}

// This interface should match the ProductFrontend interface from your backend's types.ts
interface ProductService {
  id: string;
  name: string;
  description: string;
  price: number; // This is 'price' (number) from ProductFrontend, maps to unit_cost in purchase line item
  costPrice?: number;
  sku?: string;
  isService: boolean;
  stock: number;
  vatRate: number; // Decimal (e.g., 0.15)
  category: string;
  unit: string;
}

interface Supplier { // Matches backend 'vendors'
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string; // Added to match backend vendor schema
  tax_id?: string; // Added to match backend vendor schema
}

// Updated Account interface to match the backend code you provided (including type and code)
interface Account {
  id: string;
  name: string;
  type: string;
  code: string;
}

interface PurchaseFormProps {
  purchase?: any; // The purchase object if editing
  onClose: () => void;
  onSubmitSuccess: () => void;
}

// Function to generate a new purchase order number
const generatePurchaseOrderNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  // Adding a small random number to ensure uniqueness if multiple forms are opened very quickly
  const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `PO-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
};


export function PurchaseForm({ purchase, onClose, onSubmitSuccess }: PurchaseFormProps) {
  const { toast } = useToast();

  const [formData, setFormData] = useState<PurchaseFormData>({
    // Autogenerate purchase order number only if creating a new purchase
    purchase_order_number: purchase ? purchase.po_number : generatePurchaseOrderNumber(),
    supplier_id: null,
    supplier_name_manual: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    status: 'Draft',
    currency: 'ZAR',
    notes: '',
    line_items: [],
  });

  const [productsServices, setProductsServices] = useState<ProductService[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // --- State for supplier search (similar to customer search) ---
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState<Supplier[]>([]);
  const [isSearchingSuppliers, setIsSearchingSuppliers] = useState(false);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);

  const supplierInputRef = useRef<HTMLInputElement>(null); // Ref for the supplier input

  // --- Payment related states ---
  const [showPaymentSection, setShowPaymentSection] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);


  // --- Debounce hook for supplier search ---
  const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
      return () => {
        clearTimeout(handler);
      };
    }, [value, delay]);

    return debouncedValue;
  };

  const debouncedSupplierSearchQuery = useDebounce(supplierSearchQuery, 500);

  // --- useEffect to Fetch Products/Services and Populate Form for Editing ---
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Corrected API path for products (remains /api/products)
        const res = await fetch(`${API_BASE_URL}/api/products`);
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

    const fetchAccounts = async () => {
      try {
        // --- FIX: Using the non-/api/ prefixed endpoint for accounts ---
        const res = await fetch(`${API_BASE_URL}/accounts`); // Changed to /accounts
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' })); // Catch JSON parse error
          throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
        }
        const data: Account[] = await res.json();
        setAccounts(data);
      } catch (error: any) {
        console.error('Failed to fetch accounts:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load accounts. Please try again.',
          variant: 'destructive',
        });
      }
    };

    fetchProducts();
    fetchAccounts();

    // If 'purchase' prop is provided (for editing), populate the form
    if (purchase) {
      setFormData({
        purchase_order_number: purchase.po_number || '', // Matches backend
        supplier_id: purchase.vendor_id || null, // Matches backend
        supplier_name_manual: purchase.vendor_id ? '' : (purchase.vendor_name || ''), // If no ID, assume manual
        order_date: purchase.order_date ? new Date(purchase.order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], // Matches backend
        delivery_date: purchase.delivery_date ? new Date(purchase.delivery_date).toISOString().split('T')[0] : '', // Matches backend
        status: purchase.status || 'Draft',
        currency: purchase.currency || 'ZAR',
        notes: purchase.notes || '',
        line_items: purchase.line_items?.map((item: any) => ({
          ...item,
          // Ensure these are parsed as numbers and default to 0 if parsing fails or value is null/undefined
          quantity: parseFloat(item.quantity || 0) || 0,
          unit_cost: parseFloat(item.unit_cost || 0) || 0, // Matches backend unit_cost
          tax_rate: parseFloat(item.tax_rate || 0) || 0,
          line_total: parseFloat(item.line_total || 0) || 0,
        })) || [],
      });
      // Set initial supplierSearchQuery for display
      if (purchase.vendor_id) { // Use vendor_id for existing
        const fetchInitialSupplier = async () => {
          try {
            // --- FIX: Using the non-/api/ prefixed endpoint for vendors ---
            const res = await fetch(`${API_BASE_URL}/vendors/${purchase.vendor_id}`); // Changed to /vendors/:id
            if (res.ok) {
              const data = await res.json();
              setSupplierSearchQuery(data.name); // Initialize supplierSearchQuery
            }
          } catch (err) {
            console.error('Failed to fetch initial supplier:', err);
          }
        };
        fetchInitialSupplier();
      } else if (purchase.vendor_name) { // Use purchase.vendor_name for manual if no vendor_id
        setSupplierSearchQuery(purchase.vendor_name); // Initialize supplierSearchQuery
      }
    }
  }, [purchase, toast]);

  // --- useEffect to fetch supplier suggestions based on debounced search query ---
  useEffect(() => {
    const fetchSupplierSuggestions = async () => {
      if (debouncedSupplierSearchQuery.length < 2) {
        setSupplierSuggestions([]);
        setIsSearchingSuppliers(false);
        setShowSupplierSuggestions(false);
        return;
      }

      setIsSearchingSuppliers(true);
      setShowSupplierSuggestions(true);
      try {
        // --- FIX: Fetch all vendors and filter client-side as no /vendors/search endpoint provided ---
        const res = await fetch(`${API_BASE_URL}/vendors`); // Changed to /vendors (GET all)
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
        }
        const allVendors: Supplier[] = await res.json();
        const filteredVendors = allVendors.filter(vendor =>
          vendor.name.toLowerCase().includes(debouncedSupplierSearchQuery.toLowerCase())
        );
        setSupplierSuggestions(filteredVendors);
      } catch (error: any) {
        console.error('Failed to fetch supplier suggestions:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to search suppliers. Please try again.',
          variant: 'destructive',
        });
        setSupplierSuggestions([]);
      } finally {
        setIsSearchingSuppliers(false);
      }
    };

    fetchSupplierSuggestions();
  }, [debouncedSupplierSearchQuery, toast]);


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

  const handleSupplierSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSupplierSearchQuery(value);
    setFormData(prev => ({ ...prev, supplier_id: null, supplier_name_manual: value }));
    setShowSupplierSuggestions(true);
  };

  const handleSupplierSuggestionClick = (supplier: Supplier | 'free-text-entry') => {
    if (supplier === 'free-text-entry') {
      setFormData(prev => ({
        ...prev,
        supplier_id: null,
        supplier_name_manual: supplierSearchQuery.trim(),
      }));
      setSupplierSearchQuery(supplierSearchQuery.trim());
    } else {
      const selected = supplierSuggestions.find(s => s.id === supplier.id);
      if (selected) {
        setFormData(prev => ({ ...prev, supplier_id: selected.id, supplier_name_manual: '' }));
        setSupplierSearchQuery(selected.name);
      }
    }
    setSupplierSuggestions([]);
    setShowSupplierSuggestions(false);
  };

  // Handle clicks outside the supplier search input/suggestions to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (supplierInputRef.current && !supplierInputRef.current.contains(event.target as Node)) {
        setShowSupplierSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // --- Handlers for Line Items ---
  const handleLineItemChange = (index: number, field: keyof PurchaseLineItem, value: any) => {
    const updatedItems = [...formData.line_items];
    let itemToUpdate = { ...updatedItems[index] };

    // IMPORTANT: Ensure numeric inputs are always numbers, defaulting to 0 if NaN
    if (['quantity', 'unit_cost', 'tax_rate'].includes(field)) { // Changed unit_price to unit_cost
      const parsedValue = parseFloat(value);
      itemToUpdate[field] = isNaN(parsedValue) ? 0 : parsedValue;
    } else {
      itemToUpdate[field] = value;
    }

    // Recalculate line_total based on potentially updated values
    const qty = itemToUpdate.quantity;
    const cost = itemToUpdate.unit_cost; // Changed to cost
    const taxRate = itemToUpdate.tax_rate;

    // Ensure all components for calculation are numbers
    const calculatedLineTotal = qty * cost * (1 + taxRate); // Changed to cost
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
      item.unit_cost = product.price; // Assuming product.price maps to purchase line item's unit_cost
      item.quantity = item.quantity || 1; // Default to 1 if not set
      item.tax_rate = item.tax_rate || product.vatRate || 0.00; // Use product's vatRate if available, else 0

      // Recalculate line_total after product selection
      item.line_total = parseFloat((item.quantity * item.unit_cost * (1 + item.tax_rate)).toFixed(2));
    } else {
      // This is for "Custom Item" where no product is selected
      item.product_service_id = null;
      // Clear description only if it was previously set by a product, otherwise keep user input
      if (updatedItems[index].product_service_id && productsServices.some(p => p.id === updatedItems[index].product_service_id)) {
          item.description = '';
      }
      item.unit_cost = 0;
      item.quantity = 0;
      item.tax_rate = 0.00;
      item.line_total = 0;
    }
    updatedItems[index] = item;
    setFormData(prev => ({ ...prev, line_items: updatedItems }));
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev, // Corrected spread operator for prev
      line_items: [
        ...prev.line_items,
        {
          product_service_id: null,
          description: '',
          quantity: 0,
          unit_cost: 0, // Changed to unit_cost
          line_total: 0,
          tax_rate: 0.00,
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

    // Client-side validation
    if (
      !formData.purchase_order_number ||
      !formData.order_date ||
      formData.line_items.length === 0
    ) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required purchase order details and add at least one line item.',
        variant: 'destructive',
      });
      setIsLoading(false);
      console.error("Validation Error: Missing required fields or line items.", { formData }); // Log validation error
      return;
    }

    // Supplier validation: either supplier_id must be set, or supplier_name_manual
    if (!formData.supplier_id && !formData.supplier_name_manual?.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please select an existing supplier or enter a new supplier name.',
        variant: 'destructive',
      });
      setIsLoading(false);
      console.error("Validation Error: Supplier not selected or name not entered.", { formData }); // Log validation error
      return;
    }

    const invalidLineItem = formData.line_items.some(item =>
      !item.description || item.quantity <= 0 || item.unit_cost <= 0 // Changed unit_price to unit_cost
    );
    if (invalidLineItem) {
      toast({
        title: 'Line Item Error',
        description: 'Each line item must have a description, a positive quantity, and a positive unit cost.', // Changed unit_price to unit_cost
        variant: 'destructive',
      });
      setIsLoading(false);
      console.error("Validation Error: Invalid line item details.", { lineItems: formData.line_items }); // Log validation error
      return;
    }

    const payload: any = { // Use 'any' temporarily for payload construction
      po_number: formData.purchase_order_number, // Matches backend
      vendor_id: formData.supplier_id, // Matches backend
      order_date: formData.order_date, // Matches backend
      delivery_date: formData.delivery_date || null, // Matches backend
      total_amount: totalAmount,
      status: formData.status,
      currency: formData.currency,
      notes: formData.notes || null,
      line_items: formData.line_items.map(item => ({
        product_service_id: item.product_service_id,
        description: item.description,
        quantity: item.quantity,
        unit_cost: item.unit_cost, // Matches backend
        line_total: item.line_total,
        tax_rate: item.tax_rate,
      })),
    };

    // If no supplier_id, send supplier_name for new vendor creation
    if (!payload.vendor_id) {
      payload.vendor_name = formData.supplier_name_manual?.trim(); // Matches backend
      if (!payload.vendor_name) {
          toast({
              title: 'Validation Error',
              description: 'Supplier name is required for new suppliers.',
              variant: 'destructive',
          });
          setIsLoading(false);
          console.error("Validation Error: New supplier name is empty.", { formData }); // Log validation error
          return;
      }
    }
    // Remove supplier_name_manual as it's a frontend-only field
    delete (payload as any).supplier_name_manual;

    console.log("Submitting payload:", payload); // Log payload before submission

    // --- CRITICAL FIX: Purchase API calls remain with /api/ prefix ---
    const url = purchase ? `${API_BASE_URL}/api/purchases/${purchase.id}` : `${API_BASE_URL}/api/purchases`; // Using '/api/purchases' endpoint
    const method = purchase ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        console.error("API Response Error:", errorData); // Log API error response
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      toast({
        title: purchase ? 'Purchase Order Updated' : 'Purchase Order Created',
        description: `Purchase Order ${formData.purchase_order_number} has been successfully ${purchase ? 'updated' : 'created'}.`,
        variant: 'default',
      });

      onSubmitSuccess();
      onClose();
    } catch (error) {
      console.error('Submission error:', error); // Log submission error
      toast({
        title: 'Submission Failed',
        description: `Failed to ${purchase ? 'update' : 'create'} purchase order: ${error instanceof Error ? error.message : String(error)}.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!purchase || !purchase.id) {
      toast({
        title: 'Error',
        description: 'Cannot record payment for a new or unsaved purchase order.',
        variant: 'destructive',
      });
      console.error("Payment Error: Purchase object or ID missing.", { purchase }); // Log payment error
      return;
    }
    if (!paymentAmount || paymentAmount <= 0 || !paymentDate || !selectedAccount) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid amount, date, and select an account for payment.',
        variant: 'destructive',
      });
      console.error("Payment Validation Error: Missing payment details.", { paymentAmount, paymentDate, selectedAccount }); // Log payment validation error
      return;
    }

    setIsRecordingPayment(true);
    try {
      const paymentPayload = {
        amount_paid: parseFloat(paymentAmount as string),
        payment_date: paymentDate,
        notes: paymentNotes || null,
        account_id: selectedAccount,
        transaction_description: `Payment for PO ${purchase.po_number}`,
        transaction_category: 'Business Expenses', // Default category
      };

      console.log("Recording payment payload:", paymentPayload); // Log payment payload

      // Corrected API path for recording payment (remains /api/purchases/:id/payment)
      const response = await fetch(`${API_BASE_URL}/api/purchases/${purchase.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred.' }));
        console.error("Payment API Response Error:", errorData); // Log payment API error response
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      toast({
        title: 'Payment Recorded',
        description: `Payment of R${paymentAmount} recorded for Purchase Order ${purchase.po_number}.`,
        variant: 'default',
      });
      // Optionally refresh purchase list or update purchase status here
      onSubmitSuccess(); // This will re-fetch the list and close the modal
      setShowPaymentSection(false); // Hide payment section after successful payment
      // Reset payment fields
      setPaymentAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentNotes('');
      setSelectedAccount('');

    } catch (error) {
      console.error('Error recording payment:', error); // Log payment error
      toast({
        title: 'Payment Failed',
        description: `Failed to record payment: ${error instanceof Error ? error.message : String(error)}.`,
        variant: 'destructive',
      });
    } finally {
      setIsRecordingPayment(false);
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
            <CardTitle>Purchase Order Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='purchase_order_number'>Purchase Order Number</Label>
              <Input
                id='purchase_order_number'
                name='purchase_order_number'
                value={formData.purchase_order_number}
                onChange={handleInputChange}
                placeholder='e.g., PO-2024-001'
                required
              />
            </div>
            <div>
              <Label htmlFor='supplier_search'>Supplier</Label>
              <div className="relative">
                <Input
                  id="supplier_search"
                  type="text"
                  value={supplierSearchQuery}
                  onChange={handleSupplierSearchInputChange}
                  onFocus={() => setShowSupplierSuggestions(true)}
                  placeholder="Search or enter supplier name"
                  className="mb-2"
                  ref={supplierInputRef}
                  autoComplete="off"
                />
                {isSearchingSuppliers && supplierSearchQuery.length >= 2 && (
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
                  </div>
                )}
                {supplierSearchQuery.length < 2 && !formData.supplier_id && !isSearchingSuppliers && (
                  <p className="text-sm text-muted-foreground mt-1">Type at least 2 characters to search for suppliers.</p>
                )}

                {showSupplierSuggestions && (supplierSuggestions.length > 0 || supplierSearchQuery.length >= 2) && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                    {supplierSuggestions.length > 0 ? (
                      <>
                        <div className="px-4 py-2 text-sm font-semibold text-gray-500 border-b">Existing Suppliers</div>
                        {supplierSuggestions.map(supplier => (
                          <div
                            key={supplier.id}
                            className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                            onMouseDown={() => handleSupplierSuggestionClick(supplier)}
                          >
                            {supplier.name}
                          </div>
                        ))}
                        {supplierSearchQuery.length > 0 &&
                          !supplierSuggestions.some(s => s.name.toLowerCase() === supplierSearchQuery.toLowerCase()) && (
                            <div
                              className="px-4 py-2 cursor-pointer hover:bg-gray-100 border-t"
                              onMouseDown={() => handleSupplierSuggestionClick('free-text-entry')}
                            >
                              Use "{supplierSearchQuery}" (New Supplier)
                            </div>
                          )}
                      </>
                    ) : (
                      supplierSearchQuery.length >= 2 && !isSearchingSuppliers && (
                        <div
                          className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                          onMouseDown={() => handleSupplierSuggestionClick('free-text-entry')}
                        >
                          No existing suppliers found. Use "{supplierSearchQuery}" as a New Supplier
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor='order_date'>Order Date</Label>
              <Input
                id='order_date'
                name='order_date'
                type='date'
                value={formData.order_date}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <Label htmlFor='delivery_date'>Delivery Date</Label>
              <Input
                id='delivery_date'
                name='delivery_date'
                type='date'
                value={formData.delivery_date}
                onChange={handleInputChange}
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
                  <SelectItem value='Ordered'>Ordered</SelectItem>
                  <SelectItem value='Received'>Received</SelectItem>
                  <SelectItem value='Paid'>Paid</SelectItem>
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
              placeholder='Any additional notes for the purchase order...'
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
            <div key={index} className='grid grid-cols-1 md:grid-cols-6 gap-3 items-end border-b pb-4 last:border-b-0 last:pb-0'>
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
                <Label htmlFor={`unit_cost-${index}`}>Unit Cost</Label>
                <Input
                  id={`unit_cost-${index}`}
                  name='unit_cost'
                  type='number'
                  value={item.unit_cost}
                  onChange={e => handleLineItemChange(index, 'unit_cost', e.target.value)}
                  placeholder='Cost'
                  min='0'
                  step='0.01'
                  required
                />
              </div>
              <div>
                <Label htmlFor={`tax_rate-${index}`}>Tax Rate (%)</Label>
                <Input
                  id={`tax_rate-${index}`}
                  name='tax_rate'
                  type='number'
                  value={(item.tax_rate * 100).toFixed(2)}
                  onChange={e => handleLineItemChange(index, 'tax_rate', parseFloat(e.target.value) / 100)}
                  placeholder='0.00'
                  min='0'
                  step='0.01'
                />
              </div>
              <div className='flex items-center justify-end gap-2'>
                <Label className='whitespace-nowrap'>Total: {formData.currency}{(item.line_total ?? 0).toFixed(2)}</Label>
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
        Total Purchase Amount: {formData.currency}{totalAmount.toFixed(2)}
      </div>

      {purchase && (
        <Card>
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowPaymentSection(!showPaymentSection)}
              className='w-full'
            >
              {showPaymentSection ? 'Hide Payment Section' : 'Show Payment Section'}
            </Button>

            {showPaymentSection && (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
                <div>
                  <Label htmlFor='payment_amount'>Amount Paid</Label>
                  <Input
                    id='payment_amount'
                    type='number'
                    value={paymentAmount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentAmount(parseFloat(e.target.value) || '')}
                    placeholder='e.g., 100.00'
                    min='0'
                    step='0.01'
                    required
                  />
                </div>
                <div>
                  <Label htmlFor='payment_date'>Payment Date</Label>
                  <Input
                    id='payment_date'
                    type='date'
                    value={paymentDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
                <div className='md:col-span-2'>
                  <Label htmlFor='selected_account'>Account</Label>
                  <Select
                    value={selectedAccount}
                    onValueChange={setSelectedAccount}
                    required
                  >
                    <SelectTrigger id='selected_account'>
                      <SelectValue placeholder='Select Account' />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='md:col-span-2'>
                  <Label htmlFor='payment_notes'>Payment Notes</Label>
                  <Textarea
                    id='payment_notes'
                    value={paymentNotes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPaymentNotes(e.target.value)}
                    placeholder='Notes for this payment...'
                    rows={2}
                  />
                </div>
                <div className='md:col-span-2'>
                  <Button
                    type='button'
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment}
                    className='w-full'
                  >
                    {isRecordingPayment && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                    Record Payment
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className='flex justify-end gap-2 mt-6'>
        <Button type='button' variant='outline' onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type='submit' disabled={isLoading}>
          {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {purchase ? 'Update Purchase Order' : 'Create Purchase Order'}
        </Button>
      </div>
    </form>
  );
}
