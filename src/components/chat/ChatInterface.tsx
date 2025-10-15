import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User, Trash2, Download, Upload as UploadIcon } from 'lucide-react'
import { motion } from 'framer-motion'

type DatasetKey = 'customers' | 'products' | 'sales' | 'invoices' | 'suppliers' | 'ledger' | 'custom'

interface Message {
  id: string
  content: string            // may be text OR html OR data:image
  sender: 'user' | 'bot'
  timestamp: string          // store as ISO for persistence
  isHtml?: boolean
  isImage?: boolean
}

const API_BASE = 'https://quantnow-sa1e.onrender.com'

// -------- helpers
const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const authHeaders = () => {
  const t = localStorage.getItem('token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// very light intent guesser; runs silently — no UI pills
function guessDataset(q: string): DatasetKey {
  const s = q.toLowerCase()
  if (s.includes('customer')) return 'customers'
  if (s.includes('invoice')) return 'invoices'
  if (s.includes('supplier') || s.includes('ap')) return 'suppliers'
  if (s.includes('ledger') || s.includes('journal') || s.includes('account')) return 'ledger'
  if (s.includes('product') || s.includes('sku') || s.includes('stock')) return 'products'
  if (s.includes('sale') || s.includes('revenue') || s.includes('profit')) return 'sales'
  return 'sales'
}

// key is scoped per user so different users don’t see each other’s thread
const storageKeyForUser = (uid: string) => `quantchat:history:${uid || 'anon'}`

export default function ChatInterface() {
  // who’s logged in? (whatever you already save at login)
  const currentUserId =
    localStorage.getItem('currentUserId') ||
    localStorage.getItem('user_id') ||
    ''

  const STORAGE_KEY = useMemo(() => storageKeyForUser(currentUserId), [currentUserId])

  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ------- bootstrap from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed)
          return
        }
      }
    } catch {}
    // default welcome on empty
    setMessages([{
      id: 'welcome',
      sender: 'bot',
      timestamp: new Date().toISOString(),
      content: `Hey! I’m Qx Chat. Ask me anything about your data — sales, products, customers, invoices, suppliers, or the ledger. I’ll figure out which dataset to use.`,
    }])
  }, [STORAGE_KEY])

  // ------- persist on every change (cap at 500 msgs)
  useEffect(() => {
    const capped = messages.slice(-500)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(capped)) } catch {}
  }, [messages, STORAGE_KEY])

  // ------- autoscroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const pushMessage = (m: Omit<Message, 'id'|'timestamp'|'isHtml'|'isImage'> & { content: string }) => {
    const trimmed = m.content?.trim?.() || ''
    const isHtml = trimmed.startsWith('<')
    const isImage = trimmed.startsWith('data:image/')
    setMessages(prev => [
      ...prev,
      { ...m, id: nowId(), timestamp: new Date().toISOString(), isHtml, isImage }
    ])
  }

  const handleSend = async () => {
    const qRaw = inputMessage.trim()
    if (!qRaw || isTyping) return

    pushMessage({ sender: 'user', content: qRaw })
    setInputMessage('')
    setIsTyping(true)

    try {
      // optional inline override: "/dataset:products ..."
      const dataset =
        (qRaw.match(/\/dataset:(\w+)/i)?.[1]?.toLowerCase() as DatasetKey) ||
        guessDataset(qRaw)
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

      const data = (await r.json()) as { ok: boolean; answer?: string; error?: string }
      pushMessage({ sender: 'bot', content: data.answer ?? 'No answer returned.' })
    } catch (err: any) {
      pushMessage({
        sender: 'bot',
        content: `<div style="color:#b91c1c"><strong>Oops:</strong> ${err?.message || 'Failed to contact AI service.'}</div>`
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

  // ------- utilities: clear, export, import
  const clearChat = () => setMessages([])
  const exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quantchat-${new Date().toISOString().slice(0,19)}.json`
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
      pushMessage({ sender: 'bot', content: `<div style="color:#b91c1c">Import failed: invalid file.</div>` })
    } finally {
      e.target.value = ''
    }
  }

  return (
    <Card className='h-full flex flex-col'>
      <CardHeader className="pb-3">
        <CardTitle className='flex items-center justify-between gap-2'>
          <span className="inline-flex items-center gap-2">
            <Bot className='h-5 w-5' />
            Qx Chat
          </span>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Export chat" onClick={exportChat}>
              <Download className="h-4 w-4" />
            </Button>
            <label className="inline-flex items-center">
              <input type="file" accept="application/json" className="hidden" onChange={importChat} />
              <Button asChild variant="ghost" size="icon" title="Import chat (.json)">
                <span><UploadIcon className="h-4 w-4" /></span>
              </Button>
            </label>
            <Button variant="ghost" size="icon" title="Clear chat" onClick={clearChat}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className='flex-1 flex flex-col space-y-4'>
        {/* transcript */}
        <ScrollArea className='flex-1 pr-4'>
          <div className='space-y-4'>
            {messages.map(m => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    m.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <div className='flex items-start gap-2'>
                    {m.sender === 'bot' ? <Bot className='h-4 w-4 mt-1 flex-shrink-0' /> : <User className='h-4 w-4 mt-1 flex-shrink-0' />}
                    <div>
                      {m.isImage ? (
                        <img src={m.content} alt='AI chart' className='max-w-full rounded' />
                      ) : m.isHtml ? (
                        <div className='prose prose-sm max-w-none' dangerouslySetInnerHTML={{ __html: m.content }} />
                      ) : (
                        <p className='text-sm whitespace-pre-wrap'>{m.content}</p>
                      )}
                      <p className='text-[11px] opacity-60 mt-1'>
                        {new Date(m.timestamp).toLocaleString()}
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
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* composer */}
        <div className='flex gap-2'>
          <Input
            placeholder='Ask me about your data… (you can also prefix /dataset:products etc., but not required)'
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className='flex-1'
          />
          <Button onClick={handleSend} disabled={!inputMessage.trim() || isTyping}>
            <Send className='h-4 w-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

