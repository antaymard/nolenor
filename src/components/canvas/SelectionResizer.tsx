import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useReactFlow,
  useStore,
  useStoreApi,
  type Node,
  type ReactFlowState,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodePatchProps } from "@/../convex/schemas/nodesSchema";
import { cn } from "@/lib/utils";
import { applyNodePatchesToListQuery } from "@/lib/flowNodes";
import { isCompactXyFrame } from "@/lib/frameVariant";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import {
  boundingRect,
  minimumScales,
  resizeSelectionRect,
  scaleSelection,
  type Rect,
  type ScalableNode,
  type ScaledLayout,
  type SelectionResizeHandle,
} from "@/lib/selectionResize";
import { toastError } from "@/components/utils/errorUtils";
import { recordUndo } from "@/stores/canvasHistoryStore";
import {
  isNodeResizable,
  useSelectionResizeStore,
} from "@/stores/selectionResizeStore";

// Les styles des poignées de `NodeFrame` : le cadre de la sélection doit se
// lire comme celui d'un node, en plus grand.
const LINE_STYLE: CSSProperties = { borderWidth: 2 };
const HANDLE_STYLE: CSSProperties = {
  height: 8,
  width: 8,
  borderRadius: 2,
  zIndex: 10,
};

// Lignes d'abord, coins ensuite : rendus après, les coins passent devant là
// où ils se chevauchent, comme chez `NodeResizer`.
const CONTROLS: Array<{
  handle: SelectionResizeHandle;
  variant: "line" | "handle";
}> = [
  { handle: "top", variant: "line" },
  { handle: "right", variant: "line" },
  { handle: "bottom", variant: "line" },
  { handle: "left", variant: "line" },
  { handle: "top-left", variant: "handle" },
  { handle: "top-right", variant: "handle" },
  { handle: "bottom-left", variant: "handle" },
  { handle: "bottom-right", variant: "handle" },
];

/**
 * Le cadre englobant des nodes sélectionnés, en clé texte : le sélecteur
 * tourne à chaque changement du store React Flow (pan, drag…), seul un cadre
 * différent doit re-rendre. Vide sous deux nodes, et pendant un drag : le
 * cadre suivrait la sélection mais ses poignées n'y servent à rien.
 */
const selectionRectKeySelector = (state: ReactFlowState): string => {
  const rects: Rect[] = [];
  for (const node of state.nodes) {
    if (!node.selected || node.hidden) continue;
    if (node.dragging) return "";
    const internal = state.nodeLookup.get(node.id);
    if (!internal) continue;
    const { x, y } = internal.internals.positionAbsolute;
    rects.push({
      x,
      y,
      width: internal.measured.width ?? node.width ?? 0,
      height: internal.measured.height ?? node.height ?? 0,
    });
  }
  if (rects.length < 2) return "";
  const rect = boundingRect(rects)!;
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
};

const transformSelector = (state: ReactFlowState) => state.transform;

/** L'état d'avant le geste, pour l'annulation. */
type BeforeLayout = Required<Pick<NodePatchProps, "position">> &
  Pick<NodePatchProps, "width" | "height">;

type Gesture = {
  pointerId: number;
  handle: SelectionResizeHandle;
  start: { clientX: number; clientY: number };
  rect: Rect;
  nodes: ScalableNode[];
  minScale: { x: number; y: number };
  before: Map<string, BeforeLayout>;
  /** Origine monde des frames NON emportées, parents de nodes emportés. */
  parentAbsolutes: Map<string, { x: number; y: number }>;
  last: Map<string, ScaledLayout> | null;
};

