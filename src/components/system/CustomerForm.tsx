import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Trash2, Loader2 } from 'lucide-react';

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
  onSave: (customer: Customer) => void | Promise<void>;
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

  // 🚫 Prevent double submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAddCustomField = () => {
    setCustomFields(prev => [...prev, { id: Date.now(), name: '', value: '' }]);
  };

  const handleRemoveCustomField = (id: number) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
  };

  const handleCustomFieldChange = (
    id: number,
    fieldName: keyof Omit<CustomField, 'id'>,
    value: string
  ) => {
    setCustomFields(prev =>
      prev.map(f => (f.id === id ? { ...f, [fieldName]: value } : f))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return; // hard guard

    setSubmitError(null);
    setIsSubmitting(true);

    const payload: Customer = {
      ...formData,
      customFields: customFields.filter(f => f.name.trim() !== ''),
    };

    try {
      await Promise.resolve(onSave(payload));
      // Parent usually closes the dialog on success. If not, we re-enable here:
      setIsSubmitting(false);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save customer.');
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-busy={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Customer Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="vatNumber">VAT Number</Label>
          <Input
            id="vatNumber"
            value={formData.vatNumber}
            onChange={e => setFormData({ ...formData, vatNumber: e.target.value })}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          rows={3}
          value={formData.address}
          onChange={e => setFormData({ ...formData, address: e.target.value })}
          disabled={isSubmitting}
        />
      </div>

      {/* Dynamic Custom Fields */}
      <div className="space-y-2">
        <Label>Additional Fields</Label>
        {customFields.map(field => (
          <div key={field.id} className="flex items-center gap-2">
            <Input
              placeholder="Field Name"
              value={field.name}
              onChange={e => handleCustomFieldChange(field.id, 'name', e.target.value)}
              disabled={isSubmitting}
            />
            <Input
              placeholder="Value"
              value={field.value}
              onChange={e => handleCustomFieldChange(field.id, 'value', e.target.value)}
              disabled={isSubmitting}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveCustomField(field.id)}
              disabled={isSubmitting}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={handleAddCustomField}
          disabled={isSubmitting}
        >
          + Add Field
        </Button>
      </div>

      {/* Error */}
      {submitError && (
        <p className="text-sm text-red-600">{submitError}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>

        {/* ✅ Disabled + spinner while saving */}
        <Button type="submit" disabled={isSubmitting} className="min-w-[160px]">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {customer ? 'Updating…' : 'Creating…'}
            </>
          ) : (
            <>{customer ? 'Update' : 'Create'} Customer</>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
