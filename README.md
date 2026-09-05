# REVIVE-AI

AI-powered payment recovery ops console. Failed Razorpay-style transactions are evaluated by an LLM decision engine, gated by deterministic policy, then routed through an orchestrator to auto-retry, WhatsApp, voice, or abstain — with customer segmentation, campaign orchestration, and a full audit trail.

## What it does

Not all payment failures are equal. A UPI timeout resolves itself in minutes; an expired card never will. REVIVE-AI watches failed payments, has an AI decide the *right* recovery action per failure reason, executes that action through a bounded orchestrator, and tracks how much revenue it actually recovers vs. a do-nothing baseline.

## Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Webhook      │───▶│  Decision Engine  │───▶│  Policy Gate      │
│  (failed pay) │    │  (LLM + heuristic)│    │  (6 stopping rules│
└──────────────┘    └──────────────────┘    └────────┬─────────┘
                                                      │
                    ┌─────────────────────────────────┘
                    ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Orchestrator │───▶│  Execute Action   │───▶│  Audit Trail      │
│  (multi-step  │    │  retry / WA /     │    │  every decision   │
│   plans)      │    │  voice / PTP      │    │  is traceable     │
└──────────────┘    └──────────────────┘    └──────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Segment  │ │Campaign │ │Outcome  │
   │ Engine   │ │ Builder │ │ Tracker │
   └─────────┘ └─────────┘ └─────────┘
```

## Operator flow

1. **Overview** — at-risk value, expected recovery, lift vs naive retry, policy blocks, pipeline visualization.
2. **Queue** — unevaluated / retry / PTP / blocked. Select rows and evaluate.
3. **Payments** — full table with search, filters, pagination, and CSV export.
4. **Campaigns** — segment customers (whale, loyal, new, at_risk, dormant, fraud_flag), create targeted recovery campaigns, launch with balanced/aggressive/conservative strategies, track real-time metrics.
5. Open a payment to inspect the real policy checklist, preview WhatsApp in Hinglish, or play recovery voice.
6. **Policy** — edit 6 stopping rules that `checkPolicy` actually uses.
7. **Audit** — persisted decision log with search, filtering (passed/blocked), pagination, and CSV export.
8. **Promise-to-pay** — KPI cards + pending / kept / broken tracker.

## Key engines

| Engine | What it does |
|--------|-------------|
| `recovery.ts` | Full pipeline: LLM → Policy → Audit. Self-contained with graceful LLM fallback. |
| `llm.ts` | OpenRouter integration with free model rotation (Llama 3.3 70B → auto-router). |
| `policy.ts` | 6 deterministic stopping rules: confidence, retries, hard decline, staleness, high-value, fatigue. |
| `orchestrator.ts` | Multi-step recovery plans with delays, branching, quiet hours, and escalation. |
| `profiles.ts` | Customer segmentation: 6 behavioral segments with risk scores and recovery probabilities. |
| `campaigns.ts` | Batch campaign execution with auto-evaluation, real LLM decisions, and metrics tracking. |
| `outcomes.ts` | Predicted vs actual outcome tracking with calibration error measurement. |
| `analytics.ts` | Channel effectiveness, lift over naive retry, recovery time distribution. |
| `escalation.ts` | Time-aware (IST quiet hours), value-aware, repeat-failure escalation rules. |
| `hydrate.ts` | Deterministic heuristic evaluation for initial page load, with policy re-gating. |

## What's real vs. simulated

| Piece | Status |
|-------|--------|
| Decision logic (LLM + heuristic) | **Real** — OpenRouter API with free model fallback |
| Policy gate (6 rules) | **Real** — deterministic, auditable, user-configurable |
| Orchestrator (multi-step plans) | **Real** — branching, delays, quiet hours, escalation |
| Customer segmentation | **Real** — behavioral classification with risk scoring |
| Campaign execution | **Real** — auto-evaluates, tracks metrics, persists results |
| Outcome tracking | **Real** — predicted vs actual, calibration error, localStorage persistence |
| Payment retry execution | Simulated (probability-weighted by failure reason) |
| WhatsApp messages | Simulated preview (Hinglish recovery copy) |
| Voice recovery | Real TTS via Sarvam API (Hindi), browser Speech API fallback |

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

| Variable | Required | Purpose |
|---|---|---|
| `VITE_OPENROUTER_KEY` | No | LLM decisions via OpenRouter `meta-llama/llama-3.3-70b-instruct:free`. Without it, the heuristic engine runs. |
| `VITE_SARVAM_API_KEY` | No | Hindi TTS. Without it, the browser Speech API is used. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | No | Auth, `audit_events`, `policy_config`. Without them, the console runs locally with localStorage. |
| `VITE_PAYMENTS_SOURCE` | No | `json` (default) or `razorpay` (stub). |

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Why this matters

Indian payment failure rates hover around 10-15%. Most systems either do nothing or blindly retry. REVIVE-AI treats each failure uniquely — the right action for a UPI timeout is different from an expired card. Measured recovery across a batch, with compliant escalation, stopping rules, and a complete audit trail.
