import type { Payment, PolicyConfig, RecoveryResult } from '../types';
import { heuristicDecision } from './llm';
import { checkPolicy } from './policy';
import { buildRetryPlan } from './smartRetry';
import { scoreRisk } from './risk';

export function evaluateSync(
  payment: Payment,
  policyConfig: PolicyConfig,
  merchantId?: string | null,
  book?: Payment[],
): RecoveryResult {
  const llm = heuristicDecision(payment);
  const policy = checkPolicy(payment, llm, policyConfig);
  const finalDecision = policy.result === 'blocked' ? 'none' : llm.decision;
  const finalRecovery = policy.result === 'blocked' ? 0 : llm.expected_recovery_value;

  return {
    payment,
    llm,
    policy,
    source: 'heuristic',
    retryPlan: buildRetryPlan(payment),
    risk: scoreRisk(payment, book),
    audit: {
      payment_id: payment.id,
      amount: payment.amount,
      decision: finalDecision,
      confidence: llm.confidence,
      reason: llm.reason,
      policy_result: policy.result,
      policy_reason: policy.result === 'blocked' ? policy.reason : null,
      recovery_channel: policy.result === 'blocked' ? null : llm.recovery_channel,
      ptp_status: finalDecision === 'promise_to_pay' ? 'pending' : null,
      ptp_due_date: finalDecision === 'promise_to_pay' ? llm.ptp_due_date || null : null,
      expected_recovery: finalRecovery,
      merchant_id: merchantId ?? null,
    },
  };
}

export function hydrateBatch(
  payments: Payment[],
  policyConfig: PolicyConfig,
  merchantId: string,
  existing: Map<string, RecoveryResult>,
): Map<string, RecoveryResult> {
  const next = new Map<string, RecoveryResult>();

  for (const payment of payments) {
    const cur = existing.get(payment.id);
    if (cur && cur.source === 'ai') {
      // Preserve AI results but re-gate them on current policy.
      const policy = checkPolicy(payment, cur.llm, policyConfig);
      const finalDecision = policy.result === 'blocked' ? 'none' : cur.llm.decision;
      const finalRecovery = policy.result === 'blocked' ? 0 : cur.llm.expected_recovery_value;
      next.set(payment.id, {
        ...cur,
        policy,
        retryPlan: buildRetryPlan(payment),
        risk: scoreRisk(payment, payments),
        audit: {
          ...cur.audit,
          decision: finalDecision,
          confidence: cur.llm.confidence,
          reason: cur.llm.reason,
          policy_result: policy.result,
          policy_reason: policy.result === 'blocked' ? policy.reason : null,
          recovery_channel: policy.result === 'blocked' ? null : cur.llm.recovery_channel,
          expected_recovery: finalRecovery,
          merchant_id: merchantId,
          // Preserve PTP state from existing audit
          ptp_status: cur.audit.ptp_status,
          ptp_due_date: cur.audit.ptp_due_date,
        },
      });
    } else {
      next.set(payment.id, evaluateSync(payment, policyConfig, merchantId, payments));
    }
  }

  return next;
}