/**
 * Le redimensionnement d'une sélection de plusieurs nodes.
 *
 * Sous deux nodes sélectionnés, chaque node a ses propres poignées
 * (`NodeFrame`). Au-delà, elles s'effacent (`selectionResizeStore`) au profit
 * d'un cadre unique autour de la sélection, comme dans Figma ou tldraw : tirer
 * une poignée met TOUTE la sélection à l'échelle depuis le bord opposé —
 * positions et tailles. Shift garde les proportions.
 *
 * - Une frame sélectionnée emporte son contenu, même non sélectionné : sinon
 *   la frame rétrécirait sous ses nodes.
 * - Un node dont la taille ne dépend pas de l'utilisateur (titre, variante
 *   compacte) se déplace sans changer de taille (cf. `scaleSelection`).
 *
 * Rien n'est écrit pendant le geste, comme pour un drag : l'état local suit le
 * pointeur, avec `resizing` pour que la synchro Convex ne l'écrase pas (cf.
 * `useCanvasNodes`), et une seule écriture — une seule entrée d'historique —
 * part au relâcher.
 *
 * Dessiné en coordonnées écran, au-dessus des nodes : des poignées de taille
 * constante à tous les zooms.
 */
function SelectionResizer({ canvasId }: { canvasId: Id<"canvases"> }) {
  const rectKey = useStore(selectionRectKeySelector);
  const setActive = useSelectionResizeStore((state) => state.setActive);

  const isActive = rectKey !== "";
  useEffect(() => {
    setActive(isActive);
  }, [isActive, setActive]);
  // Démonté (passage en lecture seule, outil main, autre canvas) : les nodes
  // retrouvent leurs poignées.
  useEffect(() => () => setActive(false), [setActive]);

  if (!isActive) return null;
  return <SelectionResizeFrame rectKey={rectKey} canvasId={canvasId} />;
}

