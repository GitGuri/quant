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
    CheckCircle, // Added for 'Paid' status
    XOctagon, // Added for 'Overdue' status
    Clock, // Added for 'Sent' status (or 'Draft')
    MoreVertical // Added for dropdown menu trigger
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
import { useAuth } from '../../AuthPage'; // Import useAuth
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // Import DropdownMenu components

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
    status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
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

// NEW: User Profile Interface (copied from QuotationList)
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

export function InvoiceList() {
    const { toast } = useToast();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [isFormLoading, setIsFormLoading] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // NEW: State for user profile
    const [isLoadingProfile, setIsLoadingProfile] = useState(false); // NEW: Loading state for profile

    // To track the specific invoice ID being emailed/downloaded
    const [emailProcessingInvoiceId, setEmailProcessingInvoiceId] = useState<string | null>(null);
    const [downloadProcessingInvoiceId, setDownloadProcessingInvoiceId] = useState<string | null>(null);

    // NEW STATES FOR EMAIL MODAL (aligned with QuotationList)
    const [showSendEmailModal, setShowSendEmailModal] = useState(false);
    const [emailRecipient, setEmailRecipient] = useState<string>('');
    const [emailSubject, setEmailSubject] = useState(''); // Added for subject
    const [emailBody, setEmailBody] = useState('');     // Added for body
    const [invoiceToSendEmail, setInvoiceToSendEmail] = useState<Invoice | null>(null);

    const { isAuthenticated } = useAuth(); // Get authentication status
    const token = localStorage.getItem('token'); // Retrieve the token

    // NEW: Function to fetch user profile (Company details for PDF/Email) (copied from QuotationList)
    const fetchUserProfile = useCallback(async () => {
        if (!token) {
            console.warn('No token found. User is not authenticated for profile.');
            setUserProfile(null);
            setIsLoadingProfile(false);
            return;
        }

        setIsLoadingProfile(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/profile`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch user profile');
            }
            const data: UserProfile = await response.json();
            console.log('Fetched User Profile:', data); // Log the fetched data
            setUserProfile(data);
        } catch (error: any) {
            console.error('Error fetching user profile:', error);
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
            console.warn('No token found. User is not authenticated for invoices.');
            setInvoices([]);
            setIsLoadingList(false);
            return;
        }

        setIsLoadingList(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/invoices`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Include the JWT token
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch invoices');
            }
            const data: Invoice[] = await response.json();
            setInvoices(data.map(inv => ({
                ...inv,
                total_amount: parseFloat(inv.total_amount as any) || 0,
                invoice_date: new Date(inv.invoice_date).toISOString().split('T')[0],
                due_date: new Date(inv.due_date).toISOString().split('T')[0],
            })));
        } catch (error: any) {
            console.error('Error fetching invoices:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to load invoices. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsLoadingList(false);
        }
    }, [toast, token]); // Add token to dependencies

    useEffect(() => {
        if (isAuthenticated && token) {
            fetchInvoices();
            fetchUserProfile(); // NEW: Fetch profile on mount
        } else {
            setInvoices([]);
            setUserProfile(null); // Clear profile if not authenticated
            setIsLoadingList(false);
            setIsLoadingProfile(false); // Also reset profile loading
        }
    }, [fetchInvoices, fetchUserProfile, isAuthenticated, token]); // Add isAuthenticated and token to dependencies

    // NEW useEffect for automatic "Overdue" status check
    useEffect(() => {
        const checkOverdueDates = async () => {
            if (!isAuthenticated || !token) return;

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Normalize to start of day

            for (const invoice of invoices) {
                const dueDate = new Date(invoice.due_date);
                const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()); // Normalize to start of day

                // If due date has passed and status is not already 'Paid' or 'Overdue'
                if (dueDay < today && invoice.status !== 'Paid' && invoice.status !== 'Overdue') {
                    console.log(`Invoice ${invoice.invoice_number} is overdue. Updating status...`);
                    await handleManualStatusUpdate(invoice.id, 'Overdue', false); // Update without showing toast
                }
            }
        };

        const timer = setTimeout(checkOverdueDates, 5000); // Run after a short delay
        return () => clearTimeout(timer);
    }, [invoices, isAuthenticated, token]);


    const getStatusColor = (status: Invoice['status']) => { // Use Invoice['status'] for type safety
        switch (status) {
            case 'Paid':
                return 'bg-green-100 text-green-800';
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
        invoice =>
            invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleNewInvoiceClick = () => {
        setSelectedInvoice(null);
        setShowInvoiceForm(true);
    };

    const handleEditInvoiceClick = async (invoice: Invoice) => {
        if (!token) {
            console.warn('No token found. Cannot edit invoice.');
            toast({
                title: 'Authentication Error',
                description: 'You are not authenticated. Please log in to edit invoices.',
                variant: 'destructive',
            });
            return;
        }

        setIsFormLoading(true);
        setShowInvoiceForm(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Include the JWT token
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch invoice details for editing.');
            }
            const detailedInvoice: Invoice = await response.json();
            detailedInvoice.total_amount = parseFloat(detailedInvoice.total_amount as any) || 0;
            detailedInvoice.line_items = detailedInvoice.line_items?.map(item => ({
                ...item,
                quantity: parseFloat(item.quantity as any) || 0,
                unit_price: parseFloat(item.unit_price as any) || 0,
                line_total: parseFloat(item.line_total as any) || 0,
                tax_rate: parseFloat(item.tax_rate as any) || 0,
            })) || [];

            setSelectedInvoice(detailedInvoice);
        } catch (error: any) {
            console.error('Error fetching invoice details for edit:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to load invoice details for editing. Please try again.',
                variant: 'destructive',
            });
            setShowInvoiceForm(false);
        } finally {
            setIsFormLoading(false);
        }
    };

    const handleViewInvoiceClick = async (invoice: Invoice) => {
        if (!token) {
            console.warn('No token found. Cannot view invoice.');
            toast({
                title: 'Authentication Error',
                description: 'You are not authenticated. Please log in to view invoices.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Include the JWT token
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch invoice details');
            }
            const detailedInvoice: Invoice = await response.json();
            detailedInvoice.total_amount = parseFloat(detailedInvoice.total_amount as any) || 0;
            detailedInvoice.line_items = detailedInvoice.line_items?.map(item => ({
                ...item,
                quantity: parseFloat(item.quantity as any) || 0,
                unit_price: parseFloat(item.unit_price as any) || 0,
                line_total: parseFloat(item.line_total as any) || 0,
                tax_rate: parseFloat(item.tax_rate as any) || 0,
            })) || [];

            setSelectedInvoice(detailedInvoice);
            setIsViewModalOpen(true);
        } catch (error: any) {
            console.error('Error fetching invoice details:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to load invoice details. Please try again.',
                variant: 'destructive',
            });
        }
    };

