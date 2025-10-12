// src/pages/CustomerManagement.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Users,
  CircleDollarSign,
  Coins,
  Repeat,
  Gem,
  Target,
  Send,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// ⬇️ adjust the path if needed
import { CustomerForm } from './CustomerForm';


interface CustomField {
  id: number;
  name: string;
  value: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  status?: 'Active' | 'Inactive';
  customFields?: CustomField[];
  totalInvoiced: number;
  numberOfPurchases: number;
  averageOrderValue: number;
}

interface CustomerSaveData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  customFields?: string;
}

// Marketing Suggestion Interfaces
interface MarketingSuggestion {
  id: number;
  title: string;
  description: string;
  promotionText: string;
  discountPercent: number;
  targetCustomers: string[]; // string IDs
  targetCount: number;
  reasoning: string;
  estimatedImpact: string;
  clusterAnalysis: {
    totalCustomers: number;
    avgDaysSinceLastPurchase: number;
    avgTotalSpent: number;
    avgPurchaseFrequency: string;
    topCategories: string[];
  };
}

interface MarketingSuggestionsResponse {
  success: boolean;
  cluster: CustomerCluster;
  suggestions: MarketingSuggestion[];
  metadata: {
    analyzedCustomers: number;
    totalPurchases: number;
    generatedAt: string;
  };
}

// New backend shape
interface Offer {
  productId: number;
  name: string;
  category: string | null;
  unitPrice: number;
  costPrice: number | null;
  stockQty: number;
  clusterBuyers: number;
  clusterUnits: number;
  clusterRevenue: number;
  clusterLastPurchasedDays: number | null;
  lastSoldDaysGlobal: number | null;
  marginPct: number | null;
  suggestedDiscountPercent: number;
  priceAfterDiscount: number;
  rationale: string[];
}

interface ClusterOffersResponse {
  success: boolean;
  cluster: CustomerCluster;
  objective: 'move_stock' | 'increase_aov' | 'reengage' | 'automatic';
  offers: Offer[];
  bundles: any[];
  analysis: {
    clusterSize: number;
    topClusterCategories: string[];
    generatedAt: string;
  };
}

type CustomerCluster = 'All' | 'High Value' | 'Low Value' | 'Frequent Buyer' | 'Big Spender';

const CLUSTER_TABS: { value: CustomerCluster; label: string; icon: React.ReactNode }[] = [
  { value: 'All', label: 'All Customers', icon: <Users className="h-4 w-4 mr-2" /> },
  { value: 'High Value', label: 'High Value', icon: <CircleDollarSign className="h-4 w-4 mr-2" /> },
  { value: 'Low Value', label: 'Low Value', icon: <Coins className="h-4 w-4 mr-2" /> },
  { value: 'Frequent Buyer', label: 'Frequent Buyers', icon: <Repeat className="h-4 w-4 mr-2" /> },
  { value: 'Big Spender', label: 'Big Spenders', icon: <Gem className="h-4 w-4 mr-2" /> },
];

// --- Utils for token handling ---
type TokenDict = Record<string, string | number>;

function applyTokens(text: string, tokens: TokenDict): string {
  return Object.entries(tokens).reduce((acc, [k, v]) => {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    return acc.replace(re, String(v));
  }, text);
}

