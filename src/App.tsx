import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './components/layout/AppSidebar';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Transactions from './pages/Transactions';
import Financials from './pages/Financials';
import DataAnalytics from './pages/DataAnalytics';
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

// ✅ Unified Auth Page (Login + Register)
import { AuthPage, AuthProvider, useAuth } from './AuthPage';

// NEW: Import POS sub-pages from the recommended structure
import POSScreen from './pages/POS';
import ProductsPage from './pages/pos/ProductsPage';
import CreditPaymentsScreen from './pages/pos/CreditPaymentsScreen';
import CashInScreen from './pages/pos/CashInScreen';


// ✅ PrivateRoute wrapper
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex w-full">
      {isAuthenticated && <AppSidebar />}
      <SidebarInset className="flex-1">
        <FinancialsProvider>
          <Routes>
            {/* ✅ Unified Login/Register Page */}
            <Route path="/login" element={<AuthPage />} />

            {/* ✅ Protected Routes */}
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/financials" element={<PrivateRoute><Financials /></PrivateRoute>} />
            <Route path="/analytics" element={<PrivateRoute><DataAnalytics /></PrivateRoute>} />
            <Route path="/import" element={<PrivateRoute><ImportScreen /></PrivateRoute>} />
            <Route path="/invoice-quote" element={<PrivateRoute><InvoiceQuote /></PrivateRoute>} />
            <Route path="/payroll" element={<PrivateRoute><PayrollDashboard /></PrivateRoute>} />
            <Route path="/quant-chat" element={<PrivateRoute><QuantChat /></PrivateRoute>} />
            <Route path="/projections" element={<PrivateRoute><Projections /></PrivateRoute>} />
            <Route path="/accounting" element={<PrivateRoute><Accounting /></PrivateRoute>} />
            <Route path="/user-management" element={<PrivateRoute><UserManagementPage /></PrivateRoute>} />
            {/* NEW: POS and its nested routes, all protected */}
            <Route path="/pos" element={<PrivateRoute><POSScreen /></PrivateRoute>} />
            <Route path="/pos/products" element={<PrivateRoute><ProductsPage /></PrivateRoute>} />
            <Route path="/pos/credits" element={<PrivateRoute><CreditPaymentsScreen /></PrivateRoute>} />
            <Route path="/pos/cash" element={<PrivateRoute><CashInScreen /></PrivateRoute>} />
            {/* END NEW: POS and its nested routes */}

            <Route path="/documents" element={<PrivateRoute><DocumentManagement /></PrivateRoute>} />
            <Route path="/personel-setup" element={<PrivateRoute><PersonelSetup /></PrivateRoute>} />
            <Route path="/profile-setup" element={<PrivateRoute><ProfileSetup /></PrivateRoute>} />
            <Route path="/agent-signup" element={<PrivateRoute><AgentSignup /></PrivateRoute>} />
            <Route path="/agent-dashboard" element={<PrivateRoute><AgentDashboard /></PrivateRoute>} />
            <Route path="/super-agent-dashboard" element={<PrivateRoute><SuperAgentDashboard /></PrivateRoute>} />
            {/* Catch-all for undefined routes */}
            <Route path="*" element={<NotFound />} /> {/* Use your NotFound component */}
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
