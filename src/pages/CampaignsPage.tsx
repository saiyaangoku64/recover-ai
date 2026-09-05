import { useState, useMemo, useCallback } from 'react';
import { useRecovery } from '../context/RecoveryContext';
import { buildCustomerProfile, segmentSummary, type CustomerSegment } from '../engine/profiles';
import {
  createCampaign,
  executeCampaign,
  loadCampaigns,
  pauseCampaign,
  saveCampaigns,
  campaignROI,
  predictedVsActual,
  estimateCostFromChannels,
  AI_RESCORE_COST,
  STRATEGY_CONFIG,
  type Campaign,
  type StrategyKey,
} from '../engine/campaigns';
import { pickSequence } from '../engine/dunning';
import { INR, pct } from '../format';
import { Rocket, Pause, Play, Zap, Trash2, ShieldCheck } from 'lucide-react';

const SEGMENT_LABELS: Record<CustomerSegment | 'all', { label: string; short: string; color: string }> = {
  all: { label: 'All segments', short: 'All', color: '#635bff' },
  whale: { label: 'Whale (high-value loyal)', short: 'Whale', color: '#b7791f' },
  loyal: { label: 'Loyal (temp issue)', short: 'Loyal', color: '#0e7c3e' },
  new: { label: 'New customers', short: 'New', color: '#0a5cb8' },
  at_risk: { label: 'At risk', short: 'At risk', color: '#c2410c' },
  dormant: { label: 'Dormant', short: 'Dormant', color: '#7a8ba3' },
  fraud_flag: { label: 'Fraud flagged', short: 'Fraud', color: '#c01a3d' },
};

const SEGMENT_ORDER: (CustomerSegment | 'all')[] = ['all', 'whale', 'loyal', 'new', 'at_risk', 'dormant', 'fraud_flag'];

