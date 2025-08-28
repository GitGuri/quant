import React, { useEffect, useMemo, useState } from 'react';
import { Users, CircleDollarSign, Coins, Repeat, Gem, Plus, Search, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { CustomerForm } from './CustomerForm'; // <-- your form below

// --- API auth helper (adjust if you keep tokens elsewhere) ---
const getToken = () => localStorage.getItem('authToken') || '';

type CustomerCluster = 'All' | 'High Value' | 'Low Value' | 'Frequent Buyer' | 'Big Spender';

const CLUSTER_TABS: { value: CustomerCluster; label: string; icon: React.ReactNode }[] = [
  { value: 'All', label: 'All Customers', icon: <Users className="h-4 w-4 mr-2" /> },
  { value: 'High Value', label: 'High Value', icon: <CircleDollarSign className="h-4 w-4 mr-2" /> },
  { value: 'Low Value', label: 'Low Value', icon: <Coins className="h-4 w-4 mr-2" /> },
  { value: 'Frequent Buyer', label: 'Frequent Buyers', icon: <Repeat className="h-4 w-4 mr-2" /> },
  { value: 'Big Spender', label: 'Big Spenders', icon: <Gem className="h-4 w-4 mr-2" /> },
];

// --- types (align with your backend) ---
interface CustomerRow {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  vat_number?: string | null;
  total_invoiced?: number | null;
  purchases?: number | null;
  avg_order?: number | null;
  active?: boolean | null;
}

interface CustomerPayload {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  customFields?: { id: number; name: string; value: string }[];
}

export default function CustomerManagement() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<CustomerCluster>('All');

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [openForm, setOpenForm] = useState(false);

  // fetch customers
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/customers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({
        title: 'Failed to fetch customers',
        description: err?.message || 'Internal server error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quick client-side filter and “clustering” (dummy rules; swap for server tags if you have them)
  const filtered = useMemo(() => {
    let list = rows;

    // text search
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q)
      );
    }

    // cluster
    switch (activeTab) {
      case 'High Value':
        list = list.filter((r) => (r.total_invoiced || 0) >= 50000); // tweak thresholds
        break;
      case 'Low Value':
        list = list.filter((r) => (r.total_invoiced || 0) > 0 && (r.total_invoiced || 0) < 5000);
        break;
      case 'Frequent Buyer':
        list = list.filter((r) => (r.purchases || 0) >= 12);
        break;
      case 'Big Spender':
        list = list.filter((r) => (r.avg_order || 0) >= 2500);
        break;
      default:
        break;
    }

    // sort: active first, then by name
    return [...list].sort((a, b) => {
      const aAct = a.active ? 0 : 1;
      const bAct = b.active ? 0 : 1;
      if (aAct !== bAct) return aAct - bAct;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [rows, query, activeTab]);

  // create customer from form
  const handleSaveCustomer = async (payload: CustomerPayload) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: payload.name,
          contact_person: null,
          email: payload.email || null,
          phone: payload.phone || null,
          address: payload.address || null,
          tax_id: payload.vatNumber || null,
        }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `${resp.status} ${resp.statusText}`);
      }

      toast({ title: 'Customer created', description: payload.name });
      setOpenForm(false);
      await loadCustomers();
    } catch (err: any) {
      toast({
        title: 'Add customer failed',
        description: err?.message || 'Could not save customer',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* header bar */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Customer Management</div>
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* cluster tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {CLUSTER_TABS.map((t) => (
          <Button
            key={t.value}
            variant={activeTab === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(t.value)}
            className="whitespace-nowrap"
          >
            {t.icon}
            {t.label}
          </Button>
        ))}
      </div>

      {/* search */}
      <div className="flex items-center gap-2">
        <div className="relative w-full sm:max-w-md">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.9fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(130px,0.8fr)_minmax(110px,0.7fr)_minmax(100px,0.6fr)] px-3 py-2 bg-muted/40 text-sm font-medium">
          <div>Name</div>
          <div>Email</div>
          <div>Phone</div>
          <div>Total Invoiced (R)</div>
          <div>Purchases</div>
          <div>Avg Order (R)</div>
          <div>Status</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-sm text-muted-foreground">No customers found.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.9fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(130px,0.8fr)_minmax(110px,0.7fr)_minmax(100px,0.6fr)] px-3 py-2 text-sm"
              >
                <div className="truncate">{r.name}</div>
                <div className="truncate">{r.email || 'N/A'}</div>
                <div className="truncate">{r.phone || 'N/A'}</div>
                <div>{(r.total_invoiced ?? 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }).replace('ZAR', 'R')}</div>
                <div>{r.purchases ?? 0}</div>
                <div>{(r.avg_order ?? 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }).replace('ZAR', 'R')}</div>
                <div>{r.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* add / edit dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>Capture the customer details below and click Create.</DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 overflow-auto max-h-[70vh]">
            <CustomerForm
              onSave={handleSaveCustomer}
              onCancel={() => setOpenForm(false)}
            />
          </div>

          <DialogFooter className="px-6 pb-6">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
