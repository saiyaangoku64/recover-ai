import type { Payment, RecoveryResult, OrchestratorPlan, RecoveryStep, PolicyConfig } from '../types';
import { evaluatePayment } from './recovery';
import { evaluateEscalation, escalateChannel, isQuietHours } from './escalation';
import { buildCustomerProfile } from './profiles';
import { writeAuditEvent } from '../lib/supabase';

/**
 * Recovery Orchestrator — chains multiple recovery actions with delays,
 * outcome-dependent branching, and escalation. This is the core agent loop
 * that turns a single payment decision into a multi-step recovery workflow.
 *
 * In demo mode, steps execute instantly with simulated outcomes.
 * In production, each step would be a real API call (Razorpay retry, WhatsApp template,
 * Sarvam TTS) with actual response handling.
 */

/**
 * Build a recovery plan based on payment profile and initial decision.
 */
export function buildRecoveryPlan(
  payment: Payment,
  result: RecoveryResult,
): OrchestratorPlan {
  const profile = buildCustomerProfile(payment);
  const steps: RecoveryStep[] = [];

  if (result.policy.result === 'blocked') {
    steps.push({
      id: 'abstain',
      type: 'abstain',
      delay_ms: 0,
      max_attempts: 1,
      timeout_ms: 0,
      condition: 'policy_blocked',
    });
  } else if (result.audit.decision === 'retry') {
    steps.push({
      id: 'wait_initial',
      type: 'wait',
      delay_ms: 15 * 60 * 1000, // 15 min
      max_attempts: 1,
      timeout_ms: 0,
    });
    steps.push({
      id: 'auto_retry',
      type: 'retry',
      delay_ms: 0,
      max_attempts: 2,
      timeout_ms: 30000,
    });
    steps.push({
      id: 'wait_after_retry',
      type: 'wait',
      delay_ms: 2 * 60 * 60 * 1000, // 2 hours
      max_attempts: 1,
      timeout_ms: 0,
      condition: 'retry_failed',
    });
    steps.push({
      id: 'whatsapp_fallback',
      type: 'whatsapp',
      delay_ms: 0,
      max_attempts: 2,
      timeout_ms: 15000,
    });
    if (profile.segment !== 'dormant') {
      steps.push({
        id: 'voice_escalation',
        type: 'voice',
        delay_ms: 24 * 60 * 60 * 1000, // 24 hours
        max_attempts: 1,
        timeout_ms: 30000,
      });
    }
  } else if (result.audit.decision === 'promise_to_pay') {
    steps.push({
      id: 'ptp_confirm',
      type: 'ptp',
      delay_ms: 0,
      max_attempts: 1,
      timeout_ms: 15000,
    });
    steps.push({
      id: 'wait_for_ptp',
      type: 'wait',
      delay_ms: 24 * 60 * 60 * 1000, // 24 hours
      max_attempts: 1,
      timeout_ms: 0,
    });
    steps.push({
      id: 'ptp_reminder',
      type: 'whatsapp',
      delay_ms: 0,
      max_attempts: 1,
      timeout_ms: 15000,
      condition: 'ptp_pending',
    });
    steps.push({
      id: 'ptp_escalation',
      type: 'voice',
      delay_ms: 48 * 60 * 60 * 1000, // 48 hours
      max_attempts: 1,
      timeout_ms: 30000,
      condition: 'ptp_broken',
    });
  } else if (result.audit.decision === 'send_reminder') {
    steps.push({
      id: 'whatsapp_reminder',
      type: 'whatsapp',
      delay_ms: 0,
      max_attempts: 2,
      timeout_ms: 15000,
    });
    steps.push({
      id: 'wait_after_reminder',
      type: 'wait',
      delay_ms: 24 * 60 * 60 * 1000,
      max_attempts: 1,
      timeout_ms: 0,
    });
    steps.push({
      id: 'voice_followup',
      type: 'voice',
      delay_ms: 0,
      max_attempts: 1,
      timeout_ms: 30000,
    });
  } else {
    steps.push({
      id: 'abstain',
      type: 'abstain',
      delay_ms: 0,
      max_attempts: 1,
      timeout_ms: 0,
    });
  }

  return {
    id: `plan_${payment.id}_${Date.now()}`,
    payment_id: payment.id,
    steps,
    current_step: 0,
    status: 'pending',
    started_at: new Date().toISOString(),
    outcomes: [],
    escalated: false,
  };
}

