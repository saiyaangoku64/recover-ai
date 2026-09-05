import { useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { INR, fmtDate, toWords, pct } from '../format';

type PtpFilter = 'all' | 'pending' | 'kept' | 'broken';

export function PtpPage() {
  const { results, payments, handlePTP, handleEvaluate } = useRecovery();
  const [filter, setFilter] = useState<PtpFilter>('all');

  const allPtp = useMemo(() => {
    return [...results.values()].filter((r) => r.audit.decision === 'promise_to_pay');
  }, [results]);

  const rows = useMemo(() => {
    return allPtp.filter((r) => {
      const status = r.audit.ptp_status || 'pending';
      if (filter === 'all') return true;
      return status === filter;
    });
  }, [allPtp, filter]);

  const pendingCount = allPtp.filter((r) => (r.audit.ptp_status || 'pending') === 'pending').length;
  const keptCount = allPtp.filter((r) => r.audit.ptp_status === 'kept').length;
  const brokenCount = allPtp.filter((r) => r.audit.ptp_status === 'broken').length;
  const pendingValue = allPtp.filter((r) => (r.audit.ptp_status || 'pending') === 'pending').reduce((s, r) => s + r.audit.expected_recovery, 0);
  const keptValue = allPtp.filter((r) => r.audit.ptp_status === 'kept').reduce((s, r) => s + r.audit.expected_recovery, 0);

  return (
    <div className="page-stack">
      <div className="ptp-stats-row">
        <div className="ptp-stat-card ptp-stat-total">
          <div className="ptp-stat-label">Total PTP</div>
          <div className="ptp-stat-value">{allPtp.length}</div>
          <div className="ptp-stat-hint">{INR(allPtp.reduce((s, r) => s + r.audit.expected_recovery, 0))} expected</div>
        </div>
        <div className="ptp-stat-card ptp-stat-pending">
          <div className="ptp-stat-label">Pending</div>
          <div className="ptp-stat-value">{pendingCount}</div>
          <div className="ptp-stat-hint">{INR(pendingValue)} at stake</div>
        </div>
        <div className="ptp-stat-card ptp-stat-kept">
          <div className="ptp-stat-label">Kept</div>
          <div className="ptp-stat-value">{keptCount}</div>
          <div className="ptp-stat-hint">{INR(keptValue)} recovered</div>
        </div>
        <div className="ptp-stat-card ptp-stat-broken">
          <div className="ptp-stat-label">Broken</div>
          <div className="ptp-stat-value">{brokenCount}</div>
          <div className="ptp-stat-hint">{allPtp.length > 0 ? pct(brokenCount / allPtp.length) : '0%'} broken rate</div>
        </div>
      </div>

      <div className="card padded-card">
        <div className="table-header-row">
          <div>
            <div className="card-title">Promise-to-pay tracker</div>
            <div className="card-subtitle">Pending, kept, and broken commitments from evaluated payments</div>
          </div>
          <div className="table-tabs">
            {(['all', 'pending', 'kept', 'broken'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`table-tab-btn ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state-container">
            <div className="empty-state-icon"><Handshake size={36} /></div>
            <h3 className="empty-state-title">No promise-to-pay decisions yet</h3>
            <p className="empty-state-desc">Evaluate payments or run a batch to see PTP commitments here.</p>
          </div>
        ) : (
          <div className="clean-table-wrap">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const payment = payments.find((p) => p.id === r.payment.id) || r.payment;
                  const status = r.audit.ptp_status || 'pending';
                  return (
                    <tr key={r.payment.id} className="clickable" onClick={() => handleEvaluate(payment)}>
                      <td className="mono-cell">{r.payment.id}</td>
                      <td>{payment.customer_name}</td>
                      <td className="amt-cell">{INR(payment.amount)}</td>
                      <td>{fmtDate(r.audit.ptp_due_date)}</td>
                      <td>
                        <span className={`tag-badge ${status === 'kept' ? 'passed' : status === 'broken' ? 'blocked' : 'ptp'}`}>
                          {toWords(status)}
                        </span>
                      </td>
                      <td className="amt-cell">{INR(r.audit.expected_recovery)}</td>
                      <td>
                        <div className="inline-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="table-tab-btn ptp-kept" onClick={() => handlePTP(r.payment.id, 'kept')}>
                            Kept
                          </button>
                          <button type="button" className="table-tab-btn ptp-broken" onClick={() => handlePTP(r.payment.id, 'broken')}>
                            Broken
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
