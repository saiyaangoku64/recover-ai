import { useMemo } from 'react';
import { useRecovery } from '../context/RecoveryContext';
import { INR, pct, toWords } from '../format';
import {
  channelMixFromResults,
  funnelStages,
  recoveryByReason,
  revenueTrend,
} from '../engine/analytics';
import { DUNNING_SEQUENCES } from '../engine/dunning';
import { RevenueChart } from '../components/RevenueChart';
import { Funnel } from '../components/Funnel';
import { DeclineIntel } from '../components/DeclineIntel';
import { AnimatedNumber } from '../components/AnimatedNumber';

const CHANNEL_LABEL: Record<string, string> = {
  auto_retry: 'Silent retry',
  whatsapp: 'WhatsApp',
  voice: 'Voice',
  send_reminder: 'Reminder',
  promise_to_pay: 'Promise-to-pay',
  retry: 'Silent retry',
  stopped: 'Stopped by policy',
  none: 'No action',
};

export function AnalyticsPage() {
  const { payments, results, reviveStats, baseline } = useRecovery();

  const atRisk = baseline?.totalAtRisk ?? 0;
  const recoveryRate = atRisk ? reviveStats.recovered / atRisk : 0;

  const trend = useMemo(() => revenueTrend(payments, results), [payments, results]);
  const funnel = useMemo(() => funnelStages(payments, results), [payments, results]);
  const intel = useMemo(() => recoveryByReason(payments, results), [payments, results]);
  const mix = useMemo(() => channelMixFromResults(results), [results]);
  const maxMix = Math.max(1, ...mix.map((m) => m.value));

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h2 className="page-title">Revenue recovery analytics</h2>
          <p className="page-sub">Measured money, not claimed money — every number traces to an evaluated payment.</p>
        </div>
      </div>

      <section className="st-stats">
        <div className="st-stat">
          <span className="st-label">Expected recovery</span>
          <span className="st-value"><AnimatedNumber value={reviveStats.recovered} format={INR} /></span>
          <span className="st-sub up">{pct(recoveryRate)} of at-risk GMV</span>
        </div>
        <div className="st-stat">
          <span className="st-label">At-risk GMV</span>
          <span className="st-value"><AnimatedNumber value={atRisk} format={INR} /></span>
          <span className="st-sub">{payments.length} failed payments scored</span>
        </div>
        <div className="st-stat">
          <span className="st-label">Engaged for recovery</span>
          <span className="st-value"><AnimatedNumber value={reviveStats.actioned} /></span>
          <span className="st-sub">{reviveStats.retry} silent · {reviveStats.whatsapp} WhatsApp · {reviveStats.voice} voice</span>
        </div>
        <div className="st-stat">
          <span className="st-label">Waste blocked</span>
          <span className="st-value"><AnimatedNumber value={reviveStats.blocked} /></span>
          <span className="st-sub">{INR(reviveStats.blockedAmount)} doomed GMV not chased</span>
        </div>
      </section>

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
          <div className="mix-block">
            <div className="mix-title">Channel mix</div>
            {mix.map((m) => (
              <div key={m.channel} className="mix-row">
                <span className="mix-label">{CHANNEL_LABEL[m.channel] ?? toWords(m.channel)}</span>
                <div className="mix-track">
                  <div className="mix-fill" style={{ width: `${Math.max(2, (m.value / maxMix) * 100)}%` }} />
                </div>
                <span className="mix-val">{m.count} · {INR(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card padded-card">
        <div className="card-header-row">
          <div>
            <div className="card-title">Decline-code intelligence</div>
            <div className="card-subtitle">One playbook per code — retry schedule, channel, and expected yield</div>
          </div>
          <span className="card-count">{intel.length} codes</span>
        </div>
        <DeclineIntel rows={intel} />
      </section>

      <section className="card padded-card">
        <div className="card-header-row">
          <div>
            <div className="card-title">Dunning playbooks</div>
            <div className="card-subtitle">Multi-stage outreach sequences — enrolled automatically by profile</div>
          </div>
          <span className="card-count">{DUNNING_SEQUENCES.length} sequences</span>
        </div>
        <div className="dun-grid">
          {DUNNING_SEQUENCES.map((s) => (
            <div key={s.id} className="dun-card">
              <strong>{s.name}</strong>
              <span className="muted">{s.audience}</span>
              <div className="dun-stages">
                {s.stages.map((st) => (
                  <span key={st.stage} className={`dun-chip tone-${st.tone}`} title={`${st.subject} — ${st.template.slice(0, 90)}…`}>
                    D{st.dayOffset} · {toWords(st.channel)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
