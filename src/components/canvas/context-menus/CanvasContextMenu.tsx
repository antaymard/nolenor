import { useViewport } from "@xyflow/react";
import AddBlockMenuContent from "./AddBlockMenuContent";
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

  const pendingConnection =
    element && isPendingCanvasConnectionElement(element) ? element : null;

  // Drag dans le vide : le node naît pile dessous, au point de drop. Sinon
  // (clic droit) : conversion écran → flow du point de clic.
  const newNodePosition = pendingConnection?.dropFlowPosition ?? {
    x: (-canvasX + position.x) / canvasZoom,
    y: (-canvasY + position.y) / canvasZoom,
  };

  return (
    <AddBlockMenuContent
      getCreatePosition={() => newNodePosition}
      onCreated={closeMenu}
      pendingConnection={pendingConnection}
      onConnectionNodeCreated={onConnectionNodeCreated}
    />
  );
}
