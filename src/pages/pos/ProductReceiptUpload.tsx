import { useState, useCallback } from 'react';
import {
  Button,
  Upload,
  Tabs,
  List,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  message,
  Spin,
  Row,
  Col,
} from 'antd';
import { UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { useMediaQuery } from 'react-responsive';
import { useAuth } from '../../AuthPage'; // Import useAuth

const { Option } = Select;

// Define the structure for items returned by the receipt scanning AI API
interface ReceiptItem {
  name: string;
  category: 'stock' | 'service'; // Assuming these categories from the AI's output
  unit_price: number;
  quantity: number;
  // Add other fields if the AI API returns them, e.g., 'cost_price', 'sku'
}

// Define the structure for products to be saved to your backend
interface ProductToSave {
  name: string;
  type: 'product' | 'service';
  sellingPrice: number;
  qty: number;
  unit: string;
  companyName: string;
  // Add other fields needed for your products_services table, e.g., description, cost_price, sku, min_quantity, max_quantity
}

// Utility to flatten items from bulk results
function flattenItems(results: Array<{ data?: { items?: ReceiptItem[] } }>): ReceiptItem[] {
  if (Array.isArray(results)) {
    return results.flatMap(r => r.data?.items || []);
  }
  return []; // Should not happen with current usage, but for type safety
}

// Default product structure conversion from ReceiptItem
const defaultProduct = (item: ReceiptItem): ProductToSave => ({
  name: item.name || '',
  type: item.category === 'stock' ? 'product' : 'service',
  sellingPrice: Number(item.unit_price || 0),
  qty: Number(item.quantity || 1),
  unit: 'item', // Default unit, can be adjusted by user
  companyName: '', // This will be filled by the component prop
});

export default function ReceiptProductUploader({
  companyName = 'Ngenge Stores',
  onComplete,
}: {
  companyName?: string;
  onComplete?: () => void;
}) {
  const [tab, setTab] = useState('single');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductToSave[]>([]); // Products parsed from receipts, ready for editing/saving
  const [form] = Form.useForm();
  const isMobile = useMediaQuery({ maxWidth: 767 });

  // Multipart session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [parts, setParts] = useState<File[]>([]); // Store actual File objects for display/count

  const { isAuthenticated } = useAuth(); // Get isAuthenticated from useAuth

  // Helper to check authentication for UI enablement
  const isUserAuthenticated = isAuthenticated;

  // --- API Calls to External AI Service ---

  const processSingleReceipt = async (file: File) => {
    if (!isUserAuthenticated) {
      message.error('Authentication required to process receipts.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(
        'https://rairo-pos-image-api.hf.space/process-receipt', // External AI endpoint
        {
          method: 'POST',
          body: formData,
        }
      );
      const data = await res.json();
      if (data.success) {
        // Assuming the AI returns data in a similar structure: { success: true, data: { items: [...] } }
        setProducts((data.data?.items || []).map(item => ({ ...defaultProduct(item), companyName })));
        message.success('Receipt processed successfully by AI!');
      } else {
        message.error(data.error || 'Failed to process receipt by AI.');
      }
    } catch (error) {
      console.error('Error processing single receipt with AI:', error);
      message.error('Network error or AI service issue during single receipt processing.');
    } finally {
      setLoading(false);
    }
  };

  const startSession = async () => {
    if (!isUserAuthenticated) {
      message.error('Authentication required to start a session.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        'https://rairo-pos-image-api.hf.space/start-receipt-session', // External AI endpoint
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (data.success) {
        setSessionId(data.session_id);
        setParts([]); // Clear any previous parts
        message.success('Multipart session started with AI!');
      } else {
        message.error(data.error || 'Failed to start multipart session with AI.');
      }
    } catch (error) {
      console.error('Error starting AI session:', error);
      message.error('Network error or AI service issue during session start.');
    } finally {
      setLoading(false);
    }
  };

  const addPart = async (file: File) => {
    if (!sessionId) {
      message.error('Start a session first.');
      return;
    }
    if (!isUserAuthenticated) {
      message.error('Authentication required to add parts.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(
        `https://rairo-pos-image-api.hf.space/add-receipt-part/${sessionId}`, // External AI endpoint
        {
          method: 'POST',
          body: formData,
        }
      );
      const data = await res.json();
      if (data.success) {
        setParts((prev) => [...prev, file]);
        message.success(`Part ${data.parts_count || parts.length + 1} added to AI session!`);
      } else {
        message.error(data.error || 'Failed to add part to AI session.');
      }
    } catch (error) {
      console.error('Error adding part to AI session:', error);
      message.error('Network error or AI service issue during adding part.');
    } finally {
      setLoading(false);
    }
  };

  const processSession = async () => {
    if (!sessionId) {
      message.error('No session started.');
      return;
    }
    if (!isUserAuthenticated) {
      message.error('Authentication required to process session.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://rairo-pos-image-api.hf.space/process-receipt-session/${sessionId}`, // External AI endpoint
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (data.success) {
        setProducts((data.data?.items || []).map(item => ({ ...defaultProduct(item), companyName })));
        message.success('AI session processed!');
        setSessionId(null); // End session after processing
        setParts([]);
      } else {
        message.error(data.error || 'Failed to process AI session.');
      }
    } catch (error) {
      console.error('Error processing AI session:', error);
      message.error('Network error or AI service issue during session processing.');
    } finally {
      setLoading(false);
    }
  };

  const processBulkReceipts = async (files: File[]) => {
    if (!isUserAuthenticated) {
      message.error('Authentication required for bulk processing.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('images', f)); // 'images' should match the AI's expected field name

    try {
      const res = await fetch(
        'https://rairo-pos-image-api.hf.space/bulk-process-receipts', // External AI endpoint
        {
          method: 'POST',
          body: formData,
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        // Assuming the AI returns { success: true, results: [{ data: { items: [...] } }] }
        setProducts(flattenItems(data.results || []).map(item => ({ ...defaultProduct(item), companyName })));
        message.success(`Bulk receipts processed by AI! ${files.length} files.`);
      } else {
        message.error(data.error || 'Bulk processing failed by AI.');
      }
    } catch (error) {
      console.error('Error processing bulk receipts with AI:', error);
      message.error('Network error or AI service issue during bulk receipt processing.');
    } finally {
      setLoading(false);
    }
  };

  // --- SAVE PRODUCTS TO YOUR BACKEND (PostgreSQL) ---
  const saveAll = async (values: { products: ProductToSave[] }) => {
    if (!isUserAuthenticated) {
      message.error('Authentication required to save products.');
      return;
    }
    setLoading(true);
    let successfulSaves = 0;
    let failedSaves = 0;

    // Explicitly get the token from localStorage here, similar to ProductsPage
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      message.error('Authentication token missing. Please log in again.');
      setLoading(false);
      return;
    }

    for (const product of values.products) {
      try {
        const productToSave = {
          name: product.name,
          description: '', // Add description if available from receipt or form
          unit_price: Number(product.sellingPrice),
          cost_price: null, // Receipt AI might not provide cost price, set to null or default
          is_service: product.type === 'service',
          stock_quantity: product.type === 'product' ? Number(product.qty || 0) : null,
          unit: product.type === 'product' ? (product.unit || 'item') : null,
          sku: null, // Add SKU if available from receipt or form
          min_quantity: null, // Add min/max qty if available or set defaults
          max_quantity: null,
          available_value: product.type === 'service' ? Number(product.qty || 0) : null, // For services, qty can be available_value
          company_name: companyName, // Ensure this is correctly passed
        };

        const res = await fetch('https://quantnow.onrender.com/products-services', { // Your backend endpoint for adding products
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`, // Use the explicitly fetched token
          },
          body: JSON.stringify(productToSave),
        });

        if (res.ok) {
          successfulSaves++;
        } else {
          const errorData = await res.json();
          console.error(`Failed to save product ${product.name}:`, errorData.message || 'Unknown error');
          failedSaves++;
        }
      } catch (error) {
        console.error(`Error saving product ${product.name}:`, error);
        failedSaves++;
      }
    }

    if (successfulSaves > 0) {
      message.success(`${successfulSaves} product(s) saved successfully to your database!`);
    }
    if (failedSaves > 0) {
      message.error(`${failedSaves} product(s) failed to save. Check console for details.`);
    }

    setProducts([]); // Clear products after attempting to save all
    if (onComplete) onComplete(); // Trigger parent callback to refresh product list

    setLoading(false);
  };

  // --- RENDER ---

  const renderProductEditor = () => (
    <Form
      form={form}
      initialValues={{ products }}
      onFinish={(vals) => saveAll(vals)}
      autoComplete='off'
      style={{ width: '100%' }}
    >
      <Form.List name='products' initialValue={products}>
        {(fields, { add, remove }) => (
          <div>
            {fields.map((field, idx) =>
              isMobile ? (
                <Card
                  key={field.key}
                  style={{ marginBottom: 16 }}
                  size='small'
                  title={<span>{`Product #${idx + 1}`}</span>}
                  extra={
                    <Button danger onClick={() => remove(field.name)} disabled={loading}>
                      Remove
                    </Button>
                  }
                >
                  <Form.Item
                    name={[field.name, 'name']}
                    label='Name'
                    rules={[{ required: true }]}
                  >
                    <Input disabled={loading} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'type']}
                    label='Type'
                    rules={[{ required: true }]}
                  >
                    <Select disabled={loading}>
                      <Option value='product'>Product</Option>
                      <Option value='service'>Service</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'sellingPrice']}
                    label='Selling Price'
                    rules={[{ required: true }]}
                  >
                    <InputNumber prefix='R' style={{ width: '100%' }} disabled={loading} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'qty']}
                    label='Qty'
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} disabled={loading} />
                  </Form.Item>
                </Card>
              ) : (
                <Row key={field.key} gutter={8} style={{ marginBottom: 8 }}>
                  <Col span={6}>
                    <Form.Item
                      name={[field.name, 'name']}
                      rules={[{ required: true }]}
                    >
                      <Input placeholder='Name' disabled={loading} />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      name={[field.name, 'type']}
                      rules={[{ required: true }]}
                    >
                      <Select disabled={loading}>
                        <Option value='product'>Product</Option>
                        <Option value='service'>Service</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      name={[field.name, 'sellingPrice']}
                      rules={[{ required: true }]}
                    >
                      <InputNumber prefix='R' style={{ width: '100%' }} disabled={loading} />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      name={[field.name, 'qty']}
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} disabled={loading} />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <Button danger onClick={() => remove(field.name)} disabled={loading}>
                      Remove
                    </Button>
                  </Col>
                </Row>
              )
            )}
            {products.length === 0 && <div>No products loaded from receipt.</div>}
          </div>
        )}
      </Form.List>
      <Button
        htmlType='submit'
        type='primary'
        block
        disabled={loading || products.length === 0}
      >
        Save All Products
      </Button>
    </Form>
  );

  return (
    <Card
      style={{ maxWidth: 600, margin: 'auto', width: '100%' }}
      styles={{ body: { padding: isMobile ? 12 : 24 } }}
      title='Add Products via Receipt'
    >
      <Tabs activeKey={tab} onChange={setTab}>
        <Tabs.TabPane tab='Single' key='single'>
          <Upload
            accept='image/*'
            showUploadList={false}
            customRequest={({ file }) => processSingleReceipt(file as File)}
            disabled={loading || !isUserAuthenticated}
          >
            <Button icon={<UploadOutlined />} block loading={loading} disabled={loading || !isUserAuthenticated}>
              Upload/Scan Receipt
            </Button>
          </Upload>
        </Tabs.TabPane>
        <Tabs.TabPane tab='Multi-Part' key='multipart'>
          <Space direction='vertical' style={{ width: '100%' }}>
            {!sessionId && (
              <Button
                icon={<PlusOutlined />}
                block
                onClick={startSession}
                loading={loading}
                disabled={loading || !isUserAuthenticated}
              >
                Start Multipart Session
              </Button>
            )}
            {sessionId && (
              <>
                <Upload
                  accept='image/*'
                  showUploadList={false}
                  customRequest={({ file }) => addPart(file as File)}
                  disabled={loading || !isUserAuthenticated}
                >
                  <Button icon={<UploadOutlined />} block loading={loading} disabled={loading || !isUserAuthenticated}>
                    Add Receipt Part
                  </Button>
                </Upload>
                <Button
                  type='primary'
                  block
                  onClick={processSession}
                  loading={loading}
                  style={{ marginTop: 8 }}
                  disabled={loading || !isUserAuthenticated}
                >
                  Process Session
                </Button>
                <div>Parts uploaded: {parts.length}</div>
              </>
            )}
          </Space>
        </Tabs.TabPane>
        <Tabs.TabPane tab='Bulk' key='bulk'>
          <Upload
            accept='image/*'
            multiple
            showUploadList={false}
            customRequest={({ fileList }) =>
              processBulkReceipts(fileList.map((f) => f.originFileObj || f) as File[])
            }
            disabled={loading || !isUserAuthenticated}
          >
            <Button icon={<UploadOutlined />} block loading={loading} disabled={loading || !isUserAuthenticated}>
              Upload Multiple Receipts
            </Button>
          </Upload>
        </Tabs.TabPane>
      </Tabs>

      {loading && <Spin style={{ margin: 20 }} />}

      {products.length > 0 && (
        <div style={{ marginTop: 24 }}>{renderProductEditor()}</div>
      )}
    </Card>
  );
}
