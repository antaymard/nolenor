import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { reportError } from "@/lib/analytics";
import { isChunkLoadError, reloadForUpdate } from "@/lib/appUpdate";

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

  // Quand c'est un chunk manquant, un reload ordinaire peut retomber sur le
  // même build : le service worker sert l'`index.html` qu'il a précaché. Il
  // faut le purger d'abord (cf. `src/lib/appUpdate.ts`).
  handleUpdate = (): void => {
    void reloadForUpdate({ hard: true });
  };

  // Navigation dure plutôt que routeur : quand ce boundary rend, l'arbre React
  // est déjà démonté, donc rien ne garantit qu'un `navigate` remonte une app
  // saine. Un chargement complet repart d'un état propre.
  handleBackHome = (): void => {
    window.location.assign("/");
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isOutdatedBuild = isChunkLoadError(error);

    return (
      <div className="h-screen w-screen">
        <ErrorDisplay
          title={
            isOutdatedBuild
              ? "A new version is available"
              : "Something went wrong"
          }
          message={
            isOutdatedBuild
              ? "Nolënor was updated while this tab was open, so part of the app is no longer available. Updating clears the old version — your work is saved on the server."
              : "The app hit an unexpected error. Reloading usually fixes it — your work is saved on the server."
          }
          cta={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={this.handleBackHome}>
                Back to my canvases
              </Button>
              {isOutdatedBuild ? (
                <Button onClick={this.handleUpdate}>Update and reload</Button>
              ) : (
                <Button onClick={this.handleReload}>Reload the page</Button>
              )}
            </div>
          }
        />
      </div>
    );
  }
}

export default AppErrorBoundary;
