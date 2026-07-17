import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Props = { children: ReactNode; fallback?: (error: Error, reset: () => void) => ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 text-center backdrop-blur">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">حدث خطأ غير متوقع</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error.message || "Something went wrong. Please try again."}
          </p>
          <Button onClick={this.reset} className="mt-5 gap-2" size="sm">
            <RefreshCw className="size-4" />{t("common.retry")}</Button>
        </div>
      </div>
    );
  }
}
