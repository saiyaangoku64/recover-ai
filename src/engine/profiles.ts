import type { Payment, CustomerProfile, CustomerSegment } from '../types';
export type { CustomerSegment } from '../types';

/**
 * Customer segmentation engine — classifies customers into behavioral
 * segments based on payment history, failure patterns, and value signals.
 *
 * Each segment maps to a different recovery strategy:
 * - whale: high-value + loyal → gentle, personal channel
 * - loyal: many successes, temp issue → PTP-first approach
 * - new: first few payments → reminder channel
 * - at_risk: declining engagement → aggressive multi-channel
 * - dormant: long silence → low-investment reminder
 * - fraud_flag: hard decline patterns → abstain, audit only
 */
export function segmentCustomer(payment: Payment): CustomerSegment {
  if (payment.failure_category === 'hard') return 'fraud_flag';

  if (payment.previous_successes >= 8 && payment.amount >= 10000) return 'whale';
  if (payment.previous_successes >= 5) return 'loyal';
  if (payment.previous_successes <= 2) return 'new';
  if (payment.days_since_failure > 7) return 'dormant';
  if (payment.retry_count >= 2 && payment.previous_successes < 5) return 'at_risk';

  return 'loyal';
}

/**
 * Compute a risk score (0–1) from payment signals.
 * Higher score = higher risk of non-recovery.
 */
function computeRiskScore(payment: Payment, segment: CustomerSegment): number {
  let risk = 0;

  // Base risk from failure category
  if (payment.failure_category === 'hard') risk += 0.5;
  else risk += 0.1;

  // Retry fatigue increases risk
  risk += Math.min(payment.retry_count * 0.08, 0.3);

  // Recency decreases risk (more recent = less risky)
  risk -= Math.min(payment.days_since_failure * 0.02, 0.15);

  // Loyalty decreases risk
  risk -= Math.min(payment.previous_successes * 0.03, 0.2);

  // Segment adjustments
  const segmentModifiers: Record<CustomerSegment, number> = {
    whale: -0.15,
    loyal: -0.1,
    new: 0.05,
    at_risk: 0.15,
    dormant: 0.2,
    fraud_flag: 0.4,
  };
  risk += segmentModifiers[segment] ?? 0;

  return Math.max(0, Math.min(1, risk));
}

/**
 * Estimate recovery probability based on segment + payment signals.
 */
function computeRecoveryProbability(
  payment: Payment,
  segment: CustomerSegment,
  _riskScore: number,
): number {
  const baseRates: Record<CustomerSegment, number> = {
    whale: 0.82,
    loyal: 0.72,
    new: 0.55,
    at_risk: 0.38,
    dormant: 0.22,
    fraud_flag: 0.05,
  };

  let prob = baseRates[segment];

  // Adjust for retry count
  prob -= payment.retry_count * 0.06;

  // Adjust for recency
  prob -= payment.days_since_failure * 0.015;

  // Adjust for amount (higher amount = more careful customer, slightly higher recovery)
  if (payment.amount > 5000) prob += 0.05;

  return Math.max(0.02, Math.min(0.95, prob));
}

/**
 * Recommend the best recovery channel for a customer segment.
 */
function recommendChannel(segment: CustomerSegment, _payment: Payment): string {
  if (segment === 'fraud_flag') return 'none';
  if (segment === 'whale') return 'voice';
  if (segment === 'loyal') return 'whatsapp';
  if (segment === 'new') return 'whatsapp';
  if (segment === 'at_risk') return 'multi_channel';
  if (segment === 'dormant') return 'whatsapp';
  return 'whatsapp';
}

/**
 * Build a full customer risk profile from a single payment.
 * In production, this would aggregate across all payments for a customer.
 */
export function buildCustomerProfile(payment: Payment): CustomerProfile {
  const segment = segmentCustomer(payment);
  const riskScore = computeRiskScore(payment, segment);
  const recoveryProbability = computeRecoveryProbability(payment, segment, riskScore);
  const recommendedChannel = recommendChannel(segment, payment);

  const tags: string[] = [];
  if (payment.previous_successes >= 5) tags.push('loyal');
  if (payment.retry_count >= 3) tags.push('fatigued');
  if (payment.days_since_failure > 7) tags.push('stale');
  if (payment.amount >= 10000) tags.push('high_value');
  if (payment.failure_category === 'hard') tags.push('hard_decline');

  const churnSignal =
    payment.retry_count >= 3 ||
    payment.days_since_failure > 14 ||
    (payment.previous_successes === 0 && payment.retry_count >= 2);

  return {
    customer_id: payment.customer_id,
    name: payment.customer_name,
    email: payment.email || '',
    segment,
    lifetime_value: payment.amount * Math.max(1, payment.previous_successes),
    failure_count: payment.retry_count + 1,
    success_rate: payment.previous_successes / Math.max(1, payment.previous_successes + payment.retry_count + 1),
    avg_recovery_time_hours: payment.days_since_failure * 24,
    risk_score: riskScore,
    recovery_probability: recoveryProbability,
    recommended_channel: recommendedChannel,
    churn_signal: churnSignal,
    last_payment_at: payment.created_at,
    tags,
  };
}

/**
 * Segment a batch of payments and return summary statistics.
 */
export function segmentBatch(payments: Payment[]): Map<string, CustomerProfile> {
  const profiles = new Map<string, CustomerProfile>();
  for (const p of payments) {
    profiles.set(p.id, buildCustomerProfile(p));
  }
  return profiles;
}

/**
 * Get segment-level aggregates for dashboard display.
 */
export function segmentSummary(profiles: CustomerProfile[]): Record<CustomerSegment, { count: number; avgRisk: number; avgRecoveryProb: number; totalValue: number }> {
  const summary: Record<CustomerSegment, { count: number; avgRisk: number; avgRecoveryProb: number; totalValue: number }> = {
    whale: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
    loyal: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
    new: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
    at_risk: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
    dormant: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
    fraud_flag: { count: 0, avgRisk: 0, avgRecoveryProb: 0, totalValue: 0 },
  };

  for (const p of profiles) {
    const seg = summary[p.segment];
    seg.count++;
    seg.avgRisk += p.risk_score;
    seg.avgRecoveryProb += p.recovery_probability;
    seg.totalValue += p.lifetime_value;
  }

  for (const key of Object.keys(summary) as CustomerSegment[]) {
    const seg = summary[key];
    if (seg.count > 0) {
      seg.avgRisk /= seg.count;
      seg.avgRecoveryProb /= seg.count;
    }
  }

  return summary;
}
