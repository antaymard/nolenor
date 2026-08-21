import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { reportError } from "@/lib/analytics";
import { isChunkLoadError, reloadForUpdate } from "@/lib/appUpdate";

/**
 * Isole le corps d'une fenêtre de node.
 *
 * Les bodies sont chargés en `lazy()` : leur chunk peut disparaître du serveur
 * après un déploiement (cf. `src/lib/appUpdate.ts`), et le rejet remontait
 * alors jusqu'à l'`errorComponent` du routeur, qui démonte tout le canvas —
 * toutes les autres fenêtres ouvertes avec, brouillons non sauvegardés
 * compris. Une seule fenêtre doit tomber, pas l'app.
 *
 * Sur une erreur de chunk on ne propose pas de réessayer : `React.lazy`
 * mémorise le rejet, un nouveau render ne relancerait aucune requête. Seul un
 * rechargement dur, qui purge le service worker, en sort.
 */
interface WindowContentErrorBoundaryProps {
  children: ReactNode;
}

interface WindowContentErrorBoundaryState {
  error: Error | null;
}

export class WindowContentErrorBoundary extends Component<
  WindowContentErrorBoundaryProps,
  WindowContentErrorBoundaryState
> {
  state: WindowContentErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: Error,
  ): WindowContentErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: "WindowContentErrorBoundary",
      isChunkLoadError: isChunkLoadError(error),
      componentStack: info.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ error: null });
  };

  handleUpdate = (): void => {
    void reloadForUpdate({ hard: true });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isChunkLoadError(error)) {
      return (
        <ErrorDisplay
          title="This window needs the latest version"
          message="Nolënor was updated while this tab was open, so the code for this window is no longer available. Reloading picks up the new version — your work is saved on the server."
          cta={<Button onClick={this.handleUpdate}>Update and reload</Button>}
        />
      );
    }

    return (
      <ErrorDisplay
        title="This window could not be opened"
        error={error}
        cta={
          <Button variant="outline" onClick={this.handleRetry}>
            Try again
          </Button>
        }
      />
    );
  }
}

export default WindowContentErrorBoundary;
