import { useState, useCallback } from "react";
import type {
  ContextMenuState,
  ContextMenuType,
  ContextMenuHandlers,
} from "@/types/ui/context-menu.types";

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    type: null,
    position: { x: 0, y: 0 },
    element: null,
  });

  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent | MouseEvent,
      type: ContextMenuType,
      element: object | null = null,
    ) => {
      e.preventDefault();
      setContextMenu({
        type,
        position: { x: e.clientX, y: e.clientY },
        element,
      });
    },
    [],
  );

  const handlers: ContextMenuHandlers = {
    onNodeContextMenu: useCallback(
      (e: React.MouseEvent | MouseEvent, element: object) =>
        handleContextMenu(e, "node", element),
      [handleContextMenu],
    ),
    onEdgeContextMenu: useCallback(
      (e: React.MouseEvent | MouseEvent, element: object) =>
        handleContextMenu(e, "edge", element),
      [handleContextMenu],
    ),
    onPaneContextMenu: useCallback(
      (e: React.MouseEvent | MouseEvent) =>
        handleContextMenu(e, "canvas", null),
      [handleContextMenu],
    ),
    onSelectionContextMenu: useCallback(
      (e: React.MouseEvent | MouseEvent, element: object) =>
        handleContextMenu(e, "selection", element),
      [handleContextMenu],
    ),
    closeContextMenu: useCallback(() => {
      setContextMenu({ type: null, position: { x: 0, y: 0 }, element: null });
    }, []),
  };

  return {
    contextMenu,
    setContextMenu,
    ...handlers,
  };
}
