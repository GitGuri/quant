// src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { ToastAction } from '@/components/ui/toast';

const API_BASE = 'https://quantnow-sa1e.onrender.com';

interface AuthContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  userRoles: string[];
  userName: string | null;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    localStorage.getItem('isAuthenticated') === 'true'
  );

  const [userRoles, setUserRoles] = useState<string[]>(
    JSON.parse(localStorage.getItem('userRoles') || '[]')
  );

  const [userName, setUserName] = useState<string | null>(
    localStorage.getItem('userName')
  );

  const login = () => {
    setIsAuthenticated(true);
    setUserRoles(JSON.parse(localStorage.getItem('userRoles') || '[]'));
    setUserName(localStorage.getItem('userName'));
    localStorage.setItem('isAuthenticated', 'true');
  };


  const logout = () => {
    // 1. Clear In-Memory State Immediately
    setIsAuthenticated(false);
    setUserRoles([]);
    setUserName(null);

    // 2. Clear Local Storage (existing logic)
    const keysToRemove = [
      'token',
      'isAuthenticated',
      'userId',
      'user_id',
      'currentUserId',
      'userRoles',
      'userName',
      'companyId',
      'activeCompanyId',
      'compareCompanyId',
      'companies',
      'qx:profile:completion', // Clear the profile completion cache key as well
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Remove any *scoped* company keys (existing logic)
    Object.keys(localStorage).forEach(k => {
      if (
        k.startsWith('activeCompanyId:') ||
        k.startsWith('companies:') ||
        k.startsWith('compareCompanyId:') ||
        k.startsWith('onboarding:') // Clear any scoped onboarding keys
      ) {
        localStorage.removeItem(k);
      }
    });
    
    // 3. Clear Session Storage
    // This removes any session-only state that might be holding old data.
    sessionStorage.clear();

    // 4. Force Immediate Hard Navigation with Cache Busting
    // We create a new URL object based on the current origin.
    const url = new URL(window.location.origin);
    // Set the path to the root/login page
    url.pathname = '/'; 
    // Add a unique timestamp 'c' parameter to force the browser to ignore its cache.
    url.searchParams.set('c', Date.now().toString()); 

    window.location.replace(url.toString()); 
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        login,
        logout,
        userRoles,
        userName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/** ---------- Onboarding helpers (scoped per user) ---------- */
const skey = (key: string, userId: string) => `${key}:${userId}`;

function computeProfileCompletion(
  p: any,
  opts: { logo?: string | null; branchCount?: number } = {}
) {
  const checks: Array<boolean> = [
    !!p?.name,
    !!p?.company,
    !!p?.email,
    !!p?.phone,
    !!p?.address,
    !!p?.city,
    !!p?.province,
    !!p?.country,
    //!!p?.website || !!p?.linkedin,
    !!p?.currency,
    //!p?.is_vat_registered || !!p?.vat_number,
    !!opts.logo,
    //(opts.branchCount || 0) > 0,
  ];
  const done = checks.filter(Boolean).length;
  return Math.max(0, Math.min(100, Math.round((done / checks.length) * 100)));
}
/** --------------------------------------------------------- */

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // --- Login State ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  // --- End Login State ---

  // --- Forgot Password State ---
  const [forgotEmail, setForgotEmail] = useState('');
  // --- End Forgot Password State ---

  // --- Registration State (Simplified) ---
  const [regName, setRegName] = useState(''); // First Name
  const [regSurname, setRegSurname] = useState(''); // Last Name
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regCompanyName, setRegCompanyName] = useState('');
  // --- End Registration State ---

  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
  };

  // --- Handle Login Submit ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint = `${API_BASE}/login`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        const user = data.user;
        const companyId = user.parent_user_id || user.user_id;
        const roles = Array.isArray(user.roles)
          ? user.roles
          : typeof user.role === 'string'
          ? [user.role]
          : [];

        // Core auth
        localStorage.setItem('token', data.token);
        localStorage.setItem('isAuthenticated', 'true');

        // Store user ids in a couple of shapes for compatibility
        localStorage.setItem('userId', user.user_id);
        localStorage.setItem('user_id', user.user_id);       // bridge
        localStorage.setItem('currentUserId', user.user_id);  // preferred by fetch patch

        // Company (scoped first, then legacy mirrors)
        localStorage.setItem(`activeCompanyId:${user.user_id}`, companyId);
        localStorage.setItem('activeCompanyId', companyId); // legacy mirror
        localStorage.setItem('companyId', companyId);       // legacy mirror

        // Companies list (per-user)
        const initialCompanies = [{ id: companyId, name: user.name || user.email || 'My Company' }];
        localStorage.setItem(`companies:${user.user_id}`, JSON.stringify(initialCompanies));
        // Remove legacy global list so it can’t bleed across users
        localStorage.removeItem('companies');


// Roles + name
localStorage.setItem('userRoles', JSON.stringify(roles));
localStorage.setItem('userName', user.name || '');

