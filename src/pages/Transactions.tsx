// Transactions.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Edit, Printer, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../AuthPage';
import { Separator } from '@/components/ui/separator';

// ---------------- Types ----------------
interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface JournalEntrySummary {
  id: number;
  entry_date: string;      // YYYY-MM-DD
  memo: string | null;
  total_debit: string | number;
  total_credit: string | number;
  line_count: number;
}

interface JournalLine {
  id: number;
  account_id: number;
  debit: string | number;
  credit: string | number;
}

interface JournalEntryDetail {
  entry: {
    id: number;
    entry_date: string;
    memo: string | null;
  };
  lines: JournalLine[];
}

// Friendly row for the UI
interface DupView {
  id: number;
  date: string;
  memo: string;
  amount: number;
  score: number; // 0..1
}

// --- NEW: Unified Transaction View Type ---
type TransactionSourceType = 'journal_entry' | 'manual_transaction';

interface UnifiedTxViewRow {
  id: string; // Unified ID (e.g., "je-123" or "mt-abc-def")
  sourceType: TransactionSourceType;
  sourceId: number | string; // Original ID from respective table
  date: string;
  description: string;
  amount: number;
  debitAccountName?: string;
  creditAccountName?: string;
  category?: string; // Primarily for manual transactions
  type?: 'income' | 'expense' | 'transfer' | 'adjustment'; // Primarily for manual transactions
  accountId?: number; // Account ID for manual transactions if applicable
  accountName?: string; // Account name for manual transactions
  complex?: boolean; // Flag if it's a complex journal entry
  lineCount?: number; // Number of lines for journal entries
  dupCount?: number;
  dupMatches?: DupView[];
  // Add any other fields you want to display consistently
}
// --- END NEW TYPE ---

// -------------- Helpers --------------
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

const fmtMoney = (n: number) =>
  `R${n.toFixed(2)}`;

const parseNumber = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

const biggestDebit = (lines: JournalLine[]) =>
  lines
    .filter(l => parseNumber(l.debit) > 0)
    .sort((a, b) => parseNumber(b.debit) - parseNumber(a.debit))[0];

const biggestCredit = (lines: JournalLine[]) =>
  lines
    .filter(l => parseNumber(l.credit) > 0)
    .sort((a, b) => parseNumber(b.credit) - parseNumber(a.credit))[0];

// --- duplicate helpers (same vibe as ImportScreen) ---
const normalize = (s?: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = (s?: string) => new Set(normalize(s).split(' ').filter(Boolean));

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
};

const daysBetween = (d1: string, d2: string) =>
  Math.abs((new Date(d1).getTime() - new Date(d2).getTime()) / 86_400_000);

// similar rule as you used during import preview
const isPotentialDuplicate = (aRow: UnifiedTxViewRow, bRow: UnifiedTxViewRow) => {
  if (aRow.id === bRow.id) return { isDup: false, score: 0 };
  // amounts must match exactly to be “strong dup” for posted journals
  const amountMatch = Math.abs(Number(aRow.amount) - Number(bRow.amount)) <= 0.01;
  if (!amountMatch) return { isDup: false, score: 0 };

  const dateClose = daysBetween(aRow.date, bRow.date) <= 2;

  const A = tokenSet(aRow.description);
  const B = tokenSet(bRow.description);
  const jac = jaccard(A, B);
  const substring =
    normalize(aRow.description).includes(normalize(bRow.description)) ||
    normalize(bRow.description).includes(normalize(aRow.description));
  const similarDesc = jac >= 0.55 || substring;

  const score = (amountMatch ? 0.5 : 0) + (dateClose ? 0.2 : 0) + (similarDesc ? 0.3 : 0);
  return { isDup: amountMatch && dateClose && similarDesc, score };
};

