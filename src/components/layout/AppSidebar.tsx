import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  Home, CreditCard, BarChart3, Upload, TrendingUp, FileText, MessageSquare,
  FolderOpen, Calculator, Users, Settings, User, LogOut, Package, DollarSign,
  Wallet, ChevronUp, ChevronDown, ListStartIcon, UserPlus, UserCheck, Users2, Bot,
  Building2, ChevronsUpDown
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
  SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar';
import { motion } from 'framer-motion'; // Framer Motion is already imported
import { MoneyCollectFilled } from '@ant-design/icons';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/AuthPage';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQxVoice } from '../../lib/useQxVoice';
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';
const NONE = '__none__';

// ---------- Nav data ----------
interface NavigationItem {
  title: string;
  url: string;
  icon: React.ElementType | any;
  children?: NavigationItem[];
  allowedRoles?: string[];
}
const navigationItems: NavigationItem[] = [
  { title: 'Dashboard', url: '/', icon: Home, allowedRoles: ['admin', 'ceo', 'manager', 'dashboard','cashier','accountant', 'user'] },
  { title: 'POS Transact', url: '/pos', icon: CreditCard, allowedRoles: ['cashier', 'user', 'pos-transact','accountant', 'admin'] },
  { title: 'Import', url: '/import', icon: Upload, allowedRoles: ['manager', 'import', 'user', 'admin'] },
  { title: 'Tasks', url: '/tasks', icon: ListStartIcon, allowedRoles: ['manager', 'user', 'tasks', 'admin'] },
  { title: 'Transactions', url: '/transactions', icon: CreditCard, allowedRoles: ['manager', 'user','accountant', 'transactions', 'admin'] },
  { title: 'Financials', url: '/financials', icon: BarChart3, allowedRoles: ['admin', 'manager','accountant', 'financials', 'user'] },
  { title: 'CRM', url: '/personel-setup', icon: Users, allowedRoles: ['admin', 'manager','accountant', 'personel-setup', 'user', 'ceo'] },
  { title: 'Data Analytics', url: '/analytics', icon: TrendingUp, allowedRoles: ['admin', 'manager','accountant', 'data-analytics', 'user'] },
];
const businessItems: NavigationItem[] = [
  { title: 'Invoice/Quote', url: '/invoice-quote', icon: FileText, allowedRoles: ['manager', 'user','accountant', 'invoice', 'admin'] },
  { title: 'Payroll', url: '/payroll', icon: Calculator, allowedRoles: ['manager', 'payroll','accountant', 'user', 'admin'] },
  {
    title: 'POS Admin',
    url: '/pos/products',
    icon: CreditCard,
    allowedRoles: ['manager', 'pos-admin', 'user','accountant', 'admin', 'ceo'],
    children: [
      { title: 'Products and Services', url: '/pos/products', icon: Package, allowedRoles: ['manager', 'pos-admin','accountant', 'user', 'admin'] },
      { title: 'Credit Payments', url: '/pos/credits', icon: DollarSign, allowedRoles: ['manager', 'pos-admin','accountant', 'user', 'admin'] },
      { title: 'Cash In', url: '/pos/cash', icon: Wallet, allowedRoles: ['manager', 'pos-admin','accountant', 'user', 'admin'] },
    ],
  },
  { title: 'Projections', url: '/projections', icon: TrendingUp, allowedRoles: ['admin', 'manager','accountant', 'projections', 'user'] },
  { title: 'Accounting Setup', url: '/accounting', icon: Calculator, allowedRoles: ['admin', 'accountant', 'accounting', 'user', 'ceo'] },
  { title: 'Document Management', url: '/documents', icon: FolderOpen, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'documents'] },
  { title: 'Compliance Centre', url: '/compliance', icon: FolderOpen, allowedRoles: ['compliance'] },
  { title: 'Qx Chat', url: '/quant-chat', icon: MessageSquare, allowedRoles: ['admin', 'manager', 'user', 'cashier', 'accountant', 'ceo', 'chat'] },
];
const setupItems: NavigationItem[] = [
  { title: 'User Management', url: '/user-management', icon: Users, allowedRoles: ['admin', 'ceo', 'user-management', 'user'] },
  { title: 'Profile Setup', url: '/profile-setup', icon: Settings, allowedRoles: ['admin', 'user', 'profile-setup', 'ceo'] },
];
const zororoItems: NavigationItem[] = [
  { title: 'Register Person', url: '/agent-signup', icon: UserPlus, allowedRoles: ['agent', 'super-agent', 'admin', 'user'] },
  { title: 'My Dashboard', url: '/agent-dashboard', icon: UserCheck, allowedRoles: ['agent', 'admin', 'user'] },
  { title: 'Agents Overview', url: '/super-agent-dashboard', icon: Users2, allowedRoles: ['super-agent', 'admin', 'user']},
];

