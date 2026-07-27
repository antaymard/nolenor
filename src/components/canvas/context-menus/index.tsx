import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import CanvasContextMenu from "./CanvasContextMenu";
import EdgeContextMenu from "./EdgeContextMenu";
import NodeContextMenu from "./NodeContextMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/shadcn/dropdown-menu";
import SelectionContextMenu from "./SelectionContextMenu";

import type { ContextMenuState } from "@/types/ui/context-menu.types";

// Marge minimale entre le menu et les bords de la fenêtre, partagée par le
// repositionnement et le plafond de hauteur.
const VIEWPORT_MARGIN = 10;

export default function ContextMenuWrapper({
  contextMenu,
  setContextMenu,
}: {
  contextMenu: ContextMenuState;
  setContextMenu: (contextMenu: ContextMenuState) => void;
}) {
  const { type, position, element } = contextMenu;
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const hasAdjustedRef = useRef(false);

  const handleClose = () => {
    setContextMenu({ type: null, position: { x: 0, y: 0 }, element: null });
  };

  useEffect(() => {
    setAdjustedPosition(position);
    hasAdjustedRef.current = false;
  }, [position]);

  const handleMenuRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && type !== null && !hasAdjustedRef.current) {
        const menuRect = node.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = VIEWPORT_MARGIN;

        let adjustedX = position.x;
        let adjustedY = position.y;

        if (adjustedX + menuRect.width > viewportWidth) {
          adjustedX = viewportWidth - menuRect.width - margin;
        }

        if (adjustedY + menuRect.height > viewportHeight) {
          adjustedY = viewportHeight - menuRect.height - margin;
        }

        if (adjustedX < margin) {
          adjustedX = margin;
        }

        if (adjustedY < margin) {
          adjustedY = margin;
        }

        if (adjustedX !== position.x || adjustedY !== position.y) {
          setAdjustedPosition({ x: adjustedX, y: adjustedY });
        }

        hasAdjustedRef.current = true;
      }
    },
    [position, type],
  );

  function renderContextMenu() {
    switch (type) {
      case "canvas":
        return (
          <CanvasContextMenu closeMenu={handleClose} position={position} />
        );
      case "node":
        return (
          <NodeContextMenu
            closeMenu={handleClose}
            position={position}
            xyNode={element as Node}
          />
        );
      case "edge":
        return (
          <EdgeContextMenu
            closeMenu={handleClose}
            position={position}
            xyEdge={element as Edge}
          />
        );
      case "selection":
        return (
          <SelectionContextMenu
            closeMenu={handleClose}
            elements={element as Node[] | null}
          />
        );
      default:
        return null;
    }
  }

  return (
    <DropdownMenu
      open={contextMenu.type !== null}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DropdownMenuContent
        ref={handleMenuRef}
        style={{
          position: "fixed",
          top: adjustedPosition.y,
          left: adjustedPosition.x,
          // Ce DropdownMenu n'a pas de Trigger (la position vient du clic
          // droit), donc Radix ne résout pas son
          // --radix-dropdown-menu-content-available-height et le max-h de
          // DropdownMenuContent est inerte. Sans ce plafond, un menu plus haut
          // que la fenêtre débordait même correctement positionné : remonter
          // le haut du menu ne peut pas compenser une hauteur excessive.
          // Borné ici, il scrolle (overflow-y-auto est déjà posé) et la mesure
          // ci-dessus voit toujours une hauteur tenant dans l'écran.
          maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {renderContextMenu()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
