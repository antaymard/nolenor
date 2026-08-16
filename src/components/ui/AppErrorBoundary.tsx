import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { reportError } from "@/lib/analytics";

/**
 * Dernier filet de l'application. Sans lui, n'importe quel throw pendant le
 * render — y compris celui d'un `useQuery` Convex dont la query échoue côté
 * serveur, qui throw pendant le render par design — démonte tout l'arbre React
 * et laisse une page blanche.
 *
 * Il est monté au-dessus du `RouterProvider` dans `main.tsx`. Les erreurs
 * survenant *dans* une route sont d'abord attrapées par l'`errorComponent` du
 * routeur (cf. `src/routes/__root.tsx`), qui préserve la coquille de l'app ;
 * celui-ci ne sert que pour ce qui casse au-dessus ou à côté du routeur.
 */
interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: "AppErrorBoundary",
      componentStack: info.componentStack,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-screen w-screen">
        <ErrorDisplay
          title="Something went wrong"
          message="The app hit an unexpected error. Reloading usually fixes it — your work is saved on the server."
          cta={<Button onClick={this.handleReload}>Reload the page</Button>}
        />
      </div>
    );
  }
}

export default AppErrorBoundary;
