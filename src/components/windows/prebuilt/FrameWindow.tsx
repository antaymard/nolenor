import { useCallback, useMemo, useRef, type MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
  ViewportPortal,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { edgeTypes } from "@/components/edges/edgeTypes";
import { injectMarkerColor } from "@/components/edges/edgeStyleUtils";
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from "@/lib/canvasViewportFraming";
import { isCompactXyFrame } from "@/lib/frameVariant";
import { colors, resolveColor } from "@/components/ui/styles";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useCreateEdge } from "@/hooks/useCreateEdge";
import { useFitFrameOnNewChildren, useFrameFit } from "@/hooks/useFrameFit";
import { FRAME_FIT_PADDING } from "@/lib/frameFit";
import { useCanvasStore } from "@/stores/canvasStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useEdgeEditorStore } from "@/stores/edgeEditorStore";
import type { EdgeCustomData } from "@/types/domain";
import type {
  FrameScope,
  PendingCanvasConnection,
} from "@/types/ui/context-menu.types";
import { cn } from "@/lib/utils";

const FIT_VIEW_OPTIONS = { padding: 0.1 };

// Parité `CanvasFlow.onConnect` (et le default serveur).
const NEW_EDGE_MARKER_END = {
  type: MarkerType.Arrow,
  width: 30,
  height: 30,
  strokeWidth: 1,
};

type XY = { x: number; y: number };

/**
 * La frame en grand : son contenu, rendu comme sur le canvas, dans une window.
 *
 * C'est la vue d'une frame compacte, dont la carte masque le contenu — mais la
 * window s'ouvre aussi sur une frame dépliée, par les gestes « ouvrir »
 * explicites.
 *
 * On y travaille comme sur le canvas, dans les limites de la frame :
 * sélectionner, déplacer, relier, et le clic droit — sur un node, une edge
 * ou le fond (« Add a node », sans frame : pas de frame dans une frame).
 *
 * Les nodes sont lus dans le store React Flow DU CANVAS (la window vit sous
 * son provider) et rendus dans un second `ReactFlow`, sous son propre
 * provider : sans lui, `<ReactFlow>` réutiliserait celui du canvas et les deux
 * vues se partageraient un seul état.
 *
 * Toute écriture repart donc vers le canvas, jamais vers ce second store, qui
 * n'est qu'un miroir : les changements de position et de taille sont rejoués
 * dans `onNodesChange` du canvas (`triggerNodeChanges`) — même buffer de
 * drag, même persistance, même entrée d'historique qu'un geste fait sur le
 * canvas —, la sélection est posée sur ses nodes et ses edges, et les menus
 * contextuels sont ceux du canvas (`useContextMenuStore`, rendus par
 * `CanvasFlow`). Une sélection faite ici est donc celle du canvas : Suppr,
 * Ctrl+C, Ctrl+D et Ctrl+Z y agissent sans rien de plus.
 *
 * Les positions de cette vue SONT celles des enfants de la frame (relatives à
 * elle) : rien à convertir dans un sens comme dans l'autre.
 *
 * Les bords de la frame sont tracés dans la vue. Un node lâché au-delà ne
 * sort pas de la frame : elle s'agrandit pour le contenir (cf.
 * `useFrameFit`), dans le même Ctrl+Z que le geste.
 */
