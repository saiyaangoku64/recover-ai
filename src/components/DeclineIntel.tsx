import type { ReasonIntel } from '../types';
import { INR, pct, toWords } from '../format';
import { strategyLabel } from '../engine/smartRetry';

/**
 * Decline-code intelligence table: every failure reason with volume,
 * expected recovery, recovery-rate bar, and its playbook strategy.
 */
export function DeclineIntel({ rows }: { rows: ReasonIntel[] }) {
  const maxRate = Math.max(0.01, ...rows.map((r) => r.recoveryRate));
  return (
    <div className="clean-table-wrap">
      <table className="clean-table intel-table">
        <thead>
          <tr>
            <th>Failure code</th>
            <th>Playbook</th>
            <th className="num">Volume</th>
            <th className="num">At risk</th>
            <th className="num">Expected recovery</th>
            <th>Recovery rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reason}>
              <td>
                <div className="stack-cell">
                  <span className="mono-cell">{r.reason}</span>
                  <span className="muted">{r.category === 'hard' ? 'Hard decline' : 'Soft decline'} · {r.actioned} actioned</span>
                </div>
              </td>
              <td>
                <span className={`strategy-pill sp-${r.strategy}`}>{strategyLabel(r.strategy)}</span>
              </td>
              <td className="num">{r.count}</td>
              <td className="num amt-cell">{INR(r.value)}</td>
              <td className="num amt-cell pos">{INR(r.recoveredEV)}</td>
              <td>
                <div className="rate-cell">
                  <div className="rate-track">
                    <div className="rate-fill" style={{ width: `${(r.recoveryRate / maxRate) * 100}%` }} />
                  </div>
                  <span>{pct(r.recoveryRate)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted table-foot-note">
        Recovery rate = expected recovery ÷ value at risk · {toWords('powered by smart-retry playbooks')}
      </p>
    </div>
  );
}
