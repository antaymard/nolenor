import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { TbAlertTriangle } from "react-icons/tb";

/**
 * Guards against a render or update-time crash (a custom block view throwing,
 * a ProseMirror decoration issue, ...) that would otherwise take down the
 * whole app.
 *
 * This is a different layer from `createSafeBlockNoteEditor`
 * (safeCreateEditor.ts), which only guards the synchronous
 * `BlockNoteEditor.create()` call — a React error boundary catches
 * descendants throwing during render/commit, which construction guard cannot
 * see (React error boundaries never catch errors from the component they
 * are declared in, only from children).
 */
interface BlockNoteErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
}

interface BlockNoteErrorBoundaryState {
  hasError: boolean;
  attempt: number;
}

export class BlockNoteErrorBoundary extends Component<
  BlockNoteErrorBoundaryProps,
  BlockNoteErrorBoundaryState
> {
  state: BlockNoteErrorBoundaryState = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<BlockNoteErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[BlockNoteErrorBoundary] Rendering crash:", error, info);
  }

  componentDidUpdate(prevProps: BlockNoteErrorBoundaryProps): void {
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
          <div className="text-sm text-slate-600">
            Unable to display this content.
          </div>
          <Button size="sm" variant="outline" onClick={this.handleReload}>
            Try again
          </Button>
        </div>
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
