// ImportScreen.tsx
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  Mic,
  Paperclip,
  Send,
  StopCircle,
  Trash2,
  CheckCircle,
  XCircle,
  Edit3,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../AuthPage';
import { SearchableAccountSelect } from '../components/SearchableAccountSelect';
import { SearchableCategorySelect } from '../components/SearchableCategorySelect';
import { Link, useNavigate } from 'react-router-dom';
import { EvidencePrompt } from './EvidencePrompt';
import { useCurrency } from '../contexts/CurrencyContext';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

// ------------ Types ------------
// ------------ Types ------------
interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'debt';
  amount: number;            // for sales we auto-calc from qty*unit_price when present
  description: string;
  date: string;
  category: string;
  account_id: string;
  account_name?: string;
  source: string;            // we'll use 'sales-preview' for rows that become /api/sales
  is_verified: boolean;
  file_url?: string;
  _tempId?: string;
  original_text?: string;
  confidenceScore?: number;
  duplicateFlag?: boolean;
  duplicateMatches?: DupMatch[];
  includeInImport?: boolean;

  // ---- NEW: sales-only fields (optional) ----
  is_sale?: boolean;
  product_id?: number | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;     // if user typed a total only
}


interface ProductDB {
  id: number;
  name: string;
  description: string | null;
  unit_price: number;
  cost_price: number | null;
  sku: string | null;
  is_service: boolean;
  stock_quantity: number;
  tax_rate_value?: number;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

type ExistingTx = Pick<Transaction, 'id' | 'amount' | 'date' | 'description' | 'type' | 'account_id'>;

interface DupMatch {
  id?: string;
  amount: number;
  date: string;
  description: string;
  score: number; // 0..1
}

// --- Import pipeline helpers (stage → preview → (optional PATCH) → commit) ---

// a stable, per-row idempotency key: date|amount + 8-char hash of description
const sourceUidOf = (t: Transaction) => {
  const d = (t.date || '').slice(0, 10);
  const a = Number(t.amount || 0).toFixed(2);
  const desc = (t.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // tiny deterministic hash (djb2)
  let h = 5381;
  for (let i = 0; i < desc.length; i++) h = ((h << 5) + h) ^ desc.charCodeAt(i);
  const hx = Math.abs(h >>> 0).toString(36).slice(0, 8);
  return `${d}|${a}|${hx}`;
};

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
const MIN_CENTS = 0.01;


async function stageSelected(API_BASE_URL: string, authHeaders: any, rows: Array<{sourceUid:string; date:string; description:string; amount:number;}>) {
  const res = await fetch(`${API_BASE_URL}/imports/bank/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ source: 'bank_csv', rows }),
  });

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error || j.message || ''; } catch {}
    if (res.status === 402) {
      const j = await res.json().catch(() => ({}));
      const remaining = j?.remaining ?? 0;
      throw new Error(
        `You’ve hit your monthly import limit. Remaining this month: ${remaining}. ` +
        (j?.upgrade_suggestion || 'Please upgrade your plan for more imports.')
      );
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return await res.json() as { batchId: number; inserted: number; duplicates: number };
}


async function loadPreview(API_BASE_URL: string, authHeaders: any, batchId: number) {
  const res = await fetch(`${API_BASE_URL}/imports/${batchId}/preview`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders },
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as {
    batchId: number;
    items: Array<{ rowId:number; sourceUid:string; date:string; description:string;
                   amount:number; suggested:{debitAccountId:number|null; creditAccountId:number|null};
                   error:string|null }>;
  };
}

async function patchRowMapping(API_BASE_URL: string, authHeaders: any, rowId: number, debitId?: number|null, creditId?: number|null) {
  const res = await fetch(`${API_BASE_URL}/imports/rows/${rowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      proposed_debit_account_id:  debitId  ?? undefined,
      proposed_credit_account_id: creditId ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function commitBatch(API_BASE_URL: string, authHeaders: any, batchId: number) {
  const res = await fetch(`${API_BASE_URL}/imports/${batchId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as { batchId:number; posted:number; skipped:number };
}

// ------------ Duplicate helpers ------------
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

// similarity rule
const isPotentialDuplicate = (incoming: Transaction, existing: ExistingTx) => {
  const amountMatch = Math.abs(Number(incoming.amount) - Number(existing.amount)) <= 0.01;
  const dateClose = daysBetween(incoming.date, existing.date) <= 2;

  const a = tokenSet(incoming.description);
  const b = tokenSet(existing.description);
  const jac = jaccard(a, b);
  const substring =
    normalize(existing.description).includes(normalize(incoming.description)) ||
    normalize(incoming.description).includes(normalize(existing.description));
  const similarDesc = jac >= 0.55 || substring;

  const score = (amountMatch ? 0.5 : 0) + (dateClose ? 0.2 : 0) + (similarDesc ? 0.3 : 0);
  return { isDup: amountMatch && dateClose && similarDesc, score };
};

// IMPORTANT: default selection is TRUE for everything,
// BUT if a row already specifies includeInImport, respect it
const markDuplicates = (newTxs: Transaction[], existingTxs: ExistingTx[]): Transaction[] => {
  return newTxs.map(tx => {
    const matches: DupMatch[] = [];
    for (const ex of existingTxs) {
      const { isDup, score } = isPotentialDuplicate(tx, ex);
      if (isDup) {
        matches.push({
          id: ex.id,
          amount: Number(ex.amount),
          date: ex.date,
          description: ex.description,
          score,
        });
      }
    }
    return {
      ...tx,
      duplicateFlag: matches.length > 0,
      duplicateMatches: matches.sort((x, y) => y.score - x.score),
      includeInImport: tx.includeInImport !== undefined ? tx.includeInImport : true,
    };
  });
};

// ===========================================
// SUGGESTION FUNCTION FOR FILE UPLOADS (PDF)
// ===========================================
const suggestAccountForUpload = (
  transaction: { type: string; category: string; description: string; },
  accounts: Account[]
): { accountId: string | null; confidence: number } => {
  if (!accounts || accounts.length === 0) return { accountId: null, confidence: 0 };

  const safeText = (txt?: string | null) => (txt ? txt.toLowerCase() : '');
  const includesAny = (text: string, keywords: string[]) =>
    keywords.some(keyword => text.includes(keyword));

  const lowerTransactionType = safeText(transaction.type);
  const lowerCategory = safeText(transaction.category);
  const lowerDescription = safeText(transaction.description);

  const findAccountByName = (nameKeywords: string[], accountType?: string) => {
    return accounts.find(acc => {
      const lowerAccName = safeText(acc.name);
      const typeMatch = accountType ? safeText(acc.type) === safeText(accountType) : true;
      return typeMatch && includesAny(lowerAccName, nameKeywords);
    });
  };

  if (lowerTransactionType === 'expense') {
    if (includesAny(lowerCategory, ['fuel']) || includesAny(lowerDescription, ['fuel', 'petrol'])) {
      const acc = findAccountByName(['fuel expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['salaries and wages']) || includesAny(lowerDescription, ['salary', 'wages', 'payroll'])) {
      const acc = findAccountByName(['salaries and wages expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['projects expenses']) || includesAny(lowerDescription, ['project', 'materials', 'contractor'])) {
      const acc = findAccountByName(['projects expenses'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['accounting fees']) || includesAny(lowerDescription, ['accountant', 'audit', 'tax fee'])) {
      const acc = findAccountByName(['accounting fees expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['repairs & maintenance']) || includesAny(lowerDescription, ['repair', 'maintenance', 'fix', 'electrician'])) {
      const acc = findAccountByName(['repairs & maintenance expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['water and electricity']) || includesAny(lowerDescription, ['electricity', 'water bill', 'utilities'])) {
      const acc = findAccountByName(['water and electricity expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['bank charges']) || includesAny(lowerDescription, ['bank charge', 'service fee', 'card fee'])) {
      const acc = findAccountByName(['bank charges & fees'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['insurance']) || includesAny(lowerDescription, ['insurance', 'policy'])) {
      const acc = findAccountByName(['insurance expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['loan interest']) || includesAny(lowerDescription, ['loan interest', 'interest on debit', 'int on debit'])) {
      const acc = findAccountByName(['loan interest expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['computer internet and telephone']) || includesAny(lowerDescription, ['internet', 'airtime', 'telephone', 'wifi', 'data'])) {
      const acc = findAccountByName(['communication expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['website hosting fees']) || includesAny(lowerDescription, ['website', 'hosting', 'domain'])) {
      const acc = findAccountByName(['website hosting fees'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['other expenses']) || includesAny(lowerDescription, ['misc', 'sundries', 'general expense'])) {
      const acc = findAccountByName(['miscellaneous expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 85 };
    }
    if (includesAny(lowerCategory, ['rent']) || includesAny(lowerDescription, ['rent', 'rental'])) {
      const acc = findAccountByName(['rent expense'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 85 };
    }
    if (includesAny(lowerCategory, ['cost of goods sold', 'cogs']) || includesAny(lowerDescription, ['cost of goods sold', 'cogs', 'purchases'])) {
      const acc = findAccountByName(['cost of goods sold'], 'expense');
      if (acc) return { accountId: String(acc.id), confidence: 85 };
    }
  }

  if (lowerTransactionType === 'income') {
    if (includesAny(lowerCategory, ['sales', 'revenue']) || includesAny(lowerDescription, ['sale', 'revenue', 'customer payment'])) {
      const acc = findAccountByName(['sales revenue'], 'income');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['interest income']) || includesAny(lowerDescription, ['interest received', 'interest income'])) {
      const acc = findAccountByName(['interest income'], 'income');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['income', 'general income']) || includesAny(lowerDescription, ['transfer from', 'deposit'])) {
      const acc = findAccountByName(['other income'], 'income');
      if (acc) return { accountId: String(acc.id), confidence: 80 };
    }
  }

  if (lowerTransactionType === 'debt') {
    if (includesAny(lowerCategory, ['car loans', 'loan repayment']) || includesAny(lowerDescription, ['car loan', 'vehicle finance'])) {
      const acc = findAccountByName(['car loans'], 'liability');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['loan', 'debt']) || includesAny(lowerDescription, ['loan', 'debt', 'borrow'])) {
      const acc = findAccountByName(['loan payable', 'long-term loan payable', 'short-term loan payable'], 'liability');
      if (acc) return { accountId: String(acc.id), confidence: 85 };
    }
    if (includesAny(lowerCategory, ['accounts payable']) || includesAny(lowerDescription, ['payable', 'creditor'])) {
      const acc = findAccountByName(['accounts payable'], 'liability');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
    if (includesAny(lowerCategory, ['credit facility']) || includesAny(lowerDescription, ['credit facility', 'line of credit'])) {
      const acc = findAccountByName(['credit facility payable'], 'liability');
      if (acc) return { accountId: String(acc.id), confidence: 90 };
    }
  }

  if (lowerTransactionType === 'income') {
    const acc = accounts.find(acc => safeText(acc.type) === 'income');
    if (acc) return { accountId: String(acc.id), confidence: 60 };
  }
  if (lowerTransactionType === 'expense') {
    const acc = accounts.find(acc => safeText(acc.type) === 'expense');
    if (acc) return { accountId: String(acc.id), confidence: 60 };
  }
  if (lowerTransactionType === 'debt') {
    const acc = accounts.find(acc => safeText(acc.type) === 'liability');
    if (acc) return { accountId: String(acc.id), confidence: 60 };
  }

  // Fallbacks
  const generalExpense = accounts.find(acc => safeText(acc.name).includes('general expense') && safeText(acc.type) === 'expense');
  if (generalExpense) return { accountId: String(generalExpense.id), confidence: 30 };
  const defaultBank = accounts.find(acc => safeText(acc.name).includes('bank') && safeText(acc.type) === 'asset');
  if (defaultBank) return { accountId: String(defaultBank.id), confidence: 40 };
  const defaultCash = accounts.find(acc => safeText(acc.name).includes('cash') && safeText(acc.type) === 'asset');
  if (defaultCash) return { accountId: String(defaultCash.id), confidence: 40 };

  return accounts.length > 0 ? { accountId: String(accounts[0].id), confidence: 20 } : { accountId: null, confidence: 0 };
};

// ==========================================
// SUGGESTION FUNCTION FOR TEXT INPUT
// ==========================================
const suggestAccountForText = (
  transaction: { type: string; category: string; description: string; },
  accounts: Account[]
): { accountId: string | null; confidence: number } => {
  if (!accounts || accounts.length === 0) return { accountId: null, confidence: 0 };

  const safeText = (txt?: string | null) => (txt ? txt.toLowerCase() : '');
  const lowerTransactionType = safeText(transaction.type);
  const lowerCategory = safeText(transaction.category);
  const lowerDescription = safeText(transaction.description);

  let bestMatch: Account | null = null;
  let highestScore = -1;

  // rules
  const fuelAccount = accounts.find(acc => safeText(acc.name).includes('fuel expense') && safeText(acc.type) === 'expense');
  if (fuelAccount && (lowerCategory.includes('fuel') || lowerDescription.includes('fuel') || lowerDescription.includes('petrol'))) {
    return { accountId: String(fuelAccount.id), confidence: 95 };
  }

  const salariesAccount = accounts.find(acc => safeText(acc.name).includes('salaries and wages') && safeText(acc.type) === 'expense');
  if (salariesAccount && (lowerCategory.includes('salaries and wages') || lowerDescription.includes('salary') || lowerDescription.includes('wages') || lowerDescription.includes('payroll'))) {
    return { accountId: String(salariesAccount.id), confidence: 95 };
  }

  const rentAccount = accounts.find(acc => safeText(acc.name).includes('rent expense') && safeText(acc.type) === 'expense');
  if (rentAccount && (lowerCategory.includes('rent expense') || lowerDescription.includes('rent') || lowerDescription.includes('rental'))) {
    return { accountId: String(rentAccount.id), confidence: 95 };
  }

  for (const account of accounts) {
    const lowerAccName = safeText(account.name);
    const lowerAccType = safeText(account.type);

    let currentScore = 0;
    if (lowerDescription.includes(lowerAccName) && lowerAccName.length > 3) currentScore += 100;
    if (lowerCategory.includes(lowerAccName) && lowerAccName.length > 3) currentScore += 80;

    // contextual boosts
    if (lowerDescription.includes('bank loan') && lowerAccName.includes('bank loan payable') && lowerAccType === 'liability') currentScore += 70;
    if (lowerDescription.includes('revenue') && lowerAccName.includes('sales revenue') && lowerAccType === 'income') currentScore += 70;
    if (lowerDescription.includes('rent') && lowerAccName.includes('rent expense') && lowerAccType === 'expense') currentScore += 70;

    const accountNameKeywords = lowerAccName.split(/\s+/).filter(w =>
      w.length > 2 && !['and','of','for','the','a','an','expense','income','payable','receivable'].includes(w)
    );
    for (const keyword of accountNameKeywords) {
      if (lowerDescription.includes(keyword)) currentScore += 10;
      if (lowerCategory.includes(keyword)) currentScore += 8;
    }

    if ((lowerTransactionType === 'income' && lowerAccType === 'income') ||
        (lowerTransactionType === 'expense' && lowerAccType === 'expense') ||
        (lowerTransactionType === 'debt' && lowerAccType === 'liability')) {
      currentScore += 15;
    }

    if ((lowerAccName.includes('bank') || lowerAccName.includes('cash')) && lowerAccType === 'asset') currentScore += 5;

    if (currentScore > highestScore) {
      highestScore = currentScore;
      bestMatch = account;
    }
  }

  if (bestMatch && highestScore > 60) {
    return { accountId: String(bestMatch.id), confidence: Math.min(100, highestScore) };
  }

  // fallbacks
  const byType =
    (lowerTransactionType === 'income' && accounts.find(a => safeText(a.type) === 'income')) ||
    (lowerTransactionType === 'expense' && accounts.find(a => safeText(a.type) === 'expense')) ||
    (lowerTransactionType === 'debt' && accounts.find(a => safeText(a.type) === 'liability'));

  if (byType) return { accountId: String((byType as Account).id), confidence: 40 };

  const generalExpense = accounts.find(acc => safeText(acc.name).includes('general expense') && safeText(acc.type) === 'expense');
  if (generalExpense) return { accountId: String(generalExpense.id), confidence: 30 };

  const bankOrCash = accounts.find(a => (safeText(a.name).includes('bank') || safeText(a.name).includes('cash')) && safeText(a.type) === 'asset');
  if (bankOrCash) return { accountId: String(bankOrCash.id), confidence: 20 };

  return accounts.length ? { accountId: String(accounts[0].id), confidence: 10 } : { accountId: null, confidence: 0 };
};

// --- Scroll sync helpers (for sticky bottom scrollbar) ---
function useResizeObserver<T extends HTMLElement>(
  ref: React.RefObject<T>,
  onSize: (w: number) => void
) {
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => onSize(el.scrollWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, onSize]);
}

// ---------------- Progress UI ----------------
type Stage = 'staging' | 'preview' | 'mapping' | 'posting';
type StageStatus = 'idle' | 'running' | 'done' | 'error';

type ProgressState = Record<Stage, StageStatus> & { overall: 'idle' | 'running' | 'done' | 'error' };

// A small bus using CustomEvent so we can update one widget without rewriting message history
const PROGRESS_EVENT = 'import-progress-event';
function sendProgress(stage: Stage, status: StageStatus) {
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { stage, status } }));
}

const StageRow: React.FC<{ label: string; status: StageStatus }> = ({ label, status }) => (
  <div className="flex items-center gap-2 text-sm">
    {status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
    {status === 'done' && <CheckCircle className="h-4 w-4 text-green-600" />}
    {status === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
    {status === 'idle' && <span className="h-4 w-4 inline-block rounded-full bg-gray-300" />}
    <span>{label}</span>
  </div>
);

const ImportProgressBubble: React.FC = () => {
  const [state, setState] = useState<ProgressState>({
    staging: 'idle',
    preview: 'idle',
    mapping: 'idle',
    posting: 'idle',
    overall: 'idle',
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const { stage, status } = (e as CustomEvent).detail as { stage: Stage; status: StageStatus };
      setState(prev => {
        const next = { ...prev, [stage]: status };
        const anyError = (['staging','preview','mapping','posting'] as Stage[]).some(s => next[s] === 'error');
        const allDone = (['staging','preview','mapping','posting'] as Stage[]).every(s => next[s] === 'done');
        next.overall = anyError ? 'error' : allDone ? 'done' : 'running';
        return next;
      });
    };
    window.addEventListener(PROGRESS_EVENT, handler as any);
    return () => window.removeEventListener(PROGRESS_EVENT, handler as any);
  }, []);

  return (
    <div className="p-3 rounded-2xl shadow-md bg-gray-200 text-gray-800 min-w-[260px]">
      <div className="font-medium mb-2">Import progress</div>
      <div className="space-y-1.5">
        <StageRow label="Staging selected rows" status={state.staging} />
        <StageRow label="Generating preview" status={state.preview} />
        <StageRow label="Applying account mappings" status={state.mapping} />
        <StageRow label="Posting journal entries" status={state.posting} />
      </div>
      <div className="mt-2 text-xs text-gray-600">
        {state.overall === 'done' ? 'All steps complete.' : state.overall === 'error' ? 'Something went wrong.' : 'Working…'}
      </div>
    </div>
  );
};

// --- Loading bubble shown while table is being prepared ---
const TableLoading: React.FC<{ message?: string }> = ({ message = 'Preparing your preview table…' }) => {
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const id = setInterval(() => setPct(p => Math.min(98, p + Math.max(1, Math.round(Math.random() * 7)))), 300);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="p-3 rounded-2xl shadow-md bg-gray-200 text-gray-800 min-w-[260px]">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-medium">{message}</span>
      </div>
      <div className="w-full h-2 bg-gray-300 rounded">
        <div
          className="h-2 bg-blue-600 rounded transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-600">This won’t take long.</p>
    </div>
  );
};

// ------------ Editable table ------------
const EditableTransactionTable = ({
  transactions: initialTransactions,
  accounts,
  categories,
  onConfirm,
  isBusy = false,
  onCancel,
  // NEW:
  forceCash,
  onToggleForceCash,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
  onConfirm: (txs: Transaction[]) => void;
  isBusy?: boolean;
  onCancel: () => void;
  forceCash: boolean;
  onToggleForceCash: (val: boolean) => void;
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [localForceCash, setLocalForceCash] = useState(!!forceCash);
  const [confirmClicked, setConfirmClicked] = useState(false);
  const [confirmationInitiated, setConfirmationInitiated] = useState(false);
const hasZeroSelected = useMemo(
  () => transactions.some(t => t.includeInImport !== false && Number(t.amount) === 0),
  [transactions]
);

  const zeroSelectedCount = useMemo(
    () => transactions.filter(t => t.includeInImport !== false && Number(t.amount) === 0).length,
    [transactions]
  );
  const { symbol, fmt } = useCurrency();

// ... find the useEffect that resets confirmClicked ...
useEffect(() => {
  // Only reset if the confirmation process hasn't been initiated yet
  // This prevents resetting after the button has been successfully clicked
  if (!confirmationInitiated) {
    setConfirmClicked(false);
  }
  // Always reset the ref to allow potential re-submission if data changes *before* a click
  clickedRef.current = false;
  // Optional: Also reset the flag if data changes significantly after initiation
  // For now, let's keep it tied to the initial render/data load before any click
}, [initialTransactions, confirmationInitiated]);

const handleConfirmOnce = () => {
  if (clickedRef.current || confirmClicked || isBusy) return; // ⬅️ removed hasZeroSelected guard
  clickedRef.current = true;
  setConfirmClicked(true);
  setConfirmationInitiated(true);
  onConfirm(transactions);
};


  // sticky horizontal bar sync
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const bottomStripRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);   // NEW: measures content width
  const topStripRef = useRef<HTMLDivElement | null>(null);   // NEW
  const clickedRef = useRef(false);
  const [contentWidth, setContentWidth] = useState<number>(0);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setContentWidth(el.scrollWidth);
    });
    ro.observe(el);

    // init
    setContentWidth(el.scrollWidth);

    // also react to window resizing
    const onWin = () => setContentWidth(el.scrollWidth);
    window.addEventListener('resize', onWin, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWin);
    };
  }, []);

  useEffect(() => {
    setLocalForceCash(!!forceCash);
  }, [forceCash]);

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    const top = topStripRef.current;
    const bottom = bottomStripRef.current;
    if (!area || !top || !bottom) return;

    let syncing = false;
    const sync = (from: HTMLElement, targets: HTMLElement[]) => {
      if (syncing) return;
      syncing = true;
      const x = from.scrollLeft;
      for (const t of targets) if (t !== from) t.scrollLeft = x;
      syncing = false;
    };

    const onArea = () => sync(area, [top, bottom]);
    const onTop = () => sync(top, [area, bottom]);
    const onBottom = () => sync(bottom, [area, top]);

    area.addEventListener('scroll', onArea, { passive: true });
    top.addEventListener('scroll', onTop, { passive: true });
    bottom.addEventListener('scroll', onBottom, { passive: true });

    // Wheel → horizontal (so users don’t need a trackpad)
    const onWheel = (e: WheelEvent) => {
      // If vertical scroll dominates, convert it to horizontal
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        area.scrollLeft += e.deltaY;
      }
    };
    area.addEventListener('wheel', onWheel as any, { passive: true });

    return () => {
      area.removeEventListener('scroll', onArea);
      top.removeEventListener('scroll', onTop);
      bottom.removeEventListener('scroll', onBottom);
      area.removeEventListener('wheel', onWheel as any);
    };
  }, []);

  const handleTransactionChange = (id: string, field: keyof Transaction, value: any) => {
    setTransactions(prev =>
      prev.map(tx => (tx.id === id || tx._tempId === id) ? { ...tx, [field]: value } : tx)
    );
  };

  const handleTransactionDelete = (idToDelete: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== idToDelete && tx._tempId !== idToDelete));
  };

  const toggleInclude = (id: string) => {
    setTransactions(prev =>
      prev.map(tx => (tx.id === id || tx._tempId === id) ? { ...tx, includeInImport: !tx.includeInImport } : tx)
    );
  };

  const handleCancel = () => {
    setIsCancelled(true);
    onCancel();
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h4 className="text-lg font-semibold mb-1">Review & Edit Transactions:</h4>
      <div className="mb-2 text-xs text-gray-600">
        Heads-up: amounts of <strong>0</strong> are not allowed. Edit the amount or uncheck <em>“Import?”</em> to skip a row.
      </div>

{hasZeroSelected && (
  <div className="mb-3 p-2 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm">
    {zeroSelectedCount} selected row{zeroSelectedCount > 1 ? 's have' : ' has'} an amount of 0.
    They’ll be <strong>skipped</strong> at submit.
  </div>
)}


      {/* Cash override toggle */}
      <div className="mb-3 flex items-center gap-2">
        <input
          id="force-cash-toggle"
          type="checkbox"
          checked={localForceCash}
          onChange={(e) => {
            setLocalForceCash(e.target.checked);
            onToggleForceCash(e.target.checked);
          }}
        />
        <label htmlFor="force-cash-toggle" className="text-sm">
          Treat the balancing leg as <strong>Cash</strong> instead of Bank for all rows
        </label>
      </div>

      {/* Table with sticky top & bottom horizontal scrollbars */}
      <div className="relative">
        
        {/* Scrollable table area */}
        <div
          ref={scrollAreaRef}
          className="overflow-x-auto overflow-y-auto max-h-[400px] pb-6"
        >
          {/* Measure real content width via this wrapper */}
          <div ref={contentRef} className="inline-block min-w-max">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Import?</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount ({symbol})</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Duplicate</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const rowId = tx.id || tx._tempId!;
                  const dupCount = tx.duplicateMatches?.length || 0;
                  const isZero = Number(tx.amount) === 0 && tx.includeInImport !== false;

                  return (
                    <TableRow key={rowId}>
                      {/* Import checkbox */}
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={tx.includeInImport !== false}
                          onChange={() => toggleInclude(rowId)}
                          aria-label="Include in import"
                          disabled={isBusy}
                        />
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        {editingRowId === rowId ? (
                          <Select
                            value={tx.type}
                            onValueChange={(value) => handleTransactionChange(rowId, 'type', value)}
                          >
                            <SelectTrigger className="w-[100px]">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="income">Income</SelectItem>
                              <SelectItem value="expense">Expense</SelectItem>
                              <SelectItem value="debt">Debt</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          tx.type
                        )}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className={isZero ? 'text-red-600 font-semibold' : ''}>
                        {editingRowId === rowId ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={tx.amount}
                            onChange={(e) => handleTransactionChange(rowId, 'amount', e.target.value)}
                            className={`w-[110px] ${isZero ? 'ring-1 ring-red-400' : ''}`}
                          />
                        ) : (
                          fmt(Number(tx.amount || 0))
                        )}
                      </TableCell>

                      {/* Description */}
                      <TableCell className="max-w-[240px] truncate">
                        {editingRowId === rowId ? (
                          <Textarea
                            value={tx.description}
                            onChange={(e) => handleTransactionChange(rowId, 'description', e.target.value)}
                            rows={2}
                            className="w-[240px]"
                          />
                        ) : (
                          tx.description
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell>
                        {editingRowId === rowId ? (
                          <Input
                            type="date"
                            value={tx.date}
                            onChange={(e) => handleTransactionChange(rowId, 'date', e.target.value)}
                            className="w-[150px]"
                          />
                        ) : (
                          tx.date
                        )}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        {editingRowId === rowId ? (
                          <SearchableCategorySelect
                            value={tx.category}
                            onChange={(val) => handleTransactionChange(rowId, 'category', val)}
                            categories={categories}
                          />
                        ) : (
                          tx.category
                        )}
                      </TableCell>

                      {/* Account */}
                      <TableCell>
                        {editingRowId === rowId ? (
                          <SearchableAccountSelect
                            value={tx.account_id}
                            onChange={(val) => handleTransactionChange(rowId, 'account_id', val)}
                            accounts={accounts}
                          />
                        ) : (
                          accounts.find(acc => String(acc.id) === String(tx.account_id))?.name || 'N/A'
                        )}
                      </TableCell>

                      {/* Confidence */}
                      <TableCell>
                        {tx.confidenceScore !== undefined ? (
                          <Badge
                            variant={
                              tx.confidenceScore >= 90 ? 'success' :
                              tx.confidenceScore >= 60 ? 'default' : 'destructive'
                            }
                          >
                            {Math.round(tx.confidenceScore)}%
                          </Badge>
                        ) : 'N/A'}
                      </TableCell>

                      {/* Duplicate details */}
                      <TableCell>
                        {dupCount > 0 ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Badge variant="destructive" className="cursor-pointer">
                                View ({dupCount})
                              </Badge>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Potential duplicates ({dupCount})</DialogTitle>
                                <DialogDescription>
                                  These existing transactions look similar. Uncheck “Import?” to skip.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-2 mt-2">
                                {tx.duplicateMatches!.map((m, i) => (
                                  <div key={i} className="border rounded p-2 text-sm">
                                    <div><strong>Amount:</strong> {fmt(m.amount)}</div>
                                    <div><strong>Date:</strong> {m.date}</div>
                                    <div className="truncate"><strong>Desc:</strong> {m.description}</div>
                                    <div><strong>Similarity:</strong> {(m.score * 100).toFixed(0)}%</div>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <Badge variant="outline">No duplicate</Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="flex space-x-2">
                        {editingRowId === rowId ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingRowId(null)}
                              className="flex items-center"
                              disabled={isBusy}
                            >
                              <XCircle size={16} className="mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setEditingRowId(null)}
                              className="flex items-center"
                              disabled={isBusy}
                            >
                              <CheckCircle size={16} className="mr-1" /> Save
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingRowId(rowId)}
                              className="flex items-center"
                              disabled={isBusy}
                            >
                              <Edit3 size={16} className="mr-1" /> Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleTransactionDelete(rowId)}
                              className="flex items-center"
                              disabled={isBusy}
                            >
                              <Trash2 size={16} className="mr-1" /> Delete
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* BOTTOM sticky scrollbar */}
      </div>

      <div className="flex justify-between items-center mt-4">
        <div className="text-sm text-gray-600">
          {(() => {
            const total = transactions.length;
            const dup = transactions.filter(t => t.duplicateFlag).length;
            const selected = transactions.filter(t => t.includeInImport !== false).length;
            return `Selected: ${selected}/${total}  Duplicates flagged: ${dup}`;
          })()}
        </div>
        <div className="space-x-2">
          <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
            <XCircle size={18} className="mr-2" /> Cancel Review
          </Button>
<Button
  onClick={handleConfirmOnce}
  disabled={isCancelled || isBusy || confirmClicked}      // ⬅️ removed hasZeroSelected
  aria-disabled={isCancelled || isBusy || confirmClicked} // ⬅️ removed hasZeroSelected
  aria-busy={isBusy}
>
  {isBusy ? 'Working…' : confirmClicked ? 'Submitted' : 'Confirm & Submit Selected'}
</Button>

        </div>
      </div>
    </div>
  );
};


// ------------ Main ------------
const ChatInterface = () => {
  const RAIRO_API_BASE_URL = 'https://rairo-stmt-api.hf.space';
  const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

  const [forceCash, setForceCash] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ id: string; sender: string; content: string | JSX.Element }>
  >([]);

  // 🔹 single source of truth for the active loader
  const loaderIdRef = useRef<string | null>(null);

  const showLoader = (message: string) => {
    const id = `loader-${Date.now()}-${Math.random()}`;
    loaderIdRef.current = id;
    const node = <TableLoading message={message} />;

    setMessages(prev => [...prev, { id, sender: 'assistant', content: node }]);
  };

  const hideLoader = () => {
    if (!loaderIdRef.current) return;
    const idToRemove = loaderIdRef.current;
    loaderIdRef.current = null;
    setMessages(prev => prev.filter(m => m.id !== idToRemove));
  };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingTxs, setExistingTxs] = useState<ExistingTx[]>([]);
  const [typedDescription, setTypedDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recognitionRef = useRef<any>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [confirmationInitiated, setConfirmationInitiated] = useState(false);
  const { symbol, fmt } = useCurrency();

  // evidence modal state
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState<string>('');
  const [products, setProducts] = useState<ProductDB[]>([]);
  // keep queued sales here so we post them after user confirms
  const [pendingSales, setPendingSales] = useState<
    Array<{
      customer_name: string;
      office?: string | null;
      date: string;
      description: string;
      amount: number;
    }>
  >([]);
  const pendingSalesRef = useRef<typeof pendingSales>([]);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // prevent double-submit on import
  const [importBusy, setImportBusy] = useState(false);

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const getAuthHeaders = useCallback(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const categories = [
    'Groceries', 'Rent', 'Utilities', 'Transport', 'Food', 'Salary', 'Deposit', 'Loan',
    'Debt Payment', 'Entertainment', 'Shopping', 'Healthcare', 'Education', 'Travel',
    'Investments', 'Insurance', 'Bills', 'Dining Out', 'Subscriptions', 'Other',
    'Sales', 'Interest Income', 'Cost of Goods Sold', 'Accounts Payable', 'Rent Expense',
    'Utilities Expenses', 'Car Loans', 'Sales Revenue', 'General Expense', 'Fees',
    'Purchases', 'Refund', 'Fuel', 'Salaries and wages', 'Projects Expenses',
    'Accounting fees', 'Repairs & Maintenance', 'Water and electricity',
    'Bank charges', 'Insurance', 'Loan interest',
    'Computer internet and Telephone', 'Website hosting fees', 'Credit Facility',
  ];

  // auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // --- chat helpers ---
  const addAssistantMessage = (content: string | JSX.Element) =>
    setMessages(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, sender: 'assistant', content },
    ]);

  const addUserMessage = (content: string) =>
    setMessages(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, sender: 'user', content },
    ]);

  // very-light heuristics
  const looksLikeSale = (s: string) =>
    /\b(sold|sell|sale|invoice|billed?|charged?)\b/i.test(s);

  // money/qty regex
  const moneyRx =
    /(?:^|[\s])(?:r|rand|\$)?\s*([0-9]+(?:[.,][0-9]{1,2})?)(?=$|[\s.,])/gi;
  const qtyRx =
    /(?:^|[\s])(?:x|qty|quantity|units?|pcs?)\s*([0-9]+)|(?:^|[\s])([0-9]+)\s*(?:x|units?|pcs?)(?=$|[\s.,])/i;

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokenSet2 = (s: string) =>
    new Set(
      norm(s)
        .split(' ')
        .filter(Boolean)
    );
  const jaccard2 = (a: Set<string>, b: Set<string>) => {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter || 1);
  };

  type FundingMethod = 'none' | 'cash' | 'liability';

  type AssetFundingChoice = {
    create: boolean;
    fundingMethod: FundingMethod;
    bankAccountId: number | null;
    liabilityAccountId: number | null;
  };

  type AssetFundingDialogState = {
    open: boolean;
    tx: (Transaction & { _amt?: number }) | null;
  };

  const [assetFundingDialog, setAssetFundingDialog] =
    useState<AssetFundingDialogState>({
      open: false,
      tx: null,
    });

  const [assetFundingForm, setAssetFundingForm] = useState<{
    create: boolean;
    fundingMethod: FundingMethod;
    bankAccountId: string;
    liabilityAccountId: string;
  }>({
    create: true,
    fundingMethod: 'cash',
    bankAccountId: '',
    liabilityAccountId: '',
  });

  const assetFundingResolverRef = useRef<
    null | ((choice: AssetFundingChoice | null) => void)
  >(null);

  const looksLikeBankOrCash = (acc: any) =>
    (acc.type || '').toLowerCase() === 'asset' &&
    /cash|bank|cheque|checking|current|savings|petty/i.test(acc.name || '');

  const bankAccounts = useMemo(
    () => accounts.filter(looksLikeBankOrCash),
    [accounts]
  );

  const liabilityAccounts = useMemo(
    () => accounts.filter(a => (a.type || '').toLowerCase() === 'liability'),
    [accounts]
  );

  const askAssetFundingViaDialog = (
    tx: Transaction & { _amt?: number }
  ): Promise<AssetFundingChoice | null> => {
    return new Promise(resolve => {
      assetFundingResolverRef.current = resolve;
      setAssetFundingForm({
        create: true,
        fundingMethod: 'cash',
        bankAccountId: '',
        liabilityAccountId: '',
      });
      setAssetFundingDialog({ open: true, tx });
    });
  };

  const resolveAssetFunding = (choice: AssetFundingChoice | null) => {
    if (assetFundingResolverRef.current) {
      assetFundingResolverRef.current(choice);
      assetFundingResolverRef.current = null;
    }
    setAssetFundingDialog({ open: false, tx: null });
  };

  function bestProductMatch(text: string, list: ProductDB[]) {
    const t = tokenSet2(text);
    let best: ProductDB | null = null,
      bestScore = 0;
    list.forEach(p => {
      const s = jaccard2(t, tokenSet2(p.name));
      const boost = norm(text).includes(norm(p.name)) ? 0.2 : 0;
      const score = s + boost;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    });
    return bestScore >= 0.35 ? best : null; // tolerate misspelling like "Accomodation"
  }

  function parseSaleLocally(text: string, list: ProductDB[]) {
    // qty
    let qty = 1;
    const q = qtyRx.exec(text);
    if (q) qty = Number(q[1] || q[2]) || 1;

    // total/each price
    let total: number | null = null,
      each: number | null = null;
    const m = [...text.matchAll(moneyRx)].map(x =>
      Number(String(x[1]).replace(',', '.'))
    );
    if (m.length === 1) total = m[0];
    if (m.length >= 2) {
      each = m[0];
      total = m[1];
    }
    if (each != null && total == null)
      total = Math.round(each * qty * 100) / 100;

    const product = bestProductMatch(text, list);
    if (!product) return null;

    return { product, qty, total, each };
  }

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );

  // Load accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!isAuthenticated || !token) {
        setAccounts([]);
        addAssistantMessage(
          'Please log in to load accounts and import transactions.'
        );
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/accounts`, {
          headers: getAuthHeaders(),
        });
        const data: Account[] = await response.json();
        setAccounts(Array.isArray(data) ? data : []);
        addAssistantMessage(
          'Accounts loaded successfully. You can now import transactions.'
        );
      } catch (error: any) {
        console.error('Failed to fetch accounts:', error);
        setAccounts([]);
        addAssistantMessage(
          `Failed to load accounts: ${
            error.message || 'Network error'
          }. Please ensure your backend is running and you are logged in.`
        );
      }
    };
    fetchAccounts();
  }, [isAuthenticated, token, getAuthHeaders]);

  // Turn a queued sale into a preview row for the editable table
  function saleToPreviewRow(
    s: {
      customer_name: string;
      office?: string | null;
      date: string;
      description: string;
      amount: number;
    },
    accounts: Account[]
  ): Transaction {
    const salesRevenueAcc = accounts.find(
      a =>
        a.type?.toLowerCase() === 'income' &&
        a.name?.toLowerCase().includes('sales revenue')
    );

    return {
      _tempId: crypto.randomUUID(),
      type: 'income',
      amount: Number(s.amount || 0),
      description: `SALE • ${s.description} — ${s.customer_name}${
        s.office ? ` @ ${s.office}` : ''
      }`,
      date: s.date || new Date().toISOString().slice(0, 10),
      category: 'Sales Revenue',
      account_id: salesRevenueAcc ? String(salesRevenueAcc.id) : '',
      original_text: 'sales-queue',
      source: 'sales-preview', // marks it as a sale row
      is_verified: true,
      confidenceScore: 100,
      includeInImport: true,
    };
  }

  // Load products
  useEffect(() => {
    const fetchProducts = async () => {
      if (!isAuthenticated || !token) {
        setProducts([]);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/products-services`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch products with status: ${response.status}`
          );
        }
        const data: ProductDB[] = await response.json();
        const parsedData = data.map(p => ({
          ...p,
          unit_price: parseFloat(p.unit_price as any),
          cost_price:
            p.cost_price != null ? parseFloat(p.cost_price as any) : null,
          stock_quantity: parseInt(p.stock_quantity as any, 10),
        }));
        setProducts(Array.isArray(parsedData) ? parsedData : []);
        console.log('Products loaded for AI context.');
      } catch (error: any) {
        console.error('Failed to fetch products:', error);
        setProducts([]);
      }
    };
    fetchProducts();
  }, [isAuthenticated, token, getAuthHeaders]);

  const openEvidenceFor = (txs: Transaction[], sourceLabel: string) => {
    if (!txs || txs.length === 0) return;
    const t = txs[0];
    const note = `Evidence for ${t.type} ${fmt(
      Number(t.amount || 0)
    )} on ${t.date} — ${t.description} (${sourceLabel})`;
    setEvidenceNotes(note);
    setEvidenceOpen(true);
  };

  // Load recent existing transactions (for dup check)
  useEffect(() => {
    const fetchExisting = async () => {
      if (!isAuthenticated || !token) {
        setExistingTxs([]);
        return;
      }
      try {
        const since = new Date();
        since.setDate(since.getDate() - 180);
        const params = new URLSearchParams({
          since: since.toISOString().slice(0, 10),
          limit: '500',
        });
        const res = await fetch(
          `${API_BASE_URL}/transactions?${params.toString()}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
          }
        );
        if (res.status === 401) {
          setExistingTxs([]);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExistingTxs(
          Array.isArray(data)
            ? data.map((t: any) => ({
                id: t.id,
                amount: Number(t.amount),
                date: (t.date || '').slice(0, 10),
                description: t.description || '',
                type: t.type,
                account_id: t.account_id,
              }))
            : []
        );
      } catch (e) {
        console.error('Failed to fetch existing transactions for dup-check:', e);
        setExistingTxs([]);
      }
    };
    fetchExisting();
  }, [isAuthenticated, token, getAuthHeaders]);

  // Helper: ensure a customer exists (GET by name, else POST)
  const ensureCustomer = async (customerName: string) => {
    if (!isAuthenticated || !token)
      throw new Error('Authentication required.');
    const searchName = customerName || 'Walk-in Customer';
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/customers?search=${encodeURIComponent(
          searchName
        )}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (response.ok) {
        const customers: any[] = await response.json();
        const existing = customers.find(
          c => c.name.toLowerCase() === searchName.toLowerCase()
        );
        if (existing) {
          return existing;
        }
      }

      const createRes = await fetch(`${API_BASE_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: searchName }),
      });
      if (!createRes.ok) throw new Error('Failed to create customer');
      return await createRes.json();
    } catch (error) {
      console.error('Error ensuring customer exists:', error);
      return { id: 'default', name: 'Walk-in Customer' };
    }
  };

  // post a sale to /api/sales
  const submitSale = async (sale: {
    customer_name: string;
    office?: string | null;
    date: string;
    description: string;
    amount: number;
  }) => {
    if (!isAuthenticated || !token)
      throw new Error('Authentication required.');

    const customer = await ensureCustomer(sale.customer_name);

    const cart = [
      {
        id: 'excel-import',
        name: sale.description || `Sale for ${sale.customer_name}`,
        quantity: 1,
        unit_price: Number(sale.amount) || 0,
        subtotal: Number(sale.amount) || 0,
        tax_rate_value: 0,
        is_service: true,
      },
    ];

    const payload = {
      cart,
      total: Number(sale.amount) || 0,
      amountPaid: 0,
      change: 0,
      paymentType: 'Bank',
      dueDate: null,
      tellerName: 'Excel Import',
      branch: sale.office || null,
      companyName: null,
      customer: { id: customer.id, name: customer.name },
    };

    const res = await fetch(`${API_BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok)
      throw new Error(`Sale post failed: ${res.status} ${await res.text()}`);
    return await res.json();
  };

  // file kind helpers
  const isExcelFile = (f: File | null) => {
    if (!f) return false;
    const name = f.name.toLowerCase();
    const type = (f.type || '').toLowerCase();
    return (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      type.includes('spreadsheet') ||
      type === 'application/vnd.ms-excel' ||
      type ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  };

  const isPdfFile = (f: File | null) =>
    !!f &&
    (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

  const isImageFile = (f: File | null) => {
    if (!f) return false;
    const t = (f.type || '').toLowerCase();
    const n = f.name.toLowerCase();
    return (
      t.startsWith('image/') ||
      n.endsWith('.jpg') ||
      n.endsWith('.jpeg') ||
      n.endsWith('.png') ||
      n.endsWith('.gif') ||
      n.endsWith('.bmp') ||
      n.endsWith('.webp')
    );
  };

  // File change (PDF & Excel & images)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (!selectedFile) {
      addAssistantMessage('No file selected.');
      return;
    }

    if (
      !isPdfFile(selectedFile) &&
      !isExcelFile(selectedFile) &&
      !isImageFile(selectedFile)
    ) {
      addAssistantMessage('Only PDF, Excel, or image files are supported.');
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    setTypedDescription(`File: ${selectedFile.name}`);
    e.target.value = '';
  };

  // PDF / image upload
  const handleFileUpload = async () => {
    if (!file) {
      addAssistantMessage('No file selected for upload.');
      return;
    }
    if (!isAuthenticated || !token) {
      addAssistantMessage('Authentication required to upload files.');
      return;
    }

    // Excel goes through existing Excel path
    if (isExcelFile(file)) {
      await handleExcelUpload();
      return;
    }

    // Image/PDF → RAIRO endpoints
    if (!isPdfFile(file) && !isImageFile(file)) {
      addAssistantMessage('Only PDF, Excel, or supported image files are allowed.');
      setFile(null);
      setTypedDescription('');
      return;
    }

    const isPdf = isPdfFile(file);
    const endpoint = `${RAIRO_API_BASE_URL}/${
      isPdf ? 'process-pdf' : 'process-image'
    }`;
    addUserMessage(`Uploading ${isPdf ? 'PDF' : 'Image'}: ${file.name}…`);
    showLoader(`Extracting transactions from ${isPdf ? 'PDF' : 'image'}…`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(endpoint, { method: 'POST', body: formData });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Upload failed');
      }

      addAssistantMessage(
        `${isPdf ? 'PDF' : 'Image'} processed successfully! Building preview…`
      );

      const transformed: Transaction[] = (result.transactions || []).map(
        (tx: any) => {
          const transactionType = (tx.Type || 'expense').toLowerCase();

          let transactionCategory = tx.Destination_of_funds || 'Uncategorized';
          if (
            transactionType === 'income' &&
            ['income', 'general income'].includes(
              (transactionCategory || '').toLowerCase()
            )
          ) {
            transactionCategory = 'Sales Revenue';
          }

          let transactionDate: string;
          try {
            transactionDate = tx.Date
              ? new Date(
                  tx.Date.split('/').reverse().join('-')
                ).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
          } catch {
            transactionDate = new Date().toISOString().split('T')[0];
          }

          const { accountId, confidence } = suggestAccountForUpload(
            {
              type: transactionType,
              category: transactionCategory,
              description: tx.Description,
            },
            accounts
          );

          return {
            _tempId: crypto.randomUUID(),
            type: transactionType as 'income' | 'expense' | 'debt',
            amount: tx.Amount ? parseFloat(tx.Amount) : 0,
            description: tx.Description || 'Imported Transaction',
            date: transactionDate,
            category: transactionCategory,
            account_id: accountId || '',
            original_text:
              tx.Original_Text || tx.Description || 'Imported Transaction',
            source: isPdf ? 'pdf-upload' : 'image-upload',
            is_verified: true,
            confidenceScore: confidence,
            includeInImport: true,
          };
        }
      );

      const flagged = markDuplicates(transformed, existingTxs);
      hideLoader();

      addAssistantMessage(
        <EditableTransactionTable
          transactions={flagged}
          accounts={accounts}
          categories={categories}
          onConfirm={handleConfirmProcessedTransaction}
          onCancel={() =>
            addAssistantMessage('Transaction review cancelled.')
          }
          forceCash={forceCash}
          onToggleForceCash={setForceCash}
          isBusy={importBusy}
        />
      );
      openEvidenceFor(flagged, isPdf ? 'pdf' : 'image');
    } catch (error: any) {
      console.error('Upload error:', error);
      hideLoader();
      addAssistantMessage(
        `Error processing ${isPdf ? 'PDF' : 'image'}: ${
          error.message || 'Unknown error'
        }`
      );
    } finally {
      setFile(null);
      setTypedDescription('');
    }
  };

  const handleExcelUpload = async () => {
    if (!file) {
      addAssistantMessage('No file selected for upload.');
      return;
    }
    if (!isAuthenticated || !token) {
      addAssistantMessage('Authentication required to upload files.');
      return;
    }
    if (!isExcelFile(file)) {
      addAssistantMessage('Please select a valid Excel file (.xlsx/.xls).');
      return;
    }

    addUserMessage(`Initiating Excel import: ${file.name}...`);
    showLoader('Parsing Excel and preparing preview…');

    try {
      const XLSX = await import('xlsx');

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        hideLoader();
        addAssistantMessage('No rows found in the first sheet.');
        return;
      }

      const prepared: Transaction[] = [];
      const salesQueue: Array<{
        customer_name: string;
        office?: string | null;
        date: string;
        description: string;
        amount: number;
      }> = [];

      for (const row of rows) {
        const rowNorm: Record<string, any> = {};
        Object.keys(row).forEach(k => {
          rowNorm[k.trim().toLowerCase()] = row[k];
        });

        const netRaw = rowNorm['net'];
        const client = String(rowNorm['client'] || '').trim();
        const office = String(rowNorm['office'] || '').trim();

        const num = (v: any) =>
          typeof v === 'number'
            ? v
            : typeof v === 'string'
            ? parseFloat(v.replace(/[\s,]+/g, '')) || 0
            : 0;

        const revenue = num(netRaw);
        if (!revenue) continue;

        const date = new Date().toISOString().slice(0, 10);
        const tag = [client && `Client: ${client}`, office && `Office: ${office}`]
          .filter(Boolean)
          .join(' | ');
        const baseDesc = 'Agent Import' + (tag ? ` [${tag}]` : '');

        const customer_name = client || 'Walk-in';
        salesQueue.push({
          customer_name,
          office: office || null,
          date,
          description: baseDesc || `Sale for ${customer_name}`,
          amount: Math.abs(revenue),
        });

        if (revenue) {
          const desc = `Sale — ${customer_name}${
            office ? ` @ ${office}` : ''
          }`;

          const salesRevenueAcc = accounts.find(
            a =>
              a.type?.toLowerCase() === 'income' &&
              a.name?.toLowerCase().includes('sales revenue')
          );

          prepared.push({
            _tempId: crypto.randomUUID(),
            type: 'income',
            amount: Math.abs(revenue),
            description: `${desc} [Sales]`,
            date,
            category: 'Sales Revenue',
            account_id: salesRevenueAcc ? String(salesRevenueAcc.id) : '',
            original_text: JSON.stringify(row),
            source: 'sales-preview',
            is_verified: true,
            confidenceScore: 100,
            includeInImport: true,
            is_sale: true,
            product_id: null,
            product_name: customer_name
              ? `Sale to ${customer_name}`
              : 'Sale',
            quantity: 1,
            unit_price: Math.abs(revenue),
            total: Math.abs(revenue),
          });
        }

        const salesRevenueAcc = accounts.find(
          a =>
            a.type?.toLowerCase() === 'income' &&
            a.name?.toLowerCase().includes('sales revenue')
        );

        prepared.push({
          _tempId: crypto.randomUUID(),
          type: 'income',
          amount: Math.abs(revenue),
          description:
            (baseDesc || `Sale for ${customer_name}`) + ' [Journal]',
          date,
          category: 'Sales Revenue',
          account_id: salesRevenueAcc ? String(salesRevenueAcc.id) : '',
          original_text: JSON.stringify(row),
          source: 'excel-journal',
          is_verified: true,
          confidenceScore: 100,
          includeInImport: true,
        });
      }
      setPendingSales(salesQueue);
      pendingSalesRef.current = salesQueue;

      if (!prepared.length && !salesQueue.length) {
        hideLoader();
        addAssistantMessage(
          'No importable transactions were derived from the Excel file.'
        );
        return;
      }

      const salesTotal = salesQueue.reduce(
        (sum, s) => sum + Number(s.amount || 0),
        0
      );
      addAssistantMessage(
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-sm">
          <div className="font-semibold">Sales queued for posting:</div>
          <div>
            {salesQueue.length} sale(s), total {fmt(salesTotal)} — will be
            submitted after you click <em>Confirm &amp; Submit Selected</em>.
          </div>
        </div>
      );

      const saleRows = salesQueue.map(s => saleToPreviewRow(s, accounts));

      const previewRows = [...prepared, ...saleRows];
      const flagged = markDuplicates(previewRows, existingTxs);
      hideLoader();

      addAssistantMessage(
        <EditableTransactionTable
          transactions={flagged}
          accounts={accounts}
          categories={categories}
          onConfirm={handleConfirmProcessedTransaction}
          onCancel={() =>
            addAssistantMessage('Transaction review cancelled.')
          }
          forceCash={forceCash}
          onToggleForceCash={setForceCash}
          isBusy={importBusy}
        />
      );
    } catch (err: any) {
      console.error('Excel parse error:', err);
      hideLoader();
      addAssistantMessage(
        `Failed to process Excel file: ${err.message || 'Unknown error'}`
      );
    } finally {
      setFile(null);
      setTypedDescription('');
    }
  };

  // UI helper: green success bubble
  const successBubble = (title: string, lines?: string[]) => (
    <div className="p-3 rounded-2xl bg-green-100 text-green-900 border border-green-200">
      <div className="font-semibold mb-1">{title}</div>
      {Array.isArray(lines) && lines.length > 0 && (
        <ul className="list-disc ml-5 mt-1 text-sm">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const handleTypedDescriptionSubmit = async () => {
    if (!typedDescription.trim()) {
      addAssistantMessage('Please enter a description.');
      return;
    }
    if (!isAuthenticated || !token) {
      addAssistantMessage('Authentication required to process text.');
      return;
    }

    const userMessageContent = typedDescription;

    addUserMessage(userMessageContent);
    showLoader('Analyzing your description…');
    setTypedDescription('');

    // EARLY LOCAL SALE DETECTION
    const moneyHits = [...userMessageContent.matchAll(moneyRx)].length;
    const hasManyClauses = /[,;&]| and | also /i.test(userMessageContent);
    if (
      looksLikeSale(userMessageContent) &&
      products.length &&
      moneyHits <= 1 &&
      !hasManyClauses
    ) {
      const local = parseSaleLocally(userMessageContent, products);
      if (local) {
        const { product, qty, total, each } = local;
        const computedTotal =
          (total != null ? total : (each ?? product.unit_price) * qty) || 0;
        const unitPrice =
          qty > 0 ? computedTotal / qty : Number(product.unit_price || 0);

        const customer = await ensureCustomer('Walk-in Customer'); // default

        // your salePayload logic goes here (unchanged)
        // ...

        const saleResponse = await fetch(`${API_BASE_URL}/api/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(salePayload), // assuming you already build salePayload
        });

        if (!saleResponse.ok) {
          let detail = '';
          try {
            const err = await saleResponse.json();
            detail = err?.detail || err?.error || '';
          } catch {}
          throw new Error(detail || 'Failed to process sale.');
        }
        hideLoader();

        addAssistantMessage(
          <div className="p-3 rounded-2xl bg-green-100 text-green-900 border border-green-200">
            <div className="font-semibold mb-1">
              ✅ Sale Recorded & Stock Updated!
            </div>
            <div>
              Sold {qty} × “{product.name}” for {fmt(unitPrice * qty)}.
            </div>

            {product.is_service ? (
              <div className="text-xs mt-1">
                Note: Service item — no stock deduction.
              </div>
            ) : null}
          </div>
        );
        return;
      }
    }

    try {
      const productNames = products.map(p => p.name);
      const prompt = `
Analyze the following text from a user describing a financial transaction.
Text: "${userMessageContent}"

First, determine if this is a SALE of a product or service.
If it is a sale, identify the product name, the quantity sold, the total amount, and the customer name if mentioned.
Your list of available products is: ${JSON.stringify(
        productNames
      )}. Try to match a product from this list.

Respond with a JSON object with this exact schema:
{
  "isSale": boolean,
  "transactions": [
    {
      "Type": "income" | "expense" | "debt",
      "Amount": number,
      "Description": "a clean description of the transaction",
      "Date": "YYYY-MM-DD",
      "Destination_of_funds": "a suggested category",
      "Customer_name": "customer name if mentioned, otherwise null",
      "Product_name": "the name of the product sold, if isSale is true, otherwise null",
      "Quantity": number
    }
  ]
}
`;

      const response = await fetch(`${RAIRO_API_BASE_URL}/process-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt }),
      });
      const result = await response.json();

      if (!(response.ok && result.transactions && result.transactions.length > 0)) {
        hideLoader();
        addAssistantMessage(
          `Error analyzing description: ${result.error || 'Unknown error'}`
        );
        return;
      }

      hideLoader();

      // 2) THEN post queued sales from Excel/text if any
      try {
        const salesToSubmit = [...pendingSalesRef.current];
        if (salesToSubmit.length) {
          let ok = 0;
          for (const s of salesToSubmit) {
            try {
              await submitSale(s);
              ok++;
              addAssistantMessage(
                successBubble('✅ Sale Recorded', [
                  `Sold "${s.description || 'Sale'}" for ${fmt(
                    Number(s.amount || 0)
                  )}`,
                ])
              );
            } catch (e: any) {
              addAssistantMessage(
                `Failed sale for "${s.customer_name}" (${fmt(
                  Number(s.amount || 0)
                )}): ${e?.message || e}`
              );
            }
          }
          addAssistantMessage(
            `Sales posting complete: ${ok}/${salesToSubmit.length} succeeded.`
          );
        }
      } finally {
        pendingSalesRef.current = [];
        setPendingSales([]);
      }

      // split output into sales vs journals
      const salesQueue: Array<{
        customer_name: string;
        office?: string | null;
        date: string;
        description: string;
        amount: number;
      }> = [];
      const journalRows: Transaction[] = [];

      const lc = (s?: string) => (s || '').toLowerCase().trim();
      const pickProduct = (nameFromAI?: string, textForFallback?: string) => {
        const text = lc(nameFromAI);
        if (!text && !textForFallback) return null;
        const inText = lc(textForFallback || '');
        let p = text
          ? products.find(x => lc(x.name) === text)
          : null;
        if (!p && text)
          p = products.find(
            x =>
              lc(x.name).includes(text) || text.includes(lc(x.name))
          );
        if (!p && inText)
          p = products.find(x => inText.includes(lc(x.name)));
        return p || null;
      };

      for (const tx of result.transactions as any[]) {
        const ttype = lc(tx.Type);
        const desc = (tx.Description || '').trim();

        const date = (() => {
          try {
            return tx.Date
              ? new Date(
                  tx.Date.split('/').reverse().join('-')
                ).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
          } catch {
            return new Date().toISOString().split('T')[0];
          }
        })();

        const looksSaleAI =
          ttype === 'income' &&
          (tx.Product_name ||
            /\b(sold|sale|invoice|billed?|charged?)\b/i.test(desc));

        if (looksSaleAI) {
          const qty = Math.max(1, Number(tx.Quantity || 1));
          const total = Number(tx.Amount || 0);
          const product = pickProduct(tx.Product_name, desc);

          if (product) {
            salesQueue.push({
              customer_name: tx.Customer_name || 'Walk-in',
              office: null,
              date,
              description: `${desc || product.name} [Sale]`,
              amount:
                total > 0 ? total : Number(product.unit_price || 0) * qty,
            });
          } else {
            salesQueue.push({
              customer_name: tx.Customer_name || 'Walk-in',
              office: null,
              date,
              description: desc || 'Service Sale',
              amount: total || 0,
            });
          }
          continue;
        }

        let cat = tx.Destination_of_funds || tx.Customer_name || 'N/A';
        const ld = lc(desc);
        if (!cat || lc(cat) === 'n/a') {
          if (ld.includes('rent')) cat = 'Rent Expense';
          else if (ld.includes('salary') || ld.includes('payroll'))
            cat = 'Salaries and wages';
          else if (ld.includes('fuel')) cat = 'Fuel';
          else if (
            ld.includes('utilities') ||
            ld.includes('electricity') ||
            ld.includes('water')
          )
            cat = 'Utilities Expenses';
          else if (ld.includes('sale') || ld.includes('revenue'))
            cat = 'Sales Revenue';
        }

        const { accountId, confidence } = suggestAccountForText(
          { type: ttype, category: cat, description: desc },
          accounts
        );

        journalRows.push({
          _tempId: crypto.randomUUID(),
          type: (ttype as 'income' | 'expense' | 'debt') || 'expense',
          amount: tx.Amount ? parseFloat(tx.Amount) : 0,
          description: desc || 'Imported Transaction',
          date,
          category: cat,
          account_id: accountId || '',
          original_text: userMessageContent,
          source: 'text-input',
          is_verified: true,
          confidenceScore: confidence,
          includeInImport: true,
        });
      }

      if (salesQueue.length) {
        pendingSalesRef.current = [
          ...pendingSalesRef.current,
          ...salesQueue,
        ];
        setPendingSales(pendingSalesRef.current);
        const totalSales = salesQueue.reduce(
          (s, x) => s + Number(x.amount || 0),
          0
        );
        addAssistantMessage(
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-sm">
            <div className="font-semibold">Sales queued for posting:</div>
            <div>
              {salesQueue.length} sale(s), total {fmt(totalSales)} — will be
              submitted after you click{' '}
              <em>Confirm &amp; Submit Selected</em>.
            </div>
          </div>
        );
      }

      if (journalRows.length) {
        const saleRows = (pendingSalesRef.current || []).map(s =>
          saleToPreviewRow(s, accounts)
        );
        const previewRows = [...journalRows, ...saleRows];

        const flagged = markDuplicates(previewRows, existingTxs);

        addAssistantMessage(
          <EditableTransactionTable
            transactions={flagged}
            accounts={accounts}
            categories={categories}
            onConfirm={handleConfirmProcessedTransaction}
            onCancel={() =>
              addAssistantMessage('Transaction review cancelled.')
            }
            forceCash={forceCash}
            onToggleForceCash={setForceCash}
            isBusy={importBusy}
          />
        );
        openEvidenceFor(previewRows, 'typed');
      } else {
        // No journals → post sales right away
        try {
          const q = [...pendingSalesRef.current];
          let ok = 0;
          for (const s of q) {
            try {
              await submitSale(s);
              ok++;
            } catch (e: any) {
              addAssistantMessage(
                `Failed sale for "${s.customer_name}" (${fmt(
                  Number(s.amount || 0)
                )}): ${e?.message || e}`
              );
            }
          }
          addAssistantMessage(
            `Sales posting complete: ${ok}/${q.length} succeeded.`
          );
        } finally {
          pendingSalesRef.current = [];
          setPendingSales([]);
        }
      }
    } catch (error: any) {
      console.error('Network error during text processing:', error);
      hideLoader();
      addAssistantMessage(
        `Network error during text processing: ${
          error.message || 'API is unavailable.'
        }`
      );
    }
  };

  // Voice
  const startRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addAssistantMessage(
        'Browser does not support speech recognition. Try Chrome.'
      );
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setIsRecording(true);
      addUserMessage('Started voice input...');
    };
    recognition.onresult = (event: any) => {
      const interimTranscript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setTranscribedText(interimTranscript);
      setTypedDescription(interimTranscript);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event);
      setIsRecording(false);
      addAssistantMessage(
        `Speech recognition error: ${event.error}. Please try again.`
      );
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      addUserMessage(`🛑 "${typedDescription}"`);
      addAssistantMessage(
        'Recording stopped. Press send to process this text.'
      );
    }
  };

  const uploadAudio = async () => {
    if (!audioBlob) {
      addAssistantMessage('No audio recorded to upload.');
      return;
    }
    if (!isAuthenticated || !token) {
      addAssistantMessage('Authentication required to process audio.');
      return;
    }

    addUserMessage('Processing recorded audio...');
    showLoader('Transcribing & analyzing your audio…');

    try {
      // Stub: replace with real STT when available
      const simulatedTranscribedText =
        'I paid fifty dollars for groceries on July fifth, two thousand twenty-five. I also received 1200 salary on the same day.';
      const processTextResponse = await fetch(
        `${RAIRO_API_BASE_URL}/process-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: simulatedTranscribedText }),
        }
      );
      const result = await processTextResponse.json();

      if (processTextResponse.ok) {
        if (!result.transactions || result.transactions.length === 0) {
          hideLoader();
          addAssistantMessage(
            'I could not make sense of that, please try again with a clearer description.'
          );
          return;
        }

        addAssistantMessage('Audio processed! Building preview…');

        const transformed: Transaction[] = (result.transactions || []).map(
          (tx: any) => {
            const transactionType =
              tx.Type === 'income' ? 'income' : 'expense';
            let transactionCategory = tx.Destination_of_funds;
            if (
              transactionType === 'income' &&
              ['income', 'general income'].includes(
                (transactionCategory || '').toLowerCase()
              )
            ) {
              transactionCategory = 'Sales Revenue';
            }

            let transactionDate: string;
            try {
              transactionDate = tx.Date
                ? new Date(
                    tx.Date.split('/').reverse().join('-')
                  ).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];
            } catch {
              transactionDate = new Date().toISOString().split('T')[0];
            }

            const { accountId, confidence } = suggestAccountForText(
              {
                type: transactionType,
                category: transactionCategory,
                description: tx.Description,
              },
              accounts
            );

            return {
              _tempId: crypto.randomUUID(),
              type: transactionType as 'income' | 'expense' | 'debt',
              amount: tx.Amount ? parseFloat(tx.Amount) : 0,
              description: tx.Description || 'Imported Transaction',
              date: transactionDate,
              category: transactionCategory,
              account_id: accountId || '',
              original_text: simulatedTranscribedText,
              source: 'audio-input',
              is_verified: true,
              confidenceScore: confidence,
            };
          }
        );

        const flagged = markDuplicates(transformed, existingTxs);
        hideLoader();

        addAssistantMessage(
          <EditableTransactionTable
            transactions={flagged}
            accounts={accounts}
            categories={categories}
            onConfirm={handleConfirmProcessedTransaction}
            onCancel={() =>
              addAssistantMessage('Transaction review cancelled.')
            }
            forceCash={forceCash}
            onToggleForceCash={setForceCash}
            isBusy={importBusy}
          />
        );

        openEvidenceFor(flagged, 'typed');
      } else {
        hideLoader();
        addAssistantMessage(
          `Error processing audio: ${result.error || 'Unknown error'}`
        );
      }
    } catch (error: any) {
      console.error('Network error during audio processing:', error);
      hideLoader();
      addAssistantMessage(
        `Network error during audio processing: ${
          error.message || 'API is unavailable.'
        }`
      );
    } finally {
      setAudioBlob(null);
      setAudioUrl(null);
      if (audioPlayerRef.current)
        (audioPlayerRef.current as any).src = '';
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    if (audioPlayerRef.current)
      (audioPlayerRef.current as any).src = '';
    addAssistantMessage('Audio cleared.');
  };

  // Helper: create an Asset account if needed
  async function createAssetAccount(
    assetAccountName: string
  ): Promise<number | null> {
    try {
      const existingSameName = accounts.find(
        a =>
          (a.type || '').toLowerCase() === 'asset' &&
          (a.name || '').toLowerCase() === assetAccountName.toLowerCase()
      );
      if (existingSameName) {
        console.log(
          `createAssetAccount: reusing existing asset account "${existingSameName.name}" (ID: ${existingSameName.id})`
        );
        return Number(existingSameName.id);
      }

      const existingAssetCodes = accounts
        .filter(
          a => (a.type || '').toLowerCase() === 'asset' && a.code != null
        )
        .map(a => parseInt(String((a as any).code), 10))
        .filter(n => Number.isFinite(n));

      let baseCode = 1800;
      if (existingAssetCodes.length) {
        const maxExisting = Math.max(...existingAssetCodes);
        baseCode = maxExisting >= 1800 ? maxExisting + 1 : 1800;
      }

      const payloadBase = {
        type: 'Asset',
        name: assetAccountName,
      };

      let codeToTry = baseCode;
      for (let attempt = 0; attempt < 5; attempt++) {
        const resp = await fetch(`${API_BASE_URL}/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            ...payloadBase,
            code: String(codeToTry),
          }),
        });

        let data: any = {};
        try {
          data = await resp.json();
        } catch {
          // ignore
        }

        if (resp.ok) {
          console.log(
            `createAssetAccount: created asset account "${data.name}" (ID: ${data.id}) with code ${codeToTry}`
          );
          setAccounts(prev => [...prev, data as Account]);
          return Number(data.id);
        }

        const msg = (data && (data.error || data.detail || '')) as string;
        if (resp.status === 409 && /code/i.test(msg || '')) {
          console.warn(
            `createAssetAccount: code ${codeToTry} already in use, trying ${
              codeToTry + 1
            }…`
          );
          codeToTry += 1;
          continue;
        }

        console.error('createAssetAccount failed:', data);
        return null;
      }

      console.error(
        `createAssetAccount: could not find a free code for "${assetAccountName}" after several attempts`
      );
      return null;
    } catch (err) {
      console.error('createAssetAccount error:', err);
      return null;
    }
  }

  // PIPELINE: create assets, stage+commit journal batch, then post sales
  const handleConfirmProcessedTransaction = async (
    transactionsToSave: Transaction[]
  ) => {
    const API_BASE_URL_REAL = 'https://quantnow-sa1e.onrender.com';
    const authHeaders = getAuthHeaders();

    if (importBusy) return;
    setImportBusy(true);

    addAssistantMessage(<ImportProgressBubble />);

    const toSubmit = (transactionsToSave || [])
      .filter(t => t.includeInImport !== false)
      .filter(t => t.source !== 'sales-preview');

    const salesOnlyQueue = [...pendingSalesRef.current];

    if (toSubmit.length === 0) {
      if (salesOnlyQueue.length === 0) {
        addAssistantMessage('Nothing selected to import.');
        setImportBusy(false);
        sendProgress('staging', 'done');
        sendProgress('preview', 'done');
        sendProgress('mapping', 'done');
        sendProgress('posting', 'done');
        return;
      }

      addAssistantMessage(
        `No journal rows to import. Proceeding to post ${salesOnlyQueue.length} sale(s)…`
      );
      try {
        let ok = 0;
        for (const s of salesOnlyQueue) {
          try {
            await submitSale(s);
            ok++;
            addAssistantMessage(
              successBubble('✅ Sale submitted', [
                `${s.description} — ${fmt(
                  Number(s.amount || 0)
                )} (${s.customer_name})`,
              ])
            );
          } catch (e: any) {
            addAssistantMessage(
              `Failed sale for "${s.customer_name}" (${fmt(
                Number(s.amount || 0)
              )}): ${e?.message || e}`
            );
          }
        }
        addAssistantMessage(
          `Sales posting complete: ${ok}/${salesOnlyQueue.length} succeeded.`
        );
      } finally {
        pendingSalesRef.current = [];
        setPendingSales([]);
        setImportBusy(false);
        sendProgress('staging', 'done');
        sendProgress('preview', 'done');
        sendProgress('mapping', 'done');
        sendProgress('posting', 'done');
      }
      return;
    }

    const toSubmitRounded = (toSubmit || []).map(t => ({
      ...t,
      _amt: round2(Number(t.amount || 0)),
    }));

    const zeroRows = toSubmitRounded.filter(
      t => Math.abs(t._amt) < MIN_CENTS
    );
    const toSubmitFiltered = toSubmitRounded.filter(
      t => Math.abs(t._amt) >= MIN_CENTS
    );

    if (zeroRows.length) {
      addAssistantMessage(
        <div className="p-3 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 text-sm">
          <div className="font-semibold mb-1">
            Zero-amount rows will be skipped
          </div>
          <div>
            {zeroRows.length} selected row
            {zeroRows.length > 1 ? 's' : ''} have amount 0. They won’t be sent
            to the server.
          </div>
          <ul className="list-disc ml-5 mt-1">
            {zeroRows.slice(0, 5).map((t, i) => (
              <li key={i}>
                {t.date} — {t.description}
              </li>
            ))}
          </ul>
          {zeroRows.length > 5 && (
            <div className="mt-1">
              …and {zeroRows.length - 5} more.
            </div>
          )}
        </div>
      );
    }

    try {
      type AssetCreationResult = {
        success: boolean;
        assetId?: string | number;
        error?: string;
        transaction: Transaction;
      };

      const assetCreationPromises: Promise<AssetCreationResult>[] = [];
      const assetTransactionMap = new Map<
        string,
        { assetId: string | number; accountId: number }
      >();

      for (const tx of toSubmitFiltered) {
        if (tx.type !== 'asset') continue;

        const txWithAmt: Transaction & { _amt?: number } = {
          ...tx,
          _amt:
            typeof tx._amt === 'number'
              ? tx._amt
              : round2(Number(tx.amount || 0)),
        };

        const choice = await askAssetFundingViaDialog(txWithAmt);

        if (!choice) {
          console.log(
            `User skipped asset for: ${txWithAmt.description}`
          );
          continue;
        }

        if (!choice.create) {
          console.log(
            `User chose not to create fixed asset for: ${txWithAmt.description}`
          );
          continue;
        }

        const assetAccountName = txWithAmt.category || 'Fixed Assets';
        const assetName = txWithAmt.description || 'Imported Asset';
        const assetCost = txWithAmt._amt;
        const assetDate = txWithAmt.date;

        assetCreationPromises.push(
          (async (
            transaction: Transaction & { _amt?: number },
            funding: AssetFundingChoice
          ): Promise<AssetCreationResult> => {
            let assetAccountId: number | null = null;

            const existingAccount = accounts.find(
              (acc: any) =>
                (acc.type || '').toLowerCase() === 'asset' &&
                (acc.name || '').toLowerCase() ===
                  String(assetAccountName).toLowerCase()
            );

            if (existingAccount) {
              console.log(
                `Found existing asset account: ${existingAccount.name} (ID: ${existingAccount.id})`
              );
              assetAccountId = Number(existingAccount.id);
            } else {
              console.log(
                `Asset account "${assetAccountName}" not found. Attempting to create...`
              );
              assetAccountId = await createAssetAccount(assetAccountName);
              if (!assetAccountId) {
                console.error(
                  `Failed to create asset account "${assetAccountName}". Skipping asset creation for "${assetName}".`
                );
                return {
                  success: false,
                  error: `Could not create/find asset account "${assetAccountName}"`,
                  transaction,
                };
              }
              console.log(
                `Created new asset account (ID: ${assetAccountId}).`
              );
            }

            const fundingMethod = funding.fundingMethod;
            const paidFromAccountId =
              fundingMethod === 'cash' ? funding.bankAccountId : null;
            const financedLiabilityAccountId =
              fundingMethod === 'liability'
                ? funding.liabilityAccountId
                : null;

            try {
              const assetPayload: any = {
                name: assetName,
                cost: assetCost,
                date_received: assetDate,
                account_id: assetAccountId,
                depreciation_method: null,
                useful_life_years: null,
                salvage_value: 0,
                asset_type_id: null,
                brought_into_use_date: assetDate,
                business_use_percent: 100,
                small_item: false,
                lessor_residual_value: null,
                disposed_date: null,
                disposal_proceeds: null,
                notes: `Auto-created from RAIRO import on ${
                  new Date().toISOString().split('T')[0]
                }`,
              };

              if (fundingMethod === 'cash' && paidFromAccountId) {
                assetPayload.paid_from_account_id = paidFromAccountId;
              }
              if (
                fundingMethod === 'liability' &&
                financedLiabilityAccountId
              ) {
                assetPayload.financed_liability_account_id =
                  financedLiabilityAccountId;
              }

              const assetResponse = await fetch(
                `${API_BASE_URL}/assets`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                  },
                  body: JSON.stringify(assetPayload),
                }
              );

              const newAssetData = await assetResponse
                .json()
                .catch(() => ({}));

              if (!assetResponse.ok) {
                console.error('Error creating asset:', newAssetData);
                return {
                  success: false,
                  error:
                    newAssetData.error ||
                    newAssetData.detail ||
                    `HTTP ${assetResponse.status}`,
                  transaction,
                };
              }

              console.log(
                `Successfully created asset: ${newAssetData.name} (ID: ${newAssetData.id}) linked to account ID ${assetAccountId}`
              );
              assetTransactionMap.set(transaction._tempId!, {
                assetId: newAssetData.id,
                accountId: assetAccountId!,
              });

              return {
                success: true,
                assetId: newAssetData.id,
                transaction,
              };
            } catch (assetError: any) {
              console.error(
                `Error creating asset for transaction "${assetName}":`,
                assetError
              );
              return {
                success: false,
                error: assetError.message || String(assetError),
                transaction,
              };
            }
          })(txWithAmt, choice)
        );
      }

      let assetResults: PromiseSettledResult<AssetCreationResult>[] = [];
      if (assetCreationPromises.length > 0) {
        assetResults = await Promise.allSettled(assetCreationPromises);

        assetResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              console.log(
                `Asset for transaction ${index} created successfully (Asset ID: ${result.value.assetId}).`
              );
            } else {
              console.error(
                `Failed to create asset for transaction ${index}: ${result.value.error}`,
                result.value.transaction
              );
            }
          } else {
            console.error(
              `Promise failed for asset creation (index ${index}):`,
              result.reason
            );
          }
        });
      }

      const successfulAssets = assetResults.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;

      const nonAssetTransactions = toSubmitFiltered.filter(
        tx => tx.type !== 'asset'
      );

      if (nonAssetTransactions.length === 0) {
        sendProgress('staging', 'done');
        sendProgress('preview', 'done');
        sendProgress('mapping', 'done');
        sendProgress('posting', 'running');

        if (successfulAssets > 0) {
          addAssistantMessage(
            `Import complete. ${successfulAssets} asset(s) were automatically created. You can view and edit them in the Accounting → Assets tab.`
          );
        }

        try {
          const salesToSubmit = [...pendingSalesRef.current];
          if (salesToSubmit.length) {
            let ok = 0;
            for (const s of salesToSubmit) {
              try {
                await submitSale(s);
                ok++;
                addAssistantMessage(
                  successBubble('✅ Sale submitted', [
                    `${s.description} — ${fmt(
                      Number(s.amount || 0)
                    )} (${s.customer_name})`,
                  ])
                );
              } catch (e: any) {
                addAssistantMessage(
                  `Failed sale for "${s.customer_name}" (${fmt(
                    Number(s.amount || 0)
                  )}): ${e?.message || e}`
                );
              }
            }
            addAssistantMessage(
              `Sales posting complete: ${ok}/${salesToSubmit.length} succeeded.`
            );
          }
        } finally {
          pendingSalesRef.current = [];
          setPendingSales([]);
          sendProgress('posting', 'done');
          setImportBusy(false);
        }

        return;
      }

      // STAGING
      sendProgress('staging', 'running');

      const rows = nonAssetTransactions.map(tx => ({
        sourceUid: sourceUidOf(tx),
        date: tx.date || new Date().toISOString().slice(0, 10),
        description: tx.description || 'Imported',
        amount: tx._amt,
      }));

      const staged = await stageSelected(
        API_BASE_URL_REAL,
        authHeaders,
        rows
      );
      sendProgress('staging', 'done');
      addAssistantMessage(
        `Stage complete (batch ${staged.batchId}). Inserted: ${staged.inserted}, duplicates skipped: ${staged.duplicates}.`
      );

      // PREVIEW
      sendProgress('preview', 'running');
      const preview = await loadPreview(
        API_BASE_URL_REAL,
        authHeaders,
        staged.batchId
      );
      sendProgress('preview', 'done');

      // MAPPING
      sendProgress('mapping', 'running');

      const validAccountIds = new Set(accounts.map(a => Number(a.id)));

      const normalizeValidId = (
        id: number | string | null | undefined
      ): number | null => {
        if (id == null) return null;
        const n = Number(id);
        return Number.isFinite(n) && validAccountIds.has(n) ? n : null;
      };

      const pickCashOrBank = (): number | null => {
        const toLower = (s?: string) => (s || '').toLowerCase();

        const findBank = () =>
          accounts.find(
            a =>
              toLower(a.type) === 'asset' &&
              /bank|cheque|current/.test(toLower(a.name))
          );

        const findCash = () =>
          accounts.find(
            a =>
              toLower(a.type) === 'asset' &&
              /cash/.test(toLower(a.name))
          );

        let picked: number | null = null;

        if (forceCash) {
          picked = findCash()
            ? Number(findCash()!.id)
            : findBank()
            ? Number(findBank()!.id)
            : null;
        } else {
          picked = findBank()
            ? Number(findBank()!.id)
            : findCash()
            ? Number(findCash()!.id)
            : null;
        }

        return normalizeValidId(picked);
      };

      const cashOrBankRaw = pickCashOrBank();

      let patchedCount = 0;
      const unmappedRows: Array<{
        date: string;
        description: string;
        reason: string;
      }> = [];

      for (const p of preview.items) {
        const original = nonAssetTransactions.find(
          t => sourceUidOf(t) === p.sourceUid
        );
        if (!original) continue;

        const chosenId = normalizeValidId(
          original.account_id ? Number(original.account_id) : null
        );
        const cashBankId = normalizeValidId(cashOrBankRaw);

        const ttype = (original.type || '').toLowerCase();
        let debitId: number | null = null;
        let creditId: number | null = null;

        if (ttype === 'income') {
          debitId = cashBankId;
          creditId = chosenId;
        } else if (ttype === 'expense') {
          debitId = chosenId;
          creditId = cashBankId;
        } else if (ttype === 'debt') {
          debitId = cashBankId;
          creditId = chosenId;
        } else {
          debitId = cashBankId;
          creditId = chosenId;
        }

        if (!debitId || !creditId) {
          unmappedRows.push({
            date: original.date || '',
            description: original.description || 'Imported',
            reason:
              !debitId && !creditId
                ? 'No valid debit & credit accounts'
                : !debitId
                ? 'No valid debit account'
                : 'No valid credit account',
          });
          continue;
        }

        await patchRowMapping(
          API_BASE_URL_REAL,
          authHeaders,
          p.rowId,
          debitId,
          creditId
        );
        patchedCount++;
      }

      if (unmappedRows.length) {
        sendProgress('mapping', 'error');
        setImportBusy(false);

        addAssistantMessage(
          <div className="p-3 rounded-2xl bg-red-100 text-red-900 border border-red-200 text-sm">
            <div className="font-semibold mb-1">
              Some rows need attention
            </div>
            <div className="mb-1">
              {unmappedRows.length} row
              {unmappedRows.length > 1 ? 's' : ''} couldn’t be mapped to your
              accounts. Pick a valid <em>Account</em> in the table (and make
              sure you have a Bank/Cash account).
            </div>
            <ul className="list-disc ml-5">
              {unmappedRows.slice(0, 5).map((r, i) => (
                <li key={i}>
                  {r.date} — {r.description}{' '}
                  <span className="italic">({r.reason})</span>
                </li>
              ))}
            </ul>
            {unmappedRows.length > 5 && (
              <div className="mt-1">
                …and {unmappedRows.length - 5} more.
              </div>
            )}
          </div>
        );

        return;
      }

      addAssistantMessage(
        `Applied ${patchedCount} account mapping override(s).`
      );
      sendProgress('mapping', 'done');

      // POSTING — commit journal batch
      sendProgress('posting', 'running');

      const resultCommit = await commitBatch(
        API_BASE_URL_REAL,
        authHeaders,
        staged.batchId
      );

      const prettyLines = nonAssetTransactions.map(t => {
        const amt = Number(t.amount || t._amt || 0);
        const d = t.date || new Date().toISOString().slice(0, 10);
        if (t.type === 'expense')
          return `Paid ${t.description} — ${fmt(amt)} on ${d}`;
        if (t.type === 'income')
          return `Received ${t.description} — ${fmt(amt)} on ${d}`;
        if (t.type === 'debt')
          return `Debt ${t.description} — ${fmt(amt)} on ${d}`;
        if (t.type === 'asset')
          return `Asset ${t.description} — ${fmt(amt)} on ${d}`;
        return `${t.type} ${t.description} — ${fmt(amt)} on ${d}`;
      });

      addAssistantMessage(
        successBubble('✅ Transactions recorded', prettyLines)
      );

      addAssistantMessage(
        <div className="p-3 rounded-2xl bg-green-100 text-green-900 border border-green-200">
          <div className="font-semibold mb-1">Journal posting complete</div>
          <div>
            {resultCommit.posted} posted, {resultCommit.skipped} skipped.
          </div>
          <div className="mt-2 text-sm">
            To see financial statements, go to the{' '}
            <Link
              to="/financials"
              className="underline font-medium text-green-800"
            >
              Financials
            </Link>{' '}
            tab.
          </div>
        </div>
      );

      if (successfulAssets > 0) {
        addAssistantMessage(
          `Also created ${successfulAssets} asset(s). You can review them under Accounting → Assets.`
        );
      }

      try {
        const salesToSubmit = [...pendingSalesRef.current];
        if (salesToSubmit.length) {
          let ok = 0;
          for (const s of salesToSubmit) {
            try {
              await submitSale(s);
              ok++;
              addAssistantMessage(
                successBubble('✅ Sale submitted', [
                  `${s.description} — ${fmt(
                    Number(s.amount || 0)
                  )} (${s.customer_name})`,
                ])
              );
            } catch (e: any) {
              addAssistantMessage(
                `Failed sale for "${s.customer_name}" (${fmt(
                  Number(s.amount || 0)
                )}): ${e?.message || e}`
              );
            }
          }
          addAssistantMessage(
            `Sales posting complete: ${ok}/${salesToSubmit.length} succeeded.`
          );
        }
      } finally {
        pendingSalesRef.current = [];
        setPendingSales([]);
        sendProgress('posting', 'done');
      }
    } catch (e: any) {
      console.error('[IMPORT] Import failed:', e);

      let raw = e?.message || '';
      try {
        const parsed = JSON.parse(raw);
        raw = parsed.detail || parsed.error || raw;
      } catch {
        // keep raw
      }
      const looksLikeZeroAmount =
        e?.code === '23514' ||
        /check constraint/i.test(raw) ||
        /journal_lines_check1/i.test(raw) ||
        /0\.00/.test(raw);

      if (looksLikeZeroAmount) {
        addAssistantMessage(
          <div className="p-3 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 text-sm">
            <div className="font-semibold mb-1">
              Import failed: zero amounts detected
            </div>
            <div>
              One or more selected transactions have an amount of 0. Please
              edit the amount or uncheck “Import?” and try again.
            </div>
          </div>
        );
      } else {
        const msg = raw || String(e);
        addAssistantMessage(
          <div className="p-3 rounded-2xl bg-red-100 text-red-900 border border-red-200">
            <div className="font-semibold mb-1">Import failed</div>
            <div className="text-sm">{msg}</div>
          </div>
        );
      }

      sendProgress('posting', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleUnifiedSend = () => {
    if (file) {
      if (isExcelFile(file)) {
        handleExcelUpload();
      } else {
        handleFileUpload();
      }
    } else if (typedDescription.trim()) {
      if (typedDescription.startsWith('/audio')) {
        addAssistantMessage(
          'Please use the microphone icon to record audio, then click play to process.'
        );
        setTypedDescription('');
      } else if (typedDescription.startsWith('/upload')) {
        addAssistantMessage(
          'Please use the paperclip icon to select a file, then click Send.'
        );
        setTypedDescription('');
      } else if (typedDescription.startsWith('/text')) {
        const textToProcess = typedDescription
          .substring('/text'.length)
          .trim();
        if (textToProcess) {
          setTypedDescription(textToProcess);
          handleTypedDescriptionSubmit();
        } else {
          addAssistantMessage(
            "Please provide a description after '/text'."
          );
          setTypedDescription('');
        }
      } else {
        handleTypedDescriptionSubmit();
      }
    } else {
      addAssistantMessage(
        'Please type a message or select a file to proceed.'
      );
    }
  };

  return (
    <>
      {/* Chat Messages Display Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[70%] p-3 rounded-2xl shadow-md ${
                msg.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {typeof msg.content === 'string'
                ? msg.content
                : msg.content}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chat Input Area */}
      <div className="p-4 bg-white border-t shadow flex items-center space-x-2">
        <label htmlFor="file-upload-input" className="cursor-pointer">
          {/* Hidden file input (PDF + Excel + images) */}
          <Input
            ref={fileInputRef}
            id="file-upload-input"
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.bmp,.webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
          />
        </label>

        {/* Paperclip button that triggers the hidden input */}
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          variant="ghost"
          className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Attach File"
        >
          <Paperclip size={20} className="text-gray-600" />
        </Button>

        {isRecording ? (
          <Button
            onClick={stopRecording}
            variant="ghost"
            className="rounded-full p-2 text-red-500 hover:bg-red-100 animate-pulse"
            aria-label="Stop Recording"
          >
            <StopCircle size={20} />
          </Button>
        ) : (
          <Button
            onClick={startRecording}
            variant="ghost"
            className="rounded-full p-2 text-purple-600 hover:bg-purple-100"
            aria-label="Start Recording"
          >
            <Mic size={20} />
          </Button>
        )}

        <Input
          type="text"
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type a transaction description or command (/audio, /text)..."
          value={typedDescription}
          onChange={e => setTypedDescription(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (typedDescription.trim() || file)) {
              handleUnifiedSend();
            }
          }}
        />

        <Button
          onClick={handleUnifiedSend}
          disabled={
            !typedDescription.trim() && !file && !isRecording && !audioBlob
          }
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"
          aria-label="Send Message"
        >
          <Send size={20} />
        </Button>
      </div>

      {/* Asset funding dialog */}
      <Dialog
        open={assetFundingDialog.open}
        onOpenChange={open => {
          if (!open) resolveAssetFunding(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asset funding details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Tell RAIRO how this asset was acquired so the correct journal
              can be posted.
            </p>
          </DialogHeader>

          {assetFundingDialog.tx && (
            <div className="space-y-4">
              <div className="border rounded-md p-3 text-sm bg-muted/40">
                <div className="font-medium">
                  {assetFundingDialog.tx.description || 'Imported asset'}
                </div>
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Date: {assetFundingDialog.tx.date}</span>
                  <span>
                    Amount:{' '}
                    {fmt(
                      Number(
                        assetFundingDialog.tx._amt ??
                          assetFundingDialog.tx.amount ??
                          0
                      )
                    )}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Category:{' '}
                  {assetFundingDialog.tx.category || 'Fixed Assets'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="create-asset-toggle"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={assetFundingForm.create}
                  onChange={e =>
                    setAssetFundingForm(prev => ({
                      ...prev,
                      create: e.target.checked,
                    }))
                  }
                />
                <Label
                  htmlFor="create-asset-toggle"
                  className="cursor-pointer"
                >
                  Create fixed asset record for this transaction
                </Label>
              </div>

              {assetFundingForm.create && (
                <>
                  <div className="space-y-1">
                    <Label>How was it acquired?</Label>
                    <Select
                      value={assetFundingForm.fundingMethod}
                      onValueChange={(value: FundingMethod) =>
                        setAssetFundingForm(prev => ({
                          ...prev,
                          fundingMethod: value,
                          bankAccountId:
                            value === 'cash' ? prev.bankAccountId : '',
                          liabilityAccountId:
                            value === 'liability'
                              ? prev.liabilityAccountId
                              : '',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select funding method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">
                          Cash / Bank (Dr Asset, Cr Bank)
                        </SelectItem>
                        <SelectItem value="liability">
                          Liability / HP / Loan (Dr Asset, Cr Liability)
                        </SelectItem>
                        <SelectItem value="none">
                          No funding journal (I’ll post later)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {assetFundingForm.fundingMethod === 'cash' && (
                    <div className="space-y-1">
                      <Label>Bank / Cash account</Label>
                      <Select
                        value={assetFundingForm.bankAccountId}
                        onValueChange={value =>
                          setAssetFundingForm(prev => ({
                            ...prev,
                            bankAccountId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank / cash account" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map(acc => (
                            <SelectItem
                              key={acc.id}
                              value={String(acc.id)}
                            >
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!bankAccounts.length && (
                        <p className="text-xs text-amber-700 mt-1">
                          No bank/cash accounts found. You can still proceed
                          without posting a funding journal.
                        </p>
                      )}
                    </div>
                  )}

                  {assetFundingForm.fundingMethod === 'liability' && (
                    <div className="space-y-1">
                      <Label>Liability account</Label>
                      <Select
                        value={assetFundingForm.liabilityAccountId}
                        onValueChange={value =>
                          setAssetFundingForm(prev => ({
                            ...prev,
                            liabilityAccountId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select liability account" />
                        </SelectTrigger>
                        <SelectContent>
                          {liabilityAccounts.map(acc => (
                            <SelectItem
                              key={acc.id}
                              value={String(acc.id)}
                            >
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!liabilityAccounts.length && (
                        <p className="text-xs text-amber-700 mt-1">
                          No liability accounts found. You can still proceed
                          without posting a funding journal.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => resolveAssetFunding(null)}
                >
                  Skip this asset
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      resolveAssetFunding({
                        create: false,
                        fundingMethod: 'none',
                        bankAccountId: null,
                        liabilityAccountId: null,
                      })
                    }
                  >
                    Don’t create asset
                  </Button>
                  <Button
                    onClick={() => {
                      if (assetFundingForm.create) {
                        if (
                          assetFundingForm.fundingMethod === 'cash' &&
                          !assetFundingForm.bankAccountId &&
                          bankAccounts.length
                        ) {
                          alert('Please select a bank/cash account.');
                          return;
                        }
                        if (
                          assetFundingForm.fundingMethod === 'liability' &&
                          !assetFundingForm.liabilityAccountId &&
                          liabilityAccounts.length
                        ) {
                          alert('Please select a liability account.');
                          return;
                        }
                      }

                      resolveAssetFunding({
                        create: assetFundingForm.create,
                        fundingMethod: assetFundingForm.fundingMethod,
                        bankAccountId: assetFundingForm.bankAccountId
                          ? Number(assetFundingForm.bankAccountId)
                          : null,
                        liabilityAccountId:
                          assetFundingForm.liabilityAccountId
                            ? Number(
                                assetFundingForm.liabilityAccountId
                              )
                            : null,
                      });
                    }}
                  >
                    Save & continue
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Evidence uploader modal */}
      <EvidencePrompt
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        token={token}
        apiBaseUrl={API_BASE_URL}
        defaultNotes={evidenceNotes}
        onUploaded={ok => {
          if (ok) {
            addAssistantMessage(
              'Evidence uploaded ✅ You can find it in Documents.'
            );
          } else {
            addAssistantMessage(
              'Evidence upload was cancelled or failed.'
            );
          }
        }}
      />
    </>
  );
};


export default function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header title="Import Financials (Chat Mode)" />
      <ChatInterface />
    </div>
  );
}