// Séparé pour ne s'abonner au viewport qu'avec un cadre affiché : hors
// multi-sélection, un pan ne doit rien re-rendre ici.
function SelectionResizeFrame({
  rectKey,
  canvasId,
}: {
  rectKey: string;
  canvasId: Id<"canvases">;
}) {
  const [tx, ty, zoom] = useStore(transformSelector);
  const store = useStoreApi();
  const { getNodes, getInternalNode, setNodes } = useReactFlow();
  const gestureRef = useRef<Gesture | null>(null);

  const patchNodes = useMutation(api.nodes.patch);
  const patchNodesInConvex = useMemo(
    () =>
      patchNodes.withOptimisticUpdate((localStore, { updates }) => {
        applyNodePatchesToListQuery(localStore, canvasId, updates);
      }),
    [patchNodes, canvasId],
  );

  const [x, y, width, height] = rectKey.split(",").map(Number);

  const applyLocally = (
    layouts: Map<string, ScaledLayout>,
    resizing: boolean,
  ) => {
    setNodes((current) =>
      current.map((node): Node => {
        const layout = layouts.get(node.id);
        if (!layout) return node;
        const next: Node = { ...node, position: layout.position, resizing };
        if (layout.width !== undefined && layout.height !== undefined) {
          next.width = layout.width;
          next.height = layout.height;
          // `measured` avec : sans lui, React Flow remesure le node, voit une
          // taille neuve et émet un change `dimensions` hors geste — que
          // `useCanvasNodes` écrirait à chaque frame.
          next.measured = { width: layout.width, height: layout.height };
        }
        return next;
      }),
    );
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: SelectionResizeHandle,
  ) => {
    if (event.button !== 0 || gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const all = getNodes();
    const selected = all.filter((node) => node.selected && !node.hidden);
    const selectedIds = new Set(selected.map((node) => node.id));
    // Une frame emporte son contenu ; une frame compacte, rendue en carte,
    // ne change pas de taille et le sien reste caché tel quel.
    const scaledFrameIds = new Set(
      selected
        .filter((node) => node.type === "frame" && !isCompactXyFrame(node))
        .map((node) => node.id),
    );

    const nodes: ScalableNode[] = [];
    const before = new Map<string, BeforeLayout>();
    const parentAbsolutes = new Map<string, { x: number; y: number }>();
    for (const node of all) {
      const carried =
        selectedIds.has(node.id) ||
        (node.parentId !== undefined && scaledFrameIds.has(node.parentId));
      if (!carried) continue;
      const internal = getInternalNode(node.id);
      if (!internal) continue;
      const nodeWidth = internal.measured.width ?? node.width ?? 0;
      const nodeHeight = internal.measured.height ?? node.height ?? 0;
      const scaleSize =
        node.type === "frame"
          ? !isCompactXyFrame(node)
          : isNodeResizable(node.id);
      nodes.push({
        id: node.id,
        parentId: node.parentId,
        absolute: { ...internal.internals.positionAbsolute },
        width: nodeWidth,
        height: nodeHeight,
        scaleSize,
      });
      before.set(node.id, {
        position: { ...node.position },
        ...(scaleSize && { width: nodeWidth, height: nodeHeight }),
      });
      if (node.parentId && !selectedIds.has(node.parentId)) {
        const parent = getInternalNode(node.parentId);
        if (parent) {
          parentAbsolutes.set(node.parentId, {
            ...parent.internals.positionAbsolute,
          });
        }
      }
    }

    const rect = boundingRect(
      nodes
        .filter((node) => selectedIds.has(node.id))
        .map((node) => ({
          ...node.absolute,
          width: node.width,
          height: node.height,
        })),
    );
    if (!rect) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      handle,
      start: { clientX: event.clientX, clientY: event.clientY },
      rect,
      nodes,
      minScale: minimumScales(nodes),
      before,
      parentAbsolutes,
      last: null,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();

    const currentZoom = store.getState().transform[2];
    const delta = {
      x: (event.clientX - gesture.start.clientX) / currentZoom,
      y: (event.clientY - gesture.start.clientY) / currentZoom,
    };
    const { rect } = resizeSelectionRect(gesture.rect, gesture.handle, delta, {
      keepAspectRatio: event.shiftKey,
      minScale: gesture.minScale,
    });
    const layouts = scaleSelection(gesture.nodes, gesture.rect, rect, (id) =>
      gesture.parentAbsolutes.get(id),
    );
    gesture.last = layouts;
    applyLocally(layouts, true);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const layouts = gesture.last;
    if (!layouts) return;
    applyLocally(layouts, false);

    const updates = [...layouts.entries()].map(([nodeId, layout]) => ({
      nodeId,
      props: {
        position: layout.position,
        ...(layout.width !== undefined && {
          width: layout.width,
          height: layout.height,
        }),
      },
    }));
    const undoUpdates = updates.flatMap(({ nodeId }) => {
      const props = gesture.before.get(nodeId);
      return props ? [{ nodeId, props }] : [];
    });

    // Un geste, une entrée : un seul Ctrl+Z remet toute la sélection.
    recordUndo(
      { kind: "patchNodes", updates: undoUpdates },
      { kind: "patchNodes", updates },
    );
    void trackCanvasSync(() => patchNodesInConvex({ updates })).catch(
      (error: unknown) => {
        toastError(error, "Could not save the selection size");
      },
    );
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      // Au-dessus du renderer de React Flow (z 4, qui porte les nodes et le
      // rectangle de sélection), au niveau des panneaux (z 5) mais rendu
      // avant eux : ils restent devant (cf. `SnapGuidesOverlay`).
      style={{ zIndex: 5 }}
    >
      <div
        className="absolute"
        style={{
          left: x * zoom + tx,
          top: y * zoom + ty,
          width: width * zoom,
          height: height * zoom,
        }}
      >
        {CONTROLS.map(({ handle, variant }) => (
          <div
            key={handle}
            className={cn(
              "react-flow__resize-control nodrag nopan pointer-events-auto touch-none",
              variant,
              ...handle.split("-"),
            )}
            style={variant === "line" ? LINE_STYLE : HANDLE_STYLE}
            onPointerDown={(event) => handlePointerDown(event, handle)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(SelectionResizer);
