import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React error:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-[60vh] items-center justify-center bg-paper p-6 text-center text-ink">
          <div className="max-w-md border border-line bg-surface p-8 shadow-sm">
            <p className="eyebrow text-terra">Something went wrong</p>
            <h1 className="mt-2 font-serif text-2xl text-forest">We ran into an unexpected problem</h1>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {this.state.error?.message || 'An error occurred while displaying this page.'}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="border border-forest bg-forest px-4 py-2 text-xs font-semibold uppercase tracking-wider text-paper hover:bg-forest-light"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink hover:bg-line/20"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
