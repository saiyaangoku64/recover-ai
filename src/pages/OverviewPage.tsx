import { useMemo } from 'react';
import { Square, Zap } from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { INR, pct, toWords } from '../format';
import { escalation, razorpayError, webhookPayload } from '../lib/razorpay';
import { funnelStages, revenueTrend } from '../engine/analytics';
import { IconWhatsApp } from '../components/Icons';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { RevenueChart } from '../components/RevenueChart';
import { Funnel } from '../components/Funnel';
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
  const recoveryRate = atRisk ? reviveStats.recovered / atRisk : 0;
  const naiveRate = atRisk ? naive / atRisk : 0;

  const cases = useMemo(() => pickCases(results), [results]);
  const feed = useMemo(
    () => [...payments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6),
    [payments],
  );
  const trend = useMemo(() => revenueTrend(payments, results), [payments, results]);
  const funnel = useMemo(() => funnelStages(payments, results), [payments, results]);

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h2 className="page-title">Good evening — here’s the recovery book</h2>
          <p className="page-sub">
            {payments.length} failed payments scored · {reviveStats.actioned} engaged · {reviveStats.blocked} stopped by policy
          </p>
        </div>
        {batchRunning ? (
          <button type="button" className="btn-danger" onClick={cancelBatch}>
            <Square size={14} fill="currentColor" />
            Stop rescoring · {batchProgress.toFixed(0)}%
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={runBatch}>
            <Zap size={14} fill="currentColor" />
            Rescore book with AI
          </button>
        )}
      </div>

      <section className="st-stats">
        <div className="st-stat">
          <span className="st-label">Expected recovery</span>
          <span className="st-value"><AnimatedNumber value={batchRecovered || reviveStats.recovered} format={INR} /></span>
          <span className="st-sub up">{pct(recoveryRate)} of at-risk GMV · honest EV</span>
        </div>
        <div className="st-stat">
          <span className="st-label">At-risk GMV</span>
          <span className="st-value"><AnimatedNumber value={atRisk} format={INR} /></span>
          <span className="st-sub">{payments.length} failed payments</span>
        </div>
        <div className="st-stat">
          <span className="st-label">Naive retry claims</span>
          <span className="st-value muted-num"><AnimatedNumber value={naive} format={INR} /></span>
          <span className="st-sub down">{pct(naiveRate)} claimed · uncollectible</span>
        </div>
        <div className="st-stat">
          <span className="st-label">Waste blocked</span>
          <span className="st-value"><AnimatedNumber value={reviveStats.blocked} /></span>
          <span className="st-sub">{INR(reviveStats.blockedAmount)} doomed GMV not chased</span>
        </div>
      </section>

      {batchRunning && (
        <div className="batch-progress-wrap slim">
          <div className="batch-progress-track">
            <div className="batch-progress-fill" style={{ width: `${batchProgress}%` }} />
          </div>
          <div className="batch-progress-label">
            <span>Rescoring with AI… {batchProgress.toFixed(0)}%</span>
            <span>{INR(batchRecovered)} recovered so far</span>
          </div>
        </div>
      )}

      <section className="an-grid-main">
        <div className="card padded-card">
          <div className="card-header-row">
            <div>
              <div className="card-title">Recovered revenue</div>
              <div className="card-subtitle">Cumulative expected recovery vs at-risk GMV, by failure day</div>
            </div>
          </div>
          <RevenueChart data={trend} />
        </div>
        <div className="card padded-card">
          <div className="card-header-row">
            <div>
              <div className="card-title">Recovery funnel</div>
              <div className="card-subtitle">Value-weighted, policy-gated</div>
            </div>
          </div>
          <Funnel stages={funnel} />
        </div>
      </section>

      <div className="vs-grid slim">
        <article className="vs-card naive">
          <div className="vs-card-head">
            <span className="vs-badge">Naive Smart Retry</span>
            <span className="vs-icon">✕</span>
          </div>
          <strong><AnimatedNumber value={naive} format={INR} /></strong>
          <p>Flat 80% on soft declines with retries &lt; 2 · {baseline?.actioned ?? 0} blasted retries, including stolen cards.</p>
        </article>
        <article className="vs-card revive">
          <div className="vs-card-head">
            <span className="vs-badge">REVIVE collectible EV</span>
            <span className="vs-icon">✓</span>
          </div>
          <strong><AnimatedNumber value={reviveStats.recovered} format={INR} /></strong>
          <p>{reviveStats.retry} silent retries · {reviveStats.whatsapp} WhatsApp / PTP · {reviveStats.blocked} hard stops · ~{INR(reviveStats.interchangeSaved)} interchange saved.</p>
        </article>
      </div>

      <div className="dashboard-grid ops-grid pitch-grid">
        <div className="card padded-card">
          <div className="card-header-row">
            <div>
              <div className="card-title">Webhook inbox</div>
              <div className="card-subtitle">Live payment.failed payloads — the agent starts here</div>
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
              <div className="card-title">Three recoveries worth clicking</div>
              <div className="card-subtitle">Hard stop · Hinglish PTP · silent retry</div>
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
          <div className="card-title">Execute</div>
          <div className="card-subtitle">Measured book + optional LLM rescoring, same policy gate.</div>
          <ul className="exec-list">
            <li>Expected recovery <strong>{INR(batchRecovered || reviveStats.recovered)}</strong></li>
            <li>Payment links issued on WhatsApp / reminder paths</li>
            <li>Quiet stop on stolen / fraud / retry-exhausted</li>
          </ul>
          <p className="muted exec-note">
            LLM rescoring on tap; the deterministic engine covers the rest so scoring never stalls.
          </p>
        </div>
      </div>
    </div>
  );
}
