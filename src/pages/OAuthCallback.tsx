// src/pages/OAuthCallback.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthPage';
import { useToast } from '@/components/ui/use-toast';

export default function OAuthCallback() {
  const nav = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const error = q.get('error');

    if (error) {
      // Handle specific backend error reasons if present
      if (error === 'unverified_google_email') {
        toast({
          title: 'Email not verified',
          description:
            'Your Google account email is not verified. Please verify it with Google and try again.',
          variant: 'destructive',
        });
      } else if (error === 'google_oauth_failed') {
        toast({
          title: 'Google sign-in failed',
          description: 'Something went wrong during Google authentication.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Google sign-in failed', variant: 'destructive' });
      }
      nav('/login', { replace: true });
      return;
    }

    const token = q.get('token');
    const name = q.get('name') || '';
    const user_id = q.get('user_id') || '';
    const parent_user_id = q.get('parent_user_id') || '';
    let roles: string[] = [];

    try {
      roles = JSON.parse(decodeURIComponent(q.get('roles') || '[]'));
      if (!Array.isArray(roles)) roles = [];
    } catch {
      roles = [];
    }

    if (!token) {
      toast({ title: 'Missing token from OAuth', variant: 'destructive' });
      nav('/login', { replace: true });
      return;
    }

    // Persist session (same keys your app already uses)
    localStorage.setItem('token', token);
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('userId', user_id);
    localStorage.setItem('companyId', parent_user_id || user_id);
    localStorage.setItem('userRoles', JSON.stringify(roles));
    localStorage.setItem('userName', name);

    login();
    toast({ title: '✅ Signed in with Google', description: `Welcome, ${name || 'User'}!` });

    // Optional: support a ?next=/somewhere param if you ever add it
    const next = q.get('next') || '/';
    nav(next, { replace: true });
  }, [login, nav, toast]);

  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