// ✅ NEW: Fetch the company name from the /api/profile endpoint
try {
  const profileRes = await fetch(`${API_BASE}/api/profile`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  if (profileRes.ok) {
    const profile = await profileRes.json();
    if (profile?.company) {
      localStorage.setItem('companyName', profile.company);
      localStorage.setItem('activeCompanyName', profile.company);
    }
  } else {
    // fallback: use the user's own name if company missing
    localStorage.setItem('companyName', user.company || user.name || 'My Company');
  }
} catch {
  localStorage.setItem('companyName', user.company || user.name || 'My Company');
}

login();

// basic success toast
toast({
  title: '✅ Login Successful',
  description: `Welcome back, ${user.name || 'User'}!`,
});


        // ---------- CONDITIONAL "Go to Profile" TOAST ----------
        const token = data.token as string;
        const userId = user.user_id as string;
        const THRESHOLD = 60;

        // allow users to permanently dismiss the nudge
        const dismissed = localStorage.getItem(skey('onboarding:dismiss', userId)) === '1';

        // Try cached completion first
        let completion = Number(localStorage.getItem('qx:profile:completion') || 'NaN');

        if (Number.isNaN(completion)) {
          try {
            const [profR, logoR, brR] = await Promise.all([
              fetch(`${API_BASE}/api/profile`, { headers: { Authorization: `Bearer ${token}` } }),
              fetch(`${API_BASE}/logo`,        { headers: { Authorization: `Bearer ${token}` } }),
              fetch(`${API_BASE}/api/branches`,{ headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [profile, logoData, branches] = await Promise.all([
              profR.ok ? profR.json() : {},
              logoR.ok ? logoR.json().catch(() => ({})) : {},
              brR.ok ? brR.json().catch(() => []) : [],
            ]);

            completion = computeProfileCompletion(profile || {}, {
              logo: logoData?.url || null,
              branchCount: Array.isArray(branches) ? branches.length : 0,
            });

            // cache for other screens
            localStorage.setItem('qx:profile:completion', String(completion));
          } catch {
            completion = 0; // safe fallback
          }
        }

        if (!dismissed && completion < THRESHOLD) {
          toast({
            title: 'Complete your profile',
            description: 'Finish your profile to unlock invoices, payroll and documents.',
            action: (
              <ToastAction
                altText="Go"
                onClick={() => {
                  localStorage.setItem(skey('onboarding:shown', userId), '1');
                  navigate('/profile-setup');
                }}
              >
                Go to Profile
              </ToastAction>
            ),
          });
        }
        // -------------------------------------------------------

        navigate('/');
      } else {
        toast({
          title: '❌ Login Failed',
          description: data.error || 'Invalid email or password.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: '🚨 Login Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };
  // --- End Handle Login Submit ---

  // --- Handle Registration Submit (Simplified) ---
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Only require: name, surname, email, password + confirm, company name
    if (!regName || !regSurname || !regEmail || !regPassword || !regCompanyName) {
      toast({
        title: '⚠️ Registration Incomplete',
        description: 'Please fill in First Name, Last Name, Email, Password, and Company Name.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast({
        title: '🔐 Passwords do not match',
        description: 'Make sure both password fields are identical.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    try {
      const endpoint = `${API_BASE}/register`;

      // Minimal payload only
      const payload = {
        name: `${regName} ${regSurname}`.trim(),
        email: regEmail,
        password: regPassword,
        company: regCompanyName,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: '✅ Registration Successful',
          description: 'You can now log in with your new account.',
        });
        setMode('login');
        setLoginEmail(regEmail);

        // Reset registration form
        setRegName('');
        setRegSurname('');
        setRegEmail('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegCompanyName('');
      } else {
        toast({
          title: '❌ Registration Failed',
          description: data.error || 'An error occurred during registration.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: '🚨 Registration Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };
  // --- End Handle Registration Submit ---

  // --- Handle Forgot Password Submit ---
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: '📨 Check your email',
          description: 'If that address exists, we sent a reset link. It expires in 60 minutes.',
        });
        setMode('login');
        setLoginEmail(forgotEmail);
        setForgotEmail('');
      } else {
        toast({
          title: 'Could not send reset link',
          description: data.error || 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Network error',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  // --- End Handle Forgot Password Submit ---

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1f2937]">
      {/* subtle background ornaments */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />

      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-6 px-4 py-10 md:grid-cols-2">
        {/* Illustration / Brand panel */}
        <div className="hidden md:block">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
            <div className="mb-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Secure. Fast. Insightful.
              </span>
            </div>

            <h2 className="text-3xl font-bold leading-tight text-white">
              Welcome to <span className="text-fuchsia-400">QxAnalytix</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm text-white/70">
              Turn your numbers into decisions. Log in or create your account to unlock dashboards,
              forecasts, and AI-powered insights.
            </p>

            <div className="mt-8">
              <img
                src="/src/quantlogin.jpg"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                alt="QxAnalytix robot"
                className="mx-auto w/full max-w-md drop-shadow-2xl"
              />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-2xl font-semibold text-white">99.9%</p>
                <p className="text-xs text-white/60">Uptime</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-2xl font-semibold text-white">AES-256</p>
                <p className="text-xs text-white/60">Encryption</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-2xl font-semibold text-white">AI</p>
                <p className="text-xs text-white/60">Forecasts</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="w-full">
          <Card className="w-full overflow-hidden border-white/10 bg-white/90 shadow-2xl backdrop-blur dark:bg-gray-900/70">
            <CardHeader className="space-y-1 border-b border-gray-200/60 bg-gradient-to-r from-fuchsia-50 to-indigo-50 px-6 py-5 dark:from-gray-900 dark:to-gray-900 dark:border-white/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-bold">
                  {mode === 'login'
                    ? 'Login to QxAnalytix'
                    : mode === 'register'
                    ? 'Create your QxAnalytix account'
                    : 'Reset your password'}
                </CardTitle>

                {/* Pretty toggle */}
                <div className="inline-flex items-center rounded-full bg-gray-200 p-1 text-sm dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`rounded-full px-3 py-1 transition ${
                      mode === 'login'
                        ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`rounded-full px-3 py-1 transition ${
                      mode === 'register'
                        ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Register
                  </button>
                </div>
              </div>

              <CardDescription className="text-sm">
                {mode === 'login'
                  ? 'Enter your credentials to access your dashboard.'
                  : mode === 'register'
                  ? 'All fields marked * are required.'
                  : 'Enter your email to receive a reset link.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6">
              {/* --- LOGIN FORM --- */}
              {mode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email *</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password *</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowLoginPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white hover:from-fuchsia-700 hover:to-indigo-700"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white/90 dark:bg-gray-900/70 px-2 text-gray-500">Or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    onClick={() => {
                      window.location.href = `${API_BASE}/auth/google`;
                    }}
                  >
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt=""
                      className="mr-2 h-5 w-5"
                    />
                    Continue with Google
                  </Button>

                  <div className="text-center text-sm text-gray-600 dark:text-gray-300">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-400"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="text-center text-sm text-gray-600 dark:text-gray-300">
                    Don’t have an account?{' '}
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-400"
                    >
                      Register
                    </button>
                  </div>
                </form>
              )}
              {/* --- END LOGIN FORM --- */}

              {/* --- REGISTRATION FORM (Simplified) --- */}
              {mode === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">First Name *</Label>
                      <Input
                        id="reg-name"
                        type="text"
                        placeholder="John"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-surname">Last Name *</Label>
                      <Input
                        id="reg-surname"
                        type="text"
                        placeholder="Doe"
                        value={regSurname}
                        onChange={(e) => setRegSurname(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email Address *</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="john.doe@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password *</Label>
                      <div className="relative">
                        <Input
                          id="reg-password"
                          type={showRegPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          required
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowRegPassword((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reg-confirm-password">Confirm Password *</Label>
                      <div className="relative">
                        <Input
                          id="reg-confirm-password"
                          type={showRegConfirmPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          required
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowRegConfirmPassword((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {showRegConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-company-name">Company Name *</Label>
                    <Input
                      id="reg-company-name"
                      type="text"
                      placeholder="Acme Pty Ltd"
                      value={regCompanyName}
                      onChange={(e) => setRegCompanyName(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white hover:from-fuchsia-700 hover:to-indigo-700"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      'Register'
                    )}
                  </Button>

                  <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-400"
                    >
                      Login
                    </button>
                  </p>
                </form>
              )}
              {/* --- END REGISTRATION FORM --- */}

              {/* --- FORGOT PASSWORD FORM --- */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgotSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white hover:from-fuchsia-700 hover:to-indigo-700"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending link...
                      </>
                    ) : (
                      'Send reset link'
                    )}
                  </Button>

                  <div className="text-center text-sm text-gray-600 dark:text-gray-300">
                    Remembered your password?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-400"
                    >
                      Back to login
                    </button>
                  </div>
                </form>
              )}
              {/* --- END FORGOT PASSWORD FORM --- */}
            </CardContent>
          </Card>

          {/* Tiny footer */}
          <p className="mt-6 text-center text-xs text-white/60">
            By continuing, you agree to our{' '}
            <Link to="#" className="underline decoration-fuchsia-400/60 decoration-2 underline-offset-4">
              Terms
            </Link>{' '}
            &{' '}
            <Link to="#" className="underline decoration-fuchsia-400/60 decoration-2 underline-offset-4">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// ❌ removed the global "force onboarding" line
// localStorage.setItem('qx:onboarding:show', '1');

export const getUserId = () => localStorage.getItem('userId');
export const getCompanyId = () => localStorage.getItem('companyId');
export const getUserRoles = (): string[] => JSON.parse(localStorage.getItem('userRoles') || '[]');
export const getUserName = () => localStorage.getItem('userName');
export const isUserAdmin = () => getUserRoles().includes('admin');
