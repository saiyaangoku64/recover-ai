import type { Payment, LLMResult } from '../types';
import { getPlaybook, playbookPromptBlock } from './smartRetry';
import { scoreRisk } from './risk';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Free model rotation — falls back through strong free models.
 * Primary: Llama 3.3 70B (131K ctx, strong reasoning)
 * Fallback: OpenRouter auto-router picks the best available free model
 */
const MODEL_CHAIN = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'openrouter/free',
];

const SYSTEM_PROMPT = `You are REVIVE-AI, the recovery brain for an Indian payments stack (Razorpay-style).
You decide the single best recovery action for ONE failed payment.

HARD RULES — the Smart-Retry playbook (authoritative, never contradict it):
${playbookPromptBlock()}

Respond with ONLY valid JSON, no markdown, no commentary:

{
  "decision": "retry" | "none" | "promise_to_pay" | "send_reminder",
  "confidence": <0.0–1.0 certainty in your DECISION>,
  "reason": "<one sentence, plain words, no jargon>",
  "root_cause": "<short tag, e.g. salary-cycle gap, expired UPI window, issuer outage, stolen instrument>",
  "recoverability": <0.0–1.0 probability the money actually comes back>,
  "recommended_timing": "<e.g. 'retry Day 1, 06:00-09:00 IST' | 'WhatsApp now + Day 2 evening' | 'no action'>",
  "expected_recovery_value": <INR integer ≈ amount × recoverability, never above amount, 0 if none>,
  "recovery_channel": "auto_retry" | "whatsapp" | "voice" | null,
  "ptp_due_date": "<YYYY-MM-DD if promise_to_pay, else null>"
}

Calibration rules:
- Hard declines (stolen_card, fraud_suspected, account_closed, card_declined): decision "none", recoverability ≤ 0.1. No exceptions.
- retry_count ≥ 3: decision "none", unless a UPI collect from a loyal customer.
- Loyal customers (previous_successes ≥ 5) + temporary failure → prefer "promise_to_pay" via whatsapp.
- UPI collect expiry / auth failure = attention problem → "send_reminder" or "promise_to_pay", never blind "retry".
- Network / bank / gateway errors = infrastructure problem → "retry" via auto_retry.
- High fraud-risk score (≥ 60): decision "none" regardless of anything else.
- Be honest. If recovery is unlikely, say "none" with HIGH confidence. Never inflate.

Example — ₹8,999 UPI, upi_collect_expired, 9 previous successes, 0 retries, 1 day old:
{"decision":"promise_to_pay","confidence":0.86,"reason":"Loyal customer missed the 30-minute UPI window — a fresh collect plus reminder recovers this.","root_cause":"expired UPI window","recoverability":0.78,"recommended_timing":"WhatsApp now + Day 2 evening","expected_recovery_value":7019,"recovery_channel":"whatsapp","ptp_due_date":"<today + 3 days>"}`;

function buildUserPrompt(payment: Payment): string {
  const today = new Date().toISOString().split('T')[0];
  const playbook = getPlaybook(payment.failure_reason);
  const risk = scoreRisk(payment);
  return `Evaluate this failed payment for recovery. Today is ${today}.

Payment ID: ${payment.id}
Customer: ${payment.customer_name} (${payment.customer_id})
Amount: ₹${payment.amount.toLocaleString('en-IN')}
Method: ${payment.method}
Failure Reason: ${payment.failure_reason}
Failure Category: ${payment.failure_category}
Previous Successful Payments: ${payment.previous_successes}
Retry Count So Far: ${payment.retry_count}
Days Since Failure: ${payment.days_since_failure}
Subscription: ${payment.subscription_type}

Playbook for this code: ${playbook.retryable ? `RETRYABLE (${playbook.strategy})` : 'DO NOT RETRY'} — ${playbook.rationale}
Fraud-risk screen: ${risk.score}/100 (${risk.level})${risk.signals.length ? ` — top signal: ${risk.signals[0].label}` : ''}

Respond with JSON only.`;
}

function parseResponse(text: string): LLMResult {
  // Strip markdown code fences if present
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(clean);

  // Validate required fields
  const validDecisions = ['retry', 'none', 'promise_to_pay', 'send_reminder'];
  if (!validDecisions.includes(parsed.decision)) {
    throw new Error(`Invalid decision: ${parsed.decision}`);
  }

  const confidence = Number(parsed.confidence);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  const erv = Math.max(0, Math.round(Number(parsed.expected_recovery_value) || 0));

  // Optional enriched fields — defaulted from the playbook when omitted
  const recoverabilityRaw = Number(parsed.recoverability);
  const recoverability = isNaN(recoverabilityRaw)
    ? Math.min(1, Math.max(0, erv / 1 || 0))
    : Math.min(1, Math.max(0, recoverabilityRaw));

  return {
    decision: parsed.decision,
    confidence,
    reason: String(parsed.reason || 'No reason provided'),
    expected_recovery_value: erv,
    recovery_channel: parsed.recovery_channel || null,
    ptp_due_date: parsed.ptp_due_date || null,
    root_cause: String(parsed.root_cause || parsed.failure_reason || 'unclassified'),
    recoverability,
    recommended_timing: String(parsed.recommended_timing || defaultTiming(parsed.decision)),
  };
}

/**
 * Sensible timing defaults when the model omits recommended_timing.
 */
