import type { Payment, PaymentsSource } from '../types';

export class JsonPaymentsSource implements PaymentsSource {
  id = 'json' as const;
  label = 'Local dataset (payments.json)';

  async listFailed(): Promise<Payment[]> {
    const r = await fetch('/payments.json');
    if (!r.ok) throw new Error(`Could not load payments.json (HTTP ${r.status})`);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('payments.json is not an array');
    return data as Payment[];
  }
}

/**
 * Typed stub for a live Razorpay Payments API adapter.
 * Swap this in via VITE_PAYMENTS_SOURCE=razorpay once keys and webhooks exist.
 */
export class RazorpayPaymentsSource implements PaymentsSource {
  id = 'razorpay' as const;
  label = 'Razorpay Payments API (stub)';

  async listFailed(): Promise<Payment[]> {
    throw new Error(
      'Razorpay adapter is not live yet. Keep VITE_PAYMENTS_SOURCE=json until failed-payment list + webhooks are wired.',
    );
  }
}

export function createPaymentsSource(): PaymentsSource {
  const source = (import.meta.env.VITE_PAYMENTS_SOURCE || 'json').toLowerCase();
  if (source === 'razorpay') return new RazorpayPaymentsSource();
  return new JsonPaymentsSource();
}
