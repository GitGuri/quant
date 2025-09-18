import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Building, CreditCard, Calculator, Play, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '../AuthPage';

const API_BASE = 'https://quantnow.onrender.com';

// ---- Types
interface Asset {
  id: string;
  name: string;
  number: string | null;
  cost: number;
  date_received: string;
  account_id: string;
  account_name: string;

  // Accounting book
  depreciation_method?: string | null;
  useful_life_years?: number | null;
  salvage_value?: number | null;
  accumulated_depreciation: number;
  last_depreciation_date?: string | null;

  // Tax/SARS book
  accumulated_depreciation_tax?: number | null;
  last_depreciation_date_tax?: string | null;

  // Preset linkage & labels
  asset_type_id?: number | null;
  type_name?: string | null;

  // SARS metadata
  brought_into_use_date?: string | null;
  business_use_percent?: number | null;
  small_item?: boolean | null;
  lessor_residual_value?: number | null;
  disposed_date?: string | null;
  disposal_proceeds?: number | null;

  // Acquisition metadata (NEW)
  acquisition_method?: 'none' | 'cash' | 'liability' | null;
  acquisition_credit_account_id?: number | null;
  acquisition_credit_account_name?: string | null;
  acquisition_journal_entry_id?: number | null;
}

interface Expense {
  id: string; name: string; details: string; category: string | null;
  amount: number; date: string; account_id: string; account_name: string;
}

interface Account {
  id: string; code: string; name: string;
  type: 'Asset'|'Liability'|'Equity'|'Income'|'Expense';
}

interface AssetType {
  id: number;
  name: string;
  default_useful_life_years: number;
  default_method: string; // 'straight-line'
  active_from: string;
  active_to: string | null;
}

// ---- Helpers for Opening Balances ----
const normalSideOf = (t: Account['type']) =>
  (t === 'Asset' || t === 'Expense') ? 'Debit' : 'Credit';

const isBalanceSheetType = (t: Account['type']) =>
  t === 'Asset' || t === 'Liability' || t === 'Equity';

// ---- Helpers for funding pickers ----
const looksLikeBankOrCash = (acc: Account) =>
  acc.type === 'Asset' && /cash|bank|cheque|checking|current|savings|petty/i.test(acc.name || '');

type FundingMethod = 'none' | 'cash' | 'liability';

