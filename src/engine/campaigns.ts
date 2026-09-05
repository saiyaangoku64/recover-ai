import type {
  Payment, RecoveryResult, Campaign,
  CustomerSegment,
} from '../types';
export type { Campaign } from '../types';
import { buildCustomerProfile } from './profiles';
import { buildRecoveryPlan, executeStep } from './orchestrator';
import type { PolicyConfig } from '../types';
import { evaluatePayment } from './recovery';

/**
 * Campaign Engine — manages batch recovery campaigns that target
 * specific customer segments with coordinated strategies.
 *
 * Each campaign:
 * 1. Filters payments by segment (all, including unevaluated)
 * 2. Auto-evaluates unevaluated payments via LLM
 * 3. Builds orchestrator plans for each
 * 4. Executes steps with configurable concurrency
 * 5. Tracks metrics in real-time
 */

const CAMPAIGNS_KEY = 'revive-campaigns';

export function loadCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCampaigns(campaigns: Campaign[]) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

/**
 * Create a recovery campaign targeting a specific segment.
 * Includes all matching payments — unevaluated ones will be auto-evaluated during execution.
 */
export function createCampaign(
  name: string,
  segment: CustomerSegment | 'all',
  strategy: 'aggressive' | 'conservative' | 'balanced',
  payments: Payment[],
  _results: Map<string, RecoveryResult>,
): Campaign {
  const paymentIds = payments
    .filter((p) => {
      const profile = buildCustomerProfile(p);
      if (segment === 'all') return true;
      return profile.segment === segment;
    })
    .map((p) => p.id);

  const campaign: Campaign = {
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    segment,
    strategy,
    started_at: null,
    status: 'draft',
    payment_ids: paymentIds,
    metrics: {
      total_attempted: 0,
      total_recovered: 0,
      total_recovery_amount: 0,
      predicted_recovery_amount: 0,
      avg_confidence: 0,
      channel_breakdown: {},
      step_success_rates: {},
      errors: 0,
    },
    config: {
      max_ai_calls: strategy === 'aggressive' ? 30 : strategy === 'conservative' ? 8 : 15,
      retry_window_hours: strategy === 'aggressive' ? 48 : strategy === 'conservative' ? 72 : 60,
      escalation_enabled: strategy !== 'conservative',
    },
  };

  return campaign;
}

/**
 * Execute a campaign — auto-evaluates unevaluated payments, then runs orchestrator plans.
 * Returns updated campaign with metrics.
 */
