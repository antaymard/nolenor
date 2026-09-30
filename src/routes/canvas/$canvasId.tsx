import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ReactFlowProvider, Panel } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import CanvasErrorScreen from "@/components/canvas/CanvasErrorScreen";
import { lazy, Suspense } from "react";
import WindowsContainer from "@/components/windows/WindowsContainer";
import { useIsMobile } from "@/hooks/use-mobile";
import CanvasSidebar from "@/components/canvas/CanvasSidebar";
import CanvasFlow from "@/components/canvas/CanvasFlow";
import { useCanvasBootstrap } from "@/hooks/useCanvasBootstrap";
import { Spinner } from "@/components/shadcn/spinner";
import NoleCanvasPanel from "@/components/canvas/NoleCanvasPanel";
import ActivityDock from "@/components/canvas/on-canvas-ui/ActivityDock";
import CanvasDock from "@/components/canvas/on-canvas-ui/canvas-dock/CanvasDock";
import MinimizedDock from "@/components/canvas/on-canvas-ui/canvas-dock/MinimizedDock";
import CanvasToolbar from "@/components/canvas/on-canvas-ui/CanvasToolbar";
import TopRightToolbar from "@/components/canvas/on-canvas-ui/TopRightToolbar";
import AuthUpgradeBanner from "@/components/canvas/on-canvas-ui/AuthUpgradeBanner";
import { useConvexAuth } from "convex/react";
import SearchModale from "@/components/canvas/search-modale/SearchModale";
import CanvasWelcomeModal from "@/components/canvas/welcome/CanvasWelcomeModal";
import { useOpenThreadFromUrl } from "@/hooks/useOpenThreadFromUrl";
import { useEmptyCanvasOnboarding } from "@/hooks/useEmptyCanvasOnboarding";
import EmptyCanvasWithNole from "@/components/canvas/onboarding/EmptyCanvasWithNole";
// Mobile-only surface: don't ship it to desktop sessions.
const MobileCanvas = lazy(() => import("@/components/mobile/MobileCanvas"));

// `?v=cx,cy,zoom` : le cadrage sur lequel ouvrir le canvas, porté par un lien
// partagé (cf. `useInitialViewportFromUrl` et le bouton de `SharingModal`).
//
// Déclaré ici et non sur la racine comme `?template=` : un cadrage n'a de sens
// que dans un canvas donné, donc changer de canvas doit le laisser tomber.
// `.catch(undefined)` comme les autres params qui viennent de l'extérieur
// (cf. `signin.tsx`) : une URL abîmée ne doit pas casser la route. Le triple
// n'est pas décodé ici — le parse tolérant vit dans `canvasViewportFraming`.
//
// `?thread=<threadId>` : la conversation Nolë à ouvrir en arrivant, posée par le
// bouton « Open » d'une tâche sur la home (cf. `useOpenThreadFromUrl`, qui la
// retire de l'URL une fois consommée).
//
// `?onboarding=true` : le canvas est vide (ni nodes ni edges) et l'onboarding
// prend le relais — `EmptyCanvasWithNole` au lieu du canvas React Flow vide
// (cf. `useEmptyCanvasOnboarding`). L'union booléen/chaîne couvre les deux
// formes que TanStack peut fournir : `true` parsé, ou `"true"` brut d'une URL
// construite à la main.
const canvasSearchSchema = z.object({
  v: z.string().optional().catch(undefined),
  thread: z.string().optional().catch(undefined),
  onboarding: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/canvas/$canvasId")({
  component: RouteComponent,
  validateSearch: canvasSearchSchema,
});

function RouteComponent() {
  const { canvasId } = Route.useParams() as { canvasId: Id<"canvases"> };
  const { isAuthenticated } = useConvexAuth();
  const isMobile = useIsMobile();

  if (isMobile && isAuthenticated) {
    return (
      <div className="bg-white">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          }
        >
          <MobileCanvas canvasId={canvasId} />
        </Suspense>
      </div>
    );
  }

  const canvasContent = (
    // `overscroll-none` : le pan trackpad horizontal ne doit jamais
    // déborder en geste "back" navigateur (cf. index.css).
    <div className={cn("h-screen w-full overflow-hidden overscroll-none")}>
      <CanvasContent canvasId={canvasId} isAuthenticated={isAuthenticated} />
    </div>
  );

  return (
    <div className="bg-white">
      <ReactFlowProvider key={canvasId}>
        {isAuthenticated ? (
          <CanvasSidebar canvasId={canvasId}>{canvasContent}</CanvasSidebar>
        ) : (
          canvasContent
        )}
      </ReactFlowProvider>
    </div>
  );
}