export function CampaignsPage() {
  const { payments, results, policyConfig, openrouterKey, merchantId } = useRecovery();

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns());
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | 'all'>('all');
  const [campaignName, setCampaignName] = useState('');
  const [strategy, setStrategy] = useState<StrategyKey>('balanced');
  const [running, setRunning] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLaunch, setConfirmLaunch] = useState<string | null>(null);

  const profiles = useMemo(() => payments.map(buildCustomerProfile), [payments]);
  const segSummary = useMemo(() => segmentSummary(profiles), [profiles]);

  // Real at-risk GMV per segment (sum of payment amounts, not lifetime value)
  const atRiskBySeg = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const p of payments) {
      const seg = buildCustomerProfile(p).segment;
      const slot = map.get(seg) ?? { count: 0, value: 0 };
      slot.count++;
      slot.value += p.amount;
      map.set(seg, slot);
    }
    return map;
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (selectedSegment === 'all') return payments;
    return payments.filter((p) => buildCustomerProfile(p).segment === selectedSegment);
  }, [payments, selectedSegment]);

  const eligible = useMemo(() => {
    return filteredPayments.filter((p) => {
      const r = results.get(p.id);
      return r && r.policy.result === 'passed' && r.audit.decision !== 'none';
    });
  }, [filteredPayments, results]);

  // Pre-launch forecast: predicted yield, channel cost, dunning enrollment
  const forecast = useMemo(() => {
    let predicted = 0;
    const chCounts: Record<string, number> = {};
    const seqCounts = new Map<string, { name: string; count: number; stages: number }>();
    for (const p of eligible) {
      const r = results.get(p.id);
      if (!r) continue;
      predicted += r.audit.expected_recovery;
      const ch = r.audit.recovery_channel ?? r.audit.decision;
      chCounts[ch] = (chCounts[ch] || 0) + 1;
      const seq = pickSequence(p, r.audit.decision);
      if (seq) {
        const slot = seqCounts.get(seq.id) ?? { name: seq.name, count: 0, stages: seq.stages.length };
        slot.count++;
        seqCounts.set(seq.id, slot);
      }
    }
    const channelCost = estimateCostFromChannels(chCounts);
    const perStrategy = (Object.keys(STRATEGY_CONFIG) as StrategyKey[]).map((s) => {
      const aiCalls = Math.min(eligible.length, STRATEGY_CONFIG[s].maxAiCalls);
      const cost = channelCost + aiCalls * AI_RESCORE_COST;
      return { key: s, aiCalls, cost, net: predicted - cost };
    });
    const active = perStrategy.find((p) => p.key === strategy)!;
    return { predicted, channelCost, perStrategy, active, seqCounts: [...seqCounts.values()] };
  }, [eligible, results, strategy]);

  const handleCreate = useCallback(() => {
    const name = campaignName.trim() ||
      `${SEGMENT_LABELS[selectedSegment].label} recovery · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    const camp = createCampaign(name, selectedSegment, strategy, payments, results);
    setCampaigns((prev) => {
      const next = [...prev, camp];
      saveCampaigns(next);
      return next;
    });
    setCampaignName('');
  }, [campaignName, selectedSegment, strategy, payments, results]);

  const handleLaunch = useCallback(async (camp: Campaign) => {
    if (running) return;
    setRunning(true);
    setActiveCampaignId(camp.id);
    setProgress(0);

    try {
      const updated = await executeCampaign(
        camp,
        payments,
        results,
        policyConfig,
        merchantId ?? 'local-demo',
        openrouterKey,
        (c) => {
          setProgress(c.metrics.total_attempted / Math.max(1, c.payment_ids.length) * 100);
          setCampaigns((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        },
      );
      setCampaigns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } finally {
      setRunning(false);
      setActiveCampaignId(null);
      setProgress(0);
    }
  }, [running, payments, results, policyConfig, openrouterKey, merchantId]);

  const handlePause = useCallback((campId: string) => {
    const updated = pauseCampaign(campId);
    if (updated) setCampaigns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }, []);

  const handleDelete = useCallback((campId: string) => {
    const updated = campaigns.filter((c) => c.id !== campId);
    saveCampaigns(updated);
    setCampaigns(updated);
    setConfirmDelete(null);
  }, [campaigns]);

  const handleConfirmLaunch = useCallback(async (camp: Campaign) => {
    setConfirmLaunch(null);
    await handleLaunch(camp);
  }, [handleLaunch]);

  if (payments.length === 0) {
    return (
      <div className="card padded-card">
        <div className="empty-state-container">
          <div className="empty-state-icon"><Rocket size={36} /></div>
          <h3 className="empty-state-title">No payments data yet</h3>
          <p className="empty-state-desc">Run a batch from the Overview page first, or evaluate individual payments.</p>
        </div>
      </div>
    );
  }

  const segCard = (seg: CustomerSegment | 'all') => {
    const isAll = seg === 'all';
    const count = isAll ? payments.length : (segSummary[seg as CustomerSegment]?.count ?? 0);
    const value = isAll
      ? payments.reduce((s, p) => s + p.amount, 0)
      : (atRiskBySeg.get(seg)?.value ?? 0);
    return (
      <div
        key={seg}
        className={`segment-card ${selectedSegment === seg ? 'active' : ''}`}
        onClick={() => setSelectedSegment(seg)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSegment(seg); } }}
        role="button"
        tabIndex={0}
        aria-pressed={selectedSegment === seg}
      >
        <div className="segment-header">
          <span className="segment-dot" style={{ background: SEGMENT_LABELS[seg].color }} />
          <span className="segment-name">{SEGMENT_LABELS[seg].label}</span>
        </div>
        <div className="seg-value">{INR(value)}</div>
        <div className="seg-mini">
          <span>{count} payments</span>
          {!isAll && <span>{pct(segSummary[seg as CustomerSegment]?.avgRecoveryProb)} recovery</span>}
          {!isAll && <span>{pct(segSummary[seg as CustomerSegment]?.avgRisk)} risk</span>}
          {isAll && <span>{eligible.length} eligible in filter</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h2 className="page-title">Recovery campaigns</h2>
          <p className="page-sub">Segment, forecast, then launch — every campaign reports predicted vs actual.</p>
        </div>
      </div>

      {/* Segment Overview */}
      <div className="card padded-card">
        <div className="card-header-row">
          <div>
            <div className="card-title">Customer segments</div>
            <div className="card-subtitle">At-risk GMV per segment — click to target a campaign</div>
          </div>
        </div>
        <div className="campaign-segment-grid">
          {SEGMENT_ORDER.map(segCard)}
        </div>
      </div>

      {/* Campaign Builder */}
      <div className="card padded-card">
        <div className="card-header-row">
          <div>
            <div className="card-title">Create recovery campaign</div>
            <div className="card-subtitle">
              Target: <strong>{SEGMENT_LABELS[selectedSegment].label}</strong> · {eligible.length} eligible payments · {filteredPayments.length} total
            </div>
          </div>
        </div>

        {selectedSegment === 'fraud_flag' && (
          <div className="fraud-note">
            <ShieldCheck size={15} />
            <span>Fraud-flagged payments are hard stops — they can never enter a campaign. Pick another segment to launch outreach.</span>
          </div>
        )}

        <div className="campaign-form">
          <label className="campaign-label">
            Campaign name
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder={`${SEGMENT_LABELS[selectedSegment].label} recovery · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
              className="campaign-input"
            />
          </label>

          <div className="campaign-strategy-row">
            {(Object.keys(STRATEGY_CONFIG) as StrategyKey[]).map((s) => {
              const cfg = STRATEGY_CONFIG[s];
              const f = forecast.perStrategy.find((p) => p.key === s)!;
              return (
                <button
                  key={s}
                  type="button"
                  className={`strategy-btn ${strategy === s ? 'active' : ''}`}
                  onClick={() => setStrategy(s)}
                  aria-pressed={strategy === s}
                >
                  <span className="strategy-top"><Zap size={14} />{cfg.label}</span>
                  <span className="strategy-hint">{cfg.maxAiCalls} AI calls · {cfg.windowHours}h window</span>
                  <span className="strategy-cost">≈{INR(f.cost)} cost · {INR(f.net)} net</span>
                </button>
              );
            })}
          </div>

          {/* Pre-launch forecast */}
          <div className="forecast">
            <div className="forecast-head">
              <span className="section-label">Pre-launch forecast · {STRATEGY_CONFIG[strategy].label}</span>
              <span className="muted">{eligible.length} eligible payments</span>
            </div>
            {eligible.length > 0 ? (
              <>
                <div className="forecast-grid">
                  <div className="forecast-cell">
                    <span className="forecast-label">Predicted recovery</span>
                    <strong>{INR(forecast.predicted)}</strong>
                  </div>
                  <div className="forecast-cell">
                    <span className="forecast-label">Est. outreach cost</span>
                    <strong>{INR(forecast.active.cost)}</strong>
                  </div>
                  <div className="forecast-cell">
                    <span className="forecast-label">Est. net</span>
                    <strong className="ok">{INR(forecast.active.net)}</strong>
                  </div>
                  <div className="forecast-cell">
                    <span className="forecast-label">AI coverage</span>
                    <strong>{forecast.active.aiCalls}/{eligible.length} rescored</strong>
                  </div>
                </div>
                {forecast.seqCounts.length > 0 && (
                  <div className="forecast-seq">
                    <span className="muted">Enrolls into dunning:</span>
                    {forecast.seqCounts.map((s) => (
                      <span key={s.name} className="seq-chip" title={`${s.stages} stages`}>
                        {s.name} × {s.count}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">No eligible payments in this segment — the policy gate stops all of them. Pick another segment or rescore the book.</p>
            )}
          </div>

          <button type="button" className="btn-primary campaign-create-btn" onClick={handleCreate}>
            <Rocket size={14} /> Create campaign
          </button>
        </div>
      </div>

      {/* Campaign List */}
      <div className="card padded-card">
        <div className="card-header-row">
          <div>
            <div className="card-title">Campaigns</div>
            <div className="card-subtitle">{campaigns.length} campaign(s) created</div>
          </div>
          <span className="card-count">{campaigns.filter((c) => c.status === 'completed').length} completed</span>
        </div>

        {campaigns.length === 0 && (
          <div className="empty-state">
            <p>No campaigns yet. Create one above to start a coordinated recovery batch.</p>
          </div>
        )}

        <div className="campaign-list">
          {campaigns.map((camp) => {
            const roi = campaignROI(camp);
            const cal = predictedVsActual(camp);
            const isActive = running && activeCampaignId === camp.id;

            return (
              <div key={camp.id} className={`campaign-item ${camp.status}`}>
                <div className="campaign-item-header">
                  <div className="campaign-item-title">
                    <strong>{camp.name}</strong>
                    <span className={`tag-badge st-${camp.status}`}>{camp.status}</span>
                    <span className="muted">{camp.payment_ids.length} payments · {SEGMENT_LABELS[camp.segment].label} · {STRATEGY_CONFIG[camp.strategy as StrategyKey]?.label ?? camp.strategy}</span>
                  </div>
                  <div className="campaign-actions">
                    {camp.status === 'draft' && (
                      <>
                        {confirmLaunch === camp.id ? (
                          <>
                            <button type="button" className="btn-primary" onClick={() => handleConfirmLaunch(camp)} disabled={running}>
                              Confirm launch
                            </button>
                            <button type="button" className="ghost-btn" onClick={() => setConfirmLaunch(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn-primary" onClick={() => setConfirmLaunch(camp.id)} disabled={running}>
                            <Rocket size={14} /> Launch
                          </button>
                        )}
                      </>
                    )}
                    {camp.status === 'running' && (
                      <button type="button" className="ghost-btn" onClick={() => handlePause(camp.id)}>
                        <Pause size={14} /> Pause
                      </button>
                    )}
                    {camp.status === 'paused' && (
                      <button type="button" className="ghost-btn" onClick={() => handleLaunch(camp)} disabled={running}>
                        <Play size={14} /> Resume
                      </button>
                    )}
                    {camp.status !== 'running' && (
                      confirmDelete === camp.id ? (
                        <>
                          <button type="button" className="ghost-btn danger-text" onClick={() => handleDelete(camp.id)}>
                            Delete
                          </button>
                          <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(camp.id)} aria-label={`Delete ${camp.name}`}>
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {isActive && (
                  <div className="campaign-progress">
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span>{progress.toFixed(0)}% · {camp.metrics.total_attempted} of {camp.payment_ids.length}</span>
                  </div>
                )}

                {camp.status === 'completed' && (
                  <div className="camp-cal">
                    <div className="camp-cal-row">
                      <span>Predicted <strong>{INR(cal.predicted)}</strong></span>
                      <span>Actual <strong className="ok">{INR(cal.actual)}</strong></span>
                      <span className={`cal-pill ${cal.ratio >= 0.7 && cal.ratio <= 1.3 ? 'good' : 'off'}`}>
                        {pct(cal.ratio)} calibration
                      </span>
                    </div>
                    <div className="cal-track">
                      <div className="cal-fill" style={{ width: `${Math.min(100, cal.ratio * 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="campaign-metrics-grid">
                  <div className="camp-metric">
                    <span className="camp-metric-label">Attempted</span>
                    <span className="camp-metric-value">{camp.metrics.total_attempted}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Recovered</span>
                    <span className="camp-metric-value ok">{camp.metrics.total_recovered}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Predicted</span>
                    <span className="camp-metric-value">{INR(camp.metrics.predicted_recovery_amount)}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Actual</span>
                    <span className="camp-metric-value ok">{INR(camp.metrics.total_recovery_amount)}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Spend</span>
                    <span className="camp-metric-value">{INR(roi.totalSpent)}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Avg confidence</span>
                    <span className="camp-metric-value">{pct(camp.metrics.avg_confidence)}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">Cost / recovery</span>
                    <span className="camp-metric-value lift">{roi.costPerRecovery > 0 ? INR(roi.costPerRecovery) : '—'}</span>
                  </div>
                </div>

                {Object.keys(camp.metrics.channel_breakdown).length > 0 && (
                  <div className="campaign-channels">
                    <span className="channel-label">Channels:</span>
                    {Object.entries(camp.metrics.channel_breakdown).map(([ch, count]) => (
                      <span key={ch} className="channel-pill">{ch}: {count}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
