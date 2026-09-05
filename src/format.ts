export const INR = (n?: number | null) => {
  const val = Number(n);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(isNaN(val) ? 0 : val);
};

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

export const fmtTime = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
  } catch {
    return '—';
  }
};

export const toWords = (s?: string | null) => (s ? String(s).replace(/_/g, ' ') : '—');

export const pct = (n?: number | null) => {
  const val = Number(n);
  if (n === null || n === undefined || isNaN(val)) return '—';
  return `${(val * 100).toFixed(1)}%`;
};

/** Compact INR for chart axes: ₹6.7L, ₹1.2Cr */
export const compactINR = (n?: number | null) => {
  const val = Number(n);
  if (n === null || n === undefined || isNaN(val)) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e7) return `₹${(val / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(val / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(val / 1e3).toFixed(1)}k`;
  return `₹${Math.round(val)}`;
};

export const decisionClass = (decision?: string | null) => {
  if (!decision) return '';
  if (decision === 'promise_to_pay') return 'ptp';
  if (decision === 'send_reminder') return 'reminder';
  return decision;
};

export function customerEmail(name: string, email?: string) {
  return email || `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
}
