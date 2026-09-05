import type { Payment, RecoveryResult } from '../types';

const CODES: Record<string, { code: string; source: string; step: string; description: string }> = {
  stolen_card: { code: 'STOLEN_CARD', source: 'issuer', step: 'authorization', description: 'Issuing bank flagged the card as stolen.' },
  fraud_suspected: { code: 'SUSPECTED_FRAUD', source: 'issuer', step: 'authorization', description: 'Issuer declined for suspected fraud.' },
  card_declined: { code: 'CARD_DECLINED', source: 'issuer', step: 'authorization', description: 'Card issuer declined the authorization.' },
  account_closed: { code: 'ACCOUNT_CLOSED', source: 'bank', step: 'payment_authorization', description: 'Customer account is closed.' },
  do_not_honor: { code: 'DO_NOT_HONOR', source: 'issuer', step: 'authorization', description: 'Issuer returned do_not_honor.' },
  bank_unavailable: { code: 'BANK_TECHNICAL_ERROR', source: 'bank', step: 'payment_authorization', description: 'Acquiring or issuing bank was unavailable.' },
  bank_down: { code: 'BANK_TECHNICAL_ERROR', source: 'bank', step: 'payment_authorization', description: 'Bank switch timeout.' },
  network_timeout: { code: 'GATEWAY_TIMEOUT', source: 'business', step: 'payment_response', description: 'Gateway timed out waiting for the bank.' },
  upi_collect_expired: { code: 'UPI_COLLECT_EXPIRED', source: 'customer', step: 'payment', description: 'UPI collect request expired before approval.' },
  insufficient_funds: { code: 'INSUFFICIENT_FUNDS', source: 'customer', step: 'authorization', description: 'Account did not have enough balance.' },
  gateway_error: { code: 'GATEWAY_ERROR', source: 'business', step: 'payment_response', description: 'Payment gateway returned a technical error.' },
  authentication_failed: { code: 'AUTHENTICATION_FAILED', source: 'customer', step: 'authentication', description: '3DS / UPI PIN authentication failed.' },
  payment_pending_customer_action: { code: 'PAYMENT_PENDING', source: 'customer', step: 'payment', description: 'Customer did not complete the payment.' },
  mandate_not_approved: { code: 'MANDATE_NOT_APPROVED', source: 'customer', step: 'mandate', description: 'eNACH / UPI Autopay mandate was not approved.' },
};

export function razorpayError(reason: string) {
  return CODES[reason] ?? {
    code: reason.toUpperCase(),
    source: 'business',
    step: 'payment',
    description: reason.replace(/_/g, ' '),
  };
}

export function paymentLink(payment: Payment) {
  return `https://rzp.io/rzp/revive/${payment.id.replace('pay_', '')}`;
}

export function webhookPayload(payment: Payment) {
  const err = razorpayError(payment.failure_reason);
  return {
    entity: 'event',
    event: 'payment.failed',
    created_at: Math.floor(new Date(payment.created_at).getTime() / 1000),
    payload: {
      payment: {
        entity: {
          id: payment.id,
          amount: payment.amount * 100,
          currency: payment.currency || 'INR',
          status: 'failed',
          method: payment.method,
          email: payment.email,
          contact: payment.phone,
          error_code: err.code,
          error_description: err.description,
          error_source: err.source,
          error_step: err.step,
          notes: { merchant: payment.merchant, subscription: payment.subscription_type },
        },
      },
    },
  };
}

export function escalation(result: RecoveryResult | undefined) {
  if (!result) return 'Pending evaluation';
  if (result.policy.result === 'blocked') return 'Stop · no customer contact · audit only';
  if (result.audit.decision === 'retry') return 'T+15m silent Smart Retry via same instrument';
  if (result.audit.decision === 'promise_to_pay') return 'T+24h WhatsApp reminder · service stays active';
  if (result.audit.decision === 'send_reminder') return 'Hinglish WhatsApp + payment link · 48h window';
  return 'Abstain · do not retry';
}
