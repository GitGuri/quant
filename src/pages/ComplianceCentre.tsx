import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ShieldCheck, FileText, Calculator, ReceiptText, CalendarClock } from 'lucide-react';

// -------------------- Config --------------------
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

type PresetKey = 'custom' | 'last-month' | 'quarter' | 'half' | 'year' | 'this-month';
type CompareMode = 'none';

type DocId =
  | 'vat'
  | 'emp201'
  | 'emp501'
  | 'letter-good-standing'
  | 'provisional-tax';

const DOCS: { id: DocId; label: string; icon: React.ComponentType<any>; blurb: string }[] = [
  { id: 'vat', label: 'VAT Report', icon: ReceiptText, blurb: 'Output vs Input VAT and net liability/refund.' },
  { id: 'emp201', label: 'EMP201 (Monthly PAYE/UIF/SDL)', icon: CalendarClock, blurb: 'Monthly payroll tax declaration totals.' },
  { id: 'emp501', label: 'EMP501 (Reconciliation)', icon: FileText, blurb: 'Mid/Year-end payroll tax reconciliation.' },
  { id: 'provisional-tax', label: 'Provisional Tax (IRP6)', icon: Calculator, blurb: 'Half-yearly prepayment based on estimates.' },
  { id: 'letter-good-standing', label: 'Letter of Good Standing', icon: ShieldCheck, blurb: 'Accountant`s compliance validity status.' },
];

// -------------------- Small utils --------------------
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const iso = (d: Date) => d.toISOString().split('T')[0];
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const startOfQuarter = (d: Date) => { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); };
const endOfQuarter = (d: Date) => { const s = startOfQuarter(d); return new Date(s.getFullYear(), s.getMonth() + 3, 0); };

const openBlobInNewTab = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const extractFilename = (contentDisposition: string | null, fallback: string) => {
  if (!contentDisposition) return fallback;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(contentDisposition);
  return decodeURIComponent(match?.[1] || match?.[2] || fallback);
};

// -------------------- Types for previews --------------------
interface VatPreview {
  results: {
    output_vat_1A: number;
    input_vat_1B: number;
    net_vat_1C: number;
    taxable_supplies_excl: number;
    zero_rated_supplies: number;
    exempt_supplies: number;
  };
}
interface Emp201Preview {
  period: { month: string };
  totals: { paye: number; uif: number; sdl: number; total: number };
}
interface Emp501Preview {
  period: { from: string; to: string };
  declared: { paye: number; uif: number; sdl: number; total: number };
  payments: { total: number };
  variance: number;
}
interface ProvisionalPreview {
  period: { from: string; to: string; label?: string };
  estimate: { taxableIncome: number; rate: number; taxDue: number; credits: number; netPayable: number };
}
interface GoodStandingPreview {
  status: 'valid' | 'expired' | 'pending';
  issuedOn?: string;
  validUntil?: string;
  reference?: string;
}

