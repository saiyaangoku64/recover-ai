import { useMemo, useState } from 'react';
import { useRecovery } from '../context/RecoveryContext';
import { customerEmail, decisionClass, fmtTime, toWords } from '../format';

type QueueTab = 'actionable' | 'all' | 'unevaluated' | 'retry' | 'ptp' | 'reminder' | 'blocked';
const PAGE_SIZE = 25;

export function QueuePage() {
  const {
    payments,
    results,
    evaluating,
    selectedPayment,
    handleEvaluate,
    checkedIds,
    toggleChecked,
    clearChecked,
  } = useRecovery();

  const [tab, setTab] = useState<QueueTab>('actionable');
  const [page, setPage] = useState(1);
  const [rescoring, setRescoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queues = useMemo(() => {
    const groups: Record<QueueTab, typeof payments> = {
      actionable: [], all: payments, unevaluated: [], retry: [], ptp: [], reminder: [], blocked: [],
    };
    for (const p of payments) {
      const r = results.get(p.id);
      if (!r) {
        groups.unevaluated.push(p);
        groups.actionable.push(p);
      } else if (r.policy.result === 'blocked') {
        groups.blocked.push(p);
      } else {
        if (r.audit.decision !== 'none') groups.actionable.push(p);
        if (r.audit.decision === 'retry') groups.retry.push(p);
        if (r.audit.decision === 'promise_to_pay') groups.ptp.push(p);
        if (r.audit.decision === 'send_reminder') groups.reminder.push(p);
      }
    }
    return groups;
  }, [payments, results]);

  const filtered = queues[tab];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = payments.filter((p) => checkedIds.has(p.id));

  const rescoreSelected = async () => {
    if (rescoring) return;
    setRescoring(true);
    setError(null);
    let failed = 0;
    try {
      for (const p of selected) {
        try {
          await handleEvaluate(p, { openDrawer: false, force: true });
        } catch {
          failed++;
        }
      }
      if (failed) setError(`Could not complete rescoring for ${failed} payment(s). Please try again.`);
    } finally {
      setRescoring(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="card padded-card">
        <div className="table-header-row">
          <div>
            <div className="card-title">Failed-payment work queue</div>
            <div className="card-subtitle">Rescore selected payments, or open a row to inspect. Selections persist across tabs and pages.</div>
          </div>
          <div className="queue-toolbar">
            <button type="button" className="primary-btn" onClick={rescoreSelected} disabled={selected.length === 0 || rescoring || evaluating.size > 0}>
              {rescoring ? 'Rescoring' : 'Rescore selected'} ({selected.length})
            </button>
            {checkedIds.size > 0 && (
              <button type="button" className="ghost-btn" onClick={clearChecked} disabled={rescoring}>Clear</button>
            )}
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="profile-tabs queue-tabs" role="group" aria-label="Filter queue">
          {([
            ['actionable', 'Actionable'],
            ['all', 'All'],
            ['unevaluated', 'Unevaluated'],
            ['retry', 'Retry'],
            ['ptp', 'PTP'],
            ['reminder', 'Reminders'],
            ['blocked', 'Blocked'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`profile-tab ${tab === id ? 'active' : ''}`}
              aria-pressed={tab === id}
              onClick={() => { setTab(id); setPage(1); }}
            >
              {label} ({queues[id].length})
            </button>
          ))}
        </div>

        <div className="payment-queue-list queue-full">
          {filtered.length === 0 && (
            <div className="empty-state">
              <p>{payments.length === 0 ? 'No failed payments loaded.' : tab === 'unevaluated' ? 'All loaded payments have been evaluated.' : 'No payments match this queue filter.'}</p>
              {payments.length > 0 && tab !== 'all' && (
                <button type="button" className="ghost-btn" onClick={() => { setTab('all'); setPage(1); }}>View all payments</button>
              )}
            </div>
          )}
          {rows.map((p) => {
            const r = results.get(p.id);
            const isBlocked = r?.policy.result === 'blocked';
            return (
              <div
                key={p.id}
                className={`queue-item queue-selectable ${selectedPayment?.id === p.id ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  className="queue-checkbox"
                  checked={checkedIds.has(p.id)}
                  disabled={rescoring}
                  aria-label={`Select ${p.id}`}
                  onChange={() => toggleChecked(p.id)}
                />
                <button
                  type="button"
                  className="queue-row-trigger"
                  aria-label={`Inspect ${p.customer_name}, payment ${p.id}`}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setError(null);
                    void handleEvaluate(p).catch(() => setError(`Could not evaluate payment ${p.id}. Please try again.`));
                  }}
                >
                  <span className="queue-left queue-wide">
                    <span className="queue-time">{fmtTime(p.created_at)}</span>
                    <span className="queue-customer wide">{p.customer_name}</span>
                    <span className="muted hide-sm">{customerEmail(p.customer_name, p.email)}</span>
                  </span>
                  <span className={`queue-tag ${isBlocked ? 'blocked' : r ? 'evaluated' : ''}`}>
                    {evaluating.has(p.id)
                      ? 'Evaluating'
                      : isBlocked
                        ? 'Blocked'
                        : r
                          ? toWords(r.audit.decision)
                          : 'Unevaluated'}
                  </span>
                  {r && <span className={`tag-badge ${decisionClass(r.audit.decision)}`}>{toWords(r.audit.decision)}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <nav className="pagination-row" aria-label="Queue pagination">
          <span role="status">Page {safePage} of {totalPages} | {filtered.length} payments</span>
          <div className="pagination-btns">
            <button type="button" className="ghost-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button type="button" className="ghost-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </nav>
      </div>
    </div>
  );
}