function CanvasContent({
  canvasId,
  isAuthenticated,
}: {
  canvasId: Id<"canvases">;
  isAuthenticated: boolean;
}) {
  const {
    canvas,
    flowNodes,
    flowEdges,
    isCanvasError,
    canvasError,
    isNodeDatasError,
    nodeDatasError,
  } = useCanvasBootstrap(canvasId, { isAuthenticated });

  // Après `useCanvasBootstrap`, dont le nettoyage remet la conversation active
  // à zéro : ses effets passent avant ceux de ce hook.
  useOpenThreadFromUrl({ ready: Boolean(canvas) && isAuthenticated });

  // Onboarding canvas vide : vide avéré + `?onboarding=true` → on rend
  // `EmptyCanvasWithNole` au lieu du canvas. Le hook pose/retire le param
  // tout seul (arrivée sur un canvas vide / premier node créé par Nolë).
  const { showOnboarding, isRedirectPending } = useEmptyCanvasOnboarding({
    flowNodes,
    flowEdges,
    canAutoEnter:
      isAuthenticated &&
      Boolean(canvas) &&
      canvas?._permission !== "viewer",
  });

  if (isCanvasError && canvasError) {
    return (
      <CanvasErrorScreen
        error={canvasError}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  if (isNodeDatasError && nodeDatasError) {
    return (
      <CanvasErrorScreen
        error={nodeDatasError}
        isAuthenticated={isAuthenticated}
        title="This canvas could not be loaded"
      />
    );
  }

  if (!canvas) {
    return (
      <div className="flex items-center justify-center h-full animate-appear">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  // Canvas vide en cours de bascule vers `?onboarding=true` : ne pas peindre
  // un React Flow vide une frame — le param arrive par `replace` juste après.
  if (isRedirectPending) {
    return (
      <div className="flex items-center justify-center h-full animate-appear">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  // Onboarding : pas de canvas, pas de toolbars — juste Nolë. Reste sous le
  // `ReactFlowProvider` de la route (requis par `ChatContainer` via
  // `useNoleChat` → `useReactFlow`).
  if (showOnboarding) {
    return (
      <div className="flex-1 w-full h-full overflow-hidden overscroll-none">
        <EmptyCanvasWithNole canvasId={canvasId} canvasName={canvas.name} />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full overflow-hidden overscroll-none">
      {/* Après le garde `!canvas` ci-dessus : on accueille sur un canvas
          affiché, pas sur un spinner. */}
      <CanvasWelcomeModal />
      <SearchModale />
      <WindowsContainer />
      <CanvasFlow
        canvasId={canvasId}
        canvasNodes={flowNodes}
        canvasEdges={flowEdges}
        background={canvas.background}
        canEdit={canvas._permission !== "viewer"}
        variant="desktop"
      >
        {isAuthenticated ? (
          <Panel position="top-right">
            <TopRightToolbar />
          </Panel>
        ) : null}
        <Panel position="bottom-center">
          <CanvasToolbar />
        </Panel>
        {isAuthenticated ? (
          <>
            <Panel position="bottom-left">
              {/* Le bouton Nolë reste à l'extrême gauche ; le dock le prolonge
                  horizontalement. La conversation étendue est un `absolute`
                  ancré dans `NoleCanvasPanel` : elle flotte au-dessus du bouton
                  sans jamais descendre sur la rangée du dock. */}
              <div className="flex items-center gap-2">
                <NoleCanvasPanel />
                <ActivityDock canvasId={canvasId} />
              </div>
            </Panel>
            {/* Le miroir du coin gauche : le bouton des repères reste à
                l'extrême droite, les windows minimisées le prolongent vers le
                centre. */}
            <Panel position="bottom-right">
              <div className="flex items-center gap-2">
                <MinimizedDock />
                <CanvasDock />
              </div>
            </Panel>
          </>
        ) : (
          <Panel position="top-center">
            <AuthUpgradeBanner />
          </Panel>
        )}
      </CanvasFlow>
    </div>
  );
}
