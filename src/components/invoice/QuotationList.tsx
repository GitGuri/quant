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
  FileText, // For download PDF
  ArrowRight,
  Trash2,
  Loader2,
  Mail, // For email sending
  Download, // For direct download button
  CheckCircle, // For Accepted status
  XOctagon, // For Declined status
  Clock, // For Expired status
  MoreVertical // For dropdown menu trigger
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter, // For action buttons in dialog
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
import { Textarea } from '@/components/ui/textarea'; // For email body
import { Label } from '@/components/ui/label'; // For form labels
import { QuotationForm } from './QuotationForm'; // Corrected import path (assuming it's in the same directory now)
import { useToast } from '@/components/ui/use-toast'; // Import useToast
import { useAuth } from '../../AuthPage'; // Corrected import path for useAuth
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // Import DropdownMenu components


// Define API Base URL
const API_BASE_URL = 'https://quantnow.onrender.com';

// --- Interfaces to match backend API responses for Quotations ---
interface QuotationLineItem {
  id?: string; // Optional for new items
  product_service_id: string | null;
  product_service_name?: string; // For display
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
}

export interface Quotation { // Exported for potential use in other components like InvoicePreview
  id: string;
  quotation_number: string;
  customer_id: string;
  customer_name: string; // From JOIN in backend
  customer_email?: string; // Assuming you might fetch customer email for pre-filling
  quotation_date: string;
  expiry_date: string | null; // Can be null
  total_amount: number; // Ensure this is a number after parsing from DB
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Expired' | 'Invoiced'; // Match backend enum/status, added 'Invoiced'
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: QuotationLineItem[]; // Only present when fetching single quotation
}

interface Customer {
  id: string;
  name: string;
  email: string; // Added email for pre-filling
}

// --- NEW: User Profile Interface ---
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
  // Add other fields you might need from the profile
}


