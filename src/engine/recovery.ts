import type { Payment, LLMResult, RecoveryResult, AuditEvent, PolicyConfig } from '../types';
import { callLLM, heuristicDecision } from './llm';
import { checkPolicy, DEFAULT_POLICY } from './policy';
import { buildRetryPlan } from './smartRetry';
import { scoreRisk } from './risk';

/**
 * Full recovery pipeline: LLM → Policy Gate → Audit Event
 * mode = 'ai' uses real LLM, 'heuristic' uses deterministic fallback
 * Self-contained: if LLM fails, falls back to heuristic automatically
 * Every result carries a Smart-Retry plan + Radar risk screen.
 */
export async function evaluatePayment(
  payment: Payment,
  apiKey: string,
  mode: 'ai' | 'heuristic' = 'ai',
  policyConfig: PolicyConfig = DEFAULT_POLICY,
  merchantId?: string | null,
  book?: Payment[],
): Promise<RecoveryResult> {
  let llm: LLMResult;
  let source: 'ai' | 'heuristic' = mode === 'ai' && apiKey ? 'ai' : 'heuristic';

  if (mode === 'ai' && apiKey) {
    try {
      llm = await callLLM(payment, apiKey);
    } catch {
      // Graceful fallback: LLM failed, use heuristic
      llm = heuristicDecision(payment);
      source = 'heuristic';
    }
  } else {
    llm = heuristicDecision(payment);
  }

  const policy = checkPolicy(payment, llm, policyConfig);

  const finalDecision = policy.result === 'blocked' ? 'none' : llm.decision;
  const finalRecovery = policy.result === 'blocked' ? 0 : llm.expected_recovery_value;

  const audit: AuditEvent = {
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
  };

  return {
    payment,
    llm,
    policy,
    audit,
    source,
    retryPlan: buildRetryPlan(payment),
    risk: scoreRisk(payment, book),
  };
}
