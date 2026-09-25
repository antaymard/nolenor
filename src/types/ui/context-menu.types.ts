import type { Node } from "@xyflow/react";

export type ContextMenuType = "node" | "edge" | "canvas" | "selection";

export interface ContextMenuState<T = unknown> {
  type: ContextMenuType | null;
  position: { x: number; y: number };
  element: T | null;
}

/**
 * Drag d'un handle source lâché dans le vide : le menu « Add a node »
 * s'ouvre au point de drop, le node naît pile dessous (`dropFlowPosition`,
 * coordonnées canvas) et l'edge est chaînée à sa création.
 */
export interface PendingCanvasConnection {
  sourceNodeId: string;
  /** Id du handle attrapé (`${nodeId}_s{l|r|t|b}`), préservé tel quel. */
  sourceHandleId: string | null;
  dropFlowPosition: { x: number; y: number };
}

export function isPendingCanvasConnectionElement(
  element: unknown,
): element is PendingCanvasConnection {
  if (typeof element !== "object" || element === null) return false;
  const candidate = element as Record<string, unknown>;
  return (
    typeof candidate.sourceNodeId === "string" &&
    (typeof candidate.sourceHandleId === "string" ||
      candidate.sourceHandleId === null) &&
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
  position: { x: number; y: number };
  width: number;
  height: number;
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
