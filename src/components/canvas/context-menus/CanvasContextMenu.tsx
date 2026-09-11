import { useViewport } from "@xyflow/react";
import AddBlockMenuContent from "./AddBlockMenuContent";

export default function ContextMenu({
  closeMenu,
  position,
}: {
  closeMenu: () => void;
  position: { x: number; y: number };
}) {
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();

  const newNodePosition = {
    x: (-canvasX + position.x) / canvasZoom,
    y: (-canvasY + position.y) / canvasZoom,
  };

  return (
    <AddBlockMenuContent
      getCreatePosition={() => newNodePosition}
      onCreated={closeMenu}
    />
  );
}
