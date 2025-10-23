// src/pages/Transactions.tsx
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
import { Edit, Printer, FileText, Trash2, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useAuth } from '../AuthPage';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { useCurrency } from '../contexts/CurrencyContext';

// ---------------- Types ----------------
interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface JournalEntryListRow {
  id: number;
  entry_date: string;      // YYYY-MM-DD
  memo: string | null;
  total_debit: string | number;
  total_credit: string | number;
  line_count: number;
  debit_account_id: number | null;
  debit_account_name: string | null;
  credit_account_id: number | null;
  credit_account_name: string | null;
  amount?: number;
}

interface JournalLine {
  id: number;
  account_id: number;
  account_name?: string;
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
interface DupView {
  id: number;
  date: string;
  memo: string;
  amount: number;
  score: number; // 0..1
}

type TransactionSourceType = 'journal_entry';
interface UnifiedTxViewRow {
  id: string;               // e.g. "je-123"
  sourceType: TransactionSourceType;
  sourceId: number;         // original JE id
  date: string;
  description: string;
  amount: number;
  debitAccountId?: number;
  creditAccountId?: number;
  debitAccountName?: string;
  creditAccountName?: string;
  complex?: boolean;
  lineCount?: number;
  dupCount?: number;
  dupMatches?: DupView[];
}

// -------------- Helpers --------------
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';
const parseNumber = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

// Default month bounds (yyyy-mm-01 → yyyy-mm-last)
function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0..11
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

// duplicate helpers
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

const isPotentialDuplicate = (aRow: UnifiedTxViewRow, bRow: UnifiedTxViewRow) => {
  if (aRow.id === bRow.id) return { isDup: false, score: 0 };
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

// Grouping helpers (for "delete dups keep 1")
function buildDuplicateGroups(rows: UnifiedTxViewRow[]) {
  const byAmount = new Map<number, UnifiedTxViewRow[]>();
  for (const r of rows) {
    const key = Number(r.amount.toFixed(2));
    const list = byAmount.get(key) || [];
    list.push(r);
    byAmount.set(key, list);
  }
  const groups: UnifiedTxViewRow[][] = [];
  const seen = new Set<string>();
  for (const [, list] of byAmount) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (seen.has(a.id)) continue;
      const group = [a];
      seen.add(a.id);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (seen.has(b.id)) continue;
        const { isDup } = isPotentialDuplicate(a, b);
        if (isDup) {
          group.push(b);
          seen.add(b.id);
        }
      }
      if (group.length > 1) groups.push(group);
    }
  }
  return groups;
}
function pickSurvivor(group: UnifiedTxViewRow[]) {
  const sorted = [...group].sort((a, b) => {
    const ad = new Date(a.date).getTime();
    const bd = new Date(b.date).getTime();
    if (ad !== bd) return ad - bd;                    // earliest date first
    const aid = Number(a.sourceId);
    const bid = Number(b.sourceId);
    return aid - bid;                                 // then lowest id
  });
  return sorted[0];
}

