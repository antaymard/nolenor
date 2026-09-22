import { useViewport } from "@xyflow/react";
import { TbBookmark } from "react-icons/tb";
import AddBlockMenuContent from "./AddBlockMenuContent";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  isPendingCanvasConnectionElement,
  type ConnectedNodeCreatedInfo,
  type PendingCanvasConnection,
} from "@/types/ui/context-menu.types";

export default function ContextMenu({
  closeMenu,
  position,
  element,
  onConnectionNodeCreated,
}: {
  closeMenu: () => void;
  position: { x: number; y: number };
  /** Connexion en attente quand le menu naît d'un drag lâché dans le vide. */
  element?: PendingCanvasConnection | null;
  onConnectionNodeCreated?: (info: ConnectedNodeCreatedInfo) => void;
}) {
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { create: createBookmark, canBookmark } = useCanvasBookmarks({
    canvasId,
    enabled: false,
  });

  const pendingConnection =
    element && isPendingCanvasConnectionElement(element) ? element : null;

  // Drag dans le vide : le node naît pile dessous, au point de drop. Sinon
  // (clic droit) : conversion écran → flow du point de clic.
  const newNodePosition = pendingConnection?.dropFlowPosition ?? {
    x: (-canvasX + position.x) / canvasZoom,
    y: (-canvasY + position.y) / canvasZoom,
  };

  return (
    <>
      <AddBlockMenuContent
        getCreatePosition={() => newNodePosition}
        onCreated={closeMenu}
        pendingConnection={pendingConnection}
        onConnectionNodeCreated={onConnectionNodeCreated}
      />

      {/* Repère de position. Masqué quand le menu naît d'un drag d'edge lâché
          dans le vide : ce geste-là demande un node à relier, pas un signet.

          Le point cliqué sert de centre, et non le centre de la vue : c'est
          l'endroit que l'utilisateur a désigné. Le zoom, lui, est celui du
          moment — un repère enregistre un cadrage, pas seulement un point.

          Contrairement aux deux autres menus, ce repère est FIGÉ dans le
          monde : il ne suit rien, puisqu'il ne vise rien. */}
      {canBookmark && !pendingConnection && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={() => {
              void createBookmark({
                kind: "framing",
                framing: {
                  cx: newNodePosition.x,
                  cy: newNodePosition.y,
                  zoom: canvasZoom,
                },
              });
              closeMenu();
            }}
          >
            <TbBookmark />
            Bookmark this position
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
