import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, Volume2, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { IconWhatsApp } from '../components/Icons';

export function LoginPage() {
  const { configured, operator, loading, signIn, continueLocally } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && operator) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim());
    setBusy(false);
    if (result.error) setError(result.error);
    else setSent(true);
  };

  return (
    <div className="login-screen pitch">
      <div className="pitch-panel">
        <div className="ops-brand login-brand">
          <div className="brand-logo-badge" aria-hidden>
            <Zap size={18} fill="#ffffff" />
          </div>
          <div className="brand-title">REVIVE<span>-AI</span></div>
        </div>
        <p className="hero-kicker">Razorpay AI Buildathon · Track 03</p>
        <h1>An agent that wins failed GMV back — and can explain why it refused.</h1>
        <p className="hero-lead">
          The brief is not “show a dashboard.” It is measured money recovered across a batch, compliant
          escalation, stopping rules, and an audit trail.
        </p>
        <ul className="pitch-points">
          <li>
            <ShieldCheck size={16} />
            <span>Policy gate after the model. Stolen cards and retry-exhausted payments never get a customer ping.</span>
          </li>
          <li>
            <IconWhatsApp width="16" height="16" />
            <span>Hinglish WhatsApp + Sarvam voice for UPI collect expiry and PTP — India-shaped recovery, not another email.</span>
          </li>
          <li>
            <Volume2 size={16} />
            <span>Full 253-payment book scored on load vs naive Smart Retry, with every decision inspectable.</span>
          </li>
        </ul>
      </div>

      <form className="login-card" onSubmit={onSubmit}>
        <h2>Open the recovery book</h2>
        <p>The overview is already scored. Click a webhook, inspect a hard stop, play a voice note.</p>
        {configured && (
          <>
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@merchant.com"
                autoComplete="email"
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            {sent && <p className="save-hint">Check your inbox for the sign-in link.</p>}
            <button type="submit" className="primary-btn" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </>
        )}
        <button type="button" className="batch-btn" onClick={continueLocally}>
          <Zap size={14} fill="#ffffff" />
          Enter the demo
        </button>
      </form>
    </div>
  );
}
