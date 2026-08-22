import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { reportError } from "@/lib/analytics";

/**
 * Isole le corps d'une fenêtre de node.
 *
 * Les bodies sont chargés en `lazy()` : leur chunk peut avoir disparu du
 * serveur après un déploiement (cf. `src/lib/appUpdate.ts`), et le rejet
 * remontait alors jusqu'à l'`errorComponent` du routeur, qui démonte tout le
 * canvas — toutes les autres fenêtres ouvertes avec, brouillons non
 * sauvegardés compris. Une seule fenêtre doit tomber, pas l'app.
 *
 * Un seul bouton, recharger : `React.lazy` mémorise le rejet, donc réessayer
 * ne relancerait aucune requête. Quand la cause est un déploiement, le bandeau
 * de mise à jour est déjà à l'écran pour l'expliquer.
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
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ErrorDisplay
        title="This window could not be opened"
        message="Reloading the page usually fixes it — your work is saved on the server."
        cta={
          <Button onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        }
      />
    );
  }
}

export default WindowContentErrorBoundary;
