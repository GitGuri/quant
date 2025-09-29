import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Table,
  Typography,
  Select,
  Tag,
  Divider,
  Grid,
  Form,
  InputNumber,
  message,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  UserAddOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { useAuth } from '../AuthPage'; // We'll still use this for isAuthenticated and token

const useBreakpoint = Grid.useBreakpoint;
const { Title, Text } = Typography;
const { Option } = Select; // Destructure Option from Select

// ---- Simple online status hook ----
const useOnline = () => {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

// ---- Small helpers for cache & outbox ----
const CKEY_CUSTOMERS = 'pos.cache.customers';
const CKEY_PRODUCTS  = 'pos.cache.products';
const OKEY_SALES     = 'pos.outbox.sales';

const readJSON = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};
const writeJSON = (key: string, value: any) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

// --- START: MODIFIED TYPES TO MATCH BACKEND API ---
interface ProductDB {
  id: number | string; // allow string for offline custom items (e.g. "custom-123")
  name: string;
  description: string | null;
  unit_price: number; // Ensure this is number
  cost_price: number | null; // Ensure this is number or null
  sku: string | null;
  is_service: boolean;
  stock_quantity: number;
  created_at?: Date;
  updated_at?: Date;
  tax_rate_id: number | null;
  category: string | null;
  unit: string | null;
  tax_rate_value?: number; // Added for convenience on frontend, assumed to be part of API response
}
interface CustomerFrontend {
  id: string; // keep as string (safer for large IDs)
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  totalInvoiced: number;
  balanceDue?: number;
  creditLimit?: number;
}
// CartItem now fully uses (possibly-local) ProductDB, id can be number|string
type CartItem = ProductDB & { quantity: number; subtotal: number };
type PaymentType = 'Cash' | 'Bank' | 'Credit';
// --- END: MODIFIED TYPES TO MATCH BACKEND API ---

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'; // <-- set your API URL

// ===== Credit Score (frontend-only, flag not block) =====
type ScoreColor = 'green' | 'blue' | 'orange' | 'red' | 'default';
interface CreditScoreInfo {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
  color: ScoreColor;
}
const MIN_SCORE = 60; // threshold to FLAG (not block)
const scoreFromRatio = (ratio: number): CreditScoreInfo => {
  const r = Math.max(0, Math.min(1, ratio));
  const score = Math.round(r * 100);
  if (score > 90) return { score, label: 'Excellent', color: 'green' };
  if (score > 70) return { score, label: 'Good', color: 'blue' };
  if (score > 50) return { score, label: 'Fair', color: 'orange' };
  return { score, label: 'Poor', color: 'red' };
};
interface SaleHistoryRow {
  id: number;
  customer_id: number | string;
  total_amount: number;
  remaining_credit_amount: number;
  due_date: string | null; // ISO
  sale_date: string; // ISO
}
const computeCreditScoreFromHistory = (
  history: SaleHistoryRow[] | undefined | null,
): CreditScoreInfo => {
  if (!history || history.length === 0)
    return { score: 50, label: 'Unknown', color: 'default' };
  const today = new Date().toISOString().slice(0, 10);
  let onTimePaid = 0;
  let onTrack = 0;
  let lateOrOverdue = 0;
  history.forEach((h) => {
    const due = h.due_date ? h.due_date.slice(0, 10) : null;
    const fullyPaid = h.remaining_credit_amount <= 0;
    if (!due) {
      if (fullyPaid) onTimePaid++; // assume neutral-good if no due date but paid
      return;
    }
    if (fullyPaid) {
      if (due >= today) onTimePaid++;
      else lateOrOverdue++;
    } else {
      if (due < today) lateOrOverdue++;
      else onTrack++;
    }
  });
  const total = onTimePaid + onTrack + lateOrOverdue;
  const ratio = total > 0 ? (onTimePaid * 1.0 + onTrack * 0.6) / total : 0.5;
  return scoreFromRatio(ratio);
};

// --- Helper to get user name from localStorage (similar to AuthPage) ---
const getUserNameFromLocalStorage = () => {
  const storedName = localStorage.getItem('userName');
  return storedName || 'Unknown User (Local Storage)';
};
// --- End Helper ---

