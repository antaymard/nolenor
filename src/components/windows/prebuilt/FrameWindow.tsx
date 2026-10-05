import {
  memo,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowState,
} from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode, Edge as CanvasEdge } from "@/types/convex";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { edgeTypes } from "@/components/edges/edgeTypes";
import { injectMarkerColor } from "@/components/edges/edgeStyleUtils";
import useRichQuery from "@/components/utils/useRichQuery";
import { colors, resolveColor } from "@/components/ui/styles";
import { useCanvasNodes } from "@/hooks/useCanvasNodes";
import { useCanvasEdges } from "@/hooks/useCanvasEdges";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useCreateEdge } from "@/hooks/useCreateEdge";
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { toCanvasEdge, toCanvasNode } from "@/lib/flowNodes";
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from "@/lib/canvasViewportFraming";
import { isEditableTarget } from "@/lib/editableTarget";
import { useCanvasStore } from "@/stores/canvasStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { cn } from "@/lib/utils";

const FIT_VIEW_OPTIONS = { padding: 0.1 };

type Palette = (typeof colors)[keyof typeof colors];

/**
 * La frame en grand : son contenu, dans une window, éditable comme sur le
 * canvas.
 *
 * C'est la vue d'une frame compacte, dont la carte masque le contenu — mais la
 * window s'ouvre aussi sur une frame dépliée, par les gestes « ouvrir »
 * explicites.
 *
 * Un second `ReactFlow`, sous son propre provider (sans lui, `<ReactFlow>`
 * réutiliserait celui du canvas et les deux vues se partageraient un seul
 * état), branché sur la même logique que le canvas : `useCanvasNodes` et
 * `useCanvasEdges` pour l'état et la persistance, `useContextMenu` pour le
 * clic droit, `useDeleteCanvasElements` pour la suppression. Les deux vues ne
 * se parlent pas directement : elles lisent les mêmes queries Convex, et
 * chacune voit les écritures de l'autre par leur update optimiste.
 *
 * Les enfants y sont détachés de la frame : leur position relative devient
 * une position tout court, et c'est elle qui est réécrite telle quelle quand
 * on les déplace — le repère est le même. Le contour de la frame est rappelé
 * en fond, pour savoir où son bord tombera une fois dépliée.
 *
 * Pas encore branché : création de nodes (menu, raccourcis, coller, déposer),
 * duplication, copier, Mod+A.
 */
export default function FrameWindow({ xyNodeId }: { xyNodeId: string }) {
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  const canEdit = useCanvasStore(
    (state) => state.canvas?._permission !== "viewer",
  );

  // Les mêmes queries que le canvas (`useCanvasBootstrap`) : Convex les
  // dédoublonne, et les updates optimistes des deux vues tombent dedans.
  const { data: tableNodes } = useRichQuery(api.nodes.listFromCanvas, {
    canvasId,
  });
  const { data: tableEdges } = useRichQuery(api.edges.listFromCanvas, {
    canvasId,
  });

  // Lue dans le store React Flow DU CANVAS (on est encore sous son provider) :
  // la couleur vit dans `data`, déjà résolue pour le rendu.
  // Le node tel que le canvas le connaît (`parentId`, position relative) :
  // c'est lui que reçoit le menu contextuel, qui agit par l'instance du
  // canvas.
  const { getNode: getCanvasNode } = useReactFlow();

  const frameColor = useStore(
    (state: ReactFlowState) =>
      state.nodeLookup.get(xyNodeId)?.data?.color as string | undefined,
  );
  const palette = colors[resolveColor(frameColor, true)];

  const frameDoc = tableNodes?.find((node) => node.id === xyNodeId);
  const frameSize = frameDoc
    ? { width: frameDoc.width, height: frameDoc.height }
    : undefined;

  const canvasNodes = useMemo(
    () =>
      tableNodes
        ?.filter((node) => node.parentId === xyNodeId)
        .map((doc) => detachFromFrame(toCanvasNode(doc))),
    [tableNodes, xyNodeId],
  );
  const canvasEdges = useMemo(() => {
    if (!canvasNodes || !tableEdges) return undefined;
    const ids = new Set(canvasNodes.map((node) => node.id));
    return tableEdges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map(toCanvasEdge);
  }, [canvasNodes, tableEdges]);

  if (canvasNodes && canvasNodes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          palette.frameBg,
        )}
      >
        This frame is empty
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FrameFlow
        canvasId={canvasId}
        canEdit={canEdit}
        canvasNodes={canvasNodes}
        canvasEdges={canvasEdges}
        frameSize={frameSize}
        palette={palette}
        getCanvasNode={getCanvasNode}
      />
    </ReactFlowProvider>
  );
}

