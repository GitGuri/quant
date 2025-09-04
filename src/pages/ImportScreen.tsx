// ImportScreen.tsx
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
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


declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

// ------------ Types ------------
interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'debt';
  amount: number;
  description: string;
  date: string;
  category: string;
  account_id: string;
  account_name?: string;
  source: string;
  is_verified: boolean;
  file_url?: string;
  _tempId?: string;
  original_text?: string;
  confidenceScore?: number;
  // duplicate UX
  duplicateFlag?: boolean;
  duplicateMatches?: DupMatch[];
  includeInImport?: boolean;
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

async function stageSelected(API_BASE_URL: string, authHeaders: any, rows: Array<{sourceUid:string; date:string; description:string; amount:number;}>) {
  const res = await fetch(`${API_BASE_URL}/imports/bank/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ source: 'bank_csv', rows }),
  });
  if (!res.ok) throw new Error(await res.text());
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
  
  useEffect(() => { setConfirmClicked(false); }, [initialTransactions]);

const handleConfirmOnce = () => {
  if (confirmClicked || isBusy) return;   // ignore double taps
  setConfirmClicked(true);                // disable instantly
  onConfirm(transactions);                // parent still sets importBusy
};

  // sticky horizontal bar sync
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const bottomStripRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState<number>(0);
  useResizeObserver(scrollAreaRef, (w) => setContentWidth(w));

  useEffect(() => {
    setLocalForceCash(!!forceCash);
  }, [forceCash]);

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    const strip = bottomStripRef.current;
    if (!area || !strip) return;

    const onAreaScroll = () => { strip.scrollLeft = area.scrollLeft; };
    const onStripScroll = () => { area.scrollLeft = strip.scrollLeft; };

    area.addEventListener('scroll', onAreaScroll, { passive: true });
    strip.addEventListener('scroll', onStripScroll, { passive: true });

    return () => {
      area.removeEventListener('scroll', onAreaScroll);
      strip.removeEventListener('scroll', onStripScroll);
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
      <h4 className="text-lg font-semibold mb-3">Review & Edit Transactions:</h4>

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

      {/* Table with sticky bottom scrollbar */}
      <div className="relative">
        <div
          ref={scrollAreaRef}
          className="overflow-x-auto overflow-y-auto max-h-[400px] pb-6"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Import?</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount (R)</TableHead>
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
                        <Select value={tx.type} onValueChange={(value) => handleTransactionChange(rowId, 'type', value)}>
                          <SelectTrigger className="w-[100px]"><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="expense">Expense</SelectItem>
                            <SelectItem value="debt">Debt</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (tx.type)}
                    </TableCell>

                    {/* Amount */}
                    <TableCell>
                      {editingRowId === rowId ? (
                        <Input type="number" step="0.01" value={tx.amount} onChange={(e) => handleTransactionChange(rowId, 'amount', e.target.value)} className="w-[110px]" />
                      ) : (Number(tx.amount).toFixed(2))}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="max-w-[240px] truncate">
                      {editingRowId === rowId ? (
                        <Textarea value={tx.description} onChange={(e) => handleTransactionChange(rowId, 'description', e.target.value)} rows={2} className="w-[240px]" />
                      ) : (tx.description)}
                    </TableCell>

                    {/* Date */}
                    <TableCell>
                      {editingRowId === rowId ? (
                        <Input type="date" value={tx.date} onChange={(e) => handleTransactionChange(rowId, 'date', e.target.value)} className="w-[150px]" />
                      ) : (tx.date)}
                    </TableCell>

                    {/* Category */}
                    <TableCell>
                      {editingRowId === rowId ? (
                        <SearchableCategorySelect
                          value={tx.category}
                          onChange={(val) => handleTransactionChange(rowId, 'category', val)}
                          categories={categories}
                        />
                      ) : (tx.category)}
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      {editingRowId === rowId ? (
                        <SearchableAccountSelect
                          value={tx.account_id}
                          onChange={(val) => handleTransactionChange(rowId, 'account_id', val)}
                          accounts={accounts}
                        />
                      ) : (accounts.find(acc => String(acc.id) === String(tx.account_id))?.name || 'N/A')}
                    </TableCell>

                    {/* Confidence */}
                    <TableCell>
                      {tx.confidenceScore !== undefined ? (
                        <Badge variant={tx.confidenceScore >= 90 ? 'success' : tx.confidenceScore >= 60 ? 'default' : 'destructive'}>
                          {Math.round(tx.confidenceScore)}%
                        </Badge>
                      ) : 'N/A'}
                    </TableCell>

                    {/* Duplicate details */}
                    <TableCell>
                      {dupCount > 0 ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Badge variant="destructive" className="cursor-pointer">View ({dupCount})</Badge>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Potential duplicates ({dupCount})</DialogTitle>
                              <DialogDescription>These existing transactions look similar. Uncheck “Import?” to skip.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 mt-2">
                              {tx.duplicateMatches!.map((m, i) => (
                                <div key={i} className="border rounded p-2 text-sm">
                                  <div><strong>Amount:</strong> R {m.amount.toFixed(2)}</div>
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
                          <Button variant="outline" size="sm" onClick={() => setEditingRowId(null)} className="flex items-center" disabled={isBusy}>
                            <XCircle size={16} className="mr-1" /> Cancel
                          </Button>
                          <Button size="sm" onClick={() => setEditingRowId(null)} className="flex items-center" disabled={isBusy}>
                            <CheckCircle size={16} className="mr-1" /> Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditingRowId(rowId)} className="flex items-center" disabled={isBusy}>
                            <Edit3 size={16} className="mr-1" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleTransactionDelete(rowId)} className="flex items-center" disabled={isBusy}>
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

        {/* Always-visible horizontal scrollbar (sticky) */}
        <div
          ref={bottomStripRef}
          className="sticky bottom-0 left-0 right-0 h-5 overflow-x-auto overflow-y-hidden bg-white/90 backdrop-blur border-t border-gray-200"
          style={{ scrollbarGutter: 'stable both-edges' }}
          aria-label="Horizontal scroll"
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
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
  disabled={isCancelled || isBusy || confirmClicked}
  aria-busy={isBusy}
>
  <CheckCircle size={18} className="mr-2" />
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
  const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';
  const [forceCash, setForceCash] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; content: string | JSX.Element }>>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingTxs, setExistingTxs] = useState<ExistingTx[]>([]);
  const [typedDescription, setTypedDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recognitionRef = useRef<any>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // NEW: prevent double-submit on import
  const [importBusy, setImportBusy] = useState(false);

  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const getAuthHeaders = useCallback(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const categories = [
    'Groceries','Rent','Utilities','Transport','Food','Salary','Deposit','Loan','Debt Payment','Entertainment',
    'Shopping','Healthcare','Education','Travel','Investments','Insurance','Bills','Dining Out','Subscriptions','Other',
    'Sales','Interest Income','Cost of Goods Sold','Accounts Payable','Rent Expense','Utilities Expenses','Car Loans',
    'Sales Revenue','General Expense','Fees','Purchases','Refund','Fuel','Salaries and wages','Projects Expenses',
    'Accounting fees','Repairs & Maintenance','Water and electricity','Bank charges','Insurance','Loan interest',
    'Computer internet and Telephone','Website hosting fees','Credit Facility'
  ];

  // auto-scroll
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Load accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!isAuthenticated || !token) {
        setAccounts([]);
        addAssistantMessage('Please log in to load accounts and import transactions.');
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/accounts`, { headers: getAuthHeaders() });
        const data: Account[] = await response.json();
        setAccounts(Array.isArray(data) ? data : []);
        addAssistantMessage('Accounts loaded successfully. You can now import transactions.');
      } catch (error: any) {
        console.error('Failed to fetch accounts:', error);
        setAccounts([]);
        addAssistantMessage(`Failed to load accounts: ${error.message || 'Network error'}. Please ensure your backend is running and you are logged in.`);
      }
    };
    fetchAccounts();
  }, [isAuthenticated, token, getAuthHeaders]);



