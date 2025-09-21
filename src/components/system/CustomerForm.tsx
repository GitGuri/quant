import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';

interface CustomField {
  id: number;
  name: string;
  value: string;
}

interface Customer {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  customFields?: CustomField[];
}

interface CustomerFormProps {
  customer?: Customer;
  onSave: (customer: Customer) => void;
  onCancel: () => void;
}

export function CustomerForm({
  customer,
  onSave,
  onCancel,
}: CustomerFormProps) {
  const [formData, setFormData] = useState<Customer>({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    vatNumber: customer?.vatNumber || '',
  });

  const [customFields, setCustomFields] = useState<CustomField[]>(
    customer?.customFields || []
  );

  const handleAddCustomField = () => {
    setCustomFields([
      ...customFields,
      { id: Date.now(), name: '', value: '' },
    ]);
  };

  const handleRemoveCustomField = (id: number) => {
    setCustomFields(customFields.filter((field) => field.id !== id));
  };

  const handleCustomFieldChange = (id: number, fieldName: keyof Omit<CustomField, 'id'>, value: string) => {
    setCustomFields(
      customFields.map((field) =>
        field.id === id ? { ...field, [fieldName]: value } : field
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customerWithCustomFields = {
      ...formData,
      customFields: customFields.filter(field => field.name.trim() !== ''),
    };
    onSave(customerWithCustomFields);
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='grid grid-cols-2 gap-4'>
        <div>
          <Label htmlFor='name'>Customer Name *</Label>
          <Input
            id='name'
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor='email'>Email *</Label>
          <Input
            id='email'
            type='email'
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div>
          <Label htmlFor='phone'>Phone</Label>
          <Input
            id='phone'
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor='vatNumber'>VAT Number</Label>
          <Input
            id='vatNumber'
            value={formData.vatNumber}
            onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor='address'>Address</Label>
        <Textarea
          id='address'
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          rows={3}
        />
      </div>

      {/* Dynamic Custom Fields Section */}
      <div className='space-y-2'>
        <Label>Additional Fields</Label>
        {customFields.map((field) => (
          <div key={field.id} className='flex items-center gap-2'>
            <Input
              placeholder='Field Name'
              value={field.name}
              onChange={(e) => handleCustomFieldChange(field.id, 'name', e.target.value)}
            />
            <Input
              placeholder='Value'
              value={field.value}
              onChange={(e) => handleCustomFieldChange(field.id, 'value', e.target.value)}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => handleRemoveCustomField(field.id)}
            >
              <Trash2 className='h-4 w-4 text-red-500' />
            </Button>
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          onClick={handleAddCustomField}
        >
          + Add Field
        </Button>
      </div>

      <DialogFooter>
        <Button type='button' variant='outline' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='submit'>{customer ? 'Update' : 'Create'} Customer</Button>
      </DialogFooter>
    </form>
  );
}