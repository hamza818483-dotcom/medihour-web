import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. If not given, a default minimal fallback is shown. */
  fallback?: ReactNode;
  /** Label used in console logs to identify which boundary caught the error. */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Generic Error Boundary.
 *
 * Wrap any page/section with this so that if something inside throws
 * (bad prop, null reference, bad render logic, etc.), only that section
 * shows a fallback instead of crashing the entire app/site.
 *
 * Usage:
 *   <ErrorBoundary label="TakeExam page">
 *     <TakeExam />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="w-full flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
          <p className="text-sm font-semibold text-foreground">
            এই অংশটি লোড করতে সমস্যা হয়েছে।
          </p>
          <p className="text-xs text-muted-foreground">
            পেজটি রিফ্রেশ করুন। সমস্যা থাকলে সাপোর্টে জানান।
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs font-medium px-4 py-2 rounded-lg border hover:bg-muted transition-colors"
          >
            রিফ্রেশ করুন
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
