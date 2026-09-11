import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { applyUpdate } from "@/lib/appUpdate";
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
 * ne relancerait aucune requête. Le rechargement reprend le build frais
 * (`applyUpdate`) — quand la cause est un déploiement, c'est la seule
 * action utile.
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
          // Build frais plutôt que précache : la cause typique est un chunk
          // disparu au déploiement, re-rendre le même build ne sert à rien.
          <Button onClick={applyUpdate}>Reload the page</Button>
        }
      />
    );
  }
}

export default WindowContentErrorBoundary;
