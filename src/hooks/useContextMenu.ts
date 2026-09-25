import { useState, useCallback } from "react";
import { useReactFlow, useStoreApi, type Edge, type Node } from "@xyflow/react";
import type {
  ContextMenuState,
  ContextMenuType,
  ContextMenuHandlers,
} from "@/types/ui/context-menu.types";

export function useContextMenu() {
  const { getNodes, getEdges, setEdges, setNodes } = useReactFlow();
  const store = useStoreApi();
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

  // Aiguillage commun au clic droit sur un node et sur le cadre du lasso : le
  // menu dépend de la sélection, pas de la façon dont elle a été faite. Un
  // seul node → son menu complet ; plusieurs → le menu de sélection (fusion
  // d'images…). Sans ça, un lasso autour d'un seul node ouvrait le menu de
  // sélection, et des Ctrl+clics sur plusieurs nodes celui d'un seul.
  const openNodesMenu = useCallback(
    (e: React.MouseEvent | MouseEvent, nodes: Node[]) => {
      if (nodes.length === 1) {
        handleContextMenu(e, "node", nodes[0]);
      } else {
        handleContextMenu(e, "selection", nodes);
      }
    },
    [handleContextMenu],
  );

  const handlers: ContextMenuHandlers = {
    onNodeContextMenu: useCallback(
      (e: React.MouseEvent | MouseEvent, node: Node) => {
        // Node de la sélection : le menu vise toute la sélection. React Flow
        // ne pose son cadre (`onSelectionContextMenu`) qu'à la fin d'un lasso
        // — une sélection faite aux Ctrl+clics n'en a pas, et le clic droit
        // arrive ici, sur le node.
        if (node.selected) {
          openNodesMenu(
            e,
            getNodes().filter((n) => n.selected),
          );
          return;
        }
        // Node hors sélection : il devient la sélection, seul, comme une edge
        // au clic droit — sinon le menu agissait sur lui pendant que
        // l'ancienne sélection restait en évidence. `nodesSelectionActive`
        // retombe comme au clic gauche (`handleNodeClick` chez React Flow) :
        // resté levé après un lasso, le cadre de sélection viendrait se poser
        // sur ce node et avaler ses clics.
        store.setState({ nodesSelectionActive: false });
        setNodes((nodes) =>
          nodes.map((n) => {
            const selected = n.id === node.id;
            return !!n.selected === selected ? n : { ...n, selected };
          }),
        );
        setEdges((edges) =>
          edges.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge,
          ),
        );
        handleContextMenu(e, "node", node);
      },
      [getNodes, handleContextMenu, openNodesMenu, setEdges, setNodes, store],
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
      (e: React.MouseEvent | MouseEvent, nodes: Node[]) =>
        openNodesMenu(e, nodes),
      [openNodesMenu],
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
