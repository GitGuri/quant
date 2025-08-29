import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DialogFooter, DialogDescription } from '@/components/ui/dialog'; // Added DialogDescription

// This interface defines the full Product object as used in the ProductManagement component
interface Product {
  id?: string;
  name: string;
  description: string;
  price: number;
  vatRate: number; // This is the decimal value (e.g., 0.15) from the backend
  category: string;
  stock: number;
  unit: string;
  costPrice?: number; // Optional, from backend's cost_price
  sku?: string; // Optional, from backend
  isService?: boolean; // From backend's is_service
}

// This interface defines the data structure that the form will *emit* when saved.
// vatRate here will be the decimal value (e.g., 0.15)
interface ProductFormData {
  name: string;
  description: string;
  price: number;
  vatRate: number; // This will be the decimal value for the backend
  category: string;
  stock: number;
  unit: string;
  costPrice?: number;
  sku?: string;
  isService?: boolean;
}

interface ProductFormProps {
  product?: Product; // The existing product data passed in for editing
  // The onSave prop now expects data that matches what the backend expects for creation/update (decimal vatRate)
  onSave: (productData: ProductFormData) => void;
  onCancel: () => void;
}

const categories = [
  'Services',
  'Furniture',
  'Software',
  'Equipment',
  'Stationery'
];
const units = ['each', 'hour', 'license', 'kg', 'meter', 'box'];

export function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  // Initialize formData with current product data or empty strings/default values
  // vatRate is converted from decimal (backend) to percentage (for form display)
  const [formData, setFormData] = useState<ProductFormData>({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    vatRate: product?.vatRate !== undefined ? product.vatRate * 100 : 15, // Default to 15% for new
    category: product?.category || '',
    stock: product?.stock || 0,
    unit: product?.unit || 'each',
    costPrice: product?.costPrice,
    sku: product?.sku,
    isService: product?.isService,
  });

  // useEffect to update form data if 'product' prop changes (e.g., when switching between edit modes)
  useEffect(() => {
    setFormData({
      name: product?.name || '',
      description: product?.description || '',
      price: product?.price || 0,
      vatRate: product?.vatRate !== undefined ? product.vatRate * 100 : 15, // Convert for display
      category: product?.category || '',
      stock: product?.stock || 0,
      unit: product?.unit || 'each',
      costPrice: product?.costPrice,
      sku: product?.sku,
      isService: product?.isService,
    });
  }, [product]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Create the data object to send to onSave, converting vatRate back to decimal
    const dataToSave: ProductFormData = {
      ...formData,
      vatRate: formData.vatRate / 100, // Convert percentage (e.g., 15) to decimal (e.g., 0.15)
    };
    onSave(dataToSave);
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {/* Added DialogDescription to resolve the warning */}
      <DialogDescription className="sr-only">
        {product ? 'Edit an existing product or service.' : 'Add a new product or service.'}
      </DialogDescription>
      <div className='grid grid-cols-2 gap-4'>
        <div>
          <Label htmlFor='name'>Name *</Label>
          <Input
            id='name'
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor='category'>Category *</Label>
          <Select
            value={formData.category}
            onValueChange={value =>
              setFormData({ ...formData, category: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select category' />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor='description'>Description</Label>
        <Textarea
          id='description'
          value={formData.description}
          onChange={e =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={2}
        />
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div>
          <Label htmlFor='price'>Price (R) *</Label>
          <Input
            id='price'
            type='number'
            step='0.01'
            min='0'
            value={formData.price}
            onChange={e =>
              setFormData({ ...formData, price: Number(e.target.value) })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor='vatRate'>VAT Rate (%)</Label>
          <Select
            // Convert formData.vatRate (percentage) to string for Select component
            value={formData.vatRate.toString()}
            onValueChange={value =>
              // Convert value from Select (string) back to number (percentage)
              setFormData({ ...formData, vatRate: Number(value) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='0'>0% (Zero-rated)</SelectItem>
              <SelectItem value='15'>15% (Standard)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor='unit'>Unit</Label>
          <Select
            value={formData.unit}
            onValueChange={value => setFormData({ ...formData, unit: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map(unit => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor='stock'>Available Quantity</Label>
        <Input
          id='stock'
          type='number'
          min='0'
          step='0.0001' // Allow decimal stock quantities
          value={formData.stock}
          onChange={e =>
            setFormData({ ...formData, stock: Number(e.target.value) })
          }
        />
      </div>

      <DialogFooter>
        <Button type='button' variant='outline' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='submit'>
          {product ? 'Update' : 'Create'} Product/Service
        </Button>
      </DialogFooter>
    </form>
  );
}
