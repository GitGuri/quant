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
    TableRow
} from '@/components/ui/table';
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
    FileText
} from 'lucide-react';
import CustomerForm from './CustomerForm';
import { useToast } from '@/hooks/use-toast';

// --- Interfaces for CUSTOMER Data ---
interface CustomField {
    id: number;
    name: string;
    value: string;
}

interface Customer {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    gender?: string;
    dateOfBirth?: string;
    email: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    status?: 'Active' | 'Inactive';
    customFields?: CustomField[];
    totalInvoiced: number;
    numberOfPurchases: number;
    averageOrderValue: number;
    relationship?: string;
    bankAccountNumber?: string;
    bankBranchCode?: string;
    applicationDetails?: string;
}

interface CustomerSaveData {
    name: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    gender?: string;
    dateOfBirth?: string;
    email: string;
    phone?: string;
    address?: string;
    relationship?: string;
    bankAccountNumber?: string;
    bankBranchCode?: string;
    applicationDetails?: string;
    customFields?: string;
}
// --- End CUSTOMER Interfaces ---

// --- Interfaces for APPLICATION Data ---
interface FamilyMember {
    id?: string;
    application_id?: string;
    name: string;
    surname: string;
    relationship: string;
    date_of_birth: string;
}

interface ExtendedFamilyMember {
    id?: string;
    application_id?: string;
    name: string;
    surname: string;
    relationship: string;
    date_of_birth: string;
    premium: number;
}

// NOTE: The Application interface now includes firstName and lastName for compatibility
// when passing to CustomerForm, which uses these fields for the main applicant.
interface Application {
    id: string;
    name: string; // From backend
    surname: string; // From backend
    firstName: string; // Mapped for CustomerForm
    lastName: string; // Mapped for CustomerForm
    phone: string;
    email: string;
    address?: string;
    nationality?: string;
    gender?: string;
    date_of_birth?: string;
    id_number?: string;
    alt_name?: string;
    relation_to_member?: string;
    relation_dob?: string;
    family_members?: FamilyMember[];
    extended_family?: ExtendedFamilyMember[];
    plan_options?: string;
    beneficiary_name?: string;
    beneficiary_surname?: string;
    beneficiary_contact?: string;
    pay_options?: string;
    total_amount?: number;
    bank?: string;
    branch_code?: string;
    account_holder?: string;
    account_number?: string;
    deduction_date?: string;
    account_type?: string;
    commencement_date?: string;
    declaration_signature?: string;
    declaration_date?: string;
    call_time?: string;
    agent_name?: string;
    connector_name?: string;
    connector_contact?: string;
    connector_province?: string;
    team_leader?: string;
    team_contact?: string;
    team_province?: string;
}

interface ApplicationSaveData {
    name: string;
    surname: string;
    phone: string;
    email: string;
    address?: string;
    nationality?: string;
    gender?: string;
    date_of_birth?: string;
    id_number?: string;
    alt_name?: string;
    relation_to_member?: string;
    relation_dob?: string;
    family_members?: FamilyMember[];
    extended_family?: ExtendedFamilyMember[];
    plan_options?: string;
    beneficiary_name?: string;
    beneficiary_surname?: string;
    beneficiary_contact?: string;
    pay_options?: string;
    total_amount?: number;
    bank?: string;
    branch_code?: string;
    account_holder?: string;
    account_number?: string;
    deduction_date?: string;
    account_type?: string;
    commencement_date?: string;
    declaration_signature?: string;
    declaration_date?: string;
    call_time?: string;
    agent_name?: string;
    connector_name?: string;
    connector_contact?: string;
    connector_province?: string;
    team_leader?: string;
    team_contact?: string;
    team_province?: string;
}
// --- End APPLICATION Interfaces ---

// --- Define Customer Clusters & Views ---
type CustomerCluster = 'All' | 'High Value' | 'Low Value' | 'Frequent Buyer' | 'Big Spender';
type View = 'customers' | 'applications';

const CLUSTER_TABS: { value: CustomerCluster; label: string; icon: React.ReactNode }[] = [
    { value: 'All', label: 'All Customers', icon: <Users className="h-4 w-4 mr-2" /> },
    { value: 'High Value', label: 'High Value', icon: <CircleDollarSign className="h-4 w-4 mr-2" /> },
    { value: 'Low Value', label: 'Low Value', icon: <Coins className="h-4 w-4 mr-2" /> },
    { value: 'Frequent Buyer', label: 'Frequent Buyers', icon: <Repeat className="h-4 w-4 mr-2" /> },
    { value: 'Big Spender', label: 'Big Spenders', icon: <Gem className="h-4 w-4 mr-2" /> },
];
// --- End Define Customer Clusters & Views ---

