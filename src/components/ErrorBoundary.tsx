import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#020408] text-white flex items-center justify-center">
          <div className="max-w-md text-center p-6">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-left">
              <h2 className="font-medium mb-2">Error Details:</h2>
              <pre className="text-sm text-red-300 whitespace-pre-wrap">
                {this.state.error?.message || 'Unknown error'}
              </pre>
              {this.state.error?.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-400 hover:text-red-300">
                    Stack Trace
                  </summary>
                  <pre className="text-xs mt-2 text-red-200 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"
            >
              Clear Data & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}