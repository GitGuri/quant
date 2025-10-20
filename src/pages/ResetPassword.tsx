// src/pages/ResetPassword.tsx
import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const API_BASE = 'https://quantnow-sa1e.onrender.com'

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = useMemo(() => params.get('token') || '', [params]);
  const emailFromLink = useMemo(() => params.get('email') || '', [params]);

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid Reset Link</CardTitle>
            <CardDescription>Your reset link is missing a token.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/auth" className="text-fuchsia-700 dark:text-fuchsia-400 underline">Go to Login</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: '✅ Password updated', description: 'You can now log in with your new password.' });
        navigate('/auth');
      } else {
        toast({
          title: 'Reset failed',
          description: data.error || 'Your link may have expired. Request a new one.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1f2937]">
      <div className="mx-auto min-h-screen max-w-3xl grid items-center px-4">
        <Card className="w-full overflow-hidden border-white/10 bg-white/90 shadow-2xl backdrop-blur dark:bg-gray-900/70">
          <CardHeader className="border-b border-gray-200/60 bg-gradient-to-r from-fuchsia-50 to-indigo-50 px-6 py-5 dark:from-gray-900 dark:to-gray-900 dark:border-white/10">
            <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
            <CardDescription>Choose a new, strong password for your account.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show1 ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow1((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      {show1 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={show2 ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow2((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      {show2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white hover:from-fuchsia-700 hover:to-indigo-700"
                disabled={isLoading}
              >
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>) : 'Update password'}
              </Button>

              <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                <Link to="/auth" className="font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-400">
                  Back to login
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
