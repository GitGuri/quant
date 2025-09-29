import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User } from 'lucide-react'
import { motion } from 'framer-motion'

interface Message {
  id: string
  content: string            // may be text OR html OR data:image
  sender: 'user' | 'bot'
  timestamp: Date
  isHtml?: boolean           // render with dangerouslySetInnerHTML
  isImage?: boolean          // render as <img>
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http//localhost:3000'

// Helper: auth header (same token you already store on login)
function authHeaders() {
  const t = localStorage.getItem('token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// Optional: super-light dataset detector.
// You can also add a small dropdown in the UI if you prefer.
function guessDataset(q: string):
  'customers'|'products'|'sales'|'invoices'|'suppliers'|'ledger'|'custom' {
  const s = q.toLowerCase()
  if (s.includes('customer')) return 'customers'
  if (s.includes('product') || s.includes('sku') || s.includes('stock')) return 'products'
  if (s.includes('invoice')) return 'invoices'
  if (s.includes('supplier') || s.includes('ap')) return 'suppliers'
  if (s.includes('ledger') || s.includes('journal') || s.includes('account')) return 'ledger'
  if (s.includes('sale') || s.includes('revenue') || s.includes('profit')) return 'sales'
  return 'sales'
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

  const pushBotMessage = (content: string) => {
    const asHtml = content.trim().startsWith('<')
    const asImage = content.startsWith('data:image/')
    setMessages(prev => [
      ...prev,
      {
        id: (Date.now() + Math.random()).toString(),
        content,
        sender: 'bot',
        timestamp: new Date(),
        isHtml: asHtml,
        isImage: asImage
      }
    ])
  }

  const handleSendMessage = async () => {
    const q = inputMessage.trim()
    if (!q) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: q,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsTyping(true)

    try {
      // You can override dataset via a quick syntax like:
      // /dataset:products What are my low-stock items?
      const match = q.match(/\/dataset:(\w+)/i)
      const dataset = match
        ? (match[1].toLowerCase() as any)
        : guessDataset(q)

      const body = {
        question: q.replace(/\/dataset:\w+\s*/i, ''),
        dataset // server scopes by req.user/org
      }

      const r = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      })

      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        throw new Error(errText || `AI error ${r.status}`)
      }

      const data = await r.json() as { ok: boolean; answer: string }
      pushBotMessage(data.answer ?? 'No answer returned.')
    } catch (err: any) {
      pushBotMessage(
        `<div style="color:#b91c1c"><strong>Oops:</strong> ${err.message || 'Failed to contact AI service.'}</div>`
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

  return (
    <Card className='h-full flex flex-col'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Bot className='h-5 w-5' />
          QuantChat - Your Data Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className='flex-1 flex flex-col space-y-4'>
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

        <div className='flex gap-2'>
          <Input
            placeholder='Ask me anything about your data... (tip: /dataset:sales, products, customers, invoices, suppliers, ledger)'
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            className='flex-1'
          />
          <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isTyping}>
            <Send className='h-4 w-4' />
          </Button>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:customers Show my top customers this month')}>
            Top Customers
          </Button>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:sales Generate a sales report for the last quarter')}>
            Sales Report
          </Button>
          <Button variant='outline' size='sm' onClick={() => setInputMessage('/dataset:products What are my profit margins by product?')}>
            Profit Analysis
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
