import type { Payment, RecoveryResult, EscalationRule, OrchestratorPlan } from '../types';

/**
 * Default escalation rules — time-aware, channel-aware, compliance-gated.
 * These fire automatically during orchestrated recovery campaigns.
 */
export const DEFAULT_ESCALATION_RULES: EscalationRule[] = [
  {
    id: 'no_response_24h',
    name: 'No response after 24 hours',
    trigger: 'no_response_hours',
    threshold: 24,
    action: 'switch_channel',
    enabled: true,
  },
  {
    id: 'no_response_48h',
    name: 'No response after 48 hours — escalate to voice',
    trigger: 'no_response_hours',
    threshold: 48,
    action: 'escalate_to_agent',
    enabled: true,
  },
  {
    id: 'ptp_broken',
    name: 'PTP commitment broken',
    trigger: 'ptp_broken',
    threshold: 1,
    action: 'flag_for_review',
    enabled: true,
  },
  {
    id: 'high_value_single',
    name: 'High-value payment (₹50k+) — immediate escalation',
    trigger: 'high_value',
    threshold: 50000,
    action: 'escalate_to_agent',
    enabled: true,
  },
  {
    id: 'repeat_failure',
    name: 'Customer failed 3+ times — pause campaign',
    trigger: 'repeat_failure',
    threshold: 3,
    action: 'pause_campaign',
    enabled: true,
  },
  {
    id: 'quiet_hours',
    name: 'No contacts between 9 PM – 8 AM IST',
    trigger: 'time_of_day',
    threshold: 20,
    action: 'pause_campaign',
    enabled: true,
  },
];

/**
 * Check if current IST time is within quiet hours (9 PM – 8 AM).
 */
export function isQuietHours(now: Date = new Date()): boolean {
  const hour = parseInt(now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }), 10);
  return hour >= 21 || hour < 8;
}

/**
 * Evaluate escalation rules against a payment + its orchestrator plan.
 * Returns the first matching rule's action, or null if none fire.
 */
export function evaluateEscalation(
  payment: Payment,
  result: RecoveryResult | undefined,
  plan: OrchestratorPlan | undefined,
  rules: EscalationRule[] = DEFAULT_ESCALATION_RULES,
): { action: EscalationRule['action']; rule: EscalationRule } | null {
  if (!result || result.policy.result === 'blocked') return null;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.trigger) {
      case 'time_of_day': {
        if (isQuietHours()) return { action: rule.action, rule };
        break;
      }
      case 'high_value': {
        if (payment.amount >= rule.threshold) return { action: rule.action, rule };
        break;
      }
      case 'repeat_failure': {
        if (payment.retry_count >= rule.threshold) return { action: rule.action, rule };
        break;
      }
      case 'ptp_broken': {
        if (result.audit.ptp_status === 'broken') return { action: rule.action, rule };
        break;
      }
      case 'no_response_hours': {
        if (plan) {
          const elapsed = Date.now() - new Date(plan.started_at).getTime();
          if (elapsed >= rule.threshold * 3600000) return { action: rule.action, rule };
        }
        break;
      }
    }
  }

  return null;
}

/**
 * Get the next escalation action for a channel switch.
 * Returns the channel to escalate to based on the current channel.
 */
export function escalateChannel(currentChannel: string | null): string {
  const escalationPath: Record<string, string> = {
    whatsapp: 'voice',
    voice: 'multi_channel',
    auto_retry: 'whatsapp',
  };
  return escalationPath[currentChannel ?? ''] ?? 'voice';
}

/**
 * Build a human-readable escalation timeline for a payment.
 */
export function buildEscalationTimeline(
  _payment: Payment,
  result: RecoveryResult | undefined,
): { step: number; action: string; time: string; reason: string }[] {
  if (!result || result.policy.result === 'blocked') {
    return [{ step: 0, action: 'Abstain', time: 'T+0', reason: 'Policy blocked — no escalation possible' }];
  }

  const timeline: { step: number; action: string; time: string; reason: string }[] = [];

  if (result.audit.decision === 'retry') {
    timeline.push({ step: 1, action: 'Silent retry', time: 'T+15m', reason: 'Auto-retry via same instrument' });
    timeline.push({ step: 2, action: 'WhatsApp reminder', time: 'T+2h', reason: 'If retry fails, send payment link' });
    timeline.push({ step: 3, action: 'Voice call', time: 'T+24h', reason: 'If no response, escalate to Hinglish voice' });
    timeline.push({ step: 4, action: 'Agent review', time: 'T+48h', reason: 'Final escalation for manual follow-up' });
  } else if (result.audit.decision === 'promise_to_pay') {
    timeline.push({ step: 1, action: 'PTP confirmation', time: 'T+0', reason: 'Customer commits to pay' });
    timeline.push({ step: 2, action: 'Reminder', time: 'T+24h', reason: 'Gentle reminder before due date' });
    timeline.push({ step: 3, action: 'Follow-up', time: 'T+48h', reason: 'If PTP missed, switch channel' });
    timeline.push({ step: 4, action: 'Agent review', time: 'T+72h', reason: 'Escalate if PTP broken' });
  } else if (result.audit.decision === 'send_reminder') {
    timeline.push({ step: 1, action: 'WhatsApp nudge', time: 'T+0', reason: 'Hinglish payment link' });
    timeline.push({ step: 2, action: 'Voice call', time: 'T+24h', reason: 'Escalate if no response' });
    timeline.push({ step: 3, action: 'Agent review', time: 'T+48h', reason: 'Manual follow-up' });
  } else {
    timeline.push({ step: 1, action: 'No action', time: 'T+0', reason: result.llm.reason });
  }

  return timeline;
}
