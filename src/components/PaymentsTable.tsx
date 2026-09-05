import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Payment } from '../types';
import { useRecovery } from '../context/RecoveryContext';
import { INR, customerEmail, decisionClass, toWords } from '../format';

interface PaymentsTableProps {
  rows: Payment[];
}

function PaymentsTableInner({ rows }: PaymentsTableProps) {
  const { results, evaluating, selectedPayment, handleEvaluate } = useRecovery();

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No payments match this search or filter.
      </div>
    );
  }

  return (
    <div className="clean-table-wrap">
      <table className="clean-table">
        <thead>
          <tr>
            <th>Payment ID</th>
            <th>Merchant</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Failure</th>
            <th>Category</th>
            <th>Decision</th>
            <th>Policy</th>
            <th>Recovery value</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const evalRes = results.get(p.id);
            const isSelected = selectedPayment?.id === p.id;
            const isEvaluatingThis = evaluating.has(p.id);

            return (
              <tr
                key={p.id}
                className={`clickable ${isSelected ? 'selected' : ''}`}
                onClick={() => handleEvaluate(p)}
              >
                <td className="mono-cell">{p.id}</td>
                <td><strong>{p.merchant || 'Razorpay Direct'}</strong></td>
                <td>
                  <div className="stack-cell">
                    <span>{p.customer_name}</span>
                    <span className="muted">{customerEmail(p.customer_name, p.email)}</span>
                  </div>
                </td>
                <td className="amt-cell">{INR(p.amount)}</td>
                <td className="mono-cell">{p.method.toUpperCase()}</td>
                <td className="muted">{toWords(p.failure_reason)}</td>
                <td>
                  <span className={`tag-badge ${p.failure_category === 'hard' ? 'blocked' : 'retry'}`}>
                    {p.failure_category}
                  </span>
                </td>
                <td>
                  {isEvaluatingThis ? (
                    <span className="eval-inline">
                      <span className="spinner-sm spinner-dark" /> Evaluating…
                    </span>
                  ) : evalRes ? (
                    <span className={`tag-badge ${decisionClass(evalRes.audit.decision)}`}>
                      {toWords(evalRes.audit.decision)}
                    </span>
                  ) : (
                    <span className="muted">Unevaluated</span>
                  )}
                </td>
                <td>
                  {evalRes ? (
                    <span className={`tag-badge ${evalRes.policy.result}`}>
                      {evalRes.policy.result}
                    </span>
                  ) : '—'}
                </td>
                <td className="amt-cell" style={{ color: evalRes?.audit.expected_recovery ? '#059669' : undefined }}>
                  {evalRes ? INR(evalRes.audit.expected_recovery) : '—'}
                </td>
                <td>
                  <button
                    type="button"
                    className="table-tab-btn"
                    onClick={(e) => { e.stopPropagation(); handleEvaluate(p); }}
                  >
                    Inspect <ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const PaymentsTable = memo(PaymentsTableInner);
