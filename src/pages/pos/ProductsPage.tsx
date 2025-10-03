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
  list: () => `${API_BASE}/products-services`,
  byId: (id: string | number) => `${API_BASE}/products-services/${id}`,
  restock: (id: string | number) => `${API_BASE}/products-services/${id}/stock`,
};
const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const getAuthHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

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
};

// Optional sales stats hook (kept from your original)
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [tabKey, setTabKey] = useState('list');
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockForm] = Form.useForm();
  const [formType, setFormType] = useState<'product' | 'service'>('product');
  const isMobile = useMediaQuery({ maxWidth: 767 });

  const isUserAuthenticated = isAuthenticated;

  // ---------- LOAD (with cache) ----------
  const mapBackendToProduct = (p: any): Product => ({
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
        'products:list',
        api.list(),
        { headers: { ...getAuthHeaders() } }
      );
      if (data) {
        const transformed: Product[] = data.map(mapBackendToProduct);
        setProducts(transformed);
        if (fromCache) {
          messageApi.info('Showing cached products (offline).');
        } else {
          messageApi.success('Products loaded.');
        }
      } else {
        // no data at all (no cache and offline or hard failure)
        setProducts([]);
        if (error) messageApi.error('Failed to load products.');
      }
    } finally {
      setLoading(false);
    }
  }, [isUserAuthenticated, messageApi]);

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
        });
        setFormType(editingProduct.type);
      } else {
        form.resetFields();
        form.setFieldsValue({ type: 'product' });
        setFormType('product');
      }
    }
  }, [modalVisible, manualDrawerOpen, editingProduct, form]);

  const closeForm = () => {
    setModalVisible(false);
    setManualDrawerOpen(false);
    setEditingProduct(null);
    form.resetFields();
    setFormType('product');
  };

  const openForm = (record: Product | null = null) => {
    if (!isUserAuthenticated) {
      messageApi.error('Please log in to manage products.');
      return;
    }
    setEditingProduct(record);
    if (isMobile) setManualDrawerOpen(true);
    else setModalVisible(true);
  };

  // ---------- CREATE / UPDATE (queued when offline) ----------
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
    };

    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

    const optimisticMerge = (createdOrUpdated: any) => {
      const newP = mapBackendToProduct(createdOrUpdated);
      setProducts(prev => {
        if (isNew) return [newP, ...prev];
        return prev.map(p => (p.id === newP.id ? newP : p));
      });
    };

    const optimisticFallback = () => {
      // if offline and backend id is unknown for create, fabricate a local temp id
      if (isNew) {
        const temp = mapBackendToProduct({
          ...body,
          id: `tmp-${Date.now()}`,
        });
        setProducts(prev => [temp, ...prev]);
      } else if (editingProduct) {
        // merge into existing UI state
        const local = mapBackendToProduct({
          ...body,
          id: editingProduct.id,
        });
        setProducts(prev => prev.map(p => (p.id === local.id ? local : p)));
      }
    };

    try {
      if (!navigator.onLine) {
        await enqueueRequest(endpoint, method, body, headers);
        optimisticFallback();
        messageApi.info('Queued change (offline). Will sync automatically.');
        closeForm();
        return;
      }

      const res = await fetch(endpoint, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      optimisticMerge(data);
      messageApi.success(`Product ${isNew ? 'added' : 'updated'} successfully.`);
      closeForm();

      // opportunistic flush (drain any left-behind jobs)
      await flushQueue();
      // refresh cached list
      await fetchProducts();
    } catch (err: any) {
      // network/other error: enqueue and optimistic update
      await enqueueRequest(endpoint, method, body, headers);
      optimisticFallback();
      messageApi.info('Network issue: change queued to sync later.');
      closeForm();
    } finally {
      setLoading(false);
    }
  };

  // ---------- DELETE (queued when offline) ----------
  const handleDelete = async (id: string) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to delete products.');
      return;
    }
    const headers = { ...getAuthHeaders() };

    const optimisticRemove = () => setProducts(prev => prev.filter(p => p.id !== id));

    try {
      setLoading(true);
      if (!navigator.onLine) {
        await enqueueRequest(api.byId(id), 'DELETE', null, headers);
        optimisticRemove();
        messageApi.info('Queued delete (offline). Will sync automatically.');
        return;
      }
      const res = await fetch(api.byId(id), { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      optimisticRemove();
      messageApi.success('Deleted successfully.');
      await flushQueue();
      await fetchProducts();
    } catch (err: any) {
      // enqueue anyway for later retry
      await enqueueRequest(api.byId(id), 'DELETE', null, headers);
      optimisticRemove();
      messageApi.info('Network issue: delete queued to sync later.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- RESTOCK (queued when offline) ----------
  const openRestockModal = (product: Product) => {
    if (!isUserAuthenticated) {
      messageApi.error('Please log in to restock products.');
      return;
    }
    setRestockProduct(product);
    restockForm.resetFields();
    setRestockModalVisible(true);
  };

  const handleRestock = async (values: { qty: number; purchasePrice: number }) => {
    if (!isUserAuthenticated || !restockProduct) {
      messageApi.error('Authentication or product information missing for restock.');
      return;
    }
    const payload = {
      adjustmentQuantity: Number(values.qty),
      updatedCostPrice: Number(values.purchasePrice),
    };
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

    const optimisticRestock = () => {
      setProducts(prev =>
        prev.map(p =>
          p.id === restockProduct.id
            ? {
                ...p,
                qty: (Number(p.qty || 0) + payload.adjustmentQuantity),
                unitPurchasePrice: payload.updatedCostPrice ?? p.unitPurchasePrice,
                purchasePrice: payload.updatedCostPrice ?? p.purchasePrice,
              }
            : p
        )
      );
    };

    try {
      setLoading(true);
      if (!navigator.onLine) {
        await enqueueRequest(api.restock(restockProduct.id), 'PUT', payload, headers);
        optimisticRestock();
        setRestockModalVisible(false);
        setRestockProduct(null);
        messageApi.info('Queued restock (offline). Will sync automatically.');
        return;
      }

      const res = await fetch(api.restock(restockProduct.id), {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      optimisticRestock();
      setRestockModalVisible(false);
      setRestockProduct(null);
      messageApi.success('Product restocked successfully!');
      await flushQueue();
      await fetchProducts();
    } catch (err: any) {
      await enqueueRequest(api.restock(restockProduct.id), 'PUT', payload, headers);
      optimisticRestock();
      setRestockModalVisible(false);
      setRestockProduct(null);
      messageApi.info('Network issue: restock queued to sync later.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Lists / tables ----------
  const bestsellers = useProductSalesStats(products, isUserAuthenticated, messageApi);
  const sortedProducts = [...products].sort(
    (a, b) => (bestsellers[b.id] || 0) - (bestsellers[a.id] || 0)
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
      title: 'Quantity',
      dataIndex: 'qty',
      key: 'qty',
      render: (qty: any, rec: Product) => (rec.unit ? `${qty ?? 0} ${rec.unit}` : qty ?? 0),
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
      render: (_: any, r: Product) => `R${r.unitPrice ?? r.price ?? 0}`,
    },
    {
      title: 'Unit Purchase Price',
      dataIndex: 'unitPurchasePrice',
      key: 'unitPurchasePrice',
      render: (val: any) => (val ? `R${val}` : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Product) => (
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
            onConfirm={() => handleDelete(record.id)}
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
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (_: any, r: Product) => `R${r.unitPrice ?? r.price ?? 0}`,
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
      render: (_: any, record: Product) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => openForm(record)}
            disabled={!isUserAuthenticated}
          />
          <Popconfirm
            title="Delete service?"
            onConfirm={() => handleDelete(record.id)}
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
      initialValues={{ type: formType }}
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
        <Tabs activeKey={tabKey} onChange={key => setTabKey(key)}>
          <Tabs.TabPane tab="Products List" key="list">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4">
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">Products</h2>
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
                      key={product.id}
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
                            onConfirm={() => handleDelete(product.id)}
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
                        <strong>Unit Purchase Price:</strong>{' '}
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
                <Table<Product>
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
                      key={service.id}
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
                            onConfirm={() => handleDelete(service.id)}
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
                        <strong>Available Value:</strong>{' '}
                        {service.availableValue ? `${service.availableValue} hours` : '-'}
                      </p>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Table<Product>
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
            name="purchasePrice"
            label="Purchase Price (new unit cost, optional)"
            rules={[{ required: true, message: 'Please enter purchase price' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
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
