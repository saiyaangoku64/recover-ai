import type { Payment, RecoveryResult, RecoveryOutcome, OutcomeStatus } from '../types';

/**
 * Outcome Tracking Engine — records what actually happened after a recovery
 * decision was made. In production this would listen to Razorpay webhooks
 * (payment.authorized, payment.captured, payment.failed) to determine real outcomes.
 *
 * In demo mode, outcomes are simulated with calibrated probabilities based on
 * the initial prediction confidence and customer profile.
 */

const OUTCOMES_KEY = 'revive-outcomes';

/**
 * Load persisted outcomes from localStorage.
 */
export function loadOutcomes(): RecoveryOutcome[] {
  try {
    const raw = localStorage.getItem(OUTCOMES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist outcomes to localStorage.
 */
export function saveOutcomes(outcomes: RecoveryOutcome[]) {
  localStorage.setItem(OUTCOMES_KEY, JSON.stringify(outcomes.slice(0, 1000)));
}

/**
 * Record an outcome for a recovery attempt.
 */
export function recordOutcome(
  payment: Payment,
  result: RecoveryResult,
  status: OutcomeStatus,
  actualRecovery: number = 0,
): RecoveryOutcome {
  const outcome: RecoveryOutcome = {
    payment_id: payment.id,
    predicted_recovery: result.audit.expected_recovery,
    actual_recovery: actualRecovery,
    status,
    steps_taken: [result.audit.decision],
    channel: result.audit.recovery_channel,
    first_contact_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    prediction_confidence: result.llm.confidence,
  };

  const outcomes = loadOutcomes();
  const existing = outcomes.findIndex((o) => o.payment_id === payment.id);
  if (existing >= 0) {
    outcomes[existing] = { ...outcomes[existing], ...outcome };
  } else {
    outcomes.unshift(outcome);
  }
  saveOutcomes(outcomes);
  return outcome;
}

/**
 * Simulate outcomes for a batch of evaluated payments.
 * Uses calibrated probabilities based on prediction confidence and failure category.
 * This is the demo-mode feedback loop — real mode would use webhook events.
 */
export function simulateOutcomes(results: Map<string, RecoveryResult>): RecoveryOutcome[] {
  const outcomes: RecoveryOutcome[] = [];

  results.forEach((result) => {
    if (result.policy.result === 'blocked' || result.audit.decision === 'none') {
      outcomes.push({
        payment_id: result.payment.id,
        predicted_recovery: 0,
        actual_recovery: 0,
        status: 'expired',
        steps_taken: ['abstain'],
        channel: null,
        first_contact_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        prediction_confidence: result.llm.confidence,
      });
      return;
    }

    // Calibrated simulation: success probability = confidence * category_adjustment
    const categoryBoost =
      result.payment.failure_category === 'soft' ? 1.15 : 0.3;
    const retryPenalty = Math.max(0, 1 - result.payment.retry_count * 0.12);
    const successProb = Math.min(
      0.95,
      result.llm.confidence * categoryBoost * retryPenalty,
    );

    const succeeded = Math.random() < successProb;

    let status: OutcomeStatus;
    let actualRecovery = 0;

    if (succeeded) {
      status = 'recovered';
      // Actual recovery is usually close to predicted, with some variance
      const variance = 0.85 + Math.random() * 0.3; // 85%–115% of predicted
      actualRecovery = Math.round(result.audit.expected_recovery * variance);
    } else {
      // Simulate if it was close or a total miss
      status = Math.random() < 0.3 ? 'failed' : 'expired';
      actualRecovery = 0;
    }

    const outcome: RecoveryOutcome = {
      payment_id: result.payment.id,
      predicted_recovery: result.audit.expected_recovery,
      actual_recovery: actualRecovery,
      status,
      steps_taken: [result.audit.decision],
      channel: result.audit.recovery_channel,
      first_contact_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      prediction_confidence: result.llm.confidence,
    };

    outcomes.push(outcome);
  });

  // Merge with existing outcomes instead of overwriting
  const existing = loadOutcomes();
  const merged = [...outcomes];
  for (const e of existing) {
    if (!merged.some((o) => o.payment_id === e.payment_id)) {
      merged.push(e);
    }
  }
  saveOutcomes(merged);
  return outcomes;
}

/**
 * Get recovery actuals for a set of payment IDs.
 */
export function getOutcomeMap(outcomes: RecoveryOutcome[]): Map<string, RecoveryOutcome> {
  const map = new Map<string, RecoveryOutcome>();
  for (const o of outcomes) {
    map.set(o.payment_id, o);
  }
  return map;
}

/**
 * Compute aggregate outcome metrics.
 */
export function computeOutcomeMetrics(outcomes: RecoveryOutcome[]) {
  const total = outcomes.length;
  const recovered = outcomes.filter((o) => o.status === 'recovered');
  const failed = outcomes.filter((o) => o.status === 'failed');
  const expired = outcomes.filter((o) => o.status === 'expired');
  const pending = outcomes.filter((o) => o.status === 'pending');

  const totalPredicted = outcomes.reduce((s, o) => s + o.predicted_recovery, 0);
  const totalActual = outcomes.reduce((s, o) => s + o.actual_recovery, 0);

  return {
    total,
    recovered: recovered.length,
    failed: failed.length,
    expired: expired.length,
    pending: pending.length,
    totalPredicted,
    totalActual,
    recoveryRate: total > 0 ? recovered.length / total : 0,
    calibrationError: totalPredicted > 0
      ? Math.abs(totalPredicted - totalActual) / totalPredicted
      : 0,
  };
}
