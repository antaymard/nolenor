import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { TbAlertTriangle } from "react-icons/tb";

interface PlateErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
}

interface PlateErrorBoundaryState {
  hasError: boolean;
  attempt: number;
}

export class PlateErrorBoundary extends Component<
  PlateErrorBoundaryProps,
  PlateErrorBoundaryState
> {
  state: PlateErrorBoundaryState = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<PlateErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PlateErrorBoundary] Rendering crash:", error, info);
  }

  componentDidUpdate(prevProps: PlateErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleReload = (): void => {
    this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-4 text-center">
          <TbAlertTriangle size={28} className="text-amber-500" />
          <div className="text-sm text-muted-foreground">
            Document corrompu — impossible à afficher.
          </div>
          <Button size="sm" variant="outline" onClick={this.handleReload}>
            Recharger
          </Button>
        </div>
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
