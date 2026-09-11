export type ContextMenuType = "node" | "edge" | "canvas" | "selection";

export interface ContextMenuState<T = unknown> {
  type: ContextMenuType | null;
  position: { x: number; y: number };
  element: T | null;
}

export interface ContextMenuHandlers {
  onNodeContextMenu: (
    e: React.MouseEvent | MouseEvent,
    element: object,
  ) => void;
  onEdgeContextMenu: (
    e: React.MouseEvent | MouseEvent,
    element: object,
  ) => void;
  onPaneContextMenu: (e: React.MouseEvent | MouseEvent) => void;
  onSelectionContextMenu: (
    e: React.MouseEvent | MouseEvent,
    element: object,
  ) => void;
  closeContextMenu: () => void;
}
