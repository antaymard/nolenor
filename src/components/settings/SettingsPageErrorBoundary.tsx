import { Component, type ErrorInfo, type ReactNode } from "react";
import { TbAlertTriangle } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { reportError } from "@/lib/analytics";

/**
 * Le filet d'une page des réglages ouverte en modale. Sans lui, une page qui
 * throw pendant le render (query Convex qui échoue, chunk introuvable) remonte
 * jusqu'à l'`errorComponent` de la route : c'est tout le canvas, monté sous la
 * modale, qui serait remplacé par l'écran d'erreur. Ici seule la page l'est.
 *
 * À remonter par section (`key`) : changer de page repart d'un état sain.
 */
export default class SettingsPageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: "SettingsPageErrorBoundary",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
        <TbAlertTriangle className="size-6 text-amber-500" />
        <p>This page could not be displayed.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </Button>
      </div>
    );
  }
}
