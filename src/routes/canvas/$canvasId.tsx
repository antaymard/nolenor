import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  MarkerType,
  Panel,
  Background,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import useRichQuery from "@/components/utils/useRichQuery";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useNoleStore } from "@/stores/noleStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { useCanvasStore } from "@/stores/canvasStore";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { Button } from "@/components/shadcn/button";
import ContextMenu from "@/components/canvas/context-menus";
import { useContextMenu } from "@/hooks/useContextMenu";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import type { CanvasNode } from "@/types/convex";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { useCanvasPasteHandler } from "@/hooks/useCanvasPasteHandler";
import WindowsContainer from "@/components/windows/WindowsContainer";
import "@xyflow/react/dist/style.css";
import { useIsMobile } from "@/hooks/use-mobile";
import CanvasSidebar from "@/components/canvas/CanvasSidebar";
import { useCanvasNodes } from "@/hooks/useCanvasNodes";
import { useCanvasEdges } from "@/hooks/useCanvasEdges";
import { Spinner } from "@/components/shadcn/spinner";
import NoleCanvasPanel from "@/components/canvas/NoleCanvasPanel";
import MinimizedWindowsStack from "@/components/windows/MinimizedWindowsStack";
import CanvasToolbar from "@/components/canvas/on-canvas-ui/CanvasToolbar";
import TopRightToolbar from "@/components/canvas/on-canvas-ui/TopRightToolbar";
import AuthUpgradeBanner from "@/components/canvas/on-canvas-ui/AuthUpgradeBanner";
import { useConvexAuth } from "convex/react";
import OnboardingModal from "@/components/ui/OnboardingModal";
import { generateLlmId } from "@/../convex/lib/llmId";
import SearchModale from "@/components/canvas/search-modale/SearchModale";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { useHotspotHotkeys } from "@/hooks/useHotspotHotkeys";
import MobileCanvas from "@/components/mobile/MobileCanvas";
import { useIsTouchFirst } from "@/hooks/useTabletMode";

