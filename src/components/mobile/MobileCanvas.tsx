import { useCallback, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { Spinner } from "@/components/shadcn/spinner";
import { useCanvasBootstrap } from "@/hooks/useCanvasBootstrap";
import { MobileNoleProvider } from "./MobileNoleContext";
import { MobileShellContext, type MobileTab } from "./mobileShellContext";
import MobileTopBar from "./MobileTopBar";
import MobileBottomNav from "./MobileBottomNav";
import MobileTabPanel from "./MobileTabPanel";
import MobileChatTab from "./MobileChatTab";
import MobileSearchTab from "./MobileSearchTab";
import MobileCanvasTab from "./MobileCanvasTab";
import MobileCanvasSwitcherSheet from "./MobileCanvasSwitcherSheet";
import MobileNodeOverlay from "./MobileNodeOverlay";

export default function MobileCanvas({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  return (
    <ReactFlowProvider key={canvasId}>
      <MobileCanvasShell canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

function MobileCanvasShell({ canvasId }: { canvasId: Id<"canvases"> }) {
  const { isAuthenticated } = useConvexAuth();
  const {
    canvas,
    isCanvasError,
    canvasError,
    isNodeDatasError,
    nodeDatasError,
  } = useCanvasBootstrap(canvasId, { isAuthenticated });

  const [activeTab, setActiveTabState] = useState<MobileTab>("chat");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Les portails Radix rendent dans <body> : une sheet ouverte survivrait au
  // changement d'onglet. On les ferme en même temps qu'on bascule.
  const setActiveTab = useCallback((tab: MobileTab) => {
    setSwitcherOpen(false);
    setActiveTabState(tab);
  }, []);

  const shellValue = useMemo(
    () => ({ activeTab, setActiveTab }),
    [activeTab, setActiveTab],
  );

  if (isCanvasError && canvasError) {
    return <ErrorDisplay error={canvasError} />;
  }
  if (isNodeDatasError && nodeDatasError) {
    return <ErrorDisplay error={nodeDatasError} />;
  }
  if (!canvas) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const canEdit = canvas._permission !== "viewer";

  return (
    <MobileShellContext.Provider value={shellValue}>
      <MobileNoleProvider>
        <div className="flex h-dvh w-screen flex-col overflow-hidden bg-white">
          <MobileTopBar
            canvasName={canvas.name}
            onOpenCanvasSwitcher={() => setSwitcherOpen(true)}
          />

          {/* Les trois panneaux restent montés : le canvas alimente le store
              xy-flow que lisent la barre de pièces jointes du chat et les cartes
              de mention, et chaque onglet garde son état d'un aller-retour à
              l'autre. */}
          <div className="relative min-h-0 flex-1">
            <MobileTabPanel active={activeTab === "chat"}>
              <MobileChatTab canvasId={canvasId} />
            </MobileTabPanel>
            <MobileTabPanel active={activeTab === "search"}>
              <MobileSearchTab
                canvasId={canvasId}
                active={activeTab === "search"}
              />
            </MobileTabPanel>
            <MobileTabPanel active={activeTab === "canvas"}>
              <MobileCanvasTab
                canvasId={canvasId}
                canvasNodes={canvas.nodes as CanvasNode[] | undefined}
                canvasEdges={canvas.edges}
                canEdit={canEdit}
              />
            </MobileTabPanel>
          </div>

          <MobileBottomNav active={activeTab} onChange={setActiveTab} />
        </div>

        <MobileCanvasSwitcherSheet
          canvasId={canvasId}
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
        />
        {/* Hors de la colonne flex : un node ouvert recouvre tout l'écran. */}
        <MobileNodeOverlay />
      </MobileNoleProvider>
    </MobileShellContext.Provider>
  );
}
