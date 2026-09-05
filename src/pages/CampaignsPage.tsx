import { useState, useMemo, useCallback } from 'react';
import { useRecovery } from '../context/RecoveryContext';
import { buildCustomerProfile, segmentSummary, type CustomerSegment } from '../engine/profiles';
import { createCampaign, executeCampaign, loadCampaigns, pauseCampaign, saveCampaigns, campaignROI, type Campaign } from '../engine/campaigns';
import { INR, pct } from '../format';
import { Rocket, Pause, Play, Target, TrendingUp, Users, Zap, Trash2 } from 'lucide-react';

const SEGMENT_LABELS: Record<CustomerSegment | 'all', { label: string; color: string }> = {
  all: { label: 'All segments', color: '#6366f1' },
  whale: { label: 'Whale (high-value loyal)', color: '#f59e0b' },
  loyal: { label: 'Loyal (temp issue)', color: '#10b981' },
  new: { label: 'New customers', color: '#3b82f6' },
  at_risk: { label: 'At risk', color: '#f97316' },
  dormant: { label: 'Dormant', color: '#94a3b8' },
  fraud_flag: { label: 'Fraud flagged', color: '#ef4444' },
};

export function CampaignsPage() {
  const { payments, results, policyConfig, openrouterKey, merchantId } = useRecovery();

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns());
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | 'all'>('all');
  const [campaignName, setCampaignName] = useState('');
  const [strategy, setStrategy] = useState<'aggressive' | 'conservative' | 'balanced'>('balanced');
  const [running, setRunning] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLaunch, setConfirmLaunch] = useState<string | null>(null);

  const profiles = useMemo(() => payments.map(buildCustomerProfile), [payments]);
  const segSummary = useMemo(() => segmentSummary(profiles), [profiles]);

  const filteredPayments = useMemo(() => {
    if (selectedSegment === 'all') return payments;
    return payments.filter((p) => buildCustomerProfile(p).segment === selectedSegment);
  }, [payments, selectedSegment]);

  const eligibleCount = useMemo(() => {
    return filteredPayments.filter((p) => {
      const r = results.get(p.id);
      return r && r.policy.result === 'passed' && r.audit.decision !== 'none';
    }).length;
  }, [filteredPayments, results]);

  const handleCreate = useCallback(() => {
    if (!campaignName.trim()) return;
    const camp = createCampaign(campaignName.trim(), selectedSegment, strategy, payments, results);
    setCampaigns((prev) => [...prev, camp]);
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

  return (
    <div className="page-stack">
      {/* Segment Overview */}
      <div className="card padded-card">
        <div className="card-title">Customer segments</div>
        <div className="card-subtitle">AI-classified segments with risk scores and recovery probabilities</div>
        <div className="campaign-segment-grid">
          {(Object.keys(segSummary) as CustomerSegment[]).map((seg) => (
            <div
              key={seg}
              className={`segment-card ${selectedSegment === seg ? 'active' : ''}`}
              onClick={() => setSelectedSegment(seg)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSegment(seg); } }}
              role="button"
              tabIndex={0}
            >
              <div className="segment-header">
                <span className="segment-dot" style={{ background: SEGMENT_LABELS[seg].color }} />
                <span className="segment-name">{SEGMENT_LABELS[seg].label}</span>
              </div>
              <div className="segment-stats">
                <div className="seg-stat">
                  <Users size={12} />
                  <span>{segSummary[seg].count}</span>
                </div>
                <div className="seg-stat">
                  <Target size={12} />
                  <span>{pct(segSummary[seg].avgRecoveryProb)}</span>
                </div>
                <div className="seg-stat">
                  <TrendingUp size={12} />
                  <span>{pct(segSummary[seg].avgRisk)} risk</span>
                </div>
                <div className="seg-stat">
                  <span className="amt-cell">{INR(segSummary[seg].totalValue)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Builder */}
      <div className="card padded-card">
        <div className="card-title">Create recovery campaign</div>
        <div className="card-subtitle">
          Target: <strong>{SEGMENT_LABELS[selectedSegment].label}</strong> · {eligibleCount} eligible payments · {filteredPayments.length} total
        </div>

        <div className="campaign-form">
          <label className="campaign-label">
            Campaign name
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder={`Recovery campaign for ${SEGMENT_LABELS[selectedSegment].label.toLowerCase()}`}
              className="campaign-input"
            />
          </label>

          <div className="campaign-strategy-row">
            {(['balanced', 'aggressive', 'conservative'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`strategy-btn ${strategy === s ? 'active' : ''}`}
                onClick={() => setStrategy(s)}
              >
                <Zap size={14} />
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="strategy-hint">
                  {s === 'aggressive' ? '30 AI calls · 48h window' : s === 'conservative' ? '8 AI calls · 72h window' : '15 AI calls · 60h window'}
                </span>
              </button>
            ))}
          </div>

          <button type="button" className="primary-btn campaign-create-btn" onClick={handleCreate} disabled={!campaignName.trim()}>
            Create campaign
          </button>
        </div>
      </div>

      {/* Campaign List */}
      <div className="card padded-card">
        <div className="card-title">Campaigns</div>
        <div className="card-subtitle">{campaigns.length} campaign(s) created</div>

        {campaigns.length === 0 && (
          <div className="empty-state">
            <p>No campaigns yet. Create one above to start a coordinated recovery batch.</p>
          </div>
        )}

        <div className="campaign-list">
          {campaigns.map((camp) => {
            const roi = campaignROI(camp);
            const isActive = running && activeCampaignId === camp.id;

            return (
              <div key={camp.id} className={`campaign-item ${camp.status}`}>
                <div className="campaign-item-header">
                  <div>
                    <strong>{camp.name}</strong>
                    <span className={`tag-badge ${camp.status}`}>{camp.status}</span>
                    <span className="muted">{camp.payment_ids.length} payments · {SEGMENT_LABELS[camp.segment].label}</span>
                  </div>
                  <div className="campaign-actions">
                    {camp.status === 'draft' && (
                      <>
                        {confirmLaunch === camp.id ? (
                          <>
                            <button type="button" className="primary-btn" onClick={() => handleConfirmLaunch(camp)} disabled={running}>
                              Confirm launch
                            </button>
                            <button type="button" className="ghost-btn" onClick={() => setConfirmLaunch(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="primary-btn" onClick={() => setConfirmLaunch(camp.id)} disabled={running}>
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
                          <button type="button" className="ghost-btn" style={{ color: '#ef4444' }} onClick={() => handleDelete(camp.id)}>
                            Delete
                          </button>
                          <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(camp.id)}>
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
                    <span className="camp-metric-label">Avg confidence</span>
                    <span className="camp-metric-value">{pct(camp.metrics.avg_confidence)}</span>
                  </div>
                  <div className="camp-metric">
                    <span className="camp-metric-label">ROI</span>
                    <span className="camp-metric-value lift">{roi.roi === Infinity ? '∞' : `${roi.roi.toFixed(1)}x`}</span>
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
