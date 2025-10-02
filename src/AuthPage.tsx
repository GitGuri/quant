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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

// ✅ Dynamic base URL (uses Vite env if set, else your Render backend)
const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE ?? 'https://quantnow-sa1e.onrender.com';

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
    setIsAuthenticated(false);
    setUserRoles([]);
    setUserName(null);
    localStorage.clear();
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

// --- Define Registration Types ---
type RegistrationType =
  | 'PTY'
  | 'CC'
  | 'NPO'
  | 'Sole Proprietorship'
  | 'Cooperative'
  | 'Other';
const REGISTRATION_TYPES: RegistrationType[] = [
  'PTY',
  'CC',
  'NPO',
  'Sole Proprietorship',
  'Cooperative',
  'Other',
];
// --- End Define Registration Types ---

// --- Define Titles ---
type Title = 'Owner' | 'Director' | 'Manager' | 'Employee' | 'Other';
const TITLES: Title[] = ['Owner', 'Director', 'Manager', 'Employee', 'Other'];
// --- End Define Titles ---

// --- Define Genders ---
type Gender = 'Male' | 'Female' | 'Non-binary' | 'Other' | 'Prefer not to say';
const GENDERS: Gender[] = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];
// --- End Define Genders ---

// --- Define Provinces ---
const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];
// --- End Define Provinces ---

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // --- Login State ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  // --- End Login State ---

  // --- Registration State (Extended) ---
  const [regName, setRegName] = useState(''); // First Name
  const [regSurname, setRegSurname] = useState(''); // Last Name
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regRegistrationType, setRegRegistrationType] = useState<RegistrationType | ''>('');
  const [regCompanySize, setRegCompanySize] = useState<number | ''>('');
  const [regTitle, setRegTitle] = useState<Title | ''>(''); // Owner/Director
  const [regGender, setRegGender] = useState<Gender | ''>('');
  const [regAddress, setRegAddress] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regProvince, setRegProvince] = useState('');
  const [regCountry, setRegCountry] = useState(''); // Default
  const [regPostalCode, setRegPostalCode] = useState('');
  const [regPhone, setRegPhone] = useState(''); // Optional
  // --- End Registration State ---

  const [isLoading, setIsLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState<{ email: string } | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
  };

  // ✅ helpers
  const normalizeEmail = (e: string) => e.trim().toLowerCase();
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // minimal client disposable set (server enforces stronger)
  const DISPOSABLE = new Set<string>([
    'mailinator.com', 'yopmail.com', 'tempmail.com', 'tempmail.dev', 'guerrillamail.com',
    '10minutemail.com', 'getnada.com', 'sharklasers.com', 'trashmail.com', 'maildrop.cc'
  ]);
  const isDisposable = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    return DISPOSABLE.has(domain);
  };

  // Restore "needs verify" from query string or sessionStorage on mount
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const isUnverified = q.get('unverified') === '1' || q.get('verified') === '0';
    const emailFromQs = normalizeEmail(q.get('email') || '');

    const saved = normalizeEmail(sessionStorage.getItem('needsVerifyEmail') || '');
    const candidate = emailFromQs || saved;

    if ((isUnverified && candidate) || saved) {
      setNeedsVerify({ email: candidate || saved });
    }
  }, []);

  // ✅ resend verification email (with guard)
  const resendVerification = async (email: string) => {
    email = normalizeEmail(email);
    if (!isValidEmail(email)) {
      toast({ title: 'Enter a valid email first', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const ct = res.headers.get('content-type') || '';
      let data: any = null;
      if (ct.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        data = { error: await res.text().catch(() => '') };
      }

      if (res.ok) {
        toast({ title: '✅ Verification email sent', description: `Check your inbox: ${email}` });
        // persist banner so refresh keeps it visible
        setNeedsVerify({ email });
        sessionStorage.setItem('needsVerifyEmail', email);
      } else {
        toast({
          title: '❌ Could not send verification',
          description: data?.error || 'Try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '🚨 Network error',
        description: 'Could not send verification email.',
        variant: 'destructive',
      });
    }
  };

  // --- Handle Login Submit ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNeedsVerify(null);
    sessionStorage.removeItem('needsVerifyEmail');

    try {
      const endpoint = `${API_BASE}/login`;
      const payload = {
        email: normalizeEmail(loginEmail),
        password: loginPassword,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get('content-type') || '';
      let data: any = null;
      if (ct.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        const text = await res.text().catch(() => '');
        data = { error: text };
      }

      if (res.ok) {
        const user = data.user;
        const companyId = user.parent_user_id || user.user_id;
        const roles = Array.isArray(user.roles)
          ? user.roles
          : typeof user.role === 'string'
          ? [user.role]
          : [];

        localStorage.setItem('token', data.token);
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', user.user_id);
        localStorage.setItem('companyId', companyId);
        localStorage.setItem('userRoles', JSON.stringify(roles));
        localStorage.setItem('userName', user.name || '');

        // clear any persisted verify banner once user can log in
        sessionStorage.removeItem('needsVerifyEmail');

        login();
        toast({
          title: '✅ Login Successful',
          description: `Welcome back, ${user.name || 'User'}!`,
        });

        navigate('/');
      } else {
        // Detect unverified by code OR message text, not just JSON code
        const isUnverified =
          res.status === 403 &&
          (data?.code === 'email_not_verified' ||
            /verify|not\s*verified|unverified/i.test(data?.error || ''));

        if (isUnverified) {
          const email = normalizeEmail(loginEmail);
          setNeedsVerify({ email });
          sessionStorage.setItem('needsVerifyEmail', email);
          toast({
            title: 'Please verify your email',
            description: 'We can resend the verification.',
            variant: 'destructive',
          });
        } else if (res.status === 400 && data?.code === 'oauth_only_account') {
          toast({
            title: 'Use Google sign-in',
            description: 'This account is social login only.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: '❌ Login Failed',
            description: data?.error || `Invalid email or password. (HTTP ${res.status})`,
            variant: 'destructive',
          });
        }
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

  // --- Handle Registration Submit ---
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNeedsVerify(null);
    sessionStorage.removeItem('needsVerifyEmail');

    // Client-side validation for required fields
    if (
      !regName ||
      !regSurname ||
      !regEmail ||
      !regPassword ||
      !regCompanyName ||
      !regRegistrationType ||
      regCompanySize === '' ||
      !regTitle ||
      !regGender ||
      !regAddress ||
      !regCity ||
      !regProvince ||
      !regCountry ||
      !regPostalCode
    ) {
      toast({
        title: '⚠️ Registration Incomplete',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const email = normalizeEmail(regEmail);

    // Block disposable (but allow real/personal domains like gmail/outlook/custom)
    if (isDisposable(email)) {
      toast({
        title: '🚫 Disposable email detected',
        description: 'Please use a real email address.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Passwords must match
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

      const payload = {
        name: `${regName} ${regSurname}`.trim(),
        email,
        password: regPassword,
        company: regCompanyName,
        position: regTitle,
        phone: regPhone || null,
        address: regAddress,
        city: regCity,
        province: regProvince,
        country: regCountry,
        postal_code: regPostalCode,
        // Extended fields
        surname: regSurname,
        registrationType: regRegistrationType,
        companySize: regCompanySize,
        gender: regGender,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get('content-type') || '';
      let data: any = null;
      if (ct.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        data = { error: await res.text().catch(() => '') };
      }

      if (res.ok) {
        // Assume backend requires email verification: show banner + flip to login
        setNeedsVerify({ email });
        sessionStorage.setItem('needsVerifyEmail', email);
        toast({
          title: '✅ Registration Successful',
          description: 'Check your inbox to verify your email before logging in.',
        });
        setMode('login');
        setLoginEmail(email);

        // Reset registration form
        setRegName('');
        setRegSurname('');
        setRegEmail('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegCompanyName('');
        setRegRegistrationType('');
        setRegCompanySize('');
        setRegTitle('');
        setRegGender('');
        setRegAddress('');
        setRegCity('');
        setRegProvince('');
        setRegCountry('');
        setRegPostalCode('');
        setRegPhone('');
      } else {
        toast({
          title: '❌ Registration Failed',
          description: data?.error || 'An error occurred during registration.',
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1f2937]">
      {/* subtle background ornaments */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />

      {/* Page shell */}
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

            {/* Robot / hero image */}
            <div className="mt-8">
              <img
                src="/src/quantlogin.jpg"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                alt="QxAnalytix robot"
                className="mx-auto w-full max-w-md drop-shadow-2xl"
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
                  {mode === 'login' ? 'Login to QxAnalytix' : 'Create your QxAnalytix account'}
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
                  : 'All fields marked * are required.'}
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

                  {/* Submit (email/password) */}
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

                  {/* Divider */}
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white/90 dark:bg-gray-900/70 px-2 text-gray-500">Or</span>
                    </div>
                  </div>

                  {/* Google OAuth button */}
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

                  {/* Always-visible resend control on Login */}
                  <div className="text-center text-xs text-gray-600 dark:text-gray-300">
                    Didn’t get the verification email?
                    <Button
                      type="button"
                      variant="outline"
                      className="ml-2 h-8"
                      disabled={!isValidEmail(normalizeEmail(loginEmail)) || isLoading}
                      onClick={() => resendVerification(normalizeEmail(loginEmail))}
                    >
                      Resend
                    </Button>
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

              {/* --- REGISTRATION FORM --- */}
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

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-registration-type">Registration Type *</Label>
                      <Select
                        value={regRegistrationType}
                        onValueChange={(value) => setRegRegistrationType(value as RegistrationType)}
                        required
                      >
                        <SelectTrigger id="reg-registration-type" className="h-11">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {REGISTRATION_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-company-size">Company Size (Employees) *</Label>
                      <Input
                        id="reg-company-size"
                        type="number"
                        min="1"
                        placeholder="e.g., 10"
                        value={regCompanySize}
                        onChange={(e) =>
                          setRegCompanySize(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        required
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-title">Title *</Label>
                      <Select value={regTitle} onValueChange={(value) => setRegTitle(value as Title)} required>
                        <SelectTrigger id="reg-title" className="h-11">
                          <SelectValue placeholder="Select title" />
                        </SelectTrigger>
                        <SelectContent>
                          {TITLES.map((title) => (
                            <SelectItem key={title} value={title}>
                              {title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-gender">Gender *</Label>
                      <Select
                        value={regGender}
                        onValueChange={(value) => setRegGender(value as Gender)}
                        required
                      >
                        <SelectTrigger id="reg-gender" className="h-11">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((gender) => (
                            <SelectItem key={gender} value={gender}>
                              {gender}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-phone">Contact Number</Label>
                    <Input
                      id="reg-phone"
                      type="tel"
                      placeholder="+27 12 345 6789"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-address">Physical Address *</Label>
                    <Input
                      id="reg-address"
                      type="text"
                      placeholder="123 Main Street"
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="reg-city">City/Suburb *</Label>
                      <Input
                        id="reg-city"
                        type="text"
                        placeholder="Cape Town"
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-province">Province *</Label>
                      <Select value={regProvince} onValueChange={(value) => setRegProvince(value)} required>
                        <SelectTrigger id="reg-province" className="h-11">
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVINCES.map((province) => (
                            <SelectItem key={province} value={province}>
                              {province}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-postal-code">Postal Code *</Label>
                      <Input
                        id="reg-postal-code"
                        type="text"
                        placeholder="8001"
                        value={regPostalCode}
                        onChange={(e) => setRegPostalCode(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-country">Country</Label>
                    <Input
                      id="reg-country"
                      type="text"
                      value={regCountry}
                      onChange={(e) => setRegCountry(e.target.value)}
                      className="h-11 bg-gray-100/80 text-gray-600 dark:bg-gray-800/50 dark:text-gray-300"
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

              {/* ✅ Verify banner (shown after register or when login blocked by verification) */}
              {needsVerify && (
                <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">
                      We’ve sent a verification link to{' '}
                      <span className="font-medium">{needsVerify.email}</span>. Please verify to
                      continue. Didn’t get it?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8"
                      onClick={() => resendVerification(needsVerify.email)}
                    >
                      Resend email
                    </Button>
                  </div>
                </div>
              )}
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

export const getUserId = () => localStorage.getItem('userId');
export const getCompanyId = () => localStorage.getItem('companyId');
export const getUserRoles = (): string[] => JSON.parse(localStorage.getItem('userRoles') || '[]');
export const getUserName = () => localStorage.getItem('userName');
export const isUserAdmin = () => getUserRoles().includes('admin');