export default function POSScreen() {
  const [messageApi, contextHolder] = message.useMessage();
  const screens = useBreakpoint();
  const isOnline = useOnline();
  const [customers, setCustomers] = useState<CustomerFrontend[]>([]);
  const [products, setProducts] = useState<ProductDB[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerFrontend | null>(null);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerForm] = Form.useForm();
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDB | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productQty, setProductQty] = useState(1);
  // Custom product state
  const [showCustomProductForm, setShowCustomProductForm] = useState(false);
  const [customProductForm] = Form.useForm(); // New Form instance for custom product
  // New state for custom product type (product or service)
  const [customProductIsService, setCustomProductIsService] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  // --- State for Bank Name ---
  const [bankName, setBankName] = useState<string | null>(null);
  // --- End State for Bank Name ---
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  // Global loading state for the screen
  const [isLoading, setIsLoading] = useState(false);
  // Specific loading state for adding custom product (to disable custom product form elements)
  const [isAddingCustomProduct, setIsAddingCustomProduct] = useState(false);
  // Cache scores by customer id (string)
  const [creditScoreCache, setCreditScoreCache] = useState<
    Record<string, CreditScoreInfo>
  >({});

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // === NEW: Outbox flush ===
  const flushOutbox = useCallback(async () => {
    if (!isAuthenticated || !token || !isOnline) return;
    const queue = readJSON<any[]>(OKEY_SALES, []);
    if (!queue.length) return;

    const remaining: any[] = [];
    for (const job of queue) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(job.payload),
        });
        if (!res.ok) {
          // keep it if server rejected for a non-network reason
          const err = await res.json().catch(() => ({}));
          console.warn('Outbox sale failed (kept in queue):', err);
          remaining.push(job);
        } else {
          messageApi.success(`Synced offline sale (${job.localId}).`);
        }
      } catch (e) {
        // network again, keep it
        remaining.push(job);
      }
    }
    writeJSON(OKEY_SALES, remaining);
  }, [isAuthenticated, token, isOnline, getAuthHeaders, messageApi]);

  useEffect(() => {
    flushOutbox();
  }, [flushOutbox]);

  // === NEW: simple cache for account list and name → id helper ===
  const [accountsCache, setAccountsCache] = useState<any[] | null>(null);

  const loadAccountsOnce = useCallback(async () => {
    if (!isAuthenticated || !token) return [];
    if (accountsCache) return accountsCache;
    try {
      const res = await fetch(`${API_BASE_URL}/accounts`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      setAccountsCache(list || []);
      return list || [];
    } catch (e) {
      console.warn('Failed to load accounts for mapping', e);
      setAccountsCache([]);
      return [];
    }
  }, [isAuthenticated, token, getAuthHeaders, accountsCache]);

  // Assuming getAuthHeaders is available in scope or passed as a parameter
  async function findAccountIdByNames(candidates: string[]): Promise<number | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/accounts`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        console.error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
        return null;
      }

      const list = await response.json();
      const usable = (a: any) => a?.is_postable === true && a?.is_active === true && !!a?.reporting_category_id;

      for (const name of candidates) {
        const m = list.find((a: any) => (a?.name || '').toLowerCase().includes(name.toLowerCase()));
        if (m && usable(m)) {
          return Number(m.id);
        }
      }
      console.warn('Account not found for any of:', candidates);
      return null;
    } catch (error) {
      console.error("Error in findAccountIdByNames:", error);
      return null;
    }
  }
  // === END NEW ===

  // Fetch score & cache when customer is selected
  const fetchAndCacheCustomerScore = useCallback(
    async (customerId: string) => {
      if (!isAuthenticated || !token || !isOnline) return;
      if (creditScoreCache[customerId]) return; // already cached
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`,
          { headers: getAuthHeaders() },
        );
        if (!resp.ok) throw new Error(`Score fetch failed: ${resp.status}`);
        const history: SaleHistoryRow[] = await resp.json();
        const info = computeCreditScoreFromHistory(history);
        setCreditScoreCache((prev) => ({ ...prev, [customerId]: info }));
      } catch (e) {
        setCreditScoreCache((prev) => ({
          ...prev,
          [customerId]: { score: 50, label: 'Unknown', color: 'default' },
        }));
      }
    },
    [isAuthenticated, token, getAuthHeaders, creditScoreCache, isOnline],
  );
  useEffect(() => {
    if (selectedCustomer?.id) {
      fetchAndCacheCustomerScore(selectedCustomer.id);
    }
  }, [selectedCustomer?.id, fetchAndCacheCustomerScore]);

  // Fetch customers & products (with offline cache)
  useEffect(() => {
    async function fetchCustomers() {
      if (!isAuthenticated || !token) {
        setCustomers([]);
        return;
      }

      if (!isOnline) {
        const cached = readJSON<CustomerFrontend[]>(CKEY_CUSTOMERS, []);
        setCustomers(cached);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: CustomerFrontend[] = await response.json();
        setCustomers(data);
        writeJSON(CKEY_CUSTOMERS, data);
      } catch (error) {
        console.error('Error fetching customers:', error);
        messageApi.error('Failed to fetch customers.');
        // fallback to cache
        const cached = readJSON<CustomerFrontend[]>(CKEY_CUSTOMERS, []);
        if (cached.length) setCustomers(cached);
      } finally {
        setIsLoading(false);
      }
    }

    async function fetchProducts() {
      if (!isAuthenticated || !token) {
        setProducts([]);
        return;
      }

      if (!isOnline) {
        const cached = readJSON<ProductDB[]>(CKEY_PRODUCTS, []);
        setProducts(cached);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/products-services`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: ProductDB[] = await response.json();
        // Explicitly parse numeric values to ensure they are numbers
        const parsedData = data.map(p => ({
          ...p,
          unit_price: parseFloat(p.unit_price as any),
          cost_price: p.cost_price != null ? parseFloat(p.cost_price as any) : null,
          stock_quantity: parseInt(p.stock_quantity as any, 10),
        }));
        setProducts(parsedData);
        writeJSON(CKEY_PRODUCTS, parsedData);
      } catch (error) {
        console.error('Error fetching products:', error);
        messageApi.error('Failed to fetch products.');
        // fallback to cache
        const cached = readJSON<ProductDB[]>(CKEY_PRODUCTS, []);
        if (cached.length) setProducts(cached);
      } finally {
        setIsLoading(false);
      }
    }

    if (isAuthenticated && token) {
      fetchCustomers();
      fetchProducts();
    } else {
      setCustomers([]);
      setProducts([]);
    }
  }, [isAuthenticated, token, getAuthHeaders, messageApi, isOnline]);

  // Add to cart
  const addToCart = () => {
    if (!isAuthenticated) {
      messageApi.error('Authentication required to add items to cart.');
      return;
    }
    let itemToAdd: CartItem | null = null;
    let finalProduct: ProductDB | null = null;

    if (showCustomProductForm) {
      customProductForm.validateFields().then(async (values) => {
        const customProductName = values.customProductName.trim();
        const customProductUnitPrice = Number(values.customProductUnitPrice);
        const customProductDescription = values.customProductDescription || null;
        const customProductTaxRate = parseFloat(values.customProductTaxRate);
        const isService = !!values.isService;

        setIsAddingCustomProduct(true);
        try {
          if (!isOnline) {
            // --- OFFLINE: NO server create; create a local, temporary item ---
            finalProduct = {
              id: `custom-${Date.now()}`, // string id so backend treats it as custom (product_id = null)
              name: customProductName,
              description: customProductDescription,
              unit_price: customProductUnitPrice,
              cost_price: null,
              sku: null,
              is_service: isService,
              stock_quantity: 0,
              created_at: undefined,
              updated_at: undefined,
              tax_rate_id: null,
              category: null,
              unit: isService ? 'service' : 'unit',
              tax_rate_value: customProductTaxRate,
            };
          } else {
            // ONLINE: Prefer existing, else create on server
            const existingProduct = products.find(p => (p.name || '').toLowerCase() === customProductName.toLowerCase());
            if (existingProduct) {
              finalProduct = existingProduct;
              messageApi.info(`Product "${customProductName}" already exists. Using existing product.`);
            } else {
              const createProductPayload = {
                name: customProductName,
                description: customProductDescription || null,
                unit_price: customProductUnitPrice,
                is_service: isService,
                stock_quantity: isService ? 0 : 0,
                tax_rate_value: customProductTaxRate,
                category: null,
                unit: isService ? 'service' : 'unit',
                cost_price: null,
              };
              const createProductResponse = await fetch(`${API_BASE_URL}/products-services`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...getAuthHeaders(),
                },
                body: JSON.stringify(createProductPayload),
              });
              if (!createProductResponse.ok) {
                const errorData = await createProductResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to create new product.');
              }
              finalProduct = await createProductResponse.json();
              finalProduct.unit_price = parseFloat(finalProduct.unit_price as any);
              if (finalProduct.cost_price != null) {
                finalProduct.cost_price = parseFloat(finalProduct.cost_price as any);
              }
              finalProduct.stock_quantity = parseInt(finalProduct.stock_quantity as any, 10);
              setProducts(prev => {
                const next = [...prev, finalProduct!];
                writeJSON(CKEY_PRODUCTS, next);
                return next;
              });
              messageApi.success(`New ${isService ? 'service' : 'product'} "${finalProduct!.name}" created and added to product list.`);
            }
          }

          itemToAdd = {
            ...finalProduct!,
            quantity: productQty,
            subtotal:
              productQty *
              finalProduct!.unit_price *
              (1 + (finalProduct!.tax_rate_value ?? 0)),
          };

          if (itemToAdd) {
            const existingCartItem = cart.find((i) => i.id === itemToAdd!.id);
            if (existingCartItem) {
              setCart(
                cart.map((i) =>
                  i.id === itemToAdd!.id
                    ? {
                        ...i,
                        quantity: i.quantity + itemToAdd!.quantity,
                        subtotal:
                          (i.quantity + itemToAdd!.quantity) *
                          i.unit_price *
                          (1 + (i.tax_rate_value ?? 0)),
                      }
                    : i,
                ),
              );
            } else {
              setCart([...cart, itemToAdd]);
            }
            setSelectedProduct(null);
            setProductQty(1);
            setProductModal(false);
            setShowCustomProductForm(false);
            customProductForm.resetFields();
            messageApi.success(`"${itemToAdd.name}" added to cart.`);
          }
        } catch (err: any) {
          console.error('Error handling custom product:', err);
          messageApi.error(err.message || 'Failed to process custom product.');
        } finally {
          setIsAddingCustomProduct(false);
        }
      }).catch(() => {
        messageApi.error('Please fill in all required custom product fields.');
      });
      return;
    } else {
      if (!selectedProduct || productQty < 1) return;

      if (selectedProduct.is_service) {
        itemToAdd = {
          ...selectedProduct,
          quantity: productQty,
          subtotal: productQty * selectedProduct.unit_price * (1 + (selectedProduct.tax_rate_value ?? 0)),
        };
      } else {
        const availableQty = selectedProduct.stock_quantity ?? 0;
        const alreadyInCart = cart.find((i) => i.id === selectedProduct.id)?.quantity ?? 0;
        const totalRequested = productQty + alreadyInCart;

        if (availableQty < 1) {
          Modal.confirm({
            title: 'Item Out of Stock',
            content: `"${selectedProduct.name}" is out of stock (only ${availableQty} units available). Do you want to add it to the cart anyway?`,
            okText: 'Yes, Add Anyway',
            cancelText: 'No, Cancel',
            onOk: () => {
              const item = {
                ...selectedProduct,
                quantity: productQty,
                subtotal:
                  productQty *
                  selectedProduct.unit_price *
                  (1 + (selectedProduct.tax_rate_value ?? 0)),
              };
              const existingCartItem = cart.find((i) => i.id === item.id);
              if (existingCartItem) {
                setCart(
                  cart.map((i) =>
                    i.id === item.id
                      ? {
                          ...i,
                          quantity: i.quantity + item.quantity,
                          subtotal:
                            (i.quantity + item.quantity) *
                            i.unit_price *
                            (1 + (i.tax_rate_value ?? 0)),
                        }
                      : i,
                  ),
                );
              } else {
                setCart([...cart, item]);
              }
              setSelectedProduct(null);
              setProductQty(1);
              setProductModal(false);
              setShowCustomProductForm(false);
              messageApi.success(`"${selectedProduct.name}" added to cart.`);
            },
            onCancel: () => {
              messageApi.info('Adding item to cart cancelled.');
            },
          });
          return;
        }

        itemToAdd = {
          ...selectedProduct,
          quantity: productQty,
          subtotal:
            productQty *
            selectedProduct.unit_price *
            (1 + (selectedProduct.tax_rate_value ?? 0)),
        };
      }

      if (itemToAdd) {
        const existingCartItem = cart.find((i) => i.id === itemToAdd!.id);
        if (existingCartItem) {
          setCart(
            cart.map((i) =>
              i.id === itemToAdd!.id
                ? {
                    ...i,
                    quantity: i.quantity + itemToAdd!.quantity,
                    subtotal:
                      (i.quantity + itemToAdd!.quantity) *
                      i.unit_price *
                      (1 + (i.tax_rate_value ?? 0)),
                  }
                : i,
            ),
          );
        } else {
          setCart([...cart, itemToAdd]);
        }
        setSelectedProduct(null);
        setProductQty(1);
        setProductModal(false);
        setShowCustomProductForm(false);
        messageApi.success(`"${itemToAdd.name}" added to cart.`);
      }
    }
  };

  const removeFromCart = (id: number | string) =>
    setCart(cart.filter((i) => i.id !== id));

  const [newCustomerFormInstance] = Form.useForm();
  const handleAddCustomer = async (values: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    taxId?: string;
  }) => {
    if (!isAuthenticated || !token) {
      messageApi.error('Authentication required to add new customers.');
      return;
    }

    if (!isOnline) {
      messageApi.warning('Cannot create a new customer while offline (read-only from cache).');
      return;
    }

    setIsLoading(true);
    try {
      const existingCustomerResponse = await fetch(
        `${API_BASE_URL}/api/customers?search=${values.phone}`,
        {
          headers: getAuthHeaders(),
        },
      );
      const existingCustomers: CustomerFrontend[] =
        await existingCustomerResponse.json();
      const existing = existingCustomers.find(
        (c) => c.phone?.replace(/\D/g, '') === values.phone.replace(/\D/g, ''),
      );
      if (existing) {
        setSelectedCustomer(existing);
        messageApi.info(
          'Customer with that phone number already exists. Selected existing record.',
        );
      } else {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            name: values.name,
            phone: values.phone,
            email: values.email || null,
            address: values.address || null,
            vatNumber: values.taxId || null,
          }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.detail || errorData.error || 'Failed to add new customer.',
          );
        }
        const newCustomer: CustomerFrontend = await response.json();
        setCustomers((prev) => {
          const next = [...prev, newCustomer];
          writeJSON(CKEY_CUSTOMERS, next);
          return next;
        });
        setSelectedCustomer(newCustomer);
        messageApi.success('New customer added and selected.');
      }
    } catch (error: any) {
      console.error('Error adding customer:', error);
      messageApi.error(error.message || 'Failed to add new customer.');
    } finally {
      setIsLoading(false);
      setCustomerModal(false);
      setShowNewCustomer(false);
      newCustomerForm.resetFields();
    }
  };

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const change = paymentType === 'Cash' ? amountPaid - total : 0;

  const handleSubmit = async () => {
    if (!isAuthenticated || !token) {
      messageApi.error('Authentication required to submit sales.');
      return;
    }
    if (cart.length === 0) {
      messageApi.warning('Add at least one product to the cart');
      return;
    }
    if (paymentType === 'Credit') {
      if (!selectedCustomer) {
        messageApi.error('Customer not selected for credit sale.');
        return;
      }
      // Credit limit check (block if exceeded)
      const currentBalance = selectedCustomer.balanceDue || 0;
      const customerCreditLimit = selectedCustomer.creditLimit || Infinity;
      if (
        customerCreditLimit !== Infinity &&
        currentBalance + total > customerCreditLimit
      ) {
        messageApi.error(
          `Credit limit exceeded for ${selectedCustomer.name}. Current balance: R${currentBalance.toFixed(
            2,
          )}, Credit limit: R${customerCreditLimit.toFixed(
            2,
          )}. This sale would put balance at R${(currentBalance + total).toFixed(
            2,
          )}.`,
        );
        return;
      }
      // Flag low score (DO NOT block)
      try {
        if (selectedCustomer?.id && !creditScoreCache[selectedCustomer.id] && isOnline) {
          await fetchAndCacheCustomerScore(selectedCustomer.id);
        }
        const info = selectedCustomer?.id
          ? creditScoreCache[selectedCustomer.id]
          : undefined;
        if (info && info.score < MIN_SCORE) {
          messageApi.warning(
            `Customer credit score is ${info.score} (${info.label}). Proceeding anyway — please ensure policy is followed.`,
          );
        }
      } catch {
        // ignore failures — never block on score
      }
    }

    // --- Validation for Bank Name (Optional but good practice) ---
    if (paymentType === 'Bank' && !bankName?.trim()) {
      // messageApi.warning('Please enter the bank name for bank transfers.');
      // return; // Uncomment if you want to make bank name mandatory
    }

    const tellerName = getUserNameFromLocalStorage();

    const salePayload = {
      cart: cart.map((item) => {
        return {
          id: item.id, // number or custom string
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          is_service: item.is_service || false,
          tax_rate_value: item.tax_rate_value ?? 0,
        };
      }),
      paymentType,
      total,
      customer: selectedCustomer
        ? { id: selectedCustomer.id, name: selectedCustomer.name }
        : null,
      amountPaid: paymentType === 'Cash' ? amountPaid : 0,
      change: paymentType === 'Cash' ? change : 0,
      dueDate: paymentType === 'Credit' ? dueDate : null,
      bankName: paymentType === 'Bank' ? bankName : null,
      tellerName: tellerName,
      branch: '',
      companyName: '',
    };

    // If offline, queue and exit optimistically
    if (!isOnline) {
      const queue = readJSON<any[]>(OKEY_SALES, []);
      queue.push({ localId: `sale-${Date.now()}`, payload: salePayload });
      writeJSON(OKEY_SALES, queue);

      // optimistic UI reset
      setCart([]);
      setAmountPaid(0);
      setDueDate(null);
      setBankName(null);
      setSelectedCustomer(null);
      setPaymentType('Cash');
      messageApi.info('You are offline. Sale saved locally and will sync automatically when online.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(salePayload),
      });

      // If online but network hiccup, queue it
      if (!response.ok) {
        const isNetwork = response.status === 0;
        if (isNetwork) {
          const queue = readJSON<any[]>(OKEY_SALES, []);
          queue.push({ localId: `sale-${Date.now()}`, payload: salePayload });
          writeJSON(OKEY_SALES, queue);
          messageApi.info('Network issue. Sale stored and will sync shortly.');
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to submit sale.');
        }
      }

      // === (Optional) Create a journal entry for the sale ===
      try {
        const debitCandidates =
          paymentType === 'Cash'
            ? ['Cash']
            : paymentType === 'Bank'
            ? ['Bank Account']
            : ['Accounts Receivable'];

        const creditCandidates = ['Sales Revenue'];

        const [debitId, creditId] = await Promise.all([
          findAccountIdByNames(debitCandidates),
          findAccountIdByNames(creditCandidates),
        ]);

        if (debitId && creditId) {
          const entryDate = new Date().toISOString().slice(0, 10);
          const memoParts = ['POS sale'];
          if (selectedCustomer?.name) memoParts.push(`to ${selectedCustomer.name}`);
          if (paymentType === 'Bank' && bankName) memoParts.push(`(${bankName})`);
          const memo = memoParts.join(' ');

          const journalPayload = {
            entryDate,
            memo,
            lines: [
              { accountId: debitId, debit: total, credit: 0 },
              { accountId: creditId, debit: 0, credit: total },
            ],
          };

          const jr = await fetch(`${API_BASE_URL}/journal-entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(journalPayload),
          });

          if (!jr.ok) {
            const err = await jr.json().catch(() => null);
            console.warn('Journal create failed:', err?.error || jr.status);
            messageApi.warning('Sale recorded, but journal could not be created automatically.');
          }
        } else {
          messageApi.warning('Sale recorded, but required accounts were not found to create a journal.');
        }
      } catch (jeErr) {
        console.warn('Journal error:', jeErr);
      }

      // Re-fetch products (online only)
      try {
        const productsResponse = await fetch(`${API_BASE_URL}/products-services`, {
          headers: getAuthHeaders(),
        });
        if (productsResponse.ok) {
          const updatedProductsFromAPI: ProductDB[] = await productsResponse.json();
          setProducts(updatedProductsFromAPI);
          writeJSON(CKEY_PRODUCTS, updatedProductsFromAPI);
        }
      } catch (fetchError) {
        console.warn('Error re-fetching products:', fetchError);
      }

      setCart([]);
      setAmountPaid(0);
      setDueDate(null);
      setBankName(null);
      setSelectedCustomer(null);
      setPaymentType('Cash');
      messageApi.success('Sale submitted and recorded successfully!');
    } catch (err: any) {
      console.error('Error during sale submission:', err);
      // As a safety, queue on unexpected network-type errors
      const queue = readJSON<any[]>(OKEY_SALES, []);
      queue.push({ localId: `sale-${Date.now()}`, payload: salePayload });
      writeJSON(OKEY_SALES, queue);
      messageApi.info('Could not reach the server. Sale saved locally and will sync automatically.');
    } finally {
      setIsLoading(false);
      // try to flush if we’re online
      flushOutbox();
    }
  };

  return (
    <>
      {contextHolder}
      <div style={{ padding: 18, maxWidth: 650, margin: '0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
          <Title level={3} style={{ margin: 0 }}>Point of Sale</Title>
          <Tag color={isOnline ? 'green' : 'red'}>{isOnline ? 'Online' : 'Offline'}</Tag>
        </div>

        {/* Customer Select */}
        <Card
          style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => setCustomerModal(true)}
          bodyStyle={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Text strong>
              {selectedCustomer ? selectedCustomer.name : 'Select Customer (Optional)'}
            </Text>
            <div style={{ fontSize: 12, color: '#888' }}>
              {selectedCustomer?.phone}
            </div>
            {selectedCustomer?.balanceDue !== undefined && (
              <div
                style={{
                  fontSize: 12,
                  color: selectedCustomer.balanceDue > 0 ? 'red' : '#888',
                }}
              >
                Outstanding Balance: R{(selectedCustomer.balanceDue || 0).toFixed(2)}
              </div>
            )}
            {selectedCustomer?.creditLimit !== undefined &&
              selectedCustomer.creditLimit > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  Credit Limit: R{(selectedCustomer.creditLimit || 0).toFixed(2)}
                </div>
              )}
            {/* Credit Score Tag (if cached/loaded) */}
            {selectedCustomer?.id && creditScoreCache[selectedCustomer.id] && (
              <div style={{ marginTop: 6 }}>
                <Tag color={creditScoreCache[selectedCustomer.id].color}>
                  {`Score: ${creditScoreCache[selectedCustomer.id].score} (${creditScoreCache[selectedCustomer.id].label})`}
                </Tag>
              </div>
            )}
          </div>
          <UserAddOutlined />
        </Card>

        {/* Product Select */}
        <Card
          style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => {
            setSelectedProduct(null);
            setShowCustomProductForm(false);
            setProductModal(true);
            customProductForm.resetFields();
            setProductQty(1);
            setCustomProductIsService(false);
          }}
          bodyStyle={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Text strong>
              {selectedProduct ? selectedProduct.name : 'Select Product'}
            </Text>
            <div style={{ fontSize: 12, color: '#888' }}>
              Price: R
              {(selectedProduct?.unit_price || 0).toFixed(2)}{' '}
              {selectedProduct?.is_service ? '(Service)' : ''}
            </div>
            {selectedProduct && (
              <div style={{ fontSize: 12, color: '#888' }}>
                Stock: {selectedProduct.stock_quantity ?? 0} {selectedProduct.unit || ''}
              </div>
            )}
          </div>
          <ShoppingCartOutlined />
        </Card>

        {/* Quantity & Add to Cart */}
        <Row gutter={6} align="middle" style={{ marginBottom: 10 }}>
          <Col>
            <Button
              size="small"
              onClick={() => setProductQty((q) => Math.max(1, q - 1))}
              disabled={
                !isAuthenticated ||
                isLoading ||
                isAddingCustomProduct ||
                (!selectedProduct && !showCustomProductForm)
              }
            >
              -
            </Button>
          </Col>
          <Col>
            <InputNumber
              min={1}
              value={productQty}
              onChange={(value) => setProductQty(value ?? 1)}
              style={{ width: 60 }}
              disabled={
                !isAuthenticated ||
                isLoading ||
                isAddingCustomProduct ||
                (!selectedProduct && !showCustomProductForm)
              }
            />
          </Col>
          <Col>
            <Button
              size="small"
              onClick={() => {
                const max = selectedProduct?.stock_quantity ?? Infinity;
                setProductQty((q) => Math.min(q + 1, max));
              }}
              disabled={
                !isAuthenticated ||
                isLoading ||
                isAddingCustomProduct ||
                (!selectedProduct && !showCustomProductForm)
              }
            >
              +
            </Button>
          </Col>
          <Col>
            <Button
              type="primary"
              onClick={addToCart}
              disabled={
                !isAuthenticated ||
                isLoading ||
                isAddingCustomProduct ||
                (!selectedProduct && !showCustomProductForm) ||
                (showCustomProductForm &&
                  !customProductForm.getFieldValue('customProductName')?.trim())
              }
            >
              Add to Cart
            </Button>
          </Col>
        </Row>

        {/* Cart */}
        <Card title="Cart" style={{ marginBottom: 14 }}>
          {isLoading && (
            <Spin
              tip="Loading products and customers..."
              style={{ display: 'block', margin: '20px auto' }}
            />
          )}
          {!isLoading && screens.md ? (
            <Table
              dataSource={cart}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Product', dataIndex: 'name' },
                { title: 'Qty', dataIndex: 'quantity' },
                {
                  title: 'Price',
                  dataIndex: 'unit_price',
                  render: (price: number) => `R${price.toFixed(2)}`,
                },
                {
                  title: 'Total',
                  render: (_: any, r: any) => `R${r.subtotal.toFixed(2)}`,
                },
                {
                  title: 'Action',
                  render: (_: any, r: any) => (
                    <Button
                      danger
                      size="small"
                      onClick={() => removeFromCart(r.id)}
                      disabled={!isAuthenticated}
                    >
                      Remove
                    </Button>
                  ),
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={3}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell>R{total.toFixed(2)}</Table.Summary.Cell>
                  <Table.Summary.Cell />
                </Table.Summary.Row>
              )}
            />
          ) : !isLoading && cart.length === 0 ? (
            <Text type="secondary">Cart is empty</Text>
          ) : (
            !isLoading &&
            cart.map((item) => (
              <Card key={item.id} size="small" style={{ marginBottom: 6 }}>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Text strong>{item.name}</Text>{' '}
                    <Tag>
                      {item.quantity} x R{item.unit_price.toFixed(2)}{' '}
                    </Tag>
                    <div>Total: R{item.subtotal.toFixed(2)}</div>
                    {String(item.id).startsWith('custom-') && (
                      <div style={{ fontSize: 12, color: '#999' }}>custom item</div>
                    )}
                  </Col>
                  <Col>
                    <Button
                      size="small"
                      danger
                      onClick={() => removeFromCart(item.id)}
                      disabled={!isAuthenticated}
                    >
                      Remove
                    </Button>
                  </Col>
                </Row>
              </Card>
            ))
          )}
        </Card>

        {/* Payment and Submit - IMPROVED ALIGNMENT */}
        <Card>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Payment Method Field Group */}
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ marginBottom: 4 }}>
                <Text strong>Payment Method</Text>
              </div>
              <Select
                value={paymentType}
                onChange={(value) => {
                    setPaymentType(value);
                    if (value !== 'Cash') setAmountPaid(0);
                    if (value !== 'Credit') setDueDate(null);
                    if (value !== 'Bank') setBankName(null);
                }}
                style={{ width: '100%' }}
                disabled={!isAuthenticated || isLoading}
              >
                <Option value="Cash">Cash</Option>
                <Option value="Bank">Bank</Option>
                <Option value="Credit">Credit</Option>
              </Select>
            </div>

            {/* Amount Paid (Cash) */}
            {paymentType === 'Cash' && (
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ marginBottom: 4 }}>
                  <Text>Amount Paid</Text>
                </div>
                <InputNumber
                  min={0}
                  value={amountPaid}
                  onChange={(value) => setAmountPaid(value ?? 0)}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                />
                <div style={{ marginTop: 4 }}>
                  <Text strong>
                    Change:&nbsp;
                    <span style={{ color: change < 0 ? 'red' : 'green' }}>
                      {change < 0 ? 'Insufficient' : `R${change.toFixed(2)}`}
                    </span>
                  </Text>
                </div>
              </div>
            )}

            {/* Bank Name (Bank) */}
            {paymentType === 'Bank' && (
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ marginBottom: 4 }}>
                  <Text>Bank Name</Text>
                </div>
                <Input
                  placeholder="e.g., FNB, ABSA"
                  value={bankName || ''}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                />
              </div>
            )}

            {/* Due Date (Credit) */}
            {paymentType === 'Credit' && (
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ marginBottom: 4 }}>
                  <Text>Due Date</Text>
                </div>
                <Input
                  type="date"
                  value={dueDate || ''}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading}
                />
                {selectedCustomer && (
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    {selectedCustomer.id &&
                      creditScoreCache[selectedCustomer.id] && (
                        <Tag color={creditScoreCache[selectedCustomer.id].color}>
                          {`Score: ${creditScoreCache[selectedCustomer.id].score} (${creditScoreCache[selectedCustomer.id].label})`}
                        </Tag>
                      )}
                    <Text type="warning" style={{ color: 'orange' }}>
                      Credit selected. Please review customer's score and limit.
                    </Text>
                  </div>
                )}
              </div>
            )}
          </div>

          <Divider style={{ margin: '16px 0' }} />
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Text strong>Total: R{total.toFixed(2)}</Text>
          </div>
          <Button
            type="primary"
            block
            onClick={handleSubmit}
            disabled={
              !isAuthenticated ||
              isLoading ||
              cart.length === 0 ||
              (paymentType === 'Cash' && amountPaid < total) ||
              (paymentType === 'Credit' && !selectedCustomer)
            }
          >
            Submit Sale
          </Button>
        </Card>

        {/* ----------- Modals ----------- */}
        <Modal
          open={customerModal}
          onCancel={() => {
            setCustomerModal(false);
            setShowNewCustomer(false);
          }}
          footer={null}
          title="Select Customer"
        >
          <Input
            placeholder="Search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            style={{ marginBottom: 10 }}
            disabled={!isAuthenticated || isLoading}
          />
          <div style={{ maxHeight: 270, overflowY: 'auto' }}>
            {customers
              .filter(
                (c) =>
                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.phone?.includes(customerSearch) ||
                  c.email?.toLowerCase().includes(customerSearch.toLowerCase()),
              )
              .map((c) => (
                <Card
                  key={c.id}
                  style={{ marginBottom: 7, cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setCustomerModal(false);
                  }}
                  size="small"
                  bodyStyle={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <Text strong>{c.name}</Text>
                    <div style={{ fontSize: 13, color: '#888' }}>{c.phone}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{c.email}</div>
                    {/* Show cached score if present */}
                    {creditScoreCache[c.id] && (
                      <div style={{ marginTop: 6 }}>
                        <Tag color={creditScoreCache[c.id].color}>
                          {`Score: ${creditScoreCache[c.id].score} (${creditScoreCache[c.id].label})`}
                        </Tag>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
          </div>
          {!showNewCustomer ? (
            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => setShowNewCustomer(true)}
              disabled={!isAuthenticated || isLoading}
            >
              Add New Customer
            </Button>
          ) : (
            <Form
              form={newCustomerForm}
              onFinish={handleAddCustomer}
              layout="vertical"
              style={{ marginTop: 12 }}
            >
              <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="phone" label="Phone Number" rules={[{ required: true }]}>
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email (Optional)"
                rules={[{ type: 'email', message: 'Please enter a valid email!' }]}
              >
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="address" label="Address (Optional)">
                <Input.TextArea rows={2} disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="taxId" label="Tax ID / VAT Number (Optional)">
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Button htmlType="submit" type="primary" block disabled={!isAuthenticated || isLoading}>
                Save & Select
              </Button>
            </Form>
          )}
        </Modal>

        <Modal
          open={productModal}
          onCancel={() => {
            setProductModal(false);
            setShowCustomProductForm(false);
            setSelectedProduct(null);
            setProductQty(1);
            customProductForm.resetFields();
            setCustomProductIsService(false);
          }}
          footer={null}
          title="Select Product"
        >
          {!showCustomProductForm ? (
            <>
              <Input
                placeholder="Search existing products"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ marginBottom: 10 }}
                disabled={!isAuthenticated || isLoading}
              />
              <div style={{ maxHeight: 270, overflowY: 'auto', marginBottom: 10 }}>
                {products.length === 0 ? (
                  <Text type="secondary">No products found. {isOnline ? 'Check your API endpoint.' : 'You are offline and have no cached products.'}</Text>
                ) : (
                  products
                    .filter(
                      (p) =>
                        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                        p.sku?.toLowerCase().includes(productSearch.toLowerCase()),
                    )
                    .map((p) => (
                      <Card
                        key={p.id}
                        style={{ marginBottom: 7, cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedProduct(p);
                          setProductQty(1);
                          setProductModal(false);
                        }}
                        size="small"
                        bodyStyle={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <Text strong>{p.name}</Text>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            Price: R
                            {typeof p.unit_price === 'number'
                              ? p.unit_price.toFixed(2)
                              : parseFloat(p.unit_price as any).toFixed(2)}{' '}
                            {p.is_service ? '(Service)' : ''}
                          </div>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            Stock: {p.stock_quantity ?? 0} {p.unit || ''}
                          </div>
                          {String(p.id).startsWith('custom-') && (
                            <div style={{ fontSize: 12, color: '#999' }}>custom item (local)</div>
                          )}
                        </div>
                      </Card>
                    ))
                )}
              </div>
              <Button
                block
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  setShowCustomProductForm(true);
                  customProductForm.setFieldsValue({ isService: false });
                }}
                disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
              >
                Add Custom Product/Service
              </Button>
            </>
          ) : (
            <Form form={customProductForm} layout="vertical">
              <Form.Item
                name="customProductName"
                label="Custom Product/Service Name"
                rules={[{ required: true, message: 'Please enter product name!' }]}
              >
                <Input
                  placeholder="E.g., Custom Repair, Consultation Fee"
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                />
              </Form.Item>
              <Form.Item
                name="customProductUnitPrice"
                label="Unit Price"
                rules={[{ required: true, message: 'Please enter unit price!' }, { type: 'number', min: 0.01, message: 'Price must be positive!' }]}
              >
                <InputNumber
                  min={0.01}
                  step={0.01}
                  style={{ width: '100%' }}
                  formatter={(value) => `R ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value) => (value || '').replace(/R\s?|(,*)/g, '') as unknown as number}
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                />
              </Form.Item>
              <Form.Item
                name="customProductDescription"
                label="Description (Optional)"
              >
                <Input.TextArea
                  rows={2}
                  placeholder="Brief description of the custom item"
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                />
              </Form.Item>
              <Form.Item
                name="isService"
                label="Type"
                rules={[{ required: true, message: 'Please select item type!' }]}
                initialValue={false}
              >
                <Select
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                  onChange={(value: boolean) => setCustomProductIsService(value)}
                >
                  <Option value={false}>Product</Option>
                  <Option value={true}>Service</Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="customProductTaxRate"
                label="Tax Rate"
                required
                initialValue="0"
              >
                <Select
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                >
                  <Option value="0">0%</Option>
                  <Option value="0.15">15%</Option>
                </Select>
              </Form.Item>
              <Button
                type="primary"
                block
                onClick={addToCart}
                disabled={
                  !isAuthenticated ||
                  isLoading ||
                  isAddingCustomProduct ||
                  productQty <= 0
                }
              >
                Add Custom Item to Cart
              </Button>
              <Button
                block
                type="default"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setShowCustomProductForm(false);
                  customProductForm.resetFields();
                  setCustomProductIsService(false);
                }}
                disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
              >
                Back to Existing Products
              </Button>
            </Form>
          )}
        </Modal>
      </div>
    </>
  );
}
