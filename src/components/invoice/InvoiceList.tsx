import { useEffect, useState, useCallback } from 'react';
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
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Search,
  Eye,
  Edit,
  FileText,
  Trash2,
  Loader2,
  Mail,
  Download,
  CheckCircle,
  XOctagon,
  MoreVertical,
  HandCoins,
  History,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InvoiceForm } from './InvoiceForm';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '../../AuthPage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const API_BASE_URL = 'https://quantnow.onrender.com';

interface InvoiceLineItem {
  id?: string;
  product_service_id: string | null;
  product_service_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}
export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Partially Paid';
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
}

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface UserProfile {
  company?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  reg_number?: string | null;
  contact_person?: string | null;
  company_logo_url?: string | null;
}

type PaymentRow = {
  id: string;
  amount_paid: number;
  payment_date: string; // ISO
  notes?: string | null;
  created_at?: string;
};

// raw account from your /accounts endpoint
type RawAccount = {
  id: number;
  name: string;
  type?: string | null;
  code?: string | null;
  is_postable?: boolean;
  is_active?: boolean;
  reporting_category_id?: number | null;
};

// If you have a reporting_category_id that denotes Cash & Cash Equivalents,
// set it here (otherwise we’ll just use name/type heuristics).
const CASH_EQ_CATEGORY_ID: number | undefined = undefined;