// Additional helper to prevent hotkeys from triggering when typing in inputs, textareas, selects or contenteditable elements
function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

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
        <OnboardingModal />
        <MobileCanvas canvasId={canvasId} />
      </div>
    );
  }

  const canvasContent = (
    <div className={cn("h-screen w-full")}>
      <CanvasContent canvasId={canvasId} isAuthenticated={isAuthenticated} />
    </div>
  );

  return (
    <div className="bg-white">
      <OnboardingModal />
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
  const setNodeDatas = useNodeDataStore((state) => state.setNodeDatas);
  const clearNodeDatas = useNodeDataStore((state) => state.clear);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const lastCanvasSnapshotRef = useRef<string | null>(null);

  // Cleanup stores on canvas switch
  useEffect(() => {
    useWindowsStore.getState().closeAllWindows();
    useCanvasStore.getState().setStatus("idle");
    setCanvas(null);
    clearNodeDatas();
    lastCanvasSnapshotRef.current = null;
  }, [canvasId, clearNodeDatas, setCanvas]);

  // Handle paste events (images, URLs)
  useCanvasPasteHandler();

  // Fetch canvas
  const {
    isError: isCanvasError,
    data: canvas,
    error: canvasError,
  } = useRichQuery(api.canvases.readCanvas, {
    canvasId,
  });

  // Fetch nodeDatas for this canvas
  const {
    isError: isNodeDatasError,
    data: nodeDatas,
    error: nodeDatasError,
  } = useRichQuery(
    api.nodeDatas.listByCanvasId,
    canvasId ? { canvasId } : "skip",
  );

  // Context menu management
  const {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onSelectionContextMenu,
    onEdgeContextMenu,
  } = useContextMenu();

  const isMobile = useIsMobile();
  const isTouchFirst = useIsTouchFirst();
  // On touch-first devices (phones, tablets like the Boox), dragging on the
  // pane should pan the canvas instead of drawing a selection rectangle.
  const panWithFinger = isMobile || isTouchFirst;
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const addNoleAttachments = useNoleStore((state) => state.addAttachments);
  const focus = useCanvasStore((state) => state.focus);
  const { duplicateNode } = useDuplicateNode();
  const canDuplicateNodes = !!canvas && canvas._permission !== "viewer";

  const onNodeClick = useCallback(
    (event: MouseEvent, node: Parameters<typeof fromXyNodeToCanvasNode>[0]) => {
      if (!event.altKey) {
        return;
      }

      event.preventDefault();
      addNoleAttachments({ nodes: [fromXyNodeToCanvasNode(node)] }, true);
    },
    [addNoleAttachments],
  );

  const onPaneClick = useCallback(
    (event: MouseEvent) => {
      if (!event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNoleAttachments({ position });
    },
    [addNoleAttachments, screenToFlowPosition],
  );

  useHotkey(
    "Mod+D",
    (event) => {
      if (!canDuplicateNodes || event.repeat || focus !== "canvas") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const selectedNodes = getNodes().filter((node) => node.selected);
      if (selectedNodes.length !== 1) {
        return;
      }

      event.preventDefault();
      void duplicateNode(selectedNodes[0]);
    },
    { enabled: canDuplicateNodes && focus === "canvas" },
  );

  // Hotspot keyboard shortcuts (Alt+1 … Alt+9)
  useHotspotHotkeys();

  // Canvas nodes management
  const { nodes, handleNodeChange } = useCanvasNodes(
    canvasId,
    canvas?.nodes as CanvasNode[] | undefined,
  );

  // Canvas edges management
  const { edges, handleEdgeChange } = useCanvasEdges(canvasId, canvas?.edges);

  // ======= Put canvas in store, if it changes (besides nodes and edges)
  // Keep only non-flow fields in canvas store (no nodes/edges)
  const canvasForStore = useMemo(() => {
    if (!canvas) {
      return null;
    }

    const canvasWithoutFlowData = { ...canvas };
    delete canvasWithoutFlowData.nodes;
    delete canvasWithoutFlowData.edges;

    return canvasWithoutFlowData;
  }, [canvas]);
  // Sync convex canvas -> zustand canvas store without pointless store updates
  useEffect(() => {
    if (!canvasForStore) {
      return;
    }

    const nextSnapshot = JSON.stringify(canvasForStore);
    if (lastCanvasSnapshotRef.current === nextSnapshot) {
      return;
    }

    lastCanvasSnapshotRef.current = nextSnapshot;
    setCanvas(canvasForStore);
  }, [canvasForStore, setCanvas]);
  // ======

  // Sync convex nodeDatas -> zustand store
  useEffect(() => {
    if (nodeDatas) {
      setNodeDatas(nodeDatas);
    }
  }, [nodeDatas, setNodeDatas]);

  useEffect(() => {
    if (isNodeDatasError) {
      clearNodeDatas();
    }
  }, [clearNodeDatas, isNodeDatasError]);

  // Sync document title
  useEffect(() => {
    if (canvas?.name) {
      document.title = canvas.name;
    }
  }, [canvas?.name]);

  if (isCanvasError && canvasError) {
    if (!isAuthenticated) {
      return (
        <ErrorDisplay
          title="This canvas is private or unavailable"
          message="Sign in to check whether you have access, or ask the owner to share it with you."
          cta={
            <Button asChild>
              <Link to="/signin">Sign in / Create account</Link>
            </Button>
          }
        />
      );
    }

    return <ErrorDisplay error={canvasError} />;
  }

  if (isNodeDatasError && nodeDatasError) {
    return <ErrorDisplay error={nodeDatasError} />;
  }

  if (!canvas) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full">
      <SearchModale />
      <WindowsContainer />
      <ReactFlow
        panOnScroll
        panOnDrag={panWithFinger ? true : [1]}
        defaultViewport={{
          x: 0,
          y: 0,
          zoom: 0.75,
        }}
        minZoom={0.1}
        maxZoom={4}
        selectNodesOnDrag={false}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!panWithFinger}
        nodeTypes={nodeTypes}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        deleteKeyCode={null}
        nodes={nodes}
        edges={edges}
        onEdgesChange={handleEdgeChange}
        onNodesChange={handleNodeChange}
        onConnect={(params) => {
          handleEdgeChange([
            {
              type: "add" as const,
              item: {
                id: generateLlmId(),
                source: params.source,
                target: params.target,
                sourceHandle: params.sourceHandle ?? undefined,
                targetHandle: params.targetHandle ?? undefined,
                markerEnd: {
                  type: MarkerType.Arrow,
                  width: 30,
                  height: 30,
                  strokeWidth: 1,
                },
              },
            },
          ]);
        }}
      >
        <Background
          variant={BackgroundVariant.Lines}
          color="#e2e8f0"
          bgColor="#f8fafc"
          gap={20}
          lineWidth={0.3}
        />
        {isAuthenticated ? (
          <Panel position="top-right">
            <TopRightToolbar />
          </Panel>
        ) : null}
        <Panel position="bottom-center">
          <CanvasToolbar canvasId={canvasId} />
        </Panel>
        {isAuthenticated ? (
          <>
            <Panel position="bottom-left">
              <NoleCanvasPanel />
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
        {contextMenu.type && (
          <ContextMenu
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
          />
        )}
      </ReactFlow>
    </div>
  );
}