function defaultTiming(decision: LLMResult['decision']): string {
  switch (decision) {
    case 'retry': return 'retry Day 1, 02:00–05:00 IST';
    case 'promise_to_pay': return 'WhatsApp now + Day 3 follow-up';
    case 'send_reminder': return 'WhatsApp now + Day 2 evening';
    case 'none': return 'no action';
  }
}

export async function callLLM(payment: Payment, apiKey: string): Promise<LLMResult> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': window.location.origin,
              'X-Title': 'REVIVE-AI',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: buildUserPrompt(payment) },
              ],
              temperature: 0.2,
              max_tokens: 500,
            }),
          });

          if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenRouter HTTP ${res.status}: ${err}`);
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (!content) throw new Error('Empty LLM response');

          return parseResponse(content);
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === MAX_RETRIES) break;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error('All models failed');
}

/**
 * Heuristic fallback — deterministic "fake LLM" for batch mode
 * when we need to conserve real API calls.
 * Enriched with the same playbook fields the LLM returns.
 */
export function heuristicDecision(payment: Payment): LLMResult {
  const base = heuristicDecisionRaw(payment);
  const playbook = getPlaybook(payment.failure_reason);
  const remaining = playbook.schedule[payment.retry_count];
  return {
    ...base,
    root_cause: rootCauseFor(payment),
    recoverability: Math.min(1, Math.max(0, playbook.recoveryPrior * retryDecay(payment))),
    recommended_timing:
      base.decision === 'none'
        ? 'no action'
        : base.decision === 'retry'
          ? remaining
            ? `retry Day ${remaining.dayOffset}, ${remaining.window}`
            : 'retry Day 1, 02:00–05:00 IST'
          : base.decision === 'promise_to_pay'
            ? 'WhatsApp now + Day 3 follow-up'
            : 'WhatsApp now + Day 2 evening',
  };
}

function retryDecay(payment: Payment): number {
  return Math.max(0.25, 1 - payment.retry_count * 0.18 - Math.min(0.4, payment.days_since_failure * 0.03));
}

function rootCauseFor(payment: Payment): string {
  const map: Record<string, string> = {
    insufficient_funds: 'salary-cycle gap',
    upi_collect_expired: 'expired UPI window',
    network_timeout: 'acquiring rail timeout',
    bank_unavailable: 'issuer outage',
    gateway_error: 'gateway fault',
    authentication_failed: 'abandoned 3DS/OTP',
    do_not_honor: 'issuer refusal',
    card_declined: 'hard card decline',
    fraud_suspected: 'issuer fraud flag',
    account_closed: 'closed funding account',
    stolen_card: 'stolen instrument',
  };
  return map[payment.failure_reason] ?? 'unclassified decline';
}

function heuristicDecisionRaw(payment: Payment): LLMResult {
  // Hard declines → none
  if (payment.failure_category === 'hard') {
    return {
      decision: 'none',
      confidence: 0.92,
      reason: `Hard decline (${payment.failure_reason.replace(/_/g, ' ')}) — retry would fail again`,
      expected_recovery_value: 0,
      recovery_channel: null,
    };
  }

  // High retry count → diminishing returns
  if (payment.retry_count >= 3) {
    return {
      decision: 'none',
      confidence: 0.85,
      reason: `Already retried ${payment.retry_count} times — diminishing returns, risk of customer fatigue`,
      expected_recovery_value: 0,
      recovery_channel: null,
    };
  }

  // Stale payment
  if (payment.days_since_failure > 10) {
    return {
      decision: 'none',
      confidence: 0.78,
      reason: `Payment is ${payment.days_since_failure} days old — likely stale, customer may have paid elsewhere`,
      expected_recovery_value: 0,
      recovery_channel: null,
    };
  }

  // Loyal customer + soft decline → promise to pay
  if (payment.previous_successes >= 5 && payment.retry_count <= 1) {
    const isPTP = ['upi_collect_expired', 'payment_pending_customer_action', 'insufficient_funds', 'mandate_not_approved'].includes(payment.failure_reason);
    if (isPTP) {
      const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      return {
        decision: 'promise_to_pay',
        confidence: 0.82,
        reason: `Loyal customer (${payment.previous_successes} successful payments) with temporary issue — PTP is the best approach`,
        expected_recovery_value: Math.round(payment.amount * 0.75),
        recovery_channel: 'whatsapp',
        ptp_due_date: dueDate,
      };
    }
  }

  // Soft decline + low retry → retry
  if (payment.failure_category === 'soft' && payment.retry_count < 2) {
    const successProbability = payment.retry_count === 0 ? 0.85 : 0.65;
    return {
      decision: 'retry',
      confidence: 0.80 - payment.retry_count * 0.1,
      reason: `Soft decline (${payment.failure_reason.replace(/_/g, ' ')}) with ${payment.retry_count} previous retries — good retry candidate`,
      expected_recovery_value: Math.round(payment.amount * successProbability),
      recovery_channel: 'auto_retry',
    };
  }

  // Moderate retry count + customer has history → send reminder
  if (payment.previous_successes >= 2 && payment.retry_count >= 1) {
    return {
      decision: 'send_reminder',
      confidence: 0.68,
      reason: `Customer has payment history (${payment.previous_successes} successes) — a gentle WhatsApp nudge may trigger manual payment`,
      expected_recovery_value: Math.round(payment.amount * 0.4),
      recovery_channel: 'whatsapp',
    };
  }

  // Default: no action
  return {
    decision: 'none',
    confidence: 0.6,
    reason: 'Insufficient signal for confident recovery action',
    expected_recovery_value: 0,
    recovery_channel: null,
  };
}
