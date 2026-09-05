import type { DunningSequence, Payment } from '../types';

/**
 * Dunning Engine — Stripe Billing style multi-stage outreach sequences.
 *
 * Every recoverable payment is enrolled in a sequence matched to its profile:
 * gentle WhatsApp nudges first, firmer reminders next, a final notice last.
 * High-risk and hard-decline payments are never enrolled.
 */

export const DUNNING_SEQUENCES: DunningSequence[] = [
  {
    id: 'soft_standard',
    name: 'Standard soft-decline dunning',
    audience: 'Soft declines · first or second failure',
    stages: [
      {
        stage: 1,
        dayOffset: 0,
        channel: 'whatsapp',
        subject: 'Payment didn’t go through',
        template: 'Namaste {name} ji 🙏 — aapka {amount} ka payment bank issue ki wajah se fail ho gaya. Yeh raha 1-tap secure link: {link}. Koi charge nahi katega retry par.',
        tone: 'gentle',
      },
      {
        stage: 2,
        dayOffset: 2,
        channel: 'whatsapp',
        subject: 'Friendly reminder',
        template: '{name} ji, aapka {amount} ka payment abhi bhi pending hai. Service active rakhne ke liye aaj hi complete kar lein: {link}',
        tone: 'gentle',
      },
      {
        stage: 3,
        dayOffset: 5,
        channel: 'voice',
        subject: 'Voice reminder call',
        template: 'Sarvam Hindi voice call — personalized reminder with the customer’s name, amount, and payment-link validity window.',
        tone: 'firm',
      },
      {
        stage: 4,
        dayOffset: 8,
        channel: 'email',
        subject: 'Final notice before service pause',
        template: 'Last reminder: {amount} due since {date}. Pay via {link} to avoid interruption. Reply HELP for support.',
        tone: 'final',
      },
    ],
  },
  {
    id: 'loyal_concierge',
    name: 'Loyal-customer concierge',
    audience: '5+ successful payments · temporary issue',
    stages: [
      {
        stage: 1,
        dayOffset: 0,
        channel: 'whatsapp',
        subject: 'We kept your service active',
        template: '{name} ji, aapke {successes} successful payments dekh kar humne service pause nahi ki. {amount} ka link 48h valid hai: {link}',
        tone: 'gentle',
      },
      {
        stage: 2,
        dayOffset: 3,
        channel: 'voice',
        subject: 'Concierge check-in call',
        template: 'Warm Hindi voice check-in — assumes goodwill, offers UPI / card choice, confirms a promise-to-pay date.',
        tone: 'gentle',
      },
      {
        stage: 3,
        dayOffset: 7,
        channel: 'email',
        subject: 'Your promise-to-pay confirmation',
        template: 'Confirming your commitment of {amount} by {date}. One tap to schedule: {link}. Thank you for staying with us.',
        tone: 'firm',
      },
    ],
  },
  {
    id: 'value_escalated',
    name: 'High-value escalated dunning',
    audience: 'Amount ≥ ₹50,000 · any soft decline',
    stages: [
      {
        stage: 1,
        dayOffset: 0,
        channel: 'email',
        subject: 'Action needed on your ₹{amount} payment',
        template: 'Formal receipt-style notice with invoice reference, failure reason in plain words, and a priority payment link: {link}',
        tone: 'firm',
      },
      {
        stage: 2,
        dayOffset: 1,
        channel: 'whatsapp',
        subject: 'Priority follow-up',
        template: '{name} ji, {amount} ka payment priority queue me hai. Kripya aaj hi complete karein: {link} — support ke liye reply karein.',
        tone: 'firm',
      },
      {
        stage: 3,
        dayOffset: 4,
        channel: 'voice',
        subject: 'Relationship-manager call',
        template: 'Senior Hindi voice — acknowledges the amount, offers split/PTP options, books a concrete pay-by date.',
        tone: 'firm',
      },
    ],
  },
  {
    id: 'new_light',
    name: 'New-customer light touch',
    audience: 'Fewer than 2 successes · low fatigue tolerance',
    stages: [
      {
        stage: 1,
        dayOffset: 0,
        channel: 'whatsapp',
        subject: 'Complete your payment',
        template: 'Welcome 🙏 {name} ji! Aapka {amount} ka first payment adhura reh gaya: {link}. Koi sawal ho to bas reply karein.',
        tone: 'gentle',
      },
      {
        stage: 2,
        dayOffset: 4,
        channel: 'email',
        subject: 'Still want to go ahead?',
        template: 'Single low-pressure email with the payment link and a support reply path. No further outreach after this.',
        tone: 'gentle',
      },
    ],
  },
];

/**
 * Pick the right sequence for a payment + decision pair.
 * Returns null when no outreach should happen (hard stops).
 */
export function pickSequence(payment: Payment, decision: string): DunningSequence | null {
  if (decision === 'none') return null;
  if (payment.failure_category === 'hard') return null;
  if (payment.amount >= 50000) return DUNNING_SEQUENCES[2];
  if (payment.previous_successes >= 5) return DUNNING_SEQUENCES[1];
  if (payment.previous_successes < 2) return DUNNING_SEQUENCES[3];
  return DUNNING_SEQUENCES[0];
}

/**
 * Which stage is a payment currently in, given days since failure?
 */
export function currentStage(seq: DunningSequence, daysSinceFailure: number): number {
  let stage = 0;
  for (const s of seq.stages) {
    if (daysSinceFailure >= s.dayOffset) stage = s.stage;
  }
  return stage;
}
