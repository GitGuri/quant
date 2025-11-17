import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Tabs,
  Select,
  Button,
  Drawer,
  Form,
  Input,
  Space,
  Popconfirm,
  message,
  Card,
  Modal,
  Table,
  InputNumber,
  Col,
  Row,
  Spin,
} from 'antd';
import { useMediaQuery } from 'react-responsive';
import POSDashboard from '../../pages/POSDashboard';
import { useAuth } from '../../AuthPage';
import type { Product } from '../../types/type';
import PlusOutlined from '@ant-design/icons/lib/icons/PlusOutlined';
import EditOutlined from '@ant-design/icons/lib/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/lib/icons/DeleteOutlined';
import UploadOutlined from '@ant-design/icons/lib/icons/UploadOutlined';
import ReceiptProductUploader from './ProductReceiptUpload';
import { useCurrency } from '../../contexts/CurrencyContext';

// 🔌 offline helpers
import {
  fetchWithCache,
  enqueueRequest,
  flushQueue,
} from '../../offline';

// ---- Config / helpers ----
const API_BASE = 'https://quantnow-sa1e.onrender.com';
const api = {
  list: (branchId?: string | null) =>
    branchId
      ? `${API_BASE}/products-services?branch_id=${encodeURIComponent(branchId)}`
      : `${API_BASE}/products-services`,
  byId: (id: string | number) => `${API_BASE}/products-services/${id}`,
  stockReceipt: () => `${API_BASE}/stock-receipts`,
  suppliers: () => `${API_BASE}/api/suppliers`, // <— adjust if your route is different
};
const apiBranchesMine = () => `${API_BASE}/api/me/branches`;

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null;

const getAuthHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// format qty
const formatQty = (q: number | string | null | undefined) => {
  if (q == null) return '0';
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q);
  if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

function isNetworkError(err: unknown) {
  return err instanceof TypeError || (err as any)?.name === 'TypeError';
}

