import { Component, type ErrorInfo, type ReactNode } from "react";
import { logAdminEvent } from "@/lib/admin-telemetry.functions";

/**
 * Catches render errors inside the /admin/* subtree, reports them via
 * logAdminEvent, and resets automatically on route change.
 * Extracted from admin.tsx for readability — no behavior change.
 */
export class AdminErrorBoundary extends Component<
  { pathname: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void logAdminEvent({
      data: {
        kind: "render_error",
        path: this.props.pathname,
        message: error.message,
        stack: error.stack ?? null,
        extra: { componentStack: info.componentStack?.slice(0, 2000) ?? null },
      },
    }).catch(() => {});
  }
  componentDidUpdate(prev: { pathname: string }) {
    if (prev.pathname !== this.props.pathname && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-2">
          <div className="text-sm font-medium text-destructive">{this.state.error.message}</div>
          <div className="text-xs text-muted-foreground">
            تم تسجيل الخطأ في سجل النظام. جرّب التنقّل لصفحة أخرى.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
