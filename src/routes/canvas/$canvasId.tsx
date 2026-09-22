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
import MinimizedWindowsStack from "@/components/windows/MinimizedWindowsStack";
import BookmarksDock from "@/components/canvas/on-canvas-ui/BookmarksDock";
import CanvasToolbar from "@/components/canvas/on-canvas-ui/CanvasToolbar";
import TopRightToolbar from "@/components/canvas/on-canvas-ui/TopRightToolbar";
import AuthUpgradeBanner from "@/components/canvas/on-canvas-ui/AuthUpgradeBanner";
import { useConvexAuth } from "convex/react";
import SearchModale from "@/components/canvas/search-modale/SearchModale";
import CanvasWelcomeModal from "@/components/canvas/welcome/CanvasWelcomeModal";
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
const canvasSearchSchema = z.object({
  v: z.string().optional().catch(undefined),
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
        {/* Le panneau du bas n'est plus une île centrée mais la rangée
            entière : c'est ce qui permet au dock des repères de se borner tout
            seul entre la toolbar et les windows minimisées, sans mesurer quoi
            que ce soit.

            Les trois `!` défont la règle `.react-flow__panel.bottom.center`
            (`left:50%` + `translateX`) du CSS d'@xyflow ; son `margin:15px`,
            lui, est conservé et redonne exactement les marges d'avant. Pas de
            `100vw` : le canvas vit dans un `SidebarInset`, il est plus étroit
            que la fenêtre dès que la sidebar est ouverte.

            `pointer-events-none` n'est PAS cosmétique. React Flow ne neutralise
            les panneaux qu'en mode lasso (`.react-flow__pane.selection
            .react-flow__panel`) : une rangée pleine largeur avalerait sinon
            clics, pan et début de lasso sur toute la bande basse. */}
        <Panel
          position="bottom-center"
          className="pointer-events-none left-0! right-0! transform-none!"
        >
          {/* `minmax(0,1fr)` et pas `1fr` : un `1fr` nu vaut `minmax(auto,1fr)`
              et la colonne de droite refuserait de descendre sous son
              min-content (une pastille fait 280px), ce qui décentrerait la
              toolbar sur une fenêtre étroite. Avec `minmax(0,…)` les deux
              gouttières sont égales par construction, donc la colonne `auto`
              du milieu est centrée quoi qu'il arrive.

              `items-end` : une card du dock qui grandit au survol pousse vers
              le haut, la rangée de repos ne bouge pas. */}
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div aria-hidden />
            <div className="pointer-events-auto">
              <CanvasToolbar />
            </div>
            {isAuthenticated ? (
              // Le dock prend la place qui reste, les windows minimisées
              // gardent la leur : c'est le `flex-1 min-w-0` contre le
              // `shrink-0` qui fait reculer le dock quand il y en a, et lui
              // rend le bord droit quand il n'y en a plus.
              <div className="pointer-events-auto flex min-w-0 items-end gap-2">
                <BookmarksDock />
                <MinimizedWindowsStack />
              </div>
            ) : (
              <div aria-hidden />
            )}
          </div>
        </Panel>
        {isAuthenticated ? (
          // Laissé dans son propre panneau et pas fondu dans la colonne de
          // gauche : `ActivityDock` plafonne ses cards à 3 précisément pour ne
          // pas percuter la toolbar, lui donner une colonne changerait ce
          // contrat.
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
        ) : (
          <Panel position="top-center">
            <AuthUpgradeBanner />
          </Panel>
        )}
      </CanvasFlow>
    </div>
  );
}
