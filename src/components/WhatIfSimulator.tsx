import { useMemo, useState } from 'react';
import type { Payment, PolicyConfig } from '../types';
import { heuristicDecision } from '../engine/llm';
import { checkPolicy } from '../engine/policy';
import { INR } from '../format';

function syntheticPayment(opts: {
  amount: number;
  failure: string;
  retries: number;
  successes: number;
}): Payment {
  const hard = opts.failure === 'stolen_card' || opts.failure === 'fraud_suspected';
  return {
    id: 'sim_preview',
    customer_id: 'sim',
    customer_name: 'Simulator',
    amount: opts.amount,
    currency: 'INR',
    method: 'upi',
    failure_reason: opts.failure,
    failure_category: hard ? 'hard' : 'soft',
    previous_successes: opts.successes,
    retry_count: opts.retries,
    days_since_failure: 1,
    subscription_type: 'monthly',
    created_at: new Date().toISOString(),
  };
}

export function WhatIfSimulator({ config }: { config: PolicyConfig }) {
  const [amount, setAmount] = useState(12500);
  const [failure, setFailure] = useState('bank_down');
  const [retries, setRetries] = useState(1);
  const [successes, setSuccesses] = useState(8);

  const outcome = useMemo(() => {
    const payment = syntheticPayment({ amount, failure, retries, successes });
    const llm = heuristicDecision(payment);
    const policy = checkPolicy(payment, llm, config);
    return { payment, llm, policy };
  }, [amount, failure, retries, successes, config]);

  const blocked = outcome.policy.result === 'blocked';

  return (
    <div className="simulator-grid">
      <div className="sim-slider-row">
        <div className="sim-slider-header">
          <span>Transaction amount</span>
          <span>{INR(amount)}</span>
        </div>
        <input
          type="range"
          min={500}
          max={100000}
          step={500}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="sim-slider"
        />
      </div>

      <div className="sim-slider-row">
        <div className="sim-slider-header">
          <span>Current retry count</span>
          <span>{retries} / {config.maxRetries}</span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          value={retries}
          onChange={(e) => setRetries(Number(e.target.value))}
          className="sim-slider"
        />
      </div>

      <div className="sim-slider-row">
        <div className="sim-slider-header">
          <span>Failure code</span>
        </div>
        <select value={failure} onChange={(e) => setFailure(e.target.value)}>
          <option value="bank_down">Bank server down (soft)</option>
          <option value="insufficient_funds">Insufficient funds (soft)</option>
          <option value="stolen_card">Stolen card (hard)</option>
          <option value="fraud_suspected">Fraud suspected (hard)</option>
        </select>
      </div>

      <div className="sim-slider-row">
        <div className="sim-slider-header">
          <span>Past successful payments</span>
          <span>{successes}</span>
        </div>
        <input
          type="range"
          min={0}
          max={25}
          value={successes}
          onChange={(e) => setSuccesses(Number(e.target.value))}
          className="sim-slider"
        />
      </div>

      <div className="sim-output-box">
        <div>
          <div className="sim-output-label">Heuristic + policy output</div>
          <div className={`sim-output-decision ${blocked ? 'blocked' : 'ok'}`}>
            {blocked
              ? `BLOCKED · ${outcome.policy.reason}`
              : `${outcome.llm.decision.replace(/_/g, ' ')} · ${outcome.llm.recovery_channel ?? 'no channel'}`}
          </div>
        </div>
        <div className="sim-output-value">
          <div className="sim-output-label">Expected value</div>
          <div>{blocked ? INR(0) : INR(outcome.llm.expected_recovery_value)}</div>
        </div>
      </div>
    </div>
  );
}