export default function FrameWindow({ xyNodeId }: { xyNodeId: string }) {
  const canEdit = useCanvasStore(
    (state) => state.canvas?._permission !== "viewer",
  );

  // ── Le canvas, vu d'ici ──────────────────────────────────────────────
  // Appelés AVANT le second provider : ils visent le store du canvas.
  const canvasStore = useStoreApi();
  const { getNode, getEdges, setNodes, setEdges } = useReactFlow();
  const { createEdge } = useCreateEdge();
  const { onNodeContextMenu, onEdgeContextMenu, onSelectionContextMenu } =
    useContextMenu();
  const setContextMenu = useContextMenuStore((s) => s.setContextMenu);

  const children = useStore(
    (state: ReactFlowState) =>
      state.nodes.filter((node) => node.parentId === xyNodeId),
    shallow,
  );
  const edges = useStore((state: ReactFlowState) => state.edges, shallow);
  // Habillée aux couleurs de la frame — même fond que sur le canvas, points
  // dans sa teinte : on retrouve dans la window le cadre qu'on vient d'ouvrir.
  const frameColor = useStore(
    (state: ReactFlowState) =>
      state.nodeLookup.get(xyNodeId)?.data?.color as string | undefined,
  );
  const isCompact = useStore((state: ReactFlowState) => {
    const frame = state.nodeLookup.get(xyNodeId);
    return frame ? isCompactXyFrame(frame) : false;
  });
  // Les frames sont toujours de premier niveau : `position` est en
  // coordonnées monde.
  const frameX = useStore(
    (state: ReactFlowState) => state.nodeLookup.get(xyNodeId)?.position.x ?? 0,
  );
  const frameY = useStore(
    (state: ReactFlowState) => state.nodeLookup.get(xyNodeId)?.position.y ?? 0,
  );
  const palette = colors[resolveColor(frameColor, true)];

  const childIds = useMemo(
    () => new Set(children.map((node) => node.id)),
    [children],
  );
  const flowNodes = useMemo(() => children.map(toStandaloneNode), [children]);

  const { frameSize, fitFrame, fitAfterGesture } = useFrameFit(xyNodeId);
  useFitFrameOnNewChildren(childIds, fitFrame, canEdit);
  const flowEdges = useMemo(
    () =>
      injectMarkerColor(
        edges
          .filter(
            (edge) => childIds.has(edge.source) && childIds.has(edge.target),
          )
          .map((edge) => toFrameLocalEdge(edge, { x: frameX, y: frameY })),
      ),
    [childIds, edges, frameX, frameY],
  );

  // ── Sélection ────────────────────────────────────────────────────────
  // Celle du canvas. Sélectionner ici désélectionne ce qui, sur le canvas, est
  // hors de la frame (la frame elle-même au premier chef) : sinon Suppr, qui
  // agit sur la sélection du canvas, emporterait aussi ce qu'on ne voit pas.
  const isInScope = useCallback(
    (edge: Edge) => childIds.has(edge.source) && childIds.has(edge.target),
    [childIds],
  );

  const applySelection = useCallback(
    (
      nodeSelection: Map<string, boolean>,
      edgeSelection: Map<string, boolean>,
    ) => {
      const selecting =
        [...nodeSelection.values()].some(Boolean) ||
        [...edgeSelection.values()].some(Boolean);
      const nextNodeSelected = (node: Node) =>
        nodeSelection.get(node.id) ??
        (selecting && node.parentId !== xyNodeId ? false : !!node.selected);
      const nextEdgeSelected = (edge: Edge) =>
        edgeSelection.get(edge.id) ??
        (selecting && !isInScope(edge) ? false : !!edge.selected);

      if (nodeSelection.size > 0 || selecting) {
        setNodes((nodes) =>
          nodes.map((node) => {
            const selected = nextNodeSelected(node);
            return !!node.selected === selected ? node : { ...node, selected };
          }),
        );
      }
      if (edgeSelection.size > 0 || selecting) {
        setEdges((current) =>
          current.map((edge) => {
            const selected = nextEdgeSelected(edge);
            return !!edge.selected === selected ? edge : { ...edge, selected };
          }),
        );
      }
    },
    [isInScope, setEdges, setNodes, xyNodeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nodeSelection = new Map<string, boolean>();
      const forwarded: NodeChange[] = [];
      for (const change of changes) {
        if (change.type === "select") {
          nodeSelection.set(change.id, change.selected);
        } else if (
          canEdit &&
          (change.type === "position" ||
            // Un redimensionnement, pas une simple mesure : celle-ci est
            // propre à cette vue, le canvas a la sienne.
            (change.type === "dimensions" && change.resizing !== undefined))
        ) {
          forwarded.push(change);
        }
      }
      if (forwarded.length > 0) {
        canvasStore.getState().triggerNodeChanges(forwarded);
        // Fin d'un redimensionnement : le node a pu grandir hors de la frame.
        if (
          forwarded.some(
            (change) =>
              change.type === "dimensions" && change.resizing === false,
          )
        ) {
          fitAfterGesture();
        }
      }
      if (nodeSelection.size > 0) applySelection(nodeSelection, new Map());
    },
    [applySelection, canEdit, canvasStore, fitAfterGesture],
  );

  // Relâcher d'un drag : le canvas a déjà écrit les positions (rejouées
  // ci-dessus) ; reste à agrandir la frame si un node en est sorti.
  const onNodeDragStop = useCallback(
    (_event: MouseEvent, _node: Node, nodes: Node[]) => {
      if (!canEdit) return;
      fitAfterGesture(
        new Map(nodes.map((node) => [node.id, { ...node.position }])),
      );
    },
    [canEdit, fitAfterGesture],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const edgeSelection = new Map<string, boolean>();
      for (const change of changes) {
        if (change.type === "select") {
          edgeSelection.set(change.id, change.selected);
        }
      }
      if (edgeSelection.size > 0) applySelection(new Map(), edgeSelection);
    },
    [applySelection],
  );

  // ── Connexions ───────────────────────────────────────────────────────
  // Mêmes règles que le canvas : pas de boucle, pas de doublon (dans un sens
  // ou dans l'autre).
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
    ({ source, target }: Connection) => {
      if (!canEdit || !source || !target || source === target) return;
      // Local-first, comme `CanvasFlow.onConnect` : l'edge est posée sur le
      // canvas tout de suite (donc ici), retirée en local seulement si le
      // serveur la refuse.
      const { edgeId, settled } = createEdge({ source, target });
      canvasStore.getState().triggerEdgeChanges([
        {
          type: "add",
          item: { id: edgeId, source, target, markerEnd: NEW_EDGE_MARKER_END },
        },
      ]);
      void settled.catch(() => {
        setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      });
    },
    [canEdit, canvasStore, createEdge, setEdges],
  );

  // ── Menus contextuels ────────────────────────────────────────────────
  // Ceux du canvas, sur ses nodes et ses edges (pas sur les copies de cette
  // vue) : sélection, actions et suppression passent par lui.
  const handleNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      const canvasNode = getNode(node.id);
      if (canvasNode) onNodeContextMenu(event, canvasNode);
    },
    [getNode, onNodeContextMenu],
  );

  const handleSelectionContextMenu = useCallback(
    (event: MouseEvent, nodes: Node[]) => {
      const canvasNodes = nodes.flatMap((node) => {
        const canvasNode = getNode(node.id);
        return canvasNode ? [canvasNode] : [];
      });
      if (canvasNodes.length > 0) onSelectionContextMenu(event, canvasNodes);
    },
    [getNode, onSelectionContextMenu],
  );

  const handleEdgeContextMenu = useCallback(
    (event: MouseEvent, edge: Edge, frameScope: FrameScope) => {
      const canvasEdge = getEdges().find((e) => e.id === edge.id);
      if (!canvasEdge) return;
      onEdgeContextMenu(event, canvasEdge);
      // Le menu d'edge s'ouvre sans portée : on la lui ajoute, pour qu'il
      // écarte ce qui se calcule en coordonnées du canvas.
      setContextMenu({
        ...useContextMenuStore.getState().contextMenu,
        frameScope,
      });
    },
    [getEdges, onEdgeContextMenu, setContextMenu],
  );

  const openAddNodeMenu = useCallback(
    (
      screen: XY,
      flowPosition: XY,
      pendingConnection: PendingCanvasConnection | null = null,
    ) => {
      if (!canEdit) return;
      // Un node ne naît pas au-delà du bord gauche ou haut : la frame ne
      // sait grandir vers là qu'en décalant son contenu, ce qu'un node pas
      // encore confirmé par le serveur ne permet pas (cf. `useFrameFit`). À
      // droite et en bas, elle s'agrandit pour lui.
      const inside = {
        x: Math.max(flowPosition.x, FRAME_FIT_PADDING / 2),
        y: Math.max(flowPosition.y, FRAME_FIT_PADDING / 2),
      };
      setContextMenu({
        type: "canvas",
        position: screen,
        element: pendingConnection && {
          ...pendingConnection,
          dropFlowPosition: inside,
        },
        frameScope: {
          frameId: xyNodeId,
          compact: isCompact,
          flowPosition: inside,
        },
      });
    },
    [canEdit, isCompact, setContextMenu, xyNodeId],
  );

  return (
    <ReactFlowProvider>
      <FrameFlow
        frameId={xyNodeId}
        isCompact={isCompact}
        canEdit={canEdit}
        frameBgClass={palette.frameBg}
        patternColor={palette.hex}
        nodes={flowNodes}
        edges={flowEdges}
        frameSize={frameSize}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeContextMenu={handleNodeContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        openAddNodeMenu={openAddNodeMenu}
      />
    </ReactFlowProvider>
  );
}

