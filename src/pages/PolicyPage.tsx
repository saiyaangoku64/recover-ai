import { useState } from 'react';
import { DEFAULT_POLICY } from '../engine/policy';
import { useRecovery } from '../context/RecoveryContext';
import { useToast } from '../components/Toast';
import type { PolicyConfig } from '../types';
import { WhatIfSimulator } from '../components/WhatIfSimulator';

const POLICY_FIELDS: { key: keyof PolicyConfig; label: string; min: number; max?: number; integer?: boolean }[] = [
  { key: 'minConfidence', label: 'Minimum confidence', min: 0, max: 1 },
  { key: 'maxRetries', label: 'Max retries', min: 0, max: 10, integer: true },
  { key: 'maxDaysSinceFailure', label: 'Max days since failure', min: 1, max: 90, integer: true },
  { key: 'highValueAmount', label: 'High-value amount (₹)', min: 0 },
  { key: 'highValueMinConfidence', label: 'High-value min confidence', min: 0, max: 1 },
  { key: 'fatigueRetryCount', label: 'Soft-decline fatigue retries', min: 1, max: 10, integer: true },
];

export function PolicyPage() {
  const { policyConfig, savePolicy } = useRecovery();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PolicyConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = draft ?? policyConfig;
  const errors: Partial<Record<keyof PolicyConfig, string>> = {};
  for (const { key, min, max, integer } of POLICY_FIELDS) {
    const value = form[key];
    if (!Number.isFinite(value)) errors[key] = 'Enter a finite number.';
    else if (value < min || (max !== undefined && value > max)) {
      errors[key] = max === undefined ? `Must be at least ${min}.` : `Must be between ${min} and ${max}.`;
    } else if (integer && !Number.isInteger(value)) errors[key] = 'Enter a whole number.';
  }
  const invalid = Object.keys(errors).length > 0;

  const set = <K extends keyof PolicyConfig>(key: K, value: PolicyConfig[K]) => {
    setDraft({ ...form, [key]: value });
    setSaved(false);
    setSaveError(null);
  };

  const onSave = async () => {
    if (invalid || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await savePolicy(form);
      setDraft(form);
      setSaved(true);
      toast('Policy saved successfully');
    } catch {
      setSaveError('Could not confirm the policy was saved. It may already be applied in this session. Please try again.');
      toast('Failed to save policy', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="card padded-card">
        <div className="card-title">Stopping rules</div>
        <div className="card-subtitle">
          These thresholds gate every evaluation. Saved to this browser, and to Supabase when signed in.
        </div>

        <form noValidate onSubmit={(event) => { event.preventDefault(); void onSave(); }} aria-busy={saving}>
          <div className="policy-form">
            {POLICY_FIELDS.map(({ key, label, min, max, integer }) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={integer ? 1 : 'any'}
                  value={Number.isFinite(form[key]) ? form[key] : ''}
                  disabled={saving}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `policy-${key}-error` : undefined}
                  onChange={(event) => set(key, event.currentTarget.valueAsNumber)}
                />
                {errors[key] && <span className="form-error" id={`policy-${key}-error`}>{errors[key]}</span>}
              </label>
            ))}
          </div>

          <div className="queue-toolbar">
            <button type="submit" className="primary-btn" disabled={invalid || saving}>{saving ? 'Saving...' : 'Save policy'}</button>
            <button
              type="button"
              className="ghost-btn"
              disabled={saving}
              onClick={() => {
                setDraft({ ...DEFAULT_POLICY });
                setSaved(false);
                setSaveError(null);
              }}
            >
              Reset defaults
            </button>
            {saved && <span className="save-hint" role="status">Saved</span>}
          </div>
          {invalid && <p className="form-error" role="alert">Correct the highlighted thresholds before saving or simulating.</p>}
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
        </form>
      </div>

      <div className="card padded-card">
        <div className="card-title">What-if simulator</div>
        <div className="card-subtitle">Simulator uses the form above. Save to apply these thresholds to live evaluations.</div>
        {!invalid && <WhatIfSimulator config={form} />}
      </div>
    </div>
  );
}