// limit concurrency for detail fetches (simple gate)
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (t: T) => Promise<R>,
  limit = 10
): Promise<R[]> {
  const out: R[] = [];
  let idx = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const myIndex = idx++;
      out[myIndex] = await fn(items[myIndex]);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------------- Component ----------------
const Transactions: React.FC = () => {
  // Auth (same pattern you already use)
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // UI / filters
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<'all' | string>('all');
  const [showDupOnly, setShowDupOnly] = useState(false);

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<JournalEntrySummary[]>([]);
  const [manualTransactions, setManualTransactions] = useState<any[]>([]); // State for manual transactions
  const [unifiedRows, setUnifiedRows] = useState<UnifiedTxViewRow[]>([]); // NEW STATE for unified rows

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // Changed to string for unified IDs

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editingSourceType, setEditingSourceType] = useState<TransactionSourceType | null>(null); // Track which source is being edited
  const [editJEDetail, setEditJEDetail] = useState<JournalEntryDetail | null>(null); // JE detail
  const [editMTDetail, setEditMTDetail] = useState<any | null>(null); // MT detail (use proper interface)
  // JE edit fields
  const [editJEDate, setEditJEDate] = useState('');
  const [editJEMemo, setEditJEMemo] = useState('');
  const [editJEDebitAccountId, setEditJEDebitAccountId] = useState<number | ''>('');
  const [editJECreditAccountId, setEditJECreditAccountId] = useState<number | ''>('');
  const [editJEAmount, setEditJEAmount] = useState<number | ''>('');
  // MT edit fields
  const [editMTDate, setEditMTDate] = useState('');
  const [editMTDescription, setEditMTDescription] = useState('');
  const [editMTType, setEditMTType] = useState<'income' | 'expense' | 'transfer' | 'adjustment'>('expense'); // Default
  const [editMTCategory, setEditMTCategory] = useState('');
  const [editMTAmount, setEditMTAmount] = useState<number | ''>('');
  const [editMTAccountId, setEditMTAccountId] = useState<number | ''>('');

  // Accounts map
  const accountName = useCallback(
    (id?: number) => (id ? accounts.find(a => a.id === id)?.name || `#${id}` : '—'),
    [accounts]
  );

  // ---------- Fetch Accounts ----------
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setAccounts([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/accounts`, { headers: { 'Content-Type': 'application/json', ...authHeaders } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const clean = Array.isArray(data) ? data : [];
        setAccounts(
          clean.map((a: any) => ({
            id: Number(a.id),
            code: String(a.code ?? ''),
            name: String(a.name ?? ''),
            type: String(a.type ?? ''),
          }))
        );
      } catch (e) {
        console.error('Failed to load accounts', e);
        setAccounts([]);
      }
    })();
  }, [isAuthenticated, token, authHeaders]);

  // ---------- Fetch Journal Entry Summaries ----------
  const fetchSummaries = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setSummaries([]);
      return;
    }

    setLoading(true);
    try {
      const pageSize = 200;
      let page = 1;
      const all: JournalEntrySummary[] = [];

      const baseQS = new URLSearchParams();
      if (fromDate) baseQS.append('start', fromDate);
      if (toDate) baseQS.append('end', toDate);
      if (searchTerm) baseQS.append('q', searchTerm);

      const MAX_PAGES = 200;
      while (page <= MAX_PAGES) {
        const qs = new URLSearchParams(baseQS);
        qs.set('page', String(page));
        qs.set('pageSize', String(pageSize));

        const res = await fetch(`${API_BASE_URL}/journal-entries?${qs.toString()}`, {
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const items: JournalEntrySummary[] = (data?.items || []).map((r: any) => ({
          id: Number(r.id),
          entry_date: String(r.entry_date),
          memo: r.memo ?? null,
          total_debit: r.total_debit,
          total_credit: r.total_credit,
          line_count: Number(r.line_count || 0),
        }));

        all.push(...items);
        if (items.length < pageSize) break;
        page += 1;
      }

      setSummaries(all);
    } catch (e) {
      console.error('Failed to load journal-entries', e);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, authHeaders, fromDate, toDate, searchTerm]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // ---------- Fetch Manual Transactions ----------
  const fetchManualTransactions = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setManualTransactions([]);
      return;
    }
    try {
      // Build query string for manual transactions
      const mtQS = new URLSearchParams();
      if (fromDate) mtQS.append('fromDate', fromDate);
      if (toDate) mtQS.append('toDate', toDate);
      // Note: searchTerm filtering for MT might need backend support or client-side filtering

      const res = await fetch(`${API_BASE_URL}/transactions?${mtQS.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('[DEBUG] Fetched manual transactions:', data); // Debug log
      setManualTransactions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load manual transactions', e);
      setManualTransactions([]);
    }
  }, [isAuthenticated, token, authHeaders, fromDate, toDate]); // Refetch when dates change

  useEffect(() => {
    fetchManualTransactions();
  }, [fetchManualTransactions]);

  // ---------- Fetch details → build friendly rows (MODIFIED for unified view) ----------
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setUnifiedRows([]);
      return;
    }
    (async () => {
      // --- 1. Process Journal Entries ---
      let journalRows: UnifiedTxViewRow[] = [];
      if (summaries.length > 0) {
        setLoadingDetails(true);
        try {
          const details = await mapWithConcurrency(
            summaries,
            async (s) => {
              const res = await fetch(`${API_BASE_URL}/journal-entries/${s.id}`, {
                headers: { 'Content-Type': 'application/json', ...authHeaders },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const detail: JournalEntryDetail = await res.json();

              const lines = detail.lines || [];
              const bd = biggestDebit(lines);
              const bc = biggestCredit(lines);

              const amount = Math.max(
                parseNumber(s.total_debit),
                parseNumber(s.total_credit)
              );

              // --- Create Unified Row for Journal Entry ---
              const row: UnifiedTxViewRow = {
                id: `je-${s.id}`, // Prefix to ensure uniqueness
                sourceType: 'journal_entry',
                sourceId: s.id,
                date: s.entry_date,
                description: detail.entry.memo || '',
                amount,
                debitAccountName: accounts.find(a => a.id === bd?.account_id)?.name,
                creditAccountName: accounts.find(a => a.id === bc?.account_id)?.name,
                complex: lines.length > 2,
                lineCount: s.line_count,
              };
              return row;
              // --- End Create Unified Row ---
            },
            8
          );
          journalRows = details;
        } catch (e) {
          console.error('Failed to load journal-entries details', e);
          journalRows = [];
        } finally {
          // Don't reset loadingDetails yet, MT might still be loading
        }
      }

      // --- 2. Process Manual Transactions ---
      // Map manual transactions to the unified structure
      const manualRows: UnifiedTxViewRow[] = manualTransactions.map(tx => {
        // Find account name if account_id exists
        let accountName = '';
        if (tx.account_id) {
          const account = accounts.find(a => a.id === Number(tx.account_id));
          accountName = account ? account.name : `Account ${tx.account_id}`;
        } else if (tx.account_name) {
          accountName = tx.account_name;
        }

        // --- Create Unified Row for Manual Transaction ---
        return {
          id: `mt-${tx.id}`, // Prefix to ensure uniqueness
          sourceType: 'manual_transaction',
          sourceId: tx.id,
          date: tx.date,
          description: tx.description || tx.original_text || 'Manual Transaction',
          amount: Number(tx.amount) || 0,
          debitAccountName: accountName || tx.category || 'Uncategorized', // Show account or category
          creditAccountName: '', // Not used for manual transactions in this view
          category: tx.category || 'Uncategorized',
          type: tx.type || 'expense', // Default assumption
          accountId: tx.account_id ? Number(tx.account_id) : undefined,
          accountName: accountName,
        };
        // --- End Create Unified Row ---
      });
      // --- End Process Manual Transactions ---

      // --- 3. Combine and Compute Duplicates ---
      const combinedRows = [...journalRows, ...manualRows];

      // Compute duplicates across the combined result set
      const withDupFlags: UnifiedTxViewRow[] = combinedRows.map((row, idx) => {
        const matches: DupView[] = [];
        for (let j = 0; j < combinedRows.length; j++) {
          if (j === idx) continue;
          const other = combinedRows[j];
          // Simplified: only check within the same source type for now
          if (other.sourceType === row.sourceType) {
            const { isDup, score } = isPotentialDuplicate(row, other);
            if (isDup) {
              matches.push({
                id: Number(other.sourceId), // Use sourceId for DupView
                date: other.date,
                memo: other.description, // Use description for MT
                amount: other.amount,
                score,
              });
            }
          }
          // TODO: Add logic to compare JE amounts/memos to MT descriptions if needed
        }
        matches.sort((a, b) => b.score - a.score);
        return { ...row, dupCount: matches.length, dupMatches: matches };
      });
      // --- End Combine and Compute Duplicates ---

      setUnifiedRows(withDupFlags);
      setSelectedIds(new Set()); // clear selection on refresh
      setLoadingDetails(false); // Done loading both JE and MT details
    })();
  }, [summaries, manualTransactions, isAuthenticated, token, authHeaders, accounts]); // Add accounts dependency

  // ---------- Filter in UI by account / dup ----------
  const filteredRows = useMemo(() => {
    let r = unifiedRows;
    if (selectedAccountFilter !== 'all' && selectedAccountFilter) {
      const filterId = Number(selectedAccountFilter);
      r = r.filter(x => {
        if (x.sourceType === 'journal_entry') {
          return x.debitAccountId === filterId || x.creditAccountId === filterId;
        } else if (x.sourceType === 'manual_transaction') {
          return x.accountId === filterId;
        }
        return false;
      });
    }
    if (showDupOnly) {
      r = r.filter(x => (x.dupCount || 0) > 0);
    }
    // Add search term filtering
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        r = r.filter(x =>
            (x.description && x.description.toLowerCase().includes(term)) ||
            (x.debitAccountName && x.debitAccountName.toLowerCase().includes(term)) ||
            (x.creditAccountName && x.creditAccountName.toLowerCase().includes(term)) ||
            (x.category && x.category.toLowerCase().includes(term))
        );
    }
    return r;
  }, [unifiedRows, selectedAccountFilter, showDupOnly, searchTerm]); // Add searchTerm dependency

  // ---------- Select / Bulk delete ----------
  const toggleSelect = (id: string) => { // Change type to string
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every(r => selectedIds.has(r.id));
  const someVisibleSelected =
    !allVisibleSelected &&
    filteredRows.some(r => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredRows.map(r => r.id));
      setSelectedIds(prev => {
        const n = new Set(prev);
        visibleIds.forEach(id => n.delete(id));
        return n;
      });
    } else {
      setSelectedIds(prev => {
        const n = new Set(prev);
        filteredRows.forEach(r => n.add(r.id));
        return n;
      });
    }
  };

  // ---------- Delete ----------
  const deleteOne = async (unifiedId: string, sourceType: TransactionSourceType) => { // Updated signature
    if (!token) return alert('Not authenticated.');
    const confirmMsg = sourceType === 'journal_entry'
      ? 'Delete this journal entry? This cannot be undone.'
      : 'Delete this manual transaction? This cannot be undone.';
    if (!confirm(confirmMsg)) return;
    try {
      let url = '';
      if (sourceType === 'journal_entry') {
        url = `${API_BASE_URL}/journal-entries/${unifiedId.split('-')[1]}`; // Extract numeric ID
      } else {
        url = `${API_BASE_URL}/transactions/${unifiedId.split('-')[1]}`; // Extract string ID
      }
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // refresh both data sources
      fetchSummaries();
      fetchManualTransactions(); // Refresh MT list
    } catch (e: any) {
      console.error('Delete failed', e);
      alert(`Delete failed: ${e?.message || e}`);
    }
  };

  const deleteSelected = async () => {
    if (!token) return alert('Not authenticated.');
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;

    try {
      setLoading(true);
      for (const unifiedId of ids) {
        // Parse the unified ID to determine source and actual ID
        const parts = unifiedId.split('-');
        const sourceType: TransactionSourceType = parts[0] === 'je' ? 'journal_entry' : 'manual_transaction';
        const actualId = parts.slice(1).join('-'); // Re-join in case the original ID had dashes

        let url = '';
        if (sourceType === 'journal_entry') {
          url = `${API_BASE_URL}/journal-entries/${actualId}`;
        } else {
          url = `${API_BASE_URL}/transactions/${actualId}`;
        }
        const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Delete ${unifiedId} failed: ${res.status} ${errText}`);
        }
      }
      // refresh
      fetchSummaries();
      fetchManualTransactions(); // Refresh MT list
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error('Bulk delete failed', e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- Edit ----------
  const openEdit = async (unifiedId: string, sourceType: TransactionSourceType) => { // Updated signature
    if (!token) return alert('Not authenticated.');
    try {
      const parts = unifiedId.split('-');
      const actualId = parts.slice(1).join('-');

      let url = '';
      if (sourceType === 'journal_entry') {
        url = `${API_BASE_URL}/journal-entries/${actualId}`;
      } else {
        url = `${API_BASE_URL}/transactions/${actualId}`;
      }

      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (sourceType === 'journal_entry') {
        const data: JournalEntryDetail = await res.json();
        setEditJEDetail(data);
        setEditJEDate(data.entry.entry_date);
        setEditJEMemo(data.entry.memo || '');
        if (data.lines.length === 2) {
          const dLine = data.lines.find(l => parseNumber(l.debit) > 0);
          const cLine = data.lines.find(l => parseNumber(l.credit) > 0);
          const amount = Math.max(parseNumber(dLine?.debit), parseNumber(cLine?.credit));
          setEditJEDebitAccountId(dLine?.account_id ?? '');
          setEditJECreditAccountId(cLine?.account_id ?? '');
          setEditJEAmount(amount || '');
        } else {
          setEditJEDebitAccountId('');
          setEditJECreditAccountId('');
          setEditJEAmount('');
        }
        setEditingSourceType('journal_entry');
      } else {
        const data: any = await res.json(); // Use your Transaction interface
        setEditMTDetail(data);
        setEditMTDate(data.date);
        setEditMTDescription(data.description || data.original_text || '');
        setEditMTType(data.type || 'expense');
        setEditMTCategory(data.category || '');
        setEditMTAmount(data.amount ? Number(data.amount) : '');
        setEditMTAccountId(data.account_id ? Number(data.account_id) : '');
        setEditingSourceType('manual_transaction');
      }
      setEditOpen(true);
    } catch (e: any) {
      console.error('Load detail failed', e);
      alert(`Failed to open editor: ${e?.message || String(e)}`);
    }
  };

  const saveEdit = async () => {
    if (!token) return alert('Not authenticated.');
    if (editingSourceType === 'journal_entry' && editJEDetail) {
      try {
        let payload: any = {
          entryDate: editJEDate,
          memo: editJEMemo || null,
          lines: [] as Array<{ accountId: number; debit: number; credit: number }>,
        };

        if (editJEDetail.lines.length === 2) {
          const amt = typeof editJEAmount === 'number' ? editJEAmount : parseFloat(String(editJEAmount || 0));
          if (!amt || !editJEDebitAccountId || !editJECreditAccountId) {
            alert('Please provide debit account, credit account, and a non-zero amount.');
            return;
          }
          payload.lines = [
            { accountId: Number(editJEDebitAccountId), debit: amt, credit: 0 },
            { accountId: Number(editJECreditAccountId), debit: 0, credit: amt },
          ];
        } else {
          payload.lines = editJEDetail.lines.map(l => ({
            accountId: l.account_id,
            debit: parseNumber(l.debit),
            credit: parseNumber(l.credit),
          }));
        }

        const res = await fetch(`${API_BASE_URL}/journal-entries/${editJEDetail.entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `HTTP ${res.status}`);
        }
      } catch (e: any) {
        console.error('Save JE failed', e);
        alert(`Save failed: ${e?.message || String(e)}`);
        return; // Stop if JE save fails
      }
    } else if (editingSourceType === 'manual_transaction' && editMTDetail) {
      try {
        const payload = {
          date: editMTDate,
          description: editMTDescription,
          type: editMTType,
          category: editMTCategory,
          amount: typeof editMTAmount === 'number' ? editMTAmount : parseFloat(String(editMTAmount || 0)),
          account_id: editMTAccountId || null,
        };

        const res = await fetch(`${API_BASE_URL}/transactions/${editMTDetail.id}`, {
          method: 'PUT', // Or PATCH if your backend supports it
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `HTTP ${res.status}`);
        }
      } catch (e: any) {
        console.error('Save MT failed', e);
        alert(`Save failed: ${e?.message || String(e)}`);
        return; // Stop if MT save fails
      }
    }

    // If we get here, save was successful
    setEditOpen(false);
    setEditJEDetail(null);
    setEditMTDetail(null);
    setEditingSourceType(null);
    // refresh list
    fetchSummaries();
    fetchManualTransactions(); // Refresh MT list
  };

  // ---------- Export / Print ----------
  const exportCsv = () => {
    if (!filteredRows.length) {
      alert('No rows to export.');
      return;
    }
    const headers = [
      'ID',
      'Date',
      'Description',
      'Accounts / Category',
      'Amount',
      'Source',
      'Type', // Add type for clarity
      'Dup Count',
    ];
    const csvRows = filteredRows.map(r => {
      let accountsOrCategory = '';
      if (r.sourceType === 'journal_entry') {
        accountsOrCategory = `${r.debitAccountName || '—'} ↔ ${r.creditAccountName || '—'}`;
      } else {
        accountsOrCategory = r.accountName || r.category || 'Uncategorized';
      }
      return ([
        r.id,
        r.date,
        (r.description || '').replace(/"/g, '""'),
        accountsOrCategory.replace(/"/g, '""'),
        r.amount.toFixed(2),
        r.sourceType === 'journal_entry' ? 'Journal Entry' : 'Manual Transaction',
        r.type || '', // For JE, this will be empty
        r.dupCount || 0,
      ].map(x => `"${String(x)}"`).join(','));
    });
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const printPage = () => window.print();

  // ---------- Render ----------
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Transactions" />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Filters</CardTitle>
            <CardDescription>
              This view shows both journal entries (double-entry) and manual transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="col-span-1">
                <Label className="mb-2 block">Search (description)</Label>
                <Input
                  placeholder="Type to search…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="col-span-1">
                <Label className="mb-2 block">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="col-span-1">
                <Label className="mb-2 block">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="col-span-1">
                <Label className="mb-2 block">Filter by Account</Label>
                <Select
                  value={selectedAccountFilter}
                  onValueChange={(v) => setSelectedAccountFilter(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex items-end">
                <Button
                  type="button"
                  variant={showDupOnly ? 'default' : 'outline'}
                  onClick={() => setShowDupOnly(v => !v)}
                  className="w-full"
                >
                  {showDupOnly ? 'Showing Duplicates' : 'Duplicates Only'}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => { fetchSummaries(); fetchManualTransactions(); }} disabled={loading}>Apply</Button>
              <Button variant="ghost" onClick={() => { setSearchTerm(''); setFromDate(''); setToDate(''); setSelectedAccountFilter('all'); setShowDupOnly(false); }}>Reset</Button>
            </div>
          </CardContent>
        </Card>

        {/* Top actions */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loading || loadingDetails ? 'Loading…' : `${filteredRows.length} transaction(s)`}{loadingDetails ? ' (resolving accounts…)': ''}
          </div>
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={deleteSelected} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv}>
              <FileText className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={printPage}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Unified Transaction History</CardTitle>
            <CardDescription>
              Journal Entries (double-entry) and Manual Transactions combined.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-left p-3">Accounts / Category</th>
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Source</th> {/* New Column */}
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || loadingDetails ? ( // Show loading if either is happening
                    <tr><td colSpan={7} className="text-center py-12">Loading…</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)} // Use unified ID
                            onChange={() => toggleSelect(r.id)} // Pass unified ID
                            aria-label={`Select transaction ${r.id}`}
                          />
                        </td>
                        <td className="p-3">{new Date(r.date).toLocaleDateString()}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span>{r.description || '—'}</span>
                            {r.complex && (
                              <Badge variant="secondary" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> multi-line
                              </Badge>
                            )}
                            {r.lineCount !== undefined && r.lineCount > 2 && (
                               <Badge variant="secondary" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> {r.lineCount} lines
                              </Badge>
                            )}
                            {(r.dupCount || 0) > 0 && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Badge variant="destructive" className="cursor-pointer">
                                    Possible dup ({r.dupCount})
                                  </Badge>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Potential duplicates for entry {r.id}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-2 mt-2 text-sm">
                                    {(r.dupMatches || []).map(m => (
                                      <div key={`${r.sourceType}-${m.id}`} className="border rounded p-2"> {/* Adjust key */}
                                        <div><strong>ID:</strong> {m.id} ({r.sourceType === 'journal_entry' ? 'JE' : 'MT'})</div> {/* Show source type */}
                                        <div><strong>Date:</strong> {m.date}</div>
                                        <div className="truncate"><strong>Memo:</strong> {m.memo || '—'}</div>
                                        <div><strong>Amount:</strong> {fmtMoney(m.amount)}</div>
                                        <div><strong>Similarity:</strong> {(m.score * 100).toFixed(0)}%</div>
                                      </div>
                                    ))}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {/* Display logic based on source type */}
                          {r.sourceType === 'journal_entry' ? (
                            <>
                              {r.debitAccountName || '—'} <span className="opacity-60">↔</span> {r.creditAccountName || '—'}
                              {r.complex && <span className="ml-1 text-xs text-muted-foreground">(Complex)</span>}
                            </>
                          ) : (
                            <>
                              {r.accountName || r.category || r.debitAccountName || 'Uncategorized'} {/* Prioritize account name, then category */}
                              {r.type && <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">{r.type}</span>}
                            </>
                          )}
                        </td>
                        <td className="p-3">{fmtMoney(r.amount)}</td>
                        <td className="p-3">
                          {/* Show source type */}
                          <Badge variant={r.sourceType === 'journal_entry' ? 'default' : 'secondary'}>
                            {r.sourceType === 'journal_entry' ? 'Journal Entry' : 'Manual Transaction'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r.id, r.sourceType)}> {/* Pass unified ID and source type */}
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteOne(r.id, r.sourceType)}> {/* Pass unified ID and source type */}
                              <Trash2 className="h-4 w-4 text-red-500" />
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

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="sm:max-w-[640px] p-0 overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveEdit();
            }
          }}
        >
          {/* Header */}
          <div className="bg-muted/30 px-6 py-4 border-b">
            <DialogHeader>
              <DialogTitle className="text-lg">Edit Transaction</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Update details for {editingSourceType === 'journal_entry' ? 'Journal Entry' : 'Manual Transaction'}.
              </p>
            </DialogHeader>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6">
            {!editJEDetail && !editMTDetail ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                {/* Row 1: Date / Memo/Description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Date</Label>
                    <Input
                      type="date"
                      value={editingSourceType === 'journal_entry' ? editJEDate : editMTDate}
                      onChange={(e) => editingSourceType === 'journal_entry' ? setEditJEDate(e.target.value) : setEditMTDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">{editingSourceType === 'journal_entry' ? 'Memo' : 'Description'}</Label>
                    <Input
                      value={editingSourceType === 'journal_entry' ? editJEMemo : editMTDescription}
                      onChange={(e) => editingSourceType === 'journal_entry' ? setEditJEMemo(e.target.value) : setEditMTDescription(e.target.value)}
                      placeholder="(optional)"
                      className="h-10"
                    />
                  </div>
                </div>

                <Separator />

                {/* Row 2: Source-specific fields */}
                {editingSourceType === 'journal_entry' && editJEDetail && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                        Journal Entry (Editable)
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        We’ll save a balanced Dr/Cr for the amount.
                      </span>
                    </div>

                    {editJEDetail.lines.length === 2 ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label className="mb-2 block">Debit Account</Label>
                          <Select
                            value={editJEDebitAccountId === '' ? '' : String(editJEDebitAccountId)}
                            onValueChange={(v) => setEditJEDebitAccountId(v ? Number(v) : '')}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select debit account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  {a.name} ({a.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="mb-2 block">Credit Account</Label>
                          <Select
                            value={editJECreditAccountId === '' ? '' : String(editJECreditAccountId)}
                            onValueChange={(v) => setEditJECreditAccountId(v ? Number(v) : '')}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select credit account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  {a.name} ({a.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="mb-2 block">Amount</Label>
                          <div className="flex">
                            <span className="inline-flex items-center px-3 border border-r-0 rounded-l-md text-sm text-muted-foreground bg-muted/40">
                              R
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              value={editJEAmount}
                              onChange={(e) =>
                                setEditJEAmount(e.target.value === '' ? '' : Number(e.target.value))
                              }
                              placeholder="0.00"
                              className="rounded-l-none h-10 text-right"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-md border bg-amber-50/60">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div className="text-sm">
                            <div className="font-medium text-amber-900">Multi-line journal</div>
                            <div className="text-amber-900/90">
                              This entry has {editJEDetail.lines.length} lines. You can change the date & memo
                              here. For line-level edits, use the Journals screen.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editingSourceType === 'manual_transaction' && editMTDetail && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                        Manual Transaction (Editable)
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="mb-2 block">Type</Label>
                         <Select value={editMTType} onValueChange={(v: any) => setEditMTType(v)}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="expense">Expense</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                            <SelectItem value="adjustment">Adjustment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-2 block">Category</Label>
                        <Input
                          value={editMTCategory}
                          onChange={(e) => setEditMTCategory(e.target.value)}
                          className="h-10"
                        />
                      </div>
                       <div>
                        <Label className="mb-2 block">Amount</Label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 border border-r-0 rounded-l-md text-sm text-muted-foreground bg-muted/40">
                            R
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            value={editMTAmount}
                            onChange={(e) =>
                              setEditMTAmount(e.target.value === '' ? '' : Number(e.target.value))
                            }
                            placeholder="0.00"
                            className="rounded-l-none h-10 text-right"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Account</Label>
                        <Select
                          value={editMTAccountId === '' ? '' : String(editMTAccountId)}
                          onValueChange={(v) => setEditMTAccountId(v ? Number(v) : '')}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.name} ({a.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Transactions;