const Accounting = () => {
  const [activeTab, setActiveTab] = useState<'assets'|'expenses'|'accounts'|'opening'>('assets');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'asset'|'expense'|'account'|''>('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState<any>({});

  const [depBook, setDepBook] = useState<'accounting'|'tax'|'both'>('accounting');
  const [isDepreciating, setIsDepreciating] = useState(false);
  const [depreciationEndDate, setDepreciationEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'asset' | 'expense' | 'account', id: string } | null>(null);

  // ---- Opening balances state ----
  const [openingAsOf, setOpeningAsOf] = useState(new Date().toISOString().slice(0,10));
  const [openingDraft, setOpeningDraft] = useState<Record<string, number>>({});
  const [isSavingOpening, setIsSavingOpening] = useState(false);
  const [isLoadingOpening, setIsLoadingOpening] = useState(false);

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

  const fetchAssetTypes = useCallback(async () => {
    if (!token) { setAssetTypes([]); return; }
    try {
      const r = await fetch(`${API_BASE}/asset-types`, { headers: authHeaders });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAssetTypes(await r.json());
    } catch (e) { console.error('Error fetching asset types:', e); }
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

  // ---- Opening balances: load existing (optional) ----
  const fetchOpeningBalances = useCallback(async (asOf: string) => {
    if (!token) { setOpeningDraft({}); return; }
    setIsLoadingOpening(true);
    try {
      const r = await fetch(`${API_BASE}/setup/opening-balance?asOf=${asOf}`, { headers: authHeaders });
      if (!r.ok) { setOpeningDraft({}); return; }
      const data = await r.json();

      const map: Record<string, number> = {};
      for (const ln of (data.lines || [])) {
        const nm = String(ln.name || '').toLowerCase();
        if (nm === 'opening balance equity') continue;
        const type = ln.type as Account['type'];
        const normal = normalSideOf(type);
        const debit = Number(ln.debit || 0);
        const credit = Number(ln.credit || 0);
        let amt = 0;
        if (normal === 'Debit') amt = debit - credit;
        else amt = credit - debit;
        if (Math.abs(amt) > 0.0001) map[String(ln.account_id)] = amt;
      }
      setOpeningDraft(map);
    } catch (e) {
      console.error('Opening balances fetch error', e);
      setOpeningDraft({});
    } finally {
      setIsLoadingOpening(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAssets();
      fetchExpenses();
      fetchAccounts();
      fetchAssetTypes();
    } else {
      setAssets([]); setExpenses([]); setAccounts([]); setAssetTypes([]);
    }
  }, [fetchAssets, fetchExpenses, fetchAccounts, fetchAssetTypes, isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated && token) fetchOpeningBalances(openingAsOf);
  }, [isAuthenticated, token, openingAsOf, fetchOpeningBalances]);

  const clearForm = () => setFormData({});

  const handleEdit = (item: Asset | Expense | Account, type: 'asset' | 'expense' | 'account') => {
    setModalType(type);
    if (type === 'asset') {
      const a = item as Asset;
      setFormData({
        id: a.id,
        name: a.name,
        number: a.number || '',
        cost: a.cost,
        dateReceived: a.date_received,
        account_id: String(a.account_id),
        depreciationMethod: a.depreciation_method || '',
        usefulLifeYears: a.useful_life_years ?? '',
        salvageValue: a.salvage_value ?? '',

        // SARS/preset fields
        asset_type_id: a.asset_type_id ? String(a.asset_type_id) : '',
        brought_into_use_date: a.brought_into_use_date || '',
        business_use_percent: a.business_use_percent ?? '',
        small_item: !!a.small_item,
        lessor_residual_value: a.lessor_residual_value ?? '',
        disposed_date: a.disposed_date || '',
        disposal_proceeds: a.disposal_proceeds ?? '',

        // Acquisition (read-only on edit)
        acquisition_method: a.acquisition_method || 'none',
        acquisition_credit_account_id: a.acquisition_credit_account_id ?? null,
        acquisition_credit_account_name: a.acquisition_credit_account_name ?? null,
        acquisition_journal_entry_id: a.acquisition_journal_entry_id ?? null,

        // funding pickers are for CREATE only
        fundingMethod: 'none',
        paid_from_account_id: '',
        financed_liability_account_id: ''
      });
    } else if (type === 'expense') {
      const e = item as Expense;
      setFormData({ ...e, date: e.date });
    } else if (type === 'account') {
      const acc = item as Account;
      setFormData({ ...acc });
    }
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
      if (r.status === 204 || r.ok) {
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

  // Derived lists for funding pickers
  const bankAccounts = useMemo(() => accounts.filter(looksLikeBankOrCash), [accounts]);
  const liabilityAccounts = useMemo(() => accounts.filter(a => a.type === 'Liability'), [accounts]);

  // When user selects an asset type: optionally prefill method/life if empty
  const onSelectAssetType = (val: string) => {
    const id = Number(val);
    const t = assetTypes.find(x => x.id === id);
    setFormData((prev: any) => {
      const next = { ...prev, asset_type_id: id };
      if (t) {
        if (!prev.depreciationMethod || prev.depreciationMethod === '') {
          next.depreciationMethod = t.default_method || 'straight-line';
        }
        if (!prev.usefulLifeYears || prev.usefulLifeYears === '') {
          next.usefulLifeYears = t.default_useful_life_years;
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!token) { alert('You are not authenticated. Please log in.'); return; }

    try {
      let url = '';
      let method: 'POST' | 'PUT' = 'POST';
      let payload: any = {};

      if (modalType === 'asset') {
        const cost = Number(formData.cost);
        if (!formData.name || isNaN(cost) || !formData.dateReceived || !formData.account_id) {
          alert('Please fill in all asset fields correctly (Name, Cost, Date Received, Account)');
          return;
        }

        // base + depreciation + SARS fields
        payload = {
          name: formData.name,
          number: formData.number || null,
          cost,
          date_received: formData.dateReceived,
          account_id: Number(formData.account_id),

          depreciation_method: formData.depreciationMethod || null,
          useful_life_years: formData.usefulLifeYears === '' ? null : Number(formData.usefulLifeYears),
          salvage_value: formData.salvageValue === '' ? null : Number(formData.salvageValue),

          // preset link & SARS metadata
          asset_type_id: formData.asset_type_id ? Number(formData.asset_type_id) : null,
          brought_into_use_date: formData.brought_into_use_date || null,
          business_use_percent: formData.business_use_percent === '' ? null : Number(formData.business_use_percent),
          small_item: !!formData.small_item,
          lessor_residual_value: formData.lessor_residual_value === '' ? null : Number(formData.lessor_residual_value),
          disposed_date: formData.disposed_date || null,
          disposal_proceeds: formData.disposal_proceeds === '' ? null : Number(formData.disposal_proceeds),
        };

        // funding logic (only on create)
        const fm: FundingMethod = formData.fundingMethod || 'none';
        if (!formData.id) {
          if (fm === 'cash') {
            if (!formData.paid_from_account_id) {
              alert('Please choose a Bank/Cash account for payment.');
              return;
            }
            payload.paid_from_account_id = Number(formData.paid_from_account_id);
          }
          if (fm === 'liability') {
            if (!formData.financed_liability_account_id) {
              alert('Please choose a Liability account for financing.');
              return;
            }
            payload.financed_liability_account_id = Number(formData.financed_liability_account_id);
          }
        }

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
          account_id: Number(formData.account_id),
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
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ endDate: depreciationEndDate, book: depBook }),
      });
      const data = await r.json();
      if (r.ok) {
        const total =
          depBook === 'both'
            ? (+(data?.accounting?.total || 0) + +(data?.tax?.total || 0))
            : +(data?.accounting?.total || data?.tax?.total || 0);
        alert(`Depreciation run ok (${depBook}). Total: R${(total || 0).toFixed(2)}`);
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

  // ---- Save Opening Balances ----
  const saveOpeningBalances = async () => {
    if (!token) { alert('Please log in.'); return; }
    setIsSavingOpening(true);
    try {
      const balances = Object.entries(openingDraft)
        .map(([account_id, amount]) => ({ account_id: Number(account_id), amount: Number(amount) }))
        .filter(b => Number.isFinite(b.amount) && b.amount !== 0);

      if (balances.length === 0) {
        alert('Enter at least one non-zero opening amount.');
        setIsSavingOpening(false);
        return;
      }

      const r = await fetch(`${API_BASE}/setup/opening-balance`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ asOf: openingAsOf, balances })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      alert('Opening balances saved.');
      await fetchOpeningBalances(openingAsOf);
    } catch (e:any) {
      console.error('Opening save error', e);
      alert(`Failed to save opening balances: ${e?.message || e}`);
    } finally {
      setIsSavingOpening(false);
    }
  };

  const closeModal = () => { setIsModalVisible(false); clearForm(); };

  // Small helper to render acquisition label
  const acquisitionLabel = (a: Asset) => {
    const m = a.acquisition_method || 'none';
    if (m === 'cash') return `Cash/Bank • ${a.acquisition_credit_account_name || '—'}`;
    if (m === 'liability') return `Liability • ${a.acquisition_credit_account_name || '—'}`;
    return 'No initial funding JE';
    };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='Accounting' />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <Tabs value={activeTab} onValueChange={(v:any)=>setActiveTab(v)}>
          <TabsList className='grid w-full grid-cols-4'>
            <TabsTrigger value='assets'>Assets</TabsTrigger>
            <TabsTrigger value='expenses'>Expenses</TabsTrigger>
            <TabsTrigger value='accounts'>Accounts</TabsTrigger>
            <TabsTrigger value='opening'>Opening Balances</TabsTrigger>
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
                    <Select value={depBook} onValueChange={(v:any)=>setDepBook(v)}>
                      <SelectTrigger className='w-[160px]'><SelectValue placeholder='Book' /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='accounting'>Accounting</SelectItem>
                        <SelectItem value='tax'>Tax (SARS)</SelectItem>
                        <SelectItem value='both'>Both</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type='date' value={depreciationEndDate}
                      onChange={(e) => setDepreciationEndDate(e.target.value)} className='w-auto' />
                    <Button onClick={handleRunDepreciation} disabled={isDepreciating} className='bg-green-600 hover:bg-green-700'>
                      {isDepreciating ? 'Running...' : <><Play className='h-4 w-4 mr-2' /> Run Depreciation</>}
                    </Button>
                    <Button onClick={() => {
                      clearForm();
                      setModalType('asset');
                      setFormData({
                        name: '',
                        number: '',
                        cost: '',
                        dateReceived: '',
                        account_id: '',
                        asset_type_id: '',
                        depreciationMethod: '',
                        usefulLifeYears: '',
                        salvageValue: '0',
                        brought_into_use_date: '',
                        business_use_percent: '',
                        small_item: false,
                        lessor_residual_value: '',
                        disposed_date: '',
                        disposal_proceeds: '',
                        // CREATE: funding defaults
                        fundingMethod: 'none',
                        paid_from_account_id: '',
                        financed_liability_account_id: ''
                      });
                      setIsModalVisible(true);
                    }}>
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
                      <TableHead>Acquired via</TableHead> {/* NEW */}
                      <TableHead>Method</TableHead>
                      <TableHead>Life (Y)</TableHead>
                      <TableHead>Salvage</TableHead>
                      <TableHead>Accum (Acct)</TableHead>
                      <TableHead>Accum (Tax)</TableHead>
                      <TableHead>NBV</TableHead>
                      <TableHead>Last Depr.</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map(asset => {
                      const nbv = (+asset.cost || 0) - (+asset.accumulated_depreciation || 0);
                      return (
                        <TableRow key={asset.id}>
                          <TableCell><Badge>{asset.type_name || '—'}</Badge></TableCell>
                          <TableCell>{asset.name}</TableCell>
                          <TableCell>R{(+asset.cost || 0).toFixed(2)}</TableCell>
                          <TableCell>{new Date(asset.date_received).toLocaleDateString()}</TableCell>
                          <TableCell>{asset.account_name}</TableCell>
                          <TableCell>{acquisitionLabel(asset)}</TableCell> {/* NEW */}
                          <TableCell>{asset.depreciation_method || '—'}</TableCell>
                          <TableCell>{asset.useful_life_years ?? '—'}</TableCell>
                          <TableCell>R{(+asset.salvage_value || 0).toFixed(2)}</TableCell>
                          <TableCell>R{(+asset.accumulated_depreciation || 0).toFixed(2)}</TableCell>
                          <TableCell>R{(+asset.accumulated_depreciation_tax || 0).toFixed(2)}</TableCell>
                          <TableCell>R{nbv.toFixed(2)}</TableCell>
                          <TableCell>{asset.last_depreciation_date ? new Date(asset.last_depreciation_date).toLocaleDateString() : '—'}</TableCell>
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

          {/* Opening Balances */}
          <TabsContent value='opening'>
            <Card>
              <CardHeader>
                <div className='flex justify-between items-center'>
                  <CardTitle>Opening Balances</CardTitle>
                  <div className='flex items-center gap-3'>
                    <div className='flex items-center gap-2'>
                      <Label className='whitespace-nowrap'>As of</Label>
                      <Input type='date' value={openingAsOf}
                        onChange={(e)=>setOpeningAsOf(e.target.value)} className='w-auto' />
                    </div>
                    <Button onClick={saveOpeningBalances} disabled={isSavingOpening}>
                      {isSavingOpening ? 'Saving…' : 'Save Opening Balances'}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <p className='text-sm text-muted-foreground mb-4'>
                  Enter each account’s balance on its <b>normal side</b> (Assets/Debits; Liabilities &amp; Equity/Credits).
                  The system will post correct debits/credits and add a plug to <i>Opening Balance Equity</i> so the entry balances automatically.
                </p>

                {isLoadingOpening ? (
                  <div className='text-sm'>Loading…</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className='w-[220px]'>Opening amount (normal side)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts
                        .filter(a => isBalanceSheetType(a.type))
                        .sort((a,b)=>a.code.localeCompare(b.code))
                        .map(acc => {
                          const normal = normalSideOf(acc.type);
                          const key = String(acc.id);
                          const val = openingDraft[key] ?? '';
                          return (
                            <TableRow key={acc.id}>
                              <TableCell>{acc.code}</TableCell>
                              <TableCell>{acc.name}</TableCell>
                              <TableCell><Badge variant='outline'>{acc.type} • {normal}</Badge></TableCell>
                              <TableCell>
                                <div className='flex items-center gap-2'>
                                  <Input
                                    type='number'
                                    inputMode='decimal'
                                    placeholder={`0.00 (${normal})`}
                                    value={val}
                                    onChange={(e)=>{
                                      const v = e.target.value;
                                      setOpeningDraft(prev => {
                                        const n = {...prev};
                                        if (v === '' || Number(v) === 0) delete n[key];
                                        else n[key] = Number(v);
                                        return n;
                                      });
                                    }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                )}
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
                <Label>Preset Type (SARS)</Label>
                <Select
                  value={formData.asset_type_id || ''}
                  onValueChange={onSelectAssetType}
                >
                  <SelectTrigger><SelectValue placeholder='Select asset type' /></SelectTrigger>
                  <SelectContent>
                    {assetTypes.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} {t.default_useful_life_years ? `(${t.default_useful_life_years} yrs)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Label>Name</Label>
                <Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder='Asset Name' />

                <Label>Number</Label>
                <Input value={formData.number || ''} onChange={e => setFormData({ ...formData, number: e.target.value })} placeholder='Asset Number (Optional)' />

                <Label>Cost (R)</Label>
                <Input
                  type='number'
                  value={formData.cost ?? ''}
                  onChange={e => setFormData({ ...formData, cost: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder='Cost'
                />

                <Label>Date Received</Label>
                <Input type='date' value={formData.dateReceived || ''} onChange={e => setFormData({ ...formData, dateReceived: e.target.value })} />

                <Label>Asset Account</Label>
                <Select value={formData.account_id || ''} onValueChange={value => setFormData({ ...formData, account_id: value })}>
                  <SelectTrigger><SelectValue placeholder='Select account' /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={String(acc.id)}>{acc.name} ({acc.code})</SelectItem>
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
                <Input
                  type='number'
                  value={formData.usefulLifeYears ?? ''}
                  onChange={e => setFormData({ ...formData, usefulLifeYears: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder='e.g., 5'
                />

                <Label>Salvage Value (R)</Label>
                <Input
                  type='number'
                  value={formData.salvageValue ?? ''}
                  onChange={e => setFormData({ ...formData, salvageValue: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder='e.g., 1000'
                />

                {/* SARS metadata */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <div>
                    <Label>Brought Into Use Date</Label>
                    <Input type='date' value={formData.brought_into_use_date || ''} onChange={e=>setFormData({ ...formData, brought_into_use_date: e.target.value })}/>
                  </div>
                  <div>
                    <Label>Business Use %</Label>
                    <Input type='number' value={formData.business_use_percent ?? ''} onChange={e=>setFormData({ ...formData, business_use_percent: e.target.value === '' ? '' : Number(e.target.value) })} placeholder='100' />
                  </div>
                  <div>
                    <Label>Lessor Residual (if leased)</Label>
                    <Input type='number' value={formData.lessor_residual_value ?? ''} onChange={e=>setFormData({ ...formData, lessor_residual_value: e.target.value === '' ? '' : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Small Item?</Label>
                    <Select value={formData.small_item ? 'yes' : 'no'} onValueChange={(v)=>setFormData({ ...formData, small_item: v === 'yes' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='no'>No</SelectItem>
                        <SelectItem value='yes'>Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Disposed Date</Label>
                    <Input type='date' value={formData.disposed_date || ''} onChange={e=>setFormData({ ...formData, disposed_date: e.target.value })}/>
                  </div>
                  <div>
                    <Label>Disposal Proceeds</Label>
                    <Input type='number' value={formData.disposal_proceeds ?? ''} onChange={e=>setFormData({ ...formData, disposal_proceeds: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  </div>
                </div>

                {/* Acquisition summary (READ-ONLY on edit) */}
                {formData.id && (
                  <div className='border rounded-md p-3'>
                    <div className='flex items-center justify-between mb-2'>
                      <Label className='m-0'>Acquisition</Label>
                      {formData.acquisition_journal_entry_id ? (
                        <span className='text-xs text-muted-foreground flex items-center gap-1'>
                          <LinkIcon className='w-3 h-3' />
                          JE #{formData.acquisition_journal_entry_id}
                        </span>
                      ) : null}
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-2 text-sm'>
                      <div>
                        <span className='text-muted-foreground'>Method:</span>{' '}
                        <b>{(formData.acquisition_method || 'none').toUpperCase()}</b>
                      </div>
                      <div className='md:col-span-2'>
                        <span className='text-muted-foreground'>Credit account:</span>{' '}
                        <b>{formData.acquisition_credit_account_name || '—'}</b>
                      </div>
                    </div>
                    <p className='text-xs text-muted-foreground mt-2'>
                      Acquisition method is recorded with the original capitalization journal and is not editable here.
                    </p>
                  </div>
                )}

                {/* Funding (CREATE only) */}
                {!formData.id && (
                  <div className='border rounded-md p-3 mt-1'>
                    <div className='flex items-center justify-between gap-3 mb-3'>
                      <Label className='m-0'>Funding</Label>
                      <Select
                        value={formData.fundingMethod || 'none'}
                        onValueChange={(value) => {
                          const fm = value as FundingMethod;
                          setFormData((prev:any) => ({
                            ...prev,
                            fundingMethod: fm,
                            paid_from_account_id: fm === 'cash' ? (prev.paid_from_account_id || '') : '',
                            financed_liability_account_id: fm === 'liability' ? (prev.financed_liability_account_id || '') : ''
                          }));
                        }}
                      >
                        <SelectTrigger className='w-56'><SelectValue placeholder='Select funding' /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='none'>No journal yet</SelectItem>
                          <SelectItem value='cash'>Paid from Cash/Bank</SelectItem>
                          <SelectItem value='liability'>Financed (Liability)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.fundingMethod === 'cash' && (
                      <div className='mt-2'>
                        <Label>Bank / Cash Account</Label>
                        <Select
                          value={formData.paid_from_account_id || ''}
                          onValueChange={(value)=> setFormData({ ...formData, paid_from_account_id: value })}
                        >
                          <SelectTrigger><SelectValue placeholder='Select bank/cash account' /></SelectTrigger>
                          <SelectContent>
                            {bankAccounts.map(acc => (
                              <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className='text-xs text-muted-foreground mt-1'>
                          Will post: <b>Dr Fixed Asset</b> / <b>Cr Bank</b>.
                        </p>
                      </div>
                    )}

                    {formData.fundingMethod === 'liability' && (
                      <div className='mt-2'>
                        <Label>Liability Account</Label>
                        <Select
                          value={formData.financed_liability_account_id || ''}
                          onValueChange={(value)=> setFormData({ ...formData, financed_liability_account_id: value })}
                        >
                          <SelectTrigger><SelectValue placeholder='Select liability account' /></SelectTrigger>
                          <SelectContent>
                            {liabilityAccounts.map(acc => (
                              <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className='text-xs text-muted-foreground mt-1'>
                          Will post: <b>Dr Fixed Asset</b> / <b>Cr Liability</b>.
                        </p>
                      </div>
                    )}

                    {formData.fundingMethod === 'none' && (
                      <p className='text-xs text-muted-foreground'>
                        No journal will be posted now. You can post funding later.
                      </p>
                    )}
                  </div>
                )}
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
                      <SelectItem key={acc.id} value={String(acc.id)}>{acc.name} ({acc.code})</SelectItem>
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
