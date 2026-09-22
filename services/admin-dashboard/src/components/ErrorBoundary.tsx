import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps one broken page from taking down the whole console. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin console crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-screen">
        <div className="stack" style={{ alignItems: 'center', maxWidth: '28rem' }}>
          <TriangleAlert size={32} color="var(--status-danger-ink)" strokeWidth={1.5} />
          <h1>Something went wrong</h1>
          <p>
            The page hit an unexpected error. Reloading usually clears it — the details are in the
            browser console.
          </p>
          <code className="mono dim">{this.state.error.message}</code>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={15} /> Reload the console
          </button>
        </div>
      </div>
    );
  }
}
