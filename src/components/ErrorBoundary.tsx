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
          <div className="w-10 h-10 mx-auto rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-3">
            <span className="text-red-500 text-lg">!</span>
          </div>
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {i18n.t('error.boundaryTitle')}
          </p>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mb-4 break-all">
            {this.state.error?.message ?? i18n.t('error.unknown')}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-3.5 py-1.5 rounded-lg bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-[12px] font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
          >
            {i18n.t('common.retry')}
          </button>
        </div>
      </div>
    );
  }
}
