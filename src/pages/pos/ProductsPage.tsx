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
import type { Product } from '../../types/type'; // Assuming Product type is defined here
import PlusOutlined from '@ant-design/icons/lib/icons/PlusOutlined';
import EditOutlined from '@ant-design/icons/lib/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/lib/icons/DeleteOutlined';
import UploadOutlined from '@ant-design/icons/lib/icons/UploadOutlined';
import ReceiptProductUploader from './ProductReceiptUpload';

// Define ProductFormValues type again for clarity, as it's used in handleSave
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

// This hook is no longer needed with real backend sales data, but keeping its structure for now if you plan to fetch stats differently
// For now, it will return an empty object or you'll fetch bestsellers from the backend if available.
function useProductSalesStats(products: Product[], isAuthenticated: boolean, messageApi: any) {
  const [bestsellers, setBestsellers] = useState<{ [id: string]: number }>({});

  // In a real application, you would fetch sales statistics from your backend here.
  // For now, this will just return an empty object unless you add a backend endpoint for sales stats.
  useEffect(() => {
    if (!isAuthenticated) {
      setBestsellers({});
      return;
    }
    // Simulate fetching sales stats from a backend if you had an endpoint for it.
    // Example:
    // fetch('https://quantnow.onrender.com/sales/bestsellers', { /* headers */ })
    //     .then(res => res.json())
    //     .then(data => setBestsellers(data))
    //     .catch(err => messageApi.error('Failed to fetch sales stats'));

    // For now, returning an empty object as there's no backend endpoint defined for it in the provided code
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

  // Helper to check authentication for UI enablement
  const isUserAuthenticated = isAuthenticated;

  const fetchProducts = useCallback(async () => {
    if (!isUserAuthenticated) {
      setLoading(false);
      setProducts([]);
      messageApi.warning('Please log in to load products.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://quantnow.onrender.com/products-services', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const transformed: Product[] = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.is_service ? 'service' : 'product',
        price: p.unit_price,
        unitPrice: p.unit_price,
        purchasePrice: p.cost_price,
        unitPurchasePrice: p.cost_price,
        qty: p.stock_quantity,
        unit: p.unit,
        companyName: 'Ngenge Stores', // Assuming this is set on the frontend or comes from backend
        availableValue: p.is_service ? p.available_value : undefined, // Mapped from available_value for services
        minQty: p.min_quantity, // Correctly map min_quantity
        maxQty: p.max_quantity, // Correctly map max_quantity
      }));
      setProducts(transformed);
      messageApi.success('Products loaded successfully.');
    } catch (err) {
      console.error("Failed to fetch products:", err);
      messageApi.error('Error loading products. Please ensure the backend is running and you are logged in.');
    } finally {
      setLoading(false);
    }
  }, [isUserAuthenticated, messageApi]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Properly sync form fields & type when modal/drawer is opened and when editingProduct changes
  useEffect(() => {
    if (modalVisible || manualDrawerOpen) {
      if (editingProduct) {
        // Edit mode
        const fieldsToSet = {
          name: editingProduct.name,
          sellingPrice: editingProduct.unitPrice,
          purchasePrice: editingProduct.purchasePrice,
          type: editingProduct.type,
          unit: editingProduct.unit,
          qty: editingProduct.qty,
          minQty: editingProduct.minQty,
          maxQty: editingProduct.maxQty,
          availableValue: editingProduct.availableValue,
        };
        form.setFieldsValue(fieldsToSet);
        setFormType(editingProduct.type);
      } else {
        // Add mode
        form.resetFields();
        form.setFieldsValue({ type: 'product' }); // Default to product
        setFormType('product');
      }
    }
  }, [modalVisible, manualDrawerOpen, editingProduct, form]);

  // Always reset everything on close
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

  const handleSave = async (values: ProductFormValues) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to save products. Please ensure you are logged in.');
      return;
    }
    setLoading(true);
    const isNew = !editingProduct;
    const endpoint = isNew
      ? 'https://quantnow.onrender.com/products-services'
      : `https://quantnow.onrender.com/products-services/${editingProduct!.id}`;

    const method = isNew ? 'POST' : 'PUT';

    // Construct the body based on formType
    const body = {
      name: values.name,
      description: '', // You might want to add a description field to your form/type
      unit_price: Number(values.sellingPrice),
      cost_price: values.type === 'product' ? Number(values.purchasePrice || 0) : null,
      is_service: values.type === 'service',
      // Conditional assignment for stock_quantity, min_quantity, max_quantity, available_value
      stock_quantity: values.type === 'product' ? Number(values.qty || 0) : null, // Only for products
      unit: values.type === 'product' ? (values.unit || 'item') : null,
      sku: null, // You might want to add an SKU field
      min_quantity: values.type === 'product' ? Number(values.minQty || 0) : null, // Only for products
      max_quantity: values.type === 'product' ? Number(values.maxQty || 0) : null, // Only for products
      available_value: values.type === 'service' ? Number(values.availableValue || 0) : null, // Only for services
    };

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to save');
      }
      messageApi.success(`Product ${isNew ? 'added' : 'updated'} successfully.`);
      closeForm();
      fetchProducts();
    } catch (err: any) {
      console.error("Save product error:", err);
      messageApi.error(`Failed to save product: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isUserAuthenticated) {
      messageApi.error('Authentication required to delete products.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`https://quantnow.onrender.com/products-services/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to delete');
      }
      messageApi.success('Deleted successfully.');
      fetchProducts();
    } catch (err: any) {
      console.error("Delete product error:", err);
      messageApi.error(`Failed to delete: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const openRestockModal = (product: Product) => {
    if (!isUserAuthenticated) {
      messageApi.error('Please log in to restock products.');
      return;
    }
    setRestockProduct(product);
    restockForm.resetFields(); // Clear previous values
    setRestockModalVisible(true);
  };

  const handleRestock = async (values: { qty: number; purchasePrice: number }) => {
    if (!isUserAuthenticated || !restockProduct) {
      messageApi.error('Authentication or product information missing for restock.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(
        `https://quantnow.onrender.com/products-services/${restockProduct.id}/stock`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            adjustmentQuantity: values.qty,
            updatedCostPrice: values.purchasePrice,
          }),
        }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to restock');
      }
      messageApi.success('Product restocked successfully!');
      setRestockModalVisible(false);
      setRestockProduct(null);
      fetchProducts(); // Refresh products list
    } catch (err: any) {
      console.error("Restock product error:", err);
      messageApi.error(`Failed to restock: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Pass isAuthenticated only to useProductSalesStats
  const bestsellers = useProductSalesStats(products, isUserAuthenticated, messageApi);
  const sortedProducts = [...products].sort(
    (a, b) => (bestsellers[b.id] || 0) - (bestsellers[a.id] || 0)
  );

  const filteredProducts = sortedProducts.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  // Define a formatter function for currency inputs
  const currencyFormatter = (value: number | string | undefined) =>
    `R ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Define a parser function to remove the currency symbol and commas
  const currencyParser = (value: string | undefined) =>
    value ? value.replace(/\R\s?|(,*)/g, '') : '';

  const productColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Quantity',
      dataIndex: 'qty',
      key: 'qty',
      render: (qty, rec) => rec.unit ? `${qty ?? 0} ${rec.unit}` : qty ?? 0,
    },
    {
      title: 'Min Qty',
      dataIndex: 'minQty',
      key: 'minQty',
      render: (minQty) => minQty ?? '-',
    },
    {
      title: 'Max Qty',
      dataIndex: 'maxQty',
      key: 'maxQty',
      render: (maxQty) => maxQty ?? '-',
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (_, r) => `R${r.unitPrice ?? r.price ?? 0}`,
    },
    {
      title: 'Unit Purchase Price',
      dataIndex: 'unitPurchasePrice',
      key: 'unitPurchasePrice',
      render: val => (val ? `R${val}` : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
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
            title='Delete product?'
            onConfirm={() => handleDelete(record.id)}
            okText='Yes'
            cancelText='No'
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
      render: (_, r) => `R${r.unitPrice ?? r.price ?? 0}`,
    },
    {
      title: 'Available Value',
      dataIndex: 'availableValue',
      key: 'availableValue',
      render: val => (val ? `${val} hours` : '-'), // Assuming "hours" is a common unit for services
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => openForm(record)}
            disabled={!isUserAuthenticated}
          />
          <Popconfirm
            title='Delete service?'
            onConfirm={() => handleDelete(record.id)}
            okText='Yes'
            cancelText='No'
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
      layout='vertical'
      onFinish={handleSave}
      initialValues={{ type: formType }}
      onValuesChange={(changed, all) => {
        if (changed.type) {
          setFormType(changed.type);
          // Explicitly reset fields that are not applicable to the new type
          if (changed.type === 'product') {
            form.setFieldsValue({ availableValue: undefined });
          } else if (changed.type === 'service') {
            form.setFieldsValue({ qty: undefined, unit: undefined, purchasePrice: undefined, minQty: undefined, maxQty: undefined });
          }
        }
      }}
    >
      <Form.Item
        name='type'
        label='Type'
        rules={[{ required: true, message: 'Please select Type' }]}
      >
        <Select placeholder='Select type' disabled={!!editingProduct}> {/* Disable type change on edit */}
          <Select.Option value='product'>Product</Select.Option>
          <Select.Option value='service'>Service</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item
        name='name'
        label='Name'
        rules={[{ required: true, message: 'Please enter Name' }]}
      >
        <Input placeholder='Enter name' />
      </Form.Item>

      {formType === 'product' ? ( // Always show both for products, regardless of editing mode
        <Form.Item required style={{ marginBottom: 0 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name='sellingPrice'
                label='Selling Price'
                rules={[{ required: true }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name='purchasePrice'
                label='Purchase Price'
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
          name='sellingPrice'
          label='Selling Price'
          rules={[{ required: true }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
        </Form.Item>
      )}

      {formType === 'product' && (
        <>
          <Form.Item
            name='unit'
            label='Unit'
            rules={[{ required: true, message: 'Please enter unit' }]}
          >
            <Input placeholder='e.g. kg, litre, box' />
          </Form.Item>
          {/* ADDED required rule for qty */}
          <Form.Item
            name='qty'
            label='Quantity (Initial Stock)'
            rules={[{ required: true, message: 'Please enter initial stock quantity' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item required style={{ marginBottom: 0 }}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name='minQty'
                  label='Min Qty'
                  rules={[{ required: true, message: 'Enter Min Qty' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name='maxQty'
                  label='Max Qty'
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
          name='availableValue'
          label='Available Value (e.g., hours, licenses)'
          rules={[{ required: true, message: 'Please enter available value' }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      )}
      <Form.Item>
        <Button type='primary' htmlType='submit' block disabled={loading}>
          {editingProduct ? 'Update' : 'Create'}
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <>
      {contextHolder}
      <div className='bg-white p-4 rounded-lg shadow-sm'>
        <Tabs activeKey={tabKey} onChange={key => setTabKey(key)}>
          <Tabs.TabPane tab='Products List' key='list'>
            <div className='flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4'>
              <h2 className='text-xl font-semibold mb-2 sm:mb-0'>Products</h2>
              <div
                className={
                  isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'
                }
              >
                <Button
                  type='primary'
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
              placeholder='Search products by name'
              value={search}
              onChange={e => setSearch(e.target.value)}
              className='mb-4'
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading products..." />
              </div>
            ) : (
              isMobile ? (
                <Space direction='vertical' style={{ width: '100%' }}>
                  {filteredProducts.filter(p => p.type === 'product').map(product => (
                    <Card
                      key={product.id}
                      title={product.name}
                      size='small'
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
                            title='Delete product?'
                            onConfirm={() => handleDelete(product.id)}
                            okText='Yes'
                            cancelText='No'
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
                        {product.unitPurchasePrice
                          ? `R${product.unitPurchasePrice}`
                          : '-'}
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
                  columns={productColumns}
                  dataSource={filteredProducts.filter(p => p.type === 'product')}
                  rowKey='id'
                  loading={loading}
                  pagination={{ pageSize: 6 }}
                  scroll={{ x: true }}
                />
              )
            )}
          </Tabs.TabPane>
          <Tabs.TabPane tab='Services List' key='services'>
            <div className='flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4'>
              <h2 className='text-xl font-semibold mb-2 sm:mb-0'>Services</h2>
              <div className={isMobile ? 'flex flex-col gap-2 w-full' : 'flex gap-2'}>
                <Button
                  type='primary'
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
              placeholder='Search services by name'
              value={search}
              onChange={e => setSearch(e.target.value)}
              className='mb-4'
              allowClear
              disabled={!isUserAuthenticated}
            />

            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 50 }}>
                <Spin size="large" tip="Loading services..." />
              </div>
            ) : (
              isMobile ? (
                <Space direction='vertical' style={{ width: '100%' }}>
                  {filteredProducts.filter(p => p.type === 'service').map(service => (
                    <Card
                      key={service.id}
                      title={service.name}
                      size='small'
                      styles={{ body: { padding: 16 } }}
                      extra={
                        <Space>
                          <Button
                            icon={<EditOutlined />}
                            onClick={() => openForm(service)}
                            disabled={!isUserAuthenticated}
                          />
                          <Popconfirm
                            title='Delete service?'
                            onConfirm={() => handleDelete(service.id)}
                            okText='Yes'
                            cancelText='No'
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
                  columns={serviceColumns}
                  dataSource={filteredProducts.filter(p => p.type === 'service')}
                  rowKey='id'
                  loading={loading}
                  pagination={{ pageSize: 6 }}
                  scroll={{ x: true }}
                />
              )
            )}
          </Tabs.TabPane>
          <Tabs.TabPane tab='Statistics' key='statistics'>
            <div className='py-4'>
              <POSDashboard products={products} />
            </div>
          </Tabs.TabPane>
        </Tabs>

        <Drawer
          title={editingProduct ? 'Edit Product' : 'Add Product'}
          open={isMobile && manualDrawerOpen}
          onClose={closeForm}
          placement='bottom'
          height='auto'
          styles={{ body: { paddingBottom: 80 } }} // Add padding for submit button
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

        {/* Receipt Import Drawer */}
        <Drawer
          title='Import Products from Receipt(s)'
          open={importDrawerOpen}
          onClose={() => setImportDrawerOpen(false)}
          placement={isMobile ? 'bottom' : 'right'}
          height={isMobile ? '100vh' : undefined}
          width={isMobile ? '100vw' : 700}
          destroyOnClose
        >
          <ReceiptProductUploader
            onClose={() => setImportDrawerOpen(false)}
            onImportSuccess={fetchProducts} // Call fetchProducts after successful import
          />
        </Drawer>
      </div>
      <Modal
        open={restockModalVisible}
        title='Restock Product'
        onCancel={() => setRestockModalVisible(false)}
        footer={null}
      >
        <Form form={restockForm} layout='vertical' onFinish={handleRestock}>
          <Form.Item
            name='qty'
            label='Quantity to Add'
            rules={[{ required: true, message: 'Please enter quantity' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name='purchasePrice'
            label='Purchase Price (new unit cost, optional)' // Clarified label as it updates unitPurchasePrice
            rules={[{ required: true, message: 'Please enter purchase price' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} formatter={currencyFormatter} parser={currencyParser} />
          </Form.Item>
          <Form.Item>
            <Button type='primary' htmlType='submit' block disabled={!isUserAuthenticated || loading}>
              Restock
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ProductsPage;
