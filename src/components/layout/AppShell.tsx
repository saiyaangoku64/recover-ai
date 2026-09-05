import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Scale,
  ScrollText,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRecovery } from '../../context/RecoveryContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ErrorScreen, LoadingScreen } from '../StatusScreens';
import { DecisionDrawer } from '../DecisionDrawer';
import { CognitiveInspector } from '../CognitiveInspector';
import { WhatsAppSimulator } from '../WhatsAppSimulator';
import { useState } from 'react';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/queue', label: 'Queue', icon: ClipboardList },
  { to: '/payments', label: 'Payments', icon: Activity },
  { to: '/ptp', label: 'Promise-to-pay', icon: Handshake },
  { to: '/policy', label: 'Policy', icon: Scale },
  { to: '/campaigns', label: 'Campaigns', icon: Rocket },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
];

function pageTitle(pathname: string) {
  const hit = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return hit?.label ?? 'Recovery ops';
}

export function AppShell() {
  const { operator, signOut, configured } = useAuth();
  const {
    loading,
    error,
    reload,
    lastEvaluatedAt,
    openrouterKey,
    sarvamKey,
    sourceLabel,
    auditLog,
    waModalPayment,
    setWaModalPayment,
    refreshAudit,
  } = useRecovery();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  if (loading) return <LoadingScreen message="Loading failed payments…" />;
  if (error) return <ErrorScreen message={error} onRetry={reload} />;

  return (
    <div className="ops-shell">
      <aside className={`ops-sidebar ${navOpen ? 'open' : ''}`}>
        <div className="ops-brand">
          <img src="/brand-icon.png" alt="" className="brand-logo-img" aria-hidden width={32} height={32} />
          <div>
            <div className="brand-title">REVIVE<span>-AI</span></div>
            <div className="brand-subtitle">Track 03 · Revenue agent</div>
          </div>
        </div>

        <nav className="ops-nav" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `ops-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setNavOpen(false)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="ops-main">
        <header className="ops-header">
          <button
            type="button"
            className="ops-menu-btn"
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((v) => !v)}
          >
            <Menu size={18} />
          </button>
          <div className="ops-header-title">
            <h1>{pageTitle(location.pathname)}</h1>
            <p>
              {operator?.email}
              {operator?.demo ? ' · local operator' : ''}
              {lastEvaluatedAt
                ? ` · last evaluation ${lastEvaluatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                : ' · no evaluations yet'}
            </p>
          </div>
          <div className="nav-badges">
            <span className={`status-badge ${isSupabaseConfigured() ? 'live' : 'simulated'}`}>
              {isSupabaseConfigured() ? `Audit live (${auditLog.length})` : 'Local audit'}
            </span>
            <span className={`status-badge ${openrouterKey ? 'model' : 'simulated'}`}>
              {openrouterKey ? 'AI connected' : 'Heuristic only'}
            </span>
            <span className={`status-badge ${sarvamKey ? 'voice' : 'simulated'}`}>
              <Volume2 size={12} />
              {sarvamKey ? 'Sarvam connected' : 'Browser TTS'}
            </span>
            <span className="status-badge simulated">{sourceLabel}</span>
            {configured && (
              <button type="button" className="ghost-btn" onClick={() => signOut()} aria-label="Sign out">
                <LogOut size={14} />
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className="ops-content">
          <Outlet />
        </main>
      </div>

      <DecisionDrawer />
      <CognitiveInspector />
      {waModalPayment && (
        <WhatsAppSimulator
          payment={waModalPayment}
          onClose={() => setWaModalPayment(null)}
          onPTPRecorded={() => { void refreshAudit(); }}
        />
      )}
    </div>
  );
}
