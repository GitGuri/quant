import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

// Full Supplier object (for editing)
interface Supplier {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;       // /api/suppliers
  totalPurchased?: number;  // not editable here
  contactPerson?: string;   // legacy /vendors
  taxId?: string;           // legacy /vendors
  source?: 'api/suppliers' | 'vendors';
}

// Payload shape the backend expects for create/update
interface SupplierFormData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
}

interface SupplierFormProps {
  supplier?: Supplier;
  onSave: (supplierData: SupplierFormData) => void | Promise<void>;
  onCancel: () => void;
}

export function SupplierForm({
  supplier,
  onSave,
  onCancel
}: SupplierFormProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    name: supplier?.name || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    // prefer vatNumber, fall back to legacy taxId
    vatNumber: supplier?.vatNumber || supplier?.taxId || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // hard guard against double-click

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await Promise.resolve(onSave(formData));
      // parent typically closes dialog; if not, we re-enable:
      setIsSubmitting(false);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save supplier.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isSubmitting}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Company Name *</Label>
          <Input
            id="name"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
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
          <Label htmlFor="vatNumber">VAT Number / Tax ID</Label>
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

      {submitError && (
        <p className="text-sm text-red-600">{submitError}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-[160px]">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {supplier ? 'Updating…' : 'Creating…'}
            </>
          ) : (
            <>{supplier ? 'Update' : 'Create'} Supplier</>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
