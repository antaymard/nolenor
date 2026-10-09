import type { Node } from "@xyflow/react";

export type ContextMenuType = "node" | "edge" | "canvas" | "selection";

export interface ContextMenuState<T = unknown> {
  type: ContextMenuType | null;
  position: { x: number; y: number };
  element: T | null;
  /**
   * Menu ouvert depuis la window d'une frame (cf. `FrameWindow`) plutôt que
   * depuis le canvas : les positions y sont relatives à la frame, et un node
   * créé naît dedans. Absent = le canvas.
   */
  frameScope?: FrameScope | null;
}

/**
 * La window d'une frame, vue d'un menu contextuel.
 *
 * `flowPosition` : le point cliqué, en coordonnées de la frame — celles de
 * ses enfants (`parentId`). `compact` : son contenu est masqué sur le canvas,
 * un node qui y naît doit l'être aussi.
 */
export interface FrameScope {
  frameId: string;
  compact: boolean;
  flowPosition: { x: number; y: number };
}

/**
 * Drag d'un handle source lâché dans le vide : le menu « Add a node »
 * s'ouvre au point de drop, le node naît pile dessous (`dropFlowPosition`,
 * coordonnées canvas) et l'edge est chaînée à sa création.
 */
export interface PendingCanvasConnection {
  sourceNodeId: string;
  dropFlowPosition: { x: number; y: number };
}

export function isPendingCanvasConnectionElement(
  element: unknown,
): element is PendingCanvasConnection {
  if (typeof element !== "object" || element === null) return false;
  const candidate = element as Record<string, unknown>;
  return (
    typeof candidate.sourceNodeId === "string" &&
    typeof candidate.dropFlowPosition === "object" &&
    candidate.dropFlowPosition !== null &&
    typeof (candidate.dropFlowPosition as Record<string, unknown>).x ===
      "number" &&
    typeof (candidate.dropFlowPosition as Record<string, unknown>).y ===
      "number"
  );
}

/** Node créé depuis un `PendingCanvasConnection`, prêt à chaîner l'edge. */
export interface ConnectedNodeCreatedInfo {
  pendingConnection: PendingCanvasConnection;
  nodeId: string;
  /**
   * Confirmation serveur du node : l'edge visuelle est posée aussitôt, sa
   * persistance attend `nodeSettled` (le serveur refuse une edge vers un
   * node pas encore commité).
   */
  nodeSettled: Promise<unknown>;
}

export interface ContextMenuHandlers {
  onNodeContextMenu: (e: React.MouseEvent | MouseEvent, node: Node) => void;
  onEdgeContextMenu: (
    e: React.MouseEvent | MouseEvent,
    element: object,
  ) => void;
  onPaneContextMenu: (e: React.MouseEvent | MouseEvent) => void;
  onSelectionContextMenu: (
    e: React.MouseEvent | MouseEvent,
    nodes: Node[],
  ) => void;
  closeContextMenu: () => void;
}
