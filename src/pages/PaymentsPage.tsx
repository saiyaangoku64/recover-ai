import { useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { PaymentsTable } from '../components/PaymentsTable';

const PAGE_SIZE = 25;

function exportPaymentsCsv(payments: ReturnType<typeof Array.prototype.filter>) {
  const headers = ['id', 'customer_name', 'email', 'merchant', 'amount', 'currency', 'method', 'failure_reason', 'failure_category', 'previous_successes', 'retry_count', 'days_since_failure'];
  const lines = [
    headers.join(','),
    ...payments.map((p: any) =>
      [
        p.id,
        `"${(p.customer_name || '').replace(/"/g, '""')}"`,
        p.email || '',
        `"${(p.merchant || '').replace(/"/g, '""')}"`,
        p.amount,
        p.currency,
        p.method,
        p.failure_reason,
        p.failure_category,
        p.previous_successes,
        p.retry_count,
        p.days_since_failure,
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revive-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PaymentsPage() {
  const { payments, results, searchQuery, setSearchQuery, tableFilter, setTableFilter } = useRecovery();
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          p.id.toLowerCase().includes(q) ||
          p.customer_name.toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q) ||
          (p.merchant || '').toLowerCase().includes(q) ||
          p.failure_reason.toLowerCase().includes(q) ||
          p.method.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (tableFilter === 'soft') return p.failure_category === 'soft';
      if (tableFilter === 'hard') return p.failure_category === 'hard';
      if (tableFilter === 'ptp') return results.get(p.id)?.audit.decision === 'promise_to_pay';
      return true;
    });
  }, [payments, searchQuery, tableFilter, results]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const ptpCount = [...results.values()].filter((r) => r.audit.decision === 'promise_to_pay').length;

  return (
    <div className="card table-section-card">
      <div className="table-header-row">
        <div>
          <div className="card-title">Failed payments</div>
          <div className="card-subtitle">
            {payments.length} loaded from the current payments source · {filtered.length} match filters
          </div>
        </div>
        <div className="table-tools">
          <div className="search-input-wrap">
            <Search size={14} color="#64748b" />
            <input
              type="search"
              placeholder="Search ID, customer, merchant, method…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="search-input"
            />
          </div>
          <button type="button" className="primary-btn" onClick={() => exportPaymentsCsv(filtered)} disabled={filtered.length === 0}>
            <Download size={14} /> Export
          </button>
          <div className="table-tabs">
            {([
              ['all', `All (${payments.length})`],
              ['soft', 'Soft declines'],
              ['hard', 'Hard declines'],
              ['ptp', `PTP (${ptpCount})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`table-tab-btn ${tableFilter === id ? 'active' : ''}`}
                onClick={() => { setTableFilter(id); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PaymentsTable rows={rows} />

      <div className="pagination-row">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="pagination-btns">
          <button type="button" className="ghost-btn" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className="ghost-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