const promptSendInvoiceEmail = async (invoice: Invoice) => {
    if (!token) {
        console.warn('No token found. Cannot prepare email.');
        toast({
            title: 'Authentication Error',
            description: 'You are not authenticated. Please log in to send emails.',
            variant: 'destructive',
        });
        return;
    }

    setInvoiceToSendEmail(invoice);
    setEmailProcessingInvoiceId(invoice.id);
    try {
        let customerEmail = invoice.customer_email;

        if (!customerEmail) {
            const customerResponse = await fetch(`${API_BASE_URL}/api/customers/${invoice.customer_id}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!customerResponse.ok) {
                const errorData = await customerResponse.json();
                throw new Error(errorData.error || `Failed to fetch customer details for ${invoice.customer_name}`);
            }
            const customerData: Customer = await customerResponse.json();
            customerEmail = customerData.email;
        }

        if (!customerEmail) {
            // New specific error for missing customer email
            throw new Error(`Customer email not found for ${invoice.customer_name}. Please add it before sending the invoice.`);
        }

        setEmailRecipient(customerEmail || '');
        setEmailSubject(`Invoice #${invoice.invoice_number} from ${userProfile?.company || 'Your Company'}`);
        setEmailBody(`Dear ${invoice.customer_name},\n\nPlease find attached your invoice (Invoice ID: #${invoice.invoice_number}).\n\nTotal amount: ${invoice.currency} ${invoice.total_amount.toFixed(2)}\nDue Date: ${new Date(invoice.due_date || '').toLocaleDateString('en-ZA')}\n\nThank you for your business!\n\nSincerely,\n${userProfile?.company || 'Your Company'}\n${userProfile?.contact_person || ''}`);
        setShowSendEmailModal(true);
    } catch (error: any) {
        console.error('Error preparing email:', error);
        toast({
            title: 'Error',
            description: error.message || 'Failed to prepare email. Please try again.',
            variant: 'destructive',
        });
    } finally {
        setEmailProcessingInvoiceId(null);
    }
};

const confirmSendInvoiceEmail = async () => {
    // This new validation block prevents the API call if required fields are missing.
    // This is the key fix that prevents the 400 Bad Request error.
    if (!invoiceToSendEmail || !emailRecipient || !emailSubject || !emailBody) {
        toast({
            title: 'Missing Information',
            description: 'Please ensure recipient email, subject, and body are filled.',
            variant: 'destructive',
        });
        return;
    }

    if (!token) {
        console.warn('No token found. Cannot send email.');
        toast({
            title: 'Authentication Error',
            description: 'You are not authenticated. Please log in to send emails.',
            variant: 'destructive',
        });
        return;
    }

    setEmailProcessingInvoiceId(invoiceToSendEmail.id);
    try {
    const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceToSendEmail.id}/send-pdf-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            customerEmail: emailRecipient, // <-- Corrected name here
            subject: emailSubject,
            body: emailBody,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invoice email.');
    }
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send invoice email.');
        }

        toast({
            title: 'Email Sent!',
            description: `Invoice #${invoiceToSendEmail.invoice_number} sent successfully to ${emailRecipient}.`,
            variant: 'default',
        });

        await handleManualStatusUpdate(invoiceToSendEmail.id, 'Sent', false);

        fetchInvoices();
        setShowSendEmailModal(false);
        setEmailRecipient('');
        setEmailSubject('');
        setEmailBody('');
        setInvoiceToSendEmail(null);
    } catch (error: any) {
        console.error('Error sending invoice email:', error);
        toast({
            title: 'Email Failed',
            description: error.message || `Failed to send invoice #${invoiceToSendEmail.invoice_number}. Please try again.`,
            variant: 'destructive',
        });
    } finally {
        setEmailProcessingInvoiceId(null);
    }
};

    // NEW FUNCTION: Manual status update, fetches full invoice before updating (similar to QuotationList)
    const handleManualStatusUpdate = useCallback(async (invoiceId: string, newStatus: Invoice['status'], showToast: boolean = true) => {
        if (!token) {
            console.warn('No token found. Cannot update status.');
            if (showToast) {
                toast({
                    title: 'Authentication Error',
                    description: 'You are not authenticated. Please log in to update invoice status.',
                    variant: 'destructive',
                });
            }
            return false;
        }

        try {
            // First, fetch the full invoice details to ensure all required fields are present
            const fetchResponse = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!fetchResponse.ok) {
                const errorData = await fetchResponse.json();
                throw new Error(errorData.error || 'Failed to fetch invoice details for status update.');
            }
            const detailedInvoice: Invoice = await fetchResponse.json();

            // Now, update the status on the fetched object
            const updatedInvoice = { ...detailedInvoice, status: newStatus };

            // Send the complete, updated invoice object
            const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(updatedInvoice), // Send the full updated object
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update invoice status.');
            }

            if (showToast) {
                toast({
                    title: 'Status Updated',
                    description: `Invoice status updated to ${newStatus}.`,
                    variant: 'default',
                });
            }
            fetchInvoices(); // Refresh the list
            return true;
        } catch (error: any) {
            console.error('Error updating invoice status:', error);
            if (showToast) {
                toast({
                    title: 'Status Update Failed',
                    description: error.message || `Failed to update status to ${newStatus}. Please try again.`,
                    variant: 'destructive',
                });
            }
            return false;
        }
    }, [fetchInvoices, toast, token]);


    // NEW FUNCTION: Handle PDF Download (copied from QuotationList)
