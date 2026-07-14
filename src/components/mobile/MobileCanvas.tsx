import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import useRichQuery from "@/components/utils/useRichQuery";
import { fromCanvasNodesToXyNodes } from "@/lib/node-types-converter";
import { injectMarkerColor } from "@/components/edges/edgeStyleUtils";
import type { CanvasNode } from "@/types";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useWindowsStore } from "@/stores/windowsStore";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { Spinner } from "@/components/shadcn/spinner";
import MobileChatScreen from "./MobileChatScreen";
import MobileChatInput from "./MobileChatInput";
import MobileLeftSidebar from "./MobileLeftSidebar";
import MobileSearchSidebar from "./MobileSearchSidebar";
import MobileNodeOverlay from "./MobileNodeOverlay";
import { MobileNoleProvider } from "./MobileNoleContext";

export default function MobileCanvas({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  return (
    <ReactFlowProvider key={canvasId}>
      <MobileCanvasContent canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

function MobileCanvasContent({ canvasId }: { canvasId: Id<"canvases"> }) {
  const setNodeDatas = useNodeDataStore((state) => state.setNodeDatas);
  const clearNodeDatas = useNodeDataStore((state) => state.clear);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const lastCanvasSnapshotRef = useRef<string | null>(null);

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [searchSidebarOpen, setSearchSidebarOpen] = useState(false);

  const flowStore = useStoreApi();

  useEffect(() => {
    useWindowsStore.getState().closeAllWindows();
    useCanvasStore.getState().setStatus("idle");
    setCanvas(null);
    clearNodeDatas();
    lastCanvasSnapshotRef.current = null;
  }, [canvasId, clearNodeDatas, setCanvas]);

  const {
    isError: isCanvasError,
    data: canvas,
    error: canvasError,
  } = useRichQuery(api.canvases.readCanvas, { canvasId });

  const {
    isError: isNodeDatasError,
    data: nodeDatas,
    error: nodeDatasError,
  } = useRichQuery(
    api.nodeDatas.listByCanvasId,
    canvasId ? { canvasId } : "skip",
  );

  // Inject canvas nodes/edges directly into the xy-flow store so that hooks
  // like `useStore`, `useNodes` keep working even though we don't render
  // <ReactFlow>. `useReactFlow().setNodes()` is a no-op in that case (the
  // queue is only flushed when ReactFlow holds the nodes), so we write to
  // the store directly. We must also convert Convex CanvasNode -> xy-flow
  // Node so `data.nodeDataId` (read by mention cards) is populated.
  useEffect(() => {
    const xyNodes = canvas?.nodes
      ? fromCanvasNodesToXyNodes(canvas.nodes as CanvasNode[])
      : [];
    const state = flowStore.getState();
    state.setNodes(xyNodes);
    const edges = injectMarkerColor(
      (canvas?.edges ?? []) as Parameters<typeof state.setEdges>[0],
    );
    state.setEdges(edges);
  }, [canvas?.nodes, canvas?.edges, flowStore]);

  const canvasForStore = useMemo(() => {
    if (!canvas) return null;
    const next = { ...canvas };
    delete next.nodes;
    delete next.edges;
    return next;
  }, [canvas]);

  useEffect(() => {
    if (!canvasForStore) return;
    const nextSnapshot = JSON.stringify(canvasForStore);
    if (lastCanvasSnapshotRef.current === nextSnapshot) return;
    lastCanvasSnapshotRef.current = nextSnapshot;
    setCanvas(canvasForStore);
  }, [canvasForStore, setCanvas]);

  useEffect(() => {
    if (nodeDatas) setNodeDatas(nodeDatas);
  }, [nodeDatas, setNodeDatas]);

  useEffect(() => {
    if (isNodeDatasError) clearNodeDatas();
  }, [clearNodeDatas, isNodeDatasError]);

  useEffect(() => {
    if (canvas?.name) document.title = canvas.name;
  }, [canvas?.name]);

  if (isCanvasError && canvasError) {
    return <ErrorDisplay error={canvasError} />;
  }
  if (isNodeDatasError && nodeDatasError) {
    return <ErrorDisplay error={nodeDatasError} />;
  }
  if (!canvas) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <MobileNoleProvider>
      <div className="h-dvh w-screen overflow-hidden bg-white">
        <MobileChatScreen
          canvasName={canvas.name}
          onOpenLeft={() => setLeftSidebarOpen(true)}
          onOpenSearch={() => setSearchSidebarOpen(true)}
        />
        <MobileNodeOverlay />
        <MobileChatInput />
        <MobileLeftSidebar
          canvasId={canvasId}
          open={leftSidebarOpen}
          onOpenChange={setLeftSidebarOpen}
        />
        <MobileSearchSidebar
          canvasId={canvasId}
          open={searchSidebarOpen}
          onOpenChange={setSearchSidebarOpen}
        />
      </div>
    </MobileNoleProvider>
  );
}