// -------------------- Component --------------------
export default function ComplianceCentre() {
  const { toast } = useToast();
  const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
  const { symbol, fmt } = useCurrency();

  const money = (n: number) => fmt(Number(n || 0));

  // Defaults: pick smart period per doc
  const [activeDoc, setActiveDoc] = useState<DocId>('vat');
  const [preset, setPreset] = useState<PresetKey>('last-month');
  const [fromDate, setFromDate] = useState<string>(() => {
    const today = new Date();
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    return iso(lastMonthStart);
  });
  const [toDate, setToDate] = useState<string>(() => {
    const today = new Date();
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return iso(lastMonthEnd);
  });

  // Lightweight previews
  const [vat, setVat] = useState<VatPreview | null>(null);
  const [emp201, setEmp201] = useState<Emp201Preview | null>(null);
  const [emp501, setEmp501] = useState<Emp501Preview | null>(null);
  const [prov, setProv] = useState<ProvisionalPreview | null>(null);
  const [good, setGood] = useState<GoodStandingPreview | null>(null);

  const [loading, setLoading] = useState(false);

  // ----- Preset handling
  const applyPreset = useCallback((p: PresetKey) => {
    const today = new Date();
    let f = fromDate, t = toDate;

    if (p === 'this-month') {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      f = iso(s); t = iso(e);
    } else if (p === 'last-month') {
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      const s = new Date(e.getFullYear(), e.getMonth(), 1);
      f = iso(s); t = iso(e);
    } else if (p === 'quarter') {
      const s = startOfQuarter(today);
      const e = endOfQuarter(today);
      f = iso(s); t = iso(e);
    } else if (p === 'half') {
      const e = startOfDay(today);
      const s = startOfDay(addMonths(today, -6));
      f = iso(s); t = iso(e);
    } else if (p === 'year') {
      const e = startOfDay(today);
      const s = startOfDay(addMonths(today, -12));
      f = iso(s); t = iso(e);
    }
    setPreset(p);
    setFromDate(f);
    setToDate(t);
  }, [fromDate, toDate]);

  // When doc changes, nudge a sensible preset
  useEffect(() => {
    if (activeDoc === 'vat' || activeDoc === 'emp201') {
      // Monthly docs -> last month by default
      setPreset('last-month');
      const today = new Date();
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      const s = new Date(e.getFullYear(), e.getMonth(), 1);
      setFromDate(iso(s));
      setToDate(iso(e));
    } else if (activeDoc === 'emp501' || activeDoc === 'provisional-tax') {
      // 6-month windows
      setPreset('half');
      const e = startOfDay(new Date());
      const s = startOfDay(addMonths(e, -6));
      setFromDate(iso(s));
      setToDate(iso(e));
    } else if (activeDoc === 'letter-good-standing') {
      // Not really a range doc, but keep the UI consistent
      setPreset('year');
      const e = startOfDay(new Date());
      const s = startOfDay(addMonths(e, -12));
      setFromDate(iso(s));
      setToDate(iso(e));
    }
  }, [activeDoc]);

  // ----- Preview fetchers
  const fetchPreview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

      if (activeDoc === 'vat') {
        const r = await fetch(`${API_BASE_URL}/reports/vat?from=${fromDate}&to=${toDate}`, { headers });
        setVat(r.ok ? await r.json() : null);
      }
      if (activeDoc === 'emp201') {
        const r = await fetch(`${API_BASE_URL}/compliance/emp201?month=${toDate.slice(0,7)}`, { headers });
        setEmp201(r.ok ? await r.json() : null);
      }
      if (activeDoc === 'emp501') {
        const r = await fetch(`${API_BASE_URL}/compliance/emp501?from=${fromDate}&to=${toDate}`, { headers });
        setEmp501(r.ok ? await r.json() : null);
      }
      if (activeDoc === 'provisional-tax') {
        const r = await fetch(`${API_BASE_URL}/compliance/provisional-tax?from=${fromDate}&to=${toDate}`, { headers });
        setProv(r.ok ? await r.json() : null);
      }
      if (activeDoc === 'letter-good-standing') {
        const r = await fetch(`${API_BASE_URL}/compliance/good-standing`, { headers });
        setGood(r.ok ? await r.json() : null);
      }
    } catch {
      // previews are optional
    } finally {
      setLoading(false);
    }
  }, [activeDoc, fromDate, toDate, token]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // ------ CSV builders for fallback ------
  const buildCsvFallback = useCallback(() => {
    const rows: (string | number)[][] = [];
    const push = (...r: (string | number)[]) => rows.push(r);
    const period = `${new Date(fromDate).toLocaleDateString('en-ZA')} — ${new Date(toDate).toLocaleDateString('en-ZA')}`;

    if (activeDoc === 'vat') {
      push(['VAT Report']); push(['Period', period]); push(['']);
      if (!vat) push(['No data']); else {
        push(['Output VAT (1A)', vat.results.output_vat_1A.toFixed(2)]);
        push(['Input VAT (1B)', vat.results.input_vat_1B.toFixed(2)]);
        push(['Net VAT (1C)', vat.results.net_vat_1C.toFixed(2)]);
        push(['']); push(['Supporting']);
        push(['Taxable supplies (excl.)', vat.results.taxable_supplies_excl.toFixed(2)]);
        push(['Zero-rated supplies', vat.results.zero_rated_supplies.toFixed(2)]);
        push(['Exempt supplies', vat.results.exempt_supplies.toFixed(2)]);
      }
    } else if (activeDoc === 'emp201') {
      push(['EMP201 (Monthly)']); push(['Month', toDate.slice(0,7)]); push(['']);
      if (!emp201) push(['No data']); else {
        push(['PAYE', emp201.totals.paye.toFixed(2)]);
        push(['UIF', emp201.totals.uif.toFixed(2)]);
        push(['SDL', emp201.totals.sdl.toFixed(2)]);
        push(['TOTAL', emp201.totals.total.toFixed(2)]);
      }
    } else if (activeDoc === 'emp501') {
      push(['EMP501 (Reconciliation)']); push(['Period', period]); push(['']);
      if (!emp501) push(['No data']); else {
        push(['Declared PAYE', emp501.declared.paye.toFixed(2)]);
        push(['Declared UIF', emp501.declared.uif.toFixed(2)]);
        push(['Declared SDL', emp501.declared.sdl.toFixed(2)]);
        push(['Declared TOTAL', emp501.declared.total.toFixed(2)]);
        push(['Payments TOTAL', emp501.payments.total.toFixed(2)]);
        push(['Variance', emp501.variance.toFixed(2)]);
      }
    } else if (activeDoc === 'provisional-tax') {
      push(['Provisional Tax (IRP6)']); push(['Period', period]); push(['']);
      if (!prov) push(['No data']); else {
        push(['Estimated taxable income', prov.estimate.taxableIncome.toFixed(2)]);
        push(['Rate', `${prov.estimate.rate}%`]);
        push(['Tax due', prov.estimate.taxDue.toFixed(2)]);
        push(['Credits', prov.estimate.credits.toFixed(2)]);
        push(['Net payable', prov.estimate.netPayable.toFixed(2)]);
      }
    } else if (activeDoc === 'letter-good-standing') {
      push(['Letter of Good Standing']); push(['As at', new Date().toLocaleDateString('en-ZA')]); push(['']);
      if (!good) push(['No status available']); else {
        push(['Status', good.status]);
        if (good.issuedOn) push(['Issued on', good.issuedOn]);
        if (good.validUntil) push(['Valid until', good.validUntil]);
        if (good.reference) push(['Reference', good.reference]);
      }
    }

    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');

    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }, [activeDoc, fromDate, toDate, vat, emp201, emp501, prov, good]);

  // ----- CSV one-click
  const handleDownloadCsv = useCallback(() => {
    const blob = buildCsvFallback();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc}_${fromDate}_to_${toDate}.csv`.replace(/-/g,'_');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast({ title: 'CSV ready' });
  }, [activeDoc, fromDate, toDate, buildCsvFallback, toast]);

  // ----- Generate PDF (wired per route)
  const handleGeneratePdf = useCallback(async () => {
    if (!token) {
      toast({ title: 'Login required', description: 'Please sign in.', variant: 'destructive' });
      return;
    }

    const headers: HeadersInit = { Authorization: `Bearer ${token}` };

    const tryFetchPdf = async (url: string, fallbackName: string) => {
      const resp = await fetch(url, { method: 'GET', headers });
      if (resp.status === 402) {
        const data = await resp.json().catch(() => null);
        if (data?.code === 'plan_limit_reached') {
          toast({
            variant: 'destructive',
            title: 'Monthly limit reached',
            description: `You've used ${data.used}/${data.limit} document generations.`,
            action: (<Button size="sm" onClick={() => window.open('/pricing', '_blank')}>Upgrade</Button>)
          });
          return null;
        }
        const text = await resp.text().catch(() => '');
        throw new Error(`402 Payment Required: ${text.slice(0,200)}`);
      }
      if (!resp.ok) return resp; // return anyway so caller can decide (e.g., try fallback)
      const cd = resp.headers.get('Content-Disposition');
      const filename = extractFilename(cd, fallbackName);
      const blob = await resp.blob();
      openBlobInNewTab(blob, filename);
      toast({ title: 'PDF ready', description: `${DOCS.find(d => d.id === activeDoc)?.label} opened in a new tab.` });
      return resp;
    };

    try {
      setLoading(true);

      // Route per-doc
      if (activeDoc === 'vat') {
        // Uses your financial generator
        const qs = new URLSearchParams({
          documentType: 'vat',
          startDate: fromDate,
          endDate: toDate
        });
        const url = `${API_BASE_URL}/generate-financial-document?${qs.toString()}`;
        await tryFetchPdf(url, `VAT_Report_${fromDate}_to_${toDate}.pdf`);
        return;
      }

      if (activeDoc === 'emp201') {
        const month = toDate.slice(0, 7);
        const url = `${API_BASE_URL}/compliance/emp201.pdf?month=${encodeURIComponent(month)}`;
        const r = await tryFetchPdf(url, `EMP201_${month}.pdf`);
        if (r && !r.ok) {
          // No PDF route available? Fallback to CSV
          const blob = buildCsvFallback();
          openBlobInNewTab(blob, `EMP201_${month}.csv`);
          toast({ title: 'No PDF route — CSV downloaded instead' });
        }
        return;
      }

      if (activeDoc === 'emp501') {
        const url = `${API_BASE_URL}/compliance/emp501.pdf?from=${fromDate}&to=${toDate}`;
        const r = await tryFetchPdf(url, `EMP501_${fromDate}_to_${toDate}.pdf`);
        if (r && !r.ok) {
          const blob = buildCsvFallback();
          openBlobInNewTab(blob, `EMP501_${fromDate}_to_${toDate}.csv`);
          toast({ title: 'No PDF route — CSV downloaded instead' });
        }
        return;
      }

      if (activeDoc === 'provisional-tax') {
        // Prefer PDF if your backend has it, else fallback to CSV
        const url = `${API_BASE_URL}/compliance/provisional-tax.pdf?from=${fromDate}&to=${toDate}`;
        const r = await tryFetchPdf(url, `Provisional_Tax_${fromDate}_to_${toDate}.pdf`);
        if (r && !r.ok) {
          const blob = buildCsvFallback();
          openBlobInNewTab(blob, `Provisional_Tax_${fromDate}_to_${toDate}.csv`);
          toast({ title: 'No PDF route — CSV downloaded instead' });
        }
        return;
      }

      if (activeDoc === 'letter-good-standing') {
        const url = `${API_BASE_URL}/compliance/good-standing.pdf`;
        const r = await tryFetchPdf(url, `Letter_of_Good_Standing.pdf`);

        if (r && !r.ok) {
          // Try read JSON error from backend
          let msg = 'Unable to generate Letter of Good Standing.';
          try {
            const data = await r.json();
            if (data?.code === 'not_eligible_good_standing') {
              msg =
                data.error ||
                'This company does not currently meet the solvency / PIS criteria for an audit exemption letter.';
            } else if (data?.error) {
              msg = data.error;
            }
          } catch {
            // ignore JSON parse errors
          }

          toast({
            variant: 'destructive',
            title: 'Cannot generate Letter of Good Standing',
            description: msg,
          });
        }

        // 💡 No CSV fallback here – blocked means blocked.
        return;
      }


      // Safety net (shouldn’t reach here)
      toast({ title: 'Unsupported document', description: 'This document cannot be generated yet.', variant: 'destructive' });
    } catch (err: any) {
      toast({ title: 'Generate failed', description: err?.message || 'Error generating document', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeDoc, fromDate, toDate, token, toast, buildCsvFallback]);

  // --------- Render helpers for previews ----------
  const PreviewBlock = useMemo(() => {
    if (activeDoc === 'vat') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>VAT Summary</CardTitle>
            <CardDescription>For {new Date(fromDate).toLocaleDateString('en-ZA')} — {new Date(toDate).toLocaleDateString('en-ZA')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!vat ? (
              <div className="text-sm text-muted-foreground">No VAT data for this period.</div>
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Output VAT (1A)</span><span className="font-mono">{money(vat.results.output_vat_1A)}</span></div>
                  <div className="flex justify-between"><span>Input VAT (1B)</span><span className="font-mono">{money(vat.results.input_vat_1B)}</span></div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="font-semibold">Net VAT (1C)</span>
                    <span className="font-mono font-semibold">{money(vat.results.net_vat_1C)}</span>
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="font-semibold mb-2">Supporting</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Taxable supplies (excl.)</span><span className="font-mono">{money(vat.results.taxable_supplies_excl)}</span></div>
                    <div className="flex justify-between"><span>Zero-rated supplies</span><span className="font-mono">{money(vat.results.zero_rated_supplies)}</span></div>
                    <div className="flex justify-between"><span>Exempt supplies</span><span className="font-mono">{money(vat.results.exempt_supplies)}</span></div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      );
    }

    if (activeDoc === 'emp201') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>EMP201 (Monthly)</CardTitle>
            <CardDescription>Month: {toDate.slice(0,7)}</CardDescription>
          </CardHeader>
          <CardContent>
            {!emp201 ? (
              <div className="text-sm text-muted-foreground">No data.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Amount ({symbol})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>PAYE</TableCell><TableCell className="text-right">{money(emp201.totals.paye)}</TableCell></TableRow>
                  <TableRow><TableCell>UIF</TableCell><TableCell className="text-right">{money(emp201.totals.uif)}</TableCell></TableRow>
                  <TableRow><TableCell>SDL</TableCell><TableCell className="text-right">{money(emp201.totals.sdl)}</TableCell></TableRow>
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total Due</TableCell><TableCell className="text-right">{money(emp201.totals.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      );
    }

    if (activeDoc === 'emp501') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>EMP501 (Reconciliation)</CardTitle>
            <CardDescription>{new Date(fromDate).toLocaleDateString('en-ZA')} — {new Date(toDate).toLocaleDateString('en-ZA')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!emp501 ? (
              <div className="text-sm text-muted-foreground">No data.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-dashed">
                  <CardHeader><CardTitle className="text-base">Declared</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>PAYE</span><span className="font-mono">{money(emp501.declared.paye)}</span></div>
                    <div className="flex justify-between"><span>UIF</span><span className="font-mono">{money(emp501.declared.uif)}</span></div>
                    <div className="flex justify-between"><span>SDL</span><span className="font-mono">{money(emp501.declared.sdl)}</span></div>
                    <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
                      <span>Total</span><span className="font-mono">{money(emp501.declared.total)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-dashed">
                  <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Payments total</span><span className="font-mono">{money(emp501.payments.total)}</span></div>
                    <div className={`flex justify-between border-t pt-2 mt-2 font-semibold ${emp501.variance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      <span>Variance</span><span className="font-mono">{money(emp501.variance)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    if (activeDoc === 'provisional-tax') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Provisional Tax (IRP6)</CardTitle>
            <CardDescription>{new Date(fromDate).toLocaleDateString('en-ZA')} — {new Date(toDate).toLocaleDateString('en-ZA')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!prov ? (
              <div className="text-sm text-muted-foreground">No data.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Amount ({symbol})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>Estimated taxable income</TableCell><TableCell className="text-right">{money(prov.estimate.taxableIncome)}</TableCell></TableRow>
                  <TableRow><TableCell>Tax rate</TableCell><TableCell className="text-right">{prov.estimate.rate}%</TableCell></TableRow>
                  <TableRow><TableCell>Computed tax due</TableCell><TableCell className="text-right">{money(prov.estimate.taxDue)}</TableCell></TableRow>
                  <TableRow><TableCell>Credits</TableCell><TableCell className="text-right">({money(prov.estimate.credits)})</TableCell></TableRow>
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Net payable</TableCell><TableCell className="text-right">{money(prov.estimate.netPayable)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      );
    }

    // Letter of Good Standing
    // Letter of Good Standing
    return (
      <Card>
        <CardHeader>
          <CardTitle>Letter of Good Standing</CardTitle>
          <CardDescription>
            {good?.status === 'valid' &&
              'Company meets solvency and public interest score criteria for an audit exemption letter.'}
            {good?.status === 'pending' &&
              'Company does not currently meet the solvency / public interest score criteria. A Letter of Good Standing cannot be generated automatically.'}
            {good?.status === 'expired' &&
              'A previously issued Letter of Good Standing has expired. Please request an updated assessment from your accountant.'}
            {!good &&
              'Accountant`s / audit exemption status is not yet available for this company.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!good ? (
            <div className="text-sm text-muted-foreground">
              No status available. Please ensure your books and payroll are up to date, then refresh this page.
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Status</span>
                <span
                  className={
                    'font-medium ' +
                    (good.status === 'valid'
                      ? 'text-emerald-600'
                      : good.status === 'expired'
                      ? 'text-red-600'
                      : 'text-amber-600')
                  }
                >
                  {good.status.toUpperCase()}
                </span>
              </div>

              {good.status === 'valid' && (
                <>
                  {good.reference && (
                    <div className="flex justify-between">
                      <span>Reference</span>
                      <span className="font-mono">{good.reference}</span>
                    </div>
                  )}
                  {good.issuedOn && (
                    <div className="flex justify-between">
                      <span>Issued on</span>
                      <span>{good.issuedOn}</span>
                    </div>
                  )}
                  {good.validUntil && (
                    <div className="flex justify-between">
                      <span>Valid until</span>
                      <span>{good.validUntil}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    This status is based on solvency and public interest score (PIS) calculations from your latest
                    accounting records.
                  </p>
                </>
              )}

              {good.status === 'pending' && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  The company does not currently meet the solvency and/or PIS thresholds for an audit exemption letter.
                  Please review your latest financial statements with your accountant before requesting a Letter of Good
                  Standing.
                </p>
              )}

              {good.status === 'expired' && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                  The previous Letter of Good Standing is no longer valid. An updated solvency and PIS assessment is
                  required before a new letter can be issued.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );

  }, [activeDoc, fromDate, toDate, vat, emp201, emp501, prov, good, money, symbol]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="container mx-auto p-4 sm:p-6 lg:p-8"
      >
        {/* Top: Title + Actions */}
        <Card className="mb-6 bg-white dark:bg-gray-950/60 shadow-sm border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl font-semibold tracking-tight">Compliance Centre</CardTitle>
                <CardDescription className="mt-1">Generate your statutory compliance documents.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleGeneratePdf} disabled={loading}>{loading ? 'Working...' : 'Generate PDF'}</Button>
                <Button size="sm" variant="secondary" onClick={handleDownloadCsv} disabled={loading}>CSV</Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Quick doc chooser */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
              {DOCS.map(d => {
                const Icon = d.icon;
                const active = d.id === activeDoc;
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveDoc(d.id)}
                    className={[
                      "text-left rounded-xl border px-3 py-3 transition hover:shadow-sm",
                      active ? "border-primary bg-primary/5" : "bg-background"
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 opacity-80" />
                      <div className="font-medium">{d.label}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{d.blurb}</div>
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="grid gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 items-end">
              {/* From / To */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">From</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setPreset('custom'); }}
                  className="h-9"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">To</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setPreset('custom'); }}
                  className="h-9"
                />
              </div>

              {/* Preset */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Period Preset</label>
                <Select value={preset} onValueChange={(v) => applyPreset(v as PresetKey)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Preset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="this-month">This month</SelectItem>
                    <SelectItem value="last-month">Last month</SelectItem>
                    <SelectItem value="quarter">This quarter</SelectItem>
                    <SelectItem value="half">Last 6 months</SelectItem>
                    <SelectItem value="year">Last 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Active doc (secondary selector) */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Document</label>
                <Select value={activeDoc} onValueChange={(v) => setActiveDoc(v as DocId)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Document" /></SelectTrigger>
                  <SelectContent>
                    {DOCS.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Period chip */}
              <div className="lg:col-span-12">
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-background">
                  <span className="opacity-70">Period:</span>
                  <span className="font-medium">
                    {new Date(fromDate).toLocaleDateString('en-ZA')} — {new Date(toDate).toLocaleDateString('en-ZA')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview / Summary */}
        <div className="grid grid-cols-1 gap-4">
          {PreviewBlock}
        </div>
      </motion.div>
    </div>
  );
};