/** Le contour de la frame, en fond : un faux node que rien ne persiste. */
const FRAME_BOUNDS_ID = "__frame-window-bounds";

const FrameBoundsNode = memo(function FrameBoundsNode({
  data,
}: NodeProps<Node<{ className: string }>>) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-[5px] border-2 border-dashed",
        data.className,
      )}
    />
  );
});

const windowNodeTypes: NodeTypes = {
  ...nodeTypes,
  frameBounds: FrameBoundsNode,
};

function FrameFlow({
  canvasId,
  canEdit,
  canvasNodes,
  canvasEdges,
  frameSize,
  palette,
  getCanvasNode,
}: {
  canvasId: Id<"canvases">;
  canEdit: boolean;
  canvasNodes: CanvasNode[] | undefined;
  canvasEdges: CanvasEdge[] | undefined;
  frameSize: { width: number; height: number } | undefined;
  palette: Palette;
  getCanvasNode: (id: string) => Node | undefined;
}) {
  const {
    getNodes,
    getEdges,
    setNodes,
    setEdges: setFlowEdges,
  } = useReactFlow();

  const {
    nodes,
    handleNodeChange,
    onNodeDrag,
    onNodeDragStop,
    onSelectionStart,
    onSelectionEnd,
  } = useCanvasNodes(canvasId, canvasNodes, { embedded: true });
  const { edges, setEdges, handleEdgeChange } = useCanvasEdges(canvasEdges);
  const edgesWithColoredMarkers = useMemo(
    () => injectMarkerColor(edges),
    [edges],
  );

  // Le contour passe en tête (donc dessous, à z égal) et n'entre jamais dans
  // `useCanvasNodes` : ses changes sont filtrés avant, sans quoi sa mesure
  // partirait en base comme celle d'un vrai node.
  const flowNodes = useMemo(() => {
    if (!frameSize) return nodes;
    const bounds: Node = {
      id: FRAME_BOUNDS_ID,
      type: "frameBounds",
      position: { x: 0, y: 0 },
      width: frameSize.width,
      height: frameSize.height,
      selectable: false,
      draggable: false,
      connectable: false,
      focusable: false,
      deletable: false,
      zIndex: -1000,
      data: { className: palette.frameBorder },
    };
    return [bounds, ...nodes];
  }, [frameSize, nodes, palette.frameBorder]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const own = changes.filter(
        (change) => !("id" in change) || change.id !== FRAME_BOUNDS_ID,
      );
      if (own.length > 0) handleNodeChange(own);
    },
    [handleNodeChange],
  );

  // Clic droit : le menu du canvas (store partagé, rendu une seule fois par
  // `CanvasFlow`), mais avec les nodes tels que le canvas les connaît — le
  // menu agit par l'instance du canvas, et un node détaché de sa frame y
  // serait dupliqué ou copié hors d'elle. La sélection, elle, se fait dans
  // CETTE instance, comme `useContextMenu` le fait sur le canvas.
  const { onEdgeContextMenu } = useContextMenu();
  const setContextMenu = useContextMenuStore((state) => state.setContextMenu);
  const openNodesMenu = useCallback(
    (event: ReactMouseEvent, targets: Node[]) => {
      event.preventDefault();
      const canvasTargets = targets.map(
        (node) => getCanvasNode(node.id) ?? node,
      );
      const [only] = canvasTargets;
      setContextMenu({
        type: canvasTargets.length === 1 ? "node" : "selection",
        position: { x: event.clientX, y: event.clientY },
        element: canvasTargets.length === 1 ? only : canvasTargets,
      });
    },
    [getCanvasNode, setContextMenu],
  );
  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      if (node.selected) {
        openNodesMenu(
          event,
          getNodes().filter((n) => n.selected && n.id !== FRAME_BOUNDS_ID),
        );
        return;
      }
      setNodes((current) =>
        current.map((n) => {
          const selected = n.id === node.id;
          return !!n.selected === selected ? n : { ...n, selected };
        }),
      );
      setFlowEdges((current) =>
        current.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge,
        ),
      );
      openNodesMenu(event, [node]);
    },
    [getNodes, openNodesMenu, setFlowEdges, setNodes],
  );
  const onSelectionContextMenu = useCallback(
    (event: ReactMouseEvent, selected: Node[]) =>
      openNodesMenu(
        event,
        selected.filter((node) => node.id !== FRAME_BOUNDS_ID),
      ),
    [openNodesMenu],
  );

  // Suppression au clavier. Le raccourci du canvas lit SA sélection, pas
  // celle-ci : la window porte le sien, limité au focus dans la window.
  const { deleteCanvasElements } = useDeleteCanvasElements();
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!canEdit || event.repeat) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isEditableTarget(event.target)) return;
      const selectedNodes = getNodes().filter(
        (node) => node.selected && node.id !== FRAME_BOUNDS_ID,
      );
      const selectedEdges = getEdges().filter((edge) => edge.selected);
      if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
      event.preventDefault();
      // La window peut se trouver au-dessus d'un canvas qui a sa propre
      // sélection : elle ne doit pas partir avec.
      event.stopPropagation();
      void deleteCanvasElements(
        { nodes: selectedNodes, edges: selectedEdges },
        { label: "Delete selection" },
      );
    },
    [canEdit, deleteCanvasElements, getEdges, getNodes],
  );

  // Connexions : même geste que le canvas (cf. `CanvasFlow`). Les deux bouts
  // sont forcément dans la frame.
  const { createEdge } = useCreateEdge();
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target } = connection;
      if (source === target) return false;
      return !getEdges().some(
        (edge) =>
          (edge.source === source && edge.target === target) ||
          (edge.source === target && edge.target === source),
      );
    },
    [getEdges],
  );
  const onConnect = useCallback(
    (params: Connection) => {
      const { source, target } = params;
      if (!source || !target || source === target) return;
      const { edgeId, settled } = createEdge({ source, target });
      handleEdgeChange([
        {
          type: "add" as const,
          item: {
            id: edgeId,
            source,
            target,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 30,
              height: 30,
              strokeWidth: 1,
            },
          },
        },
      ]);
      // Échec : retrait local seulement, l'edge n'a jamais existé côté serveur.
      void settled.catch(() => {
        setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      });
    },
    [createEdge, handleEdgeChange, setEdges],
  );

  return (
    <div className={cn("h-full w-full", palette.frameBg)} onKeyDown={onKeyDown}>
      <ReactFlow
        nodes={flowNodes}
        edges={edgesWithColoredMarkers}
        nodeTypes={windowNodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgeChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={canEdit ? onConnect : undefined}
        isValidConnection={isValidConnection}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        // Mêmes gestes que le canvas desktop : molette et trackpad pannent,
        // clic molette pour panner, clic gauche pour le lasso.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        preventScrolling
        panOnDrag={PAN_ON_DRAG_MIDDLE_BUTTON}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        // Même plan que le canvas (cf. `CanvasFlow`).
        zIndexMode="manual"
        elevateNodesOnSelect={false}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        // Volontaire, comme sur le canvas : la suppression passe par
        // `useDeleteCanvasElements`, pour rester annulable.
        deleteKeyCode={null}
        // Le double-clic ouvre le node, comme sur le canvas.
        zoomOnDoubleClick={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={palette.hex}
        />
      </ReactFlow>
    </div>
  );
}

const PAN_ON_DRAG_MIDDLE_BUTTON = [1];

/**
 * Un enfant de la frame, détaché d'elle : la frame n'existe pas dans cette
 * vue, et sa position relative devient une position tout court. Sans
 * `parentId`, `useCanvasNodes` réécrit cette position telle quelle — c'est
 * bien la relative, le repère n'a pas changé.
 */
function detachFromFrame(node: CanvasNode): CanvasNode {
  const {
    parentId: _parentId,
    extent: _extent,
    extendParent: _extendParent,
    ...rest
  } = node;
  return rest;
}
