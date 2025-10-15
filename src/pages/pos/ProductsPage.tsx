import React, { useEffect, useState, useCallback } from 'react';
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

// 🔌 offline helpers
import {
  fetchWithCache,
  enqueueRequest,
  flushQueue,
} from '../../offline';

// ---- Config / helpers ----
const API_BASE = 'https://quantnow-sa1e.onrender.com';
const api = {
  // if branchId is provided → filter; else get all
  list: (branchId?: string | null) =>
    branchId
      ? `${API_BASE}/products-services?branch_id=${encodeURIComponent(branchId)}`
      : `${API_BASE}/products-services`,
  byId: (id: string | number) => `${API_BASE}/products-services/${id}`,
  // stock receipt endpoint (handles VAT + journals + moving avg) — must exist on server
  stockReceipt: () => `${API_BASE}/stock-receipts`,
};
const apiBranchesMine = () => `${API_BASE}/api/me/branches`;

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const getAuthHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// --- network helpers: only queue on true network failures ---
function isNetworkError(err: unknown) {
  return err instanceof TypeError || (err as any)?.name === 'TypeError';
}

// (optional) API ping for a small status badge (not used to gate actions)
async function pingApi(base = API_BASE, headers = {}) {
  try {
    const r = await fetch(`${base}/health`, { headers, cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

// Types for the form
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
  branch_id?: string | null; // <-- added
};

// Branch types
type MyBranch = { id: string; code: string; name: string; is_primary: boolean };

// Add branch info to Product (non-breaking)
type ProductWithBranch = Product & {
  branch_id?: string | null;
  branch_name?: string | null; // if your API returns it
};

function useProductSalesStats(products: Product[], isAuthenticated: boolean, messageApi: any) {
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
  const [form] = Form.useForm();
  const [editingProduct, setEditingProduct] = useState<ProductWithBranch | null>(null);
  const [search, setSearch] = useState('');
  const [tabKey, setTabKey] = useState('list');
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockProduct, setRestockProduct] = useState<ProductWithBranch | null>(null);
  const [restockForm] = Form.useForm();
  const [formType, setFormType] = useState<'product' | 'service'>('product');
  const isMobile = useMediaQuery({ maxWidth: 767 });

  const isUserAuthenticated = isAuthenticated;

  // Branch state
  const [myBranches, setMyBranches] = useState<MyBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Convenience flags/helpers
  const hasBranches = myBranches.length > 0;
  const pickDefaultBranch = () =>
    selectedBranchId ??
    myBranches.find(b => b.is_primary)?.id ??
    myBranches[0]?.id ??
    null;

  // Optional status badge
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => setApiOk(await pingApi(API_BASE, getAuthHeaders())))();
    const t = setInterval(async () => setApiOk(await pingApi(API_BASE, getAuthHeaders())), 15000);
    return () => clearInterval(t);
  }, []);

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
        const r = await fetch(apiBranchesMine(), { headers: { ...getAuthHeaders() } });
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        const memberships: MyBranch[] = (data?.memberships || []).map((m: any) => ({
          id: String(m.branch_id),
          code: m.code,
          name: m.name,
          is_primary: !!m.is_primary,
        }));
        setMyBranches(memberships);

        const saved = localStorage.getItem('products.selected_branch_id');
        const initial =
          (saved && memberships.some(b => b.id === saved) && saved) ||
          memberships.find(b => b.is_primary)?.id ||
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

  // ---------- LOAD (with cache) ----------
  const mapBackendToProduct = (p: any): ProductWithBranch => ({
    id: p.id,
    name: p.name,
    type: p.is_service ? 'service' : 'product',
    price: p.unit_price,
    unitPrice: p.unit_price,
    purchasePrice: p.cost_price,
    unitPurchasePrice: p.cost_price, // moving average cost (net)
    qty: p.is_service ? undefined : p.stock_quantity,
    unit: p.unit,
    companyName: 'Ngenge Stores',
    availableValue: p.is_service ? p.available_value ?? undefined : undefined,
    minQty: p.min_quantity ?? undefined,
    maxQty: p.max_quantity ?? undefined,
    branch_id: p.branch_id ?? null,
    branch_name: p.branch_name ?? null,
  });

  const fetchProducts = useCallback(async () => {
    if (!isUserAuthenticated) {
      setProducts([]);
      setLoading(false);
      messageApi.warning('Please log in to load products.');
      return;
    }
    setLoading(true);
    try {
      const { data, fromCache, error } = await fetchWithCache<any[]>(
        `products:list:${selectedBranchId ?? 'ALL'}`, // cache key per branch filter
        api.list(selectedBranchId || undefined),
        { headers: { ...getAuthHeaders() } }
      );
      if (data) {
        const transformed: ProductWithBranch[] = data.map(mapBackendToProduct);
        setProducts(transformed);
        if (fromCache) {
          messageApi.info('Showing cached products (offline).');
        } else {
          messageApi.success('Products loaded.');
        }
      } else {
        setProducts([]);
        if (error) messageApi.error('Failed to load products.');
      }
    } finally {
      setLoading(false);
    }
  }, [isUserAuthenticated, messageApi, selectedBranchId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Flush queued requests when online (global safety net)
  useEffect(() => {
    const handler = () => {
      flushQueue(async () => {
        // after each success we could reload, but that's noisy; do one reload at end
      }).then(fetchProducts);
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
          branch_id: editingProduct.branch_id ?? pickDefaultBranch(), // <-- added
        });
        setFormType(editingProduct.type);
      } else {
        form.resetFields();
        form.setFieldsValue({
          type: 'product',
          branch_id: pickDefaultBranch(), // <-- default on create
        });
        setFormType('product');
      }
    }
  }, [modalVisible, manualDrawerOpen, editingProduct, form, myBranches, selectedBranchId]);

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
      });
      setFormType('product');
    }
    if (isMobile) setManualDrawerOpen(true);
    else setModalVisible(true);
  };

  // ---------- CREATE / UPDATE (queue only on true network failures) ----------
  const handleSave = async (values: ProductFormValues) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to save products.');
      return;
    }
    setLoading(true);

    const isNew = !editingProduct;
    const endpoint = isNew ? api.list() : api.byId(editingProduct!.id);
    const method = (isNew ? 'POST' : 'PUT') as 'POST' | 'PUT';

    const body = {
      name: values.name,
      description: '',
      unit_price: Number(values.sellingPrice),
      cost_price: values.type === 'product' ? Number(values.purchasePrice || 0) : null,
      is_service: values.type === 'service',
      stock_quantity: values.type === 'product' ? Number(values.qty || 0) : null,
      unit: values.type === 'product' ? (values.unit || 'item') : null,
      sku: null,
      min_quantity: values.type === 'product' ? Number(values.minQty || 0) : null,
      max_quantity: values.type === 'product' ? Number(values.maxQty || 0) : null,
      available_value: values.type === 'service' ? Number(values.availableValue || 0) : null,
      // IMPORTANT: when user has branches, take explicit form value; otherwise send null
      branch_id: hasBranches ? (values.branch_id ?? selectedBranchId ?? null) : null,
    };

    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

    const optimisticMerge = (createdOrUpdated: any) => {
      const newP = mapBackendToProduct(createdOrUpdated);
      setProducts(prev => (isNew ? [newP, ...prev] : prev.map(p => (p.id === newP.id ? newP : p))));
    };

    const optimisticFallback = () => {
      if (isNew) {
        const temp = mapBackendToProduct({ ...body, id: `tmp-${Date.now()}` });
        setProducts(prev => [temp, ...prev]);
      } else if (editingProduct) {
        const local = mapBackendToProduct({ ...body, id: editingProduct.id });
        setProducts(prev => prev.map(p => (p.id === local.id ? local : p)));
      }
    };

    try {
      const res = await fetch(endpoint, { method, headers, body: JSON.stringify(body) });

      if (!res.ok) {
        // Server responded but unhappy — show server error, DO NOT queue
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
      messageApi.success(`Product ${isNew ? 'added' : 'updated'} successfully.`);
      closeForm();

      await flushQueue();
      await fetchProducts();
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

  // ---------- DELETE (queue only on true network failures) ----------
  const handleDelete = async (id: string) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to delete products.');
      return;
    }
    const headers = { ...getAuthHeaders() };
    const endpoint = api.byId(id);

    const optimisticRemove = () => setProducts(prev => prev.filter(p => p.id !== id));

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
      await fetchProducts();
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

  // ---------- RESTOCK (uses /stock-receipts; queue only on true network failures) ----------
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
      vatRate: 15,
      paidFromBank: false,
      supplierName: '',
    });
    setRestockModalVisible(true);
  };

  const handleRestock = async (values: { qty: number; unitCostIncl: number; vatRate?: number; paidFromBank?: boolean; supplierName?: string }) => {
    if (!isUserAuthenticated || !restockProduct) {
      messageApi.error('Authentication or product information missing for restock.');
      return;
    }

    const payload = {
      product_id: restockProduct.id,
      qty: Number(values.qty),
      unit_cost_incl: Number(values.unitCostIncl),
      vat_rate: values.vatRate ?? 15,
      paid_from_bank: !!values.paidFromBank,         // false => AP, true => Bank
      supplier_name: values.supplierName || null,
      branch_id: restockProduct.branch_id ?? selectedBranchId ?? null,
    };

    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const endpoint = api.stockReceipt();

    const optimisticRestock = () => {
      setProducts(prev =>
        prev.map(p =>
          p.id === restockProduct.id
            ? {
                ...p,
                qty: (Number(p.qty || 0) + Number(values.qty)),
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
        // DO NOT queue on server errors; show the reason
        messageApi.error(`Restock failed: ${detail}`);
        return;
      }

      optimisticRestock();
      setRestockModalVisible(false);
      setRestockProduct(null);
      messageApi.success('Product restocked successfully!');
      await flushQueue();
      await fetchProducts(); // pulls the **new avg cost** back from API
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
  const bestsellers = useProductSalesStats(products, isUserAuthenticated, messageApi);
  const sortedProducts = [...products].sort(
    (a, b) => (bestsellers[b.id as any] || 0) - (bestsellers[a.id as any] || 0)
  );
  const filteredProducts = sortedProducts.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const currencyFormatter = (value: number | string | undefined) =>
    `R ${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const currencyParser = (value: string | undefined) =>
    value ? value.replace(/^R\s?/, '').replace(/,/g, '') : '';

  const productColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Branch',
      key: 'branch',
      render: (_: any, r: ProductWithBranch) =>
        r.branch_name ? r.branch_name : (r.branch_id ? `#${String(r.branch_id).slice(0, 6)}` : '—'),
    },
    {
      title: 'Quantity',
      dataIndex: 'qty',
      key: 'qty',
      render: (qty: any, rec: ProductWithBranch) => (rec.unit ? `${qty ?? 0} ${rec.unit}` : qty ?? 0),
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
      render: (_: any, r: ProductWithBranch) => `R${r.unitPrice ?? r.price ?? 0}`,
    },
    {
      title: 'Unit Purchase Price (Avg)',
      dataIndex: 'unitPurchasePrice',
      key: 'unitPurchasePrice',
      render: (val: any) => (val ? `R${val}` : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ProductWithBranch) => (
        <Space>
          <Button onClick={() => openRestockModal(record)} disabled={!isUserAuthenticated}>
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
        r.branch_name ? r.branch_name : (r.branch_id ? `#${String(r.branch_id).slice(0, 6)}` : '—'),
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (_: any, r: ProductWithBranch) => `R${r.unitPrice ?? r.price ?? 0}`,
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

  const renderForm = () => (
    <Form
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
            form.setFieldsValue({ qty: undefined, unit: undefined, purchasePrice: undefined, minQty: undefined, maxQty: undefined });
          }
        }
      }}
    >
      {/* Branch picker INSIDE the form when user has branches */}
      {hasBranches && (
        <Form.Item
          name="branch_id"
          label="Branch"
          rules={[{ required: true, message: 'Please choose a branch' }]}
        >
          <Select placeholder="Select a branch">
            {myBranches.map(b => (
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
                label="Selling Price"
                rules={[{ required: true }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="purchasePrice"
                label="Purchase Price"
                rules={[{ required: true }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
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
          <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
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
            rules={[{ required: true, message: 'Please enter initial stock quantity' }]}
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
        </>
      )}

      {formType === 'service' && (
        <Form.Item
          name="availableValue"
          label="Available Value (e.g., hours, licenses)"
          rules={[{ required: true, message: 'Please enter available value' }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      )}

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div />
          <div style={{ fontSize: 12 }}>
            {apiOk === false && <span style={{ color: '#cc0000' }}>API unreachable</span>}
            {apiOk === true && <span style={{ color: '#00aa55' }}>API OK</span>}
          </div>
        </div>

        <Tabs activeKey={tabKey} onChange={key => setTabKey(key)}>
          <Tabs.TabPane tab="Products List" key="list">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4">
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">Products</h2>

              <div className={isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'}>
                {/* Branch picker (only if user has branches) */}
                {hasBranches && (
                  <Select
                    value={selectedBranchId ?? undefined}
                    placeholder="All branches"
                    allowClear
                    style={{ minWidth: 220 }}
                    onChange={(val) => {
                      const next = (val as string | undefined) ?? null;
                      setSelectedBranchId(next);
                      if (next) localStorage.setItem('products.selected_branch_id', next);
                      else localStorage.removeItem('products.selected_branch_id');
                    }}
                    disabled={!isUserAuthenticated}
                  >
                    <Select.Option value={undefined as any}>All branches</Select.Option>
                    {myBranches.map(b => (
                      <Select.Option key={b.id} value={b.id}>
                        {(b.code || b.name) + (b.is_primary ? ' • primary' : '')}
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
              onChange={e => setSearch(e.target.value)}
              className="mb-4"
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading products..." />
              </div>
            ) : (
              isMobile ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {filteredProducts.filter(p => p.type === 'product').map(product => (
                    <Card
                      key={product.id as any}
                      title={product.name}
                      size="small"
                      styles={{ body: { padding: 16 } }}
                      extra={
                        <Space>
                          <Button onClick={() => openRestockModal(product)} disabled={!isUserAuthenticated}>
                            Restock
                          </Button>
                          <Button
                            icon={<EditOutlined />}
                            onClick={() => openForm(product)}
                            disabled={!isUserAuthenticated}
                          />
                          <Popconfirm
                            title="Delete product?"
                            onConfirm={() => handleDelete(product.id as unknown as string)}
                            okText="Yes"
                            cancelText="No"
                            disabled={!isUserAuthenticated}
                          >
                            <Button icon={<DeleteOutlined />} danger disabled={!isUserAuthenticated} />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <p>Type: {product.type}</p>
                      <p>Price: R{product.price || product.unitPrice}</p>
                      <p>
                        <strong>Branch:</strong>{' '}
                        {product.branch_name ?? (product.branch_id ? `#${String(product.branch_id).slice(0,6)}` : '—')}
                      </p>
                      <p>
                        <strong>Unit Purchase Price (Avg):</strong>{' '}
                        {product.unitPurchasePrice ? `R${product.unitPurchasePrice}` : '-'}
                      </p>
                      <p>
                        <strong>Current Quantity: {product.qty ?? 0}</strong>
                        {product.unit ? ` ${product.unit}` : ''}
                      </p>
                      <p><strong>Min Quantity:</strong> {product.minQty ?? '-'}</p>
                      <p><strong>Max Quantity:</strong> {product.maxQty ?? '-'}</p>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Table<ProductWithBranch>
                  columns={productColumns as any}
                  dataSource={filteredProducts.filter(p => p.type === 'product')}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 6 }}
                  scroll={{ x: true }}
                />
              )
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab="Services List" key="services">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4">
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">Services</h2>
              <div className={isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'}>
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
              onChange={e => setSearch(e.target.value)}
              className="mb-4"
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading services..." />
              </div>
            ) : (
              isMobile ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {filteredProducts.filter(p => p.type === 'service').map(service => (
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
                            onConfirm={() => handleDelete(service.id as unknown as string)}
                            okText="Yes"
                            cancelText="No"
                            disabled={!isUserAuthenticated}
                          >
                            <Button icon={<DeleteOutlined />} danger disabled={!isUserAuthenticated} />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <p>Type: {service.type}</p>
                      <p>Price: R{service.price || service.unitPrice}</p>
                      <p>
                        <strong>Branch:</strong>{' '}
                        {service.branch_name ?? (service.branch_id ? `#${String(service.branch_id).slice(0,6)}` : '—')}
                      </p>
                      <p>
                        <strong>Available Value:</strong>{' '}
                        {service.availableValue ? `${service.availableValue} hours` : '-'}
                      </p>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Table<ProductWithBranch>
                  columns={serviceColumns as any}
                  dataSource={filteredProducts.filter(p => p.type === 'service')}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 6 }}
                  scroll={{ x: true }}
                />
              )
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
            rules={[{ required: true, message: 'Please enter unit cost incl VAT' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
          </Form.Item>

          <Form.Item name="vatRate" label="VAT Rate (%)" initialValue={15}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="paidFromBank" label="Payment Method" initialValue={false}>
            <Select
              options={[
                { value: false, label: 'On Account (Accounts Payable)' },
                { value: true,  label: 'Paid from Bank now' },
              ]}
            />
          </Form.Item>

          <Form.Item name="supplierName" label="Supplier (optional)">
            <Input placeholder="e.g. ABC Wholesalers" />
          </Form.Item>

          {/* Branch display/override (read-only display; branch used is product.branch_id or selectedBranchId) */}
          <Form.Item label="Branch (auto)">
            <Input
              disabled
              value={
                restockProduct?.branch_name
                  ?? (restockProduct?.branch_id
                        ? `#${String(restockProduct.branch_id).slice(0,6)}`
                        : (selectedBranchId
                            ? `#${String(selectedBranchId).slice(0,6)}`
                            : '—'))
              }
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block disabled={!isUserAuthenticated || loading}>
              Restock
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ProductsPage;
