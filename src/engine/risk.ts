import type { Payment, RiskScore, RiskSignal } from '../types';

/**
 * Radar-style risk scoring — every failed payment is screened for fraud
 * and abuse signals BEFORE any recovery action is chosen.
 *
 * Score 0–100. Level: low < 30, elevated < 60, high ≥ 60.
 * High-risk payments should never receive automated retries or outreach.
 */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreRisk(payment: Payment, book?: Payment[]): RiskScore {
  const signals: RiskSignal[] = [];
  let score = 0;

  const add = (id: string, label: string, weight: number) => {
    score += weight;
    signals.push({ id, label, weight });
  };

  // 1. Decline-code fraud signals (strongest)
  if (payment.failure_reason === 'stolen_card') {
    add('stolen', 'Stolen instrument reported by issuer', 55);
  } else if (payment.failure_reason === 'fraud_suspected') {
    add('fraud', 'Issuer fraud-suspect flag on this card', 50);
  } else if (payment.failure_reason === 'account_closed') {
    add('closed', 'Funding account closed — possible bust-out', 18);
  } else if (payment.failure_reason === 'do_not_honor') {
    add('honor', 'Issuer refused without reason code', 12);
  }

  // 2. Amount anomaly vs book median
  if (book && book.length > 5) {
    const med = median(book.map((p) => p.amount));
    if (med > 0 && payment.amount > med * 4) {
      add('amount', `Amount is ${(payment.amount / med).toFixed(1)}× the book median`, 20);
    } else if (med > 0 && payment.amount > med * 2) {
      add('amount', `Amount is ${(payment.amount / med).toFixed(1)}× the book median`, 10);
    }
  }
  if (payment.amount >= 50000) {
    add('highvalue', 'High-value transaction (≥ ₹50,000)', 8);
  }

  // 3. New customer + high value = classic first-party fraud shape
  if (payment.previous_successes === 0 && payment.amount >= 20000) {
    add('newhigh', 'First-time customer attempting a high-value payment', 15);
  } else if (payment.previous_successes === 0) {
    add('new', 'No successful payment history', 5);
  }

  // 4. Velocity: repeated failures from the same customer
  if (book) {
    const sameCustomer = book.filter((p) => p.customer_id === payment.customer_id).length;
    if (sameCustomer >= 4) {
      add('velocity', `${sameCustomer} failed payments from this customer`, 15);
    } else if (sameCustomer >= 2) {
      add('velocity', `${sameCustomer} failed payments from this customer`, 7);
    }
  }

  // 5. Retry exhaustion looks like card testing
  if (payment.retry_count >= 4) {
    add('testing', `${payment.retry_count} rapid retries — possible card testing`, 14);
  } else if (payment.retry_count >= 2) {
    add('fatigue', `${payment.retry_count} retries already burned`, 6);
  }

  // 6. Stale failures re-appearing are often friendly-fraud disputes
  if (payment.days_since_failure > 14) {
    add('stale', `Failure is ${payment.days_since_failure} days old`, 6);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  signals.sort((a, b) => b.weight - a.weight);

  return {
    score,
    level: score >= 60 ? 'high' : score >= 30 ? 'elevated' : 'low',
    signals: signals.slice(0, 5),
  };
}

export function riskLabel(level: RiskScore['level']): string {
  return level === 'high' ? 'High risk' : level === 'elevated' ? 'Elevated' : 'Low risk';
}
