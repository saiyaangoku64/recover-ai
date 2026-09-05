import type {
  Payment, RecoveryResult, AnalyticsSnapshot, CustomerSegment,
  RecoveryOutcome, ReasonIntel, TrendPoint, FunnelStage,
} from '../types';
import { buildCustomerProfile, segmentBatch } from './profiles';
import { computeOutcomeMetrics, loadOutcomes } from './outcomes';
import { getPlaybook } from './smartRetry';

/**
 * Analytics Engine — computes real metrics from outcomes and predictions.
 * Replaces the naive "80% flat rate" baseline with measured recovery data.
 */

/**
 * Build a full analytics snapshot from current results + outcomes.
 */
export function buildAnalyticsSnapshot(
  payments: Payment[],
  _results: Map<string, RecoveryResult>,
): AnalyticsSnapshot {
  const profiles = segmentBatch(payments);
  const outcomeList = loadOutcomes();
  const outcomeMetrics = computeOutcomeMetrics(outcomeList);

  const atRisk = payments.reduce((s, p) => s + p.amount, 0);
  const recovered = outcomeMetrics.totalActual;
  const predicted = outcomeMetrics.totalPredicted;

  const segmentBreakdown: Record<CustomerSegment, { count: number; value: number; recovery_rate: number }> = {
    whale: { count: 0, value: 0, recovery_rate: 0 },
    loyal: { count: 0, value: 0, recovery_rate: 0 },
    new: { count: 0, value: 0, recovery_rate: 0 },
    at_risk: { count: 0, value: 0, recovery_rate: 0 },
    dormant: { count: 0, value: 0, recovery_rate: 0 },
    fraud_flag: { count: 0, value: 0, recovery_rate: 0 },
  };

  payments.forEach((p) => {
    const profile = buildCustomerProfile(p);
    const seg = segmentBreakdown[profile.segment];
    seg.count++;
    seg.value += p.amount;
  });

  // Compute per-segment recovery rates from outcomes
  for (const outcome of outcomeList) {
    const profile = profiles.get(outcome.payment_id);
    if (!profile) continue;
    const seg = segmentBreakdown[profile.segment];
    if (outcome.status === 'recovered') {
      seg.recovery_rate = (seg.recovery_rate * seg.count + 1) / seg.count;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    total_payments: payments.length,
    at_risk_value: atRisk,
    recovered_value: recovered,
    predicted_value: predicted,
    recovery_rate: atRisk > 0 ? recovered / atRisk : 0,
    calibration_error: outcomeMetrics.calibrationError,
    roi_score: atRisk > 0 ? (recovered - 0) / atRisk : 0, // No marginal cost in demo
    segment_breakdown: segmentBreakdown,
  };
}

/**
 * Compute calibration error — how far off are our predictions from actuals?
 * Low calibration error = predictions are honest and trustworthy.
 */
export function computeCalibration(_results: Map<string, RecoveryResult>): {
  overpredicted: number;
  underpredicted: number;
  wellCalibrated: number;
  meanAbsoluteError: number;
} {
  const outcomes = loadOutcomes();
  if (outcomes.length === 0) {
    return { overpredicted: 0, underpredicted: 0, wellCalibrated: 0, meanAbsoluteError: 0 };
  }

  let overpredicted = 0;
  let underpredicted = 0;
  let wellCalibrated = 0;
  let totalError = 0;

  for (const outcome of outcomes) {
    const error = outcome.predicted_recovery - outcome.actual_recovery;
    totalError += Math.abs(error);

    if (error > 100) overpredicted++;
    else if (error < -100) underpredicted++;
    else wellCalibrated++;
  }

  return {
    overpredicted,
    underpredicted,
    wellCalibrated,
    meanAbsoluteError: outcomes.length > 0 ? totalError / outcomes.length : 0,
  };
}

/**
 * Build channel effectiveness analysis from outcomes.
 */
export function channelEffectiveness(outcomes: RecoveryOutcome[]): Record<string, {
  attempts: number;
  recoveries: number;
  recoveryRate: number;
  totalActual: number;
  totalPredicted: number;
  avgConfidence: number;
}> {
  const channels: Record<string, { attempts: number; recoveries: number; totalActual: number; totalPredicted: number; totalConfidence: number }> = {};

  for (const outcome of outcomes) {
    const ch = outcome.channel || 'none';
    if (!channels[ch]) {
      channels[ch] = { attempts: 0, recoveries: 0, totalActual: 0, totalPredicted: 0, totalConfidence: 0 };
    }
    channels[ch].attempts++;
    if (outcome.status === 'recovered') channels[ch].recoveries++;
    channels[ch].totalActual += outcome.actual_recovery;
    channels[ch].totalPredicted += outcome.predicted_recovery;
    channels[ch].totalConfidence += outcome.prediction_confidence;
  }

  const result: Record<string, { attempts: number; recoveries: number; recoveryRate: number; totalActual: number; totalPredicted: number; avgConfidence: number }> = {};

  for (const [key, val] of Object.entries(channels)) {
    result[key] = {
      attempts: val.attempts,
      recoveries: val.recoveries,
      recoveryRate: val.attempts > 0 ? val.recoveries / val.attempts : 0,
      totalActual: val.totalActual,
      totalPredicted: val.totalPredicted,
      avgConfidence: val.attempts > 0 ? val.totalConfidence / val.attempts : 0,
    };
  }

  return result;
}

/**
 * Compute the "lift" over naive retry baseline.
 * This is the key Buildathon metric: how much better is REVIVE than blind retry?
 */
export function computeLift(
  actualRecovered: number,
  naiveRecovered: number,
): { absoluteLift: number; percentLift: number; roiMultiple: number } {
  const absoluteLift = actualRecovered - naiveRecovered;
  const percentLift = naiveRecovered > 0 ? absoluteLift / naiveRecovered : 0;
  const roiMultiple = naiveRecovered > 0 ? actualRecovered / naiveRecovered : 1;
  return { absoluteLift, percentLift, roiMultiple };
}

/**
 * Build a recovery time distribution from outcomes.
 */
export function recoveryTimeDistribution(outcomes: RecoveryOutcome[]): {
  bucket: string;
  count: number;
  value: number;
}[] {
  const buckets = [
    { label: '< 1 hour', max: 3600000 },
    { label: '1–6 hours', max: 6 * 3600000 },
    { label: '6–24 hours', max: 24 * 3600000 },
    { label: '1–3 days', max: 3 * 86400000 },
    { label: '3–7 days', max: 7 * 86400000 },
    { label: '> 7 days', max: Infinity },
  ];

  const dist = buckets.map((b) => ({ bucket: b.label, count: 0, value: 0 }));

  for (const outcome of outcomes) {
    if (outcome.status !== 'recovered') continue;
    const elapsed = new Date(outcome.last_updated_at).getTime() - new Date(outcome.first_contact_at).getTime();
    const idx = buckets.findIndex((b) => elapsed < b.max);
    if (idx >= 0) {
      dist[idx].count++;
      dist[idx].value += outcome.actual_recovery;
    }
  }

  return dist;
}

/* ── Stripe-grade recovery intelligence ─────────────────────── */

/**
 * Per-decline-code intelligence: volume, value, expected recovery,
 * recovery rate, and the playbook strategy — the "why" behind every code.
 */
export function recoveryByReason(
  payments: Payment[],
  results: Map<string, RecoveryResult>,
): ReasonIntel[] {
  const byReason = new Map<string, { category: 'hard' | 'soft'; count: number; value: number; recoveredEV: number; actioned: number }>();

  for (const p of payments) {
    const slot = byReason.get(p.failure_reason) ?? {
      category: p.failure_category,
      count: 0,
      value: 0,
      recoveredEV: 0,
      actioned: 0,
    };
    slot.count++;
    slot.value += p.amount;
    const r = results.get(p.id);
    if (r) {
      slot.recoveredEV += r.audit.expected_recovery;
      if (r.audit.expected_recovery > 0) slot.actioned++;
    }
    byReason.set(p.failure_reason, slot);
  }

  return [...byReason.entries()]
    .map(([reason, s]) => ({
      reason,
      category: s.category,
      count: s.count,
      value: s.value,
      recoveredEV: s.recoveredEV,
      recoveryRate: s.value > 0 ? s.recoveredEV / s.value : 0,
      actioned: s.actioned,
      strategy: getPlaybook(reason).strategy,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Cumulative revenue trend grouped by failure day.
 * Real data — groups the actual book by created_at, so the chart
 * reflects this dataset instead of synthetic noise.
 */
export function revenueTrend(
  payments: Payment[],
  results: Map<string, RecoveryResult>,
  days = 14,
): TrendPoint[] {
  const dayKey = (d: Date) => d.toISOString().split('T')[0];
  const buckets = new Map<string, { atRisk: number; recovered: number }>();

  for (const p of payments) {
    const d = new Date(p.created_at);
    if (isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const slot = buckets.get(key) ?? { atRisk: 0, recovered: 0 };
    slot.atRisk += p.amount;
    slot.recovered += results.get(p.id)?.audit.expected_recovery ?? 0;
    buckets.set(key, slot);
  }

  const sorted = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const recent = sorted.slice(-days);

  let cumRisk = 0;
  let cumRec = 0;
  return recent.map(([date, s]) => {
    cumRisk += s.atRisk;
    cumRec += s.recovered;
    const d = new Date(date + 'T00:00:00');
    return {
      date,
      label: isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      atRisk: cumRisk,
      recovered: cumRec,
    };
  });
}

/**
 * Recovery funnel: detected → passed gate → engaged → expected recovered.
 * Value-weighted so judges see money, not just counts.
 */
export function funnelStages(
  payments: Payment[],
  results: Map<string, RecoveryResult>,
): FunnelStage[] {
  const detected = { count: payments.length, value: payments.reduce((s, p) => s + p.amount, 0) };
  let passed = { count: 0, value: 0 };
  let engaged = { count: 0, value: 0 };
  let recovered = { count: 0, value: 0 };

  results.forEach((r) => {
    if (r.policy.result === 'passed') {
      passed.count++;
      passed.value += r.payment.amount;
    }
    if (r.audit.expected_recovery > 0) {
      engaged.count++;
      engaged.value += r.payment.amount;
      recovered.count++;
      recovered.value += r.audit.expected_recovery;
    }
  });

  const stages: FunnelStage[] = [
    { id: 'detected', label: 'Failed detected', ...detected, conversion: 1 },
    { id: 'passed', label: 'Passed policy gate', ...passed, conversion: detected.count ? passed.count / detected.count : 0 },
    { id: 'engaged', label: 'Recovery engaged', ...engaged, conversion: passed.count ? engaged.count / passed.count : 0 },
    { id: 'recovered', label: 'Expected recovered', ...recovered, conversion: engaged.count ? recovered.count / engaged.count : 0 },
  ];
  return stages;
}

/**
 * Channel mix straight from evaluated results (no outcome dependency).
 */
export function channelMixFromResults(results: Map<string, RecoveryResult>): {
  channel: string;
  count: number;
  value: number;
}[] {
  const mix = new Map<string, { count: number; value: number }>();
  results.forEach((r) => {
    const ch = r.policy.result === 'blocked' ? 'stopped' : r.audit.recovery_channel ?? r.audit.decision;
    const slot = mix.get(ch) ?? { count: 0, value: 0 };
    slot.count++;
    slot.value += r.audit.expected_recovery;
    mix.set(ch, slot);
  });
  return [...mix.entries()]
    .map(([channel, s]) => ({ channel, ...s }))
    .sort((a, b) => b.value - a.value);
}
