import {
  Outlet,
  createRootRoute,
  useNavigate,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useConvexAuth, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useEffect } from "react";
import { z } from "zod";
import TemplateEditorModal from "@/components/settings/templates/TemplateEditorModal";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { Button } from "@/components/shadcn/button";
import { api } from "@/../convex/_generated/api";
import { identifyUser, reportError } from "@/lib/analytics";
import { isChunkLoadError, reloadForUpdate } from "@/lib/appUpdate";
import CommandCenter from "@/components/command-center/CommandCenter";

export interface RouterContext {
  convex: ConvexReactClient;
}

// Param de recherche global : l'éditeur de template s'ouvre depuis le canvas
// comme depuis les settings, donc son schéma est déclaré ici plutôt que sur
// chaque route. `template` vaut un id de template, ou "new" pour une
// création. Toléré partout, ignoré par les routes qui n'en font rien.
const rootSearchSchema = z.object({
  template: z.string().optional(),
});

export const Route = createRootRoute({
  component: RootComponent,
  validateSearch: rootSearchSchema,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});

/**
 * Sans ça, une erreur levée pendant le render d'une route (typiquement un
 * `useQuery` Convex dont la query échoue : il throw pendant le render) remonte
 * jusqu'à l'`AppErrorBoundary` et l'utilisateur perd toute l'app. Ici on
 * n'écrase que le contenu de la route.
 */
function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    reportError(error, { source: "router.errorComponent" });
  }, [error]);

  // Chunk manquant après un déploiement : ni `reset` (React.lazy mémorise le
  // rejet) ni un reload ordinaire (le service worker sert l'`index.html`
  // précaché) n'en sortent. Seule la purge dure marche — cf. `lib/appUpdate.ts`.
  if (isChunkLoadError(error)) {
    return (
      <div className="h-screen w-screen">
        <ErrorDisplay
          title="A new version is available"
          message="Nolënor was updated while this tab was open, so part of the app is no longer available. Updating clears the old version — your work is saved on the server."
          cta={
            <Button onClick={() => void reloadForUpdate({ hard: true })}>
              Update and reload
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <ErrorDisplay
        title="This page could not be loaded"
        error={error instanceof Error ? error : null}
        cta={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
            {/* Navigation dure : `reset` re-rend la *même* route, donc une route
                définitivement cassée (canvas supprimé, accès révoqué) boucle sur
                l'erreur. Repartir de `/` est la seule sortie fiable. */}
            <Button
              variant="outline"
              onClick={() => window.location.assign("/")}
            >
              Back to my canvases
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        }
      />
    </div>
  );
}

function RootNotFoundComponent() {
  return (
    <div className="h-screen w-screen">
      <ErrorDisplay
        title="Page not found"
        message="This URL does not match anything in the app."
        cta={
          <Button onClick={() => window.location.assign("/")}>
            Back to my canvases
          </Button>
        }
      />
    </div>
  );
}

function RootComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useQuery(api.users.me);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && location.pathname !== "/signin") {
      // navigate({ to: "/signin" });
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname]);

  // Rattache les erreurs remontées à un utilisateur plutôt qu'à un navigateur
  // anonyme. `me` est `undefined` tant que la query charge, `null` si personne
  // n'est connecté (canvas public).
  useEffect(() => {
    if (!me) return;
    identifyUser(me._id, { email: me.email, name: me.displayName ?? undefined });
  }, [me]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <Outlet />
      {/* Monté une seule fois, ici : l'éditeur de template s'ouvre depuis le
          canvas (clic droit sur un custom node) comme depuis les settings. */}
      <TemplateEditorModal />
      {/* Idem : le command center (Ctrl/Cmd + P) doit répondre depuis
          n'importe quelle route, pas seulement depuis un canvas. */}
      <CommandCenter />
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </div>
  );
}
