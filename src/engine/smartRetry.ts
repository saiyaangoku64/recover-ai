import type { DeclinePlaybook, Payment, RetryAttemptPlan, RetryStrategy } from '../types';

/**
 * Smart Retry Engine — Stripe Smart Retries equivalent.
 *
 * Instead of blindly retrying every soft decline, each decline code gets a
 * playbook: whether it is retryable at all, the exact attempt schedule
 * (day offsets + optimal windows), the channel, and the base recovery prior.
 * The LLM is grounded on these same playbooks so model and engine agree.
 */

const PLAYBOOKS: Record<string, DeclinePlaybook> = {
  insufficient_funds: {
    reason: 'insufficient_funds',
    retryable: true,
    strategy: 'silent_retry',
    maxAttempts: 3,
    schedule: [
      { dayOffset: 1, window: '06:00–09:00 IST · post salary-credit window', channel: 'auto', rationale: 'Funds most often land within 24h of the decline' },
      { dayOffset: 3, window: '06:00–09:00 IST · salary-cycle retry', channel: 'auto', rationale: 'Second salary-cycle sweep before involving the customer' },
      { dayOffset: 7, window: '10:00–12:00 IST · with WhatsApp nudge', channel: 'whatsapp', rationale: 'Final attempt paired with a payment-link nudge' },
    ],
    rationale: 'Balance-driven decline — retry into salary-credit cycles, escalate to customer only on the last attempt.',
    recoveryPrior: 0.55,
  },
  upi_collect_expired: {
    reason: 'upi_collect_expired',
    retryable: true,
    strategy: 'customer_action',
    maxAttempts: 2,
    schedule: [
      { dayOffset: 0, window: 'Within 2h · fresh collect request', channel: 'whatsapp', rationale: 'Customer missed the 30-min UPI window — re-issue while intent is warm' },
      { dayOffset: 2, window: '18:00–21:00 IST · evening nudge', channel: 'whatsapp', rationale: 'Evening reminder with 1-tap pay link' },
    ],
    rationale: 'Attention failure, not a money failure — re-issue the collect, never blind-retry the rail.',
    recoveryPrior: 0.62,
  },
  network_timeout: {
    reason: 'network_timeout',
    retryable: true,
    strategy: 'silent_retry',
    maxAttempts: 2,
    schedule: [
      { dayOffset: 0, window: 'T+15 min · immediate rail retry', channel: 'auto', rationale: 'Transient timeout — same instrument, fresh idempotency key' },
      { dayOffset: 1, window: '02:00–05:00 IST · low-load window', channel: 'auto', rationale: 'Off-peak retry avoids congested acquiring rails' },
    ],
    rationale: 'Transient infrastructure failure — the customer did nothing wrong, retry silently.',
    recoveryPrior: 0.78,
  },
  bank_unavailable: {
    reason: 'bank_unavailable',
    retryable: true,
    strategy: 'silent_retry',
    maxAttempts: 3,
    schedule: [
      { dayOffset: 0, window: 'T+1h · issuer recovery probe', channel: 'auto', rationale: 'Issuer outages typically clear within the hour' },
      { dayOffset: 1, window: '02:00–05:00 IST · low-load window', channel: 'auto', rationale: 'Off-peak retry on a recovered issuer' },
      { dayOffset: 2, window: '02:00–05:00 IST · low-load window', channel: 'auto', rationale: 'Final silent attempt before customer outreach' },
    ],
    rationale: 'Issuer-side outage — space attempts across recovery windows, keep the customer out of it.',
    recoveryPrior: 0.71,
  },
  gateway_error: {
    reason: 'gateway_error',
    retryable: true,
    strategy: 'silent_retry',
    maxAttempts: 2,
    schedule: [
      { dayOffset: 0, window: 'T+30 min · alternate route', channel: 'auto', rationale: 'Our side failed — retry via alternate acquiring route' },
      { dayOffset: 1, window: '02:00–05:00 IST · low-load window', channel: 'auto', rationale: 'Clean off-peak attempt on settled infrastructure' },
    ],
    rationale: 'Acquirer/gateway fault — retry cost is ours, never the customer’s attention.',
    recoveryPrior: 0.74,
  },
  authentication_failed: {
    reason: 'authentication_failed',
    retryable: true,
    strategy: 'customer_action',
    maxAttempts: 2,
    schedule: [
      { dayOffset: 0, window: 'Within 4h · 3DS re-present', channel: 'link', rationale: 'Customer must complete 3DS/OTP — send a fresh authenticated link' },
      { dayOffset: 2, window: '18:00–21:00 IST · evening nudge', channel: 'whatsapp', rationale: 'Reminder with step-by-step OTP guidance' },
    ],
    rationale: '3DS/OTP was abandoned or mistyped — the fix is a guided re-present, not a rail retry.',
    recoveryPrior: 0.48,
  },
  do_not_honor: {
    reason: 'do_not_honor',
    retryable: false,
    strategy: 'update_method',
    maxAttempts: 1,
    schedule: [
      { dayOffset: 3, window: '10:00–12:00 IST · single courtesy retry', channel: 'auto', rationale: 'One spaced retry — issuers occasionally clear the flag; then stop' },
    ],
    rationale: 'Issuer refused without reason — one courtesy retry, then ask for an alternate method.',
    recoveryPrior: 0.12,
  },
  card_declined: {
    reason: 'card_declined',
    retryable: false,
    strategy: 'update_method',
    maxAttempts: 0,
    schedule: [],
    rationale: 'Generic hard decline — retrying burns interchange and annoys the customer. Request an alternate method.',
    recoveryPrior: 0.05,
  },
  fraud_suspected: {
    reason: 'fraud_suspected',
    retryable: false,
    strategy: 'abstain',
    maxAttempts: 0,
    schedule: [],
    rationale: 'Fraud signal — any contact or retry creates liability. Route to manual review only.',
    recoveryPrior: 0,
  },
  account_closed: {
    reason: 'account_closed',
    retryable: false,
    strategy: 'update_method',
    maxAttempts: 0,
    schedule: [],
    rationale: 'Funding source is dead — only a new payment method can recover this.',
    recoveryPrior: 0.08,
  },
  stolen_card: {
    reason: 'stolen_card',
    retryable: false,
    strategy: 'abstain',
    maxAttempts: 0,
    schedule: [],
    rationale: 'Stolen instrument — no contact, no retry, audit only. Contacting risks abetting fraud.',
    recoveryPrior: 0,
  },
};

