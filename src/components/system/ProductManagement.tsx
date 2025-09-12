// src/pages/inventory/ProductManagement.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Plus, Search, Eye, Edit, Package, Trash2, Loader2 } from 'lucide-react'; // Added Loader2
import { ProductForm } from './ProductForm'; // Assuming this component exists and handles form input
import { useToast } from '@/hooks/use-toast';

// Define the Product interface matching the frontend's expected structure from the backend API
interface Product {
  id: string; // Frontend expects string ID
  name: string;
  description: string;
  price: number; // Corresponds to unit_price
  costPrice?: number; // Optional, from backend's cost_price
  sku?: string; // Optional, from backend
  isService: boolean; // From backend's is_service
  stock: number; // Corresponds to stock_quantity
  vatRate: number; // Stored as decimal (e.g., 0.15)
  category: string;
  unit: string;
}

// Define the data structure for saving (what the ProductForm will pass to onSave)
// This should match the CreateUpdateProductBody interface on the backend
interface ProductSaveData {
  name: string;
  description: string;
  price: number;
  vatRate: number; // Decimal value (e.g., 0.15)
  category: string;
  stock: number;
  unit: string;
  costPrice?: number;
  sku?: string;
  isService?: boolean;
}

export function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | undefined>(
    undefined
  );
  const { toast } = useToast();

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://quantnow.onrender.com/api/products', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data: Product[] = await response.json();
      setProducts(data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateProduct = async (productData: ProductSaveData) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch('https://quantnow.onrender.com/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to create product.');
      }

      toast({
        title: 'Success',
        description: 'Product/Service created successfully.',
      });
      setIsFormDialogOpen(false);
      await fetchData(); // Refresh data after successful creation
    } catch (err) {
      console.error('Error creating product:', err);
      toast({
        title: 'Error',
        description: `Failed to create product/service: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProduct = async (id: string, productData: ProductSaveData) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch(`https://quantnow.onrender.com/api/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(), // Add authorization header
        },
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to update product.');
      }

      toast({
        title: 'Success',
        description: 'Product/Service updated successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentProduct(undefined); // Clear current product
      await fetchData(); // Refresh data after successful update
    } catch (err) {
      console.error('Error updating product:', err);
      toast({
        title: 'Error',
        description: `Failed to update product/service: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setLoading(true); // Indicate loading for the specific action
    try {
      const response = await fetch(`https://quantnow.onrender.com/api/products/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(), // Add authorization header
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to delete product.');
      }

      toast({
        title: 'Success',
        description: 'Product/Service deleted successfully.',
      });
      await fetchData(); // Refresh data after successful deletion
    } catch (err) {
      console.error('Error deleting product:', err);
      toast({
        title: 'Error',
        description: `Failed to delete product/service: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setCurrentProduct(product);
    setIsFormDialogOpen(true);
  };

  const handleFormSave = (formData: ProductSaveData) => {
    if (currentProduct) {
      handleUpdateProduct(currentProduct.id, formData);
    } else {
      handleCreateProduct(formData);
    }
  };

  const handleFormCancel = () => {
    setIsFormDialogOpen(false);
    setCurrentProduct(undefined);
  };

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-xl font-medium'>Product & Service Management</CardTitle>
        <div className='flex items-center space-x-2'>
          <Input
            placeholder='Search products...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='max-w-sm'
            icon={<Search className='h-4 w-4 text-muted-foreground' />}
          />
          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setCurrentProduct(undefined)}>
                <Plus className='mr-2 h-4 w-4' /> New Product/Service
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                <DialogTitle>
                  {currentProduct ? 'Edit Product/Service' : 'Create New Product/Service'}
                </DialogTitle>
              </DialogHeader>
              <ProductForm
                product={currentProduct}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='flex justify-center items-center h-40'>
            <Loader2 className='h-8 w-8 animate-spin' />
          </div>
        ) : error ? (
          <div className='text-red-500 text-center py-4'>{error}</div>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price (R)</TableHead>
                  <TableHead>VAT Rate</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className='text-center'>
                      No products or services found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map(product => (
                    <TableRow key={product.id}>
                      <TableCell className='font-medium'>{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>R {product.price.toFixed(2)}</TableCell>
                      <TableCell>{(product.vatRate * 100).toFixed(0)}%</TableCell>
                      <TableCell>{product.stock}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>
                        <Badge variant={product.isService ? 'secondary' : 'default'}>
                          {product.isService ? 'Service' : 'Product'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end space-x-2'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit className='h-4 w-4' />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant='ghost' size='sm'>
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Product/Service
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {product.name}?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}