const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
  if (!token) {
    console.warn('No token found. Cannot download PDF.');
    toast({
      title: 'Authentication Error',
      description: 'You are not authenticated. Please log in to download PDFs.',
      variant: 'destructive',
    });
    return;
  }

  setDownloadProcessingInvoiceId(invoiceId);
  try {
    // NOTE: Server expects GET /api/:documentType/:id/pdf
    // Using 'invoices' for :documentType matches your server route.
    const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/pdf`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(errText || 'Failed to download invoice PDF.');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Download Started',
      description: `Invoice #${invoiceNumber} is downloading...`,
      variant: 'default',
    });
  } catch (error: any) {
    console.error('Error downloading invoice:', error);
    toast({
      title: 'Download Failed',
      description: error.message || 'Failed to download invoice. Please try again.',
      variant: 'destructive',
    });
  } finally {
    setDownloadProcessingInvoiceId(null);
  }
};


    const confirmDeleteInvoice = (invoiceId: string) => {
        setInvoiceToDelete(invoiceId);
    };

    const handleDeleteInvoice = async () => {
        if (!invoiceToDelete) return;
        if (!token) {
            console.warn('No token found. Cannot delete invoice.');
            toast({
                title: 'Authentication Error',
                description: 'You are not authenticated. Please log in to delete invoices.',
                variant: 'destructive',
            });
            setInvoiceToDelete(null);
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/invoices/${invoiceToDelete}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Include the JWT token
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete invoice');
            }
            setInvoices(prev => prev.filter(inv => inv.id !== invoiceToDelete));
            toast({
                title: 'Invoice Deleted',
                description: 'The invoice has been successfully deleted.',
                variant: 'default',
            });
        } catch (error: any) {
            console.error('Error deleting invoice:', error);
            toast({
                title: 'Deletion Failed',
                description: error.message || 'Failed to delete invoice. Please try again.',
                variant: 'destructive',
            });
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
                        <div className='flex justify-center items-center h-40'>
                            <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                            <span className='ml-2 text-gray-600'>Loading invoice details...</span>
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
                <div className='flex justify-between items-center'>
                    <CardTitle className='flex items-center gap-2'>
                        <FileText className='h-5 w-5' />
                        Sales Invoices
                    </CardTitle>
                    <Button onClick={handleNewInvoiceClick}>
                        <Plus className='h-4 w-4 mr-2' />
                        New Invoice
                    </Button>
                </div>
            </CardHeader>
            <CardContent className='space-y-4'>
                <div className='flex items-center gap-4'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
                        <Input
                            placeholder='Search invoices by number or customer...'
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            className='pl-10'
                        />
                    </div>
                </div>

                {isLoadingList ? (
                    <div className='flex justify-center items-center h-40'>
                        <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
                        <span className='ml-2 text-gray-600'>Loading invoices...</span>
                    </div>
                ) : (
                    <div className='border rounded-lg overflow-x-auto'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Amount</TableHead>
                                    {/* Removed Status TableHead */}
                                    <TableHead className='text-left'>Actions</TableHead> {/* Adjusted alignment */}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className='text-center py-8 text-muted-foreground'> {/* Adjusted colSpan */}
                                            No invoices found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredInvoices.map(invoice => (
                                        <TableRow key={invoice.id}>
                                            <TableCell className='font-medium'>{invoice.invoice_number}</TableCell>
                                            <TableCell>{invoice.customer_name}</TableCell>
                                            <TableCell>{new Date(invoice.invoice_date).toLocaleDateString('en-ZA')}</TableCell>
                                            <TableCell>{new Date(invoice.due_date).toLocaleDateString('en-ZA')}</TableCell>
                                            <TableCell>
                                                R
                                                {(invoice.total_amount).toLocaleString('en-ZA', {
                                                    minimumFractionDigits: 2,
                                                })}
                                            </TableCell>
                                            {/* Removed Status TableCell */}
                                            <TableCell className='text-left'> {/* Adjusted alignment to left */}
                                                <div className='flex items-center gap-2'>
                                                    <Button variant='ghost' size='sm' onClick={() => handleViewInvoiceClick(invoice)}>
                                                        <Eye className='h-4 w-4' />
                                                    </Button>
                                                    <Button variant='ghost' size='sm' onClick={() => handleEditInvoiceClick(invoice)}>
                                                        <Edit className='h-4 w-4' />
                                                    </Button>

                                                    <Button
                                                        variant='ghost'
                                                        size='sm'
                                                        onClick={() => promptSendInvoiceEmail(invoice)}
                                                        disabled={isLoadingProfile || emailProcessingInvoiceId === invoice.id}
                                                    >
                                                        {emailProcessingInvoiceId === invoice.id ? (
                                                            <Loader2 className='h-4 w-4 animate-spin' />
                                                        ) : (
                                                            <Mail className='h-4 w-4' />
                                                        )}
                                                    </Button>

                                                    {/* NEW: Manual Status Dropdown Trigger now displays status and color */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            {/* Apply the status color class directly to the button */}
                                                            <Button
                                                                variant='outline'
                                                                size='sm'
                                                                className={`flex items-center gap-1 ${getStatusColor(invoice.status)}`}
                                                            >
                                                                {invoice.status.toUpperCase()} <MoreVertical className='h-4 w-4' />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align='end'>
                                                            <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Draft')}>
                                                                <FileText className='mr-2 h-4 w-4' /> Draft
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Sent')}>
                                                                <Mail className='mr-2 h-4 w-4' /> Sent
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Paid')}>
                                                                <CheckCircle className='mr-2 h-4 w-4 text-green-600' /> Paid
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleManualStatusUpdate(invoice.id, 'Overdue')}>
                                                                <XOctagon className='mr-2 h-4 w-4 text-red-600' /> Overdue
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant='ghost' size='sm' onClick={() => confirmDeleteInvoice(invoice.id)}>
                                                                <Trash2 className='h-4 w-4 text-red-500' />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to delete invoice {invoice.invoice_number}? This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleDeleteInvoice}>
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

            {/* View Invoice Details Modal (existing) */}
            <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
                <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
                    <DialogHeader>
                        <DialogTitle>Invoice Details: {selectedInvoice?.invoice_number}</DialogTitle>
                        <DialogDescription>Detailed view of the selected invoice.</DialogDescription>
                    </DialogHeader>
                    {selectedInvoice ? (
                        <div className='space-y-4 text-sm'>
                            <div className='grid grid-cols-2 gap-4'>
                                <div>
                                    <p>
                                        <strong>Customer:</strong> {selectedInvoice.customer_name}
                                    </p>
                                    {selectedInvoice.customer_email && <p><strong>Customer Email:</strong> {selectedInvoice.customer_email}</p>}
                                    <p>
                                        <strong>Invoice Date:</strong> {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-ZA')}
                                    </p>
                                    <p>
                                        <strong>Due Date:</strong> {new Date(selectedInvoice.due_date).toLocaleDateString('en-ZA')}
                                    </p>
                                </div>
                                <div>
                                    <p>
                                        <strong>Status:</strong>{' '}
                                        <Badge variant='secondary' className={getStatusColor(selectedInvoice.status)}>
                                            {selectedInvoice.status.toUpperCase()}
                                        </Badge>
                                    </p>
                                    <p>
                                        <strong>Total Amount:</strong> {selectedInvoice.currency}
                                        {(selectedInvoice.total_amount).toLocaleString('en-ZA', {
                                            minimumFractionDigits: 2,
                                        })}
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

                            <h3 className='font-semibold text-lg mt-6'>Line Items</h3>
                            {selectedInvoice.line_items && selectedInvoice.line_items.length > 0 ? (
                                <div className='border rounded-lg overflow-hidden'>
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
                                            {selectedInvoice.line_items.map(item => (
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
                                <p className='text-muted-foreground'>No line items for this invoice.</p>
                            )}
                        </div>
                    ) : (
                        <div className='flex justify-center items-center h-40 text-muted-foreground'>
                            Select an invoice to view its details.
                        </div>
                    )}
                    {/* Download Button in DialogFooter */}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsViewModalOpen(false)}
                        >
                            Close
                        </Button>
                        <Button
                            onClick={() => selectedInvoice && handleDownloadInvoice(selectedInvoice.id, selectedInvoice.invoice_number)}
                            disabled={!selectedInvoice || downloadProcessingInvoiceId === selectedInvoice?.id}
                        >
                            {downloadProcessingInvoiceId === selectedInvoice?.id ? (
                                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            ) : (
                                <Download className='h-4 w-4 mr-2' />
                            )}
                            Download PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Send Email Confirmation Modal */}
            <Dialog open={showSendEmailModal} onOpenChange={(open) => {
                setShowSendEmailModal(open);
                if (!open) {
                    setEmailRecipient('');
                    setEmailSubject('');
                    setEmailBody('');
                    setInvoiceToSendEmail(null);
                }
            }}>
                <DialogContent className='sm:max-w-[425px]'>
                    <DialogHeader>
                        <DialogTitle>Send Invoice #{invoiceToSendEmail?.invoice_number}</DialogTitle>
                        <DialogDescription>
                            Compose and send this invoice via email.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className='grid grid-cols-4 items-center gap-4'>
                            <Label htmlFor="recipient" className='text-right'>
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
                        <div className='grid grid-cols-4 items-center gap-4'>
                            <Label htmlFor="subject" className='text-right'>
                                Subject
                            </Label>
                            <Input
                                id="subject"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className='grid grid-cols-4 items-center gap-4'>
                            <Label htmlFor="body" className='text-right'>
                                Body
                            </Label>
                            <Textarea
                                id="body"
                                value={emailBody}
                                onChange={(e) => setEmailBody(e.target.value)}
                                className="col-span-3 min-h-[150px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowSendEmailModal(false)}
                            disabled={emailProcessingInvoiceId !== null}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmSendInvoiceEmail}
                            disabled={emailProcessingInvoiceId !== null || !emailRecipient || !emailSubject || !emailBody || !invoiceToSendEmail}
                        >
                            {emailProcessingInvoiceId !== null ? (
                                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            ) : (
                                <Mail className='h-4 w-4 mr-2' />
                            )}
                            Send Email
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
