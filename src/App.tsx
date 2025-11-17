// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './components/layout/AppSidebar';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Transactions from './pages/Transactions';
import Financials from './pages/Financials';
import AnalyticsHub from './pages/AnalyticsHub';
import ImportScreen from './pages/ImportScreen';
import InvoiceQuote from './pages/InvoiceQuote';
import QuantChat from './pages/QuantChat';
import ProfileSetup from './pages/ProfileSetup';
import NotFound from './pages/NotFound';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Projections from './pages/Projections';
import Accounting from './pages/Accounting';
import PersonelSetup from './pages/PersonelSetup';
import UserManagementPage from './pages/UserManagementPage';
import PayrollDashboard from './components/payroll/PayrollDashboard';
import { DocumentManagement } from './pages/DocumentManagement';
import { FinancialsProvider } from './contexts/FinancialsContext';
import AgentSignup from './pages/AgentSignup';
import SuperAgentDashboard from './pages/SuperAgentDashboard';
import AgentDashboard from './pages/AgentDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ResetPassword from '@/pages/ResetPassword';
import { AuthPage, AuthProvider, useAuth } from './AuthPage';
import { Header } from './components/layout/Header';
import { CurrencyProvider } from './contexts/CurrencyContext';
import POSScreen from './pages/POS';
import ProductsPage from './pages/pos/ProductsPage';
import CreditPaymentsScreen from './pages/pos/CreditPaymentsScreen';
import CashInScreen from './pages/pos/CashInScreen';
import OAuthCallback from './pages/OAuthCallback';
import VerifyEmail from './pages/VerifyEmail';
import ComplianceCentre from './pages/ComplianceCentre';
import RequireRoles from '@/components/auth/RequireRoles';
import VerifyGoodStandingPage from './pages/VerifyGoodStanding';
import PlatformUsageDashboard from './pages/PlatformUsageDashboard';
import './lib/fetch-patch';

