import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

// ---------------------------------------------------------------------------
// ErrorBoundary — catches rendering errors in its subtree so a broken panel
// shows a styled fallback instead of crashing the whole desktop app.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
  /** Optional label for the console log (e.g. "Terminal", "Chat"). */
  name?: string;
  /** Custom fallback UI; when omitted a built-in card with retry is shown. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const tag = this.props.name ? `:${this.props.name}` : '';
    console.error(`[ErrorBoundary${tag}]`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex items-center justify-center h-full w-full p-4 bg-surface-muted dark:bg-surface-dark">
        <div className="text-center max-w-sm">
          <div className="w-10 h-10 mx-auto rounded-full bg-danger/10 dark:bg-danger/10 flex items-center justify-center mb-3">
            <span className="text-danger text-lg">!</span>
          </div>
          <p className="text-[13px] font-semibold text-on-surface dark:text-on-canvas-dark mb-1">
            {i18n.t('error.boundaryTitle')}
          </p>
          <p className="text-[11.5px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-4 break-all">
            {this.state.error?.message ?? i18n.t('error.unknown')}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary text-[12px] font-medium hover:bg-secondary hover:text-on-secondary transition-colors"
          >
            {i18n.t('common.retry')}
          </button>
        </div>
      </div>
    );
  }
}
