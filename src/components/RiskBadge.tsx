import type { RiskScore } from '../types';
import { riskLabel } from '../engine/risk';

/**
 * Radar-style risk pill: colored dot + level + score.
 * Hover reveals the top contributing signals.
 */
export function RiskBadge({ risk, compact = false }: { risk: RiskScore; compact?: boolean }) {
  const title = risk.signals.length
    ? risk.signals.map((s) => `• ${s.label} (+${s.weight})`).join('\n')
    : 'No risk signals';
  return (
    <span className={`risk-badge risk-${risk.level}`} title={title}>
      <i className="risk-dot" />
      {compact ? risk.score : `${riskLabel(risk.level)} · ${risk.score}`}
    </span>
  );
}
