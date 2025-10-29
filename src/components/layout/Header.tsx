import React, { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

type HeaderProps = {
  title?: string;
  subtitle?: string;
  rightExtra?: React.ReactNode;
  showActions?: boolean;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  onAdd?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

function readActiveCompanyName(): string {
  const uid =
    localStorage.getItem('currentUserId') ||
    localStorage.getItem('user_id') ||
    '';

  // Fast paths (set on login + switch)
  const direct =
    localStorage.getItem('activeCompanyName') ||
    localStorage.getItem('companyName');
  if (direct) return direct;

  // Scoped lists (your sidebar stores these)
  try {
    const activeId =
      localStorage.getItem(`activeCompanyId:${uid}`) ||
      localStorage.getItem('activeCompanyId') ||
      localStorage.getItem('companyId') ||
      '';
    const companiesRaw =
      localStorage.getItem(`companies:${uid}`) ||
      localStorage.getItem('companies') || '[]';
    const companies = JSON.parse(companiesRaw) as Array<{ id: string; name: string }>;
    const match = companies.find(c => c.id === activeId);
    if (match?.name) return match.name;
  } catch {
    // ignore parse errors
  }

  return 'My Company';
}

export function Header({
  title,
  subtitle,
  rightExtra,
  showActions = true,
  actions,
  onRefresh,
  onAdd,
  className,
  style,
}: HeaderProps) {
  const [companyName, setCompanyName] = useState<string>(() => readActiveCompanyName());

  // Keep in sync with app-wide switches and cross-tab updates
  useEffect(() => {
    const refresh = () => setCompanyName(readActiveCompanyName());

    // Fired by your AppSidebar after successful switch
    window.addEventListener('company:changed', refresh);
    // Cross-tab/localStorage updates
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('company:changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Optional: if token changes, try a light profile fetch to refresh the cached name
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Only fetch if we currently have the generic fallback
    if (companyName && companyName !== 'My Company') return;

    const API_BASE =
      // keep this consistent with the rest of the app
      (import.meta as any)?.env?.VITE_API_BASE ||
      'https://quantnow-sa1e.onrender.com';

    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const prof = await r.json();
        if (prof?.company) {
          localStorage.setItem('companyName', prof.company);
          localStorage.setItem('activeCompanyName', prof.company);
          // trigger local update (no full reload)
          setCompanyName(prof.company);
        }
      } catch {
        // ignore
      }
    })();
  }, [companyName]);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else window.location.reload();
  };

  return (
    <motion.header
      className={[
        'flex items-center justify-between gap-3 p-4 border-b',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'sticky top-0 z-40',
        className || '',
      ].join(' ')}
      style={style}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Left: burger + title */}
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger />
        <div className="flex flex-col min-w-0">
          {!!title && <h1 className="text-xl font-semibold truncate">{title}</h1>}
          {!!subtitle && (
            <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {!!rightExtra && <div className="flex items-center gap-2">{rightExtra}</div>}

        {actions ? (
          actions
        ) : (
          showActions && (
            <Button
              size="small"
              onClick={handleRefresh}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </Button>
          )
        )}

        {/* Company name on far right */}
        <span className="ml-4 text-sm font-medium text-gray-600 dark:text-gray-300 truncate max-w-[240px]">
          {companyName}
        </span>
      </div>
    </motion.header>
  );
}

export default Header;