const Forbidden = () => (
  <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
    <Header title="Access denied" />
    <div className="flex items-center justify-center mt-10">
      <div className="text-center max-w-lg">
        <h1 className="text-3xl font-bold mb-2">403 • Forbidden</h1>
        <p className="text-gray-600">
          You don’t have permission to view this page.
        </p>
      </div>
    </div>
  </div>
);

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex w-full">
      {isAuthenticated && <AppSidebar />}
      <SidebarInset className="flex-1">
        <FinancialsProvider>
          <Routes>
            {/* Public / auth */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />
            <Route path="/verify/good-standing" element={<VerifyGoodStandingPage />} />

            {/* 403 */}
            <Route path="/403" element={<Forbidden />} />

            {/* Dashboard */}
            <Route
              path="/"
              element={
                <RequireRoles anyOf={['admin','user','dashboard','ceo','manager','cashier']}>
                  <Dashboard />
                </RequireRoles>
              }
            />

            {/* Core modules */}
            <Route
              path="/tasks"
              element={
                <RequireRoles anyOf={['manager','tasks','admin','user']}>
                  <Tasks />
                </RequireRoles>
              }
            />
            <Route
              path="/transactions"
              element={
                <RequireRoles anyOf={['manager','accountant','transactions','admin','user']}>
                  <Transactions />
                </RequireRoles>
              }
            />
            <Route
              path="/financials"
              element={
                <RequireRoles anyOf={['admin','manager','user','accountant','financials']}>
                  <Financials />
                </RequireRoles>
              }
            />
            <Route
              path="/analytics"
              element={
                <RequireRoles anyOf={['admin','manager','accountant','data-analytics','user']}>
                  <AnalyticsHub />
                </RequireRoles>
              }
            />
            <Route
              path="/analytics/:dashKey"
              element={
                <RequireRoles anyOf={['admin','manager','accountant','data-analytics','user']}>
                  <AnalyticsDashboard />
                </RequireRoles>
              }
            />
            <Route
              path="/import"
              element={
                <RequireRoles anyOf={['manager','import','admin','user']}>
                  <ImportScreen />
                </RequireRoles>
              }
            />
            <Route
              path="/invoice-quote"
              element={
                <RequireRoles anyOf={['manager','accountant','invoice','admin','user']}>
                  <InvoiceQuote />
                </RequireRoles>
              }
            />
            <Route
              path="/payroll"
              element={
                <RequireRoles anyOf={['manager','payroll','accountant','admin','user']}>
                  <PayrollDashboard />
                </RequireRoles>
              }
            />
            <Route
              path="/quant-chat"
              element={
                <RequireRoles anyOf={['admin','manager','user','cashier','accountant','ceo','chat']}>
                  <QuantChat />
                </RequireRoles>
              }
            />
            <Route
              path="/projections"
              element={
                <RequireRoles anyOf={['admin','manager','accountant','projections','user']}>
                  <Projections />
                </RequireRoles>
              }
            />
            <Route
              path="/accounting"
              element={
                <RequireRoles anyOf={['admin','accountant','accounting','user','ceo']}>
                  <Accounting />
                </RequireRoles>
              }
            />
            <Route
              path="/user-management"
              element={
                <RequireRoles anyOf={['admin','ceo','user-management','user']}>
                  <UserManagementPage />
                </RequireRoles>
              }
            />
            <Route
              path="/documents"
              element={
                <RequireRoles anyOf={['admin','manager','user','cashier','accountant','ceo','documents']}>
                  <DocumentManagement />
                </RequireRoles>
              }
            />

                        <Route
              path="/compliance"
              element={
                <RequireRoles anyOf={['admin','manager','user','accountant','ceo','compliance']}>
                  <ComplianceCentre />
                </RequireRoles>
              }
            />
            <Route
              path="/personel-setup"
              element={
                <RequireRoles anyOf={['admin','manager','accountant','personel-setup','user','ceo']}>
                  <PersonelSetup />
                </RequireRoles>
              }
            />
            <Route
              path="/profile-setup"
              element={
                <RequireRoles anyOf={['admin','user','profile-setup','ceo']}>
                  <ProfileSetup />
                </RequireRoles>
              }
            />

            {/* POS */}
            <Route
              path="/pos"
              element={
                <RequireRoles anyOf={['cashier','user','pos-transact','accountant','admin']}>
                  <POSScreen />
                </RequireRoles>
              }
            />
            <Route
              path="/pos/products"
              element={
                <RequireRoles anyOf={['manager','pos-admin','accountant','user','admin','ceo']}>
                  <ProductsPage />
                </RequireRoles>
              }
            />
            <Route
              path="/pos/credits"
              element={
                <RequireRoles anyOf={['manager','pos-admin','accountant','user','admin']}>
                  <CreditPaymentsScreen />
                </RequireRoles>
              }
            />
            <Route
              path="/pos/cash"
              element={
                <RequireRoles anyOf={['manager','pos-admin','accountant','user','admin']}>
                  <CashInScreen />
                </RequireRoles>
              }
            />
            <Route
              path="/usage"
              element={
                <RequireRoles anyOf={['DEV']}>
                  <PlatformUsageDashboard />
                </RequireRoles>
              }
            />

            {/* Zororo */}
            <Route
              path="/agent-signup"
              element={
                <RequireRoles anyOf={['agent','super-agent','admin','user']}>
                  <AgentSignup />
                </RequireRoles>
              }
            />
            <Route
              path="/agent-dashboard"
              element={
                <RequireRoles anyOf={['agent','admin','user']}>
                  <AgentDashboard />
                </RequireRoles>
              }
            />
            <Route
              path="/super-agent-dashboard"
              element={
                <RequireRoles anyOf={['super-agent','admin','user']}>
                  <SuperAgentDashboard />
                </RequireRoles>
              }
            />

            {/* Fallbacks */}
            <Route path="/unauthorized" element={<Navigate to="/403" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </FinancialsProvider>
      </SidebarInset>
    </div>
  );
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <AuthProvider>
        <SidebarProvider>
          <CurrencyProvider>
            <AppContent />
          </CurrencyProvider>
        </SidebarProvider>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
