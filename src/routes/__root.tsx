import {
  Outlet,
  createRootRoute,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useConvexAuth } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useEffect } from "react";
import { z } from "zod";
import TemplateEditorModal from "@/components/settings/templates/TemplateEditorModal";

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
});

function RootComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && location.pathname !== "/signin") {
      // navigate({ to: "/signin" });
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname]);

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
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </div>
  );
}
