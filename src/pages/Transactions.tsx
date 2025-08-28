import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Edit, Printer, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../AuthPage';

// Define an interface for your transaction data
interface Transaction {
  id: string;
  type: string;
  amount: number | string;
  description: string;
  date: string; // Stored as YYYY-MM-DD
  category: string | null;
  account_id: string | null;
  account_name: string | null;
  created_at: string;
  // Optional flag for potential duplicates
  potential_duplicate?: boolean;
}

// Interface for Account
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

const Transactions = () => {
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  const [editAccountSearchTerm, setEditAccountSearchTerm] = useState('');
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'potential'>('all');

  // --- STATE FOR MULTI-SELECT ---
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  // --- States for "Select All" checkbox ---
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectAllIndeterminate, setIsSelectAllIndeterminate] = useState(false);

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const fetchTransactions = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated.');
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let queryParams = new URLSearchParams();

    if (selectedAccountFilter !== 'all') {
      if (selectedAccountFilter === 'revenue_accounts') {
        queryParams.append('accountType', 'Revenue');
      } else {
        queryParams.append('accountId', selectedAccountFilter);
      }
    }

    if (searchTerm) {
      queryParams.append('search', searchTerm);
    }
    if (fromDate) {
      queryParams.append('fromDate', fromDate);
    }
    if (toDate) {
      queryParams.append('toDate', toDate);
    }

    try {
      const response = await fetch(`https://quantnow-cu1v.onrender.com/transactions?${queryParams.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: Transaction[] = await response.json();
      const transactionsWithDuplicatesFlag = addPotentialDuplicateFlags(data);
      setTransactions(transactionsWithDuplicatesFlag);

      // --- Clear selection when transactions change ---
      setSelectedTransactionIds(new Set());
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountFilter, searchTerm, fromDate, toDate, token]);

  const addPotentialDuplicateFlags = (transactions: Transaction[]): Transaction[] => {
    const transactionGroups: Record<string, Transaction[]> = {};

    transactions.forEach(transaction => {
      const key = `${transaction.date}_${parseFloat(transaction.amount as string).toFixed(2)}`;
      if (!transactionGroups[key]) {
        transactionGroups[key] = [];
      }
      transactionGroups[key].push(transaction);
    });

    return transactions.map(transaction => {
      const key = `${transaction.date}_${parseFloat(transaction.amount as string).toFixed(2)}`;
      const group = transactionGroups[key];
      const isPotentialDuplicate = group && group.length > 1;
      return { ...transaction, potential_duplicate: isPotentialDuplicate };
    });
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchTransactions();
    } else {
      setTransactions([]);
    }
  }, [fetchTransactions, isAuthenticated, token]);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!token) {
        console.warn('No token found for fetching accounts. User is not authenticated.');
        setAccounts([]);
        return;
      }
      try {
        // Note: Fixed extra spaces in the URL
        const response = await fetch('https://quantnow-cu1v.onrender.com/accounts', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setAccounts(data);
      } catch (error) {
        console.error('Error fetching accounts:', error);
      }
    };

    if (isAuthenticated && token) {
      fetchAccounts();
    } else {
      setAccounts([]);
    }
  }, [isAuthenticated, token]);

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditFormData({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description || '',
      date: transaction.date,
      category: transaction.category,
      account_id: transaction.account_id,
    });
    setIsEditModalOpen(true);
    setEditAccountSearchTerm('');
  };

  const handleDeleteClick = async (transactionId: string) => {
    if (!token) {
      alert('You are not authenticated. Please log in.');
      return;
    }

    if (window.confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      try {
        // Note: Fixed extra spaces in the URL
        const response = await fetch(`https://quantnow-cu1v.onrender.com/transactions/${transactionId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        alert('Transaction deleted successfully!');
        fetchTransactions(); // Refresh the list
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert(`Failed to delete transaction: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  // --- NEW: Bulk Delete Handler ---
  const handleBulkDeleteClick = async () => {
    if (!token) {
      alert('You are not authenticated. Please log in.');
      return;
    }

    const idsToDelete = Array.from(selectedTransactionIds);
    if (idsToDelete.length === 0) {
      alert('No transactions selected for deletion.');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${idsToDelete.length} transaction(s)? This action cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      try {
        setLoading(true); // Indicate processing
        const deletePromises = idsToDelete.map(id =>
          fetch(`https://quantnow-cu1v.onrender.com/transactions/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })
        );

        const responses = await Promise.all(deletePromises);
        const failedDeletes = responses.filter(res => !res.ok);

        if (failedDeletes.length > 0) {
             console.error('Some deletions failed:', failedDeletes);
             alert(`Failed to delete ${failedDeletes.length} transaction(s). Please check the console for details.`);
        } else {
             alert(`${idsToDelete.length} transaction(s) deleted successfully!`);
        }

        // Refresh the list and clear selection
        fetchTransactions();
        setSelectedTransactionIds(new Set());
      } catch (error) {
        console.error('Error during bulk deletion:', error);
        alert(`An error occurred during bulk deletion: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
         setLoading(false);
      }
    }
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSelectChange = (name: string, value: string) => {
    const finalValue = value === "NULL_CATEGORY_PLACEHOLDER" || value === "NO_ACCOUNT_PLACEHOLDER" ? null : value;
    setEditFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleUpdateSubmit = async () => {
    if (!editingTransaction) return;
    if (!token) {
      console.warn('No token found. Cannot update transaction.');
      alert('You are not authenticated. Please log in.');
      return;
    }

    const parsedAmount = parseFloat(editFormData.amount);
    if (isNaN(parsedAmount) || !editFormData.type || !editFormData.date) {
      alert('Please fill in all required fields (Type, Amount, Date).');
      return;
    }

    try {
      // Note: Endpoint URL seems unusual for an update. Typically PUT/PATCH to /transactions/{id}.
      // Assuming it's correct as per your backend.
      const response = await fetch(`https://quantnow-cu1v.onrender.com/transactions/manual`, {
        method: 'POST', // Or PUT/PATCH if that's what your backend expects
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingTransaction.id,
          type: editFormData.type,
          amount: parsedAmount,
          description: editFormData.description || null,
          date: editFormData.date,
          category: editFormData.category || null,
          account_id: editFormData.account_id || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      fetchTransactions();
      setIsEditModalOpen(false);
      setEditingTransaction(null);
      setEditFormData({});
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert(`Failed to update transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleExportCsv = () => {
    if (transactions.length === 0) {
      alert('No transactions to export.');
      return;
    }

    const headers = [
      'ID',
      'Type',
      'Amount',
      'Description',
      'Date',
      'Category',
      'Account Name',
      'Created At',
    ];

    const csvRows = transactions.map(t => [
      `"${t.id}"`,
      `"${t.type}"`,
      `${(+t.amount).toFixed(2)}`,
      `"${t.description ? t.description.replace(/"/g, '""') : ''}"`,
      `"${new Date(t.date).toLocaleDateString()}"`,
      `"${t.category || ''}"`,
      `"${t.account_name || ''}"`,
      `"${new Date(t.created_at).toLocaleString()}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'transactions.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredAccounts = useMemo(() => {
    if (!editAccountSearchTerm) {
      return accounts;
    }
    const lowerCaseSearchTerm = editAccountSearchTerm.toLowerCase();
    return accounts.filter(account =>
      account.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      account.code.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [accounts, editAccountSearchTerm]);

  // --- MODIFIED: useMemo for filteredTransactions and Select All state ---
  const { filteredTransactions, isSelectAllChecked: memoizedSelectAllChecked, isSelectAllIndeterminate: memoizedSelectAllIndeterminate } = useMemo(() => {
    let filtered = transactions;
    if (duplicateFilter === 'potential') {
      filtered = filtered.filter(t => t.potential_duplicate);
    }

    // --- Logic for Select All state based on filtered transactions ---
    const visibleIds = new Set(filtered.map(t => t.id));
    const visibleSelectedIds = Array.from(selectedTransactionIds).filter(id => visibleIds.has(id));

    let selectAllChecked = false;
    let selectAllIndeterminate = false;
    if (filtered.length > 0 && visibleSelectedIds.length === filtered.length) {
      selectAllChecked = true;
    } else if (visibleSelectedIds.length > 0) {
      selectAllIndeterminate = true; // Some, but not all, are selected
    }
    // If visibleSelectedIds.length is 0, both checked and indeterminate remain false

    return {
      filteredTransactions: filtered,
      isSelectAllChecked: selectAllChecked,
      isSelectAllIndeterminate: selectAllIndeterminate
    };
  }, [transactions, duplicateFilter, selectedTransactionIds]); // Depend on transactions, filter, and selection

  // Update the main state variables when memoized values change
  useEffect(() => {
    setIsSelectAllChecked(memoizedSelectAllChecked);
    setIsSelectAllIndeterminate(memoizedSelectAllIndeterminate);
  }, [memoizedSelectAllChecked, memoizedSelectAllIndeterminate]);

  // --- NEW: Handler for individual checkbox change ---
  const handleTransactionSelect = (transactionId: string) => {
    setSelectedTransactionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

  // --- NEW: Handler for "Select All" checkbox change ---
  const handleSelectAllChange = () => {
    if (isSelectAllChecked) {
      // If currently checked, uncheck all visible transactions
      const visibleIds = new Set(filteredTransactions.map(t => t.id));
      setSelectedTransactionIds(prev => {
        const newSet = new Set(prev);
        visibleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // If currently unchecked or indeterminate, check all visible transactions
      setSelectedTransactionIds(prev => {
        const newSet = new Set(prev);
        filteredTransactions.forEach(t => newSet.add(t.id));
        return newSet;
      });
    }
    // setIsSelectAllChecked and setIsSelectAllIndeterminate will be updated by the useEffect above
    // which reacts to changes in selectedTransactionIds and filteredTransactions
  };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='Transactions' />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className='space-y-6'
      >
        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Filters</CardTitle>
            <CardDescription>Filter transactions by account, duplicates, and date range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Label className='mb-2 block font-medium'>Filter by Account</Label>
                <Select
                  value={selectedAccountFilter}
                  onValueChange={setSelectedAccountFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    <SelectItem value="revenue_accounts">Revenue Accounts</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <Label className='mb-2 block font-medium'>Filter by Duplicates</Label>
                <Select
                  value={duplicateFilter}
                  onValueChange={(value) => setDuplicateFilter(value as 'all' | 'potential')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Show all transactions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="potential">Potential Duplicates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Date Range Filters */}
        <div className='flex flex-col md:flex-row gap-4 items-start md:items-center justify-between'>
          <div className='flex flex-col sm:flex-row gap-4 flex-1'>
            <Input
              placeholder='Search description, type, account...'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className='max-w-sm'
            />
            <div className='flex gap-2'>
              <Input
                type='date'
                placeholder='From date'
                className='max-w-40'
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
              <Input
                type='date'
                placeholder='To date'
                className='max-w-40'
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className='flex gap-2 items-center'>
            {/* --- NEW: Bulk Delete Button --- */}
            {selectedTransactionIds.size > 0 && (
              <Button
                variant='destructive'
                onClick={handleBulkDeleteClick}
                disabled={loading} // Disable while processing
              >
                <Trash2 className='h-4 w-4 mr-2' />
                Delete Selected ({selectedTransactionIds.size})
              </Button>
            )}
            <Button variant='outline' onClick={handleExportCsv}>
              <FileText className='h-4 w-4 mr-2' /> Export CSV
            </Button>
            <Button onClick={handlePrint}>
              <Printer className='h-4 w-4 mr-2' /> Print
            </Button>
          </div>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead>
                  <tr className='border-b'>
                    {/* --- NEW: Select All Checkbox Header --- */}
                    <th className='text-left p-3 w-12'>
                       <input
                         type="checkbox"
                         checked={isSelectAllChecked}
                         ref={el => {
                           if (el) {
                             // Set indeterminate state using the dedicated state variable
                             el.indeterminate = isSelectAllIndeterminate;
                           }
                         }}
                         onChange={handleSelectAllChange}
                         aria-label="Select all transactions"
                       />
                    </th>
                    <th className='text-left p-3'>Transaction Type</th>
                    <th className='text-left p-3'>Description</th>
                    <th className='text-left p-3'>Date</th>
                    <th className='text-left p-3'>Account</th>
                    <th className='text-left p-3'>Category</th>
                    <th className='text-left p-3'>Amount</th>
                    <th className='text-left p-3'>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className='text-center py-12 text-muted-foreground'> {/* Updated colspan */}
                        Loading transactions...
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className='text-center py-12 text-muted-foreground'> {/* Updated colspan */}
                        No transactions found for the selected criteria
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map(transaction => (
                      <tr
                        key={transaction.id}
                        className={`border-b last:border-b-0 hover:bg-muted/50 ${
                          transaction.potential_duplicate ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                        }`}
                      >
                        {/* --- NEW: Individual Transaction Checkbox --- */}
                        <td className='p-3'>
                          <input
                            type="checkbox"
                            checked={selectedTransactionIds.has(transaction.id)}
                            onChange={() => handleTransactionSelect(transaction.id)}
                            aria-label={`Select transaction ${transaction.description}`}
                          />
                        </td>
                        <td className='p-3'>
                          <div className="flex items-center gap-2">
                            <Badge variant={transaction.type === 'income' ? 'default' : 'secondary'}>
                              {transaction.type}
                            </Badge>
                            {transaction.potential_duplicate && (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" title="Potential Duplicate" />
                            )}
                          </div>
                        </td>
                        <td className='p-3'>{transaction.description || '-'}</td>
                        <td className='p-3'>{new Date(transaction.date).toLocaleDateString()}</td>
                        <td className='p-3'>{transaction.account_name || 'N/A'}</td>
                        <td className='p-3'>{transaction.category || '-'}</td>
                        <td className='p-3'>R{(+transaction.amount).toFixed(2)}</td>
                        <td className='p-3'>
                          <div className='flex gap-2'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => handleEditClick(transaction)}
                            >
                              <Edit className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => handleDeleteClick(transaction.id)}
                            >
                              <Trash2 className='h-4 w-4 text-red-500' />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit Transaction Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <div className='space-y-4 py-4'>
              <Label htmlFor='edit-type'>Transaction Type</Label>
              <Select
                name='type'
                value={editFormData.type || ''}
                onValueChange={value => handleEditSelectChange('type', value)}
              >
                <SelectTrigger id='edit-type'>
                  <SelectValue placeholder='Select type' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='income'>Income</SelectItem>
                  <SelectItem value='expense'>Expense</SelectItem>
                </SelectContent>
              </Select>

              <Label htmlFor='edit-amount'>Amount (R)</Label>
              <Input
                id='edit-amount'
                type='number'
                name='amount'
                value={editFormData.amount}
                onChange={handleEditFormChange}
                placeholder='Amount'
              />

              <Label htmlFor='edit-date'>Date</Label>
              <Input
                id='edit-date'
                type='date'
                name='date'
                value={editFormData.date}
                onChange={handleEditFormChange}
              />

              <Label htmlFor='edit-description'>Description</Label>
              <Input
                id='edit-description'
                type='text'
                name='description'
                value={editFormData.description}
                onChange={handleEditFormChange}
                placeholder='Description'
              />

              <Label htmlFor='edit-category'>Category</Label>
              <Select
                name='category'
                value={editFormData.category || "NULL_CATEGORY_PLACEHOLDER"}
                onValueChange={value => handleEditSelectChange('category', value)}
              >
                <SelectTrigger id='edit-category'>
                  <SelectValue placeholder='Select category (Optional)' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NULL_CATEGORY_PLACEHOLDER">None</SelectItem>
                  <SelectItem value='Trading Income'>Trading Income</SelectItem>
                  <SelectItem value='COG / Direct Costs'>COG / Direct Costs</SelectItem>
                  <SelectItem value='Non-Trading Income'>Non-Trading Income</SelectItem>
                  <SelectItem value='Business Expenses'>Business Expenses</SelectItem>
                </SelectContent>
              </Select>

              <Label htmlFor='edit-account'>Account</Label>
              <Select
                name='account_id'
                value={editFormData.account_id || "NO_ACCOUNT_PLACEHOLDER"}
                onValueChange={value => handleEditSelectChange('account_id', value)}
              >
                <SelectTrigger id='edit-account'>
                  <SelectValue placeholder='Select account' />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 sticky top-0 bg-background z-10">
                    <Input
                      placeholder="Search accounts..."
                      value={editAccountSearchTerm}
                      onChange={e => setEditAccountSearchTerm(e.target.value)}
                    />
                  </div>
                  <SelectItem value="NO_ACCOUNT_PLACEHOLDER">No Account</SelectItem>
                  {filteredAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} ({acc.code})
                    </SelectItem>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <div className="p-2 text-center text-muted-foreground text-sm">
                      No matching accounts found.
                    </div>
                  )}
                </SelectContent>
              </Select>

              <div className='flex justify-end gap-2 mt-4'>
                <Button variant='outline' onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateSubmit}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Transactions;