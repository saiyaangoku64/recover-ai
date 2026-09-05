# REVIVE-AI — Judging Pack (Track 03 · AI Revenue Recovery)

## The 60-second pitch

> "Every year, merchants lose crores to failed payments that were recoverable —
> expired UPI windows, salary-cycle gaps, bank outages. Existing tools just hammer
> retry and annoy customers. REVIVE-AI is a recovery agent: it **diagnoses** each
> failure, **blocks** the doomed ones through a policy gate even the AI can't
> override, and **recovers** the rest over UPI, Hinglish WhatsApp, and Hindi voice —
> reporting honest, collectible revenue instead of inflated retry claims."

## What it is

An AI revenue-recovery operator for failed payments. Webhook in → diagnosis +
risk screen + policy gate → Smart-Retry schedule, dunning sequence, or hard stop.
Every decision is inspectable, every campaign reports predicted-vs-actual.

## Why we built it

1. **Blind retries burn money and trust.** Naive retry logic re-tries stolen cards
   and exhausted instruments — paying interchange to fail again, and pinging
   customers who should never be contacted.
2. **Failures are diagnosis problems, not retry problems.** An expired UPI collect
   needs a nudge, a bank outage needs a silent 2 AM retry, a stolen card needs
   silence. One button can't do all three.
3. **India recovers differently.** UPI collect windows, Hinglish WhatsApp, and
   voice calls — not dunning emails. Western tools don't speak this funnel.

## The market problem

- **Involuntary churn** (failed payments, not cancellations) drives roughly a
  quarter to a third of all subscription churn industry-wide — revenue that
  customers *wanted* to pay.
- UPI and card failures spike around bank downtimes, salary cycles, and 3DS
  friction; each unmanaged failure is GMV walking out the door.
- Merchants either retry blindly (spam + cost) or write off the GMV entirely.

## Competitors — and where they stop

| Player | What they do | Where they stop |
|---|---|---|
| **Stripe** (Smart Retries, Radar, Billing dunning) | ML retry timing, fraud scoring, email dunning | Enterprise-priced, email-centric, not India-shaped (no UPI-collect flows, no Hinglish/voice) |
| **Razorpay** (Smart Retry, Payment Links) | Rule-based retries, link issuance | Retries without diagnosis or explanation; no dunning orchestration, no hard-stop audit story |
| **Chargebee / Recurly** | Subscription dunning emails | Email-only, western cadence, expensive seats |
| **ChurnBuster / Baremetrics Recover / ProfitWell Retain** | Dunning specialists | Email-centric, no UPI/voice, no AI diagnosis layer |
| **Juspay** | Payment orchestration + routing | Infrastructure rails, not a recovery agent |

**Our wedge:** the agent layer *on top of* Razorpay — webhooks in, Payment Links
and UPI collects out — with three things nobody bundles: a **policy gate that can
overrule the AI**, **honest collectible-EV accounting** (we show what naive retry
*claims* vs what is actually collectible), and **India-native channels**
(Hinglish WhatsApp + Sarvam Hindi voice + PTP tracking).

## 5-minute demo script

1. **Overview (60s)** — "₹59L at risk, ₹6.7L collectible EV. Note the second
   number on the naive card — ₹16.3L *claimed*. We report what's collectible."
   Point at the funnel: detected → gated → engaged → recovered.
2. **Hard stop (60s)** — open the stolen-card case → drawer. Risk 70+,
   policy BLOCKED, Smart-Retry plan says "Do not touch". "This is the money
   we deliberately *don't* chase."
3. **Recovery (90s)** — open the Rahul Sharma PTP case → WhatsApp simulator →
   play the Hindi voice note → tap Pay → in-phone checkout → success bubble.
   "Customer never leaves chat. PTP auto-marked kept."
4. **Analytics (45s)** — decline-code intelligence: "every code has a playbook —
   salary-cycle retries for insufficient funds, 2 AM windows for bank errors."
5. **Campaigns (45s)** — forecast ("₹6.7L predicted, ₹57 cost") → completed
   campaign: "₹5.4L actual, 80% calibration, ₹1 per recovery."

## Anticipated Q&A

**Is the AI real?**
Yes. Decisions come from an LLM (OpenRouter) prompted with our Smart-Retry
playbooks plus a few-shot example, returning structured JSON (decision,
confidence, root cause, recoverability, timing). No key? The deterministic
engine scores the full book so the demo never stalls — and *every* AI output
is re-gated by a deterministic policy engine before any action.

**How is this different from Razorpay Smart Retry?**
Smart Retry retries. REVIVE diagnoses: per-code schedules, customer outreach,
hard stops, dunning sequences, and an audit trail — plus honest accounting of
what's actually collectible.

**What about fraud?**
Every payment passes a Radar-style risk screen (stolen instrument, velocity,
amount anomaly, card testing). High risk ⇒ no retry, no outreach, audit only.
Demonstrate with the fraud segment — zero campaign eligibility, by design.

**Does it scale?**
Scoring is stateless per payment (batch + campaign runners), audit writes go
to Supabase, outcomes merge incrementally. The demo scores 253; the
architecture has no per-book bottleneck.

**Business model?**
SaaS priced on recovered revenue (e.g. a small % of collected EV) — merchants
pay from money they wouldn't have had. Campaign unit economics (₹1/recovery
in the demo) make the ROI story trivial.

**What's the moat?**
The playbook + calibration flywheel: every campaign's predicted-vs-actual
tightens the priors. Plus the policy-gate architecture — compliance-first AI
is what lets merchants trust an agent with customer contact.

**What did you build vs reuse?**
All engines are custom: Smart-Retry playbooks, risk scorer, dunning sequences,
policy gate, orchestrator, campaign simulator, analytics. External: LLM
(OpenRouter), voice (Sarvam), persistence (Supabase), checkout rails
(Razorpay webhooks/links conceptually).

## One-line answers

- *What is it?* — An AI agent that recovers failed-payment revenue compliantly.
- *Why?* — Blind retries burn money and trust; failures need diagnosis.
- *Market?* — Involuntary churn eats ~a quarter of subscription churn; India's
  UPI-heavy stack needs native recovery channels.
- *Competitors?* — Stripe/Chargebee/dunning tools are email-centric and
  western; Razorpay retries without diagnosis. We bundle diagnosis + policy
  gate + India-native outreach + honest accounting.