// --- QuotationList Component ---
export function QuotationList() {
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuotationForm, setShowQuotationForm] = useState(false); // Controls full-screen form visibility
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); // For View details (still a modal)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null); // For editing, viewing, or emailing
  const [quotationToDelete, setQuotationToDelete] = useState<string | null>(null); // State for AlertDialog deletion confirmation
  const [isLoadingList, setIsLoadingList] = useState(true); // Loading state for the quotation list
  const [isFormLoading, setIsFormLoading] = useState(false); // New: Loading state for the form details
  const [isConverting, setIsConverting] = useState(false); // New: Loading state for conversion
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // NEW: State for user profile
  const [isLoadingProfile, setIsLoadingProfile] = useState(false); // NEW: Loading state for profile

  // States for Email functionality (aligned with InvoiceList)
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [quotationToSendEmail, setQuotationToSendEmail] = useState<Quotation | null>(null);
  const [emailProcessingQuotationId, setEmailProcessingQuotationId] = useState<string | null>(null);


  // States for Download functionality
  const [downloadProcessingQuotationId, setDownloadProcessingQuotationId] = useState<string | null>(null);

  const { isAuthenticated } = useAuth(); // Get authentication status
  const token = localStorage.getItem('token'); // Retrieve the token


  // NEW: Function to fetch user profile (Company details for PDF/Email)
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

  // Function to fetch quotations from the backend
  const fetchQuotations = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated for quotations.');
      setQuotations([]);
      setIsLoadingList(false);
      return;
    }

    setIsLoadingList(true); // Start loading
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch quotations');
      }
      const data: Quotation[] = await response.json();
      setQuotations(data.map(quo => ({
        ...quo,
        total_amount: parseFloat(quo.total_amount as any) || 0,
        quotation_date: new Date(quo.quotation_date).toISOString().split('T')[0],
        expiry_date: quo.expiry_date ? new Date(quo.expiry_date).toISOString().split('T')[0] : null,
      })));
    } catch (error: any) {
      console.error('Error fetching quotations:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load quotations. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingList(false); // End loading
    }
  }, [toast, token]); // Add token to dependencies

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchQuotations();
      fetchUserProfile(); // NEW: Fetch profile on mount
    } else {
      setQuotations([]);
      setUserProfile(null); // Clear profile if not authenticated
      setIsLoadingList(false);
      setIsLoadingProfile(false); // Also reset profile loading
    }
  }, [fetchQuotations, fetchUserProfile, isAuthenticated, token]); // Add isAuthenticated and token to dependencies

  // NEW useEffect for automatic "Expired" status check
  useEffect(() => {
    const checkExpiryDates = async () => {
      if (!isAuthenticated || !token) return;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Normalize to start of day

      for (const quotation of quotations) {
        if (quotation.expiry_date) {
          const expiry = new Date(quotation.expiry_date);
          const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()); // Normalize to start of day

          // If expired and not already 'Accepted', 'Declined', or 'Invoiced'
          if (
            expiryDay < today &&
            quotation.status !== 'Expired' &&
            quotation.status !== 'Accepted' &&
            quotation.status !== 'Declined' &&
            quotation.status !== 'Invoiced'
          ) {
            console.log(`Quotation ${quotation.quotation_number} has expired. Updating status...`);
            await handleManualStatusUpdate(quotation.id, 'Expired', false); // Update without showing toast
          }
        }
      }
    };

    // Run once on load and then perhaps periodically, or only when quotations change
    const timer = setTimeout(checkExpiryDates, 5000); // Debounce or run after initial fetch
    // Clear timeout if component unmounts or quotations array changes before it fires
    return () => clearTimeout(timer);

  }, [quotations, isAuthenticated, token]); // Re-run when quotations or auth state changes


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

  const filteredQuotations = quotations.filter(
    quotation =>
      quotation.status !== 'Invoiced' && // Exclude 'Invoiced' quotations from the main list
      (quotation.quotation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quotation.customer_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleNewQuotationClick = () => {
    setSelectedQuotation(null);
    setShowQuotationForm(true);
  };

  const handleEditQuotationClick = async (quotation: Quotation) => {
    if (!token) {
      console.warn('No token found. Cannot edit quotation.');
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to edit quotations.',
        variant: 'destructive',
      });
      return;
    }

    setIsFormLoading(true);
    setShowQuotationForm(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch quotation details for editing.');
      }
      const detailedQuotation: Quotation = await response.json();
      detailedQuotation.total_amount = parseFloat(detailedQuotation.total_amount as any) || 0;
      detailedQuotation.line_items = detailedQuotation.line_items?.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity as any) || 0,
        unit_price: parseFloat(item.unit_price as any) || 0,
        line_total: parseFloat(item.line_total as any) || 0,
        tax_rate: parseFloat(item.tax_rate as any) || 0,
      })) || [];

      setSelectedQuotation(detailedQuotation);
    } catch (error: any) {
      console.error('Error fetching quotation details for edit:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load quotation details for editing. Please try again.',
        variant: 'destructive',
      });
      setShowQuotationForm(false);
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleViewQuotationClick = async (quotation: Quotation) => {
    if (!token) {
      console.warn('No token found. Cannot view quotation.');
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to view quotations.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch quotation details');
      }
      const detailedQuotation: Quotation = await response.json();
      detailedQuotation.total_amount = parseFloat(detailedQuotation.total_amount as any) || 0;
      detailedQuotation.line_items = detailedQuotation.line_items?.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity as any) || 0,
        unit_price: parseFloat(item.unit_price as any) || 0,
        line_total: parseFloat(item.line_total as any) || 0,
        tax_rate: parseFloat(item.tax_rate as any) || 0,
      })) || [];

      setSelectedQuotation(detailedQuotation);
      setIsViewModalOpen(true);
    } catch (error: any) {
      console.error('Error fetching quotation details:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load quotation details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // --- UPDATED: Handle PDF Download to generate Quotation PDF from server-side ---
  const handleDownloadPdf = async (quotationId: string, quotationNumber: string) => {
    if (!token) {
      console.warn('No token found. Cannot download PDF.');
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to download PDFs.',
        variant: 'destructive',
      });
      return;
    }

    setDownloadProcessingQuotationId(quotationId); // Set the ID for the download process
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}/pdf`, { // Corrected endpoint
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation_${quotationNumber}.pdf`; // Dynamic filename
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url); // Clean up the URL

      toast({
        title: 'Download Started',
        description: `Quotation #${quotationNumber} is downloading...`,
        variant: 'default',
      });

    } catch (error: any) {
      console.error('Error downloading quotation PDF:', error);
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to download quotation PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
        setDownloadProcessingQuotationId(null); // Clear the specific ID after download attempt
    }
  };


  const handleDeleteQuotationClick = (quotationId: string) => {
    setQuotationToDelete(quotationId);
  };

  // This is the actual deletion logic, now named `handleDeleteQuotation`
  const handleDeleteQuotation = useCallback(async () => {
    if (!quotationToDelete) return;

    if (!token) {
      console.warn('No token found. Cannot delete quotation.');
      toast({
        title: 'Authentication Error',
        description: 'You are not authenticated. Please log in to delete quotations.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoadingList(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete quotation');
      }

      toast({
        title: 'Quotation Deleted',
        description: 'The quotation has been successfully deleted.',
      });
      fetchQuotations(); // Refresh the list
    } catch (error: any) {
      console.error('Error deleting quotation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete quotation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setQuotationToDelete(null);
      setIsLoadingList(false);
    }
  }, [quotationToDelete, fetchQuotations, toast, token]);


  const handleSendEmailClick = (quotation: Quotation) => {
    setQuotationToSendEmail(quotation); // Set the quotation for the email modal
    setEmailRecipient(quotation.customer_email || ''); // Pre-fill with customer's email
    setEmailSubject(`Quotation #${quotation.quotation_number} from ${userProfile?.company || 'Your Company'}`);
    setEmailBody(`Dear ${quotation.customer_name},\n\nPlease find attached your quotation (Quotation ID: #${quotation.quotation_number}).\n\nTotal amount: ${quotation.currency} ${quotation.total_amount.toFixed(2)}\nExpiry Date: ${new Date(quotation.expiry_date || '').toLocaleDateString('en-ZA')}\n\nThank you for your business!\n\nSincerely,\n${userProfile?.company || 'Your Company'}\n${userProfile?.contact_person || ''}`); // Pre-fill email body
    setShowSendEmailModal(true);
  };

  const confirmSendQuotationEmail = useCallback(async () => {
    if (!quotationToSendEmail || !emailRecipient || !emailSubject || !emailBody) {
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

    setEmailProcessingQuotationId(quotationToSendEmail.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationToSendEmail.id}/send-pdf-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientEmail: emailRecipient,
          subject: emailSubject,
          body: emailBody,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email.');
      }

      toast({
        title: 'Email Sent',
        description: `Quotation #${quotationToSendEmail.quotation_number} email sent successfully to ${emailRecipient}.`,
      });

      // Automatically update status to 'Sent' after successful email
      await handleManualStatusUpdate(quotationToSendEmail.id, 'Sent', false); // Update without showing toast again

      setShowSendEmailModal(false);
      setEmailRecipient('');
      setEmailSubject('');
      setEmailBody('');
      fetchQuotations(); // Refresh quotations to update status if changed
    } catch (error: any) {
      console.error('Error sending quotation email:', error);
      toast({
        title: 'Email Send Error',
        description: error.message || 'Failed to send quotation email. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setEmailProcessingQuotationId(null);
    }
  }, [quotationToSendEmail, emailRecipient, emailSubject, emailBody, fetchQuotations, toast, token, userProfile?.company, userProfile?.contact_person]);

    // NEW: Function to manually update quotation status
    const handleManualStatusUpdate = useCallback(async (quotationId: string, newStatus: Quotation['status'], showToast: boolean = true) => {
        if (!token) {
            console.warn('No token found. Cannot update status.');
            if (showToast) {
                toast({
                    title: 'Authentication Error',
                    description: 'You are not authenticated. Please log in to update quotation status.',
                    variant: 'destructive',
                });
            }
            return false; // Indicate failure
        }

        try {
            // First, fetch the full quotation details to ensure all required fields are present
            const fetchResponse = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!fetchResponse.ok) {
                const errorData = await fetchResponse.json();
                throw new Error(errorData.error || 'Failed to fetch quotation details for status update.');
            }
            const detailedQuotation: Quotation = await fetchResponse.json();

            // Now, update the status on the fetched object
            const updatedQuotation = { ...detailedQuotation, status: newStatus };

            // Send the complete, updated quotation object
            const response = await fetch(`${API_BASE_URL}/api/quotations/${quotationId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(updatedQuotation), // Send the full updated object
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update quotation status.');
            }

            if (showToast) {
                toast({
                    title: 'Status Updated',
                    description: `Quotation status updated to ${newStatus}.`,
                    variant: 'default',
                });
            }
            fetchQuotations(); // Refresh the list
            return true; // Indicate success
        } catch (error: any) {
            console.error('Error updating quotation status:', error);
            if (showToast) {
                toast({
                    title: 'Status Update Failed',
                    description: error.message || `Failed to update status to ${newStatus}. Please try again.`,
                    variant: 'destructive',
                });
            }
            return false; // Indicate failure
        }
    }, [fetchQuotations, toast, token]);


  const handleConvertQuotationToInvoice = useCallback(async (quotation: Quotation) => {
    if (quotation.status !== 'Accepted') {
      toast({
        title: 'Conversion Not Allowed',
        description: 'Only accepted quotations can be converted to invoices.',
        variant: 'destructive',
      });
      return;
    }
    if (!token) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to convert quotations to invoices.',
        variant: 'destructive',
      });
      return;
    }

    setIsConverting(true); // Start conversion loading

    try {
      // Fetch the detailed quotation, including line items, before conversion
      const response = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch detailed quotation for conversion.');
      }
      const detailedQuotation: Quotation = await response.json();

      console.log('Detailed Quotation fetched for conversion:', detailedQuotation);

      if (!detailedQuotation.line_items || detailedQuotation.line_items.length === 0) {
        throw new Error('Quotation has no line items to convert to an invoice.');
      }

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

      interface InvoiceLineItemForConversion {
        product_service_id: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        tax_rate: number;
      }

      interface NewInvoicePayload {
        invoice_number: string;
        customer_id: string; // Assuming customer_id is not null after check
        invoice_date: string;
        due_date: string;
        total_amount: number;
        status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
        currency: string;
        notes: string | null;
        line_items: InvoiceLineItemForConversion[];
      }

      const invoicePayload: NewInvoicePayload = {
        invoice_number: newInvoiceNumber,
        customer_id: detailedQuotation.customer_id, // This should be a string, check if it's null
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        total_amount: detailedQuotation.total_amount,
        status: 'Draft',
        currency: detailedQuotation.currency,
        notes: `Converted from Quotation ${detailedQuotation.quotation_number}. ${detailedQuotation.notes || ''}`.trim(),
        line_items: detailedQuotation.line_items.map(item => ({
          product_service_id: item.product_service_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          tax_rate: item.tax_rate,
        })),
      };

      console.log('Invoice Payload being sent:', invoicePayload);

      const createInvoiceResponse = await fetch(`${API_BASE_URL}/api/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
        body: JSON.stringify(invoicePayload),
      });

      if (!createInvoiceResponse.ok) {
        const errorData = await createInvoiceResponse.json();
        throw new Error(errorData.error || 'Failed to create invoice from quotation.');
      }

      // After successful invoice creation, update the quotation status
      const updateQuotationStatusResponse = await fetch(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the JWT token
        },
        // Only send the status to be updated, not the entire object if your backend handles partial updates
        body: JSON.stringify({ status: 'Invoiced' }),
      });

      if (!updateQuotationStatusResponse.ok) {
        const errorData = await updateQuotationStatusResponse.json();
        console.warn(`Failed to update quotation status after conversion: ${errorData.error || 'Unknown error'}`);
        // Decide if you want to throw an error here or just log a warning
      }

      toast({
        title: 'Conversion Successful',
        description: `Quotation ${quotation.quotation_number} converted to Invoice ${newInvoiceNumber}.`,
        variant: 'default',
      });
      fetchQuotations(); // Refresh the quotations list to reflect status change
    } catch (error: any) {
      console.error('Error converting quotation to invoice:', error);
      toast({
        title: 'Conversion Failed',
        description: error.message || 'Failed to convert quotation to invoice. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
    }
  }, [fetchQuotations, toast, token]);


  const handleFormSubmitSuccess = () => {
    setShowQuotationForm(false);
    fetchQuotations(); // Refresh list after form submission
  };

  if (showQuotationForm) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {selectedQuotation ? 'Edit Quotation' : 'Create New Quotation'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {selectedQuotation
              ? `Editing quotation ${selectedQuotation.quotation_number}.`
              : 'Fill in the details to create a new sales quotation.'}
          </p>
          {isFormLoading ? (
            <div className='flex justify-center items-center h-40'>
              <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
              <span className='ml-2 text-gray-600'>Loading quotation details...</span>
            </div>
          ) : (
            <QuotationForm
              quotation={selectedQuotation}
              onClose={() => setShowQuotationForm(false)}
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
            Quotations
          </CardTitle>
          <Button onClick={handleNewQuotationClick}>
            <Plus className='h-4 w-4 mr-2' />
            New Quotation
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-4'> {/* Use flex-1 for search input to take available space */}
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search quotations by number or customer...'
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className='pl-10'
            />
          </div>
        </div>

        {isLoadingList ? (
          <div className='flex justify-center items-center h-40'>
            <Loader2 className='h-8 w-8 animate-spin text-gray-500' />
            <span className='ml-2 text-gray-600'>Loading quotations...</span>
          </div>
        ) : (
          <div className='border rounded-lg overflow-x-auto'> {/* Add border and rounded-lg for table container */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Amount</TableHead>
                  {/* Removed Status TableHead */}
                  <TableHead className='text-left'>Actions</TableHead> {/* Adjusted alignment */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className='text-center py-8 text-muted-foreground'> {/* Adjusted colSpan */}
                            No quotations found.
                        </TableCell>
                    </TableRow>
                ) : (
                  filteredQuotations.map(quotation => (
                    <TableRow key={quotation.id}>
                      <TableCell className='font-medium'>{quotation.quotation_number}</TableCell>
                      <TableCell>{quotation.customer_name}</TableCell>
                      <TableCell>{new Date(quotation.quotation_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell>{quotation.expiry_date ? new Date(quotation.expiry_date).toLocaleDateString('en-ZA') : 'N/A'}</TableCell>
                      <TableCell>
                        R
                        {(quotation.total_amount).toLocaleString('en-ZA', {
                            minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      {/* Removed Status TableCell */}
                      <TableCell className='text-left'> {/* Adjusted alignment to left */}
                        <div className='flex items-center gap-2'> {/* Keep actions left-aligned within the cell */}
                          <Button variant='ghost' size='sm' onClick={() => handleViewQuotationClick(quotation)}>
                            <Eye className='h-4 w-4' />
                          </Button>
                          <Button variant='ghost' size='sm' onClick={() => handleEditQuotationClick(quotation)}>
                            <Edit className='h-4 w-4' />
                          </Button>

                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleSendEmailClick(quotation)}
                            disabled={isLoadingProfile || emailProcessingQuotationId === quotation.id}
                          >
                            {emailProcessingQuotationId === quotation.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <Mail className='h-4 w-4' />}
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleConvertQuotationToInvoice(quotation)}
                            disabled={isConverting || quotation.status !== 'Accepted'}
                          >
                            {isConverting ? <Loader2 className='h-4 w-4 animate-spin' /> : <ArrowRight className='h-4 w-4' />}
                          </Button>

                           {/* UPDATED: Manual Status Dropdown Trigger now displays status and color */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {/* Apply the status color class directly to the button */}
                              <Button
                                variant='outline'
                                size='sm'
                                className={`flex items-center gap-1 ${getStatusColor(quotation.status)}`}
                              >
                                {quotation.status.toUpperCase()} <MoreVertical className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Draft')}>
                                <FileText className='mr-2 h-4 w-4' /> Draft
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Sent')}>
                                <Mail className='mr-2 h-4 w-4' /> Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Accepted')}>
                                <CheckCircle className='mr-2 h-4 w-4 text-green-600' /> Accepted
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Declined')}>
                                <XOctagon className='mr-2 h-4 w-4 text-red-600' /> Declined
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManualStatusUpdate(quotation.id, 'Expired')}>
                                <Clock className='mr-2 h-4 w-4 text-orange-600' /> Expired
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant='ghost' size='sm' onClick={() => handleDeleteQuotationClick(quotation.id)}>
                                <Trash2 className='h-4 w-4 text-red-500' />
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

      {/* View Quotation Modal (aligned with InvoiceList) */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Quotation Details: {selectedQuotation?.quotation_number}</DialogTitle>
            <DialogDescription>Detailed view of the selected quotation.</DialogDescription>
          </DialogHeader>
          {selectedQuotation ? (
            <div className='space-y-4 text-sm'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <p>
                    <strong>Customer:</strong> {selectedQuotation.customer_name}
                  </p>
                  {selectedQuotation.customer_email && <p><strong>Customer Email:</strong> {selectedQuotation.customer_email}</p>}
                  <p>
                    <strong>Quotation Date:</strong> {new Date(selectedQuotation.quotation_date).toLocaleDateString('en-ZA')}
                  </p>
                  <p>
                    <strong>Expiry Date:</strong> {selectedQuotation.expiry_date ? new Date(selectedQuotation.expiry_date).toLocaleDateString('en-ZA') : 'N/A'}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Status:</strong>{' '}
                    <Badge variant='secondary' className={getStatusColor(selectedQuotation.status)}>
                      {selectedQuotation.status.toUpperCase()}
                    </Badge>
                  </p>
                  <p>
                    <strong>Total Amount:</strong> {selectedQuotation.currency}
                    {(selectedQuotation.total_amount).toLocaleString('en-ZA', {
                        minimumFractionDigits: 2,
                    })}
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

              <h3 className='font-semibold text-lg mt-6'>Line Items</h3>
              {selectedQuotation.line_items && selectedQuotation.line_items.length > 0 ? (
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
                      {selectedQuotation.line_items.map(item => (
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
                <p className='text-muted-foreground'>No line items for this quotation.</p>
              )}
            </div>
          ) : (
            <div className='flex justify-center items-center h-40 text-muted-foreground'>
              Select a quotation to view its details.
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
              onClick={() => selectedQuotation && handleDownloadPdf(selectedQuotation.id, selectedQuotation.quotation_number)}
              disabled={!selectedQuotation || downloadProcessingQuotationId === selectedQuotation?.id}
            >
              {downloadProcessingQuotationId === selectedQuotation?.id ? (
                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
              ) : (
                  <Download className='h-4 w-4 mr-2' />
              )}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Confirmation Modal (aligned with InvoiceList) */}
      <Dialog open={showSendEmailModal} onOpenChange={(open) => {
          setShowSendEmailModal(open);
          if (!open) {
              setEmailRecipient('');
              setEmailSubject('');
              setEmailBody('');
              setQuotationToSendEmail(null);
          }
      }}>
          <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                  <DialogTitle>Send Quotation #{quotationToSendEmail?.quotation_number}</DialogTitle>
                  <DialogDescription>
                      Compose and send this quotation via email.
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
                      disabled={emailProcessingQuotationId !== null}
                  >
                      Cancel
                  </Button>
                  <Button
                      onClick={confirmSendQuotationEmail}
                      disabled={emailProcessingQuotationId !== null || !emailRecipient || !emailSubject || !emailBody || !quotationToSendEmail}
                  >
                      {emailProcessingQuotationId !== null ? (
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
