import type { Payment, LLMResult } from '../types';

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

const SYSTEM_PROMPT = `You are REVIVE-AI, an autonomous payment recovery decision engine for Razorpay.

Given a failed payment's details, decide the optimal recovery action.

You MUST respond with ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "decision": "retry" | "none" | "promise_to_pay" | "send_reminder",
  "confidence": <number 0.0 to 1.0>,
  "reason": "<one clear sentence explaining why>",
  "expected_recovery_value": <number in INR — the amount you expect to recover, 0 if none>,
  "recovery_channel": "auto_retry" | "whatsapp" | "voice" | null,
  "ptp_due_date": "<ISO date string if promise_to_pay, null otherwise>"
}

Decision guide:
- "retry": Payment can be automatically retried with high chance of success (soft declines, temporary issues)
- "none": Payment should NOT be retried (hard declines, fraud, account issues)
- "promise_to_pay": Customer pattern suggests they will pay if reminded — schedule a follow-up
- "send_reminder": Send a gentle nudge via WhatsApp/SMS

Consider:
- failure_reason: hard declines (stolen_card, fraud) should almost always be "none"
- retry_count: high retry counts suggest diminishing returns
- previous_successes: loyal customers (high previous_successes) are better PTP candidates
- days_since_failure: stale failures are less recoverable
- method: UPI failures are often temporary, card declines can be permanent
- amount: higher amounts justify more careful intervention

Be honest. If recovery is unlikely, say "none" with high confidence. Don't inflate recovery chances.`;

function buildUserPrompt(payment: Payment): string {
  return `Evaluate this failed payment for recovery:

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

  return {
    decision: parsed.decision,
    confidence,
    reason: String(parsed.reason || 'No reason provided'),
    expected_recovery_value: Number(parsed.expected_recovery_value) || 0,
    recovery_channel: parsed.recovery_channel || null,
    ptp_due_date: parsed.ptp_due_date || null,
  };
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
              temperature: 0.3,
              max_tokens: 300,
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
 */
export function heuristicDecision(payment: Payment): LLMResult {
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
