// Transactions.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  debitAccountId?: number;  // for fast filtering
  creditAccountId?: number; // for fast filtering
  complex?: boolean;
  lineCount?: number;
  dupCount?: number;
  dupMatches?: DupView[];
}

// -------------- Helpers --------------
const API_BASE_URL = 'http://localhost:3000';
const fmtMoney = (n: number) => `R${n.toFixed(2)}`;
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

// limit concurrency
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

  // default window (last 90 days) once
  useEffect(() => {
    if (!fromDate && !toDate) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 90);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(end.toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<JournalEntrySummary[]>([]);
  const [unifiedRows, setUnifiedRows] = useState<UnifiedTxViewRow[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [computingDups, setComputingDups] = useState(false);
  const [deleteDupBusy, setDeleteDupBusy] = useState(false);
  const [dupGroupsPreview, setDupGroupsPreview] = useState<
    { survivor: UnifiedTxViewRow; duplicates: UnifiedTxViewRow[] }[]
  >([]);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editingSourceType, setEditingSourceType] = useState<TransactionSourceType | null>(null);
  const [editJEDetail, setEditJEDetail] = useState<JournalEntryDetail | null>(null);
  const [editJEDate, setEditJEDate] = useState('');
  const [editJEMemo, setEditJEMemo] = useState('');
  const [editJEDebitAccountId, setEditJEDebitAccountId] = useState<number | ''>('');
  const [editJECreditAccountId, setEditJECreditAccountId] = useState<number | ''>('');
  const [editJEAmount, setEditJEAmount] = useState<number | ''>('');

  // JE details cache & caps
  const detailsCache = useRef<Map<number, JournalEntryDetail>>(new Map());
  const MAX_DETAILS = 200; // initial batch to hydrate

  // Accounts map helpers
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

  // ---------- Fetch JE Summaries ----------
  const fetchSummaries = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setSummaries([]);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.append('start', fromDate);
      if (toDate) qs.append('end', toDate);
      if (searchTerm) qs.append('q', searchTerm);

      const res = await fetch(`${API_BASE_URL}/journal-entries?${qs.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = (data?.items || []).map((r: any) => ({
        id: Number(r.id),
        entry_date: String(r.entry_date),
        memo: r.memo ?? null,
        total_debit: r.total_debit,
        total_credit: r.total_credit,
        line_count: Number(r.line_count || 0),
      }));
      setSummaries(items);
    } catch (e) {
      console.error('Failed to load journal-entries', e);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, fromDate, toDate, searchTerm, authHeaders]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // helper: get detail with cache
  const getDetail = useCallback(async (id: number): Promise<JournalEntryDetail> => {
    const hit = detailsCache.current.get(id);
    if (hit) return hit;
    const res = await fetch(`${API_BASE_URL}/journal-entries/${id}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const detail: JournalEntryDetail = await res.json();
    detailsCache.current.set(id, detail);
    return detail;
  }, [authHeaders]);

  // ---------- Fetch details (capped first, then hydrate progressively) ----------
  useEffect(() => {
    if (!isAuthenticated || !token || summaries.length === 0) {
      setUnifiedRows([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoadingDetails(true);
      try {
        const slice = summaries.slice(0, MAX_DETAILS);
        const initial = await mapWithConcurrency(
          slice,
          async (s) => {
            const detail = await getDetail(s.id);
            const lines = detail.lines || [];
            const bd = biggestDebit(lines);
            const bc = biggestCredit(lines);
            const amount = Math.max(parseNumber(s.total_debit), parseNumber(s.total_credit));
            const row: UnifiedTxViewRow = {
              id: `je-${s.id}`,
              sourceType: 'journal_entry',
              sourceId: s.id,
              date: s.entry_date,
              description: detail.entry.memo || '',
              amount,
              debitAccountId: bd?.account_id,
              creditAccountId: bc?.account_id,
              complex: lines.length > 2,
              lineCount: s.line_count,
            };
            return row;
          },
          8
        );

        if (!cancelled) {
          setUnifiedRows(initial);
          setSelectedIds(new Set());
        }

        // progressive hydration of the rest, without blocking UI
        const rest = summaries.slice(MAX_DETAILS);
        if (rest.length) {
          setTimeout(async () => {
            try {
              const more = await mapWithConcurrency(
                rest,
                async (s) => {
                  const detail = await getDetail(s.id);
                  const lines = detail.lines || [];
                  const bd = biggestDebit(lines);
                  const bc = biggestCredit(lines);
                  const amount = Math.max(parseNumber(s.total_debit), parseNumber(s.total_credit));
                  const row: UnifiedTxViewRow = {
                    id: `je-${s.id}`,
                    sourceType: 'journal_entry',
                    sourceId: s.id,
                    date: s.entry_date,
                    description: detail.entry.memo || '',
                    amount,
                    debitAccountId: bd?.account_id,
                    creditAccountId: bc?.account_id,
                    complex: lines.length > 2,
                    lineCount: s.line_count,
                  };
                  return row;
                },
                6
              );
              if (!cancelled) {
                setUnifiedRows(prev => [...prev, ...more]);
              }
            } catch (e) {
              if (!cancelled) console.warn('Background hydrate failed', e);
            }
          }, 0);
        }
      } catch (e) {
        console.error('Failed to load JE details', e);
        if (!cancelled) setUnifiedRows([]);
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();

    return () => { cancelled = true; };
  }, [summaries, isAuthenticated, token, authHeaders, getDetail]);

  // ---------- On-demand duplicate computation (for "Duplicates Only" toggle) ----------
  useEffect(() => {
    if (!showDupOnly || unifiedRows.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        setComputingDups(true);

        // bucket by amount to avoid full O(n^2)
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
  }, [showDupOnly]);

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
      alert('No duplicate groups found with current settings.');
    }
  };

  const deleteDuplicatesKeepOne = async () => {
    // Build preview first if empty
    if (!dupGroupsPreview.length) {
      await previewDuplicateGroups();
      if (!dupGroupsPreview.length) return;
    }
    const totalDeletes = dupGroupsPreview.reduce((n, g) => n + g.duplicates.length, 0);
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
      await fetchSummaries();
      setDupGroupsPreview([]);
      alert('Duplicate deletion complete.');
    } catch (e: any) {
      console.error('Delete duplicates failed', e);
      alert(`Delete failed: ${e?.message || e}`);
    } finally {
      setDeleteDupBusy(false);
    }
  };

  // ---------- Filter in UI by account / dup / search ----------
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
        (accountName(x.debitAccountId).toLowerCase().includes(term)) ||
        (accountName(x.creditAccountId).toLowerCase().includes(term))
      );
    }
    return r;
  }, [unifiedRows, selectedAccountFilter, showDupOnly, searchTerm, accountName]);

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
  const deleteOne = async (unifiedId: string, _sourceType: TransactionSourceType) => {
    if (!token) return alert('Not authenticated.');
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    try {
      const url = `${API_BASE_URL}/journal-entries/${unifiedId.split('-')[1]}`;
      const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      for (const unifiedId of ids) {
        const actualId = unifiedId.split('-').slice(1).join('-');
        const url = `${API_BASE_URL}/journal-entries/${actualId}`;
        const res = await fetch(url, { method: 'DELETE', headers: { ...authHeaders } });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Delete ${unifiedId} failed: ${res.status} ${errText}`);
        }
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
  const openEdit = async (unifiedId: string, _sourceType: TransactionSourceType) => {
    if (!token) return alert('Not authenticated.');
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
        return;
      }
    }
    setEditOpen(false);
    setEditJEDetail(null);
    setEditingSourceType(null);
    fetchSummaries();
  };

  // ---------- Export / Print ----------
  const exportCsv = () => {
    if (!filteredRows.length) {
      alert('No rows to export.');
      return;
    }
    const headers = ['ID','Date','Description','Accounts','Amount','Source','Dup Count'];
    const csvRows = filteredRows.map(r => {
      const accountsInfo = `${accountName(r.debitAccountId)} ↔ ${accountName(r.creditAccountId)}`;
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
                  disabled={loading || loadingDetails}
                  title={computingDups ? 'Finding duplicates…' : undefined}
                >
                  {computingDups ? 'Finding dups…' : (showDupOnly ? 'Showing Duplicates' : 'Duplicates Only')}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => { fetchSummaries(); }} disabled={loading}>
                Apply
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchTerm('');
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 90);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                  setSelectedAccountFilter('all');
                  setShowDupOnly(false);
                  setDupGroupsPreview([]);
                }}
              >
                Reset
              </Button>

              {/* NEW: dedupe buttons */}
              <Button
                variant="outline"
                onClick={previewDuplicateGroups}
                disabled={loading || loadingDetails || computingDups || deleteDupBusy}
                title="Preview duplicate groups (keep 1 per group)"
              >
                Preview dups
              </Button>
              <Button
                variant="destructive"
                onClick={deleteDuplicatesKeepOne}
                disabled={loading || loadingDetails || computingDups || deleteDupBusy || !unifiedRows.length}
                title="Delete duplicates and keep one per group"
              >
                {deleteDupBusy ? 'Deleting…' : 'Delete dups (keep 1)'}
              </Button>
            </div>

            {/* Optional: small preview summary */}
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
            {loading || loadingDetails ? 'Loading…'
              : `${filteredRows.length} transaction(s)`}{computingDups ? ' (scanning dups…)': ''}
          </div>
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={deleteSelected} disabled={loading || loadingDetails}>
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
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading || loadingDetails) ? (
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
                            onChange={() => toggleSelect(r.id)}
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
                          {accountName(r.debitAccountId)} <span className="opacity-60">↔</span> {accountName(r.creditAccountId)}
                          {r.complex && <span className="ml-1 text-xs text-muted-foreground">(Complex)</span>}
                        </td>
                        <td className="p-3">{fmtMoney(r.amount)}</td>
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