async function pingApi(base = API_BASE, headers = {}) {
  try {
    const r = await fetch(`${base}/health`, { headers, cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

// Types
type PricingTier = { min_qty: number; unit_price: number };
type ComboItem = { product_id: number; qty: number };
type ComboOffer = { name: string; total_price: number; items: ComboItem[] };
type Promotion = {
  name: string;
  type: 'percent' | 'fixed' | 'override';
  value: number;
  start_date?: string;
  end_date?: string;
};

type ProductFormValues = {
  name: string;
  type: 'product' | 'service';
  sellingPrice: number | string;
  purchasePrice?: number | string;
  unit?: string;
  qty?: number;
  minQty?: number;
  maxQty?: number;
  availableValue?: number;
  branch_id?: string | null;
  // Initial stock receipt fields
  initHasVat?: boolean;
  initVatRate?: number;
  initPaymentSource?: 'AP' | 'BANK' | 'CASH';
  initUnitCostIncl?: number;
  initSupplierId?: number;
  initSupplierName?: string;
  initInvoiceNumber?: string;

  // advanced pricing/marketing
  pricing_tiers?: PricingTier[];
  combo_offers?: ComboOffer[];
  promotions?: Promotion[];
};

type MyBranch = { id: string; code: string; name: string; is_primary: boolean };

type ProductWithBranch = Product & {
  branch_id?: string | null;
  branch_name?: string | null;
  pricing_tiers?: PricingTier[];
  combo_offers?: ComboOffer[];
  promotions?: Promotion[];
};

// NEW: Supplier type
type Supplier = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
};

function useProductSalesStats(
  products: Product[],
  isAuthenticated: boolean,
  messageApi: any
) {
  const [bestsellers, setBestsellers] = useState<{ [id: string]: number }>({});
  useEffect(() => {
    if (!isAuthenticated) {
      setBestsellers({});
      return;
    }
    setBestsellers({});
  }, [isAuthenticated, products.length, messageApi]);
  return bestsellers;
}

const ProductsPage = () => {
  const { isAuthenticated } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [products, setProducts] = useState<ProductWithBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();
  const [editingProduct, setEditingProduct] =
    useState<ProductWithBranch | null>(null);
  const [search, setSearch] = useState('');
  const [tabKey, setTabKey] = useState('list');
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockProduct, setRestockProduct] =
    useState<ProductWithBranch | null>(null);
  const [restockForm] = Form.useForm();
  const [formType, setFormType] = useState<'product' | 'service'>('product');
  const isMobile = useMediaQuery({ maxWidth: 767 });

  const isUserAuthenticated = isAuthenticated;

  // Branch state
  const [myBranches, setMyBranches] = useState<MyBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // NEW: suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  const { fmt, formatter: moneyFormatter, parser: moneyParser } = useCurrency();

  const hasBranches = myBranches.length > 0;
  const pickDefaultBranch = () =>
    selectedBranchId ??
    myBranches.find((b) => b.is_primary)?.id ??
    myBranches[0]?.id ??
    null;

  const [apiOk, setApiOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => setApiOk(await pingApi(API_BASE, getAuthHeaders())))();
    const t = setInterval(
      async () => setApiOk(await pingApi(API_BASE, getAuthHeaders())),
      15000
    );
    return () => clearInterval(t);
  }, []);

  // Build options for combo picker (products + services)
  const itemOptions = useMemo(
    () =>
      products.map((p) => ({
        value: Number(p.id),
        label: `${p.name} (${p.type === 'service' ? 'Service' : 'Product'}) — ${fmt(
          p.unitPrice ?? p.price ?? 0
        )}${p.unit ? ` / ${p.unit}` : ''}`,
        search: `${p.name} ${p.unit ?? ''} ${p.type}`.toLowerCase(),
      })),
    [products, fmt]
  );

  const itemFilterOption = (input: string, option?: any) =>
    (option?.label as string)
      ?.toLowerCase()
      .includes(input.toLowerCase()) ||
    (option?.search as string)?.includes(input.toLowerCase());

  // NEW: supplier options + filter
  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        value: s.id,
        label: s.name,
        search: `${s.name} ${(s.email ?? '')} ${(s.phone ?? '')}`
          .toLowerCase()
          .trim(),
      })),
    [suppliers]
  );

  const supplierFilterOption = (input: string, option?: any) =>
    (option?.label as string)
      ?.toLowerCase()
      .includes(input.toLowerCase()) ||
    (option?.search as string)?.includes(input.toLowerCase());

  // ---------- LOAD user branches ----------
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setMyBranches([]);
      setSelectedBranchId(null);
      return;
    }
    (async () => {
      try {
        const r = await fetch(apiBranchesMine(), {
          headers: { ...getAuthHeaders() },
        });
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        const memberships: MyBranch[] = (data?.memberships || []).map(
          (m: any) => ({
            id: String(m.branch_id),
            code: m.code,
            name: m.name,
            is_primary: !!m.is_primary,
          })
        );
        setMyBranches(memberships);

        const saved = localStorage.getItem('products.selected_branch_id');
        const initial =
          (saved && memberships.some((b) => b.id === saved) && saved) ||
          memberships.find((b) => b.is_primary)?.id ||
          memberships[0]?.id ||
          null;

        setSelectedBranchId(initial);
        if (initial) localStorage.setItem('products.selected_branch_id', initial);
      } catch {
        setMyBranches([]);
        setSelectedBranchId(null);
      }
    })();
  }, []);

  // ---------- LOAD suppliers ----------
  useEffect(() => {
    if (!isUserAuthenticated) {
      setSuppliers([]);
      return;
    }
    (async () => {
      try {
        setSuppliersLoading(true);
        const res = await fetch(api.suppliers(), {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error('Failed to load suppliers');
        const data = await res.json();
        setSuppliers(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Load suppliers error', e);
        setSuppliers([]);
      } finally {
        setSuppliersLoading(false);
      }
    })();
  }, [isUserAuthenticated]);

  // cache-buster helper
  const withBust = (url: string, bust?: boolean) => {
    if (!bust) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}__ts=${Date.now()}`;
  };

  // ---------- LOAD products (with cache) ----------
  const mapBackendToProduct = (p: any): ProductWithBranch => ({
    id: p.id,
    name: p.name,
    type: p.is_service ? 'service' : 'product',
    price: p.unit_price,
    unitPrice: p.unit_price,
    purchasePrice: p.cost_price,
    unitPurchasePrice: p.cost_price,
    qty: p.is_service ? undefined : p.stock_quantity,
    unit: p.unit,
    companyName: 'Ngenge Stores',
    availableValue: p.is_service ? p.available_value ?? undefined : undefined,
    minQty: p.min_quantity ?? undefined,
    maxQty: p.max_quantity ?? undefined,
    branch_id: p.branch_id ?? null,
    branch_name: p.branch_name ?? null,
    pricing_tiers: Array.isArray(p.pricing_tiers) ? p.pricing_tiers : [],
    combo_offers: Array.isArray(p.combo_offers) ? p.combo_offers : [],
    promotions: Array.isArray(p.promotions) ? p.promotions : [],
  });

  const fetchProducts = useCallback(
    async (fresh = false) => {
      if (!isUserAuthenticated) {
        setProducts([]);
        setLoading(false);
        messageApi.warning('Please log in to load products.');
        return;
      }
      setLoading(true);
      try {
        const url = withBust(api.list(selectedBranchId || undefined), fresh);

        const keyBase = `products:list:${selectedBranchId ?? 'ALL'}`;
        const cacheKey = fresh ? `${keyBase}:bust:${Date.now()}` : keyBase;

        const { data, fromCache, error } = await fetchWithCache<any[]>(
          cacheKey,
          url,
          { headers: { ...getAuthHeaders() }, fetchInit: { cache: 'no-store' } }
        );

        if (data) {
          const transformed: ProductWithBranch[] = data.map(mapBackendToProduct);
          setProducts(transformed);
          if (!fresh) {
            if (fromCache) messageApi.info('Showing cached products (offline).');
            else messageApi.success('Products loaded.');
          }
        } else {
          setProducts([]);
          if (error) messageApi.error('Failed to load products.');
        }
      } finally {
        setLoading(false);
      }
    },
    [isUserAuthenticated, messageApi, selectedBranchId]
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Flush queued requests when online
  useEffect(() => {
    const handler = () => {
      flushQueue(async () => {}).then(fetchProducts);
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [fetchProducts]);

  // ---------- UI open/close ----------
  useEffect(() => {
    if (modalVisible || manualDrawerOpen) {
      if (editingProduct) {
        form.setFieldsValue({
          name: editingProduct.name,
          sellingPrice: editingProduct.unitPrice,
          purchasePrice: editingProduct.purchasePrice,
          type: editingProduct.type,
          unit: editingProduct.unit,
          qty: editingProduct.qty,
          minQty: editingProduct.minQty,
          maxQty: editingProduct.maxQty,
          availableValue: editingProduct.availableValue,
          branch_id: editingProduct.branch_id ?? pickDefaultBranch(),
          initHasVat: true,
          initVatRate: 15,
          initPaymentSource: 'AP',
          initUnitCostIncl:
            editingProduct.purchasePrice ?? editingProduct.unitPurchasePrice ?? 0,
          initSupplierId: undefined,
          initSupplierName: '',
          initInvoiceNumber: '',
          pricing_tiers: editingProduct.pricing_tiers ?? [],
          combo_offers: editingProduct.combo_offers ?? [],
          promotions: editingProduct.promotions ?? [],
        });
        setFormType(editingProduct.type);
      } else {
        form.resetFields();
        form.setFieldsValue({
          type: 'product',
          branch_id: pickDefaultBranch(),
          initHasVat: true,
          initVatRate: 15,
          initPaymentSource: 'AP',
          initUnitCostIncl: 0,
          initSupplierId: undefined,
          initSupplierName: '',
          initInvoiceNumber: '',
          pricing_tiers: [],
          combo_offers: [],
          promotions: [],
        });
        setFormType('product');
      }
    }
  }, [
    modalVisible,
    manualDrawerOpen,
    editingProduct,
    form,
    myBranches,
    selectedBranchId,
  ]);

  const closeForm = () => {
    setModalVisible(false);
    setManualDrawerOpen(false);
    setEditingProduct(null);
    form.resetFields();
    setFormType('product');
  };

  const openForm = (record: ProductWithBranch | null = null) => {
    if (!isUserAuthenticated) {
      messageApi.error('Please log in to manage products.');
      return;
    }
    setEditingProduct(record);
    if (record) {
      form.setFieldsValue({
        branch_id: record.branch_id ?? pickDefaultBranch(),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        type: 'product',
        branch_id: pickDefaultBranch(),
        initHasVat: true,
        initVatRate: 15,
        initPaymentSource: 'AP',
        initUnitCostIncl: 0,
        initSupplierId: undefined,
        initSupplierName: '',
        initInvoiceNumber: '',
        pricing_tiers: [],
        combo_offers: [],
        promotions: [],
      });
      setFormType('product');
    }
    if (isMobile) setManualDrawerOpen(true);
    else setModalVisible(true);
  };

  // ---------- CREATE / UPDATE ----------
  const handleSave = async (values: ProductFormValues) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to save products.');
      return;
    }
    setLoading(true);

    const isNew = !editingProduct;
    const endpoint = isNew ? api.list() : api.byId(editingProduct!.id);
    const method = (isNew ? 'POST' : 'PUT') as 'POST' | 'PUT';

    const initialQty = values.type === 'product' ? Number(values.qty || 0) : 0;

    const cleanTiers = (arr?: PricingTier[]) =>
      Array.isArray(arr)
        ? arr
            .map((t) => ({
              min_qty: Number(t.min_qty || 0),
              unit_price: Number(t.unit_price || 0),
            }))
            .filter(
              (t) =>
                Number.isFinite(t.min_qty) &&
                t.min_qty > 0 &&
                Number.isFinite(t.unit_price) &&
                t.unit_price >= 0
            )
            .sort((a, b) => a.min_qty - b.min_qty)
        : [];

    const cleanCombos = (arr?: ComboOffer[]) =>
      Array.isArray(arr)
        ? arr
            .map((c) => ({
              name: String(c?.name || 'Combo'),
              total_price: Number(c?.total_price || 0),
              items: Array.isArray(c?.items)
                ? c.items
                    .map((i) => ({
                      product_id: Number(i?.product_id),
                      qty: Number(i?.qty || 0),
                    }))
                    .filter(
                      (i) =>
                        Number.isFinite(i.product_id) &&
                        i.product_id > 0 &&
                        i.qty > 0
                    )
                : [],
            }))
            .filter((c) => c.total_price >= 0 && c.items.length > 0)
        : [];

    const cleanPromos = (arr?: Promotion[]) =>
      Array.isArray(arr)
        ? arr
            .map((p) => ({
              name: String(p?.name || 'Promo'),
              type: (['percent', 'fixed', 'override'].includes(
                String(p?.type)
              )
                ? p.type
                : 'percent') as Promotion['type'],
              value: Number(p?.value || 0),
              start_date: p?.start_date || undefined,
              end_date: p?.end_date || undefined,
            }))
            .filter((p) => Number.isFinite(p.value) && p.value >= 0)
        : [];

    const body: any = {
      name: values.name,
      description: '',
      unit_price: Number(values.sellingPrice),
      cost_price: values.type === 'product' ? Number(values.purchasePrice || 0) : null,
      is_service: values.type === 'service',
      stock_quantity: values.type === 'product' ? 0 : null,
      unit: values.type === 'product' ? values.unit || 'item' : null,
      sku: null,
      min_quantity: values.type === 'product' ? Number(values.minQty || 0) : null,
      max_quantity: values.type === 'product' ? Number(values.maxQty || 0) : null,
      available_value:
        values.type === 'service' ? Number(values.availableValue || 0) : null,
      branch_id: hasBranches ? values.branch_id ?? selectedBranchId ?? null : null,
      pricing_tiers: cleanTiers(values.pricing_tiers),
      combo_offers: cleanCombos(values.combo_offers),
      promotions: cleanPromos(values.promotions),
    };

    // initial_stock only when creating a PRODUCT with initial quantity
    if (isNew && values.type === 'product' && initialQty > 0) {
      body.initial_stock = {
        qty: initialQty,
        unit_cost_incl: Number(
          values.initUnitCostIncl ?? values.purchasePrice ?? 0
        ),
        vat_applicable: values.initHasVat ?? true,
        vat_rate: Number(values.initVatRate ?? 15),
        payment_source: values.initPaymentSource || 'AP',
        supplier_id: values.initSupplierId || null,
        supplier_name: values.initSupplierName || null,
        invoice_number: values.initInvoiceNumber || null,
      };
    }

    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

    const optimisticMerge = (createdOrUpdated: any) => {
      const newP = mapBackendToProduct(createdOrUpdated);
      setProducts((prev) =>
        isNew ? [newP, ...prev] : prev.map((p) => (p.id === newP.id ? newP : p))
      );
    };

    const optimisticFallback = () => {
      if (isNew) {
        const temp = mapBackendToProduct({
          ...body,
          id: `tmp-${Date.now()}`,
          stock_quantity: initialQty,
        });
        setProducts((prev) => [temp, ...prev]);
      } else if (editingProduct) {
        const local = mapBackendToProduct({ ...body, id: editingProduct.id });
        setProducts((prev) =>
          prev.map((p) => (p.id === local.id ? local : p))
        );
      }
    };

    try {
      const res = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j?.error || j?.detail || detail;
        } catch {}
        messageApi.error(`Could not save product: ${detail}`);
        return;
      }

      const data = await res.json();
      optimisticMerge(data);
      closeForm();

      const createdBranch = data?.branch_id ?? null;
      if (hasBranches && selectedBranchId && createdBranch && createdBranch !== selectedBranchId) {
        setSelectedBranchId(createdBranch);
        localStorage.setItem('products.selected_branch_id', createdBranch);
      }

      messageApi.success(`Product ${isNew ? 'added' : 'updated'} successfully.`);
      await flushQueue();
      await fetchProducts(true);
    } catch (err: any) {
      if (isNetworkError(err)) {
        await enqueueRequest(endpoint, method, body, headers);
        optimisticFallback();
        messageApi.info('Network hiccup. Change queued and will sync automatically.');
        closeForm();
      } else {
        messageApi.error(`Save failed: ${err?.message ?? 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- DELETE ----------
  const handleDelete = async (id: string) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to delete products.');
      return;
    }
    const headers = { ...getAuthHeaders() };
    const endpoint = api.byId(id);

    const optimisticRemove = () =>
      setProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      setLoading(true);
      const res = await fetch(endpoint, { method: 'DELETE', headers });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j?.error || j?.detail || detail;
        } catch {}
        messageApi.error(`Delete failed: ${detail}`);
        return;
      }

      optimisticRemove();
      messageApi.success('Deleted successfully.');
      await flushQueue();
      await fetchProducts(true);
    } catch (err: any) {
      if (isNetworkError(err)) {
        await enqueueRequest(endpoint, 'DELETE', null, headers);
        optimisticRemove();
        messageApi.info('Network issue: delete queued to sync later.');
      } else {
        messageApi.error(`Delete failed: ${err?.message ?? 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- RESTOCK ----------
  const openRestockModal = (product: ProductWithBranch) => {
    if (!isUserAuthenticated) {
      messageApi.error('Please log in to restock products.');
      return;
    }
    setRestockProduct(product);
    restockForm.resetFields();
    restockForm.setFieldsValue({
      qty: 1,
      unitCostIncl: product.unitPurchasePrice ?? 0,
      vatApplicable: true,
      vatRate: 15,
      paymentSource: 'AP',
      supplierId: undefined,
      supplierName: '',
      invoiceNumber: '',
    });
    setRestockModalVisible(true);
  };

  const handleRestock = async (values: {
    qty: number;
    unitCostIncl: number;
    vatRate?: number;
    vatApplicable?: boolean;
    paymentSource?: 'AP' | 'BANK' | 'CASH';
    supplierId?: number;
    supplierName?: string;
    invoiceNumber?: string;
  }) => {
    if (!isUserAuthenticated || !restockProduct) {
      messageApi.error('Authentication or product information missing for restock.');
      return;
    }

    const payload = {
      product_id: restockProduct.id,
      qty: Number(values.qty),
      unit_cost_incl: Number(values.unitCostIncl),
      vat_rate: values.vatRate ?? 15,
      vat_applicable: !!values.vatApplicable,
      payment_source: values.paymentSource || 'AP',
      supplier_id: values.supplierId ? Number(values.supplierId) : null,
      supplier_name: values.supplierName || null,
      invoice_number: values.invoiceNumber || null,
      branch_id: restockProduct.branch_id ?? selectedBranchId ?? null,
    };

    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const endpoint = api.stockReceipt();

    const optimisticRestock = () => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === restockProduct.id
            ? {
                ...p,
                qty: Number(p.qty || 0) + Number(values.qty),
              }
            : p
        )
      );
    };

    try {
      setLoading(true);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j?.error || j?.detail || detail;
        } catch {}
        messageApi.error(`Restock failed: ${detail}`);
        return;
      }

      optimisticRestock();
      setRestockModalVisible(false);
      setRestockProduct(null);
      messageApi.success('Product restocked successfully!');
      await flushQueue();
      await fetchProducts(true);
    } catch (err: any) {
      if (isNetworkError(err)) {
        await enqueueRequest(endpoint, 'POST', payload, headers);
        optimisticRestock();
        setRestockModalVisible(false);
        setRestockProduct(null);
        messageApi.info('Network issue: restock queued to sync later.');
      } else {
        messageApi.error(`Restock failed: ${err?.message ?? 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- Lists / tables ----------
  const bestsellers = useProductSalesStats(
    products,
    isUserAuthenticated,
    messageApi
  );
  const sortedProducts = [...products].sort(
    (a, b) => (bestsellers[b.id as any] || 0) - (bestsellers[a.id as any] || 0)
  );
  const filteredProducts = sortedProducts.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const productColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Branch',
      key: 'branch',
      render: (_: any, r: ProductWithBranch) =>
        r.branch_name
          ? r.branch_name
          : r.branch_id
          ? `#${String(r.branch_id).slice(0, 6)}`
          : '—',
    },
    {
      title: 'Quantity',
      dataIndex: 'qty',
      key: 'qty',
      render: (qty: any, rec: ProductWithBranch) =>
        rec.unit ? `${formatQty(qty)} ${rec.unit}` : formatQty(qty),
    },
    {
      title: 'Min Qty',
      dataIndex: 'minQty',
      key: 'minQty',
      render: (minQty: any) => minQty ?? '-',
    },
    {
      title: 'Max Qty',
      dataIndex: 'maxQty',
      key: 'maxQty',
      render: (maxQty: any) => maxQty ?? '-',
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (_: any, r: ProductWithBranch) =>
        fmt(r.unitPrice ?? r.price ?? 0),
    },
    {
      title: 'Unit Purchase Price (Avg)',
      dataIndex: 'unitPurchasePrice',
      key: 'unitPurchasePrice',
      render: (val: any) => (val ? fmt(val) : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ProductWithBranch) => (
        <Space>
          <Button
            onClick={() => openRestockModal(record)}
            disabled={!isUserAuthenticated}
          >
            Restock
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => openForm(record)}
            disabled={!isUserAuthenticated}
          />
          <Popconfirm
            title="Delete product?"
            onConfirm={() => handleDelete(record.id as unknown as string)}
            okText="Yes"
            cancelText="No"
            disabled={!isUserAuthenticated}
          >
            <Button icon={<DeleteOutlined />} danger disabled={!isUserAuthenticated} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const serviceColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Branch',
      key: 'branch',
      render: (_: any, r: ProductWithBranch) =>
        r.branch_name
          ? r.branch_name
          : r.branch_id
          ? `#${String(r.branch_id).slice(0, 6)}`
          : '—',
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (_: any, r: ProductWithBranch) =>
        fmt(r.unitPrice ?? r.price ?? 0),
    },
    {
      title: 'Available Value',
      dataIndex: 'availableValue',
      key: 'availableValue',
      render: (val: any) => (val ? `${val} hours` : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ProductWithBranch) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => openForm(record)}
            disabled={!isUserAuthenticated}
          />
          <Popconfirm
            title="Delete service?"
            onConfirm={() => handleDelete(record.id as unknown as string)}
            okText="Yes"
            cancelText="No"
            disabled={!isUserAuthenticated}
          >
            <Button icon={<DeleteOutlined />} danger disabled={!isUserAuthenticated} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ---- inline editors ----
  const BulkPricingEditor = () => (
    <Card
      size="small"
      style={{ borderRadius: 10, marginTop: 12 }}
      title="Bulk Pricing (optional)"
    >
      <Form.List name="pricing_tiers">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <Row gutter={12} key={field.key} style={{ marginBottom: 8 }}>
                <Col span={10}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'min_qty']}
                    fieldKey={[field.fieldKey!, 'min_qty']}
                    label="Min Qty"
                    rules={[{ required: true, message: 'Min Qty' }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'unit_price']}
                    fieldKey={[field.fieldKey!, 'unit_price']}
                    label="Unit Price"
                    rules={[{ required: true, message: 'Unit Price' }]}
                  >
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      formatter={moneyFormatter}
                      parser={moneyParser}
                    />
                  </Form.Item>
                </Col>
                <Col span={4} style={{ display: 'flex', alignItems: 'end' }}>
                  <Button danger onClick={() => remove(field.name)} block>
                    Remove
                  </Button>
                </Col>
              </Row>
            ))}
            <Button onClick={() => add()} block type="dashed">
              Add Tier
            </Button>
          </>
        )}
      </Form.List>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Example: “From 12 units → R18 each; from 100 units → R15 each”.
      </p>
    </Card>
  );

  const ComboOffersEditor = () => (
    <Card
      size="small"
      style={{ borderRadius: 10, marginTop: 12 }}
      title="Combo Offers (optional)"
    >
      <Form.List name="combo_offers">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <Card key={field.key} size="small" style={{ marginBottom: 12 }}>
                <Row gutter={12}>
                  <Col span={10}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      fieldKey={[field.fieldKey!, 'name']}
                      label="Combo Name"
                      rules={[{ required: true, message: 'Combo name' }]}
                    >
                      <Input placeholder="e.g. Family Pack" />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'total_price']}
                      fieldKey={[field.fieldKey!, 'total_price']}
                      label="Total Price"
                      rules={[{ required: true, message: 'Total price' }]}
                    >
                      <InputNumber
                        min={0}
                        style={{ width: '100%' }}
                        formatter={moneyFormatter}
                        parser={moneyParser}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={4} style={{ display: 'flex', alignItems: 'end' }}>
                    <Button danger onClick={() => remove(field.name)} block>
                      Remove
                    </Button>
                  </Col>
                </Row>

                <Form.List name={[field.name, 'items']}>
                  {(itemFields, itemOps) => (
                    <>
                      {itemFields.map((it) => (
                        <Row gutter={12} key={it.key} style={{ marginBottom: 8 }}>
                          <Col span={16}>
                            <Form.Item
                              {...it}
                              name={[it.name, 'product_id']}
                              fieldKey={[it.fieldKey!, 'product_id']}
                              label="Item (Product or Service)"
                              rules={[{ required: true, message: 'Choose an item' }]}
                            >
                              <Select
                                showSearch
                                placeholder="Search item by name"
                                options={itemOptions}
                                filterOption={itemFilterOption}
                                optionFilterProp="label"
                                allowClear
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...it}
                              name={[it.name, 'qty']}
                              fieldKey={[it.fieldKey!, 'qty']}
                              label="Qty"
                              rules={[{ required: true, message: 'Qty' }]}
                            >
                              <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col
                            span={24}
                            style={{ display: 'flex', justifyContent: 'flex-end' }}
                          >
                            <Button danger onClick={() => itemOps.remove(it.name)}>
                              Remove Item
                            </Button>
                          </Col>
                        </Row>
                      ))}
                      <Button onClick={() => itemOps.add()} block type="dashed">
                        Add Combo Item
                      </Button>
                    </>
                  )}
                </Form.List>
              </Card>
            ))}
            <Button onClick={() => add({ items: [] })} block type="dashed">
              Add Combo
            </Button>
          </>
        )}
      </Form.List>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Pick items (products or services) by name; set quantities. The combo is sold at
        the total price you specify.
      </p>
    </Card>
  );

  const PromotionsEditor = () => (
    <Card
      size="small"
      style={{ borderRadius: 10, marginTop: 12 }}
      title="Promotions (optional)"
    >
      <Form.List name="promotions">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <Row gutter={12} key={field.key} style={{ marginBottom: 8 }}>
                <Col span={6}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'name']}
                    fieldKey={[field.fieldKey!, 'name']}
                    label="Name"
                    rules={[{ required: true, message: 'Name' }]}
                  >
                    <Input placeholder="e.g. Black Friday" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'type']}
                    fieldKey={[field.fieldKey!, 'type']}
                    label="Type"
                    rules={[{ required: true, message: 'Type' }]}
                  >
                    <Select
                      options={[
                        { value: 'percent', label: 'Percent off' },
                        { value: 'fixed', label: 'Fixed amount off' },
                        { value: 'override', label: 'Override price' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'value']}
                    fieldKey={[field.fieldKey!, 'value']}
                    label="Value"
                    rules={[{ required: true, message: 'Value' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6} style={{ display: 'flex', alignItems: 'end' }}>
                  <Button danger onClick={() => remove(field.name)} block>
                    Remove
                  </Button>
                </Col>
                <Col span={12}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'start_date']}
                    fieldKey={[field.fieldKey!, 'start_date']}
                    label="Start (YYYY-MM-DD)"
                  >
                    <Input placeholder="2025-11-04" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'end_date']}
                    fieldKey={[field.fieldKey!, 'end_date']}
                    label="End (YYYY-MM-DD)"
                  >
                    <Input placeholder="2025-12-31" />
                  </Form.Item>
                </Col>
              </Row>
            ))}
            <Button onClick={() => add()} block type="dashed">
              Add Promotion
            </Button>
          </>
        )}
      </Form.List>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Percent/fixed apply discounts; override sets a new price during the promo window.
      </p>
    </Card>
  );

  const renderForm = () => (
    <Form<ProductFormValues>
      form={form}
      layout="vertical"
      onFinish={handleSave}
      initialValues={{ type: formType, branch_id: pickDefaultBranch() }}
      onValuesChange={(changed) => {
        if (changed.type) {
          setFormType(changed.type);
          if (changed.type === 'product') {
            form.setFieldsValue({ availableValue: undefined });
          } else if (changed.type === 'service') {
            form.setFieldsValue({
              qty: undefined,
              unit: undefined,
              purchasePrice: undefined,
              minQty: undefined,
              maxQty: undefined,
              initHasVat: undefined,
              initVatRate: undefined,
              initPaymentSource: undefined,
              initUnitCostIncl: undefined,
              initSupplierId: undefined,
              initSupplierName: undefined,
              initInvoiceNumber: undefined,
            });
          }
        }
      }}
    >
      {hasBranches && (
        <Form.Item
          name="branch_id"
          label="Branch"
          rules={[{ required: true, message: 'Please choose a branch' }]}
        >
          <Select placeholder="Select a branch">
            {myBranches.map((b) => (
              <Select.Option key={b.id} value={b.id}>
                {(b.code || b.name) + (b.is_primary ? ' • primary' : '')}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      )}

      <Form.Item
        name="type"
        label="Type"
        rules={[{ required: true, message: 'Please select Type' }]}
      >
        <Select placeholder="Select type" disabled={!!editingProduct}>
          <Select.Option value="product">Product</Select.Option>
          <Select.Option value="service">Service</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="name"
        label="Name"
        rules={[{ required: true, message: 'Please enter Name' }]}
      >
        <Input placeholder="Enter name" />
      </Form.Item>

      {formType === 'product' ? (
        <Form.Item required style={{ marginBottom: 0 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="sellingPrice"
                label="Selling Price (per unit)"
                rules={[{ required: true }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="purchasePrice"
                label="Purchase Price (per unit)"
                tooltip="A reference cost. Stock valuation will use the Initial Stock Receipt values below."
                rules={[{ required: true }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form.Item>
      ) : (
        <Form.Item
          name="sellingPrice"
          label="Selling Price"
          rules={[{ required: true }]}
        >
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            formatter={moneyFormatter}
            parser={moneyParser}
          />
        </Form.Item>
      )}

      {formType === 'product' && (
        <>
          <Form.Item
            name="unit"
            label="Unit"
            rules={[{ required: true, message: 'Please enter unit' }]}
          >
            <Input placeholder="e.g. kg, litre, box" />
          </Form.Item>

          <Form.Item
            name="qty"
            label="Quantity (Initial Stock)"
            rules={[
              { required: true, message: 'Please enter initial stock quantity' },
            ]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item required style={{ marginBottom: 0 }}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="minQty"
                  label="Min Qty"
                  rules={[{ required: true, message: 'Enter Min Qty' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="maxQty"
                  label="Max Qty"
                  rules={[{ required: true, message: 'Enter Max Qty' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          {/* Initial Stock Receipt */}
          <Card
            size="small"
            style={{ borderRadius: 10, marginTop: 12 }}
            title="Initial Stock Receipt"
          >
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="initHasVat"
                  label="Has VAT?"
                  initialValue={true}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: true, label: 'Yes (apply VAT)' },
                      { value: false, label: 'No (zero-rate)' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="initVatRate"
                  label="VAT Rate (%)"
                  initialValue={15}
                >
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="initPaymentSource"
                  label="Payment Source"
                  initialValue="AP"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: 'AP', label: 'On Account (Accounts Payable)' },
                      { value: 'BANK', label: 'Paid from Bank' },
                      { value: 'CASH', label: 'Paid from Cash' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12} />
            </Row>

            {/* Supplier selection / new supplier */}
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="initSupplierId"
                  label="Supplier (existing)"
                >
                  <Select
                    showSearch
                    placeholder="Select supplier"
                    options={supplierOptions}
                    filterOption={supplierFilterOption}
                    allowClear
                    loading={suppliersLoading}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="initSupplierName"
                  label="Supplier name (new/override)"
                  tooltip="If you leave 'Supplier (existing)' empty and fill this, we'll create/use a supplier with this name."
                >
                  <Input placeholder="e.g. ABC Wholesalers" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="initInvoiceNumber"
              label="Supplier Invoice # (optional)"
            >
              <Input placeholder="e.g. INV-12345" />
            </Form.Item>

            <p style={{ fontSize: 12, color: '#666', marginTop: -8 }}>
              When you create this product, we’ll post a proper stock receipt so
              Inventory, VAT, and AP/Bank/Cash are recorded correctly (and link it to
              your supplier if provided).
            </p>
          </Card>
        </>
      )}

      {formType === 'service' && (
        <Form.Item
          name="availableValue"
          label="Available Value (optional)"
          rules={[{ required: false, message: '(e.g., hours, licenses)' }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      )}

      {/* Bulk pricing & combos apply to both products and services */}
      <BulkPricingEditor />
      <ComboOffersEditor />

      {/* Promotions */}
      <PromotionsEditor />

      <Form.Item>
        <Button type="primary" htmlType="submit" block disabled={loading}>
          {editingProduct ? 'Update' : 'Create'}
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <>
      {contextHolder}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div />
          <div style={{ fontSize: 12 }}>
            {apiOk === false && (
              <span style={{ color: '#cc0000' }}>API unreachable</span>
            )}
            {apiOk === true && (
              <span style={{ color: '#00aa55' }}>API OK</span>
            )}
          </div>
        </div>

        <Tabs activeKey={tabKey} onChange={(key) => setTabKey(key)}>
          <Tabs.TabPane tab="Products List" key="list">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4">
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">Products</h2>

              <div
                className={
                  isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'
                }
              >
                {hasBranches && (
                  <Select
                    value={selectedBranchId ?? undefined}
                    placeholder="All branches"
                    allowClear
                    style={{ minWidth: 220 }}
                    onChange={(val) => {
                      const next = (val as string | undefined) ?? null;
                      setSelectedBranchId(next);
                      if (next)
                        localStorage.setItem('products.selected_branch_id', next);
                      else localStorage.removeItem('products.selected_branch_id');
                    }}
                    disabled={!isUserAuthenticated}
                  >
                    <Select.Option value={undefined as any}>
                      All branches
                    </Select.Option>
                    {myBranches.map((b) => (
                      <Select.Option key={b.id} value={b.id}>
                        {(b.code || b.name) +
                          (b.is_primary ? ' • primary' : '')}
                      </Select.Option>
                    ))}
                  </Select>
                )}

                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  block={isMobile}
                  onClick={() => openForm(null)}
                  disabled={!isUserAuthenticated}
                >
                  Add Item
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  block={isMobile}
                  onClick={() => setImportDrawerOpen(true)}
                  disabled={!isUserAuthenticated}
                >
                  Scan/Upload Receipt
                </Button>
              </div>
            </div>

            <Input.Search
              placeholder="Search products by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-4"
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading products..." />
              </div>
            ) : isMobile ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {filteredProducts
                  .filter((p) => p.type === 'product')
                  .map((product) => (
                    <Card
                      key={product.id as any}
                      title={product.name}
                      size="small"
                      styles={{ body: { padding: 16 } }}
                      extra={
                        <Space>
                          <Button
                            onClick={() => openRestockModal(product)}
                            disabled={!isUserAuthenticated}
                          >
                            Restock
                          </Button>
                          <Button
                            icon={<EditOutlined />}
                            onClick={() => openForm(product)}
                            disabled={!isUserAuthenticated}
                          />
                          <Popconfirm
                            title="Delete product?"
                            onConfirm={() =>
                              handleDelete(product.id as unknown as string)
                            }
                            okText="Yes"
                            cancelText="No"
                            disabled={!isUserAuthenticated}
                          >
                            <Button
                              icon={<DeleteOutlined />}
                              danger
                              disabled={!isUserAuthenticated}
                            />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <p>Type: {product.type}</p>
                      <p>Price: {fmt(product.price ?? product.unitPrice)}</p>
                      <p>
                        <strong>Branch:</strong>{' '}
                        {product.branch_name ??
                          (product.branch_id
                            ? `#${String(product.branch_id).slice(0, 6)}`
                            : '—')}
                      </p>
                      <p>
                        <strong>Unit Purchase Price (Avg):</strong>{' '}
                        {product.unitPurchasePrice
                          ? fmt(product.unitPurchasePrice)
                          : '-'}
                      </p>
                      <p>
                        <strong>
                          Current Quantity: {formatQty(product.qty)}
                        </strong>
                        {product.unit ? ` ${product.unit}` : ''}
                      </p>
                      <p>
                        <strong>Min Quantity:</strong>{' '}
                        {product.minQty ?? '-'}
                      </p>
                      <p>
                        <strong>Max Quantity:</strong>{' '}
                        {product.maxQty ?? '-'}
                      </p>
                    </Card>
                  ))}
              </Space>
            ) : (
              <Table<ProductWithBranch>
                columns={productColumns as any}
                dataSource={filteredProducts.filter(
                  (p) => p.type === 'product'
                )}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 6 }}
                scroll={{ x: true }}
              />
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab="Services List" key="services">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4">
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">Services</h2>
              <div
                className={
                  isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  block={isMobile}
                  onClick={() => openForm(null)}
                  disabled={!isUserAuthenticated}
                >
                  Add Item
                </Button>
              </div>
            </div>

            <Input.Search
              placeholder="Search services by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-4"
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading services..." />
              </div>
            ) : isMobile ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {filteredProducts
                  .filter((p) => p.type === 'service')
                  .map((service) => (
                    <Card
                      key={service.id as any}
                      title={service.name}
                      size="small"
                      styles={{ body: { padding: 16 } }}
                      extra={
                        <Space>
                          <Button
                            icon={<EditOutlined />}
                            onClick={() => openForm(service)}
                            disabled={!isUserAuthenticated}
                          />
                          <Popconfirm
                            title="Delete service?"
                            onConfirm={() =>
                              handleDelete(service.id as unknown as string)
                            }
                            okText="Yes"
                            cancelText="No"
                            disabled={!isUserAuthenticated}
                          >
                            <Button
                              icon={<DeleteOutlined />}
                              danger
                              disabled={!isUserAuthenticated}
                            />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <p>Type: {service.type}</p>
                      <p>Price: {fmt(service.price ?? service.unitPrice)}</p>
                      <p>
                        <strong>Branch:</strong>{' '}
                        {service.branch_name ??
                          (service.branch_id
                            ? `#${String(service.branch_id).slice(0, 6)}`
                            : '—')}
                      </p>
                      <p>
                        <strong>Available Value:</strong>{' '}
                        {service.availableValue
                          ? `${service.availableValue} hours`
                          : '-'}
                      </p>
                    </Card>
                  ))}
              </Space>
            ) : (
              <Table<ProductWithBranch>
                columns={serviceColumns as any}
                dataSource={filteredProducts.filter(
                  (p) => p.type === 'service'
                )}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 6 }}
                scroll={{ x: true }}
              />
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab="Statistics" key="statistics">
            <div className="py-4">
              <POSDashboard products={products} />
            </div>
          </Tabs.TabPane>
        </Tabs>

        {/* Create / Edit */}
        <Drawer
          title={editingProduct ? 'Edit Product' : 'Add Product'}
          open={isMobile && manualDrawerOpen}
          onClose={closeForm}
          placement="bottom"
          height="auto"
          styles={{ body: { paddingBottom: 80 } }}
        >
          {renderForm()}
        </Drawer>

        <Modal
          title={editingProduct ? 'Edit Product' : 'Add Product'}
          open={!isMobile && modalVisible}
          onCancel={closeForm}
          footer={null}
          styles={{ body: { padding: isMobile ? 12 : 24 } }}
        >
          {renderForm()}
        </Modal>

        {/* Receipt Import */}
        <Drawer
          title="Import Products from Receipt(s)"
          open={importDrawerOpen}
          onClose={() => setImportDrawerOpen(false)}
          placement={isMobile ? 'bottom' : 'right'}
          height={isMobile ? '100vh' : undefined}
          width={isMobile ? '100vw' : 700}
          destroyOnClose
        >
          <ReceiptProductUploader
            onClose={() => setImportDrawerOpen(false)}
            onImportSuccess={fetchProducts}
          />
        </Drawer>
      </div>

      {/* Restock */}
      <Modal
        open={restockModalVisible}
        title="Restock Product"
        onCancel={() => setRestockModalVisible(false)}
        footer={null}
      >
        <Form form={restockForm} layout="vertical" onFinish={handleRestock}>
          <Form.Item
            name="qty"
            label="Quantity to Add"
            rules={[{ required: true, message: 'Please enter quantity' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="unitCostIncl"
            label="Unit Cost (Incl VAT)"
            rules={[
              { required: true, message: 'Please enter unit cost incl VAT' },
            ]}
          >
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              formatter={moneyFormatter}
              parser={moneyParser}
            />
          </Form.Item>

          <Form.Item name="vatApplicable" label="Has VAT?" initialValue={true}>
            <Select
              options={[
                { value: true, label: 'Yes (apply VAT)' },
                { value: false, label: 'No (zero-rate this receipt)' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="vatRate"
            label="VAT Rate (%)"
            initialValue={15}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="paymentSource"
            label="Payment Source"
            initialValue="AP"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'AP', label: 'On Account (Accounts Payable)' },
                { value: 'BANK', label: 'Paid from Bank' },
                { value: 'CASH', label: 'Paid from Cash' },
              ]}
            />
          </Form.Item>

          {/* Supplier selection / new supplier */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier (existing)">
                <Select
                  showSearch
                  placeholder="Select supplier"
                  options={supplierOptions}
                  filterOption={supplierFilterOption}
                  allowClear
                  loading={suppliersLoading}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="supplierName"
                label="Supplier name (new/override)"
              >
                <Input placeholder="e.g. ABC Wholesalers" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="invoiceNumber"
            label="Supplier Invoice # (optional)"
          >
            <Input placeholder="e.g. INV-12345" />
          </Form.Item>

          <Form.Item label="Branch (auto)">
            <Input
              disabled
              value={
                restockProduct?.branch_name ??
                (restockProduct?.branch_id
                  ? `#${String(restockProduct.branch_id).slice(0, 6)}`
                  : selectedBranchId
                  ? `#${String(selectedBranchId).slice(0, 6)}`
                  : '—')
              }
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              disabled={!isUserAuthenticated || loading}
            >
              Restock
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ProductsPage;