/**
 * Le `ReactFlow` de la window, sous son propre provider : ce qui a besoin de
 * SON viewport (convertir un point écran en coordonnées de la frame) vit ici.
 */
function FrameFlow({
  frameId,
  isCompact,
  canEdit,
  frameBgClass,
  patternColor,
  nodes,
  edges,
  frameSize,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onConnect,
  isValidConnection,
  onNodeContextMenu,
  onSelectionContextMenu,
  onEdgeContextMenu,
  openAddNodeMenu,
}: {
  frameId: string;
  isCompact: boolean;
  canEdit: boolean;
  frameBgClass: string;
  patternColor: string;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Taille stockée de la frame (dépliée), pour tracer ses bords. */
  frameSize: { width: number; height: number } | null;
  onNodeDragStop: (event: MouseEvent, node: Node, nodes: Node[]) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | Edge) => boolean;
  onNodeContextMenu: (event: MouseEvent, node: Node) => void;
  onSelectionContextMenu: (event: MouseEvent, nodes: Node[]) => void;
  onEdgeContextMenu: (
    event: MouseEvent,
    edge: Edge,
    frameScope: FrameScope,
  ) => void;
  openAddNodeMenu: (
    screen: XY,
    flowPosition: XY,
    pendingConnection?: PendingCanvasConnection | null,
  ) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const screen = { x: event.clientX, y: event.clientY };
      openAddNodeMenu(screen, screenToFlowPosition(screen));
    },
    [openAddNodeMenu, screenToFlowPosition],
  );

  const handleEdgeContextMenu = useCallback(
    (event: MouseEvent, edge: Edge) => {
      const screen = { x: event.clientX, y: event.clientY };
      onEdgeContextMenu(event, edge, {
        frameId,
        compact: isCompact,
        flowPosition: screenToFlowPosition(screen),
      });
    },
    [frameId, isCompact, onEdgeContextMenu, screenToFlowPosition],
  );

  // Drag d'un handle source lâché dans le vide de la window : « Add a node »
  // au point de drop, dans la frame, et l'edge chaînée à sa création (cf.
  // `CanvasFlow.handleConnectEnd`, `handleConnectionNodeCreated`).
  const onConnectEnd = useCallback(
    (
      event: globalThis.MouseEvent | globalThis.TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (connectionState.toNode) return;
      const { fromNode, fromHandle } = connectionState;
      if (!fromNode || !fromHandle || fromHandle.type !== "source") return;
      // Lâché hors de la window (canvas, autre window) : rien à poser.
      const target = event.target as globalThis.Node | null;
      if (!target || !containerRef.current?.contains(target)) return;
      const point =
        "changedTouches" in event
          ? (event.changedTouches[0] ?? event.touches[0])
          : event;
      if (!point) return;
      const screen = { x: point.clientX, y: point.clientY };
      const flowPosition = screenToFlowPosition(screen);
      openAddNodeMenu(screen, flowPosition, {
        sourceNodeId: fromNode.id,
        dropFlowPosition: flowPosition,
      });
    },
    [openAddNodeMenu, screenToFlowPosition],
  );

  const onEdgeDoubleClick = useCallback((_event: MouseEvent, edge: Edge) => {
    useEdgeEditorStore.getState().setEditingEdgeId(edge.id);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full", frameBgClass)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        // Mêmes gestes que le canvas : molette et trackpad pannent, le
        // pinch zoome. Le glisser sur le fond pan aussi (Shift + glisser
        // trace un lasso) : la window est petite, on s'y déplace plus qu'on
        // n'y sélectionne.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        preventScrolling
        zIndexMode="manual"
        elevateNodesOnSelect={false}
        selectNodesOnDrag={false}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        // Les flèches du clavier déplaceraient un node focalisé sans passer
        // par le buffer de drag du canvas.
        nodesFocusable={false}
        edgesFocusable={false}
        // La suppression au clavier est celle du canvas (sur sa sélection,
        // qui est celle-ci) : elle reste annulable.
        deleteKeyCode={null}
        // Le double-clic ouvre le node, comme sur le canvas.
        zoomOnDoubleClick={false}
        onConnect={onConnect}
        onConnectEnd={canEdit ? onConnectEnd : undefined}
        isValidConnection={isValidConnection}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeDoubleClick={canEdit ? onEdgeDoubleClick : undefined}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={patternColor}
        />
        {/* Les bords de la frame, dans son repère : (0, 0) est son coin
            haut-gauche. Un simple trait, sans fond — le portail se peint
            par-dessus les nodes. */}
        {frameSize && (
          <ViewportPortal>
            <div
              className="pointer-events-none absolute rounded-lg border-2 border-dashed"
              style={{
                left: 0,
                top: 0,
                width: frameSize.width,
                height: frameSize.height,
                borderColor: patternColor,
              }}
            />
          </ViewportPortal>
        )}
      </ReactFlow>
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {canEdit
            ? "This frame is empty — right-click to add a node"
            : "This frame is empty"}
        </div>
      )}
    </div>
  );
}

