import type { Payment } from '../types';

export interface BaselineResult {
  totalRecovered: number;
  totalAtRisk: number;
  actioned: number;
  skipped: number;
  recoveryRate: number;
  decisions: Map<string, 'would_retry' | 'no_action'>;
}

const FLAT_SUCCESS_RATE = 0.80;

/**
 * Deterministic baseline: if retry_count < 2 AND soft decline → "would retry"
 * assuming 80% flat success. Everything else → "no action."
 */
export function computeBaseline(payments: Payment[]): BaselineResult {
  const decisions = new Map<string, 'would_retry' | 'no_action'>();
  let totalRecovered = 0;
  let actioned = 0;
  let skipped = 0;
  const totalAtRisk = payments.reduce((s, p) => s + p.amount, 0);

  for (const p of payments) {
    if (p.retry_count < 2 && p.failure_category === 'soft') {
      decisions.set(p.id, 'would_retry');
      totalRecovered += p.amount * FLAT_SUCCESS_RATE;
      actioned++;
    } else {
      decisions.set(p.id, 'no_action');
      skipped++;
    }
  }

  return {
    totalRecovered: Math.round(totalRecovered),
    totalAtRisk,
    actioned,
    skipped,
    recoveryRate: totalAtRisk > 0 ? totalRecovered / totalAtRisk : 0,
    decisions,
  };
}
