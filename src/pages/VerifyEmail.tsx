// src/pages/VerifyEmail.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL ||
  (import.meta as any)?.env?.VITE_API_BASE ||
  'https://quantnow-sa1e.onrender.com';

export default function VerifyEmail() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState<string>('Verifying your email…');
  const nav = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    (async () => {
      try {
        const url = `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });

        // Try JSON first
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          if (res.ok) {
            setStatus('success');
            setMessage(data.message || 'Your email was verified successfully.');
            toast({ title: '✅ Email verified', description: 'You can log in now.' });
            // optional: auto jump
            setTimeout(() => nav('/login?verified=1', { replace: true }), 800);
          } else {
            setStatus('error');
            setMessage(data.error || 'Verification failed. The link may be invalid or expired.');
          }
          return;
        }

        // Not JSON — treat as text/HTML
        const text = await res.text().catch(() => '');
        if (res.ok) {
          setStatus('success');
          setMessage('Your email was verified successfully.');
          toast({ title: '✅ Email verified', description: 'You can log in now.' });
          setTimeout(() => nav('/login?verified=1', { replace: true }), 800);
        } else {
          setStatus('error');
          setMessage(text || 'Verification failed. The link may be invalid or expired.');
        }
      } catch {
        setStatus('error');
        setMessage('Network error while verifying your email.');
      }
    })();
  }, [nav, toast]);

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === 'checking' && (
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{message}</span>
            </div>
          )}

          {status === 'success' && (
            <>
              <div className="flex items-center justify-center text-green-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <p className="text-sm">{message}</p>
              <Button className="w-full" onClick={() => nav('/login', { replace: true })}>
                Go to Login
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex items-center justify-center text-red-600">
                <XCircle className="h-10 w-10" />
              </div>
              <p className="text-sm">{message}</p>
              <Button variant="outline" className="w-full" onClick={() => nav('/login')}>
                Back to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
