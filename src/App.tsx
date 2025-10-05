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
// ✅ Unified Auth Page (Login + Register)
import { AuthPage, AuthProvider, useAuth } from './AuthPage';
import { Header } from './components/layout/Header';

// NEW: Import POS sub-pages from the recommended structure
import POSScreen from './pages/POS';
import ProductsPage from './pages/pos/ProductsPage';
import CreditPaymentsScreen from './pages/pos/CreditPaymentsScreen';
import CashInScreen from './pages/pos/CashInScreen';
import OAuthCallback from './pages/OAuthCallback';
import VerifyEmail from './pages/VerifyEmail';

// ✅ PrivateRoute wrapper
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  // ✅ Role-based route protection
  const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ 
    children, 
    allowedRoles 
  }) => {
    const { isAuthenticated, userRoles } = useAuth();
    
    if (!isAuthenticated) {
      return <Navigate to="/login" />;
    }
    
    if (!allowedRoles || allowedRoles.length === 0) {
      return <>{children}</>;
    }
    
    const hasAccess = userRoles?.some((role: string) => allowedRoles.includes(role));
    
    if (!hasAccess) {
      return <Navigate to="/unauthorized" replace />;
    }
    
    return <>{children}</>;
  };

  // ✅ Unauthorized page component

const Unauthorized = () => (
  <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
    {/* ✅ Reuse the exact same Header */}
    <Header title="Welcome" />

    <div className="flex items-center justify-center mt-10">
      <div className="text-center max-w-lg">
        <p className="text-gray-600 text-lg">
          Welcome to <span className="font-semibold">QxAnalytix</span>.  
          Please select any of the tabs on the left to get started.
        </p>
      </div>
    </div>
  </div>
);

  return (
    <div className="min-h-screen flex w-full">
      {isAuthenticated && <AppSidebar />}
      <SidebarInset className="flex-1">
        <FinancialsProvider>
          <Routes>
            {/* ✅ Unified Login/Register Page */}
            <Route path="/login" element={<AuthPage />} />

            {/* ✅ Protected Routes with role restrictions */}
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute allowedRoles={['admin','user','dashboard','ceo', 'manager', 'cashier']}>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/financials" element={<PrivateRoute><Financials /></PrivateRoute>} />
            <Route path="/analytics" element={<PrivateRoute><AnalyticsHub /></PrivateRoute>} />
            <Route path="/analytics/:dashKey" element={<PrivateRoute><AnalyticsDashboard /></PrivateRoute>} />
            <Route path="/import" element={<PrivateRoute><ImportScreen /></PrivateRoute>} />
            <Route path="/invoice-quote" element={<PrivateRoute><InvoiceQuote /></PrivateRoute>} />
            <Route path="/payroll" element={<PrivateRoute><PayrollDashboard /></PrivateRoute>} />
            <Route path="/quant-chat" element={<PrivateRoute><QuantChat /></PrivateRoute>} />
            <Route path="/projections" element={<PrivateRoute><Projections /></PrivateRoute>} />
            <Route path="/accounting" element={<PrivateRoute><Accounting /></PrivateRoute>} />
            <Route path="/user-management" element={<PrivateRoute><UserManagementPage /></PrivateRoute>} />
            <Route path="/pos" element={<PrivateRoute><POSScreen /></PrivateRoute>} />
            <Route path="/pos/products" element={<PrivateRoute><ProductsPage /></PrivateRoute>} />
            <Route path="/pos/credits" element={<PrivateRoute><CreditPaymentsScreen /></PrivateRoute>} />
            <Route path="/pos/cash" element={<PrivateRoute><CashInScreen /></PrivateRoute>} />
            <Route path="/documents" element={<PrivateRoute><DocumentManagement /></PrivateRoute>} />
            <Route path="/personel-setup" element={<PrivateRoute><PersonelSetup /></PrivateRoute>} />
            <Route path="/profile-setup" element={<PrivateRoute><ProfileSetup /></PrivateRoute>} />
            <Route path="/agent-signup" element={<PrivateRoute><AgentSignup /></PrivateRoute>} />
            <Route path="/agent-dashboard" element={<PrivateRoute><AgentDashboard /></PrivateRoute>} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/super-agent-dashboard" element={<PrivateRoute><SuperAgentDashboard /></PrivateRoute>} />
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
          <AppContent />
        </SidebarProvider>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
