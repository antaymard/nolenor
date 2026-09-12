import { createFileRoute } from "@tanstack/react-router";
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
import CanvasToolbar from "@/components/canvas/on-canvas-ui/CanvasToolbar";
import TopRightToolbar from "@/components/canvas/on-canvas-ui/TopRightToolbar";
import AuthUpgradeBanner from "@/components/canvas/on-canvas-ui/AuthUpgradeBanner";
import { useConvexAuth } from "convex/react";
import SearchModale from "@/components/canvas/search-modale/SearchModale";
import CanvasNavigatorBridge from "@/components/canvas/viewport-markers/CanvasNavigatorBridge";
// Mobile-only surface: don't ship it to desktop sessions.
const MobileCanvas = lazy(() => import("@/components/mobile/MobileCanvas"));

export const Route = createFileRoute("/canvas/$canvasId")({
  component: RouteComponent,
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
      <SearchModale />
      {/* Ne rend rien : donne au command center (monté à la racine, hors du
          `ReactFlowProvider`) de quoi lister les repères et bouger la vue. */}
      <CanvasNavigatorBridge />
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
            <Panel position="bottom-right">
              <MinimizedWindowsStack />
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
