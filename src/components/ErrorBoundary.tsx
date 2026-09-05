import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#ef4444',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠</p>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Something went wrong</p>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '1rem',
              padding: '0.4rem 1rem',
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
