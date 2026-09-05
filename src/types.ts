export interface Payment {
  id: string;
  customer_id: string;
  customer_name: string;
  email?: string;
  phone?: string;
  merchant?: string;
  amount: number;
  currency: string;
  method: 'upi' | 'card' | 'netbanking' | 'wallet';
  failure_reason: string;
  failure_category: 'hard' | 'soft';
  previous_successes: number;
  retry_count: number;
  days_since_failure: number;
  subscription_type: string;
  created_at: string;
}

export interface LLMResult {
  decision: 'retry' | 'none' | 'promise_to_pay' | 'send_reminder';
  confidence: number;
  reason: string;
  expected_recovery_value: number;
  recovery_channel: 'auto_retry' | 'whatsapp' | 'voice' | null;
  ptp_due_date?: string;
  root_cause?: string;
  recoverability?: number;
  recommended_timing?: string;
}

export interface PolicyResult {
  result: 'passed' | 'blocked';
  reason: string;
}

export interface PolicyConfig {
  minConfidence: number;
  maxRetries: number;
  maxDaysSinceFailure: number;
  highValueAmount: number;
  highValueMinConfidence: number;
  fatigueRetryCount: number;
}

export interface PolicyRuleView {
  id: string;
  label: string;
  passed: boolean | null;
  detail: string;
}

export interface AuditEvent {
  id?: string;
  payment_id: string;
  amount: number;
  decision: string;
  confidence: number;
  reason: string;
  policy_result: string;
  policy_reason: string | null;
  recovery_channel: string | null;
  ptp_status: 'pending' | 'kept' | 'broken' | null;
  ptp_due_date: string | null;
  expected_recovery: number;
  merchant_id?: string | null;
  created_at?: string;
}

export interface RecoveryResult {
  payment: Payment;
  llm: LLMResult;
  policy: PolicyResult;
  audit: AuditEvent;
  source: 'ai' | 'heuristic';
  retryPlan: SmartRetryAttempt[];
  risk: RiskScore;
}

export interface PaymentsSource {
  id: 'json' | 'razorpay';
  label: string;
  listFailed(): Promise<Payment[]>;
}

// --- Advanced engine types ---

export type OutcomeStatus = 'recovered' | 'failed' | 'expired' | 'pending';

export interface RecoveryOutcome {
  payment_id: string;
  predicted_recovery: number;
  actual_recovery: number;
  status: OutcomeStatus;
  steps_taken: string[];
  channel: string | null;
  first_contact_at: string;
  last_updated_at: string;
  prediction_confidence: number;
}

export type CustomerSegment =
  | 'whale'        // high value + loyal
  | 'loyal'        // many successes, temporary issue
  | 'new'          // first few payments
  | 'at_risk'      // declining engagement
  | 'dormant'      // long silence
  | 'fraud_flag';  // hard decline patterns

export interface CustomerProfile {
  customer_id: string;
  name: string;
  email: string;
  segment: CustomerSegment;
  lifetime_value: number;
  failure_count: number;
  success_rate: number;
  avg_recovery_time_hours: number;
  risk_score: number;        // 0-1, higher = more risk
  recovery_probability: number;
  recommended_channel: string;
  churn_signal: boolean;
  last_payment_at: string | null;
  tags: string[];
}

export interface RecoveryStep {
  id: string;
  type: 'retry' | 'whatsapp' | 'voice' | 'ptp' | 'wait' | 'escalate' | 'abstain' | 'multi_channel';
  delay_ms: number;
  max_attempts: number;
  timeout_ms: number;
  condition?: string;
}

export interface OrchestratorPlan {
  id: string;
  payment_id: string;
  steps: RecoveryStep[];
  current_step: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  outcomes: string[];
  escalated: boolean;
}

export interface EscalationRule {
  id: string;
  name: string;
  trigger: 'no_response_hours' | 'ptp_broken' | 'high_value' | 'repeat_failure' | 'time_of_day';
  threshold: number;
  action: 'escalate_to_agent' | 'switch_channel' | 'pause_campaign' | 'flag_for_review';
  enabled: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  segment: CustomerSegment | 'all';
  strategy: 'aggressive' | 'conservative' | 'balanced';
  started_at: string | null;
  status: 'draft' | 'running' | 'paused' | 'completed';
  payment_ids: string[];
  metrics: CampaignMetrics;
  config: {
    max_ai_calls: number;
    retry_window_hours: number;
    escalation_enabled: boolean;
  };
}

export interface CampaignMetrics {
  total_attempted: number;
  total_recovered: number;
  total_recovery_amount: number;
  predicted_recovery_amount: number;
  avg_confidence: number;
  channel_breakdown: Record<string, number>;
  step_success_rates: Record<string, number>;
  errors: number;
}

export interface AnalyticsSnapshot {
  timestamp: string;
  total_payments: number;
  at_risk_value: number;
  recovered_value: number;
  predicted_value: number;
  recovery_rate: number;
  calibration_error: number;
  roi_score: number;
  segment_breakdown: Record<CustomerSegment, { count: number; value: number; recovery_rate: number }>;
}

// --- Stripe-grade recovery intelligence ---

export type RetryStrategy = 'silent_retry' | 'customer_action' | 'update_method' | 'abstain';

export interface RetryAttemptPlan {
  attempt: number;
  dayOffset: number;
  scheduledFor: string; // ISO date
  window: string;       // e.g. "02:00–05:00 IST · low-load window"
  channel: 'auto' | 'whatsapp' | 'link';
  rationale: string;
}

export interface DeclinePlaybook {
  reason: string;
  retryable: boolean;
  strategy: RetryStrategy;
  maxAttempts: number;
  schedule: Omit<RetryAttemptPlan, 'attempt' | 'scheduledFor'>[];
  rationale: string;
  recoveryPrior: number; // base probability the playbook assumes
}

export interface RiskSignal {
  id: string;
  label: string;
  weight: number;
}

export interface RiskScore {
  score: number; // 0–100
  level: 'low' | 'elevated' | 'high';
  signals: RiskSignal[];
}

export type DunningChannel = 'email' | 'whatsapp' | 'voice' | 'sms';

export interface DunningStage {
  stage: number;
  dayOffset: number;
  channel: DunningChannel;
  subject: string;
  template: string;
  tone: 'gentle' | 'firm' | 'final';
}

export interface DunningSequence {
  id: string;
  name: string;
  audience: string;
  stages: DunningStage[];
}

export interface ReasonIntel {
  reason: string;
  category: 'hard' | 'soft';
  count: number;
  value: number;
  recoveredEV: number;
  recoveryRate: number;
  actioned: number;
  strategy: RetryStrategy;
}

export interface TrendPoint {
  date: string;
  label: string;
  atRisk: number;
  recovered: number;
}

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  value: number;
  conversion: number; // fraction of previous stage
}
