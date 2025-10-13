import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User, FileText, Megaphone, Lightbulb, ClipboardList } from 'lucide-react'
import { motion } from 'framer-motion'

type DatasetKey =
  | 'customers'
  | 'products'
  | 'sales'
  | 'invoices'
  | 'suppliers'
  | 'ledger'
  | 'custom'

interface Message {
  id: string
  content: string            // may be text OR html OR data:image
  sender: 'user' | 'bot'
  timestamp: Date
  isHtml?: boolean           // render with dangerouslySetInnerHTML
  isImage?: boolean          // render as <img>
}

const API_BASE = 'https://quantnow-sa1e.onrender.com'

// Helper: auth header (same token you already store on login)
function authHeaders() {
  const t = localStorage.getItem('token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// Optional: super-light dataset detector.
// You can also select explicitly with the UI pills below.
function guessDataset(q: string): DatasetKey {
  const s = q.toLowerCase()
  if (s.includes('customer')) return 'customers'
  if (s.includes('product') || s.includes('sku') || s.includes('stock')) return 'products'
  if (s.includes('invoice')) return 'invoices'
  if (s.includes('supplier') || s.includes('ap')) return 'suppliers'
  if (s.includes('ledger') || s.includes('journal') || s.includes('account')) return 'ledger'
  if (s.includes('sale') || s.includes('revenue') || s.includes('profit')) return 'sales'
  return 'sales'
}

function nowId() {
  return (Date.now() + Math.random()).toString()
}

export function ChatInterface () {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content:
        "Hello! I'm Qx Chat, your data assistant. Ask me about sales, products, customers, invoices, suppliers, or the ledger. I can return explanations, tables, or charts based on your data.",
      sender: 'bot',
      timestamp: new Date()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // Optional: dataset override via UI. If empty, we guess from the query.
  const [datasetOverride, setDatasetOverride] = useState<DatasetKey | ''>('')

  const pushBotMessage = (content: string) => {
    const trimmed = content?.trim?.() || ''
    const asHtml = trimmed.startsWith('<')
    const asImage = trimmed.startsWith('data:image/')
    setMessages(prev => [
      ...prev,
      {
        id: nowId(),
        content,
        sender: 'bot',
        timestamp: new Date(),
        isHtml: asHtml,
        isImage: asImage
      }
    ])
  }

  const pushUserMessage = (content: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: nowId(),
        content,
        sender: 'user',
        timestamp: new Date()
      }
    ])
  }

  const getDatasetForQuery = (q: string): DatasetKey => {
    // allow inline override like "/dataset:products ..."
    const match = q.match(/\/dataset:(\w+)/i)
    if (match) return (match[1].toLowerCase() as DatasetKey)
    // allow UI override
    if (datasetOverride) return datasetOverride
    // fallback to guesser
    return guessDataset(q)
  }

  const handleSendMessage = async () => {
    const qRaw = inputMessage.trim()
    if (!qRaw) return

    pushUserMessage(qRaw)
    setInputMessage('')
    setIsTyping(true)

    try {
      const dataset = getDatasetForQuery(qRaw)
      const question = qRaw.replace(/\/dataset:\w+\s*/i, '')

      const r = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question, dataset })
      })

      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        throw new Error(errText || `AI error ${r.status}`)
      }

      const data = await r.json() as { ok: boolean; answer?: string; error?: string }
      pushBotMessage(data.answer ?? 'No answer returned.')
    } catch (err: any) {
      pushBotMessage(
        `<div style="color:#b91c1c"><strong>Oops:</strong> ${
          err?.message || 'Failed to contact AI service.'
        }</div>`
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Generic helper for report-like endpoints that return { report: string }
  const runReportEndpoint = async (
    kind: 'report' | 'marketing' | 'bplan' | 'notify',
    dataset?: DatasetKey
  ) => {
    setIsTyping(true)
    try {
      const body: any = {}
      if (dataset) body.dataset = dataset

      const r = await fetch(`${API_BASE}/ai/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      })

      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        throw new Error(errText || `AI error ${r.status}`)
      }

      const data = await r.json() as { ok: boolean; report?: string; error?: string }
      if (!data.ok) throw new Error(data.error || 'AI failed')

      // Render as plain text (safe). If you trust HTML, wrap it and it will auto-detect.
      pushBotMessage(data.report || '(Empty report)')
    } catch (err: any) {
      pushBotMessage(
        `<div style="color:#b91c1c"><strong>Oops:</strong> ${
          err?.message || 'Failed to contact AI service.'
        }</div>`
      )
    } finally {
      setIsTyping(false)
    }
  }

  const datasetPill = (key: DatasetKey, label: string) => {
    const active = datasetOverride === key
    return (
      <Button
        key={key}
        type={active ? 'default' : 'button'}
        variant={active ? 'default' : 'outline'}
        size='sm'
        onClick={() => setDatasetOverride(active ? '' : key)}
      >
        {label}
      </Button>
    )
  }

  return (
    <Card className='h-full flex flex-col'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Bot className='h-5 w-5' />
          QuantChat – Your Data Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className='flex-1 flex flex-col space-y-4'>

        {/* Dataset selector (optional override) */}
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs opacity-70 pt-2 pr-1'>Dataset:</span>
          {datasetPill('sales', 'Sales')}
          {datasetPill('products', 'Products')}
          {datasetPill('customers', 'Customers')}
          {datasetPill('invoices', 'Invoices')}
          {datasetPill('suppliers', 'Suppliers')}
          {datasetPill('ledger', 'Ledger')}
          {datasetPill('custom', 'Custom')}
          {!!datasetOverride && (
            <Button variant='ghost' size='sm' onClick={() => setDatasetOverride('')}>
              Clear
            </Button>
          )}
        </div>

        {/* Transcript */}
        <ScrollArea className='flex-1 pr-4'>
          <div className='space-y-4'>
            {messages.map(message => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className='flex items-start gap-2'>
                    {message.sender === 'bot' && <Bot className='h-4 w-4 mt-1 flex-shrink-0' />}
                    {message.sender === 'user' && <User className='h-4 w-4 mt-1 flex-shrink-0' />}
                    <div>
                      {message.isImage ? (
                        <img src={message.content} alt='AI chart' className='max-w-full rounded' />
                      ) : message.isHtml ? (
                        <div
                          className='prose prose-sm max-w-none'
                          dangerouslySetInnerHTML={{ __html: message.content }}
                        />
                      ) : (
                        <p className='text-sm whitespace-pre-wrap'>{message.content}</p>
                      )}
                      <p className='text-xs opacity-70 mt-1'>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className='flex justify-start'>
                <div className='bg-muted rounded-lg p-3'>
                  <div className='flex items-center gap-2'>
                    <Bot className='h-4 w-4' />
                    <div className='flex space-x-1'>
                      <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'></div>
                      <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0.1s' }}></div>
                      <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        {/* Chat composer */}
        <div className='flex gap-2'>
          <Input
            placeholder='Ask me about your data... (tip: /dataset:sales, products, customers, invoices, suppliers, ledger)'
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            className='flex-1'
          />
          <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isTyping}>
            <Send className='h-4 w-4' />
          </Button>
        </div>

        {/* Quick actions */}
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:customers Show my top customers this month')}>
            Top Customers
          </Button>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:sales Generate a sales report for the last quarter')}>
            Sales Report (Chat)
          </Button>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:products What are my profit margins by product?')}>
            Profit Analysis
          </Button>
        </div>

        {/* Reports toolbar */}
        <div className='flex flex-wrap gap-2 pt-1'>
          <Button
            variant='default'
            size='sm'
            onClick={() => runReportEndpoint('report', datasetOverride || 'sales')}
            title='Comprehensive business report'
          >
            <FileText className='h-4 w-4 mr-1' /> Generate Report
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => runReportEndpoint('marketing', datasetOverride || 'sales')}
            title='Marketing strategy'
          >
            <Megaphone className='h-4 w-4 mr-1' /> Marketing Strategy
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => runReportEndpoint('bplan', datasetOverride || 'sales')}
            title='Business plan'
          >
            <ClipboardList className='h-4 w-4 mr-1' /> Business Plan
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => runReportEndpoint('notify', datasetOverride || 'sales')}
            title='Brief analysis & tips'
          >
            <Lightbulb className='h-4 w-4 mr-1' /> Quick Tips
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default ChatInterface