const FALLBACK: DeclinePlaybook = {
  reason: 'unknown',
  retryable: true,
  strategy: 'silent_retry',
  maxAttempts: 1,
  schedule: [
    { dayOffset: 1, window: '02:00–05:00 IST · low-load window', channel: 'auto', rationale: 'Single diagnostic retry for an unclassified code' },
  ],
  rationale: 'Unclassified decline — one diagnostic retry, then human review.',
  recoveryPrior: 0.3,
};

export function getPlaybook(reason: string): DeclinePlaybook {
  return PLAYBOOKS[reason] ?? { ...FALLBACK, reason };
}

export function allPlaybooks(): DeclinePlaybook[] {
  return Object.values(PLAYBOOKS);
}

export function strategyLabel(s: RetryStrategy): string {
  switch (s) {
    case 'silent_retry': return 'Silent retry';
    case 'customer_action': return 'Customer action';
    case 'update_method': return 'Update method';
    case 'abstain': return 'Do not touch';
  }
}

/**
 * Build a dated attempt schedule anchored on the failure date.
 * Attempts already "spent" (payment.retry_count) are marked consumed —
 * the plan shows what remains.
 */
export function buildRetryPlan(payment: Payment, anchor = new Date()): RetryAttemptPlan[] {
  const playbook = getPlaybook(payment.failure_reason);
  const base = new Date(payment.created_at);
  const baseTime = isNaN(base.getTime()) ? anchor.getTime() : base.getTime();

  return playbook.schedule
    .slice(payment.retry_count)
    .map((s, i) => ({
      attempt: payment.retry_count + i + 1,
      dayOffset: s.dayOffset,
      scheduledFor: new Date(baseTime + s.dayOffset * 86400000).toISOString(),
      window: s.window,
      channel: s.channel,
      rationale: s.rationale,
    }));
}

/**
 * Compact one-line summary of the playbook, injected into the LLM prompt
 * so the model reasons from the same rules the engine enforces.
 */
export function playbookPromptBlock(): string {
  return allPlaybooks()
    .map(
      (p) =>
        `- ${p.reason}: ${p.retryable ? `RETRYABLE up to ${p.maxAttempts}x on days [${p.schedule.map((s) => s.dayOffset).join(', ')}]` : 'DO NOT RETRY'} — ${p.rationale}`,
    )
    .join('\n');
}
