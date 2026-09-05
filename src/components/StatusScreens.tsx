import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="status-screen">
          <h2>Something unexpected happened</h2>
          <p>{this.state.error?.message}</p>
          <button className="primary-btn" type="button" onClick={() => window.location.reload()}>
            Reload dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="status-screen">
      <div className="skeleton-page">
        <div className="skeleton-block skeleton-title" />
        <div className="skeleton-row-group">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton-block skeleton-row" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      </div>
      <span className="loading-label">{message}</span>
    </div>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="status-screen">
      <h2>Failed to load payments</h2>
      <p>{message}</p>
      <button className="primary-btn" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-table-row" style={{ animationDelay: `${i * 0.06}s` }}>
          <div className="skeleton-block skeleton-cell-lg" />
          <div className="skeleton-block skeleton-cell" />
          <div className="skeleton-block skeleton-cell-sm" />
        </div>
      ))}
    </div>
  );
}
