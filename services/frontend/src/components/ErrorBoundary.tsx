import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { translator } from '../i18n';
import { getActiveLanguage } from '../utils/locale';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps one broken screen from taking down the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Eureka crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    // A class component cannot use hooks, and by the time this renders the
    // provider may be the thing that broke — so read the language directly.
    const t = translator(getActiveLanguage());

    return (
      <div className="error-screen">
        <div className="stack" style={{ alignItems: 'center', maxWidth: '20rem' }}>
          <span className="icon-circle icon-circle-danger">
            <TriangleAlert size={26} strokeWidth={1.75} />
          </span>
          <h1 className="title">{t('error.title')}</h1>
          <p>{t('error.body')}</p>
          <code className="mono dim small">{this.state.error.message}</code>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={16} /> {t('error.reload')}
          </button>
        </div>
      </div>
    );
  }
}
