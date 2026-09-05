import type { Payment, LLMResult, PolicyResult, PolicyConfig, PolicyRuleView } from '../types';

export const DEFAULT_POLICY: PolicyConfig = {
  minConfidence: 0.6,
  maxRetries: 3,
  maxDaysSinceFailure: 10,
  highValueAmount: 50000,
  highValueMinConfidence: 0.85,
  fatigueRetryCount: 2,
};

/**
 * Deterministic policy gate — runs AFTER LLM, BEFORE any action.
 * The AI's output is NEVER trusted without passing this.
 */
export function checkPolicy(
  payment: Payment,
  llm: LLMResult,
  config: PolicyConfig = DEFAULT_POLICY,
): PolicyResult {
  if (llm.confidence < config.minConfidence) {
    return {
      result: 'blocked',
      reason: `Confidence too low (${(llm.confidence * 100).toFixed(0)}% < ${(config.minConfidence * 100).toFixed(0)}% threshold)`,
    };
  }

  if (payment.retry_count >= config.maxRetries) {
    return {
      result: 'blocked',
      reason: `Retry count exhausted (${payment.retry_count} ≥ ${config.maxRetries} max)`,
    };
  }

  if (payment.failure_category === 'hard') {
    return {
      result: 'blocked',
      reason: `Hard decline (${payment.failure_reason}) — no contact, no retry, no recovery action allowed`,
    };
  }

  if (payment.days_since_failure > config.maxDaysSinceFailure) {
    return {
      result: 'blocked',
      reason: `Payment too stale (${payment.days_since_failure} days > ${config.maxDaysSinceFailure} day limit)`,
    };
  }

  if (payment.amount > config.highValueAmount && llm.confidence < config.highValueMinConfidence) {
    return {
      result: 'blocked',
      reason: `High-value payment (₹${payment.amount.toLocaleString('en-IN')}) requires ≥${(config.highValueMinConfidence * 100).toFixed(0)}% confidence`,
    };
  }

  if (
    llm.decision === 'retry' &&
    payment.retry_count >= config.fatigueRetryCount &&
    payment.failure_category === 'soft'
  ) {
    return {
      result: 'blocked',
      reason: `Soft decline already retried ${payment.retry_count} times — customer fatigue risk`,
    };
  }

  return { result: 'passed', reason: 'All policy checks passed' };
}

export function inspectPolicyRules(
  payment: Payment,
  llm: LLMResult | undefined,
  config: PolicyConfig,
): PolicyRuleView[] {
  const conf = llm?.confidence;

  return [
    {
      id: 'confidence',
      label: `Confidence ≥ ${(config.minConfidence * 100).toFixed(0)}%`,
      passed: conf === undefined ? null : conf >= config.minConfidence,
      detail: conf === undefined ? 'Pending evaluation' : `${(conf * 100).toFixed(0)}%`,
    },
    {
      id: 'retries',
      label: `Retry count < ${config.maxRetries}`,
      passed: payment.retry_count < config.maxRetries,
      detail: `${payment.retry_count} retries so far`,
    },
    {
      id: 'hard',
      label: 'Do not auto-retry hard declines',
      passed: llm === undefined ? null : !(llm.decision === 'retry' && payment.failure_category === 'hard'),
      detail: `${payment.failure_category} · ${payment.failure_reason.replace(/_/g, ' ')}`,
    },
    {
      id: 'stale',
      label: `Days since failure ≤ ${config.maxDaysSinceFailure}`,
      passed: payment.days_since_failure <= config.maxDaysSinceFailure,
      detail: `${payment.days_since_failure} days`,
    },
    {
      id: 'highvalue',
      label: `High-value (>₹${config.highValueAmount.toLocaleString('en-IN')}) requires ≥${(config.highValueMinConfidence * 100).toFixed(0)}% confidence`,
      passed:
        payment.amount <= config.highValueAmount
          ? true
          : conf === undefined
            ? null
            : conf >= config.highValueMinConfidence,
      detail: `₹${payment.amount.toLocaleString('en-IN')}`,
    },
    {
      id: 'fatigue',
      label: `Soft-decline retry fatigue (auto-retry only if retries < ${config.fatigueRetryCount})`,
      passed:
        llm === undefined
          ? null
          : !(llm.decision === 'retry' && payment.retry_count >= config.fatigueRetryCount && payment.failure_category === 'soft'),
      detail: `retries ${payment.retry_count}`,
    },
  ];
}