/**
 * Un enfant de la frame, détaché d'elle : la frame n'existe pas dans cette
 * vue, et ses positions relatives deviennent des positions tout court.
 *
 * Le masquage posé par une frame compacte (`hiddenByFrame`) tombe — c'est ce
 * contenu-là qu'on vient voir. Un masquage propre au node, lui, reste.
 */
function toStandaloneNode(node: Node): Node {
  const { hiddenByFrame, ...data } = node.data ?? {};
  return {
    ...node,
    parentId: undefined,
    extent: undefined,
    expandParent: undefined,
    hidden: hiddenByFrame === true ? false : node.hidden,
    data,
  };
}

/**
 * Une edge de la frame, dans le repère de la frame : ses points de courbure
 * sont stockés en coordonnées monde, les nodes de cette vue en coordonnées de
 * la frame. On les décale pour le rendu, et on fige leurs poignées — un drag
 * y persisterait les coordonnées décalées.
 */
function toFrameLocalEdge(edge: Edge, framePosition: XY): Edge {
  const data = (edge.data ?? {}) as EdgeCustomData;
  if (!data.bendPoints?.length) return edge;
  return {
    ...edge,
    data: {
      ...data,
      bendPoints: data.bendPoints.map((point) => ({
        ...point,
        x: point.x - framePosition.x,
        y: point.y - framePosition.y,
      })),
      bendPointsLocked: true,
    },
  };
}
