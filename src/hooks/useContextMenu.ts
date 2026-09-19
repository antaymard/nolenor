import { useState, useCallback } from "react";
import { useReactFlow, type Edge } from "@xyflow/react";
import type {
  ContextMenuState,
  ContextMenuType,
  ContextMenuHandlers,
} from "@/types/ui/context-menu.types";

export function useContextMenu() {
  const { getEdges, setEdges, setNodes } = useReactFlow();
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
      (e: React.MouseEvent | MouseEvent, element: object) => {
        // Sélection exclusive de l'edge sous le curseur : sans ça, le menu
        // « edge » s'ouvrait sur une edge non mise en évidence — le halo de
        // `CustomEdge` ne s'allumait qu'au clic gauche suivant. Quand l'edge
        // est déjà dans la sélection (multi-sélection au lasso), on la garde
        // telle quelle pour ne pas casser le Delete groupé.
        const edgeId = (element as { id?: unknown }).id;
        if (typeof edgeId === "string") {
          const current = getEdges().find((edge) => edge.id === edgeId) as
            | Edge
            | undefined;
          if (current && !current.selected) {
            // Exclusif comme les nodes au clic droit : la sélection des nodes
            // est vidée elle aussi, sinon deux familles d'objets partageaient
            // la mise en évidence et le Delete devenait ambigu.
            setNodes((nodes) =>
              nodes.map((node) =>
                node.selected ? { ...node, selected: false } : node,
              ),
            );
            setEdges((edges) =>
              edges.map((edge) => ({ ...edge, selected: edge.id === edgeId })),
            );
          }
        }
        handleContextMenu(e, "edge", element);
      },
      [handleContextMenu, getEdges, setEdges, setNodes],
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