export async function executeCampaign(
  campaign: Campaign,
  payments: Payment[],
  results: Map<string, RecoveryResult>,
  policyConfig: PolicyConfig,
  merchantId: string,
  apiKey: string,
  onProgress?: (campaign: Campaign) => void,
): Promise<Campaign> {
  const updated: Campaign = {
    ...campaign,
    status: 'running',
    started_at: campaign.started_at || new Date().toISOString(),
    // Reset metrics when resuming a paused campaign to avoid double-counting
    ...(campaign.status === 'paused' ? {
      metrics: {
        total_attempted: 0,
        total_recovered: 0,
        total_recovery_amount: 0,
        predicted_recovery_amount: 0,
        avg_confidence: 0,
        channel_breakdown: {},
        step_success_rates: {},
        errors: 0,
      },
    } : {}),
  };
  const paymentMap = new Map(payments.map((p) => [p.id, p]));
  let totalConfidence = 0;
  const channelCounts: Record<string, number> = {};
  const stepCounts: Record<string, { attempts: number; successes: number }> = {};
  let aiCalls = 0;

  // Working copy of results — accumulate new evaluations during campaign
  const liveResults = new Map(results);

  for (const pid of campaign.payment_ids) {
    const payment = paymentMap.get(pid);
    if (!payment) continue;

    // Auto-evaluate if not yet evaluated
    let result = liveResults.get(pid);
    if (!result && apiKey) {
      try {
        result = await evaluatePayment(payment, apiKey, 'ai', policyConfig, merchantId);
        liveResults.set(pid, result);
      } catch {
        updated.metrics.errors++;
      }
    }
    if (!result) continue;

    updated.metrics.total_attempted++;
    updated.metrics.predicted_recovery_amount += result.audit.expected_recovery;
    totalConfidence += result.llm.confidence;

    if (result.audit.recovery_channel) {
      channelCounts[result.audit.recovery_channel] = (channelCounts[result.audit.recovery_channel] || 0) + 1;
    }

    // Execute orchestrator steps for AI-callable payments
    if (aiCalls < campaign.config.max_ai_calls && apiKey) {
      try {
        const plan = buildRecoveryPlan(payment, result);
        let currentPlan = plan;
        for (let i = 0; i < 3 && currentPlan.current_step < currentPlan.steps.length; i++) {
          const step = currentPlan.steps[currentPlan.current_step];
          if (step.type === 'wait' || step.type === 'abstain') {
            currentPlan.current_step++;
            continue;
          }

          const stepKey = step.type;
          if (!stepCounts[stepKey]) stepCounts[stepKey] = { attempts: 0, successes: 0 };
          stepCounts[stepKey].attempts++;

          const { plan: newPlan } = await executeStep(currentPlan, payment, policyConfig, merchantId, apiKey);
          currentPlan = newPlan;

          const lastOutcome = currentPlan.outcomes[currentPlan.outcomes.length - 1] || '';
          if (lastOutcome.includes('SUCCESS')) {
            stepCounts[stepKey].successes++;
          }
        }
        aiCalls++;
      } catch {
        updated.metrics.errors++;
      }
    }

    // Determine recovery outcome using LLM decision + realistic probability
    const categoryBoost = payment.failure_category === 'soft' ? 1.15 : 0.3;
    const retryPenalty = Math.max(0.1, 1 - payment.retry_count * 0.12);
    const loyaltyBoost = payment.previous_successes > 3 ? 1.1 : 1;
    const decisionWeight = result.llm.decision === 'none' ? 0.05
      : result.llm.decision === 'retry' ? 0.6
      : result.llm.decision === 'promise_to_pay' ? 0.45
      : 0.35; // send_reminder
    const successProb = Math.min(0.95, result.llm.confidence * categoryBoost * retryPenalty * loyaltyBoost * decisionWeight);
    const succeeded = Math.random() < successProb;

    if (succeeded) {
      updated.metrics.total_recovered++;
      updated.metrics.total_recovery_amount += Math.round(result.audit.expected_recovery * (0.85 + Math.random() * 0.3));
    }

    updated.metrics.avg_confidence = totalConfidence / updated.metrics.total_attempted;
    updated.metrics.channel_breakdown = channelCounts;
    updated.metrics.step_success_rates = Object.fromEntries(
      Object.entries(stepCounts).map(([k, v]) => [k, v.attempts > 0 ? v.successes / v.attempts : 0]),
    );

    onProgress?.(updated);
    // Yield to UI every 5 payments
    if (updated.metrics.total_attempted % 5 === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  updated.status = 'completed';
  onProgress?.(updated);

  // Save campaign
  const campaigns = loadCampaigns();
  const idx = campaigns.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) campaigns[idx] = updated;
  else campaigns.push(updated);
  saveCampaigns(campaigns);

  return updated;
}

/**
 * Pause a running campaign.
 */
export function pauseCampaign(campaignId: string): Campaign | null {
  const campaigns = loadCampaigns();
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (campaign) {
    campaign.status = 'paused';
    saveCampaigns(campaigns);
  }
  return campaign ?? null;
}

/**
 * Get campaign ROI metrics.
 */
export function campaignROI(campaign: Campaign): {
  totalSpent: number;
  totalRecovered: number;
  roi: number;
  costPerRecovery: number;
} {
  // In demo, marginal cost is 0 per action
  const totalSpent = 0;
  return {
    totalSpent,
    totalRecovered: campaign.metrics.total_recovery_amount,
    roi: totalSpent > 0 ? campaign.metrics.total_recovery_amount / totalSpent : Infinity,
    costPerRecovery: campaign.metrics.total_recovered > 0 ? totalSpent / campaign.metrics.total_recovered : 0,
  };
}
