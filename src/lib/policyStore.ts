import type { PolicyConfig } from '../types';
import { DEFAULT_POLICY } from '../engine/policy';
import { supabase } from './supabase';

const LS_KEY = 'revive-policy-config';

function mergeConfig(raw: unknown): PolicyConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_POLICY };
  return { ...DEFAULT_POLICY, ...(raw as Partial<PolicyConfig>) };
}

export function readLocalPolicy(): PolicyConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_POLICY };
    return mergeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function writeLocalPolicy(config: PolicyConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

export async function loadPolicyConfig(merchantId: string): Promise<PolicyConfig> {
  const local = readLocalPolicy();
  if (!supabase || merchantId === 'local-demo') return local;

  const { data, error } = await supabase
    .from('policy_config')
    .select('config')
    .eq('merchant_id', merchantId)
    .maybeSingle();

  if (error || !data?.config) return local;
  const merged = mergeConfig(data.config);
  writeLocalPolicy(merged);
  return merged;
}

export async function savePolicyConfig(merchantId: string, config: PolicyConfig): Promise<void> {
  writeLocalPolicy(config);
  if (!supabase || merchantId === 'local-demo') return;

  const { error } = await supabase.from('policy_config').upsert({
    merchant_id: merchantId,
    config,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[policy] Supabase save skipped:', error.message);
  }
}
