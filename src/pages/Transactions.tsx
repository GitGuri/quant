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

interface TxViewRow {
  id: number;
  date: string;
  memo: string;
  amount: number;                 // Largest of total_debit/total_credit (positive)
  lineCount: number;
  debitAccountId?: number;
  creditAccountId?: number;
  debitAccountName?: string;
  creditAccountName?: string;
  complex?: boolean;

  // duplicates UI
  dupCount?: number;
  dupMatches?: DupView[];
}

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
const isPotentialDuplicate = (aRow: TxViewRow, bRow: TxViewRow) => {
  if (aRow.id === bRow.id) return { isDup: false, score: 0 };
  // amounts must match exactly to be “strong dup” for posted journals
  const amountMatch = Math.abs(Number(aRow.amount) - Number(bRow.amount)) <= 0.01;
  if (!amountMatch) return { isDup: false, score: 0 };

  const dateClose = daysBetween(aRow.date, bRow.date) <= 2;

  const A = tokenSet(aRow.memo);
  const B = tokenSet(bRow.memo);
  const jac = jaccard(A, B);
  const substring =
    normalize(aRow.memo).includes(normalize(bRow.memo)) ||
    normalize(bRow.memo).includes(normalize(aRow.memo));
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
  const [rows, setRows] = useState<TxViewRow[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<JournalEntryDetail | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editMemo, setEditMemo] = useState('');
  // editable only when exactly 2 lines
  const [editDebitAccountId, setEditDebitAccountId] = useState<number | ''>('');
  const [editCreditAccountId, setEditCreditAccountId] = useState<number | ''>('');
  const [editAmount, setEditAmount] = useState<number | ''>('');

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
  // ---------- Fetch Journal Entry Summaries (auto-fetch all pages) ----------
const fetchSummaries = useCallback(async () => {
  if (!isAuthenticated || !token) {
    setSummaries([]);
    setRows([]);
    return;
  }

  setLoading(true);
  try {
    const pageSize = 200; // ask for the server max to reduce round-trips
    let page = 1;
    const all: JournalEntrySummary[] = [];

    // build the static query bits once
    const baseQS = new URLSearchParams();
    if (fromDate) baseQS.append('start', fromDate);
    if (toDate)   baseQS.append('end', toDate);
    if (searchTerm) baseQS.append('q', searchTerm);

    // pull pages until the server returns less than a full page
    // or we hit a hard safety cap to avoid accidental infinite loops
    const MAX_PAGES = 200; 
    // (200 pages × 200 rows = 40k rows—way more than you’ll need in UI)
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

      // stop if we got a short page or empty
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

  // ---------- Fetch details → build friendly rows ----------
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setRows([]);
      return;
    }
    (async () => {
      if (!summaries.length) {
        setRows([]);
        return;
      }
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

            const row: TxViewRow = {
              id: s.id,
              date: s.entry_date,
              memo: detail.entry.memo || '',
              amount,
              lineCount: s.line_count,
              debitAccountId: bd?.account_id,
              creditAccountId: bc?.account_id,
              complex: lines.length > 2,
            };
            return row;
          },
          8
        );

        // attach names
        const withNames: TxViewRow[] = details.map(r => ({
          ...r,
          debitAccountName: accountName(r.debitAccountId),
          creditAccountName: accountName(r.creditAccountId),
        }));

        // compute duplicates across current result set
        const withDupFlags: TxViewRow[] = withNames.map((row, idx) => {
          const matches: DupView[] = [];
          for (let j = 0; j < withNames.length; j++) {
            if (j === idx) continue;
            const other = withNames[j];
            const { isDup, score } = isPotentialDuplicate(row, other);
            if (isDup) {
              matches.push({
                id: other.id,
                date: other.date,
                memo: other.memo,
                amount: other.amount,
                score,
              });
            }
          }
          matches.sort((a, b) => b.score - a.score);
          return { ...row, dupCount: matches.length, dupMatches: matches };
        });

        setRows(withDupFlags);
        setSelectedIds(new Set()); // clear selection on refresh
      } catch (e) {
        console.error('Failed to load journal-entries details', e);
        setRows([]);
      } finally {
        setLoadingDetails(false);
      }
    })();
  }, [summaries, isAuthenticated, token, authHeaders, accountName]);

  // ---------- Filter in UI by account / dup ----------
  const filteredRows = useMemo(() => {
    let r = rows;
    if (selectedAccountFilter !== 'all' && selectedAccountFilter) {
      const id = Number(selectedAccountFilter);
      r = r.filter(x => x.debitAccountId === id || x.creditAccountId === id);
    }
    if (showDupOnly) {
      r = r.filter(x => (x.dupCount || 0) > 0);
    }
    return r;
  }, [rows, selectedAccountFilter, showDupOnly]);

  // ---------- Select / Bulk delete ----------
  const toggleSelect = (id: number) => {
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
      // clear visible
      const visibleIds = new Set(filteredRows.map(r => r.id));
      setSelectedIds(prev => {
        const n = new Set(prev);
        visibleIds.forEach(id => n.delete(id));
        return n;
      });
    } else {
      // select all visible
      setSelectedIds(prev => {
        const n = new Set(prev);
        filteredRows.forEach(r => n.add(r.id));
        return n;
      });
    }
  };

  const deleteOne = async (id: number) => {
    if (!token) return alert('Not authenticated.');
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/journal-entries/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // refresh
      fetchSummaries();
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
      for (const id of ids) {
        const res = await fetch(`${API_BASE_URL}/journal-entries/${id}`, { method: 'DELETE', headers: { ...authHeaders } });
        if (!res.ok) throw new Error(`Delete ${id} failed: HTTP ${res.status}`);
      }
      fetchSummaries();
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error('Bulk delete failed', e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- Edit ----------
  const openEdit = async (id: number) => {
    if (!token) return alert('Not authenticated.');
    try {
      const res = await fetch(`${API_BASE_URL}/journal-entries/${id}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: JournalEntryDetail = await res.json();
      setEditDetail(data);
      setEditDate(data.entry.entry_date);
      setEditMemo(data.entry.memo || '');

      if (data.lines.length === 2) {
        const dLine = data.lines.find(l => parseNumber(l.debit) > 0);
        const cLine = data.lines.find(l => parseNumber(l.credit) > 0);
        const amount = Math.max(parseNumber(dLine?.debit), parseNumber(cLine?.credit));
        setEditDebitAccountId(dLine?.account_id ?? '');
        setEditCreditAccountId(cLine?.account_id ?? '');
        setEditAmount(amount || '');
      } else {
        // complex entry → disable line editing; allow header edits only
        setEditDebitAccountId('');
        setEditCreditAccountId('');
        setEditAmount('');
      }

      setEditOpen(true);
    } catch (e: any) {
      console.error('Load detail failed', e);
      alert(`Failed to open editor: ${e?.message || String(e)}`);
    }
  };

  const saveEdit = async () => {
    if (!editDetail) return;
    if (!token) return alert('Not authenticated.');
    try {
      // Always update date & memo
      let payload: any = {
        entryDate: editDate,
        memo: editMemo || null,
        lines: [] as Array<{ accountId: number; debit: number; credit: number }>,
      };

      if (editDetail.lines.length === 2) {
        // two-line edit
        const amt = typeof editAmount === 'number' ? editAmount : parseFloat(String(editAmount || 0));
        if (!amt || !editDebitAccountId || !editCreditAccountId) {
          alert('Please provide debit account, credit account, and a non-zero amount.');
          return;
        }
        payload.lines = [
          { accountId: Number(editDebitAccountId), debit: amt, credit: 0 },
          { accountId: Number(editCreditAccountId), debit: 0, credit: amt },
        ];
      } else {
        // complex: keep old lines, only header changes
        payload.lines = editDetail.lines.map(l => ({
          accountId: l.account_id,
          debit: parseNumber(l.debit),
          credit: parseNumber(l.credit),
        }));
      }

      const res = await fetch(`${API_BASE_URL}/journal-entries/${editDetail.entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      setEditOpen(false);
      setEditDetail(null);
      // refresh list
      fetchSummaries();
    } catch (e: any) {
      console.error('Save failed', e);
      alert(`Save failed: ${e?.message || String(e)}`);
    }
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
      'Memo',
      'Debit Account',
      'Credit Account',
      'Amount',
      'Lines',
      'Dup Count',
    ];
    const csvRows = filteredRows.map(r => ([
      r.id,
      r.date,
      (r.memo || '').replace(/"/g, '""'),
      (r.debitAccountName || '').replace(/"/g, '""'),
      (r.creditAccountName || '').replace(/"/g, '""'),
      r.amount.toFixed(2),
      r.lineCount,
      r.dupCount || 0,
    ].map(x => `"${String(x)}"`).join(',')));
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
              This view shows journal entries in a transaction-friendly way (debit ↔ credit). It also flags potential duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="col-span-1">
                <Label className="mb-2 block">Search (memo)</Label>
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
              <Button variant="outline" onClick={fetchSummaries} disabled={loading}>Apply</Button>
              <Button variant="ghost" onClick={() => { setSearchTerm(''); setFromDate(''); setToDate(''); setSelectedAccountFilter('all'); setShowDupOnly(false); }}>Reset</Button>
            </div>
          </CardContent>
        </Card>

        {/* Top actions */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${filteredRows.length} transaction(s)`}{loadingDetails ? ' (resolving accounts…)': ''}
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
            <CardTitle>Transaction History</CardTitle>
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
                    <th className="text-left p-3">Debit ↔ Credit</th>
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Lines</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-12">Loading…</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            aria-label={`Select entry ${r.id}`}
                          />
                        </td>
                        <td className="p-3">{new Date(r.date).toLocaleDateString()}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span>{r.memo || '—'}</span>
                            {r.complex && (
                              <Badge variant="secondary" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> multi-line
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
                                    <DialogTitle>Potential duplicates for entry #{r.id}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-2 mt-2 text-sm">
                                    {(r.dupMatches || []).map(m => (
                                      <div key={m.id} className="border rounded p-2">
                                        <div><strong>ID:</strong> {m.id}</div>
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
                          {r.debitAccountName || '—'} <span className="opacity-60">↔</span> {r.creditAccountName || '—'}
                        </td>
                        <td className="p-3">{fmtMoney(r.amount)}</td>
                        <td className="p-3">{r.lineCount}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r.id)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteOne(r.id)}>
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
          Update date, memo, and (for 2-line entries) the debit/credit accounts and amount.
        </p>
      </DialogHeader>
    </div>

    {/* Body */}
    <div className="px-6 py-5 space-y-6">
      {!editDetail ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Row 1: Date / Memo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Date</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label className="mb-2 block">Memo</Label>
              <Input
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="(optional)"
                className="h-10"
              />
            </div>
          </div>

          <Separator />

          {/* Row 2: Accounts / Amount (only for 2-line) */}
          {editDetail.lines.length === 2 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                  2-line entry (editable)
                </Badge>
                <span className="text-xs text-muted-foreground">
                  We’ll save a balanced Dr/Cr for the amount.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="mb-2 block">Debit Account</Label>
                  <Select
                    value={editDebitAccountId === '' ? '' : String(editDebitAccountId)}
                    onValueChange={(v) => setEditDebitAccountId(v ? Number(v) : '')}
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
                    value={editCreditAccountId === '' ? '' : String(editCreditAccountId)}
                    onValueChange={(v) => setEditCreditAccountId(v ? Number(v) : '')}
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
                      value={editAmount}
                      onChange={(e) =>
                        setEditAmount(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="0.00"
                      className="rounded-l-none h-10 text-right"
                    />
                  </div>
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
                    This entry has {editDetail.lines.length} lines. You can change the date & memo
                    here. For line-level edits, use the Journals screen (or split into a two-line
                    entry).
                  </div>
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
