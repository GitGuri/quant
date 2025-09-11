// src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // (Link kept if you want to switch to real routes)
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
type RegistrationType = 'PTY' | 'CC' | 'NPO' | 'Sole Proprietorship' | 'Cooperative' | 'Other';
const REGISTRATION_TYPES: RegistrationType[] = ['PTY', 'CC', 'NPO', 'Sole Proprietorship', 'Cooperative', 'Other'];
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
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
  'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
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
  const [regCountry, setRegCountry] = useState('South Africa'); // Default
  const [regPostalCode, setRegPostalCode] = useState('');
  const [regPhone, setRegPhone] = useState(''); // Optional
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
      const endpoint = 'https://quantnow-cu1v.onrender.com/login';

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

        localStorage.setItem('token', data.token);
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', user.user_id);
        localStorage.setItem('companyId', companyId);
        localStorage.setItem('userRoles', JSON.stringify(roles));
        localStorage.setItem('userName', user.name || '');

        login();
        toast({
          title: '✅ Login Successful',
          description: `Welcome back, ${user.name || 'User'}!`,
        });

        navigate('/');
      } else {
        toast({
          title: '❌ Login Failed',
          description: data.error || 'Invalid email or password.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error("Login error:", error);
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

    // Client-side validation for required fields
    if (
      !regName || !regSurname || !regEmail || !regPassword ||
      !regCompanyName || !regRegistrationType || regCompanySize === '' ||
      !regTitle || !regGender || !regAddress || !regCity ||
      !regProvince || !regCountry || !regPostalCode
    ) {
      toast({
        title: '⚠️ Registration Incomplete',
        description: 'Please fill in all required fields.',
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
      const endpoint = 'https://quantnow-cu1v.onrender.com/register';

      const payload = {
        name: `${regName} ${regSurname}`.trim(),
        email: regEmail,
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
        setRegRegistrationType('');
        setRegCompanySize('');
        setRegTitle('');
        setRegGender('');
        setRegAddress('');
        setRegCity('');
        setRegProvince('');
        setRegCountry('South Africa');
        setRegPostalCode('');
        setRegPhone('');
      } else {
        toast({
          title: '❌ Registration Failed',
          description: data.error || 'An error occurred during registration.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error("Registration error:", error);
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {mode === 'login' ? 'Login to QxAnalytix' : 'Register for QxAnalytix'}
          </CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Enter your credentials to access your dashboard.'
              : 'Create an account to get started. All fields marked * are required.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* --- LOGIN FORM --- */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email *</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
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
                  />
                  <button
                    type="button"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowLoginPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Login'
                )}
              </Button>

              <div className="text-sm text-center mt-4">
                Don’t have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-blue-600 hover:underline"
                >
                  Register
                </button>
              </div>
            </form>
          )}
          {/* --- END LOGIN FORM --- */}

          {/* --- REGISTRATION FORM --- */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">First Name *</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="John"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
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
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    />
                    <button
                      type="button"
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowRegPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
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
                    />
                    <button
                      type="button"
                      aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowRegConfirmPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
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
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-registration-type">Registration Type *</Label>
                  <Select
                    value={regRegistrationType}
                    onValueChange={(value) => setRegRegistrationType(value as RegistrationType)}
                    required
                  >
                    <SelectTrigger id="reg-registration-type">
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
                    onChange={(e) => setRegCompanySize(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-title">Title *</Label>
                  <Select
                    value={regTitle}
                    onValueChange={(value) => setRegTitle(value as Title)}
                    required
                  >
                    <SelectTrigger id="reg-title">
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
                    <SelectTrigger id="reg-gender">
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
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-city">City/Suburb *</Label>
                  <Input
                    id="reg-city"
                    type="text"
                    placeholder="Cape Town"
                    value={regCity}
                    onChange={(e) => setRegCity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-province">Province *</Label>
                  <Select
                    value={regProvince}
                    onValueChange={(value) => setRegProvince(value)}
                    required
                  >
                    <SelectTrigger id="reg-province">
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
                  readOnly
                  className="bg-gray-100 cursor-not-allowed"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
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

              <div className="text-sm text-center mt-4">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-blue-600 hover:underline"
                >
                  Login
                </button>
              </div>
            </form>
          )}
          {/* --- END REGISTRATION FORM --- */}
        </CardContent>
      </Card>
    </div>
  );
}


export const getUserId = () => localStorage.getItem('userId');
export const getCompanyId = () => localStorage.getItem('companyId');
export const getUserRoles = (): string[] => JSON.parse(localStorage.getItem('userRoles') || '[]');
export const getUserName = () => localStorage.getItem('userName');
export const isUserAdmin = () => getUserRoles().includes('admin');