/**
 * Execute a single step of the recovery plan.
 * In demo mode, simulates the outcome based on customer profile + step type.
 */
export async function executeStep(
  plan: OrchestratorPlan,
  payment: Payment,
  policyConfig: PolicyConfig,
  merchantId: string,
  apiKey: string,
): Promise<{ plan: OrchestratorPlan; result: RecoveryResult | null }> {
  const step = plan.steps[plan.current_step];
  if (!step) return { plan: { ...plan, status: 'completed' }, result: null };

  const updatedPlan = { ...plan, status: 'running' as OrchestratorPlan['status'] };

  // Check quiet hours for contact steps
  if ((step.type === 'whatsapp' || step.type === 'voice') && isQuietHours()) {
    updatedPlan.outcomes.push(`${step.id}: paused (quiet hours)`);
    return { plan: updatedPlan, result: null };
  }

  // Simulate step execution
  const profile = buildCustomerProfile(payment);
  const successProb = profile.recovery_probability * (step.type === 'retry' ? 0.7 : 0.5);
  const simulatedSuccess = Math.random() < successProb;

  updatedPlan.outcomes.push(
    `${step.id}: ${simulatedSuccess ? 'SUCCESS' : 'NO_RESPONSE'} (${step.type})`,
  );

  if (simulatedSuccess) {
    updatedPlan.status = 'completed';
    updatedPlan.current_step = plan.current_step + 1;

    // Build a successful result
    const result = await evaluatePayment(payment, apiKey, apiKey ? 'ai' : 'heuristic', policyConfig, merchantId);
    return { plan: updatedPlan, result };
  }

  // Check escalation
  const escalation = evaluateEscalation(payment, undefined, updatedPlan);
  if (escalation && !updatedPlan.escalated) {
    updatedPlan.escalated = true;
    updatedPlan.outcomes.push(`ESCALATION: ${escalation.rule.name} → ${escalation.action}`);

    if (escalation.action === 'pause_campaign') {
      updatedPlan.status = 'cancelled';
      return { plan: updatedPlan, result: null };
    }

    if (escalation.action === 'switch_channel') {
      // Insert a channel-switch step
      const nextChannel = escalateChannel(step.type);
      updatedPlan.steps.splice(plan.current_step + 1, 0, {
        id: `escalate_${nextChannel}`,
        type: nextChannel as RecoveryStep['type'],
        delay_ms: 0,
        max_attempts: 1,
        timeout_ms: 30000,
      });
    }
  }

  // Move to next step
  updatedPlan.current_step = plan.current_step + 1;
  if (updatedPlan.current_step >= updatedPlan.steps.length) {
    updatedPlan.status = 'completed';
  }

  return { plan: updatedPlan, result: null };
}

/**
 * Run the full orchestration loop for a single payment.
 * Returns the final plan state and any recovery result.
 */
export async function orchestrateRecovery(
  payment: Payment,
  result: RecoveryResult,
  policyConfig: PolicyConfig,
  merchantId: string,
  apiKey: string,
  maxSteps: number = 5,
): Promise<{ plan: OrchestratorPlan; finalResult: RecoveryResult | null }> {
  let plan = buildRecoveryPlan(payment, result);
  let currentResult: RecoveryResult | null = result;
  let stepsExecuted = 0;

  while (plan.current_step < plan.steps.length && stepsExecuted < maxSteps) {
    if (plan.status === 'cancelled' || plan.status === 'failed') break;

    const step = plan.steps[plan.current_step];
    if (step.type === 'wait') {
      plan.outcomes.push(`${step.id}: wait ${step.delay_ms / 60000}min (simulated instantly)`);
      plan.current_step++;
      stepsExecuted++;
      continue;
    }

    if (step.type === 'abstain') {
      plan.outcomes.push(`${step.id}: abstained`);
      plan.status = 'completed';
      break;
    }

    const { plan: updatedPlan, result: stepResult } = await executeStep(
      plan,
      payment,
      policyConfig,
      merchantId,
      apiKey,
    );

    plan = updatedPlan;
    if (stepResult) currentResult = stepResult;
    stepsExecuted++;

    // Write audit for significant steps
    if ((step as RecoveryStep).type !== 'wait' && stepResult) {
      try {
        await writeAuditEvent(stepResult.audit);
      } catch { /* stored locally */ }
    }
  }

  return { plan, finalResult: currentResult };
}
