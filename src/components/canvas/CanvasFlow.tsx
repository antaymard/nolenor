import { useCallback, useMemo, type MouseEvent, type ReactNode } from "react";
import {
  ReactFlow,
  SelectionMode,
  MarkerType,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types/convex";
import { generateLlmId } from "@/../convex/lib/llmId";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { edgeTypes } from "@/components/edges/edgeTypes";
import { injectMarkerColor } from "@/components/edges/edgeStyleUtils";
import ContextMenu from "@/components/canvas/context-menus";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useCanvasNodes } from "@/hooks/useCanvasNodes";
import { useCanvasEdges } from "@/hooks/useCanvasEdges";
import { useCanvasPasteHandler } from "@/hooks/useCanvasPasteHandler";
import { useCanvasDropHandler } from "@/hooks/useCanvasDropHandler";
import CanvasDropOverlay from "./CanvasDropOverlay";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { useHotspotHotkeys } from "@/hooks/useHotspotHotkeys";
import { withTouchDragGate } from "./touchDragGate";
import { useCanvasStore } from "@/stores/canvasStore";
import { useEdgeEditorStore } from "@/stores/edgeEditorStore";
import { useNoleStore } from "@/stores/noleStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTouchFirst } from "@/hooks/useTabletMode";
import "@xyflow/react/dist/style.css";

/**
 * `desktop` : souris et clavier, sélection au lasso, menu contextuel.
 * `touch`   : doigt. On pan à un doigt, on ne drague un node qu'une fois
 *             sélectionné, et le double-tap sert à ouvrir un node — donc pas de
 *             zoom au double-clic.
 */
export type CanvasFlowVariant = "desktop" | "touch";

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

interface CanvasFlowProps {
  canvasId: Id<"canvases">;
  canvasNodes: CanvasNode[] | undefined;
  canvasEdges: Edge[] | undefined;
  /** `_permission` du canvas : les viewers ne peuvent pas dupliquer. */
  canEdit: boolean;
  variant: CanvasFlowVariant;
  /** Les `<Panel>` propres à la plateforme. */
  children?: ReactNode;
}

/**
 * Le canvas React Flow, partagé entre desktop et mobile. Tout ce qui est commun
 * (état des nodes/edges, persistance, raccourcis, fond, menu contextuel) vit
 * ici ; seuls les panneaux diffèrent et arrivent par `children`.
 */
export default function CanvasFlow({
  canvasId,
  canvasNodes,
  canvasEdges,
  canEdit,
  variant,
  children,
}: CanvasFlowProps) {
  const isTouch = variant === "touch";
  const isMobile = useIsMobile();
  const isTouchFirst = useIsTouchFirst();
  // On touch-first devices (phones, tablets like the Boox), dragging on the
  // pane should pan the canvas instead of drawing a selection rectangle.
  const panWithFinger = isTouch || isMobile || isTouchFirst;

  // Handle paste events (images, URLs)
  useCanvasPasteHandler();

  // Handle files/links/text dropped anywhere on the window
  const { isDraggingOver } = useCanvasDropHandler({ canEdit });

  // Context menu management
  const {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onSelectionContextMenu,
    onEdgeContextMenu,
  } = useContextMenu();

  const { screenToFlowPosition, getNodes } = useReactFlow();
  const addNoleAttachments = useNoleStore((state) => state.addAttachments);
  const focus = useCanvasStore((state) => state.focus);
  const { duplicateNode } = useDuplicateNode();
  const canDuplicateNodes = canEdit;

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
  const { nodes, handleNodeChange } = useCanvasNodes(canvasId, canvasNodes);

  // Canvas edges management
  const { edges, handleEdgeChange } = useCanvasEdges(canvasId, canvasEdges);

  // Inject edge color into marker objects so React Flow renders colored arrows
  const edgesWithColoredMarkers = useMemo(
    () => injectMarkerColor(edges),
    [edges],
  );

  // Le gate tactile s'applique uniquement au tableau donné à <ReactFlow> : il ne
  // doit jamais remonter dans la persistance (cf. commentaire de la fonction).
  const flowNodes = useMemo(
    () => (isTouch ? withTouchDragGate(nodes) : nodes),
    [isTouch, nodes],
  );

  // Double-click an edge → enter label edit mode (handled inside CustomEdge
  // via the edgeEditorStore).
  const onEdgeDoubleClick = useCallback(
    (_e: MouseEvent, edge: { id: string }) => {
      useEdgeEditorStore.getState().setEditingEdgeId(edge.id);
    },
    [],
  );

  return (
    <>
      {isDraggingOver && <CanvasDropOverlay />}
      <ReactFlow
        panOnScroll
        // Au doigt, le drag sur le pane pan toujours. À la souris, on garde le
        // clic molette pour panner et on laisse le clic gauche au lasso.
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
        // Tactile : draggable est accordé node par node via withTouchDragGate.
        nodesDraggable={!isTouch}
        // Tactile : le double-tap sert à ouvrir un node, pas à zoomer.
        zoomOnDoubleClick={!isTouch}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeDoubleClick={onEdgeDoubleClick}
        deleteKeyCode={null}
        nodes={flowNodes}
        edges={edgesWithColoredMarkers}
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
        {children}
        {contextMenu.type && (
          <ContextMenu
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
          />
        )}
      </ReactFlow>
    </>
  );
}
