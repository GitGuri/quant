// src/pages/reports/ChatInterface.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { CalendarIcon, Bot, User, Trash2, Download, Upload as UploadIcon, Send, SlidersHorizontal } from 'lucide-react'
import { motion } from 'framer-motion'

// NEW: recharts
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'

type DatasetKey = 'customers' | 'products' | 'sales' | 'invoices' | 'suppliers' | 'ledger' | 'custom'
type ModeKey = 'chat' | 'report' | 'marketing' | 'bplan' | 'notify' | 'auto_analyze'

// NEW: shape that /ai/auto-analyze returns
type AutoChart = {
  key: string
  chart_type: 'pie' | 'bar' | 'line'
  data: any[]
}

interface Message {
  id: string
  content: string
  sender: 'user' | 'bot'
  timestamp: string
  isHtml?: boolean
  isImage?: boolean
  // NEW: payload for structured results (charts/insights)
  payload?: {
    charts?: AutoChart[]
    insights?: string
  }
}

type Filters = {
  dateFrom?: string
  dateTo?: string
}

const API_BASE = 'https://quantnow-sa1e.onrender.com'

// helpers
const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const authHeaders = () => {
  const t = localStorage.getItem('token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const storageKeyForUser = (uid: string) => `quantchat:history:${uid || 'anon'}`
const prefsKeyForUser = (uid: string) => `quantchat:prefs:${uid || 'anon'}`

const DATASET_OPTIONS: DatasetKey[] = ['customers', 'products', 'sales', 'invoices', 'suppliers', 'ledger', 'custom']
const MODE_OPTIONS: { value: ModeKey; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'report', label: 'Report' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'bplan', label: 'Business Plan' },
  { value: 'notify', label: 'Notify' },
  { value: 'auto_analyze', label: 'Auto Analyze' }, // NEW
]

// NEW: small color palette for charts
const COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4', '#A78BFA', '#84CC16', '#F97316', '#14B8A6', '#E11D48']

export default function ChatInterface() {
  const currentUserId =
    localStorage.getItem('currentUserId') ||
    localStorage.getItem('user_id') ||
    ''

  const STORAGE_KEY = useMemo(() => storageKeyForUser(currentUserId), [currentUserId])
  const PREFS_KEY = useMemo(() => prefsKeyForUser(currentUserId), [currentUserId])

  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // user prefs
  const [dataset, setDataset] = useState<DatasetKey>('sales')
  const [mode, setMode] = useState<ModeKey>('chat')
  const [filters, setFilters] = useState<Filters>({})
  const [filtersOpen, setFiltersOpen] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // bootstrap messages + prefs from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed)
        } else {
          setMessages(getWelcome())
        }
      } else {
        setMessages(getWelcome())
      }
    } catch {
      setMessages(getWelcome())
    }

    try {
      const rawPrefs = localStorage.getItem(PREFS_KEY)
      if (rawPrefs) {
        const prefs = JSON.parse(rawPrefs) as { dataset?: DatasetKey; mode?: ModeKey; filters?: Filters }
        if (prefs.dataset) setDataset(prefs.dataset)
        if (prefs.mode) setMode(prefs.mode)
        if (prefs.filters) setFilters(prefs.filters)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY, PREFS_KEY])

  // persist chat (cap 500) + prefs
  useEffect(() => {
    try {
      const capped = messages.slice(-500)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
    } catch {}
  }, [messages, STORAGE_KEY])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ dataset, mode, filters }))
    } catch {}
  }, [dataset, mode, filters, PREFS_KEY])

  // autoscroll
  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const sc = scrollContainerRef.current
    if (!sc) return
    sc.scrollTo({ top: sc.scrollHeight, behavior })
  }
  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, isTyping])

  const pushMessage = (
    m: Omit<Message, 'id' | 'timestamp' | 'isHtml' | 'isImage'> & { content: string }
  ) => {
    const trimmed = m.content?.trim?.() || ''
    const isHtml = /^<(?!!)/.test(trimmed)
    const isImage = trimmed.startsWith('data:image/')
    setMessages(prev => [
      ...prev,
      { ...m, id: nowId(), timestamp: new Date().toISOString(), isHtml, isImage },
    ])
  }

  const pushAutoMessage = (charts: AutoChart[], insights?: string) => { // NEW
    const payload = { charts, insights }
    setMessages(prev => [
      ...prev,
      {
        id: nowId(),
        sender: 'bot',
        timestamp: new Date().toISOString(),
        content: '', // we render via payload
        payload
      }
    ])
  }

  const handleSend = async () => {
    const qRaw = inputMessage.trim()
    if (mode === 'chat' && !qRaw) return
    if (isTyping) return

    if (qRaw) pushMessage({ sender: 'user', content: qRaw })
    setInputMessage('')
    setIsTyping(true)

    try {
      // Route by mode
      let endpoint = '/ai/chat'
      let body: any = {}

      if (mode === 'chat') {
        body = { question: qRaw, dataset, filters }
      } else if (mode === 'report') {
        endpoint = '/ai/report'
        body = { dataset, filters }
      } else if (mode === 'marketing') {
        endpoint = '/ai/marketing'
        body = { dataset, filters }
      } else if (mode === 'bplan') {
        endpoint = '/ai/bplan'
        body = { dataset, filters }
      } else if (mode === 'notify') {
        endpoint = '/ai/notify'
        body = { dataset, filters }
      } else if (mode === 'auto_analyze') {
        endpoint = '/ai/auto-analyze'
        body = { dataset, filters }
      }

      const r = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        throw new Error(errText || `AI error ${r.status}`)
      }

      const data = await r.json()

      // NEW: render charts when Auto Analyze mode
      if (mode === 'auto_analyze') {
        const charts: AutoChart[] = Array.isArray(data?.charts) ? data.charts : []
        const insights: string | undefined = typeof data?.insights === 'string' ? data.insights : undefined

        if (!charts.length && !insights) {
          pushMessage({ sender: 'bot', content: 'No charts or insights returned.' })
        } else {
          pushAutoMessage(charts, insights)
        }
        return
      }

      // Other modes: normalize to string or <pre>
      const answer =
        data.answer ||
        data.report ||
        data.plan ||
        data.insights ||
        data?.kpis ||
        (data?.ok === true ? (data.answer || data.report || data.plan || data.insights || 'Done.') : data?.error || 'No answer returned.')

      pushMessage({
        sender: 'bot',
        content:
          typeof answer === 'string'
            ? answer
            : `<pre class="whitespace-pre-wrap text-xs">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>`,
      })
    } catch (err: any) {
      pushMessage({
        sender: 'bot',
        content: `<div style="color:#b91c1c"><strong>Oops:</strong> ${escapeHtml(err?.message || 'Failed to contact AI service.')}</div>`,
      })
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // utilities
  const clearChat = () => setMessages([])
  const exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quantchat-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importChat = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const text = await f.text()
      const arr = JSON.parse(text)
      if (Array.isArray(arr)) setMessages(arr)
    } catch {
      pushMessage({
        sender: 'bot',
        content: `<div style="color:#b91c1c">Import failed: invalid file.</div>`,
      })
    } finally {
      e.target.value = ''
    }
  }

  // UI bits
  const bubbleClass = (sender: 'user' | 'bot') =>
    sender === 'user'
      ? 'bg-primary/10 text-foreground border border-primary/20'
      : 'bg-muted text-foreground'

  return (
    <Card className="h-full flex flex-col bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <Bot className="h-5 w-5" />
            QX Chat & Reports
          </span>

          <div className="flex items-center gap-2">
            {/* MODE selector */}
            <div className="hidden md:flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <Select
                value={mode}
                onValueChange={(v: ModeKey) => setMode(v)}
              >
                <SelectTrigger className="w-[170px] h-8">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* DATASET selector */}
            <div className="hidden md:flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Dataset</Label>
              <Select
                value={dataset}
                onValueChange={(v: DatasetKey) => setDataset(v)}
              >
                <SelectTrigger className="w-[170px] h-8">
                  <SelectValue placeholder="Dataset" />
                </SelectTrigger>
                <SelectContent>
                  {DATASET_OPTIONS.map(d => (
                    <SelectItem key={d} value={d}>{cap(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filters popover */}
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" title="Filters">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Date range</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">From (YYYY-MM-DD)</Label>
                      <Input
                        placeholder="2025-01-01"
                        value={filters.dateFrom || ''}
                        onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value || undefined }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To (YYYY-MM-DD)</Label>
                      <Input
                        placeholder="2025-12-31"
                        value={filters.dateTo || ''}
                        onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value || undefined }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="secondary" onClick={() => setFiltersOpen(false)}>Done</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Import / Export / Clear */}
            <Button variant="ghost" size="icon" title="Export chat" onClick={exportChat}>
              <Download className="h-4 w-4" />
            </Button>
            <label className="inline-flex items-center">
              <input type="file" accept="application/json" className="hidden" onChange={importChat} />
              <Button asChild variant="ghost" size="icon" title="Import chat (.json)">
                <span>
                  <UploadIcon className="h-4 w-4" />
                </span>
              </Button>
            </label>
            <Button variant="ghost" size="icon" title="Clear chat" onClick={clearChat}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>

        {/* Compact selectors for mobile */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <Select value={mode} onValueChange={(v: ModeKey) => setMode(v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dataset</Label>
            <Select value={dataset} onValueChange={(v: DatasetKey) => setDataset(v)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Dataset" />
              </SelectTrigger>
              <SelectContent>
                {DATASET_OPTIONS.map(d => (
                  <SelectItem key={d} value={d}>{cap(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col gap-0 bg-card">
        {/* Scrollable messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto pr-4 pb-24"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="space-y-4 py-1">
            {messages.map(m => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${bubbleClass(m.sender)}`}>
                  <div className="flex items-start gap-2">
                    {m.sender === 'bot' ? (
                      <Bot className="h-4 w-4 mt-1 flex-shrink-0" />
                    ) : (
                      <User className="h-4 w-4 mt-1 flex-shrink-0" />
                    )}
                    <div className="min-w-[220px]">
                      {/* NEW: payload renderer for Auto Analyze */}
                      {m.payload?.charts ? (
                        <AutoAnalyzeBlock charts={m.payload.charts} insights={m.payload.insights} />
                      ) : m.isImage ? (
                        <img src={m.content} alt="AI output" className="max-w-full rounded" />
                      ) : m.isHtml ? (
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: m.content }}
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(m.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Sticky composer */}
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t z-10">
          <form
            className="flex gap-2 p-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <Input
              placeholder={
                mode === 'chat'
                  ? `Ask a question about ${cap(dataset)}…`
                  : mode === 'auto_analyze'
                    ? `Optional note… (Auto Analyze runs on ${cap(dataset)})`
                    : `Optional note… (${cap(mode)} runs on selected dataset)`
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit" disabled={mode === 'chat' ? !inputMessage.trim() || isTyping : isTyping}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- small helpers
function cap(s: string) {
  return s.slice(0,1).toUpperCase() + s.slice(1)
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] as string))
}
function getWelcome(): Message[] {
  return [
    {
      id: 'welcome',
      sender: 'bot',
      timestamp: new Date().toISOString(),
      content: `Welcome to QX 👋

How to begin:
1. Choose a dataset from the top right.
2. Select a mode for what you want to do.
3. Type a message (only needed for Chat) or just click Send.

What each mode does:
- Chat – Ask questions about your data.  
  Examples: “Show top 10 products by revenue this month”, “List customers with overdue invoices”, “Compare sales by region to last year”.
- Report – Creates a quick summary and key metrics for your selected dataset.
- Marketing – Suggests marketing ideas or messages using your data.
- Business Plan – Builds a simple business plan outline based on your data.
- Notify – Generates alerts or reminders from your dataset.
- Auto Analyze – Creates charts and short insights from the selected dataset.

Filters:
Click the sliders icon to set a start and end date. Leave them empty to include all dates.

Tips:
• Press Enter to send a message.  
• Use the download or upload buttons to save or restore chats.  
• The Clear button removes your current conversation (your data stays safe).

You’re ready—pick a dataset and mode to get started.`,
    },
  ];
}

// ===== NEW: Auto Analyze visual block (charts + insights) =====
function AutoAnalyzeBlock({ charts, insights }: { charts: AutoChart[], insights?: string }) {
  return (
    <div className="space-y-4">
      {charts.map((c, idx) => (
        <div key={idx} className="bg-background/40 border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">{friendlyTitle(c.key)}</div>
            <div className="text-[11px] text-muted-foreground">{c.chart_type}</div>
          </div>
          <div className="h-[220px] w-[68vw] max-w-[720px] min-w-[280px]">
            <ChartRenderer chart={c} />
          </div>
        </div>
      ))}

      {insights && (
        <div className="bg-background/40 border rounded-xl p-3">
          <div className="text-sm font-semibold mb-2">Executive Summary</div>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: mdToHtml(insights) }} />
        </div>
      )}
    </div>
  )
}

// ===== NEW: ChartRenderer maps pie/bar/line to Recharts components =====
function ChartRenderer({ chart }: { chart: AutoChart }) {
  const { chart_type, data } = chart

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-xs text-muted-foreground">No data</div>
  }

  if (chart_type === 'pie') {
    // Heuristics for label/value keys
    const labelKey = guessKey(data[0], ['status','payment_type','name','category','label','key'])
    const valueKey = guessKey(data[0], ['value','total','total_amount','total_spent','count'])
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={labelKey}
            cx="50%"
            cy="50%"
            outerRadius="80%"
            isAnimationActive
          >
            {data.map((_entry, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <RTooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart_type === 'bar') {
    // For bars, try to find x and y keys
    const xKey = guessKey(data[0], ['name','customer','customer_name','status','payment_type','category','date','label','key'])
    const yKey = guessKey(data[0], ['value','total','total_amount','total_spent','count'])
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <RTooltip />
          <Legend />
          <Bar dataKey={yKey} fill={COLORS[0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chart_type === 'line') {
    // Dates on X, count/total on Y
    const xKey = guessKey(data[0], ['date','month','period','label','key'])
    const yKey = guessKey(data[0], ['count','value','total','total_amount','total_spent'])
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <RTooltip />
          <Legend />
          <Line type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // Fallback: show raw
  return (
    <pre className="whitespace-pre-wrap text-xs bg-muted/30 rounded p-2 h-full overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

// ===== NEW: helpers for charts
function guessKey(obj: any, prefs: string[]): string {
  for (const k of prefs) if (k in obj) return k
  // fallback to the first numeric (for value) or first string (for label)
  const entries = Object.keys(obj)
  const num = entries.find(k => typeof obj[k] === 'number')
  const str = entries.find(k => typeof obj[k] === 'string')
  return num || str || entries[0]
}

function friendlyTitle(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

/** super-light markdown to HTML (only headers, lists, italics, bold, code fences) */
function mdToHtml(md: string): string {
  let html = md
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre class="whitespace-pre-wrap text-xs bg-muted/30 rounded p-2">${escapeHtml(String(code))}</pre>`)
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
  html = html.replace(/\n/g, '<br/>')
  return html
}