function insertAtCursor(textarea: HTMLTextAreaElement, snippet: string) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  const next = before + snippet + after;
  textarea.value = next;
  const newPos = start + snippet.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | undefined>(undefined);
  const [activeCluster, setActiveCluster] = useState<CustomerCluster>('All');

  // Suggestions
  const [isSuggestionsDialogOpen, setIsSuggestionsDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MarketingSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  // Details editor (customizable)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MarketingSuggestion | null>(null);
  const [editorSubject, setEditorSubject] = useState('');
  const [editorEmail, setEditorEmail] = useState('');
  const [editorSms, setEditorSms] = useState('');
  const emailAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const smsAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Multi-select + combined compose
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<number>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [combinedSubject, setCombinedSubject] = useState('');
  const [combinedEmail, setCombinedEmail] = useState('');
  const [combinedSms, setCombinedSms] = useState('');

  const [sendingEmails, setSendingEmails] = useState(false);
  const [alsoSendSms, setAlsoSendSms] = useState(false);

  const { toast } = useToast();

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchCustomersWithClusterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/cluster-data`, {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend response for ${response.status}:`, errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: Customer[] = await response.json();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch clustered customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchCustomersWithClusterData();
  }, [fetchCustomersWithClusterData]);

  // ---------- Offer → Suggestion mapping helpers ----------
  function estimateImpactFrom(o: Offer): string {
    const margin = o.marginPct ?? 0;
    const staleness = o.lastSoldDaysGlobal ?? 0;
    const stock = o.stockQty;
    const buyers = o.clusterBuyers;

    let score = 0;
    if (margin >= 0.5) score += 2;
    else if (margin >= 0.3) score += 1;

    if (staleness >= 45) score += 2;
    else if (staleness >= 30) score += 1;

    if (stock >= 20) score += 2;
    else if (stock >= 10) score += 1;

    if (buyers >= 5) score += 2;
    else if (buyers > 0) score += 1;

    if (score >= 6) return 'Very High';
    if (score >= 4) return 'High';
    if (score >= 2) return 'Medium';
    return 'Low';
  }

  function mapOffersToSuggestions(
    resp: ClusterOffersResponse,
    clusterCustomers: Customer[]
  ): MarketingSuggestion[] {
    return resp.offers.map((o, idx) => {
      const desc =
        o.clusterBuyers > 0
          ? `${o.clusterBuyers} customers in this cluster have bought ${o.name}. A ${o.suggestedDiscountPercent}% promo can drive repeat & larger baskets.`
          : `Untapped product for this cluster. Try ${o.suggestedDiscountPercent}% to drive first purchases.`;

      return {
        id: idx + 1,
        title: `Promo: ${o.name}`,
        description: desc,
        promotionText: `Hi {{name}}, special on ${o.name}: now R${o.priceAfterDiscount.toFixed(
          2
        )} ({{discount}}% off).`,
        discountPercent: o.suggestedDiscountPercent,
        targetCustomers: clusterCustomers.map((c) => c.id),
        targetCount: clusterCustomers.length,
        reasoning: o.rationale.join('; '),
        estimatedImpact: estimateImpactFrom(o),
        clusterAnalysis: {
          totalCustomers: resp.analysis.clusterSize,
          avgDaysSinceLastPurchase: o.clusterLastPurchasedDays ?? 0,
          avgTotalSpent: Math.round(o.clusterRevenue ?? 0),
          avgPurchaseFrequency: '—',
          topCategories: resp.analysis.topClusterCategories ?? [],
        },
      };
    });
  }

  // ---------- Suggestions fetch ----------
  const fetchMarketingSuggestions = useCallback(
    async (cluster: CustomerCluster, clusterCustomers: Customer[]) => {
      setSuggestionsLoading(true);
      setSuggestionsError(null);
      try {
        const headers = getAuthHeaders();
        const response = await fetch(`https://quantnow-sa1e.onrender.com/api/marketing/suggestions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            cluster,
            customers: clusterCustomers,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Marketing suggestions error ${response.status}:`, errorText);
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data?.success && Array.isArray(data?.suggestions)) {
          setSuggestions(data.suggestions);
        } else if (data?.success && Array.isArray(data?.offers)) {
          const mapped: MarketingSuggestion[] = mapOffersToSuggestions(
            data as ClusterOffersResponse,
            clusterCustomers
          );
          setSuggestions(mapped);
        } else {
          console.error('Unexpected response shape:', data);
          throw new Error('Unexpected response shape from server');
        }

        toast({
          title: 'Suggestions Generated',
          description: `Generated marketing suggestions for ${cluster} cluster.`,
        });
      } catch (err) {
        console.error('Failed to fetch marketing suggestions:', err);
        setSuggestionsError('Failed to generate marketing suggestions. Please try again.');
        toast({
          title: 'Error',
          description: 'Failed to generate marketing suggestions.',
          variant: 'destructive',
        });
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [getAuthHeaders, toast]
  );

  // ---------- Helpers ----------
  const getTargetsForSuggestion = useCallback(
    (s: MarketingSuggestion) => {
      const ids = new Set(s.targetCustomers.map(String));
      return customers.filter((c) => ids.has(String(c.id)));
    },
    [customers]
  );

  const toggleSuggestionSelected = (id: number) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tokensForSuggestion = (s: MarketingSuggestion): TokenDict => ({
    name: 'there', // preview name; per-recipient will be handled server-side if supported
    title: s.title,
    discount: s.discountPercent,
    count: s.targetCount,
  });

  const buildCombinedPromo = (sels: MarketingSuggestion[]) => {
    const bullets = sels
      .map(
        (s) =>
          `• ${s.title} — ${s.discountPercent}% OFF\n  ${applyTokens(s.promotionText, {
            ...tokensForSuggestion(s),
            name: '{{name}}', // keep token so backend can personalize
          })}`
      )
      .join('\n\n');

    return {
      subject: `Special offers: ${sels.map((s) => s.title).slice(0, 3).join(', ')}${
        sels.length > 3 ? ' +' + (sels.length - 3) : ''
      }`,
      emailText: bullets,
      smsText: bullets.length > 140 ? bullets.slice(0, 140) + '…' : bullets,
    };
  };

  const openDetails = (s: MarketingSuggestion) => {
    setSelectedSuggestion(s);
    setEditorSubject(s.title);
    // Keep tokens inside; backend can personalize {{name}} etc. If not, it will send literal tokens.
    setEditorEmail(s.promotionText || `Hi {{name}}, ${s.title} — {{discount}}% off.`);
    setEditorSms(`Hi {{name}}, ${s.title} — {{discount}}% off.`);
    setDetailsOpen(true);
  };

  // ---------- Senders ----------
  async function sendEmailsAndMaybeSms({
    subject,
    emailText,
    recipients,
    smsText,
  }: {
    subject: string;
    emailText: string;
    recipients: Customer[];
    smsText?: string;
  }) {
    const headers = getAuthHeaders();

    // EMAIL
    const emailRes = await fetch(`https://quantnow-sa1e.onrender.com/api/marketing/send-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        suggestion: { title: subject, promotionText: emailText, discountPercent: 0 },
        customers: recipients.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
        })),
      }),
    });
    if (!emailRes.ok) {
      const t = await emailRes.text();
      throw new Error(`Email send failed: ${t || emailRes.status}`);
    }
    const emailOut = await emailRes.json();

    // SMS (optional)
    if (alsoSendSms && smsText) {
      const smsRes = await fetch(`https://quantnow-sa1e.onrender.com/api/marketing/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          text: smsText,
          customers: recipients
            .filter((c) => !!c.phone)
            .map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
        }),
      });
      if (!smsRes.ok) {
        const t = await smsRes.text();
        console.warn('SMS send failed:', t || smsRes.status);
      }
    }

    return emailOut;
  }

  const sendSingleWithOverrides = async (s: MarketingSuggestion) => {
    setSendingEmails(true);
    try {
      const targets = getTargetsForSuggestion(s);
      if (targets.length === 0) {
        toast({
          title: 'No recipients',
          description: 'No valid target customers with emails.',
          variant: 'destructive',
        });
        return;
      }

      const out = await sendEmailsAndMaybeSms({
        subject: editorSubject || s.title,
        emailText: editorEmail || s.promotionText,
        recipients: targets,
        smsText: editorSms,
      });

      toast({
        title: 'Campaign sent',
        description: `Emails sent: ${out.sent || targets.length}${
          alsoSendSms ? ' (SMS attempted too)' : ''
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: String(err instanceof Error ? err.message : err),
        variant: 'destructive',
      });
    } finally {
      setSendingEmails(false);
    }
  };

  const openComposeCombined = () => {
    const sel = suggestions.filter((s) => selectedSuggestionIds.has(s.id));
    if (sel.length === 0) {
      toast({
        title: 'Nothing selected',
        description: 'Select at least one suggestion.',
        variant: 'destructive',
      });
      return;
    }
    const combo = buildCombinedPromo(sel);
    setCombinedSubject(combo.subject);
    setCombinedEmail(combo.emailText);
    setCombinedSms(combo.smsText);
    setComposeOpen(true);
  };

  const sendCombinedEmails = async () => {
    const sel = suggestions.filter((s) => selectedSuggestionIds.has(s.id));
    const allIds = new Set<string>(sel.flatMap((s) => s.targetCustomers.map(String)));
    const targets = customers.filter((c) => allIds.has(String(c.id)));

    if (targets.length === 0) {
      toast({
        title: 'No recipients',
        description: 'No valid target customers with emails.',
        variant: 'destructive',
      });
      return;
    }

    setSendingEmails(true);
    try {
      const out = await sendEmailsAndMaybeSms({
        subject: combinedSubject,
        emailText: combinedEmail,
        recipients: targets,
        smsText: combinedSms,
      });

      toast({
        title: 'Combined campaign sent',
        description: `Emails sent: ${out.sent || targets.length}${
          alsoSendSms ? ' (SMS attempted too)' : ''
        }.`,
      });
      setComposeOpen(false);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: String(err instanceof Error ? err.message : err),
        variant: 'destructive',
      });
    } finally {
      setSendingEmails(false);
    }
  };

  // ---------- UI handlers ----------
  const handleGenerateSuggestions = async () => {
    if (activeCluster === 'All') {
      toast({
        title: 'Select a Specific Cluster',
        description:
          'Please select a specific customer cluster to generate targeted marketing suggestions.',
        variant: 'destructive',
      });
      return;
    }

    const clusterCustomers = filterCustomersByCluster(activeCluster);

    if (clusterCustomers.length === 0) {
      toast({
        title: 'No Customers',
        description: 'No customers found in this cluster.',
        variant: 'destructive',
      });
      return;
    }

    await fetchMarketingSuggestions(activeCluster, clusterCustomers);
    setSelectedSuggestionIds(new Set());
    setIsSuggestionsDialogOpen(true);
  };

  const handleFormSave = async (customerData: Customer) => {
    const payload: CustomerSaveData = {
      name: customerData.name,
      email: customerData.email,
      phone: customerData.phone,
      address: customerData.address,
      vatNumber: customerData.vatNumber,
      customFields: JSON.stringify(
        customerData.customFields?.filter((f) => f.name.trim() !== '') || []
      ),
    };

    if (currentCustomer) {
      await handleUpdateCustomer(currentCustomer.id, payload);
    } else {
      await handleCreateCustomer(payload);
    }
  };

  const handleCreateCustomer = async (customerData: CustomerSaveData) => {
    setLoading(true);
    try {
      const response = await fetch('https://quantnow-sa1e.onrender.com/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(customerData),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to create customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer created successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentCustomer(undefined);
      await fetchCustomersWithClusterData();
    } catch (err) {
      console.error('Error creating customer:', err);
      toast({
        title: 'Error',
        description: `Failed to create customer: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCustomer = async (id: string, customerData: CustomerSaveData) => {
    setLoading(true);
    try {
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(customerData),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to update customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer updated successfully.',
      });
      setIsFormDialogOpen(false);
      setCurrentCustomer(undefined);
      await fetchCustomersWithClusterData();
    } catch (err) {
      console.error('Error updating customer:', err);
      toast({
        title: 'Error',
        description: `Failed to update customer: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`https://quantnow-sa1e.onrender.com/api/customers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || 'Failed to delete customer.');
      }

      toast({
        title: 'Success',
        description: 'Customer deleted successfully.',
      });
      await fetchCustomersWithClusterData();
    } catch (err) {
      console.error('Error deleting customer:', err);
      toast({
        title: 'Error',
        description: `Failed to delete customer: ${
          err instanceof Error ? err.message : String(err)
        }`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setCurrentCustomer(customer);
    setIsFormDialogOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormDialogOpen(false);
    setCurrentCustomer(undefined);
  };

  const filterCustomersByCluster = useCallback(
    (cluster: CustomerCluster): Customer[] => {
      if (cluster === 'All') {
        return customers;
      }

      return customers.filter((customer) => {
        const totalInvoiced = customer.totalInvoiced ?? 0;
        const numberOfPurchases = customer.numberOfPurchases ?? 0;
        const averageOrderValue = customer.averageOrderValue ?? 0;

        switch (cluster) {
          case 'High Value':
            return totalInvoiced > 1000;
          case 'Low Value':
            return totalInvoiced <= 500;
          case 'Frequent Buyer':
            return numberOfPurchases > 5;
          case 'Big Spender':
            return averageOrderValue > 200;
          default:
            return true;
        }
      });
    },
    [customers]
  );

  const filteredCustomers = filterCustomersByCluster(activeCluster).filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.phone && customer.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (customer.vatNumber && customer.vatNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ---------- Render ----------
  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2">
          <CardTitle className="text-xl font-medium">Customer Management</CardTitle>
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
            <Button
              onClick={handleGenerateSuggestions}
              variant="outline"
              className="w-full sm:w-auto"
              disabled={activeCluster === 'All'}
            >
              <Target className="mr-2 h-4 w-4" />
              Marketing Suggestions
            </Button>
            <Input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
<Dialog
  open={isFormDialogOpen}
  onOpenChange={(open) => {
    setIsFormDialogOpen(open);
    if (!open) setCurrentCustomer(undefined); // clear when closing
  }}
>
  <DialogTrigger asChild>
    <Button
      onClick={() => {
        setCurrentCustomer(undefined); // ensure it's a create
        setIsFormDialogOpen(true);
      }}
      className="w-full sm:w-auto"
    >
      <Plus className="mr-2 h-4 w-4" /> New Customer
    </Button>
  </DialogTrigger>

  <DialogContent className="sm:max-w-[540px]">
    <DialogHeader>
      <DialogTitle>
        {currentCustomer ? 'Edit Customer' : 'Create New Customer'}
      </DialogTitle>
    </DialogHeader>

    {/* ✅ Real form goes here */}
    <CustomerForm
      customer={currentCustomer ? {
        id: currentCustomer.id,
        name: currentCustomer.name || '',
        email: currentCustomer.email || '',
        phone: currentCustomer.phone || '',
        address: currentCustomer.address || '',
        vatNumber: currentCustomer.vatNumber || '',
        // If you fetch customFields in your list, pass them through; otherwise an empty array is fine.
        customFields: currentCustomer.customFields || [],
      } : undefined}
      onSave={(c) => {
        // your existing save path expects a "Customer"-shaped object
        handleFormSave(c as any);
      }}
      onCancel={handleFormCancel}
    />
  </DialogContent>
</Dialog>

          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeCluster}
            onValueChange={(value) => setActiveCluster(value as CustomerCluster)}
            className="w-full mb-4"
          >
            <TabsList className="grid w-full grid-cols-5">
              {CLUSTER_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center justify-center">
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.value}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {CLUSTER_TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                {loading ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-red-500 text-center py-4">{error}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>VAT Number</TableHead>
                          <TableHead className="text-right">Total Invoiced (R)</TableHead>
                          <TableHead className="text-right">Purchases</TableHead>
                          <TableHead className="text-right">Avg Order (R)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center">
                              No customers found in this cluster matching your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCustomers.map((customer) => (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>{customer.email}</TableCell>
                              <TableCell>{customer.phone || 'N/A'}</TableCell>
                              <TableCell>{customer.vatNumber || 'N/A'}</TableCell>
                              <TableCell className="text-right">
                                R{customer.totalInvoiced.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {customer.numberOfPurchases}
                              </TableCell>
                              <TableCell className="text-right">
                                R{customer.averageOrderValue.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={customer.status === 'Active' ? 'default' : 'secondary'}
                                >
                                  {customer.status || 'N/A'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
<Button variant="ghost" size="sm" onClick={() => handleEditCustomer(customer)}>
  <Edit className="h-4 w-4" />
</Button>

                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete {customer.name}? This action cannot be
                                          undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id)}>
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
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Marketing Suggestions Dialog */}
      <Dialog open={isSuggestionsDialogOpen} onOpenChange={setIsSuggestionsDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Marketing Suggestions for {activeCluster} Cluster
            </DialogTitle>
          </DialogHeader>

          {suggestionsLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : suggestionsError ? (
            <div className="text-red-500 text-center py-4">{suggestionsError}</div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-lg">No suggestions available for this cluster.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try selecting a different cluster or ensure there's sufficient customer data.
              </p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedSuggestionIds(new Set(suggestions.map((s) => s.id)));
                        else setSelectedSuggestionIds(new Set());
                      }}
                      checked={
                        selectedSuggestionIds.size === suggestions.length && suggestions.length > 0
                      }
                    />
                    <span>Select all</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={alsoSendSms}
                      onChange={(e) => setAlsoSendSms(e.target.checked)}
                    />
                    <span>Also send SMS</span>
                  </label>
                </div>

                <Button size="sm" onClick={openComposeCombined} disabled={sendingEmails || selectedSuggestionIds.size === 0}>
                  <Send className="mr-2 h-4 w-4" />
                  Compose & send combined ({selectedSuggestionIds.size})
                </Button>
              </div>

              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <Card key={suggestion.id} className="border-2">
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedSuggestionIds.has(suggestion.id)}
                          onChange={() => toggleSuggestionSelected(suggestion.id)}
                        />
                        <CardTitle className="text-lg flex items-center">
                          <span>{suggestion.title}</span>
                          <Badge variant="outline" className="ml-2">
                            {suggestion.discountPercent}% OFF
                          </Badge>
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {suggestion.description}
                        </p>
                        <div className="bg-accent/50 p-4 rounded-lg">
                          <p className="font-medium mb-1">Recommended Message:</p>
                          <p className="text-sm italic">"{suggestion.promotionText}"</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Target Customers:</span>
                          <span className="ml-2">{suggestion.targetCount} customers</span>
                        </div>
                        <div>
                          <span className="font-medium">Estimated Impact:</span>
                          <span className="ml-2">{suggestion.estimatedImpact}</span>
                        </div>
                      </div>

                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-1">Reasoning:</p>
                        <p className="text-sm text-muted-foreground">{suggestion.reasoning}</p>
                      </div>

                      {suggestion.clusterAnalysis && (
                        <div className="border-t pt-3">
                          <p className="text-xs font-medium mb-2">Cluster Analysis:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>Total Customers: {suggestion.clusterAnalysis.totalCustomers}</div>
                            <div>
                              Avg Days Since Purchase:{' '}
                              {suggestion.clusterAnalysis.avgDaysSinceLastPurchase}
                            </div>
                            <div>Avg Total Spent: R{suggestion.clusterAnalysis.avgTotalSpent}</div>
                            <div>
                              Purchase Frequency: {suggestion.clusterAnalysis.avgPurchaseFrequency}
                              x/month
                            </div>
                            {suggestion.clusterAnalysis.topCategories.length > 0 && (
                              <div className="col-span-2">
                                Top Categories:{' '}
                                {suggestion.clusterAnalysis.topCategories.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => openDetails(suggestion)}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            // Quick send using defaults (no editing)
                            setEditorSubject(suggestion.title);
                            setEditorEmail(suggestion.promotionText);
                            setEditorSms(`Hi {{name}}, ${suggestion.title} — {{discount}}% off.`);
                            setSelectedSuggestion(suggestion);
                            // Send immediately
                            sendSingleWithOverrides(suggestion);
                          }}
                          disabled={sendingEmails}
                        >
                          {sendingEmails ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Send to {suggestion.targetCount} Customers
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Suggestion Details (Custom Compose) */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsOpen(false);
            setSelectedSuggestion(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compose & Preview</DialogTitle>
          </DialogHeader>

          {selectedSuggestion && (
            <div className="space-y-4">
              {/* Tokens */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-muted-foreground">Insert token:</span>
                {['{{name}}', '{{title}}', '{{discount}}', '{{count}}'].map((t) => (
                  <button
                    key={t}
                    className="px-2 py-1 rounded border hover:bg-accent"
                    onClick={() => {
                      const el = emailAreaRef.current;
                      if (el) insertAtCursor(el, ` ${t} `);
                    }}
                    type="button"
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Email subject</label>
                <Input
                  value={editorSubject}
                  onChange={(e) => setEditorSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>

              {/* Email body */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Email message</label>
                  <button
                    className="text-xs underline"
                    onClick={() => setEditorEmail(selectedSuggestion.promotionText)}
                    type="button"
                  >
                    Reset to recommended
                  </button>
                </div>
                <textarea
                  ref={emailAreaRef}
                  className="w-full h-40 border rounded p-2 text-sm"
                  value={editorEmail}
                  onChange={(e) => setEditorEmail(e.target.value)}
                  placeholder='Use tokens like "Hi {{name}}", "{{discount}}%", "{{title}}", "{{count}}"'
                />
              </div>

              {/* SMS */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">SMS message (optional)</label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {editorSms.length} chars
                    </span>
                    <button
                      className="text-xs underline"
                      onClick={() =>
                        setEditorSms(`Hi {{name}}, ${selectedSuggestion.title} — {{discount}}% off.`)
                      }
                      type="button"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={alsoSendSms}
                    onChange={(e) => setAlsoSendSms(e.target.checked)}
                  />
                  <span className="text-sm">Also send SMS</span>
                </div>
                <textarea
                  ref={smsAreaRef}
                  className="w-full h-24 border rounded p-2 text-sm"
                  value={editorSms}
                  onChange={(e) => setEditorSms(e.target.value)}
                  placeholder='Short text; tokens like {{name}} and {{discount}} are okay'
                />
              </div>

              {/* Preview */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Preview</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-accent/40 p-3 rounded">
                    <p className="text-xs font-medium mb-1">Email preview</p>
                    <div className="text-sm whitespace-pre-wrap">
                      <div className="font-semibold mb-1">
                        {applyTokens(editorSubject, tokensForSuggestion(selectedSuggestion))}
                      </div>
                      {applyTokens(editorEmail, tokensForSuggestion(selectedSuggestion))}
                    </div>
                  </div>
                  <div className="bg-accent/40 p-3 rounded">
                    <p className="text-xs font-medium mb-1">SMS preview</p>
                    <div className="text-sm whitespace-pre-wrap">
                      {applyTokens(editorSms, tokensForSuggestion(selectedSuggestion))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recipients */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">
                  Recipients ({getTargetsForSuggestion(selectedSuggestion).length}):
                </p>
                <div className="max-h-40 overflow-auto text-sm">
                  <ul className="list-disc pl-5">
                    {getTargetsForSuggestion(selectedSuggestion).map((c) => (
                      <li key={c.id}>
                        {c.name} — {c.email}
                        {c.phone ? ` / ${c.phone}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailsOpen(false);
                    setSelectedSuggestion(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={() => selectedSuggestion && sendSingleWithOverrides(selectedSuggestion)}
                  disabled={sendingEmails}
                >
                  {sendingEmails ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Combined Compose (Multi-promo) */}
      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          if (!open) setComposeOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compose Combined Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tokens */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground">Insert token:</span>
              {['{{name}}'].map((t) => (
                <button
                  key={t}
                  className="px-2 py-1 rounded border hover:bg-accent"
                  onClick={() => setCombinedEmail((v) => `${v} ${t}`)}
                  type="button"
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Email subject</label>
              <Input
                value={combinedSubject}
                onChange={(e) => setCombinedSubject(e.target.value)}
                placeholder="Subject"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Email message</label>
                <button
                  className="text-xs underline"
                  onClick={() => {
                    const sel = suggestions.filter((s) => selectedSuggestionIds.has(s.id));
                    const combo = buildCombinedPromo(sel);
                    setCombinedSubject(combo.subject);
                    setCombinedEmail(combo.emailText);
                    setCombinedSms(combo.smsText);
                  }}
                  type="button"
                >
                  Reset to recommended
                </button>
              </div>
              <textarea
                className="w-full h-40 border rounded p-2 text-sm"
                value={combinedEmail}
                onChange={(e) => setCombinedEmail(e.target.value)}
                placeholder="List out your offers, bullet points recommended. {{name}} token supported."
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alsoSendSms}
                  onChange={(e) => setAlsoSendSms(e.target.checked)}
                />
                <label className="text-sm font-medium">Also send SMS</label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {combinedSms.length} chars
                </span>
              </div>
              <textarea
                className="w-full h-24 border rounded p-2 text-sm"
                value={combinedSms}
                onChange={(e) => setCombinedSms(e.target.value)}
                placeholder="Short version for SMS"
              />
            </div>

            {/* Preview */}
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Preview</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-accent/40 p-3 rounded">
                  <p className="text-xs font-medium mb-1">Email preview</p>
                  <div className="text-sm whitespace-pre-wrap">
                    <div className="font-semibold mb-1">
                      {applyTokens(combinedSubject, { name: 'there' })}
                    </div>
                    {applyTokens(combinedEmail, { name: 'there' })}
                  </div>
                </div>
                <div className="bg-accent/40 p-3 rounded">
                  <p className="text-xs font-medium mb-1">SMS preview</p>
                  <div className="text-sm whitespace-pre-wrap">
                    {applyTokens(combinedSms, { name: 'there' })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setComposeOpen(false)}>
                Close
              </Button>
              <Button onClick={sendCombinedEmails} disabled={sendingEmails}>
                {sendingEmails ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send combined
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
