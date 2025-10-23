// POSScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useAuth } from '../AuthPage';
import { Header } from '../components/layout/Header';
import { useCurrency } from '../contexts/CurrencyContext';
const useBreakpoint = Grid.useBreakpoint;
const { Title, Text } = Typography;
const { Option } = Select;

// ---- Simple online status hook ----
const useOnline = () => {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
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
const OKEY_SALES = 'pos.outbox.sales';
const ckeyProductsFor = (branchId: string | null, hasBranches: boolean) =>
  `pos.cache.products.${hasBranches ? branchId ?? 'ALL' : 'NO_BRANCH'}`;

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJSON = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

// --- TYPES that match your backend (public.products_services) ---
interface ProductDB {
  id: number | string; // string for offline custom items
  name: string;
  description: string | null;
  unit_price: number;
  cost_price: number | null;
  sku: string | null;
  is_service: boolean;
  stock_quantity: number;
  created_at?: string;
  updated_at?: string;
  tax_rate_id: number | null;
  category: string | null;
  unit: string | null;
  tax_rate_value?: number; // convenience in FE
  branch_id?: string | null; // DB column exists
  // local tag for offline custom items separation (only used if hasBranches)
  __branch_id?: string | null;
}

interface CustomerFrontend {
  id: string;
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

type CartItem = ProductDB & { quantity: number; subtotal: number };
type PaymentType = 'Cash' | 'Bank' | 'Credit';

interface MyBranch {
  id: string;
  code: string;
  name: string;
  is_primary: boolean;
}

type ScoreColor = 'green' | 'blue' | 'orange' | 'red' | 'default';
interface CreditScoreInfo {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
  color: ScoreColor;
}

const MIN_SCORE = 60;

// ---- ENV / API ----
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'
const BRANCH_PICK_KEY = 'pos.selected_branch_id';

// ===== Credit score helpers =====
const scoreFromRatio = (r0: number): CreditScoreInfo => {
  const r = Math.max(0, Math.min(1, r0));
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
  due_date: string | null;
  sale_date: string;
}
const computeCreditScoreFromHistory = (
  history: SaleHistoryRow[] | undefined | null
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
      if (fullyPaid) onTimePaid++;
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

// --- Helper to get user name from localStorage ---
const getUserNameFromLocalStorage = () => {
  const storedName = localStorage.getItem('userName');
  return storedName || 'Unknown User (Local Storage)';
};

export default function POSScreen() {
  const [messageApi, contextHolder] = message.useMessage();
  const screens = useBreakpoint();
  const isOnline = useOnline();
  const { fmt, formatter: moneyFormatter, parser: moneyParser, symbol } = useCurrency();


  // Auth
  const { isAuthenticated } = useAuth();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // UI state
  const [customers, setCustomers] = useState<CustomerFrontend[]>([]);
  const [products, setProducts] = useState<ProductDB[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerFrontend | null>(null);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerForm] = Form.useForm();
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<ProductDB | null>(
    null
  );
  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productQty, setProductQty] = useState(1);

  const [showCustomProductForm, setShowCustomProductForm] = useState(false);
  const [customProductForm] = Form.useForm();
  const [customProductIsService, setCustomProductIsService] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isAddingCustomProduct, setIsAddingCustomProduct] = useState(false);

  // VAT config (from backend)
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [defaultVatRate, setDefaultVatRate] = useState(0); // 0.15 when registered

  // Branches belonging to the user
  const [myBranches, setMyBranches] = useState<MyBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const hasBranches = myBranches.length > 0;

  // Credit score cache
  const [creditScoreCache, setCreditScoreCache] = useState<
    Record<string, CreditScoreInfo>
  >({});

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // ---- Branch membership ----
  const loadInitialBranch = (branches: MyBranch[]) => {
    const saved = localStorage.getItem(BRANCH_PICK_KEY);
    if (saved && branches.some((b) => b.id === saved)) return saved;
    const primary = branches.find((b) => b.is_primary);
    return primary?.id ?? branches[0]?.id ?? null;
  };

  const fetchMyBranches = useCallback(async () => {
    if (!token) {
      setMyBranches([]);
      setSelectedBranchId(null);
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/api/me/branches`, {
        headers: { ...getAuthHeaders() },
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const items: MyBranch[] = (data?.memberships || []).map((m: any) => ({
        id: String(m.branch_id),
        code: m.code,
        name: m.name,
        is_primary: !!m.is_primary,
      }));
      setMyBranches(items);
      setSelectedBranchId(items.length ? loadInitialBranch(items) : null);
    } catch {
      setMyBranches([]);
      setSelectedBranchId(null);
    }
  }, [token, getAuthHeaders]);

  useEffect(() => {
    fetchMyBranches();
  }, [fetchMyBranches]);

  // VAT config
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setIsVatRegistered(false);
      setDefaultVatRate(0);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/me/vat`, {
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        const on = !!j.is_vat_registered;
        setIsVatRegistered(on);
        setDefaultVatRate(on ? 0.15 : 0);
      } catch {
        setIsVatRegistered(false);
        setDefaultVatRate(0);
      }
    })();
  }, [isAuthenticated, token, getAuthHeaders]);

  // Outbox flush (sync queued sales)
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
          const err = await res.json().catch(() => ({}));
          console.warn('Outbox sale failed (kept in queue):', err);
          remaining.push(job);
        } else {
          messageApi.success(`Synced offline sale (${job.localId}).`);
        }
      } catch {
        remaining.push(job);
      }
    }
    writeJSON(OKEY_SALES, remaining);
  }, [isAuthenticated, token, isOnline, getAuthHeaders, messageApi]);

  useEffect(() => {
    flushOutbox();
  }, [flushOutbox]);

  // Customers + Products (with offline cache) — products are branch-aware only if user has branches
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: CustomerFrontend[] = await response.json();
        setCustomers(data);
        writeJSON(CKEY_CUSTOMERS, data);
      } catch (e) {
        messageApi.error('Failed to fetch customers.');
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

      const CACHE_KEY = ckeyProductsFor(selectedBranchId, hasBranches);

      if (!isOnline) {
        const cached = readJSON<ProductDB[]>(CACHE_KEY, []);
        setProducts(cached);
        return;
      }

      setIsLoading(true);
      try {
        const url =
          hasBranches && selectedBranchId
            ? `${API_BASE_URL}/products-services?branch_id=${encodeURIComponent(
                selectedBranchId
              )}`
            : `${API_BASE_URL}/products-services`;

        const response = await fetch(url, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: ProductDB[] = await response.json();

        const parsed = data.map((p) => ({
          ...p,
          unit_price: parseFloat(p.unit_price as any),
          cost_price:
            p.cost_price != null ? parseFloat(p.cost_price as any) : null,
          stock_quantity: parseFloat(String(p.stock_quantity || 0)),
        }));

        setProducts(parsed);
        writeJSON(CACHE_KEY, parsed);
      } catch (e) {
        messageApi.error('Failed to fetch products.');
        const cached = readJSON<ProductDB[]>(CACHE_KEY, []);
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
  }, [
    isAuthenticated,
    token,
    getAuthHeaders,
    messageApi,
    isOnline,
    selectedBranchId,
    hasBranches,
  ]);

  // Re-fetch products when branch changes (online or cached)
  useEffect(() => {
    // No-op here; main effect depends on selectedBranchId
  }, [selectedBranchId]);

  // Credit score on customer select (online only)
  const fetchAndCacheCustomerScore = useCallback(
    async (customerId: string) => {
      if (!isAuthenticated || !token || !isOnline) return;
      if (creditScoreCache[customerId]) return;
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/sales/customer/${customerId}/credit-history`,
          { headers: getAuthHeaders() }
        );
        if (!resp.ok) throw new Error(`Score fetch failed: ${resp.status}`);
        const history: SaleHistoryRow[] = await resp.json();
        const info = computeCreditScoreFromHistory(history);
        setCreditScoreCache((prev) => ({ ...prev, [customerId]: info }));
      } catch {
        setCreditScoreCache((prev) => ({
          ...prev,
          [customerId]: { score: 50, label: 'Unknown', color: 'default' },
        }));
      }
    },
    [isAuthenticated, token, getAuthHeaders, creditScoreCache, isOnline]
  );

  useEffect(() => {
    if (selectedCustomer?.id) fetchAndCacheCustomerScore(selectedCustomer.id);
  }, [selectedCustomer?.id, fetchAndCacheCustomerScore]);

  // Totals with server-like VAT logic
  const totals = useMemo(() => {
    let ex = 0,
      vat = 0,
      inc = 0;
    for (const it of cart) {
      const rate = isVatRegistered
        ? typeof it.tax_rate_value === 'number'
          ? it.tax_rate_value
          : defaultVatRate
        : 0;
      const subEx = +(it.quantity * it.unit_price).toFixed(2);
      const lineVat = +(subEx * rate).toFixed(2);
      const subIn = +(subEx + lineVat).toFixed(2);
      ex += subEx;
      vat += lineVat;
      inc += subIn;
    }
    return {
      excl: +ex.toFixed(2),
      vat: +vat.toFixed(2),
      incl: +inc.toFixed(2),
    };
  }, [cart, isVatRegistered, defaultVatRate]);

  const totalIncl = totals.incl;
  const change = paymentType === 'Cash' ? amountPaid - totalIncl : 0;

  // Add product(s) to cart — includes custom create; branch_id used only if the user has branches
  const addToCart = () => {
    if (!isAuthenticated) {
      messageApi.error('Authentication required to add items to cart.');
      return;
    }
    let itemToAdd: CartItem | null = null;
    let finalProduct: ProductDB | null = null;

    // ----- CUSTOM PRODUCT/SERVICE -----
    if (showCustomProductForm) {
      customProductForm
        .validateFields()
        .then(async (values) => {
          const customProductName = values.customProductName.trim();
          const customProductUnitPrice = Number(values.customProductUnitPrice);
          const customProductDescription = values.customProductDescription || null;
          const customProductTaxRate = parseFloat(values.customProductTaxRate);
          const isService = !!values.isService;
          const qty = Math.max(1, Number(values.customProductQty || 1));

          setIsAddingCustomProduct(true);
          try {
            if (!isOnline) {
              // OFFLINE: create local custom item (tag by branch only if branches exist)
              finalProduct = {
                id: `custom-${Date.now()}`,
                name: customProductName,
                description: customProductDescription,
                unit_price: customProductUnitPrice,
                cost_price: null,
                sku: null,
                is_service: isService,
                stock_quantity: 0,
                tax_rate_id: null,
                category: null,
                unit: isService ? 'service' : 'unit',
                tax_rate_value: isVatRegistered
                  ? Number(customProductTaxRate)
                  : 0,
                ...(hasBranches ? { __branch_id: selectedBranchId ?? null } : {}),
              };
            } else {
              // ONLINE: if product with same name exists, reuse; otherwise create in current branch only if branches exist
              const existingProduct = products.find(
                (p) => (p.name || '').toLowerCase() === customProductName.toLowerCase()
              );
              if (existingProduct) {
                finalProduct = existingProduct;
                messageApi.info(
                  `Product "${customProductName}" already exists. Using existing product.`
                );
              } else {
                const createProductPayload: any = {
                  name: customProductName,
                  description: customProductDescription || null,
                  unit_price: customProductUnitPrice,
                  is_service: isService,
                  stock_quantity: isService ? 0 : 0,
                  tax_rate_value: isVatRegistered
                    ? Number(customProductTaxRate)
                    : 0,
                  category: null,
                  unit: isService ? 'service' : 'unit',
                  cost_price: null,
                };
                if (hasBranches && selectedBranchId) {
                  createProductPayload.branch_id = selectedBranchId;
                }
                const createProductResponse = await fetch(
                  `${API_BASE_URL}/products-services`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...getAuthHeaders(),
                    },
                    body: JSON.stringify(createProductPayload),
                  }
                );
                if (!createProductResponse.ok) {
                  const errorData = await createProductResponse
                    .json()
                    .catch(() => ({}));
                  throw new Error(
                    errorData.error || 'Failed to create new product.'
                  );
                }
                finalProduct = await createProductResponse.json();
                finalProduct.unit_price = parseFloat(
                  finalProduct.unit_price as any
                );
                if (finalProduct.cost_price != null) {
                  finalProduct.cost_price = parseFloat(
                    finalProduct.cost_price as any
                  );
                }
                finalProduct.stock_quantity = parseFloat(
                  String(finalProduct.stock_quantity || 0)
                );
                setProducts((prev) => {
                  const next = [...prev, finalProduct!];
                  writeJSON(
                    ckeyProductsFor(selectedBranchId, hasBranches),
                    next
                  );
                  return next;
                });
                messageApi.success(
                  `New ${isService ? 'service' : 'product'} "${
                    finalProduct!.name
                  }" created.`
                );
              }
            }

            itemToAdd = {
              ...finalProduct!,
              quantity: qty,
              subtotal:
                qty *
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
                      : i
                  )
                );
              } else {
                setCart([...cart, itemToAdd]);
              }

              // Keep modal open, reset for next custom item