//message stuff 





  
  // Load recent existing transactions (for dup check)
  useEffect(() => {
    const fetchExisting = async () => {
      if (!isAuthenticated || !token) { setExistingTxs([]); return; }
      try {
        const since = new Date(); since.setDate(since.getDate() - 180);
        const params = new URLSearchParams({ since: since.toISOString().slice(0,10), limit: '500' });
        const res = await fetch(`${API_BASE_URL}/transactions?${params.toString()}`, {
          headers: { 'Content-Type':'application/json', ...getAuthHeaders() },
        });
        if (res.status === 401) { setExistingTxs([]); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExistingTxs(Array.isArray(data) ? data.map((t:any) => ({
          id: t.id, amount: Number(t.amount),
          date: (t.date || '').slice(0,10),
          description: t.description || '', type: t.type, account_id: t.account_id,
        })) : []);
      } catch (e) {
        console.error('Failed to fetch existing transactions for dup-check:', e);
        setExistingTxs([]);
      }
    };
    fetchExisting();
  }, [isAuthenticated, token, getAuthHeaders]);

  // chat helpers
  const addAssistantMessage = (content: string | JSX.Element) =>
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender: 'assistant', content }]);
  const addUserMessage = (content: string) =>
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender: 'user', content }]);


  
  // Helpers for files
  const isExcelFile = (f: File | null) => {
    if (!f) return false;
    const name = f.name.toLowerCase();
    const type = (f.type || '').toLowerCase();
    return (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      type.includes('spreadsheet') ||
      type === 'application/vnd.ms-excel' ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  };

  // File change (PDF & Excel)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (!selectedFile) { addAssistantMessage('No file selected.'); return; }

    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    const isXl = isExcelFile(selectedFile);

    if (!isPdf && !isXl) {
      addAssistantMessage('Only PDF or Excel files are supported.');
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    setTypedDescription(`File: ${selectedFile.name}`);
    e.target.value = '';
  };

  // PDF upload
  const handleFileUpload = async () => {
    if (!file) { addAssistantMessage('No file selected for upload.'); return; }
    if (!isAuthenticated || !token) { addAssistantMessage('Authentication required to upload files.'); return; }

    if (isExcelFile(file)) {
      await handleExcelUpload();
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      addAssistantMessage('Only PDF files are supported for processing.');
      setFile(null); setTypedDescription(''); return;
    }

    addUserMessage(`Initiating PDF upload: ${file.name}...`);
    addAssistantMessage(<TableLoading message="Extracting transactions from PDF…" />);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${RAIRO_API_BASE_URL}/process-pdf`, { method: 'POST', body: formData });
      const result = await response.json();

      if (response.ok) {
        addAssistantMessage('PDF processed successfully! Building preview…');

        const transformed: Transaction[] = (result.transactions || []).map((tx: any) => {
          const transactionType = tx.Type?.toLowerCase() || 'expense';

          let transactionCategory = tx.Destination_of_funds || 'Uncategorized';
          if (transactionType === 'income' && ['income','general income'].includes((transactionCategory || '').toLowerCase())) {
            transactionCategory = 'Sales Revenue';
          }

          let transactionDate: string;
          try {
            transactionDate = tx.Date
              ? new Date(tx.Date.split('/').reverse().join('-')).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
          } catch { transactionDate = new Date().toISOString().split('T')[0]; }

          const { accountId, confidence } = suggestAccountForUpload(
            { type: transactionType, category: transactionCategory, description: tx.Description },
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
            original_text: tx.Original_Text || (tx.Description || 'Imported Transaction'),
            source: 'pdf-upload',
            is_verified: true,
            confidenceScore: confidence,
          };
        });

        const flagged = markDuplicates(transformed, existingTxs);

        addAssistantMessage(
          <EditableTransactionTable
            transactions={flagged}
            accounts={accounts}
            categories={categories}
            onConfirm={handleConfirmProcessedTransaction}
            onCancel={() => addAssistantMessage('Transaction review cancelled.')}
            forceCash={forceCash}
            onToggleForceCash={setForceCash}
            isBusy={importBusy}
          />
        );
      } else {
        addAssistantMessage(`Error processing file: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Network error during file upload:', error);
      addAssistantMessage(`Network error during file upload: ${error.message || 'API is unavailable.'}`);
    } finally {
      setFile(null);
      setTypedDescription('');
    }
  };

  const handleExcelUpload = async () => {
    if (!file) { addAssistantMessage('No file selected for upload.'); return; }
    if (!isAuthenticated || !token) { addAssistantMessage('Authentication required to upload files.'); return; }
    if (!isExcelFile(file)) { addAssistantMessage('Please select a valid Excel file (.xlsx/.xls).'); return; }

    addUserMessage(`Initiating Excel import: ${file.name}...`);
    addAssistantMessage(<TableLoading message="Parsing Excel and preparing preview…" />);

    try {
      const XLSX = await import('xlsx');

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        addAssistantMessage('No rows found in the first sheet.');
        return;
      }

      const prepared: Transaction[] = [];
      const salesQueue: Array<{
        customer_name: string; office?: string | null; date: string; description: string; amount: number;
      }> = [];

      for (const row of rows) {
        const rowNorm: Record<string, any> = {};
        Object.keys(row).forEach(k => { rowNorm[k.trim().toLowerCase()] = row[k]; });

        const netRaw   = rowNorm['net'];
        const client   = String(rowNorm['client'] || '').trim();
        const office   = String(rowNorm['office'] || '').trim();

        const num = (v: any) =>
          typeof v === 'number' ? v :
          typeof v === 'string' ? (parseFloat(v.replace(/[\s,]+/g, '')) || 0) :
          0;

        const revenue = num(netRaw);
        if (!revenue) continue;

        const date = new Date().toISOString().slice(0,10);
        const tag = [client && `Client: ${client}`, office && `Office: ${office}`].filter(Boolean).join(' | ');
        const baseDesc = 'Agent Import' + (tag ? ` [${tag}]` : '');

        const customer_name = client || 'Walk-in';
        salesQueue.push({
          customer_name,
          office: office || null,
          date,
          description: baseDesc || `Sale for ${customer_name}`,
          amount: Math.abs(revenue),
        });

        prepared.push({
          _tempId: crypto.randomUUID(),
          type: 'income',
          amount: Math.abs(revenue),
          description: (baseDesc || `Sale for ${customer_name}`) + ' [Sales Preview]',
          date,
          category: 'Sales Revenue',
          account_id: '',
          original_text: JSON.stringify(row),
          source: 'sales-preview',
          is_verified: true,
          confidenceScore: 100,
          includeInImport: true,
        });
      }

      if (!prepared.length && !salesQueue.length) {
        addAssistantMessage('No importable transactions were derived from the Excel file.');
        return;
      }

      const salesTotal = salesQueue.reduce((sum, s) => sum + Number(s.amount || 0), 0);
      addAssistantMessage(
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-sm">
          <div className="font-semibold">Sales queued for posting:</div>
          <div>{salesQueue.length} sale(s), total R {salesTotal.toFixed(2)} — will be submitted to <code>/api/sales</code> after you click <em>Confirm &amp; Submit Selected</em>.</div>
        </div>
      );

      const flagged = markDuplicates(prepared, existingTxs);

      addAssistantMessage(
        <EditableTransactionTable
          transactions={flagged}
          accounts={accounts}
          categories={categories}
          onConfirm={handleConfirmProcessedTransaction}
          onCancel={() => addAssistantMessage('Transaction review cancelled.')}
          forceCash={forceCash}
          onToggleForceCash={setForceCash}
          isBusy={importBusy}
        />
      );
    } catch (err: any) {
      console.error('Excel parse error:', err);
      addAssistantMessage(`Failed to process Excel file: ${err.message || 'Unknown error'}`);
    } finally {
      setFile(null);
      setTypedDescription('');
    }
  };

  // Text input
  const handleTypedDescriptionSubmit = async () => {
    if (!typedDescription.trim()) { addAssistantMessage('Please enter a description.'); return; }
    if (!isAuthenticated || !token) { addAssistantMessage('Authentication required to process text.'); return; }

    const userMessageContent = typedDescription;
    addUserMessage(userMessageContent);
    addAssistantMessage(<TableLoading message="Analyzing your description…" />);
    setTypedDescription('');

    try {
      const response = await fetch(`${RAIRO_API_BASE_URL}/process-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMessageContent }),
      });
      const result = await response.json();

      if (response.ok) {
        addAssistantMessage('Description analyzed! Building preview…');

        const transformed: Transaction[] = (result.transactions || []).map((tx: any) => {
          const transactionType = tx.Type?.toLowerCase() || 'expense';

          let transactionCategory = tx.Destination_of_funds || tx.Customer_name || 'N/A';
          if (transactionType === 'income' && ['income','general income'].includes((transactionCategory || '').toLowerCase())) {
            transactionCategory = 'Sales Revenue';
          }

          let inferredCategory = transactionCategory;
          const lowerDescription = (tx.Description || '').toLowerCase();
          if (!inferredCategory || inferredCategory.toLowerCase() === 'n/a') {
            if (lowerDescription.includes('rent') || lowerDescription.includes('rental')) inferredCategory = 'Rent Expense';
            else if (lowerDescription.includes('salary') || lowerDescription.includes('wages') || lowerDescription.includes('payroll')) inferredCategory = 'Salaries and wages';
            else if (lowerDescription.includes('fuel') || lowerDescription.includes('petrol')) inferredCategory = 'Fuel';
            else if (lowerDescription.includes('utilities') || lowerDescription.includes('water') || lowerDescription.includes('electricity')) inferredCategory = 'Utilities Expenses';
            else if (lowerDescription.includes('groceries') || lowerDescription.includes('shopping') || lowerDescription.includes('food')) inferredCategory = 'Groceries';
            else if (lowerDescription.includes('sale') || lowerDescription.includes('revenue') || lowerDescription.includes('money for services')) inferredCategory = 'Sales Revenue';
          }

          let transactionDate: string;
          try {
            transactionDate = tx.Date
              ? new Date(tx.Date.split('/').reverse().join('-')).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
          } catch { transactionDate = new Date().toISOString().split('T')[0]; }

          const { accountId, confidence } = suggestAccountForText(
            { type: transactionType, category: inferredCategory, description: tx.Description },
            accounts
          );

          return {
            _tempId: crypto.randomUUID(),
            type: transactionType as 'income' | 'expense' | 'debt',
            amount: tx.Amount ? parseFloat(tx.Amount) : 0,
            description: tx.Description || 'Imported Transaction',
            date: transactionDate,
            category: inferredCategory,
            account_id: accountId || '',
            original_text: userMessageContent,
            source: 'text-input',
            is_verified: true,
            confidenceScore: confidence,
          };
        });

        const flagged = markDuplicates(transformed, existingTxs);

        addAssistantMessage(
          <EditableTransactionTable
            transactions={flagged}
            accounts={accounts}
            categories={categories}
            onConfirm={handleConfirmProcessedTransaction}
            onCancel={() => addAssistantMessage('Transaction review cancelled.')}
            forceCash={forceCash}
            onToggleForceCash={setForceCash}
            isBusy={importBusy}
          />
        );
      } else {
        addAssistantMessage(`Error analyzing description: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Network error during text processing:', error);
      addAssistantMessage(`Network error during text processing: ${error.message || 'API is unavailable.'}`);
    }
  };

  // Voice (unchanged except minor UX)
  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { addAssistantMessage('Browser does not support speech recognition. Try Chrome.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => { setIsRecording(true); addUserMessage('Started voice input...'); };
    recognition.onresult = (event: any) => {
      const interimTranscript = Array.from(event.results).map((r: any) => r[0].transcript).join('');
      setTranscribedText(interimTranscript);
      setTypedDescription(interimTranscript);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event);
      setIsRecording(false);
      addAssistantMessage(`Speech recognition error: ${event.error}. Please try again.`);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      addUserMessage(`🛑 "${typedDescription}"`);
      addAssistantMessage('Recording stopped. Press send to process this text.');
    }
  };

  const uploadAudio = async () => {
    if (!audioBlob) { addAssistantMessage('No audio recorded to upload.'); return; }
    if (!isAuthenticated || !token) { addAssistantMessage('Authentication required to process audio.'); return; }

    addUserMessage('Processing recorded audio...');
    addAssistantMessage(<TableLoading message="Transcribing & analyzing your audio…" />);

    try {
      // Stub: replace with real STT when available
      const simulatedTranscribedText = 'I paid fifty dollars for groceries on July fifth, two thousand twenty-five. I also received 1200 salary on the same day.';
      const processTextResponse = await fetch(`${RAIRO_API_BASE_URL}/process-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: simulatedTranscribedText }),
      });
      const result = await processTextResponse.json();

      if (processTextResponse.ok) {
        if (!result.transactions || result.transactions.length === 0) {
          addAssistantMessage('I could not make sense of that, please try again with a clearer description.');
          return;
        }

        addAssistantMessage('Audio processed! Building preview…');

        const transformed: Transaction[] = (result.transactions || []).map((tx: any) => {
          const transactionType = tx.Type === 'income' ? 'income' : 'expense';
          let transactionCategory = tx.Destination_of_funds;
          if (transactionType === 'income' && ['income','general income'].includes((transactionCategory || '').toLowerCase())) {
            transactionCategory = 'Sales Revenue';
          }

          let transactionDate: string;
          try {
            transactionDate = tx.Date
              ? new Date(tx.Date.split('/').reverse().join('-')).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
          } catch { transactionDate = new Date().toISOString().split('T')[0]; }

          const { accountId, confidence } = suggestAccountForText(
            { type: transactionType, category: transactionCategory, description: tx.Description },
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
        });

        const flagged = markDuplicates(transformed, existingTxs);

        addAssistantMessage(
          <EditableTransactionTable
            transactions={flagged}
            accounts={accounts}
            categories={categories}
            onConfirm={handleConfirmProcessedTransaction}
            onCancel={() => addAssistantMessage('Transaction review cancelled.')}
            forceCash={forceCash}
            onToggleForceCash={setForceCash}
            isBusy={importBusy}
          />
        );
      } else {
        addAssistantMessage(`Error processing audio: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Network error during audio processing:', error);
      addAssistantMessage(`Network error during audio processing: ${error.message || 'API is unavailable.'}`);
    } finally {
      setAudioBlob(null);
      setAudioUrl(null);
      if (audioPlayerRef.current) (audioPlayerRef.current as any).src = '';
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    if (audioPlayerRef.current) (audioPlayerRef.current as any).src = '';
    addAssistantMessage('Audio cleared.');
  };

  // -------------- Save Selected --------------
  // PIPELINE: stage -> preview -> (PATCH) -> commit
  const handleConfirmProcessedTransaction = async (transactionsToSave: Transaction[]) => {
    const API_BASE_URL_REAL = 'https://quantnow-cu1v.onrender.com';
    const authHeaders = getAuthHeaders();

    if (importBusy) return;
    setImportBusy(true);

    // show the progress widget once
    addAssistantMessage(<ImportProgressBubble />);

    const toSubmit = (transactionsToSave || []).filter(t => t.includeInImport !== false);

    if (toSubmit.length === 0) {
      addAssistantMessage('Nothing selected to import.');
      setImportBusy(false);
      sendProgress('staging', 'done');
      sendProgress('preview', 'done');
      sendProgress('mapping', 'done');
      sendProgress('posting', 'done');
      return;
    }

    try {
      // STAGING
      sendProgress('staging', 'running');
      const rows = toSubmit.map(tx => ({
        sourceUid:   sourceUidOf(tx),
        date:        tx.date || new Date().toISOString().slice(0,10),
        description: tx.description || 'Imported',
        amount:      Number(tx.amount || 0),
      }));
      const staged = await stageSelected(API_BASE_URL_REAL, authHeaders, rows);
      sendProgress('staging', 'done');
      addAssistantMessage(`Stage complete (batch ${staged.batchId}). Inserted: ${staged.inserted}, duplicates skipped: ${staged.duplicates}.`);

      // PREVIEW
      sendProgress('preview', 'running');
      const preview = await loadPreview(API_BASE_URL_REAL, authHeaders, staged.batchId);
      sendProgress('preview', 'done');

      // MAPPING
      sendProgress('mapping', 'running');
      // pick cash/bank account (honor toggle)
      const pickCashOrBank = () => {
        const toLower = (s?: string) => (s || '').toLowerCase();

        const findBank = () =>
          accounts.find(a =>
            toLower(a.type) === 'asset' &&
            /bank|cheque|current/.test(toLower(a.name))
          );

        const findCash = () =>
          accounts.find(a =>
            toLower(a.type) === 'asset' &&
            /cash/.test(toLower(a.name))
          );

        if (forceCash) {
          const cash = findCash();
          if (cash) return Number(cash.id);
          const bank = findBank();
          return bank ? Number(bank.id) : null;
        } else {
          const bank = findBank();
          if (bank) return Number(bank.id);
          const cash = findCash();
          return cash ? Number(cash.id) : null;
        }
      };

      const cashOrBankId = pickCashOrBank();
      let patchedCount = 0;

      for (const p of preview.items) {
        const original = toSubmit.find(t => sourceUidOf(t) === p.sourceUid);
        if (!original) continue;

        const chosenId = Number(original.account_id || 0) || null;
        if (!chosenId) continue;

        let debitId: number | null = null;
        let creditId: number | null = null;

        const ttype = (original.type || '').toLowerCase();
        if (ttype === 'income') {
          debitId = cashOrBankId;
          creditId = chosenId;
        } else if (ttype === 'expense') {
          debitId = chosenId;
          creditId = cashOrBankId;
        } else if (ttype === 'debt') {
          debitId = cashOrBankId;
          creditId = chosenId;
        } else {
          debitId = cashOrBankId;
          creditId = chosenId;
        }

        await patchRowMapping(
          API_BASE_URL_REAL,
          authHeaders,
          p.rowId,
          debitId || undefined,
          creditId || undefined
        );
        patchedCount++;
      }

      addAssistantMessage(`Applied ${patchedCount} account mapping override(s).`);
      sendProgress('mapping', 'done');

      // POSTING
      sendProgress('posting', 'running');
      const result = await commitBatch(API_BASE_URL_REAL, authHeaders, staged.batchId);
      sendProgress('posting', 'done');

addAssistantMessage(
  <div className="p-3 rounded-2xl bg-green-100 text-green-900 border border-green-200">
    <div className="font-semibold mb-1">Journal posting complete</div>
    <div>{result.posted} posted, {result.skipped} skipped.</div>
    <div className="mt-2 text-sm">
      To see financial statements, go to the{' '}
      <Link to="/financials" className="underline font-medium text-green-800">
        Financials
      </Link>{' '}
      tab.
    </div>
  </div>
);

    } catch (e: any) {
      console.error('[IMPORT] Import failed:', e);
      const msg = e?.message || String(e);
      addAssistantMessage(
        <div className="p-3 rounded-2xl bg-red-100 text-red-900 border border-red-200">
          <div className="font-semibold mb-1">Import failed</div>
          <div className="text-sm">{msg}</div>
        </div>
      );
      // flip the appropriate stage to error if we can’t tell which; mark overall
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
        addAssistantMessage('Please use the microphone icon to record audio, then click play to process.');
        setTypedDescription('');
      } else if (typedDescription.startsWith('/upload')) {
        addAssistantMessage('Please use the paperclip icon to select a file, then click Send.');
        setTypedDescription('');
      } else if (typedDescription.startsWith('/text')) {
        const textToProcess = typedDescription.substring('/text'.length).trim();
        if (textToProcess) { setTypedDescription(textToProcess); handleTypedDescriptionSubmit(); }
        else { addAssistantMessage("Please provide a description after '/text'."); setTypedDescription(''); }
      } else {
        handleTypedDescriptionSubmit();
      }
    } else {
      addAssistantMessage('Please type a message or select a file to proceed.');
    }
  };

  return (
    <>
      {/* Chat Messages Display Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[70%] p-3 rounded-2xl shadow-md ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
              {typeof msg.content === 'string' ? msg.content : msg.content}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chat Input Area */}
      <div className="p-4 bg-white border-t shadow flex items-center space-x-2">
        <label htmlFor="file-upload-input" className="cursor-pointer">
          {/* Accept PDF + Excel */}
          <Input
            id="file-upload-input"
            type="file"
            className="sr-only"
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
          <Button asChild variant="ghost" className="rounded-full p-2 text-gray-600 hover:bg-gray-100" aria-label="Attach File">
            <span><Paperclip size={20} className="text-gray-600" /></span>
          </Button>
        </label>

        {isRecording ? (
          <Button onClick={stopRecording} variant="ghost" className="rounded-full p-2 text-red-500 hover:bg-red-100 animate-pulse" aria-label="Stop Recording">
            <StopCircle size={20} />
          </Button>
        ) : (
          <Button onClick={startRecording} variant="ghost" className="rounded-full p-2 text-purple-600 hover:bg-purple-100" aria-label="Start Recording">
            <Mic size={20} />
          </Button>
        )}

        <Input
          type="text"
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type a transaction description or command (/audio, /text)..."
          value={typedDescription}
          onChange={(e) => setTypedDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (typedDescription.trim() || file)) handleUnifiedSend(); }}
        />

        <Button
          onClick={handleUnifiedSend}
          disabled={(!typedDescription.trim() && !file && !isRecording && !audioBlob)}
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"
          aria-label="Send Message"
        >
          <Send size={20} />
        </Button>
      </div>
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
