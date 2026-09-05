import type { RetryAttemptPlan, RetryStrategy } from '../types';
import { fmtDate } from '../format';
import { strategyLabel } from '../engine/smartRetry';

const CHANNEL_LABEL: Record<RetryAttemptPlan['channel'], string> = {
  auto: 'Auto retry',
  whatsapp: 'WhatsApp',
  link: 'Pay link',
};

/**
 * Smart-retry schedule timeline — the dated attempt plan for one payment.
 */
export function RetryTimeline({ plan, strategy }: { plan: RetryAttemptPlan[]; strategy: RetryStrategy }) {
  if (plan.length === 0) {
    return (
      <div className="retry-empty">
        <span className="strategy-pill sp-abstain">{strategyLabel(strategy)}</span>
        <p>No further attempts scheduled — the playbook stops here.</p>
      </div>
    );
  }
  return (
    <div className="retry-timeline">
      <div className="retry-head">
        <span className={`strategy-pill sp-${strategy}`}>{strategyLabel(strategy)}</span>
        <span className="muted">{plan.length} attempt{plan.length > 1 ? 's' : ''} scheduled</span>
      </div>
      {plan.map((a) => (
        <div key={a.attempt} className="retry-node">
          <span className="retry-dot" />
          <div className="retry-body">
            <div className="retry-top">
              <strong>Attempt {a.attempt} · Day {a.dayOffset}</strong>
              <span className="channel-pill">{CHANNEL_LABEL[a.channel]}</span>
            </div>
            <div className="retry-when">{fmtDate(a.scheduledFor)} · {a.window}</div>
            <p className="retry-why">{a.rationale}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
