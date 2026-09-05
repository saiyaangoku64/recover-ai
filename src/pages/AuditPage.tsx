import { useMemo, useState } from 'react';
import { Download, Search, SearchX } from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { INR, decisionClass, fmtTime, toWords } from '../format';
import type { AuditEvent } from '../types';

const PAGE_SIZE = 25;

function exportCsv(events: AuditEvent[]) {
  const headers = [
    'created_at',
    'payment_id',
    'decision',
    'policy_result',
    'policy_reason',
    'recovery_channel',
    'expected_recovery',
    'confidence',
  ];
  const lines = [
    headers.join(','),
    ...events.map((e) =>
      [
        e.created_at ?? '',
        e.payment_id,
        e.decision,
        e.policy_result,
        `"${(e.policy_reason || '').replace(/"/g, '""')}"`,
        e.recovery_channel ?? '',
        e.expected_recovery,
        e.confidence,
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revive-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type AuditFilter = 'all' | 'passed' | 'blocked';

export function AuditPage() {
  const { auditLog, payments, handleEvaluate } = useRecovery();
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return auditLog.filter((e) => {
      if (filter === 'passed' && e.policy_result !== 'passed') return false;
      if (filter === 'blocked' && e.policy_result !== 'blocked') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.payment_id.toLowerCase().includes(q) && !e.decision.includes(q)) return false;
      }
      return true;
    });
  }, [auditLog, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const passedCount = auditLog.filter((e) => e.policy_result === 'passed').length;
  const blockedCount = auditLog.filter((e) => e.policy_result === 'blocked').length;

  return (
    <div className="card padded-card">
      <div className="table-header-row">
        <div>
          <div className="card-title">Decision audit trail</div>
          <div className="card-subtitle">
            {auditLog.length} total events · {passedCount} passed · {blockedCount} blocked · Every AI decision is traceable
          </div>
        </div>
        <div className="table-tools">
          <div className="search-input-wrap">
            <Search size={14} color="#64748b" />
            <input
              type="search"
              placeholder="Search payment ID or decision…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="search-input"
            />
          </div>
          <div className="table-tabs">
            {([
              ['all', `All (${auditLog.length})`],
              ['passed', `Passed (${passedCount})`],
              ['blocked', `Blocked (${blockedCount})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`table-tab-btn ${filter === id ? 'active' : ''}`}
                onClick={() => { setFilter(id); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="primary-btn" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state-container">
          <div className="empty-state-icon"><SearchX size={36} /></div>
          <h3 className="empty-state-title">No audit events match this filter</h3>
          <p className="empty-state-desc">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="clean-table-wrap">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Payment</th>
                <th>Decision</th>
                <th>Policy</th>
                <th>Channel</th>
                <th>Expected value</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const payment = payments.find((p) => p.id === e.payment_id);
                return (
                  <tr
                    key={e.id || `${e.payment_id}-${e.created_at}`}
                    className={payment ? 'clickable' : ''}
                    onClick={() => payment && handleEvaluate(payment)}
                  >
                    <td>{fmtTime(e.created_at)}</td>
                    <td className="mono-cell">{e.payment_id}</td>
                    <td>
                      <span className={`tag-badge ${decisionClass(e.decision)}`}>{toWords(e.decision)}</span>
                    </td>
                    <td>
                      <span className={`tag-badge ${e.policy_result}`}>{e.policy_result}</span>
                    </td>
                    <td>{toWords(e.recovery_channel)}</td>
                    <td className="amt-cell">{INR(e.expected_recovery)}</td>
                    <td className="muted">{e.policy_reason || e.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="pagination-row">
          <span>Page {safePage} of {totalPages}</span>
          <div className="pagination-btns">
            <button type="button" className="ghost-btn" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className="ghost-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
