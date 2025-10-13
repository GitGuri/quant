import React, { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

const API_BASE = 'https://quantnow-sa1e.onrender.com'

export function IntegrationsDialog({
  open,
  onOpenChange,
  scope = 'user'
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  scope?: 'user' | 'company'
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [firefliesKey, setFirefliesKey] = useState('')
  const [readAiKey, setReadAiKey] = useState('')

  const authHeaders = () => {
    const token = localStorage.getItem('token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true)
      const r = await fetch(`${API_BASE}/api/integrations/keys?scope=${scope}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      })
      if (!r.ok) return
      const j = await r.json()
      setFirefliesKey(j.fireflies_api_key || '')
      setReadAiKey(j.readai_api_key || '')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    if (open) loadKeys()
  }, [open, loadKeys])

  const save = async () => {
    try {
      setSaving(true)
      const r = await fetch(`${API_BASE}/api/integrations/keys?scope=${scope}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          fireflies_api_key: firefliesKey || null,
          readai_api_key: readAiKey || null
        })
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Failed to save keys')
      toast({ title: 'Integrations saved', description: 'Your API keys are updated.' })
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Integrations</DialogTitle>
          <DialogDescription>
            Paste your Fireflies or Read.ai API keys here. Stored securely for your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Fireflies API Key</label>
            <Input
              type="password"
              placeholder="fflive_xxx..."
              value={firefliesKey}
              onChange={(e) => setFirefliesKey(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              🔗 Get it from Fireflies → Profile → API Settings
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Read.ai API Key</label>
            <Input
              type="password"
              placeholder="rea_xxx..."
              value={readAiKey}
              onChange={(e) => setReadAiKey(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              🔗 Get it from Read.ai → Settings → API Key
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
