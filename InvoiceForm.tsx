import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/utils/apiClient';

interface InvoiceLineItem {
  id?: string;
  product_service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
}

interface InvoiceFormProps {
  invoice?: any;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

type BankDetails = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType?: string;
  swift?: string;
  referenceHint?: string; // “Use invoice # as reference”, etc.
};

const BANK_LOCAL_KEY = 'invoiceBankDefaults_v1';

// Build the block that will be appended into notes
function renderBankBlock(bd: Partial<BankDetails>, currency: string) {
  const lines: string[] = [];
  if (bd.accountName) lines.push(`Account Name: ${bd.accountName}`);
  if (bd.bankName) lines.push(`Bank: ${bd.bankName}`);
  if (bd.accountNumber) lines.push(`Account Number: ${bd.accountNumber}`);
  if (bd.branchCode) lines.push(`Branch Code: ${bd.branchCode}`);
  if (bd.accountType) lines.push(`Account Type: ${bd.accountType}`);
  if (bd.swift) lines.push(`SWIFT/BIC: ${bd.swift}`);
  if (bd.referenceHint) lines.push(`Reference: ${bd.referenceHint}`);

  if (lines.length === 0) return '';

  // You can style this header line in your PDF template if desired
  return [
    '— Payment Details —',
    `Preferred Currency: ${currency}`,
    ...lines,
    '' // trailing newline
  ].join('\n');
}

// Insert/replace the bank block inside notes using markers
function upsertBankBlockIntoNotes(notes: string, block: string) {
  const startMarker = '— Payment Details —';
  if (!block.trim()) {
    // If there’s no block to insert, remove any existing bank block
    return notes.replace(new RegExp(`${startMarker}[\\s\\S]*?$`, 'm'), '').trim();
  }
  if (notes.includes(startMarker)) {
    // Replace existing block
    return notes.replace(new RegExp(`${startMarker}[\\s\\S]*?$`, 'm'), block).trim();
  }
  // Append with a nice spacer
  return [notes?.trim(), block].filter(Boolean).join('\n\n');
}