export function CustomerManagement() {
    const [view, setView] = useState<View>('customers');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [currentCustomer, setCurrentCustomer] = useState<Customer | undefined>(undefined);
    const [currentApplication, setCurrentApplication] = useState<Application | undefined>(undefined);
    const [activeCluster, setActiveCluster] = useState<CustomerCluster>('All');
    const { toast } = useToast();

    const getAuthHeaders = useCallback(() => {
        const token = localStorage.getItem('token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }, []);

    // --- Fetch Data Functions ---
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = getAuthHeaders();
            const response = await fetch(`https://quantnow.onrender.com/api/customers/cluster-data`, {
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
            const mappedData = data.map(cust => ({
                ...cust,
                firstName: cust.name.split(' ')[0] || '',
                lastName: cust.name.split(' ').slice(1).join(' ') || '',
            }));
            setCustomers(mappedData);
        } catch (err) {
            console.error('Failed to fetch customers:', err);
            setError('Failed to load customers. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders]);

    const fetchApplications = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = getAuthHeaders();
            const response = await fetch(`https://quantnow.onrender.com/api/applications`, { headers });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data: Application[] = await response.json();
            // Map 'name' and 'surname' from backend to 'firstName' and 'lastName' for CustomerForm compatibility
            const mappedData = data.map(app => ({
                ...app,
                firstName: app.name, // Direct mapping, assuming name holds the first name equivalent
                lastName: app.surname, // Direct mapping, assuming surname holds the last name equivalent
            }));
            setApplications(mappedData);
        } catch (err) {
            console.error('Failed to fetch applications:', err);
            setError('Failed to load applications. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders]);

    // --- Effect Hook for Fetching Data based on View ---
    useEffect(() => {
        if (!isFormOpen) {
            if (view === 'customers') {
                fetchCustomers();
            } else {
                fetchApplications();
            }
        }
    }, [view, isFormOpen, fetchCustomers, fetchApplications]);

    // --- Form Handling Functions (Unified) ---
    const handleFormSave = async (data: Customer | Application) => {
        setLoading(true);
        let success = false;
        if (view === 'customers') {
            const customerData = data as Customer;
            const payload: CustomerSaveData = {
                name: `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim(),
                firstName: customerData.firstName || '',
                lastName: customerData.lastName || '',
                idNumber: customerData.idNumber || '',
                gender: customerData.gender,
                dateOfBirth: customerData.dateOfBirth,
                email: customerData.email,
                phone: customerData.phone,
                address: customerData.address,
                relationship: customerData.relationship,
                bankAccountNumber: customerData.bankAccountNumber,
                bankBranchCode: customerData.bankBranchCode,
                applicationDetails: customerData.applicationDetails,
                customFields: JSON.stringify(customerData.customFields?.filter(f => f.name.trim() !== '') || []),
            };
            if (currentCustomer) {
                success = await handleUpdateCustomer(currentCustomer.id, payload);
            } else {
                success = await handleCreateCustomer(payload);
            }
        } else { // view === 'applications'
            const applicationData = data as Application;
            // Map firstName/lastName from CustomerForm back to name/surname for ApplicationSaveData
            const payload: ApplicationSaveData = {
                name: applicationData.firstName, // Map from CustomerForm's firstName
                surname: applicationData.lastName, // Map from CustomerForm's lastName
                phone: applicationData.phone,
                email: applicationData.email,
                address: applicationData.address,
                nationality: applicationData.nationality,
                gender: applicationData.gender,
                date_of_birth: applicationData.date_of_birth,
                id_number: applicationData.id_number,
                alt_name: applicationData.alt_name,
                relation_to_member: applicationData.relation_to_member,
                gen_date_of_birth: applicationData.relation_dob, // Renamed to avoid clash, assuming this is relation_dob
                family_members: applicationData.family_members,
                extended_family: applicationData.extended_family,
                plan_options: applicationData.plan_options,
                beneficiary_name: applicationData.beneficiary_name,
                beneficiary_surname: applicationData.beneficiary_surname,
                beneficiary_contact: applicationData.beneficiary_contact,
                pay_options: applicationData.pay_options,
                total_amount: applicationData.total_amount,
                bank: applicationData.bank,
                branch_code: applicationData.branch_code,
                account_holder: applicationData.account_holder,
                account_number: applicationData.account_number,
                deduction_date: applicationData.deduction_date,
                account_type: applicationData.account_type,
                commencement_date: applicationData.commencement_date,
                declaration_signature: applicationData.declaration_signature,
                declaration_date: applicationData.declaration_date,
                call_time: applicationData.call_time,
                agent_name: applicationData.agent_name,
                connector_name: applicationData.connector_name,
                connector_contact: applicationData.connector_contact,
                connector_province: applicationData.connector_province,
                team_leader: applicationData.team_leader,
                team_contact: applicationData.team_contact,
                team_province: applicationData.team_province,
            };

            if (currentApplication) {
                success = await handleUpdateApplication(currentApplication.id, payload);
            } else {
                success = await handleCreateApplication(payload);
            }
        }

        setLoading(false);
        if (success) {
            setIsFormOpen(false);
            setCurrentCustomer(undefined);
            setCurrentApplication(undefined);
        }
    };

    const handleCreateCustomer = async (payload: CustomerSaveData): Promise<boolean> => {
        try {
            const response = await fetch('https://quantnow.onrender.com/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload)
            });
            if (!response.ok) { throw new Error('Failed to create customer.'); }
            toast({ title: 'Success', description: 'Customer created successfully.' });
            return true;
        } catch (err) {
            toast({ title: 'Error', description: `Failed to create customer: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
            return false;
        }
    };

    const handleUpdateCustomer = async (id: string, payload: CustomerSaveData): Promise<boolean> => {
        try {
            const response = await fetch(`https://quantnow.onrender.com/api/customers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload)
            });
            if (!response.ok) { throw new Error('Failed to update customer.'); }
            toast({ title: 'Success', description: 'Customer updated successfully.' });
            return true;
        } catch (err) {
            toast({ title: 'Error', description: `Failed to update customer: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
            return false;
        }
    };

    const handleCreateApplication = async (payload: ApplicationSaveData): Promise<boolean> => {
        try {
            const response = await fetch('https://quantnow.onrender.com/api/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload)
            });
            if (!response.ok) { throw new Error('Failed to create application.'); }
            toast({ title: 'Success', description: 'Application created successfully.' });
            return true;
        } catch (err) {
            toast({ title: 'Error', description: `Failed to create application: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
            return false;
        }
    };

    const handleUpdateApplication = async (id: string, payload: ApplicationSaveData): Promise<boolean> => {
        try {
            const response = await fetch(`https://quantnow.onrender.com/api/applications/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload)
            });
            if (!response.ok) { throw new Error('Failed to update application.'); }
            toast({ title: 'Success', description: 'Application updated successfully.' });
            return true;
        } catch (err) {
            toast({ title: 'Error', description: `Failed to update application: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
            return false;
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        setLoading(true);
        try {
            const response = await fetch(`https://quantnow.onrender.com/api/customers/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (!response.ok) { throw new Error('Failed to delete customer.'); }
            toast({ title: 'Success', description: 'Customer deleted successfully.' });
            await fetchCustomers();
        } catch (err) {
            toast({ title: 'Error', description: `Failed to delete customer: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteApplication = async (id: string) => {
        setLoading(true);
        try {
            const response = await fetch(`https://quantnow.onrender.com/api/applications/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (!response.ok) { throw new Error('Failed to delete application.'); }
            toast({ title: 'Success', description: 'Application deleted successfully.' });
            await fetchApplications();
        } catch (err) {
            toast({ title: 'Error', description: `Failed to delete application: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleNew = () => {
        setCurrentCustomer(undefined);
        setCurrentApplication(undefined);
        setIsFormOpen(true);
    };

    const handleEditCustomer = (customer: Customer) => {
        setCurrentCustomer(customer);
        setIsFormOpen(true);
    };

    const handleEditApplication = (application: Application) => {
        // Map backend 'name' and 'surname' to 'firstName' and 'lastName' for CustomerForm
        setCurrentApplication({
            ...application,
            firstName: application.name,
            lastName: application.surname,
        });
        setIsFormOpen(true);
    };

    const handleFormCancel = () => {
        setIsFormOpen(false);
        setCurrentCustomer(undefined);
        setCurrentApplication(undefined);
    };

    // --- Filtering and Rendering Logic ---
    const filterCustomersByCluster = useCallback((cluster: CustomerCluster): Customer[] => {
        if (cluster === 'All') { return customers; }
        return customers.filter(customer => {
            const totalInvoiced = customer.totalInvoiced ?? 0;
            const numberOfPurchases = customer.numberOfPurchases ?? 0;
            const averageOrderValue = customer.averageOrderValue ?? 0;

            switch (cluster) {
                case 'High Value': return totalInvoiced > 1000;
                case 'Low Value': return totalInvoiced <= 500;
                case 'Frequent Buyer': return numberOfPurchases > 5;
                case 'Big Spender': return averageOrderValue > 200;
                default: return true;
            }
        });
    }, [customers]);

    const filteredCustomers = filterCustomersByCluster(activeCluster).filter(
        customer =>
            (customer.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.lastName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (customer.phone && customer.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (customer.idNumber && customer.idNumber.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredApplications = applications.filter(
        app =>
            app.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.surname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (app.id_number && app.id_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // --- Conditional Form Rendering ---
    if (isFormOpen) {
        // The CustomerForm is now generic enough to handle both customer and application data
        // We pass 'application' prop if it's an application, otherwise 'customer'
        return (
            <CustomerForm
                application={view === 'applications' ? currentApplication : undefined}
                customer={view === 'customers' ? currentCustomer : undefined}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
            />
        );
    }

    // --- Main View Rendering ---
    return (
        <Card className='w-full'>
            <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2'>
                <CardTitle className='text-xl font-medium'>
                    {view === 'customers' ? 'Customer Management' : 'Application Management'}
                </CardTitle>
                <div className='flex items-center space-x-2'>
                    <Input
                        placeholder={view === 'customers' ? 'Search customers...' : 'Search applications...'}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className='max-w-sm rounded-md'
                    />
                    <Button onClick={handleNew} className='rounded-md'>
                        <Plus className='mr-2 h-4 w-4' /> New {view === 'customers' ? 'Customer' : 'Application'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* --- View Switcher Tabs --- */}
                <Tabs value={view} onValueChange={(value) => setView(value as View)} className="w-full mb-4">
                    <TabsList className="grid w-full grid-cols-2 rounded-md">
                        <TabsTrigger value="customers" className="flex items-center justify-center rounded-md">
                            <Users className="h-4 w-4 mr-2" /> Customers
                        </TabsTrigger>
                        <TabsTrigger value="applications" className="flex items-center justify-center rounded-md">
                            <FileText className="h-4 w-4 mr-2" /> Applications
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                
                {loading ? (
                    <div className='flex justify-center items-center h-40'>
                        <Loader2 className='h-8 w-8 animate-spin' />
                    </div>
                ) : error ? (
                    <div className='text-red-500 text-center py-4'>{error}</div>
                ) : (
                    <div className='overflow-x-auto'>
                        {view === 'customers' ? (
                            // --- Customers Table ---
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>ID Number</TableHead>
                                        <TableHead className="text-right">Total Invoiced (R)</TableHead>
                                        <TableHead className="text-right">Purchases</TableHead>
                                        <TableHead className="text-right">Avg Order (R)</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className='text-right'>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredCustomers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className='text-center'>No customers found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredCustomers.map(customer => (
                                            <TableRow key={customer.id}>
                                                <TableCell className='font-medium'>{`${customer.firstName} ${customer.lastName}`}</TableCell>
                                                <TableCell>{customer.email}</TableCell>
                                                <TableCell>{customer.phone || 'N/A'}</TableCell>
                                                <TableCell>{customer.idNumber || 'N/A'}</TableCell>
                                                <TableCell className="text-right">R{customer.totalInvoiced.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{customer.numberOfPurchases}</TableCell>
                                                <TableCell className="text-right">R{customer.averageOrderValue.toFixed(2)}</TableCell>
                                                <TableCell><Badge variant={customer.status === 'Active' ? 'default' : 'secondary'}>{customer.status || 'N/A'}</Badge></TableCell>
                                                <TableCell className='text-right'>
                                                    <div className='flex justify-end space-x-2'>
                                                        <Button variant='ghost' size='sm' onClick={() => handleEditCustomer(customer)}><Edit className='h-4 w-4' /></Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild><Button variant='ghost' size='sm'><Trash2 className='h-4 w-4' /></Button></AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                                                    <AlertDialogDescription>Are you sure you want to delete {customer.firstName} {customer.lastName}? This action cannot be undone.</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id)}>Delete</AlertDialogAction>
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
                        ) : (
                            // --- Applications Table ---
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>ID Number</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className='text-right'>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredApplications.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className='text-center'>No applications found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredApplications.map(app => (
                                            <TableRow key={app.id}>
                                                <TableCell className='font-medium'>{`${app.name} ${app.surname}`}</TableCell>
                                                <TableCell>{app.email}</TableCell>
                                                <TableCell>{app.phone}</TableCell>
                                                <TableCell>{app.id_number || 'N/A'}</TableCell>
                                                <TableCell><Badge>{app.status || 'Active'}</Badge></TableCell>
                                                <TableCell className='text-right'>
                                                    <div className='flex justify-end space-x-2'>
                                                        <Button variant='ghost' size='sm' onClick={() => handleEditApplication(app)}><Edit className='h-4 w-4' /></Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild><Button variant='ghost' size='sm'><Trash2 className='h-4 w-4' /></Button></AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete Application</AlertDialogTitle>
                                                                    <AlertDialogDescription>Are you sure you want to delete {app.name} {app.surname}'s application? This action cannot be undone.</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteApplication(app.id)}>Delete</AlertDialogAction>
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
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}