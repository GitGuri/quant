import React, { useState, useEffect, useCallback } from 'react';
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
  ArrowRight,
  Trash2,
  Loader2,
  Mail,
  Download,
  CheckCircle,
  XOctagon,
  Clock,
  MoreVertical,
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { QuotationForm } from './QuotationForm';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../../AuthPage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const API_BASE_URL = 'http://localhost:3000';

interface QuotationLineItem {
  id?: string;
  product_service_id: string | null;
  product_service_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  quotation_date: string;
  expiry_date: string | null;
  total_amount: number;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Expired' | 'Invoiced';
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: QuotationLineItem[];
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
}

export function QuotationList() {
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationToDelete, setQuotationToDelete] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(false);

  // subtle, per-row indicators
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [quotationToSendEmail, setQuotationToSendEmail] = useState<Quotation | null>(null);
  const [emailProcessingQuotationId, setEmailProcessingQuotationId] = useState<string | null>(null);

  const [downloadProcessingQuotationId, setDownloadProcessingQuotationId] = useState<string | null>(null);

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Accepted':
        return 'bg-green-100 text-green-800';
      case 'Sent':
        return 'bg-blue-100 text-blue-800';
      case 'Draft':
        return 'bg-gray-100 text-gray-800';
      case 'Declined':
        return 'bg-red-100 text-red-800';
      case 'Expired':
        return 'bg-orange-100 text-orange-800';
      case 'Invoiced':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // -------- data fetchers --------

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
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to fetch user profile');
      }
      const data: UserProfile = await response.json();
      setUserProfile(data);
    } catch (e: any) {
      toast({
        title: 'Profile Load Error',
        description: e.message || 'Failed to load company profile.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [toast, token]);

  const fetchQuotations = useCallback(async () => {
    if (!token) {
      setQuotations([]);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to fetch quotations');
      }
      const data: Quotation[] = await response.json();
      setQuotations(
        data.map((q) => ({
          ...q,
          total_amount: parseFloat(q.total_amount as any) || 0,
          quotation_date: new Date(q.quotation_date).toISOString().split('T')[0],
          expiry_date: q.expiry_date ? new Date(q.expiry_date).toISOString().split('T')[0] : null,
        }))
      );
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message || 'Failed to load quotations.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingList(false);
    }
  }, [toast, token]);

  // silent refresh: same as fetchQuotations but without flipping the big list spinner
  const refreshQuotationsSilently = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data: Quotation[] = await response.json();
      setQuotations(
        data.map((q) => ({
          ...q,
          total_amount: parseFloat(q.total_amount as any) || 0,
          quotation_date: new Date(q.quotation_date).toISOString().split('T')[0],
          expiry_date: q.expiry_date ? new Date(q.expiry_date).toISOString().split('T')[0] : null,
        }))
      );
    } catch {
      /* swallow silently */
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchQuotations();
      fetchUserProfile();
    } else {
      setQuotations([]);
      setUserProfile(null);
      setIsLoadingList(false);
      setIsLoadingProfile(false);
    }
  }, [fetchQuotations, fetchUserProfile, isAuthenticated, token]);

  // auto-expire checker (silent)
  useEffect(() => {
    const checkExpiryDates = async () => {
      if (!isAuthenticated || !token) return;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (const quotation of quotations) {
        if (quotation.expiry_date) {
          const expiry = new Date(quotation.expiry_date);
          const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
          if (
            expiryDay < today &&
            quotation.status !== 'Expired' &&
            quotation.status !== 'Accepted' &&
            quotation.status !== 'Declined' &&
            quotation.status !== 'Invoiced'
          ) {
            await handleManualStatusUpdate(quotation.id, 'Expired', false);
          }
        }
      }
    };
    const timer = setTimeout(checkExpiryDates, 5000);
    return () => clearTimeout(timer);
  }, [quotations, isAuthenticated, token]); // eslint-disable-line

  // -------- actions --------

  const handleNewQuotationClick = () => {
    setSelectedQuotation(null);
    setShowQuotationForm(true);
  };

  const handleEditQuotationClick = async (quotation: Quotation) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to edit.', variant: 'destructive' });
      return;
    }
    setIsFormLoading(true);
    setShowQuotationForm(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch quotation details.');
      }
      const detailed: Quotation = await response.json();
      detailed.total_amount = parseFloat(detailed.total_amount as any) || 0;
      detailed.line_items =
        detailed.line_items?.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity as any) || 0,
          unit_price: parseFloat(item.unit_price as any) || 0,
          line_total: parseFloat(item.line_total as any) || 0,
          tax_rate: parseFloat(item.tax_rate as any) || 0,
        })) || [];
      setSelectedQuotation(detailed);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load details.', variant: 'destructive' });
      setShowQuotationForm(false);
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleViewQuotationClick = async (quotation: Quotation) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to view.', variant: 'destructive' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch quotation details');
      }
      const detailed: Quotation = await response.json();
      detailed.total_amount = parseFloat(detailed.total_amount as any) || 0;
      detailed.line_items =
        detailed.line_items?.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity as any) || 0,
          unit_price: parseFloat(item.unit_price as any) || 0,
          line_total: parseFloat(item.line_total as any) || 0,
          tax_rate: parseFloat(item.tax_rate as any) || 0,
        })) || [];
      setSelectedQuotation(detailed);
      setIsViewModalOpen(true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load details.', variant: 'destructive' });
    }
  };

  const handleDownloadPdf = async (quotationId: string, quotationNumber: string) => {
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    setDownloadProcessingQuotationId(quotationId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}/pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate PDF.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation_${quotationNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Download Started', description: `Quotation #${quotationNumber} is downloading...` });
    } catch (e: any) {
      toast({ title: 'Download Failed', description: e.message || 'Try again.', variant: 'destructive' });
    } finally {
      setDownloadProcessingQuotationId(null);
    }
  };

  const handleDeleteQuotationClick = (quotationId: string) => setQuotationToDelete(quotationId);

  const handleDeleteQuotation = useCallback(async () => {
    if (!quotationToDelete) return;
    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    setIsLoadingList(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationToDelete}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to delete quotation');
      }
      toast({ title: 'Quotation Deleted', description: 'The quotation has been deleted.' });
      fetchQuotations();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete quotation.', variant: 'destructive' });
    } finally {
      setQuotationToDelete(null);
      setIsLoadingList(false);
    }
  }, [quotationToDelete, fetchQuotations, toast, token]);

  const handleSendEmailClick = (quotation: Quotation) => {
    setQuotationToSendEmail(quotation);
    setEmailRecipient(quotation.customer_email || '');
    setEmailSubject(`Quotation #${quotation.quotation_number} from ${userProfile?.company || 'Your Company'}`);
    setEmailBody(
      `Dear ${quotation.customer_name},\n\nPlease find attached your quotation (Quotation ID: #${quotation.quotation_number}).\n\nTotal amount: ${quotation.currency} ${quotation.total_amount.toFixed(
        2
      )}\nExpiry Date: ${quotation.expiry_date ? new Date(quotation.expiry_date).toLocaleDateString('en-ZA') : ''}\n\nThank you for your business!\n\nSincerely,\n${
        userProfile?.company || 'Your Company'
      }\n${userProfile?.contact_person || ''}`
    );
    setShowSendEmailModal(true);
  };

  // ---- CONVERT TO INVOICE (per-row indicator, silent reload) ----
  const handleConvertQuotationToInvoice = useCallback(
    async (quotation: Quotation) => {
      if (quotation.status !== 'Accepted') {
        toast({ title: 'Conversion Not Allowed', description: 'Only accepted quotations can be converted.', variant: 'destructive' });
        return;
      }
      if (!token) {
        toast({ title: 'Authentication Required', description: 'Please log in.', variant: 'destructive' });
        return;
      }

      setConvertingId(quotation.id);
      try {
        // fetch full quotation
        const resp = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || 'Failed to fetch detailed quotation.');
        }
        const detailed: Quotation = await resp.json();
        if (!detailed.line_items || detailed.line_items.length === 0) {
          throw new Error('Quotation has no line items to convert.');
        }

        // new invoice number & dates
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const newInvoiceNumber = `INV-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;

        const invoiceDate = new Date();
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(invoiceDate.getDate() + 7);

        const invoicePayload = {
          invoice_number: newInvoiceNumber,
          customer_id: detailed.customer_id,
          invoice_date: invoiceDate.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          total_amount: detailed.total_amount,
          status: 'Draft' as const,
          currency: detailed.currency,
          notes: `Converted from Quotation ${detailed.quotation_number}. ${detailed.notes || ''}`.trim(),
          line_items: detailed.line_items.map((li) => ({
            product_service_id: li.product_service_id,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            line_total: li.line_total,
            tax_rate: li.tax_rate,
          })),
        };

        const createInvoiceResponse = await fetch(`${API_BASE_URL}/api/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(invoicePayload),
        });
        if (!createInvoiceResponse.ok) {
          const err = await createInvoiceResponse.json();
          throw new Error(err.error || 'Failed to create invoice.');
        }

        // mark quotation as Invoiced (full/partial depends on backend; here partial is fine if your PUT accepts it)
        await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'Invoiced' }),
        }).catch(() => {});

        toast({ title: 'Conversion Successful', description: `Quotation ${quotation.quotation_number} converted to ${newInvoiceNumber}.` });
        await refreshQuotationsSilently();
      } catch (e: any) {
        toast({ title: 'Conversion Failed', description: e.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setConvertingId(null);
      }
    },
    [token, toast, refreshQuotationsSilently]
  );

  // ---- STATUS UPDATE (fetch full, PUT full; auto-convert if Accepted; per-row indicator; silent refresh) ----
  const handleManualStatusUpdate = useCallback(
    async (quotationId: string, newStatus: Quotation['status'], showToast: boolean = true) => {
      if (!token) {
        if (showToast) toast({ title: 'Authentication Error', description: 'Please log in.', variant: 'destructive' });
        return false;
      }

      setStatusUpdatingId(quotationId);

      try {
        // fetch full quotation first
        const fetchResp = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!fetchResp.ok) {
          const err = await fetchResp.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to fetch quotation for update.');
        }
        const full: Quotation = await fetchResp.json();

        // complete payload with numbers cast + new status
        const payload: Quotation = {
          ...full,
          status: newStatus,
          total_amount: Number(full.total_amount) || 0,
          line_items:
            (full.line_items || []).map((li) => ({
              ...li,
              quantity: Number(li.quantity) || 0,
              unit_price: Number(li.unit_price) || 0,
              line_total: Number(li.line_total) || 0,
              tax_rate: Number(li.tax_rate) || 0,
            })) || [],
        };

        const putResp = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!putResp.ok) {
          const err = await putResp.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update quotation status.');
        }

        if (showToast) toast({ title: 'Status Updated', description: `Quotation is now ${newStatus}.` });

        // if accepted -> immediately convert (silent per-row spinner)
        if (newStatus === 'Accepted') {
          await handleConvertQuotationToInvoice({ ...full, status: 'Accepted' });
        } else {
          await refreshQuotationsSilently();
        }

        return true;
      } catch (e: any) {
        if (showToast)
          toast({
            title: 'Status Update Failed',
            description: e?.message || `Couldn't set status to ${newStatus}.`,
            variant: 'destructive',
          });
        return false;
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [token, toast, handleConvertQuotationToInvoice, refreshQuotationsSilently]
  );

  // send email (kept the same, but uses silent status update)
  const confirmSendQuotationEmail = useCallback(
    async () => {
      if (!quotationToSendEmail || !emailRecipient || !emailSubject || !emailBody) {
        toast({ title: 'Missing Information', description: 'Fill recipient, subject, and body.', variant: 'destructive' });
        return;
      }
      if (!token) {
        toast({ title: 'Authentication Error', description: 'Please log in.', variant: 'destructive' });
        return;
      }

      setEmailProcessingQuotationId(quotationToSendEmail.id);
      try {
        const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationToSendEmail.id}/send-pdf-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ recipientEmail: emailRecipient, subject: emailSubject, body: emailBody }),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to send email.');
        }

        toast({
          title: 'Email Sent',
          description: `Quotation #${quotationToSendEmail.quotation_number} sent to ${emailRecipient}.`,
        });

        await handleManualStatusUpdate(quotationToSendEmail.id, 'Sent', false);

        setShowSendEmailModal(false);
        setEmailRecipient('');
        setEmailSubject('');
        setEmailBody('');
        await refreshQuotationsSilently();
      } catch (e: any) {
        toast({ title: 'Email Send Error', description: e.message || 'Failed to send email.', variant: 'destructive' });
      } finally {
        setEmailProcessingQuotationId(null);
      }
    },
    [quotationToSendEmail, emailRecipient, emailSubject, emailBody, toast, token, handleManualStatusUpdate, refreshQuotationsSilently]
  );

  const handleFormSubmitSuccess = () => {
    setShowQuotationForm(false);
    fetchQuotations();
  };

  const filteredQuotations = quotations.filter(
    (q) =>
      q.status !== 'Invoiced' &&
      (q.quotation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.customer_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (showQuotationForm) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">{selectedQuotation ? 'Edit Quotation' : 'Create New Quotation'}</h2>
          <p className="text-muted-foreground mb-6">
            {selectedQuotation ? `Editing quotation ${selectedQuotation.quotation_number}.` : 'Fill in the details to create a new sales quotation.'}
          </p>
          {isFormLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              <span className="ml-2 text-gray-600">Loading quotation details...</span>
            </div>
          ) : (
            <QuotationForm quotation={selectedQuotation} onClose={() => setShowQuotationForm(false)} onSubmitSuccess={handleFormSubmitSuccess} />
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
            Quotations
          </CardTitle>
          <Button onClick={handleNewQuotationClick}>
            <Plus className="h-4 w-4 mr-2" />
            New Quotation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quotations by number or customer..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoadingList ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-600">Loading quotations...</span>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No quotations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQuotations.map((quotation) => (
                    <TableRow key={quotation.id}>
                      <TableCell className="font-medium">{quotation.quotation_number}</TableCell>
                      <TableCell>{quotation.customer_name}</TableCell>
                      <TableCell>{new Date(quotation.quotation_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell>{quotation.expiry_date ? new Date(quotation.expiry_date).toLocaleDateString('en-ZA') : 'N/A'}</TableCell>
                      <TableCell>
                        R
                        {quotation.total_amount.toLocaleString('en-ZA', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleViewQuotationClick(quotation)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditQuotationClick(quotation)}>
                            <Edit className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendEmailClick(quotation)}
                            disabled={isLoadingProfile || emailProcessingQuotationId === quotation.id}
                          >
                            {emailProcessingQuotationId === quotation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleConvertQuotationToInvoice(quotation)}
                            disabled={convertingId === quotation.id ? true : quotation.status !== 'Accepted'}
                          >
                            {convertingId === quotation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`flex items-center gap-1 ${getStatusColor(quotation.status)}`}
                                disabled={statusUpdatingId === quotation.id}
                              >
                                {statusUpdatingId === quotation.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Updating…
                                  </>
                                ) : (
                                  <>
                                    {quotation.status.toUpperCase()} <MoreVertical className="h-4 w-4" />
                                  </>
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Draft')}>
                                <FileText className="mr-2 h-4 w-4" /> Draft
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Sent')}>
                                <Mail className="mr-2 h-4 w-4" /> Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Accepted')}>
                                <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> Accepted
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Declined')}>
                                <XOctagon className="mr-2 h-4 w-4 text-red-600" /> Declined
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Expired')}>
                                <Clock className="mr-2 h-4 w-4 text-orange-600" /> Expired
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteQuotationClick(quotation.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete quotation {quotation.quotation_number}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteQuotation}>Delete</AlertDialogAction>
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

      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quotation Details: {selectedQuotation?.quotation_number}</DialogTitle>
            <DialogDescription>Detailed view of the selected quotation.</DialogDescription>
          </DialogHeader>
          {selectedQuotation ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p>
                    <strong>Customer:</strong> {selectedQuotation.customer_name}
                  </p>
                  {selectedQuotation.customer_email && (
                    <p>
                      <strong>Customer Email:</strong> {selectedQuotation.customer_email}
                    </p>
                  )}
                  <p>
                    <strong>Quotation Date:</strong> {new Date(selectedQuotation.quotation_date).toLocaleDateString('en-ZA')}
                  </p>
                  <p>
                    <strong>Expiry Date:</strong>{' '}
                    {selectedQuotation.expiry_date ? new Date(selectedQuotation.expiry_date).toLocaleDateString('en-ZA') : 'N/A'}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Status:</strong>{' '}
                    <Badge variant="secondary" className={getStatusColor(selectedQuotation.status)}>
                      {selectedQuotation.status.toUpperCase()}
                    </Badge>
                  </p>
                  <p>
                    <strong>Total Amount:</strong> {selectedQuotation.currency}
                    {selectedQuotation.total_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </p>
                  <p>
                    <strong>Currency:</strong> {selectedQuotation.currency}
                  </p>
                </div>
              </div>
              {selectedQuotation.notes && (
                <p>
                  <strong>Notes:</strong> {selectedQuotation.notes}
                </p>
              )}

              <h3 className="font-semibold text-lg mt-6">Line Items</h3>
              {selectedQuotation.line_items && selectedQuotation.line_items.length > 0 ? (
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
                      {selectedQuotation.line_items.map((item) => (
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
                <p className="text-muted-foreground">No line items for this quotation.</p>
              )}
            </div>
          ) : (
            <div className="flex justify-center items-center h-40 text-muted-foreground">Select a quotation to view its details.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => selectedQuotation && handleDownloadPdf(selectedQuotation.id, selectedQuotation.quotation_number)}
              disabled={!selectedQuotation || downloadProcessingQuotationId === selectedQuotation?.id}
            >
              {downloadProcessingQuotationId === selectedQuotation?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSendEmailModal}
        onOpenChange={(open) => {
          setShowSendEmailModal(open);
          if (!open) {
            setEmailRecipient('');
            setEmailSubject('');
            setEmailBody('');
            setQuotationToSendEmail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Quotation #{quotationToSendEmail?.quotation_number}</DialogTitle>
            <DialogDescription>Compose and send this quotation via email.</DialogDescription>
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
            <Button variant="outline" onClick={() => setShowSendEmailModal(false)} disabled={emailProcessingQuotationId !== null}>
              Cancel
            </Button>
            <Button
              onClick={confirmSendQuotationEmail}
              disabled={emailProcessingQuotationId !== null || !emailRecipient || !emailSubject || !emailBody || !quotationToSendEmail}
            >
              {emailProcessingQuotationId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
