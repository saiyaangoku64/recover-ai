import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/StatusScreens';
import { AuthProvider } from './context/AuthContext';
import { RecoveryProvider } from './context/RecoveryContext';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/layout/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { QueuePage } from './pages/QueuePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PtpPage } from './pages/PtpPage';
import { PolicyPage } from './pages/PolicyPage';
import { AuditPage } from './pages/AuditPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CheckoutPage } from './pages/CheckoutPage';
import './App.css';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route
                element={
                  <RecoveryProvider>
                    <AppShell />
                  </RecoveryProvider>
                }
              >
                <Route path="/" element={<OverviewPage />} />
                <Route path="/queue" element={<QueuePage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="/ptp" element={<PtpPage />} />
                <Route path="/policy" element={<PolicyPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/campaigns" element={<CampaignsPage />} />
              </Route>
              <Route
                path="/checkout/:paymentId"
                element={
                  <RecoveryProvider>
                    <CheckoutPage />
                  </RecoveryProvider>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