// ---------------- Component ----------------
const Transactions: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { symbol, fmt } = useCurrency();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // UI / filters
  const [searchTerm, setSearchTerm] = useState('');
  const [{ from: defaultFrom, to: defaultTo }] = useState(currentMonthBounds);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<'all' | string>('all');
  const [showDupOnly, setShowDupOnly] = useState(false);

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [unifiedRows, setUnifiedRows] = useState<UnifiedTxViewRow[]>([]);

  // Pagination
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [appending, setAppending] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading
  const [loading, setLoading] = useState(false);
  const [computingDups, setComputingDups] = useState(false);
  const [deleteDupBusy, setDeleteDupBusy] = useState(false);
  const [dupGroupsPreview, setDupGroupsPreview] = useState<
    { survivor: UnifiedTxViewRow; duplicates: UnifiedTxViewRow[] }[]
  >([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle');

  // Optional: show monthly edits left in dialog
  const [quota, setQuota] = useState<{ used: number; limit: number | null } | null>(null);

  // ---------- Fetch Accounts ----------
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setAccounts([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/accounts`, {
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        });
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

  // ---------- Map server row -> unified row ----------
  const toUnified = useCallback((r: JournalEntryListRow): UnifiedTxViewRow => {
    const amount = typeof r.amount === 'number' && !Number.isNaN(r.amount)
      ? r.amount
      : Math.max(parseNumber(r.total_debit), parseNumber(r.total_credit));
    return {
      id: `je-${r.id}`,
      sourceType: 'journal_entry',
      sourceId: r.id,
      date: r.entry_date,
      description: r.memo || '',
      amount,
      debitAccountId: r.debit_account_id ?? undefined,
      creditAccountId: r.credit_account_id ?? undefined,
      debitAccountName: r.debit_account_name ?? undefined,
      creditAccountName: r.credit_account_name ?? undefined,
      complex: (r.line_count || 0) > 2,
      lineCount: r.line_count,
    };
  }, []);

  // ---------- Fetch JE list (paginated) ----------
  const fetchSummaries = useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    if (!isAuthenticated || !token) {
      setUnifiedRows([]);
      setNextCursor(null);
      return;
    }
    const qs = new URLSearchParams();
    if (fromDate) qs.append('start', fromDate);
    if (toDate)   qs.append('end', toDate);
    if (searchTerm) qs.append('q', searchTerm);
    qs.append('limit', '200');
    if (mode === 'append' && nextCursor) qs.append('cursor', nextCursor);

    mode === 'append' ? setAppending(true) : setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/journal-entries?${qs.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: JournalEntryListRow[] = data?.items || [];
      const mapped = items.map(toUnified);

      if (mode === 'append') {
        setUnifiedRows(prev => [...prev, ...mapped]);
      } else {
        setUnifiedRows(mapped);
        setSelectedIds(new Set());
      }
      setNextCursor(data?.next_cursor || null);
    } catch (e) {
      console.error('Failed to load journal-entries', e);
      if (mode !== 'append') {
        setUnifiedRows([]);
        setNextCursor(null);
      }
    } finally {
      mode === 'append' ? setAppending(false) : setLoading(false);
    }
  }, [isAuthenticated, token, fromDate, toDate, searchTerm, authHeaders, nextCursor, toUnified]);

  // Initial load (current month)
  useEffect(() => {
    fetchSummaries('reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- On-demand duplicate computation ----------
  useEffect(() => {
    if (!showDupOnly || unifiedRows.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        setComputingDups(true);

        const byAmount = new Map<number, UnifiedTxViewRow[]>();
        for (const r of unifiedRows) {
          const key = Number(r.amount.toFixed(2));
          const list = byAmount.get(key) || [];
          list.push(r);
          byAmount.set(key, list);
        }

        const next = unifiedRows.map(r => ({ ...r, dupCount: 0, dupMatches: [] as DupView[] }));

        for (const [_amt, list] of byAmount) {
          if (list.length < 2) continue;
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i], b = list[j];
              const { isDup, score } = isPotentialDuplicate(a, b);
              if (!isDup) continue;

              const ai = next.findIndex(x => x.id === a.id);
              const bi = next.findIndex(x => x.id === b.id);
              if (ai >= 0) {
                (next[ai].dupMatches as DupView[]).push({
                  id: Number(b.sourceId),
                  date: b.date,
                  memo: b.description,
                  amount: b.amount,
                  score,
                });
                next[ai].dupCount = (next[ai].dupMatches as DupView[]).length;
              }
              if (bi >= 0) {
                (next[bi].dupMatches as DupView[]).push({
                  id: Number(a.sourceId),
                  date: a.date,
                  memo: a.description,
                  amount: a.amount,
                  score,
                });
                next[bi].dupCount = (next[bi].dupMatches as DupView[]).length;
              }
            }
          }
        }

        for (const r of next) {
          if (r.dupMatches && r.dupMatches.length) {
            r.dupMatches.sort((x, y) => y.score - x.score);
          }
        }

        if (!cancelled) setUnifiedRows(next);
      } finally {
        if (!cancelled) setComputingDups(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showDupOnly, unifiedRows]);

  // ---------- Build / preview groups and delete dups (keep 1) ----------
  const previewDuplicateGroups = async () => {
    const groups = buildDuplicateGroups(unifiedRows);
    const preview = groups.map(g => {
      const survivor = pickSurvivor(g);
      const duplicates = g.filter(x => x.id !== survivor.id);
      return { survivor, duplicates };
    }).filter(g => g.duplicates.length > 0);
    setDupGroupsPreview(preview);
    if (!preview.length) {
      toast({
        title: 'No duplicates found',
        description: 'Try widening the date range or disabling filters.',
      });
    }
  };

  const deleteDuplicatesKeepOne = async () => {
    if (!dupGroupsPreview.length) {
      await previewDuplicateGroups();
      if (!dupGroupsPreview.length) return;
    }
    const totalDeletes = dupGroupsPreview.reduce((n, g) => n + g.duplicates.length, 0);
    // native confirm kept for speed; swap to shadcn AlertDialog later if you want
    if (!confirm(`Delete ${totalDeletes} duplicate entr${totalDeletes === 1 ? 'y' : 'ies'} across ${dupGroupsPreview.length} group(s)? This cannot be undone.`)) {
      return;
    }

    setDeleteDupBusy(true);
    try {
      const idsToDelete = dupGroupsPreview.flatMap(g => g.duplicates.map(d => d.sourceId));
      const CHUNK = 25;
      for (let i = 0; i < idsToDelete.length; i += CHUNK) {
        const chunk = idsToDelete.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(async (id) => {
            const url = `${API_BASE_URL}/journal-entries/${id}`;
            const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              console.warn(`Failed to delete JE ${id}: ${res.status} ${txt}`);
            }
          })
        );
      }
      await fetchSummaries('reset');
      setDupGroupsPreview([]);
      toast({ title: 'Duplicates removed', description: 'We kept one per group.' });
    } catch (e: any) {
      console.error('Delete duplicates failed', e);
      toast({ variant: 'destructive', title: 'Delete failed', description: e?.message || String(e) });
    } finally {
      setDeleteDupBusy(false);
    }
  };

  // ---------- Filter in UI by account / dup / search ----------
  const resolveAccountLabel = useCallback(
    (id?: number, nameFromLine?: string) => {
      if (nameFromLine && nameFromLine.trim()) return nameFromLine;
      const f = accounts.find(a => a.id === id);
      return f ? f.name : (id ? `#${id}` : '—');
    },
    [accounts]
  );

  const filteredRows = useMemo(() => {
    let r = unifiedRows;

    if (selectedAccountFilter !== 'all' && selectedAccountFilter) {
      const filterId = Number(selectedAccountFilter);
      r = r.filter(x => x.debitAccountId === filterId || x.creditAccountId === filterId);
    }

    if (showDupOnly) {
      r = r.filter(x => (x.dupCount || 0) > 0);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      r = r.filter(x =>
        (x.description && x.description.toLowerCase().includes(term)) ||
        resolveAccountLabel(x.debitAccountId, x.debitAccountName).toLowerCase().includes(term) ||
        resolveAccountLabel(x.creditAccountId, x.creditAccountName).toLowerCase().includes(term)
      );
    }
    return r;
  }, [unifiedRows, selectedAccountFilter, showDupOnly, searchTerm, resolveAccountLabel]);

  // ---------- Select / Bulk delete ----------
  const toggleSelect = (id: string) => {
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

  // ---------- Delete ----------
  const deleteOne = async (unifiedId: string, _sourceType: TransactionSourceType) => {
    if (!token) { toast({ variant: 'destructive', title: 'Not authenticated' }); return; }
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    try {
      const url = `${API_BASE_URL}/journal-entries/${unifiedId.split('-')[1]}`;
      const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchSummaries('reset');
      toast({ title: 'Entry deleted' });
    } catch (e: any) {
      console.error('Delete failed', e);
      toast({ variant: 'destructive', title: 'Delete failed', description: e?.message || String(e) });
    }
  };

  const deleteSelected = async () => {
    if (!token) { toast({ variant: 'destructive', title: 'Not authenticated' }); return; }
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    try {
      setLoading(true);
      for (const unifiedId of ids) {
        const actualId = unifiedId.split('-').slice(1).join('-');
        const url = `${API_BASE_URL}/journal-entries/${actualId}`;
        const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Delete ${unifiedId} failed: ${res.status} ${errText}`);
        }
      }
      await fetchSummaries('reset');
      setSelectedIds(new Set());
      toast({ title: 'Deleted selected entries' });
    } catch (e: any) {
      console.error('Bulk delete failed', e);
      toast({ variant: 'destructive', title: 'Bulk delete failed', description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Edit ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editingSourceType, setEditingSourceType] = useState<TransactionSourceType | null>(null);
  const [editJEDetail, setEditJEDetail] = useState<JournalEntryDetail | null>(null);
  const [editJEDate, setEditJEDate] = useState('');
  const [editJEMemo, setEditJEMemo] = useState('');
  const [editJEDebitAccountId, setEditJEDebitAccountId] = useState<number | ''>('');
  const [editJECreditAccountId, setEditJECreditAccountId] = useState<number | ''>('');
  const [editJEAmount, setEditJEAmount] = useState<number | ''>('');

  const openEdit = async (unifiedId: string, _sourceType: TransactionSourceType) => {
    if (!token) { toast({ variant: 'destructive', title: 'Not authenticated' }); return; }
    try {
      const actualId = unifiedId.split('-').slice(1).join('-');
      const url = `${API_BASE_URL}/journal-entries/${actualId}`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      setEditOpen(true);

      // pull quota when opening editor
      try {
        const r = await fetch(`${API_BASE_URL}/quota/journal_edit`, { headers: { ...authHeaders } });
        if (r.ok) {
          const j = await r.json();
          setQuota({ used: Number(j.used || 0), limit: j.limit == null ? null : Number(j.limit || 0) });
        }
      } catch {}
    } catch (e: any) {
      console.error('Load detail failed', e);
      toast({ variant: 'destructive', title: 'Failed to open editor', description: e?.message || String(e) });
    }
  };

  const saveEdit = async () => {
    if (!token) { toast({ variant: 'destructive', title: 'Not authenticated' }); return; }
    setSaveState('saving');

    try {
      if (editingSourceType === 'journal_entry' && editJEDetail) {
        let payload: any = {
          entryDate: editJEDate,
          memo: editJEMemo || null,
          lines: [] as Array<{ accountId: number; debit: number; credit: number }>,
        };

        if (editJEDetail.lines.length === 2) {
          const amt =
            typeof editJEAmount === 'number'
              ? editJEAmount
              : parseFloat(String(editJEAmount || 0));
          if (!amt || !editJEDebitAccountId || !editJECreditAccountId) {
            toast({
              variant: 'destructive',
              title: 'Missing info',
              description: 'Please pick debit account, credit account, and a non-zero amount.',
            });
            setSaveState('idle');
            return;
          }
          payload.lines = [
            { accountId: Number(editJEDebitAccountId), debit: amt, credit: 0 },
            { accountId: Number(editJECreditAccountId), debit: 0, credit: amt },
          ];
        } else {
          payload.lines = editJEDetail.lines.map((l) => ({
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
          const data = await res.json().catch(() => null);

          if (res.status === 402 && data?.code === 'plan_limit_reached') {
            const used  = Number(data.used ?? 0);
            const limit = Number(data.limit ?? 0);
            toast({
              variant: 'destructive',
              title: 'Monthly limit reached',
              description: `You've used ${used}/${limit} journal edits this month.`,
              action: <Button size="sm" onClick={() => window.open('/pricing','_blank')}>Upgrade</Button>,
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Save failed',
              description: data?.error || `HTTP ${res.status}`,
            });
          }
          throw new Error('handled');
        }
      }

      await fetchSummaries('reset');
      setSaveState('success');

      setTimeout(() => {
        setSaveState('idle');
        setEditOpen(false);
        setEditJEDetail(null);
        setEditingSourceType(null);
      }, 600);
    } catch (e: any) {
      if (e?.message !== 'handled') {
        toast({ variant: 'destructive', title: 'Save failed', description: e?.message || 'Unexpected error' });
      }
      setSaveState('idle');
    }
  };

  const finishSaveAndClose = useCallback(() => {
    setTimeout(() => {
      setSaveState('idle');
      setEditOpen(false);
      setEditJEDetail(null);
      setEditingSourceType(null);
    }, 600);
  }, [setEditOpen]);

  // ---------- Export / Print ----------
  const exportCsv = () => {
    if (!filteredRows.length) {
      toast({ title: 'Nothing to export', description: 'Adjust filters and try again.' });
      return;
    }
    const headers = ['ID','Date','Description','Accounts','Amount','Source','Dup Count'];
    const csvRows = filteredRows.map(r => {
      const accountsInfo = `${resolveAccountLabel(r.debitAccountId, r.debitAccountName)} ↔ ${resolveAccountLabel(r.creditAccountId, r.creditAccountName)}`;
      return ([
        r.id,
        r.date,
        (r.description || '').replace(/"/g, '""'),
        accountsInfo.replace(/"/g, '""'),
        r.amount.toFixed(2),
        'Journal Entry',
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
    toast({ title: 'CSV exported' });
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
            <CardDescription>This view shows journal entries (double-entry).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="col-span-1">
                <Label className="mb-2 block">Search (description or account)</Label>
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
                  disabled={loading}
                  title={computingDups ? 'Finding duplicates…' : undefined}
                >
                  {computingDups ? 'Finding dups…' : (showDupOnly ? 'Showing Duplicates' : 'Duplicates Only')}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => fetchSummaries('reset')} disabled={loading}>
                Apply
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchTerm('');
                  const { from, to } = currentMonthBounds();
                  setFromDate(from);
                  setToDate(to);
                  setSelectedAccountFilter('all');
                  setShowDupOnly(false);
                  setDupGroupsPreview([]);
                  setNextCursor(null);
                  fetchSummaries('reset');
                }}
              >
                Reset (This Month)
              </Button>

              {/* Dedupe */}
              <Button
                variant="outline"
                onClick={previewDuplicateGroups}
                disabled={loading || computingDups || deleteDupBusy}
                title="Preview duplicate groups (keep 1 per group)"
              >
                Preview dups
              </Button>
              <Button
                variant="destructive"
                onClick={deleteDuplicatesKeepOne}
                disabled={loading || computingDups || deleteDupBusy || !unifiedRows.length}
                title="Delete duplicates and keep one per group"
              >
                {deleteDupBusy ? 'Deleting…' : 'Delete dups (keep 1)'}
              </Button>
            </div>

            {dupGroupsPreview.length > 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                {dupGroupsPreview.length} group(s) found — will delete{' '}
                {dupGroupsPreview.reduce((n,g)=>n+g.duplicates.length,0)} entr
                {dupGroupsPreview.reduce((n,g)=>n+g.duplicates.length,0)===1?'y':'ies'}.
                Survivor rule: earliest date, then lowest ID.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top actions */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${filteredRows.length} transaction(s)`}{computingDups ? ' (scanning dups…)': ''}
          </div>
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={async () => {
                await deleteSelected();
                setSelectedIds(new Set());
              }} disabled={loading}>
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
            <CardTitle>Journal Entry History</CardTitle>
            <CardDescription>Journal Entries (double-entry).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id))}
                        ref={(el) => { if (el) el.indeterminate = (!filteredRows.every(r => selectedIds.has(r.id)) && filteredRows.some(r => selectedIds.has(r.id))); }}
                        onChange={() => {
                          const allSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id));
                          if (allSelected) {
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
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-left p-3">Accounts</th>
                    <th className="text-left p-3">Amount ({symbol})</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-12">Loading…</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => setSelectedIds(prev => {
                              const n = new Set(prev);
                              if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                              return n;
                            })}
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
                                      <div key={`je-${m.id}`} className="border rounded p-2">
                                        <div><strong>ID:</strong> {m.id} (JE)</div>
                                        <div><strong>Date:</strong> {m.date}</div>
                                        <div className="truncate"><strong>Memo:</strong> {m.memo || '—'}</div>
                                        <div><strong>Amount:</strong> {fmt(Number(m.amount || 0))}</div>
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
                          {resolveAccountLabel(r.debitAccountId, r.debitAccountName)} <span className="opacity-60">↔</span> {resolveAccountLabel(r.creditAccountId, r.creditAccountName)}
                          {r.complex && <span className="ml-1 text-xs text-muted-foreground">(Complex)</span>}
                        </td>
                        <td className="p-3">{fmt(Number(r.amount || 0))}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r.id, r.sourceType)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteOne(r.id, r.sourceType)}>
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

            {/* Pagination */}
            {nextCursor && (
              <div className="flex justify-center mt-4">
                <Button onClick={() => fetchSummaries('append')} disabled={appending || loading}>
                  {appending ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
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
              <DialogTitle className="text-lg">Edit Journal Entry</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Update details for Journal Entry.
              </p>
            </DialogHeader>
          </div>
          {/* Body */}
          <div className="px-6 py-5 space-y-6">
            {!editJEDetail ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                {/* Row 1: Date / Memo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Date</Label>
                    <Input
                      type="date"
                      value={editJEDate}
                      onChange={(e) => setEditJEDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Memo</Label>
                    <Input
                      value={editJEMemo}
                      onChange={(e) => setEditJEMemo(e.target.value)}
                      placeholder="(optional)"
                      className="h-10"
                    />
                  </div>
                </div>
                <Separator />
                {/* Row 2: JE 2-line quick edit */}
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
                            {symbol}
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
                            here.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {/* Footer */}
          <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-end gap-2">
            {quota && quota.limit != null && (
              <span className="mr-auto text-xs text-muted-foreground">
                {Math.max(0, quota.limit - quota.used)} edits left this month
              </span>
            )}
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={saveEdit}
              disabled={saveState === 'saving'}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition disabled:opacity-60"
            >
              {saveState === 'saving' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {saveState === 'success' && (
                <motion.span
                  className="inline-flex items-center gap-1"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  <Check className="h-4 w-4" />
                  Saved
                </motion.span>
              )}
              {saveState === 'idle' && 'Save'}
            </motion.button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Transactions;
