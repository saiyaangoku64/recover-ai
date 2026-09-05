import { useMemo, useState } from 'react';
import type { TrendPoint } from '../types';
import { compactINR, INR } from '../format';

const W = 720;
const H = 250;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

function pathFor(values: number[], max: number): { line: string; area: string } {
  const iw = W - PAD_L - PAD_R;
  const ih = H - PAD_T - PAD_B;
  const n = values.length;
  const x = (i: number) => (n === 1 ? PAD_L + iw / 2 : PAD_L + (i / (n - 1)) * iw);
  const y = (v: number) => PAD_T + ih - (max > 0 ? (v / max) * ih : 0);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(PAD_T + ih).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + ih).toFixed(1)} Z`;
  return { line, area };
}

/**
 * Stripe-style cumulative revenue chart: at-risk GMV vs expected recovery.
 * Pure SVG, hover crosshair with tooltip. No chart dependency.
 */
export function RevenueChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { riskPath, recPath, ticks, xs } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.atRisk));
    const riskPath = pathFor(data.map((d) => d.atRisk), max);
    const recPath = pathFor(data.map((d) => d.recovered), max);
    const ticks = [0, 0.5, 1].map((f) => ({
      v: max * f,
      y: PAD_T + (H - PAD_T - PAD_B) * (1 - f),
    }));
    const iw = W - PAD_L - PAD_R;
    const xs = data.map((_, i) => (data.length === 1 ? PAD_L + iw / 2 : PAD_L + (i / (data.length - 1)) * iw));
    return { riskPath, recPath, ticks, xs };
  }, [data]);

  if (data.length === 0) return <div className="chart-empty">No trend data yet.</div>;

  const step = Math.max(1, Math.ceil(data.length / 7));
  const active = hover !== null ? data[hover] : null;

  return (
    <div
      className="rev-chart"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        let best = 0;
        let bestDist = Infinity;
        xs.forEach((x, i) => {
          const d = Math.abs(x - px);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setHover(best);
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="rev-chart-svg" role="img" aria-label="Recovered revenue trend">
        <defs>
          <linearGradient id="revRecFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#635bff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#635bff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} className="chart-grid" />
            <text x={PAD_L - 8} y={t.y + 4} textAnchor="end" className="chart-tick">{compactINR(t.v)}</text>
          </g>
        ))}
        <path d={riskPath.area} className="chart-risk-area" />
        <path d={riskPath.line} className="chart-risk-line" />
        <path d={recPath.area} fill="url(#revRecFill)" />
        <path d={recPath.line} className="chart-rec-line" />
        {data.map((d, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text key={d.date} x={xs[i]} y={H - 8} textAnchor="middle" className="chart-tick">{d.label}</text>
          ) : null,
        )}
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD_T} y2={H - PAD_B} className="chart-cross" />
            <circle cx={xs[hover]} cy={PAD_T + 4} r={0} />
          </g>
        )}
      </svg>
      {active && (
        <div className="chart-tip" style={{ left: `${(xs[hover!] / W) * 100}%` }}>
          <strong>{active.label}</strong>
          <span><i className="dot dot-rec" />Recovered {INR(active.recovered)}</span>
          <span><i className="dot dot-risk" />At risk {INR(active.atRisk)}</span>
        </div>
      )}
      <div className="chart-legend">
        <span><i className="dot dot-rec" />Expected recovered (cumulative)</span>
        <span><i className="dot dot-risk" />At-risk GMV (cumulative)</span>
      </div>
    </div>
  );
}
