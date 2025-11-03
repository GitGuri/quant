import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/AuthPage';

type Props = { anyOf: string[]; children: React.ReactNode };

export default function RequireRoles({ anyOf, children }: Props) {
  const { isAuthenticated, userRoles } = useAuth();
  const loc = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  const ok = (userRoles || []).some(r => anyOf.includes(r));
  return ok ? <>{children}</> : <Navigate to="/403" replace />;
}