export function InvoiceList() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [emailProcessingInvoiceId, setEmailProcessingInvoiceId] = useState<string | null>(null);
  const [downloadProcessingInvoiceId, setDownloadProcessingInvoiceId] = useState<string | null>(null);

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [invoiceToSendEmail, setInvoiceToSendEmail] = useState<Invoice | null>(null);

  // -------- Payments state --------
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [paySummary, setPaySummary] = useState<{
    invoice_total: number;
    total_paid: number;
    balance_due: number;
    status: string;
  } | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState<string>('');
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [accounts, setAccounts] = useState<{ id: number; name: string; code?: string }[]>([]);

  // Payment history
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyInvoice, setHistoryInvoice] = useState<Invoice | null>(null);
  const [historyRows, setHistoryRows] = useState<PaymentRow[]>([]);
  const [historySummary, setHistorySummary] = useState<{
    invoice_total: number;
    total_paid: number;
    balance_due: number;
    status: string;
  } | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseAccountId, setReverseAccountId] = useState<number | null>(null);

  const fetchUserProfile = useCallback(async () => {
    if (!token) {
      setUserProfile(null);
      setIsLoadingProfile(false);
      return;
    }
    setIsLoadingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to fetch user profile');
      const data: UserProfile = await response.json();
      setUserProfile(data);
    } catch (error: any) {
      toast({
        title: 'Profile Load Error',
        description: error.message || 'Failed to load company profile. PDF and email features may be limited.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [toast, token]);

  const fetchInvoices = useCallback(async () => {
    if (!token) {
      setInvoices([]);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to fetch invoices');
      const data: Invoice[] = await response.json();
      setInvoices(
        data.map((inv) => ({
          ...inv,
          total_amount: parseFloat(inv.total_amount as any) || 0,
          invoice_date: new Date(inv.invoice_date).toISOString().split('T')[0],
          due_date: new Date(inv.due_date).toISOString().split('T')[0],
        }))
      );
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load invoices. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingList(false);
    }
  }, [toast, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchInvoices();
      fetchUserProfile();
    } else {
      setInvoices([]);
      setUserProfile(null);
      setIsLoadingList(false);
      setIsLoadingProfile(false);
    }
  }, [fetchInvoices, fetchUserProfile, isAuthenticated, token]);

  // Optional overdue checker
  useEffect(() => {
    const checkOverdueDates = async () => {
      if (!isAuthenticated || !token) return;
      const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      for (const invoice of invoices) {
        const d = new Date(invoice.due_date);
        const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (dueDay < today && invoice.status !== 'Paid' && invoice.status !== 'Overdue') {
          await handleManualStatusUpdate(invoice.id, 'Overdue', false);
        }
      }
    };
    const timer = setTimeout(checkOverdueDates, 5000);
    return () => clearTimeout(timer);
  }, [invoices, isAuthenticated, token]);

  const getStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'Paid':
        return 'bg-green-100 text-green-800';
      case 'Partially Paid':
        return 'bg-amber-100 text-amber-800';
      case 'Sent':
        return 'bg-blue-100 text-blue-800';
      case 'Draft':
        return 'bg-gray-100 text-gray-800';
      case 'Overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredInvoices = invoices.filter(
    (invoice) =>
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleNewInvoiceClick = () => {
    setSelectedInvoice(null);
    setShowInvoiceForm(true);
  };

  const handleEditInvoiceClick = async (invoice: Invoice) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Log in to edit invoices.', variant: 'destructive' });
      return;
    }
    setIsFormLoading(true);
    setShowInvoiceForm(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch invoice details.');
      const detailedInvoice: Invoice = await response.json();
      detailedInvoice.total_amount = parseFloat(detailedInvoice.total_amount as any) || 0;
      detailedInvoice.line_items =
        detailedInvoice.line_items?.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity as any) || 0,
          unit_price: parseFloat(item.unit_price as any) || 0,
          line_total: parseFloat(item.line_total as any) || 0,
          tax_rate: parseFloat(item.tax_rate as any) || 0,
        })) || [];
      setSelectedInvoice(detailedInvoice);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load invoice.', variant: 'destructive' });
      setShowInvoiceForm(false);
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleViewInvoiceClick = async (invoice: Invoice) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Log in to view invoices.', variant: 'destructive' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch invoice details');
      const detailedInvoice: Invoice = await response.json();
      detailedInvoice.total_amount = parseFloat(detailedInvoice.total_amount as any) || 0;
      detailedInvoice.line_items =
        detailedInvoice.line_items?.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity as any) || 0,
          unit_price: parseFloat(item.unit_price as any) || 0,
          line_total: parseFloat(item.line_total as any) || 0,
          tax_rate: parseFloat(item.tax_rate as any) || 0,
        })) || [];
      setSelectedInvoice(detailedInvoice);
      setIsViewModalOpen(true);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load invoice details.', variant: 'destructive' });
    }
  };

  // ---------- Email ----------
  const promptSendInvoiceEmail = async (invoice: Invoice) => {
    setInvoiceToSendEmail(invoice);
    setEmailProcessingInvoiceId(invoice.id);
    try {
      let customerEmail = invoice.customer_email || '';
      if (!customerEmail && token) {
        const resp = await fetch(`${API_BASE_URL}/api/customers/${invoice.customer_id}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const customerData: Customer = await resp.json();
          customerEmail = customerData?.email || '';
        }
      }
      setEmailRecipient(customerEmail);
      setEmailSubject(`Invoice #${invoice.invoice_number} from ${userProfile?.company || 'Your Company'}`);
      setEmailBody(
        `Dear ${invoice.customer_name},\n\n` +
          `Please find attached your invoice (Invoice ID: #${invoice.invoice_number}).\n\n` +
          `Total amount: ${invoice.currency} ${invoice.total_amount.toFixed(2)}\n` +
          `Due Date: ${new Date(invoice.due_date || '').toLocaleDateString('en-ZA')}\n\n` +
          `Thank you for your business!\n\nSincerely,\n` +
          `${userProfile?.company || 'Your Company'}\n${userProfile?.contact_person || ''}`
      );
    } catch {
      // ignore
    } finally {
      setShowSendEmailModal(true);
      setEmailProcessingInvoiceId(null);
    }
  };

  const confirmSendInvoiceEmail = async () => {
    if (!invoiceToSendEmail || !emailRecipient || !emailSubject || !emailBody) {
      toast({ title: 'Missing Information', description: 'Fill recipient, subject and body.', variant: 'destructive' });
      return;
    }
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Log in to send emails.', variant: 'destructive' });
      return;
    }
    setEmailProcessingInvoiceId(invoiceToSendEmail.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/invoices/${invoiceToSendEmail.id}/send-pdf-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ customerEmail: emailRecipient, subject: emailSubject, body: emailBody }),
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to send invoice email.');
      toast({
        title: 'Email Sent!',
        description: `Invoice #${invoiceToSendEmail.invoice_number} sent to ${emailRecipient}.`,
      });
      await handleManualStatusUpdate(invoiceToSendEmail.id, 'Sent', false);
      fetchInvoices();
      setShowSendEmailModal(false);
      setEmailRecipient('');
      setEmailSubject('');
      setEmailBody('');
      setInvoiceToSendEmail(null);
    } catch (error: any) {
      toast({
        title: 'Email Failed',
        description: error.message || `Failed to send invoice #${invoiceToSendEmail.invoice_number}.`,
        variant: 'destructive',
      });
    } finally {
      setEmailProcessingInvoiceId(null);
    }
  };

  // ---------- Manual Status ----------
  const handleManualStatusUpdate = useCallback(
    async (invoiceId: string, newStatus: Invoice['status'], showToast: boolean = true) => {
      if (!token) {
        if (showToast) toast({ title: 'Authentication Error', description: 'Log in to update status.', variant: 'destructive' });
        return false;
      }
      try {
        const fetchResponse = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!fetchResponse.ok) throw new Error((await fetchResponse.json()).error || 'Failed to fetch invoice for update.');
        const detailedInvoice: Invoice = await fetchResponse.json();
        const updatedInvoice = { ...detailedInvoice, status: newStatus };
        const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(updatedInvoice),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to update invoice status.');
        if (showToast) toast({ title: 'Status Updated', description: `Invoice status updated to ${newStatus}.` });
        fetchInvoices();
        return true;
      } catch (error: any) {
        if (showToast) toast({ title: 'Status Update Failed', description: error.message || `Failed to update status.` , variant: 'destructive' });
        return false;
      }
    },
    [fetchInvoices, toast, token]
  );

  // ---------- PDF ----------
  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Log in to download PDFs.', variant: 'destructive' });
      return;
    }
    setDownloadProcessingInvoiceId(invoiceId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.text().catch(() => '')) || 'Failed to download invoice PDF.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Download Started', description: `Invoice #${invoiceNumber} is downloading...` });
    } catch (error: any) {
      toast({ title: 'Download Failed', description: error.message || 'Failed to download invoice.', variant: 'destructive' });
    } finally {
      setDownloadProcessingInvoiceId(null);
    }
  };

  // ===================== BANK/CASH ACCOUNTS (client-side filter) =====================

  const fetchBankCashAccounts = useCallback(async (): Promise<{ id: number; name: string; code?: string }[]> => {
    if (!token) return [];
    const resp = await fetch(`${API_BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return [];

    const all: RawAccount[] = await resp.json();

    const bankCash = all.filter((a) => {
      const t = (a.type || '').toLowerCase();
      const byType = t === 'bank' || t === 'cash';
      const byName = /bank|cash/i.test(a.name || '');
      const byCategory = CASH_EQ_CATEGORY_ID !== undefined && a.reporting_category_id === CASH_EQ_CATEGORY_ID;
      return byType || byName || Boolean(byCategory);
    });

    bankCash.sort((a, b) => {
      const ac = (a.code || '').localeCompare(b.code || '');
      if (ac !== 0) return ac;
      return (a.name || '').localeCompare(b.name || '');
    });

    return bankCash.map((a) => ({ id: a.id, name: a.name, code: a.code || undefined }));
  }, [token]);

  // ===================== PAYMENTS (frontend) =====================

  // Open Record Payment modal
  const openPaymentModal = async (inv: Invoice) => {
    if (!token) return;
    setPayingInvoice(inv);
    setIsPayModalOpen(true);
    try {
      const [sResp, bankCash] = await Promise.all([
        fetch(`${API_BASE_URL}/api/invoices/${inv.id}/payments-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchBankCashAccounts(),
      ]);
      if (sResp.ok) {
        const s = await sResp.json();
        setPaySummary(s);
        setPayAmount(Number(s.balance_due || 0));
      } else {
        setPaySummary(null);
      }
      setAccounts(bankCash);
      if (bankCash.length) setPayAccountId(bankCash[0].id);
    } catch {
      // ignore
    }
  };

  const closePaymentModal = () => {
    setIsPayModalOpen(false);
    setPayingInvoice(null);
    setPaySummary(null);
    setPayAmount(0);
    setPayNotes('');
    setPayAccountId(null);
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const submitPayment = async () => {
    if (!token || !payingInvoice || !paySummary || !payAccountId) return;
    const remaining = Number(paySummary.balance_due || 0);
    if (payAmount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive amount.', variant: 'destructive' });
      return;
    }
    if (payAmount - remaining > 0.005) {
      toast({ title: 'Too much', description: `Payment exceeds remaining (${remaining.toFixed(2)}).`, variant: 'destructive' });
      return;
    }
    setIsPaying(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/invoices/${payingInvoice.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount_paid: payAmount,
          payment_date: payDate,
          notes: payNotes,
          account_id: payAccountId,
          transaction_description: `Payment for Invoice #${payingInvoice.invoice_number}`,
        }),
      });
      if (!resp.ok) throw new Error((await resp.text()) || 'Failed to record payment');
      const data = await resp.json();
      toast({
        title: 'Payment recorded',
        description: `Paid ${payAmount.toFixed(2)}. Balance: ${data?.totals?.balance_due?.toFixed?.(2) ?? '—'}.`,
      });
      await fetchInvoices();
      closePaymentModal();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to record payment', variant: 'destructive' });
    } finally {
      setIsPaying(false);
    }
  };

  // Open Payment History dialog
  const openPaymentHistory = async (inv: Invoice) => {
    if (!token) return;
    setHistoryInvoice(inv);
    setHistoryModalOpen(true);
    try {
      const [rowsResp, sumResp, bankCash] = await Promise.all([
        fetch(`${API_BASE_URL}/api/invoices/${inv.id}/payments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/invoices/${inv.id}/payments-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchBankCashAccounts(),
      ]);
      if (rowsResp.ok) setHistoryRows(await rowsResp.json());
      if (sumResp.ok) setHistorySummary(await sumResp.json());

      setAccounts(bankCash);
      if (bankCash.length) setReverseAccountId(bankCash[0].id);
    } catch {
      // ignore
    }
  };

  const closePaymentHistory = () => {
    setHistoryModalOpen(false);
    setHistoryInvoice(null);
    setHistoryRows([]);
    setHistorySummary(null);
    setReverseAccountId(null);
  };

  const reversePayment = async (paymentId: string) => {
    if (!token || !historyInvoice) return;
    if (!reverseAccountId) {
      toast({ title: 'Select account', description: 'Choose the bank/cash account for reversal.', variant: 'destructive' });
      return;
    }
    setReversingId(paymentId);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/invoice-payments/${paymentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reverse_account_id: reverseAccountId,
          reversal_memo: `Reversal for ${historyInvoice.invoice_number}`,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const d = await resp.json();
      toast({
        title: 'Payment reversed',
        description: `New balance: ${d?.totals?.balance_due?.toFixed?.(2) ?? '—'}`,
      });
      await openPaymentHistory(historyInvoice); // refresh modal contents
      await fetchInvoices(); // refresh list
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to reverse payment', variant: 'destructive' });
    } finally {
      setReversingId(null);
    }
  };

  // ---------- Deletion ----------
  const confirmDeleteInvoice = (invoiceId: string) => setInvoiceToDelete(invoiceId);

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Log in to delete invoices.', variant: 'destructive' });
      setInvoiceToDelete(null);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceToDelete}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete invoice');
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceToDelete));
      toast({ title: 'Invoice Deleted', description: 'The invoice has been deleted.' });
    } catch (error: any) {
      toast({ title: 'Deletion Failed', description: error.message || 'Failed to delete invoice.', variant: 'destructive' });
    } finally {
      setInvoiceToDelete(null);
    }
  };

  const handleFormSubmitSuccess = () => {
    setShowInvoiceForm(false);
    fetchInvoices();
  };

  if (showInvoiceForm) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {selectedInvoice ? 'Edit Invoice' : 'Create New Invoice'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {selectedInvoice
              ? `Editing invoice ${selectedInvoice.invoice_number}.`
              : 'Fill in the details to create a new sales invoice.'}
          </p>
          {isFormLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              <span className="ml-2 text-gray-600">Loading invoice details...</span>
            </div>
          ) : (
            <InvoiceForm
              invoice={selectedInvoice}
              onClose={() => setShowInvoiceForm(false)}
              onSubmitSuccess={handleFormSubmitSuccess}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sales Invoices
          </CardTitle>
          <Button onClick={handleNewInvoiceClick}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices by number or customer..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoadingList ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-600">Loading invoices...</span>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.customer_name}</TableCell>
                      <TableCell>{new Date(invoice.invoice_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell>{new Date(invoice.due_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell>
                        R
                        {invoice.total_amount.toLocaleString('en-ZA', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleViewInvoiceClick(invoice)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditInvoiceClick(invoice)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => promptSendInvoiceEmail(invoice)}
                            disabled={isLoadingProfile || emailProcessingInvoiceId === invoice.id}
                            title="Email invoice PDF"
                          >
                            {emailProcessingInvoiceId === invoice.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                          </Button>

                          {/* Record Payment */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentModal(invoice)}
                            title="Record payment"
                          >
                            <HandCoins className="h-4 w-4" />
                          </Button>

                          {/* Payment History */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentHistory(invoice)}
                            title="Payment history"
                          >
                            <History className="h-4 w-4" />
                          </Button>

                          {/* Status dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`flex items-center gap-1 ${getStatusColor(invoice.status)}`}
                                title="Change status"
                              >
                                {invoice.status.toUpperCase()} <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Draft')}>
                                <FileText className="mr-2 h-4 w-4" /> Draft
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Sent')}>
                                <Mail className="mr-2 h-4 w-4" /> Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Partially Paid')}>
                                <HandCoins className="mr-2 h-4 w-4" /> Partially Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Paid')}>
                                <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Overdue')}>
                                <XOctagon className="mr-2 h-4 w-4 text-red-600" /> Overdue
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Delete */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => confirmDeleteInvoice(invoice.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete invoice {invoice.invoice_number}? This action cannot
                                  be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteInvoice}>Delete</AlertDialogAction>
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

      {/* View Invoice Details Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details: {selectedInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>Detailed view of the selected invoice.</DialogDescription>
          </DialogHeader>
          {selectedInvoice ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p>
                    <strong>Customer:</strong> {selectedInvoice.customer_name}
                  </p>
                  {selectedInvoice.customer_email && (
                    <p>
                      <strong>Customer Email:</strong> {selectedInvoice.customer_email}
                    </p>
                  )}
                  <p>
                    <strong>Invoice Date:</strong>{' '}
                    {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-ZA')}
                  </p>
                  <p>
                    <strong>Due Date:</strong> {new Date(selectedInvoice.due_date).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Status:</strong>{' '}
                    <Badge variant="secondary" className={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status.toUpperCase()}
                    </Badge>
                  </p>
                  <p>
                    <strong>Total Amount:</strong> {selectedInvoice.currency}
                    {selectedInvoice.total_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </p>
                  <p>
                    <strong>Currency:</strong> {selectedInvoice.currency}
                  </p>
                </div>
              </div>
              {selectedInvoice.notes && (
                <p>
                  <strong>Notes:</strong> {selectedInvoice.notes}
                </p>
              )}

              <h3 className="font-semibold text-lg mt-6">Line Items</h3>
              {selectedInvoice.line_items && selectedInvoice.line_items.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product/Service</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Tax Rate</TableHead>
                        <TableHead>Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.line_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product_service_name || 'Custom Item'}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>R{(item.unit_price ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{((item.tax_rate ?? 0) * 100).toFixed(2)}%</TableCell>
                          <TableCell>R{(item.line_total ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No line items for this invoice.</p>
              )}
            </div>
          ) : (
            <div className="flex justify-center items-center h-40 text-muted-foreground">Select an invoice.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() =>
                selectedInvoice && handleDownloadInvoice(selectedInvoice.id, selectedInvoice.invoice_number)
              }
              disabled={!selectedInvoice || downloadProcessingInvoiceId === selectedInvoice?.id}
            >
              {downloadProcessingInvoiceId === selectedInvoice?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Modal */}
      <Dialog
        open={showSendEmailModal}
        onOpenChange={(open) => {
          setShowSendEmailModal(open);
          if (!open) {
            setEmailRecipient('');
            setEmailSubject('');
            setEmailBody('');
            setInvoiceToSendEmail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Invoice #{invoiceToSendEmail?.invoice_number}</DialogTitle>
            <DialogDescription>Compose and send this invoice via email.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="recipient" className="text-right">
                Recipient
              </Label>
              <Input
                id="recipient"
                type="email"
                placeholder="recipient@example.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Subject
              </Label>
              <Input id="subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="body" className="text-right">
                Body
              </Label>
              <Textarea id="body" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="col-span-3 min-h-[150px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendEmailModal(false)} disabled={emailProcessingInvoiceId !== null}>
              Cancel
            </Button>
            <Button
              onClick={confirmSendInvoiceEmail}
              disabled={
                emailProcessingInvoiceId !== null || !emailRecipient || !emailSubject || !emailBody || !invoiceToSendEmail
              }
            >
              {emailProcessingInvoiceId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog open={isPayModalOpen} onOpenChange={(o) => { if (!o) closePaymentModal(); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Record Payment — {payingInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>Apply a cash/bank receipt to this invoice. We’ll post the journal automatically.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {paySummary ? (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Invoice Total</div>
                  <div className="font-semibold">R {paySummary.invoice_total.toFixed(2)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Total Paid</div>
                  <div className="font-semibold">R {paySummary.total_paid.toFixed(2)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Balance Due</div>
                  <div className="font-semibold">R {paySummary.balance_due.toFixed(2)}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Loading summary…</div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isFinite(payAmount) ? payAmount : 0}
                onChange={(e) => setPayAmount(parseFloat(e.target.value || '0'))}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="col-span-3" />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Account</Label>
              <select
                className="col-span-3 border rounded-md h-10 px-3"
                value={payAccountId ?? ''}
                onChange={(e) => setPayAccountId(Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code ? `${a.code} — ${a.name}` : a.name}
                  </option>
                ))}
              </select>
              {accounts.length === 0 && (
                <p className="col-span-4 text-xs text-red-600">
                  No Bank/Cash accounts found. Create one in your Chart of Accounts to record payments.
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Notes</Label>
              <Textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="col-span-3 min-h-[90px]"
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePaymentModal} disabled={isPaying}>
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={isPaying || !payAccountId || !payingInvoice || accounts.length === 0}>
              {isPaying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment History Modal */}
      <Dialog open={historyModalOpen} onOpenChange={(o) => { if (!o) closePaymentHistory(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment History — {historyInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>Track all partial/full payments and reverse if needed.</DialogDescription>
          </DialogHeader>

          {historySummary ? (
            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Invoice Total</div>
                <div className="font-semibold">R {historySummary.invoice_total.toFixed(2)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Total Paid</div>
                <div className="font-semibold">R {historySummary.total_paid.toFixed(2)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Balance Due</div>
                <div className="font-semibold">R {historySummary.balance_due.toFixed(2)}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mb-4">Loading summary…</div>
          )}

          {accounts.length > 0 && (
            <div className="mb-3">
              <Label>Reversal Account (Bank/Cash)</Label>
              <select
                className="w-full border rounded-md h-10 px-3 mt-1"
                value={reverseAccountId ?? ''}
                onChange={(e) => setReverseAccountId(Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code ? `${a.code} — ${a.name}` : a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No payments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  historyRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.payment_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell className="text-right">R {Number(p.amount_paid).toFixed(2)}</TableCell>
                      <TableCell>{p.notes || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => reversePayment(p.id)} disabled={reversingId === p.id}>
                          {reversingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-red-600" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePaymentHistory}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