type ActiveWashBGProps = {
  /** how far the shadow visually extends (px) */
  bleed?: number; // e.g. 8–12 usually looks right
  baseRadius?: number; // radius of the target element in px (rounded-md ~ 6)
};

const ActiveWashBG: React.FC<ActiveWashBGProps> = ({
  bleed = 10,
  baseRadius = 6,
}) => (
  <motion.span
    layoutId="activeWash"
    className="absolute pointer-events-none"
    style={{
      // expand to cover the shadow area
      inset: `-${bleed}px`,
      borderRadius: `${baseRadius + bleed}px`,
      background:
        "linear-gradient(90deg, rgba(99,102,241,0.25) 0%, rgba(168,85,247,0.22) 45%, rgba(236,72,153,0.20) 70%)",
      // keep the same look; you can increase blur since we expanded the element
      boxShadow:
        "inset 0 0 0 1px rgba(236,72,153,0.15), 0 10px 18px rgba(99,102,241,0.10)",
      zIndex: 0,
      willChange: "transform",
    }}
    transition={{ type: "spring", stiffness: 420, damping: 34 }}
  />
);



  // Hook to calculate the position of the active link
 // Depend on path and sidebar state

  // Use the extracted railTop/railHeight states to animate the rail

// ----------------------------------------------------------------------

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout, userName, userRoles } = useAuth();
  const currentPath = location.pathname;

  // Ref for the scrollable SidebarContent container
  const sidebarContentRef = useRef<HTMLDivElement>(null); 

  const [isPosSubMenuOpen, setIsPosSubMenuOpen] = useState(false);
  const [isPosAdminSubMenuOpen, setIsPosAdminSubMenuOpen] = useState(false);
  // ---------- Profile completion (ignores branches, VAT, LinkedIn, Website) ----------
  const [profileCompletion, setProfileCompletion] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Fetch profile + logo in parallel
        const [profR, logoR] = await Promise.all([
          fetch(`${API_BASE_URL}/api/profile`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE_URL}/logo`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const profile = profR.ok ? await profR.json() : {};
        const logoData = logoR.ok ? await logoR.json().catch(() => ({})) : {};

        // Count only essential fields
        const checks = [
          !!profile?.name,
          !!profile?.company,
          !!profile?.email,
          !!profile?.phone,
          !!profile?.address,
          !!profile?.city,
          !!profile?.province,
          !!profile?.country,
          !!logoData?.url,
        ];

        const done = checks.filter(Boolean).length;
        const percent = Math.round((done / checks.length) * 100);
        setProfileCompletion(percent);
        localStorage.setItem('qx:profile:completion', String(percent));
      } catch {
        // leave as 0 if something fails
      }
    })();
  }, []);

  // Small SVG progress ring that wraps children in the center
  const ProgressRing: React.FC<{
    percent: number;
    size?: number;
    stroke?: number;
    className?: string;
    title?: string;
    onClick?: () => void;
    children?: React.ReactNode;
  }> = ({ percent, size = 28, stroke = 3, className = '', title, onClick, children }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const p = Math.min(100, Math.max(0, percent || 0));
    const dash = (p / 100) * c;

    return (
      <div
        className={`relative inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        title={title}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-gray-200 dark:text-gray-800"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#qxgrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ transition: 'stroke-dasharray 400ms ease' }}
          />
          <defs>
            <linearGradient id="qxgrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a21caf" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
        </svg>

        <div
          className="absolute inset-0 m-[4px] rounded-lg flex items-center justify-center
                      bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold text-xs select-none"
        >
          {children}
        </div>
      </div>
    );
  };

  // Current logged in user id (set by your Auth flow on login)
  const currentUserId =
    localStorage.getItem('currentUserId') ||
    localStorage.getItem('user_id') ||
    '';

  // Also read email (optional future allowlist by email)
  const currentUserEmail =
    localStorage.getItem('email') ||
    localStorage.getItem('user_email') ||
    '';

  // ---------- AI access control ----------
  const AI_ALLOWED_USER_IDS = new Set<string>([
    '9f138221-a90d-496e-8c8f-7f733d55ba56',
  ]);
  const AI_ALLOWED_EMAILS = new Set<string>([]);
  const canSeeAI =
    AI_ALLOWED_USER_IDS.has(currentUserId) ||
    AI_ALLOWED_EMAILS.has(currentUserEmail);

  // Helpers to scope keys by user
  const skey = (k: string) => (currentUserId ? `${k}:${currentUserId}` : k);
  const readJSON = <T,>(k: string, fallback: T): T => {
    try { const s = localStorage.getItem(k); return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
  };

  // AI widget
  const [isAIWidgetVisible, setIsAIWidgetVisible] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const AGENT_ID = 'agent_3201k6ctv6svfswth3c8d2n9scv2';

  // Ensure AI closes if permissions change
  useEffect(() => {
    if (!canSeeAI && isAIWidgetVisible) setIsAIWidgetVisible(false);
  }, [canSeeAI, isAIWidgetVisible]);

  // Companies (scoped)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    readJSON(skey('companies'), [])
  );
  const [activeCompanyId, setActiveCompanyId] = useState<string>(
    localStorage.getItem(skey('activeCompanyId')) ||
    localStorage.getItem('activeCompanyId') ||
    localStorage.getItem('companyId') || ''
  );
  const [compareCompanyId, setCompareCompanyId] = useState<string>(
    localStorage.getItem(skey('compareCompanyId')) || ''
  );

  // Compact switcher popover
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Ensure "own company" exists so Select always has something
  useEffect(() => {
    const selfId =
      localStorage.getItem(skey('activeCompanyId')) ||
      localStorage.getItem('companyId') ||
      currentUserId || '';
    const selfName =
      localStorage.getItem('companyName') ||
      localStorage.getItem('name') ||
      'My Company';

    if (selfId && !companies.some(c => c.id === selfId)) {
      const next = [{ id: selfId, name: selfName }, ...companies];
      setCompanies(next);
      localStorage.setItem(skey('companies'), JSON.stringify(next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If no active selected, pick first
  useEffect(() => {
    if (!activeCompanyId && companies.length) {
      const first = companies[0].id;
      setActiveCompanyId(first);
      localStorage.setItem(skey('activeCompanyId'), first);
      localStorage.setItem('activeCompanyId', first);
      localStorage.setItem('companyId', first);
    }
  }, [activeCompanyId, companies]);

  // Fetch scoped companies from server — REPLACE, don't merge. Also validate activeCompanyId.
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const r = await fetch(`${API_BASE_URL}/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (!r.ok || !data?.companies) return;

        const serverCompanies: { id: string; name: string }[] = data.companies;

        // only trust server list
        setCompanies(serverCompanies);
        localStorage.setItem(skey('companies'), JSON.stringify(serverCompanies));

        // reset active if it's not allowed anymore
        const stillAllowed = serverCompanies.some(c => c.id === activeCompanyId);
        if (!stillAllowed) {
          const next = serverCompanies[0]?.id || '';
          setActiveCompanyId(next);
          localStorage.setItem(skey('activeCompanyId'), next);
          localStorage.setItem('activeCompanyId', next);
          localStorage.setItem('companyId', next);
          if (compareCompanyId === next) setCompare('');
          window.dispatchEvent(new Event('company:changed'));
        }
      } catch {/* ignore */}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Extra guard: whenever companies change, ensure active is valid
  useEffect(() => {
    if (!companies.length) return;
    if (!companies.some(c => c.id === activeCompanyId)) {
      const next = companies[0]?.id || '';
      setActiveCompanyId(next);
      localStorage.setItem(skey('activeCompanyId'), next);
      localStorage.setItem('activeCompanyId', next);
      localStorage.setItem('companyId', next);
      if (compareCompanyId === next) setCompare('');
      window.dispatchEvent(new Event('company:changed'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  // Submenus by route
  useEffect(() => {
    setIsPosSubMenuOpen(currentPath.startsWith('/pos/'));
    setIsPosAdminSubMenuOpen(currentPath.startsWith('/pos-admin/'));
  }, [currentPath]);

  // Cross-tab sync (scoped)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === skey('activeCompanyId') && e.newValue) setActiveCompanyId(e.newValue);
      if (e.key === skey('companies') && e.newValue) setCompanies(JSON.parse(e.newValue));
      if (e.key === skey('compareCompanyId')) setCompareCompanyId(e.newValue || '');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [currentUserId]);

  // ElevenLabs widget loader — guarded by canSeeAI
  useEffect(() => {
    if (!canSeeAI) return;
    if (!isAIWidgetVisible) {
      if (widgetContainerRef.current) widgetContainerRef.current.innerHTML = '';
      return;
    }
    if (customElements.get('elevenlabs-convai')) {
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = `<elevenlabs-convai agent-id="${AGENT_ID}"></elevenlabs-convai>`;
      }
      return;
    }
    const loadScript = () => {
      if (document.querySelector('script[src="https://unpkg.com/@elevenlabs/convai-widget-embed"]')) return;
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
      script.async = true;
      script.type = 'text/javascript';
      script.onload = () => {
        if (widgetContainerRef.current) {
          widgetContainerRef.current.innerHTML = `<elevenlabs-convai agent-id="${AGENT_ID}"></elevenlabs-convai>`;
        }
      };
      script.onerror = () => {
        if (widgetContainerRef.current) {
          widgetContainerRef.current.innerHTML = '<p style="color: red;">Failed to load AI assistant.</p>';
        }
      };
      document.head.appendChild(script);
    };
    loadScript();
    return () => { if (widgetContainerRef.current) widgetContainerRef.current.innerHTML = ''; };
  }, [isAIWidgetVisible, canSeeAI]);

  // Active nav styling - REMOVED 'relative' and 'getActiveRail' logic
const getNavCls = (active: boolean) =>
  [
    'relative flex items-center w-full rounded-md transition-colors duration-150',
    'px-3 py-2',
    active
      ? 'text-gray-900 dark:text-white font-semibold' // crisp over gradient
      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
  ].join(' ');



    
  // The 'getActiveRail' function is removed entirely.

  const hasAccess = (allowedRoles: string[] = []) =>
    !!(userRoles?.some((role) => allowedRoles.includes(role)));

  const renderSubMenu = (item: NavigationItem, isOpen: boolean, setIsOpen: (v: boolean) => void) => (
    <motion.div key={item.title} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            onClick={() => setIsOpen(!isOpen)}
            className={({ isActive }) =>
              getNavCls(isActive || currentPath.startsWith(item.url)) // Cleaned up
            }
          >
            <item.icon className='h-5 w-5' />
            {state === 'expanded' && <span className="ml-2 flex-1">{item.title}</span>}
            {state === 'expanded' && (isOpen ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />)}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {isOpen && state === 'expanded' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }} className="overflow-hidden">
          <div className="pl-6 py-1">
            {item.children?.filter((child) => hasAccess(child.allowedRoles)).map((child, childIndex) => (
              <motion.div key={child.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: childIndex * 0.05 }}>
<SidebarMenuItem>
  <SidebarMenuButton asChild>
    <NavLink to={child.url} className={({ isActive }) => getNavCls(isActive)}>
      {({ isActive }) => (
        <div className="relative flex items-center w-full">
          {isActive && <ActiveWashBG />}
          <child.icon className="h-5 w-5" />
          {state === 'expanded' && <span className="ml-2">{child.title}</span>}
        </div>
      )}
    </NavLink>
  </SidebarMenuButton>
</SidebarMenuItem>

              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );

const renderMenuItem = (item: NavigationItem, index: number, _total: number, delayBase: number) => (
  <motion.div
    key={item.title}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    whileHover={{ x: 2 }}
    transition={{ type: 'spring', stiffness: 500, damping: 40, delay: (index + delayBase) * 0.05 }}
  >
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
<NavLink to={item.url} className={({ isActive }) => getNavCls(isActive)}>
  {({ isActive }) => (
    <div className="relative flex items-center w-full">
      {isActive && <ActiveWashBG />}
      <div className="relative z-10 flex items-center">
        {item.icon === MoneyCollectFilled
          ? <MoneyCollectFilled style={{ fontSize: 20 }} />
          : <item.icon className="h-5 w-5" />
        }
        {state === 'expanded' && <span className="ml-2">{item.title}</span>}
      </div>
    </div>
  )}
</NavLink>

      </SidebarMenuButton>
    </SidebarMenuItem>
  </motion.div>
);



  // ---------------------------
  // Switch company (new token) with authorization guard
  // ---------------------------
const switchCompany = async (id: string) => {
  if (!companies.some(c => c.id === id)) {
    toast({ title: 'Not allowed', description: 'You do not have access to that company.', variant: 'destructive' });
    return;
  }

  const prevId = activeCompanyId;
  const uid =
    localStorage.getItem('currentUserId') ||
    localStorage.getItem('user_id') || '';

  // ✅ Optimistic set: IDs
  setActiveCompanyId(id);
  localStorage.setItem(skey('activeCompanyId'), id);
  localStorage.setItem('activeCompanyId', id);
  localStorage.setItem('companyId', id);
  if (compareCompanyId === id) setCompare('');

  // ✅ Optimistic set: NAME (prevents header inversion)
  const optimisticName = companies.find(c => String(c.id) === String(id))?.name || 'My Company';
  localStorage.setItem(`activeCompanyName:${uid}`, optimisticName);
  localStorage.setItem('activeCompanyName', optimisticName);
  // (Optional) keep legacy key in sync:
  localStorage.setItem('companyName', optimisticName);
  window.dispatchEvent(new Event('company:changed'));

  try {
    const r = await fetch(`${API_BASE_URL}/session/switch-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify({ company_id: id }),
    });
    const data = await r.json();
    if (!r.ok || !data?.ok || !data?.token) {
      throw new Error(data?.error || 'Failed to switch company');
    }

    localStorage.setItem('token', data.token);

    // Try to fetch canonical name for the new scope (overwrites optimistic)
    try {
      const pr = await fetch(`${API_BASE_URL}/api/profile`, { headers: { Authorization: `Bearer ${data.token}` } });
      if (pr.ok) {
        const prof = await pr.json();
        if (prof?.company) {
          localStorage.setItem(`activeCompanyName:${uid}`, prof.company);
          localStorage.setItem('activeCompanyName', prof.company);
          localStorage.setItem('companyName', prof.company);
          window.dispatchEvent(new Event('company:changed')); // notify header again
        }
      }
    } catch { /* ignore */ }

    // Final refresh under new token/scope
    window.location.reload();

  } catch (e: any) {
    // rollback
    setActiveCompanyId(prevId);
    if (prevId) {
      localStorage.setItem(skey('activeCompanyId'), prevId);
      localStorage.setItem('activeCompanyId', prevId);
      localStorage.setItem('companyId', prevId);
      const rollbackName = companies.find(c => String(c.id) === String(prevId))?.name || 'My Company';
      localStorage.setItem(`activeCompanyName:${uid}`, rollbackName);
      localStorage.setItem('activeCompanyName', rollbackName);
      localStorage.setItem('companyName', rollbackName);
      window.dispatchEvent(new Event('company:changed'));
    }
    toast({ title: 'Switch failed', description: e?.message || 'Please try again', variant: 'destructive' });
  } finally {
    setSwitcherOpen(false);
  }
};


  const setCompare = (id: string) => {
    setCompareCompanyId(id);
    if (id) localStorage.setItem(skey('compareCompanyId'), id);
    else localStorage.removeItem(skey('compareCompanyId'));
    window.dispatchEvent(new Event('company:compareChanged'));
  };

  // Link another company
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  async function linkCompany() {
    try {
      setLinkBusy(true);
      const r = await fetch(`${API_BASE_URL}/companies/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ email: linkEmail, password: linkPassword }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || 'Failed to link');

      const next = [...companies.filter(c => c.id !== data.company.id), data.company];
      setCompanies(next);
      localStorage.setItem(skey('companies'), JSON.stringify(next));

      if (!compareCompanyId) setCompare(data.company.id);

      toast({ title: 'Company linked', description: `${data.company.name} added.` });
      setLinkOpen(false);
      setLinkEmail(''); setLinkPassword('');
    } catch (e: any) {
      toast({ title: 'Failed to link', description: e?.message || 'Please check credentials', variant: 'destructive' });
    } finally {
      setLinkBusy(false);
    }
  }

  // Logout: wipe scoped + legacy keys so next login is clean
  const handleLogout = () => {
    const scopedKeys = [skey('companies'), skey('activeCompanyId'), skey('compareCompanyId')];
    scopedKeys.forEach(k => localStorage.removeItem(k));
    ['companies', 'activeCompanyId', 'compareCompanyId', 'companyId'].forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('currentUserId');
    logout();
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    navigate('/login');
  };

  const showZororoSection = hasAccess(['agent','user']) || hasAccess(['super-agent','user']);
  const activeName =
    companies.find(c => c.id === activeCompanyId)?.name ||
    (activeCompanyId ? `Current (${activeCompanyId.slice(0,6)}…)` : 'Select company');

  return (
    <>
      {/* AI widget container — only renders for the allowed user */}
      {canSeeAI && (
        <div
          ref={widgetContainerRef}
          className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ease-in-out ${isAIWidgetVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
          style={{ width: '400px', height: '500px' }}
        />
      )}

      <Sidebar className='border-r bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50'>
        <SidebarHeader className='p-3 border-b border-gray-200 dark:border-gray-700'>
          <motion.div className='w-full' initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <div className='flex items-center gap-2'>
              <ProgressRing
                percent={profileCompletion}
                size={28}
                stroke={3}
                className="cursor-pointer"
                title={`Profile ${profileCompletion}% complete`}
                onClick={() => navigate('/profile-setup')}
              >
                <span>Q</span>
              </ProgressRing>

              {state === 'expanded' && (
                <div className='flex-1 min-w-0'>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h1 className='font-semibold text-sm truncate'>QxAnalytix</h1>
                      <p className='text-[10px] text-muted-foreground leading-tight'>unlocking endless possibilities</p>
                    </div>
                    {/* Compact company switcher chip */}
                    <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
                      <PopoverTrigger asChild>
                        <button
                          className="group inline-flex items-center gap-1 max-w-[180px] truncate rounded-md border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                          title="Active company / Compare"
                        >
                          <Building2 className="h-3.5 w-3.5 opacity-80" />
                          <span className="truncate">{activeName}</span>
                          <ChevronsUpDown className="h-3 w-3 opacity-70" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-3">
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Company</div>
                            <Select
                              value={companies.some(c => c.id === activeCompanyId) ? activeCompanyId : ''}
                              onValueChange={switchCompany}
                            >
                              <SelectTrigger className="h-8 mt-1">
                                <SelectValue placeholder="Select company" />
                              </SelectTrigger>
                              <SelectContent>
                                {companies.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Compare With (optional)</div>
                            <Select
                              value={compareCompanyId ? compareCompanyId : NONE}
                              onValueChange={(v) => (v === NONE ? setCompare('') : setCompare(v))}
                            >
                              <SelectTrigger className="h-8 mt-1">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {companies
                                  .filter(c => c.id !== activeCompanyId)
                                  .map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="pt-1">
                            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                              <DialogTrigger asChild>
                                <Button variant="secondary" size="sm" className="w-full">Link another company</Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Link another company</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-3">
                                  <Input type="email" placeholder="Owner email of that account" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} />
                                  <Input type="password" placeholder="Password" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} />
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
                                  <Button onClick={linkCompany} disabled={linkBusy || !linkEmail || !linkPassword}>
                                    {linkBusy ? 'Linking…' : 'Link company'}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </SidebarHeader>

        <SidebarContent
          className='flex-1 overflow-y-auto relative' // Added 'relative' and 'ref'
          ref={sidebarContentRef}
        >
          {/* 🎯 THE ACTIVE RAIL COMPONENT 🎯 */}
          

          <SidebarGroup>
            <SidebarGroupLabel>Main Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.filter(i => hasAccess(i.allowedRoles)).map((item, idx) =>
                  item.children
                    ? renderSubMenu(item, isPosSubMenuOpen, setIsPosSubMenuOpen)
                    : renderMenuItem(item, idx, navigationItems.length, 0)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Business Tools</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {businessItems.filter(i => hasAccess(i.allowedRoles)).map((item, idx) =>
                  item.children
                    ? renderSubMenu(item, isPosAdminSubMenuOpen, setIsPosAdminSubMenuOpen)
                    : renderMenuItem(item, idx, businessItems.length, navigationItems.length)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Setup</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {setupItems.filter(i => hasAccess(i.allowedRoles)).map((item, idx) =>
                  renderMenuItem(item, idx, setupItems.length, navigationItems.length + businessItems.length)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {showZororoSection && (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>Zororo Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {zororoItems.filter(i => hasAccess(i.allowedRoles)).map((item, idx) =>
                      renderMenuItem(item, idx, zororoItems.length, navigationItems.length + businessItems.length + setupItems.length)
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}


        </SidebarContent>



  {/* Keep your profile + logout items */}
<SidebarFooter className='p-3 border-t border-gray-200 dark:border-gray-700'>
  <div className='flex items-center justify-between mb-2'>
    <div className='flex items-center space-x-2 text-sm text-muted-foreground'>
      <User className='h-5 w-5' />
      {state === 'expanded' && (
        <div className="flex flex-col">
          <span className="truncate max-w-[180px]">{userName || 'Guest'}</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
            {userRoles && userRoles.length > 0 ? userRoles.join(', ') : 'No Role'}
          </span>
        </div>
      )}
    </div>

    {canSeeAI && (
      <button
        onClick={() => setIsAIWidgetVisible(v => !v)}
        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={isAIWidgetVisible ? "Hide AI Assistant" : "Show AI Assistant"}
        title={isAIWidgetVisible ? "Hide QxBot" : "Show QxBot"}
      >
        <Bot className="h-5 w-5 text-muted-foreground" />
      </button>
    )}
  </div>

  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton onClick={handleLogout}>
        <LogOut className='h-5 w-5 text-red-500' />
        {state === 'expanded' && <span className="ml-2 text-red-500">Log Out</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarFooter>


      </Sidebar>
    </>
  );
}