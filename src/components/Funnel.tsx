import type { FunnelStage } from '../types';
import { INR, pct } from '../format';

/**
 * Value-weighted recovery funnel with per-stage conversion.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="funnel">
      {stages.map((s, i) => (
        <div key={s.id} className="funnel-row">
          <div className="funnel-meta">
            <span className="funnel-label">
              <span className={`funnel-num fn-${i + 1}`}>{i + 1}</span>
              {s.label}
            </span>
            {i > 0 && <span className="funnel-conv">{pct(s.conversion)} carry</span>}
          </div>
          <div className="funnel-track">
            <div className={`funnel-fill ff-${i + 1}`} style={{ width: `${Math.max(3, (s.value / max) * 100)}%` }} />
          </div>
          <div className="funnel-vals">
            <strong>{INR(s.value)}</strong>
            <span>{s.count} payments</span>
          </div>
        </div>
      ))}
    </div>
  );
}
