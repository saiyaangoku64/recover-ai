import { useMemo } from 'react';
import { ArrowRight, Square, Zap } from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { INR, pct, toWords } from '../format';
import { escalation, paymentLink, razorpayError, webhookPayload } from '../lib/razorpay';
import { IconWhatsApp } from '../components/Icons';
import { AnimatedNumber } from '../components/AnimatedNumber';
import type { RecoveryResult } from '../types';

function pickCases(results: Map<string, RecoveryResult>) {
  const all = [...results.values()];
  const blocked = all.find((r) => r.policy.result === 'blocked' && r.payment.failure_category === 'hard');
  const ptp = all.find((r) => r.audit.decision === 'promise_to_pay');
  const retry = all.find((r) => r.audit.decision === 'retry');
  const whatsapp = all.find((r) => r.audit.recovery_channel === 'whatsapp' && r.audit.decision !== 'promise_to_pay');
  return [blocked, ptp || whatsapp, retry].filter(Boolean) as RecoveryResult[];
}

export function OverviewPage() {
  const {
    payments,
    results,
    baseline,
    reviveStats,
    batchRunning,
    batchProgress,
    batchRecovered,
    runBatch,
    cancelBatch,
    handleEvaluate,
    setWaModalPayment,
    handlePlaySarvamVoice,
  } = useRecovery();

  const atRisk = baseline?.totalAtRisk ?? 0;
  const naive = baseline?.totalRecovered ?? 0;
  // Value-based recovery rate: what fraction of at-risk INR is recovered
  const recoveryRate = atRisk ? reviveStats.recovered / atRisk : 0;
  const naiveRate = atRisk ? naive / atRisk : 0;

  const cases = useMemo(() => pickCases(results), [results]);
  const feed = useMemo(
    () => [...payments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6),
    [payments],
  );

  const failureMix = useMemo(() => {
    const byCategory = { soft: 0, hard: 0 };
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byCategory[p.failure_category]++;
      byMethod[p.method] = (byMethod[p.method] || 0) + 1;
    }
    return { byCategory, byMethod };
  }, [payments]);

  return (
    <div className="page-stack">
      <section className="hero-money">
        <div className="hero-copy">
          <p className="hero-kicker">Track 03 · AI Revenue Recovery</p>
          <h2>Failed payments are not a retry button. They are a diagnosis problem.</h2>
          <p className="hero-lead">
            Razorpay Smart Retry would blindly retry soft declines. REVIVE scores the full book, blocks doomed
            retries, and routes the rest to silent retry, Hinglish WhatsApp, or promise-to-pay — with a policy
            gate that cannot be overridden.
          </p>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-label">Expected recovered on this book</span>
          <span className="hero-stat-value"><AnimatedNumber value={reviveStats.recovered} format={INR} /></span>
          <span className="hero-stat-hint">
            {pct(recoveryRate)} of {INR(atRisk)} at risk · {reviveStats.actioned} interventions · {reviveStats.blocked} stopped
          </span>
        </div>
      </section>

      <div className="vs-grid">
        <article className="vs-card naive">
          <div className="vs-card-head">
            <span className="vs-badge">Naive Smart Retry (claimed)</span>
            <span className="vs-icon">✕</span>
          </div>
          <strong><AnimatedNumber value={naive} format={INR} /></strong>
          <p>
            Flat 80% on every soft decline with retries &lt; 2. {baseline?.actioned ?? 0} blasted retries.
            That number counts money you will not collect — and customers you will ping after a stolen card.
          </p>
          <span className="vs-rate">{pct(naiveRate)} claimed</span>
        </article>
        <article className="vs-card revive">
          <div className="vs-card-head">
            <span className="vs-badge">REVIVE (collectible EV)</span>
            <span className="vs-icon">✓</span>
          </div>
          <strong><AnimatedNumber value={reviveStats.recovered} format={INR} /></strong>
          <p>
            {reviveStats.retry} silent retries · {reviveStats.whatsapp} WhatsApp / PTP · {reviveStats.blocked} hard
            stops. {INR(reviveStats.blockedAmount)} doomed GMV not chased · ~{INR(reviveStats.interchangeSaved)} interchange not burned.
          </p>
          <span className="vs-rate lift">Honest book · {pct(recoveryRate)} collectible</span>
        </article>
      </div>

      <div className="pipeline-row">
        <div className="pipe-step pipe-step-1">
          <div className="pipe-num">1</div>
          <div className="pipe-body">
            <span>Detect</span>
            <strong>payment.failed</strong>
            <em>{payments.length} webhook events</em>
          </div>
        </div>
        <ArrowRight size={18} className="pipe-arrow" />
        <div className="pipe-step pipe-step-2">
          <div className="pipe-num">2</div>
          <div className="pipe-body">
            <span>Diagnose</span>
            <strong>Root cause + EV</strong>
            <em>{failureMix.byCategory.soft} soft · {failureMix.byCategory.hard} hard</em>
          </div>
        </div>
        <ArrowRight size={18} className="pipe-arrow" />
        <div className="pipe-step pipe-step-3">
          <div className="pipe-num">3</div>
          <div className="pipe-body">
            <span>Gate</span>
            <strong>6 stopping rules</strong>
            <em>{reviveStats.blocked} blocked</em>
          </div>
        </div>
        <ArrowRight size={18} className="pipe-arrow" />
        <div className="pipe-step pipe-step-4">
          <div className="pipe-num">4</div>
          <div className="pipe-body">
            <span>Execute</span>
            <strong>Retry · WA · voice · PTP</strong>
            <em>{INR(reviveStats.recovered)} expected</em>
          </div>
        </div>
      </div>

      <div className="dashboard-grid ops-grid pitch-grid">
        <div className="card padded-card">
          <div className="card-header-row">
            <div>
              <div className="card-title">Webhook inbox</div>
              <div className="card-subtitle">Sample payment.failed webhook payloads — the agent starts here, not in a spreadsheet</div>
            </div>
            <span className="card-count">{feed.length}</span>
          </div>
          <div className="webhook-feed">
            {feed.slice(0, 4).map((p) => {
              const err = razorpayError(p.failure_reason);
              const r = results.get(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  className="webhook-row"
                  onClick={() => handleEvaluate(p)}
                >
                  <div className="webhook-row-left">
                    <span className="mono-cell">{p.id}</span>
                    <span className="webhook-code">{err.code}</span>
                  </div>
                  <div className="webhook-row-right">
                    <span className="amt-cell">{INR(p.amount)}</span>
                    <span className={`tag-badge ${r?.policy.result === 'blocked' ? 'blocked' : r?.audit.decision === 'retry' ? 'retry' : 'ptp'}`}>
                      {r ? (r.policy.result === 'blocked' ? 'stop' : toWords(r.audit.decision)) : '…'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <pre className="webhook-json">{JSON.stringify(feed[0] ? webhookPayload(feed[0]) : {}, null, 2)}</pre>
        </div>

        <div className="card padded-card case-col">
          <div className="card-header-row">
            <div>
              <div className="card-title">Three recoveries a judge should click</div>
              <div className="card-subtitle">Hard stop · Hinglish PTP · silent retry — the Track 03 loop on sample rows</div>
            </div>
          </div>
          <div className="case-list">
            {cases.map((r) => {
              const err = razorpayError(r.payment.failure_reason);
              const isBlocked = r.policy.result === 'blocked';
              return (
                <div key={r.payment.id} className={`case-card ${isBlocked ? 'case-blocked' : 'case-recover'}`}>
                  <div className="case-top">
                    <span className="webhook-code">{err.code}</span>
                    <span className="amt-cell">{INR(r.payment.amount)}</span>
                  </div>
                  <strong>{r.payment.customer_name}</strong>
                  <p>{r.llm.reason}</p>
                  <p className="case-esc">{escalation(r)}</p>
                  <div className="inline-actions">
                    <button type="button" className="table-tab-btn" onClick={() => handleEvaluate(r.payment)}>Inspect</button>
                    {r.audit.recovery_channel === 'whatsapp' && (
                      <button type="button" className="table-tab-btn wa-action" onClick={() => setWaModalPayment(r.payment)}>
                        <IconWhatsApp width="12" height="12" /> WhatsApp
                      </button>
                    )}
                    {(r.audit.recovery_channel === 'whatsapp' || r.audit.decision === 'promise_to_pay') && (
                      <button type="button" className="table-tab-btn voice-action" onClick={() => handlePlaySarvamVoice(r.payment)}>
                        Voice
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card padded-card execute-card">
          <div className="execute-icon">⚡</div>
          <div className="card-title">Execute</div>
          <div className="card-subtitle">Measured book + optional LLM rescoring. Hydrated with the same policy gate.</div>
          <ul className="exec-list">
            <li>Expected recovery <strong>{INR(batchRecovered || reviveStats.recovered)}</strong></li>
            <li>Payment links issued on WhatsApp / reminder paths</li>
            <li>Quiet stop on stolen / fraud / retry-exhausted</li>
          </ul>
          <div className="journey-action-bar stacked-actions">
            {batchRunning ? (
              <button type="button" className="batch-btn cancel" onClick={cancelBatch}>
                <Square size={14} fill="#ffffff" />
                Cancel rescoring {batchProgress.toFixed(0)}%
              </button>
            ) : (
              <button type="button" className="batch-btn" onClick={runBatch}>
                <Zap size={14} fill="#ffffff" />
                Rescore book with AI
              </button>
            )}
          </div>
          {batchRunning && (
            <div className="batch-progress-wrap">
              <div className="batch-progress-track">
                <div className="batch-progress-fill" style={{ width: `${batchProgress}%` }} />
              </div>
              <div className="batch-progress-label">
                <span>{batchProgress.toFixed(0)}% complete</span>
                <span>{batchRecovered} recovered</span>
              </div>
            </div>
          )}
          <p className="muted exec-note">
            First 8 rows use the LLM when a key is present. The rest stay on the deterministic engine so a demo never stalls.
          </p>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card kpi-risk">
          <span className="kpi-label">Amount at risk</span>
          <span className="kpi-value"><AnimatedNumber value={atRisk} format={INR} /></span>
          <span className="kpi-hint">{payments.length} failed payments</span>
        </div>
        <div className="kpi-card kpi-blocked">
          <span className="kpi-label">Policy blocked</span>
          <span className="kpi-value fail"><AnimatedNumber value={reviveStats.blocked} /></span>
          <span className="kpi-hint">{INR(reviveStats.blockedAmount)} not blasted</span>
        </div>
        <div className="kpi-card kpi-ptp">
          <span className="kpi-label">Open PTP</span>
          <span className="kpi-value"><AnimatedNumber value={reviveStats.pendingPtpValue} format={INR} /></span>
          <span className="kpi-hint">{reviveStats.ptpCount} commitments</span>
        </div>
        <div className="kpi-card kpi-channel">
          <span className="kpi-label">WhatsApp / voice</span>
          <span className="kpi-value"><AnimatedNumber value={reviveStats.whatsapp + reviveStats.voice} /></span>
          <span className="kpi-hint">Hinglish recovery channel</span>
        </div>
        <div className="kpi-card kpi-link">
          <span className="kpi-label">Example payment link</span>
          <span className="kpi-value linkish">{payments[0] ? paymentLink(payments[0]).slice(-14) : '—'}</span>
          <span className="kpi-hint">Issued on execute, not on detect</span>
        </div>
      </div>
    </div>
  );
}