setSelectedProduct(null);
setProductQty(1);
setProductModal(false);           // 👈 auto-close modal
setShowCustomProductForm(false);  // 👈 go back to list on next open
messageApi.success(`"${itemToAdd.name}" (x${qty}) added to cart.`);
            }
          } catch (err: any) {
            messageApi.error(err.message || 'Failed to process custom product.');
          } finally {
            setIsAddingCustomProduct(false);
          }
        })
        .catch(() => {
          messageApi.error('Please fill in all required custom product fields.');
        });
      return;
    }

    // ----- EXISTING PRODUCT -----
    if (!selectedProduct || productQty < 1) return;

    if (selectedProduct.is_service) {
      const seededRate = isVatRegistered
        ? selectedProduct.tax_rate_value ?? defaultVatRate
        : 0;

      itemToAdd = {
        ...selectedProduct,
        tax_rate_value: seededRate,
        quantity: productQty,
        subtotal:
          productQty * selectedProduct.unit_price * (1 + (seededRate || 0)),
      };
    } else {
      const availableQty = selectedProduct.stock_quantity ?? 0;
      const alreadyInCart =
        cart.find((i) => i.id === selectedProduct.id)?.quantity ?? 0;
      const totalRequested = productQty + alreadyInCart;

      if (availableQty < 1) {
        Modal.confirm({
          title: 'Item Out of Stock',
          content: `"${selectedProduct.name}" is out of stock (only ${availableQty} units available). Add anyway?`,
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
                    : i
                )
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

      // Allow exceeding stock if you want to (remove this block to hard-block)
      if (totalRequested > availableQty) {
        Modal.confirm({
          title: 'Quantity exceeds available stock',
          content: `You requested ${totalRequested}, but only ${availableQty} in stock. Add anyway?`,
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
                    : i
                )
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
              : i
          )
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
  };

  const removeFromCart = (id: number | string) =>
    setCart(cart.filter((i) => i.id !== id));

  // Add new customer
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
      messageApi.warning(
        'Cannot create a new customer while offline (read-only from cache).'
      );
      return;
    }
    setIsLoading(true);
    try {
      const existingCustomerResponse = await fetch(
        `${API_BASE_URL}/api/customers?search=${values.phone}`,
        { headers: getAuthHeaders() }
      );
      const existingCustomers: CustomerFrontend[] =
        await existingCustomerResponse.json();
      const existing = existingCustomers.find(
        (c) => c.phone?.replace(/\D/g, '') === values.phone.replace(/\D/g, '')
      );
      if (existing) {
        setSelectedCustomer(existing);
        messageApi.info(
          'Customer with that phone number already exists. Selected existing record.'
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
            errorData.detail ||
              errorData.error ||
              'Failed to add new customer.'
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
      messageApi.error(error.message || 'Failed to add new customer.');
    } finally {
      setIsLoading(false);
      setCustomerModal(false);
      setShowNewCustomer(false);
      newCustomerForm.resetFields();
    }
  };

  // Submit sale
  const handleSubmit = async () => {
    if (!isAuthenticated || !token) {
      messageApi.error('Authentication required to submit sales.');
      return;
    }
    if (cart.length === 0) {
      messageApi.warning('Add at least one product to the cart');
      return;
    }

    // Credit checks
    if (paymentType === 'Credit') {
      if (!selectedCustomer) {
        messageApi.error('Customer not selected for credit sale.');
        return;
      }
      const currentBalance = selectedCustomer.balanceDue || 0;
      // NOTE: totals.incl is the gross total
      const customerCreditLimit = selectedCustomer.creditLimit || Infinity;
      if (
        customerCreditLimit !== Infinity &&
        currentBalance + totals.incl > customerCreditLimit
      ) {
        messageApi.error(
          `Credit limit exceeded for ${selectedCustomer.name}. Current balance: R${currentBalance.toFixed(
            2
          )}, Credit limit: R${customerCreditLimit.toFixed(
            2
          )}. This sale would put balance at R${(currentBalance + totals.incl).toFixed(2)}.`
        );
        return;
      }
      try {
        if (
          selectedCustomer?.id &&
          !creditScoreCache[selectedCustomer.id] &&
          isOnline
        ) {
          await fetchAndCacheCustomerScore(selectedCustomer.id);
        }
        const info = selectedCustomer?.id
          ? creditScoreCache[selectedCustomer.id]
          : undefined;
        if (info && info.score < MIN_SCORE) {
          messageApi.warning(
            `Customer credit score is ${info.score} (${info.label}). Proceed carefully.`
          );
        }
      } catch {}
    }

    if (paymentType === 'Cash' && amountPaid < totals.incl) {
      messageApi.error('Amount paid is less than the total due.');
      return;
    }

    const tellerName = getUserNameFromLocalStorage();

    const salePayload = {
      cart: cart.map((item) => {
        const rate = isVatRegistered
          ? typeof item.tax_rate_value === 'number'
            ? item.tax_rate_value
            : defaultVatRate
          : 0;
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price, // excl VAT per unit
          is_service: item.is_service || false,
          tax_rate_value: rate,
          subtotal: +(
            item.quantity * item.unit_price * (1 + (rate || 0))
          ).toFixed(2),
        };
      }),
      paymentType,
      total: totals.incl, // gross
      customer: selectedCustomer
        ? { id: selectedCustomer.id, name: selectedCustomer.name }
        : null,
      amountPaid: paymentType === 'Cash' ? amountPaid : paymentType === 'Bank' ? totals.incl : 0,
      change: paymentType === 'Cash' ? change : 0,
      dueDate: paymentType === 'Credit' ? dueDate : null,
      bankName: paymentType === 'Bank' ? bankName : null,
      tellerName,
      // Include branch ONLY if the user actually has branches
      ...(hasBranches && selectedBranchId ? { branch_id: selectedBranchId } : {}),
    };

    // Offline queue
    if (!isOnline) {
      const queue = readJSON<any[]>(OKEY_SALES, []);
      queue.push({ localId: `sale-${Date.now()}`, payload: salePayload });
      writeJSON(OKEY_SALES, queue);

      setCart([]);
      setAmountPaid(0);
      setDueDate(null);
      setBankName(null);
      setSelectedCustomer(null);
      setPaymentType('Cash');
      messageApi.info(
        'You are offline. Sale saved locally and will sync automatically when online.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(salePayload),
      });

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

      // Re-fetch products for the current branch/no-branch context
      try {
        const url =
          hasBranches && selectedBranchId
            ? `${API_BASE_URL}/products-services?branch_id=${encodeURIComponent(
                selectedBranchId
              )}`
            : `${API_BASE_URL}/products-services`;
        const productsResponse = await fetch(url, {
          headers: getAuthHeaders(),
        });
        if (productsResponse.ok) {
          const updated: ProductDB[] = await productsResponse.json();
          const parsed = updated.map((p) => ({
            ...p,
            unit_price: parseFloat(p.unit_price as any),
            cost_price:
              p.cost_price != null ? parseFloat(p.cost_price as any) : null,
            stock_quantity: parseFloat(String(p.stock_quantity || 0)),
          }));
          setProducts(parsed);
          writeJSON(ckeyProductsFor(selectedBranchId, hasBranches), parsed);
        }
      } catch {
        /* ignore */
      }

      setCart([]);
      setAmountPaid(0);
      setDueDate(null);
      setBankName(null);
      setSelectedCustomer(null);
      setPaymentType('Cash');
      messageApi.success('Sale submitted and recorded successfully!');
    } catch (err: any) {
      const queue = readJSON<any[]>(OKEY_SALES, []);
      queue.push({ localId: `sale-${Date.now()}`, payload: salePayload });
      writeJSON(OKEY_SALES, queue);
      messageApi.info(
        'Could not reach the server. Sale saved locally and will sync automatically.'
      );
    } finally {
      setIsLoading(false);
      flushOutbox();
    }
  };

return (
  <>
    {contextHolder}
    <div style={{ padding: 18, maxWidth: 650, margin: '0 auto' }}>
      <Header
        title="POS"
        rightExtra={
          <>
            <Tag color={isOnline ? 'green' : 'red'}>
              {isOnline ? 'Online' : 'Offline'}
            </Tag>

            {hasBranches ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text type="secondary">Branch</Text>
                <Select
                  size="small"
                  value={selectedBranchId || undefined}
                  style={{ minWidth: 170 }}
                  onChange={(val) => {
                    setSelectedBranchId(val);
                    localStorage.setItem(BRANCH_PICK_KEY, val || '');
                  }}
                  disabled={!isAuthenticated || isLoading}
                >
                  {myBranches.map((b) => (
                    <Option key={b.id} value={b.id}>
                      {(b.code || b.name) + (b.is_primary ? ' • primary' : '')}
                    </Option>
                  ))}
                </Select>
              </div>
            ) : (
              <Tag color="default">No Branch</Tag>
            )}
          </>
        }
      />



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
              {selectedCustomer
                ? selectedCustomer.name
                : 'Select Customer (Optional)'}
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
                Outstanding Balance: {fmt(selectedCustomer.balanceDue || 0)}
              </div>
            )}
            {selectedCustomer?.creditLimit !== undefined &&
              selectedCustomer.creditLimit > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  Credit Limit: {fmt(selectedCustomer.creditLimit || 0)}
                </div>
              )}
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
              Price: {fmt(selectedProduct?.unit_price || 0)}{' '}
              {selectedProduct?.is_service ? '(Service)' : ''}
            </div>
            {selectedProduct && (
              <div style={{ fontSize: 12, color: '#888' }}>
                Stock: {selectedProduct.stock_quantity ?? 0}{' '}
                {selectedProduct.unit || ''}
              </div>
            )}
          </div>
          <ShoppingCartOutlined />
        </Card>

        {/* Quantity & Add */}
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
                  render: (p: number) => fmt(p),
                },
                {
                  title: 'Total',
                  render: (_: any, r: any) => fmt(r.subtotal),
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
                  <Table.Summary.Cell colSpan={2}>
                    Subtotal (excl): {fmt(totals.excl)} | VAT: {fmt(totals.vat)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell colSpan={2} align="right">
                    Total (incl): <strong>{fmt(totals.incl)}</strong>
                  </Table.Summary.Cell>
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
                      {item.quantity} x {fmt(item.unit_price)}{' '}
                    </Tag>
                    <div>Total: {fmt(item.subtotal)}</div>
                    {String(item.id).startsWith('custom-') && (
                      <div style={{ fontSize: 12, color: '#999' }}>
                        custom item
                      </div>
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

        {/* Payment and Submit */}
        <Card>
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
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
                <Option value="Bank">Bank/Swipe</Option>
                <Option value="Credit">Credit</Option>
              </Select>
            </div>

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
  formatter={moneyFormatter}
   parser={moneyParser}
   disabled={!isAuthenticated || isLoading}
 />
                <div style={{ marginTop: 4 }}>
                  <Text strong>
                    Change:&nbsp;
                    <span style={{ color: change < 0 ? 'red' : 'green' }}>
                      {change < 0 ? 'Insufficient' : fmt(change)}
                    </span>
                  </Text>
                </div>
              </div>
            )}

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
            <div style={{ marginBottom: 6 }}>
              Subtotal (excl): <strong>{fmt(totals.excl)}</strong>
            </div>
            <div style={{ marginBottom: 6 }}>
              VAT: <strong>{fmt(totals.vat)}</strong>
            </div>
            <Text strong>Total (incl): {fmt(totals.incl)}</Text>
          </div>
          <Button
            type="primary"
            block
            onClick={handleSubmit}
            disabled={
              !isAuthenticated ||
              isLoading ||
              cart.length === 0 ||
              (paymentType === 'Cash' && amountPaid < totals.incl) ||
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
                  c.email?.toLowerCase().includes(customerSearch.toLowerCase())
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
              <Form.Item
                name="phone"
                label="Phone Number"
                rules={[{ required: true }]}
              >
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email (Optional)"
                rules={[
                  { type: 'email', message: 'Please enter a valid email!' },
                ]}
              >
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="address" label="Address (Optional)">
                <Input.TextArea rows={2} disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Form.Item name="taxId" label="Tax ID / VAT Number (Optional)">
                <Input disabled={!isAuthenticated || isLoading} />
              </Form.Item>
              <Button
                htmlType="submit"
                type="primary"
                block
                disabled={!isAuthenticated || isLoading}
              >
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
              <div
                style={{ maxHeight: 270, overflowY: 'auto', marginBottom: 10 }}
              >
                {products.length === 0 ? (
                  <Text type="secondary">
                    No products found.{' '}
                    {isOnline
                      ? 'Check your API endpoint.'
                      : 'You are offline and have no cached products.'}
                  </Text>
                ) : (
                  products
                    .filter((p) => {
                      // Only apply local custom branch separation if user has branches
                      if (!hasBranches) return true;
                      const isLocal = String(p.id).startsWith('custom-');
                      return !isLocal || p.__branch_id === selectedBranchId;
                    })
                    .filter(
                      (p) =>
                        p.name
                          .toLowerCase()
                          .includes(productSearch.toLowerCase()) ||
                        p.sku?.toLowerCase().includes(productSearch.toLowerCase())
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
 Price: {fmt(typeof p.unit_price === 'number'
  ? p.unit_price
  : parseFloat(p.unit_price as any))}{' '}
                            {p.is_service ? '(Service)' : ''}
                          </div>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            Stock: {p.stock_quantity ?? 0} {p.unit || ''}
                          </div>
                          {String(p.id).startsWith('custom-') && (
                            <div style={{ fontSize: 12, color: '#999' }}>
                              custom item (local)
                            </div>
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
                  customProductForm.setFieldsValue({
                    isService: false,
                    customProductTaxRate: isVatRegistered ? '0.15' : '0',
                    customProductQty: 1,
                  });
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
                name="customProductQty"
                label="Quantity"
                rules={[{ required: true, message: 'Please enter quantity!' }]}
                initialValue={1}
              >
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
                />
              </Form.Item>

              <Form.Item
                name="customProductUnitPrice"
                label="Unit Price"
                rules={[
                  { required: true, message: 'Please enter unit price!' },
                  { type: 'number', min: 0.01, message: 'Price must be positive!' },
                ]}
              >
<InputNumber
  min={0.01}
  step={0.01}
  style={{ width: '100%' }}
  formatter={moneyFormatter}
  parser={moneyParser}
  placeholder={`e.g. ${symbol} 0.00`}
  disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
/>
              </Form.Item>

              <Form.Item name="customProductDescription" label="Description (Optional)">
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
                initialValue={isVatRegistered ? '0.15' : '0'}
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
                disabled={!isAuthenticated || isLoading || isAddingCustomProduct}
              >
                Add to Cart (Keep Open)
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