export function InvoiceForm({ invoice, onClose, onSubmitSuccess }: InvoiceFormProps) {
  const [formData, setFormData] = useState({
    customer_id: invoice?.customer_id || '',
    invoice_date: invoice?.invoice_date || new Date().toISOString().split('T')[0],
    due_date: invoice?.due_date || '',
    currency: invoice?.currency || 'ZAR',
    status: invoice?.status || 'Draft',
    notes: invoice?.notes || '',
    line_items: (invoice?.line_items || []) as InvoiceLineItem[],
  });

  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Banking details UX state ---
  const [bankDetails, setBankDetails] = useState<BankDetails>(() => {
    try {
      const raw = localStorage.getItem(BANK_LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      accountName: '',
      bankName: '',
      accountNumber: '',
      branchCode: '',
      accountType: '',
      swift: '',
      referenceHint: 'Please use the invoice number as reference',
    };
  });
  const [includeBankInNotes, setIncludeBankInNotes] = useState(true);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Preload customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const data = await apiClient('/customers');
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers:', error);
      }
    };
    fetchCustomers();
  }, []);

  // Persist defaults if user opts in
  useEffect(() => {
    if (saveAsDefault) {
      localStorage.setItem(BANK_LOCAL_KEY, JSON.stringify(bankDetails));
    }
  }, [saveAsDefault, bankDetails]);

  // Derived preview of what will be appended
  const bankPreview = useMemo(
    () => (includeBankInNotes ? renderBankBlock(bankDetails, formData.currency) : ''),
    [includeBankInNotes, bankDetails, formData.currency]
  );

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updatedItems = [...formData.line_items];
    const current = updatedItems[index];
    const next = {
      ...current,
      [field]: value,
    } as InvoiceLineItem;

    // keep line_total responsive to qty/price edits
    const qty = field === 'quantity' ? Number(value) || 0 : current.quantity;
    const price = field === 'unit_price' ? Number(value) || 0 : current.unit_price;
    next.line_total = qty * price;

    updatedItems[index] = next;
    setFormData({ ...formData, line_items: updatedItems });
  };

  const addLineItem = () => {
    setFormData((fd) => ({
      ...fd,
      line_items: [
        ...fd.line_items,
        {
          product_service_id: null,
          description: '',
          quantity: 1,
          unit_price: 0,
          tax_rate: 0,
          line_total: 0,
        },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData((fd) => {
      const updatedItems = [...fd.line_items];
      updatedItems.splice(index, 1);
      return { ...fd, line_items: updatedItems };
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // 1) build final notes (append/replace bank block)
      let finalNotes = formData.notes || '';
      if (includeBankInNotes) {
        const block = renderBankBlock(bankDetails, formData.currency);
        finalNotes = upsertBankBlockIntoNotes(finalNotes, block);
      } else {
        // If user unticked include, strip any existing bank block
        finalNotes = upsertBankBlockIntoNotes(finalNotes, '');
      }

      // 2) total
      const total_amount = formData.line_items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);

      // 3) payload — we keep backend unchanged (notes is the only place we inject bank info)
      const payload = {
        ...formData,
        notes: finalNotes,
        total_amount,
      };

      if (invoice?.id) {
        await apiClient(`/api/invoices/${invoice.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/invoices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      // Optionally persist defaults
      if (saveAsDefault) {
        try {
          localStorage.setItem(BANK_LOCAL_KEY, JSON.stringify(bankDetails));
        } catch {}
      }

      onSubmitSuccess();
    } catch (error) {
      console.error('Error submitting invoice:', error);
      alert('Failed to submit invoice. Check console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Customer */}
      <div>
        <Label>Customer</Label>
        <Select
          value={formData.customer_id}
          onValueChange={(val) => setFormData({ ...formData, customer_id: val })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Invoice Date</Label>
          <Input
            type="date"
            value={formData.invoice_date}
            onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          />
        </div>
      </div>

      {/* Currency & Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Currency</Label>
          <Select
            value={formData.currency}
            onValueChange={(val) => setFormData({ ...formData, currency: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ZAR">ZAR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => setFormData({ ...formData, status: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label>Notes (printed on quotation/invoice)</Label>
        <Input
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Optional notes for this invoice"
        />
        {/* Live preview of appended bank block */}
        {includeBankInNotes && bankPreview && (
          <div className="mt-2 rounded-md border bg-muted/50 p-3 text-sm">
            <div className="font-medium mb-1">Will append:</div>
            <pre className="whitespace-pre-wrap">{bankPreview}</pre>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="space-y-2">
        <Label>Line Items</Label>
        {formData.line_items.map((item: InvoiceLineItem, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="Description"
              value={item.description}
              onChange={(e) =>
                handleLineItemChange(index, 'description', e.target.value)
              }
            />
            <Input
              type="number"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) =>
                handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)
              }
            />
            <Input
              type="number"
              placeholder="Unit Price"
              value={item.unit_price}
              onChange={(e) =>
                handleLineItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)
              }
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => removeLineItem(index)}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" onClick={addLineItem}>
          + Add Line Item
        </Button>
      </div>

      {/* Banking details (appends to notes) */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-base">Payment / Banking Details</Label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeBankInNotes}
                onChange={(e) => setIncludeBankInNotes(e.target.checked)}
              />
              Append to notes
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
              />
              Save as default
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Account Name</Label>
            <Input
              value={bankDetails.accountName}
              onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
              placeholder="e.g., Q Analytics (Pty) Ltd"
            />
          </div>
          <div>
            <Label>Bank</Label>
            <Input
              value={bankDetails.bankName}
              onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
              placeholder="e.g., FNB / ABSA / Standard Bank"
            />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input
              value={bankDetails.accountNumber}
              onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
              placeholder="e.g., 1234567890"
            />
          </div>
          <div>
            <Label>Branch Code</Label>
            <Input
              value={bankDetails.branchCode}
              onChange={(e) => setBankDetails({ ...bankDetails, branchCode: e.target.value })}
              placeholder="e.g., 250655"
            />
          </div>
          <div>
            <Label>Account Type (optional)</Label>
            <Input
              value={bankDetails.accountType || ''}
              onChange={(e) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
              placeholder="Cheque / Savings / Business"
            />
          </div>
          <div>
            <Label>SWIFT/BIC (optional)</Label>
            <Input
              value={bankDetails.swift || ''}
              onChange={(e) => setBankDetails({ ...bankDetails, swift: e.target.value })}
              placeholder="For international payments"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Reference Hint (optional)</Label>
            <Input
              value={bankDetails.referenceHint || ''}
              onChange={(e) => setBankDetails({ ...bankDetails, referenceHint: e.target.value })}
              placeholder="e.g., Use invoice number as reference"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Immediately insert block text into notes (in case they want it visible/editable)
              const block = renderBankBlock(bankDetails, formData.currency);
              setFormData((fd) => ({
                ...fd,
                notes: upsertBankBlockIntoNotes(fd.notes || '', block),
              }));
            }}
          >
            Insert into notes now
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setBankDetails({
                accountName: '',
                bankName: '',
                accountNumber: '',
                branchCode: '',
                accountType: '',
                swift: '',
                referenceHint: '',
              });
            }}
          >
            Clear fields
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : invoice?.id ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </div>
  );
}
