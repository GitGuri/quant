import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Building, CreditCard, Calculator, Play } from 'lucide-react';
import { useAuth } from '../AuthPage';

const API_BASE = 'https://quantnow-cu1v.onrender.com';

// Types
interface Asset { /* unchanged from your version */ 
  id: string; type: string; name: string; number: string;
  cost: number; date_received: string; account_id: string; account_name: string;
  depreciation_method?: string; useful_life_years?: number; salvage_value?: number;
  accumulated_depreciation: number; last_depreciation_date?: string;
}
interface Expense {
  id: string; name: string; details: string; category: string | null;
  amount: number; date: string; account_id: string; account_name: string;
}
interface Account {
  id: string; code: string; name: string; type: 'Asset'|'Liability'|'Equity'|'Income'|'Expense';
}

const Accounting = () => {
  const [activeTab, setActiveTab] = useState<'assets'|'expenses'|'accounts'>('assets');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'asset'|'expense'|'account'|''>('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState<any>({});

  const [isDepreciating, setIsDepreciating] = useState(false);
  const [depreciationEndDate, setDepreciationEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'asset' | 'expense' | 'account', id: string } | null>(null);

  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const authHeaders = token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };

  const fetchAssets = useCallback(async () => {
    if (!token) { setAssets([]); return; }
    try {
      const r = await fetch(`${API_BASE}/assets`, { headers: authHeaders });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAssets(await r.json());
    } catch (e) { console.error('Error fetching assets:', e); }
  }, [token]);

  const fetchExpenses = useCallback(async () => {
    if (!token) { setExpenses([]); return; }
    try {
      const r = await fetch(`${API_BASE}/expenses`, { headers: authHeaders });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setExpenses(await r.json());
    } catch (e) { console.error('Error fetching expenses:', e); }
  }, [token]);

  const fetchAccounts = useCallback(async () => {
    if (!token) { setAccounts([]); return; }
    try {
      const r = await fetch(`${API_BASE}/accounts`, { headers: authHeaders });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAccounts(await r.json());
    } catch (e) { console.error('Error fetching accounts:', e); }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAssets();
      fetchExpenses();
      fetchAccounts();
    } else {
      setAssets([]); setExpenses([]); setAccounts([]);
    }
  }, [fetchAssets, fetchExpenses, fetchAccounts, isAuthenticated, token]);

  const clearForm = () => setFormData({});

  const handleEdit = (item: Asset | Expense | Account, type: 'asset' | 'expense' | 'account') => {
    setModalType(type);
    setFormData({
      ...item,
      dateReceived: (item as Asset).date_received,
      date: (item as Expense).date,
    });
    setIsModalVisible(true);
  };

  const handleDeleteClick = (id: string, type: 'asset' | 'expense' | 'account') => {
    setItemToDelete({ id, type });
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete || !token) { setShowDeleteConfirm(false); return; }

    const { id, type } = itemToDelete;
    const url =
      type === 'asset'   ? `${API_BASE}/assets/${id}` :
      type === 'expense' ? `${API_BASE}/expenses/${id}` :
                           `${API_BASE}/accounts/${id}`;

    const success = `${type.charAt(0).toUpperCase()+type.slice(1)} deleted successfully!`;
    const failure = `Failed to delete ${type}.`;

    try {
      const r = await fetch(url, { method: 'DELETE', headers: authHeaders });
      if (r.status === 204) {
        alert(success);
        if (type === 'asset') await fetchAssets();
        if (type === 'expense') await fetchExpenses();
        if (type === 'account') await fetchAccounts();
      } else {
        const err = await r.json().catch(() => ({}));
        alert(`${failure} ${err.detail || err.error || ''}`);
      }
    } catch (e) {
      console.error(`Error deleting ${type}:`, e);
      alert(`${failure} Check console for details.`);
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleSubmit = async () => {
    if (!token) { alert('You are not authenticated. Please log in.'); return; }

    try {
      let url = '';
      let method: 'POST' | 'PUT' = 'POST';
      let payload: any = {};

      if (modalType === 'asset') {
        const cost = Number(formData.cost);
        if (!formData.type || !formData.name || isNaN(cost) || !formData.dateReceived || !formData.account_id) {
          alert('Please fill in all asset fields correctly (Type, Name, Cost, Date Received, Account)');
          return;
        }
        payload = {
          type: formData.type,
          name: formData.name,
          number: formData.number || null,
          cost,
          date_received: formData.dateReceived,
          account_id: formData.account_id,
          depreciation_method: formData.depreciationMethod || null,
          useful_life_years: formData.usefulLifeYears ? Number(formData.usefulLifeYears) : null,
          salvage_value: formData.salvageValue ? Number(formData.salvageValue) : null,
        };
        if (formData.id) { url = `${API_BASE}/assets/${formData.id}`; method = 'PUT'; }
        else { url = `${API_BASE}/assets`; method = 'POST'; }
      }

      if (modalType === 'expense') {
        const amount = Number(formData.amount);
        if (!formData.name || isNaN(amount) || !formData.date || !formData.account_id) {
          alert('Please fill in all expense fields correctly (Name, Amount, Date, Account)');
          return;
        }
        payload = {
          name: formData.name,
          details: formData.details || null,
          category: formData.category || null,
          amount,
          date: formData.date,
          account_id: formData.account_id,
        };
        if (formData.id) { url = `${API_BASE}/expenses/${formData.id}`; method = 'PUT'; }
        else { url = `${API_BASE}/expenses`; method = 'POST'; }
      }

      if (modalType === 'account') {
        if (!formData.type || !formData.name || !formData.code) {
          alert('Please fill in all account fields correctly (Type, Name, Code)');
          return;
        }
        payload = { type: formData.type, name: formData.name, code: formData.code };
        if (formData.id) { url = `${API_BASE}/accounts/${formData.id}`; method = 'PUT'; }
        else { url = `${API_BASE}/accounts`; method = 'POST'; }
      }

      const r = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
      const result = await r.json().catch(() => ({}));

      if (r.ok) {
        if (modalType === 'asset') await fetchAssets();
        if (modalType === 'expense') await fetchExpenses();
        if (modalType === 'account') await fetchAccounts();
        alert(`${modalType} ${formData.id ? 'updated' : 'added'} successfully!`);
        setIsModalVisible(false);
        clearForm();
      } else {
        alert(`Failed to ${formData.id ? 'update' : 'add'} ${modalType}: ${result.detail || result.error || r.status}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to submit data, please try again.');
    }
  };

  const handleRunDepreciation = async () => {
    if (!token) { alert('You are not authenticated. Please log in.'); return; }
    setIsDepreciating(true);
    try {
      const r = await fetch(`${API_BASE}/api/depreciation/run`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ endDate: depreciationEndDate }),
      });
      const data = await r.json();
      if (r.ok) {
        alert(`Depreciation run successfully! Total depreciation: R${(+data.totalDepreciationExpense || 0).toFixed(2)}`);
        fetchAssets();
      } else {
        alert(`Failed to run depreciation: ${data.detail || data.error}`);
      }
    } catch (e) {
      console.error('Error running depreciation:', e);
      alert('Failed to run depreciation.');
    } finally {
      setIsDepreciating(false);
    }
  };

  const closeModal = () => { setIsModalVisible(false); clearForm(); };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='Accounting' />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <Tabs value={activeTab} onValueChange={(v:any)=>setActiveTab(v)}>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='assets'>Assets</TabsTrigger>
            <TabsTrigger value='expenses'>Expenses</TabsTrigger>
            <TabsTrigger value='accounts'>Accounts</TabsTrigger>
          </TabsList>

          {/* Assets */}
          <TabsContent value='assets'>
            <Card>
              <CardHeader>
                <div className='flex justify-between items-center'>
                  <CardTitle className='flex items-center gap-2'>
                    <Building className='h-5 w-5' /> Assets
                  </CardTitle>
                  <div className='flex items-center gap-2'>
                    <Input type='date' value={depreciationEndDate}
                      onChange={(e) => setDepreciationEndDate(e.target.value)} className='w-auto' />
                    <Button onClick={handleRunDepreciation} disabled={isDepreciating} className='bg-green-600 hover:bg-green-700'>
                      {isDepreciating ? 'Running...' : <><Play className='h-4 w-4 mr-2' /> Run Depreciation</>}
                    </Button>
                    <Button onClick={() => { clearForm(); setModalType('asset'); setIsModalVisible(true); }}>
                      <Plus className='h-4 w-4 mr-2' /> Add Asset
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Date Received</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Depreciation Method</TableHead>
                      <TableHead>Useful Life (Years)</TableHead>
                      <TableHead>Salvage Value</TableHead>
                      <TableHead>Accumulated Depreciation</TableHead>
                      <TableHead>Net Book Value</TableHead>
                      <TableHead>Last Depr. Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map(asset => {
                      const nbv = (+asset.cost || 0) - (+asset.accumulated_depreciation || 0);
                      return (
                        <TableRow key={asset.id}>
                          <TableCell><Badge>{asset.type}</Badge></TableCell>
                          <TableCell>{asset.name}</TableCell>
                          <TableCell>R{(+asset.cost || 0).toFixed(2)}</TableCell>
                          <TableCell>{new Date(asset.date_received).toLocaleDateString()}</TableCell>
                          <TableCell>{asset.account_name}</TableCell>
                          <TableCell>{asset.depreciation_method || 'N/A'}</TableCell>
                          <TableCell>{asset.useful_life_years ?? 'N/A'}</TableCell>
                          <TableCell>R{(+asset.salvage_value || 0).toFixed(2)}</TableCell>
                          <TableCell>R{(+asset.accumulated_depreciation || 0).toFixed(2)}</TableCell>
                          <TableCell>R{nbv.toFixed(2)}</TableCell>
                          <TableCell>{asset.last_depreciation_date ? new Date(asset.last_depreciation_date).toLocaleDateString() : 'N/A'}</TableCell>
                          <TableCell>
                            <div className='flex items-center gap-2'>
                              <Button variant='ghost' size='sm' onClick={() => handleEdit(asset, 'asset')}>
                                <Edit className='h-4 w-4' />
                              </Button>
                              <Button variant='ghost' size='sm' onClick={() => handleDeleteClick(asset.id, 'asset')}>
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses */}
          <TabsContent value='expenses'>
            <Card>
              <CardHeader>
                <div className='flex justify-between items-center'>
                  <CardTitle className='flex items-center gap-2'>
                    <CreditCard className='h-5 w-5' /> Expenses
                  </CardTitle>
                  <Button onClick={() => { clearForm(); setModalType('expense'); setIsModalVisible(true); }}>
                    <Plus className='h-4 w-4 mr-2' /> Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(exp => (
                      <TableRow key={exp.id}>
                        <TableCell>{exp.name}</TableCell>
                        <TableCell><Badge>{exp.category || '—'}</Badge></TableCell>
                        <TableCell>{exp.details}</TableCell>
                        <TableCell>R{(+exp.amount || 0).toFixed(2)}</TableCell>
                        <TableCell>{new Date(exp.date).toLocaleDateString()}</TableCell>
                        <TableCell>{exp.account_name}</TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <Button variant='ghost' size='sm' onClick={() => handleEdit(exp, 'expense')}>
                              <Edit className='h-4 w-4' />
                            </Button>
                            <Button variant='ghost' size='sm' onClick={() => handleDeleteClick(exp.id, 'expense')}>
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounts */}
          <TabsContent value='accounts'>
            <Card>
              <CardHeader>
                <div className='flex justify-between items-center'>
                  <CardTitle className='flex items-center gap-2'>
                    <Calculator className='h-5 w-5' /> Accounts
                  </CardTitle>
                  <Button onClick={() => { clearForm(); setModalType('account'); setIsModalVisible(true); }}>
                    <Plus className='h-4 w-4 mr-2' /> Add Account
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map(acc => (
                      <TableRow key={acc.id}>
                        <TableCell><Badge variant='outline'>{acc.type}</Badge></TableCell>
                        <TableCell>{acc.code}</TableCell>
                        <TableCell>{acc.name}</TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <Button variant='ghost' size='sm' onClick={() => handleEdit(acc, 'account')}>
                              <Edit className='h-4 w-4' />
                            </Button>
                            <Button variant='ghost' size='sm' onClick={() => handleDeleteClick(acc.id, 'account')}>
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Modal */}
      <Dialog open={isModalVisible} onOpenChange={closeModal}>
        <DialogContent aria-describedby='modal-desc' className='max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {formData.id ? 'Edit' : 'Add New'} {modalType === 'asset' ? 'Asset' : modalType === 'expense' ? 'Expense' : 'Account'}
            </DialogTitle>
            <p id='modal-desc' className='text-sm text-muted-foreground'>
              Fill in the required fields to {formData.id ? 'update' : 'create'} this {modalType || 'item'}.
            </p>
          </DialogHeader>

          <div className='space-y-4'>
            {modalType === 'asset' && (
              <>
                <Label>Type</Label>
                <Select value={formData.type || ''} onValueChange={value => setFormData({ ...formData, type: value })}>
                  <SelectTrigger><SelectValue placeholder='Select asset type' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='Computer'>Computer</SelectItem>
                    <SelectItem value='Furniture'>Furniture</SelectItem>
                    <SelectItem value='Equipment'>Equipment</SelectItem>
                    <SelectItem value='Vehicle'>Vehicle</SelectItem>
                    <SelectItem value='Property'>Property</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Name</Label>
                <Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder='Asset Name' />

                <Label>Number</Label>
                <Input value={formData.number || ''} onChange={e => setFormData({ ...formData, number: e.target.value })} placeholder='Asset Number (Optional)' />

                <Label>Cost (R)</Label>
                <Input type='number' value={formData.cost ?? ''} onChange={e => setFormData({ ...formData, cost: e.target.value === '' ? '' : Number(e.target.value) })} placeholder='Cost' />

                <Label>Date Received</Label>
                <Input type='date' value={formData.dateReceived || ''} onChange={e => setFormData({ ...formData, dateReceived: e.target.value })} />

                <Label>Account</Label>
                <Select value={formData.account_id || ''} onValueChange={value => setFormData({ ...formData, account_id: value })}>
                  <SelectTrigger><SelectValue placeholder='Select account' /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Label>Depreciation Method</Label>
                <Select value={formData.depreciationMethod || ''} onValueChange={value => setFormData({ ...formData, depreciationMethod: value })}>
                  <SelectTrigger><SelectValue placeholder='Select method (Optional)' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='straight-line'>Straight-Line</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Useful Life (Years)</Label>
                <Input type='number' value={formData.usefulLifeYears ?? ''} onChange={e => setFormData({ ...formData, usefulLifeYears: e.target.value === '' ? '' : Number(e.target.value) })} placeholder='e.g., 5' />

                <Label>Salvage Value (R)</Label>
                <Input type='number' value={formData.salvageValue ?? ''} onChange={e => setFormData({ ...formData, salvageValue: e.target.value === '' ? '' : Number(e.target.value) })} placeholder='e.g., 1000' />
              </>
            )}

            {modalType === 'expense' && (
              <>
                <Label>Name</Label>
                <Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder='Expense Name' />

                <Label>Amount (R)</Label>
                <Input type='number' value={formData.amount ?? ''} onChange={e => setFormData({ ...formData, amount: e.target.value === '' ? '' : Number(e.target.value) })} placeholder='Expense Amount' />

                <Label>Date</Label>
                <Input type='date' value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} />

                <Label>Category</Label>
                <Select value={formData.category || ''} onValueChange={value => setFormData({ ...formData, category: value })}>
                  <SelectTrigger><SelectValue placeholder='Select category (Optional)' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='Operating Expenses'>Operating Expenses</SelectItem>
                    <SelectItem value='Administrative Expenses'>Administrative Expenses</SelectItem>
                    <SelectItem value='Depreciation Expense'>Depreciation Expense</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Details</Label>
                <Input value={formData.details || ''} onChange={e => setFormData({ ...formData, details: e.target.value })} placeholder='Details (Optional)' />

                <Label>Account</Label>
                <Select value={formData.account_id || ''} onValueChange={value => setFormData({ ...formData, account_id: value })}>
                  <SelectTrigger><SelectValue placeholder='Select account' /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {modalType === 'account' && (
              <>
                <Label>Type</Label>
                <Select value={formData.type || ''} onValueChange={value => setFormData({ ...formData, type: value })}>
                  <SelectTrigger><SelectValue placeholder='Select account type' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='Asset'>Asset</SelectItem>
                    <SelectItem value='Liability'>Liability</SelectItem>
                    <SelectItem value='Equity'>Equity</SelectItem>
                    <SelectItem value='Income'>Income</SelectItem>
                    <SelectItem value='Expense'>Expense</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Name</Label>
                <Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder='Account Name' />

                <Label>Code</Label>
                <Input value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder='Account Code (e.g., 1000)' />
              </>
            )}

            <div className='flex justify-end'>
              <Button onClick={handleSubmit}>{formData.id ? 'Save Changes' : 'Add'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected {itemToDelete?.type}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Accounting;
