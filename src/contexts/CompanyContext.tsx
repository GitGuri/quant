import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Company = {
  id: string;
  name: string;
  roles?: string[]; // roles scoped to this company
};

type CompanyContextType = {
  companies: Company[];
  activeCompanyId: string | null;
  activeCompany: Company | null;
  compareCompanyId: string | null; // optional “B” company for compare mode
  setActiveCompany: (companyId: string) => void;
  setCompareCompany: (companyId: string | null) => void;
  clearCompare: () => void;
  hasRole: (role: string) => boolean; // role check within active company
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>(
    JSON.parse(localStorage.getItem('companies') || '[]')
  );

  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(
    localStorage.getItem('activeCompanyId') || localStorage.getItem('companyId') || null
  );

  const [compareCompanyId, setCompareCompanyId] = useState<string | null>(
    localStorage.getItem('compareCompanyId') || null
  );

  // helpers
  const activeCompany = useMemo(
    () => companies.find(c => c.id === activeCompanyId) || null,
    [companies, activeCompanyId]
  );

  const setActiveCompany = (companyId: string) => {
    setActiveCompanyId(companyId);
    localStorage.setItem('activeCompanyId', companyId);
  };

  const setCompareCompany = (companyId: string | null) => {
    setCompareCompanyId(companyId);
    if (companyId) {
      localStorage.setItem('compareCompanyId', companyId);
    } else {
      localStorage.removeItem('compareCompanyId');
    }
  };

  const clearCompare = () => setCompareCompany(null);

  const hasRole = (role: string) => {
    const roles = activeCompany?.roles || [];
    return roles.includes(role);
  };

  // expose a way for Auth flow to seed companies once after login
  useEffect(() => {
    const handle = (e: CustomEvent<Company[]>) => {
      setCompanies(e.detail || []);
      localStorage.setItem('companies', JSON.stringify(e.detail || []));
      // default active if empty
      if (!activeCompanyId && e.detail?.length) {
        setActiveCompany(e.detail[0].id);
      }
    };
    // we’ll dispatch this event from AuthPage after successful login
    window.addEventListener('seed:companies' as any, handle as any);
    return () => window.removeEventListener('seed:companies' as any, handle as any);
  }, [activeCompanyId]);

  const value: CompanyContextType = {
    companies,
    activeCompanyId,
    activeCompany,
    compareCompanyId,
    setActiveCompany,
    setCompareCompany,
    clearCompare,
    hasRole,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};
