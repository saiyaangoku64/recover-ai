import { Check, ShieldCheck, Volume2, X, Brain, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useRecovery } from '../context/RecoveryContext';
import { inspectPolicyRules } from '../engine/policy';
import { buildRetryPlan, getPlaybook } from '../engine/smartRetry';
import { scoreRisk } from '../engine/risk';
import { INR, fmtDate, pct, toWords } from '../format';
import { escalation, paymentLink, razorpayError, webhookPayload } from '../lib/razorpay';
import { useEscape } from '../hooks/useEscape';
import { IconWhatsApp } from './Icons';
import { RiskBadge } from './RiskBadge';
import { RetryTimeline } from './RetryTimeline';

export function DecisionDrawer() {
  const {
    selectedPayment,
    setSelectedPayment,
    results,
    evaluating,
    policyConfig,
    setWaModalPayment,
    handlePlaySarvamVoice,
    sarvamPlaying,
    openInspector,
    handlePTP,
    handleEvaluate,
    openrouterKey,
  } = useRecovery();

  const [linkIssued, setLinkIssued] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setSelectedPayment(null);
    }, 200);
  }, [setSelectedPayment]);
  const selectedId = selectedPayment?.id ?? null;
  useEscape(close, Boolean(selectedPayment));
  useEffect(() => {
    setLinkIssued(false);
  }, [selectedId]);

  if (!selectedPayment) return null;

  const result = results.get(selectedPayment.id);
  const isEvaluating = evaluating.has(selectedPayment.id);
  const rules = inspectPolicyRules(selectedPayment, result?.llm, policyConfig);
  const err = razorpayError(selectedPayment.failure_reason);
  const link = paymentLink(selectedPayment);
  const canExecute = result && result.policy.result === 'passed' && result.audit.decision !== 'none';
  const risk = result?.risk ?? scoreRisk(selectedPayment);
  const playbook = getPlaybook(selectedPayment.failure_reason);
  const retryPlan = result?.retryPlan ?? buildRetryPlan(selectedPayment);

  return (
    <div className={`drawer-overlay ${closing ? 'closing' : ''}`} onClick={close}>
      <div
        className={`drawer-content ${closing ? 'closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title" id="drawer-title">
            <ShieldCheck size={18} color="#3b66f5" />
            <span>Decision audit · {selectedPayment.id}</span>
          </div>
          <button type="button" className="drawer-close-btn" onClick={close} aria-label="Close decision drawer">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="detail-kpi-grid">
            <div className="detail-kpi-card">
              <div className="detail-kpi-lbl">Customer & amount</div>
              <div className="detail-kpi-val">{INR(selectedPayment.amount)}</div>
              <div className="detail-kpi-sub">
                {selectedPayment.customer_name} · {fmtDate(selectedPayment.created_at)}
              </div>
            </div>
            <div className="detail-kpi-card">
              <div className="detail-kpi-lbl">Failure</div>
              <div className="detail-kpi-val fail">{err.code}</div>
              <div className="detail-kpi-sub">
                {toWords(selectedPayment.failure_reason)} · {selectedPayment.failure_category} · retries {selectedPayment.retry_count}
              </div>
            </div>
            <div className="detail-kpi-card">
              <div className="detail-kpi-lbl">Expected recovery</div>
              <div className="detail-kpi-val ok">
                {isEvaluating || !result ? '…' : INR(result.audit.expected_recovery)}
              </div>
              <div className="detail-kpi-sub">
                Confidence {result ? pct(result.llm.confidence) : 'pending'}
              </div>
            </div>
          </div>

          {isEvaluating && !result && (
            <div className="drawer-skeleton">Evaluating payment through AI + policy gate…</div>
          )}

          <div className="risk-strip">
            <div className="risk-strip-head">
              <span className="section-label">Radar risk screen</span>
              <RiskBadge risk={risk} />
            </div>
            {risk.signals.length > 0 ? (
              <ul className="risk-signals">
                {risk.signals.map((s) => (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <em>+{s.weight}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No fraud or abuse signals — clean to engage.</p>
            )}
          </div>

          <div className="policy-gate-card">
            <div className="policy-card-title">
              <span>Policy gate</span>
              {result ? (
                result.policy.result === 'blocked' ? (
                  <span className="tag-badge blocked">Blocked</span>
                ) : (
                  <span className="tag-badge passed">Passed</span>
                )
              ) : (
                <span className="tag-badge none">Pending</span>
              )}
            </div>
            {result?.policy.reason && (
              <p className="policy-reason">{result.policy.reason}</p>
            )}
            <div className="policy-rule-list">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`policy-rule-item ${rule.passed === false ? 'violated' : ''}`}
                  data-tooltip={rule.detail}
                >
                  {rule.passed === false ? (
                    <X size={13} color="#ef4444" />
                  ) : rule.passed === true ? (
                    <Check size={13} color="#10b981" />
                  ) : (
                    <span className="rule-pending" />
                  )}
                  <span>
                    {rule.label}
                    <em> · {rule.detail}</em>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="confidence-meter-wrap">
            <div className="confidence-meter-label">
              <span>AI recovery confidence</span>
              <span>{result ? pct(result.llm.confidence) : '—'}</span>
            </div>
            <div className="confidence-bar-bg">
              <div
                className="confidence-bar-fill"
                style={{ width: result ? `${result.llm.confidence * 100}%` : '0%' }}
                data-tooltip={result ? `Confidence: ${(result.llm.confidence * 100).toFixed(1)}%` : ''}
              />
            </div>
          </div>

          <div className="diagnosis-box">
            <strong>Diagnosis:</strong>{' '}
            {result?.llm.reason || (isEvaluating ? 'Waiting for model output…' : 'Evaluate this payment to see the diagnosis.')}
            {result?.llm.root_cause && (
              <div className="diag-chips">
                <span className="diag-chip">Root cause · {result.llm.root_cause}</span>
                {result.llm.recoverability !== undefined && (
                  <span className="diag-chip">Recoverability · {pct(result.llm.recoverability)}</span>
                )}
                {result.llm.recommended_timing && (
                  <span className="diag-chip">Timing · {result.llm.recommended_timing}</span>
                )}
              </div>
            )}
            <div className="case-esc">{escalation(result)}</div>
          </div>

          <div className="retry-card">
            <div className="retry-card-head">
              <span className="section-label">Smart retry plan</span>
              <span className="muted">{playbook.reason.replace(/_/g, ' ')} playbook</span>
            </div>
            <RetryTimeline plan={retryPlan} strategy={playbook.strategy} />
          </div>

          <div className="rzp-meta">
            <span className="webhook-code">{err.code}</span>
            <span className="muted">{err.source} · {err.step}</span>
          </div>
          <pre className="webhook-json compact">{JSON.stringify(webhookPayload(selectedPayment), null, 2)}</pre>

          {canExecute && (
            <div className="link-box">
              <span className="mono-cell">{link}</span>
              <button
                type="button"
                className="table-tab-btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  setLinkIssued(true);
                }}
              >
                <ExternalLink size={12} />
                {linkIssued ? 'Payment link issued' : 'Issue Razorpay payment link'}
              </button>
            </div>
          )}

          <div className="drawer-actions">
            <button
              type="button"
              className="table-tab-btn active wa-action"
              onClick={() => setWaModalPayment(selectedPayment)}
            >
              <IconWhatsApp width="15" height="15" />
              Preview WhatsApp recovery
            </button>
            <button
              type="button"
              className="table-tab-btn voice-action"
              onClick={() => handlePlaySarvamVoice(selectedPayment)}
            >
              <Volume2 size={14} />
              {sarvamPlaying ? 'Stop voice' : 'Play recovery voice'}
            </button>
            {openrouterKey && (
              <button
                type="button"
                className="table-tab-btn"
                onClick={() => handleEvaluate(selectedPayment, { force: true })}
              >
                Re-score with AI
              </button>
            )}
            <button
              type="button"
              className="table-tab-btn"
              onClick={() => openInspector(`Inspector for ${selectedPayment.id}`)}
            >
              <Brain size={14} color="#3b66f5" />
              Inspect reasoning
            </button>
            {result?.audit.decision === 'promise_to_pay' && (
              <>
                <button type="button" className="table-tab-btn ptp-kept" onClick={() => handlePTP(selectedPayment.id, 'kept')}>
                  <Check size={13} /> Mark PTP kept
                </button>
                <button type="button" className="table-tab-btn ptp-broken" onClick={() => handlePTP(selectedPayment.id, 'broken')}>
                  <X size={13} /> Mark PTP broken
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
