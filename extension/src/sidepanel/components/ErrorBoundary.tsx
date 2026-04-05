import React, { Component } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[AngleCheck] Component error:", error);
    console.error("[AngleCheck] Component stack:", errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] px-6 py-10 mx-3 my-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
            Something went wrong
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 text-center mb-4 leading-relaxed">
            An unexpected error occurred. Please try reloading.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
