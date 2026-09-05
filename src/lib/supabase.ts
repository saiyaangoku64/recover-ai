import { createClient } from '@supabase/supabase-js';
import type { AuditEvent } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const LOCAL_AUDIT_KEY = 'revive-local-audit';

function readLocalAudit(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalAudit(events: AuditEvent[]) {
  localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(events.slice(0, 500)));
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

async function resolveMerchantId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  if (!supabase) return 'local-demo';
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  if (!supabase) {
    const existing = readLocalAudit();
    const incoming = { ...event, id: event.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString() };
    writeLocalAudit([incoming, ...existing]);
    return;
  }

  const merchantId = await resolveMerchantId(event.merchant_id);
  const row = {
    payment_id: event.payment_id,
    event_type: 'recovery_decision',
    amount: event.amount,
    decision: event.decision,
    confidence: event.confidence,
    reason: event.reason,
    policy_result: event.policy_result,
    policy_reason: event.policy_reason,
    recovery_channel: event.recovery_channel,
    ptp_status: event.ptp_status,
    ptp_due_date: event.ptp_due_date,
    expected_recovery: event.expected_recovery,
    merchant_id: merchantId,
  };

  let { error } = await supabase.from('audit_events').insert(row);

  if (error && /merchant_id/i.test(error.message)) {
    const { merchant_id: _omit, ...legacy } = row;
    ({ error } = await supabase.from('audit_events').insert(legacy));
  }

  if (error) {
    console.error('[Supabase] Write error:', error);
    throw error;
  }
}

export async function fetchAuditEvents(merchantId?: string | null): Promise<AuditEvent[]> {
  if (!supabase) return readLocalAudit();

  const resolved = merchantId ?? (await resolveMerchantId());

  let query = supabase
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (resolved && resolved !== 'local-demo') {
    query = query.eq('merchant_id', resolved);
  }

  let { data, error } = await query;

  if (error && /merchant_id/i.test(error.message)) {
    const fallback = await supabase
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('[Supabase] Read error:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const details = (row.details && typeof row.details === 'object') ? row.details as Record<string, unknown> : {};
    return {
      id: row.id as string | undefined,
      payment_id: (row.payment_id as string) || 'UNKNOWN',
      amount: Number(row.amount ?? details.amount ?? details.expected_recovery_value ?? 0),
      decision: (row.decision as string) || (details.recommended_action as string) || (row.event_type as string) || 'none',
      confidence: Number(row.confidence ?? details.confidence ?? 0),
      reason: (row.reason as string) || (details.diagnosis as string) || (details.reason as string) || 'Decision evaluated',
      policy_result: (row.policy_result as string) || (row.event_type === 'policy_blocked' ? 'blocked' : 'passed'),
      policy_reason: (row.policy_reason as string | null) || (row.event_type === 'policy_blocked' ? (details.reason as string) : null),
      recovery_channel: (row.recovery_channel as string | null) || (details.recommended_action === 'payment_link' ? 'whatsapp' : details.recommended_action === 'retry' ? 'auto_retry' : null),
      ptp_status: (row.ptp_status as AuditEvent['ptp_status']) || null,
      ptp_due_date: (row.ptp_due_date as string | null) || null,
      expected_recovery: Number(row.expected_recovery ?? details.expected_recovery_value ?? 0),
      merchant_id: (row.merchant_id as string | null) ?? null,
      created_at: row.created_at as string | undefined,
    };
  });
}

export async function updatePTPStatus(
  paymentId: string,
  status: 'pending' | 'kept' | 'broken',
): Promise<void> {
  if (!supabase) {
    const existing = readLocalAudit();
    const updated = existing.map((e) =>
      e.payment_id === paymentId && e.decision === 'promise_to_pay'
        ? { ...e, ptp_status: status }
        : e,
    );
    writeLocalAudit(updated);
    return;
  }

  const { error } = await supabase
    .from('audit_events')
    .update({ ptp_status: status })
    .eq('payment_id', paymentId)
    .eq('decision', 'promise_to_pay');

  if (error) {
    console.error('[Supabase] PTP update error:', error);
    throw error;
  }
}
