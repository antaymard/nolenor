import { useViewport } from "@xyflow/react";
import { TbBookmark } from "react-icons/tb";
import AddBlockMenuContent from "./AddBlockMenuContent";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useCaptureFraming } from "@/hooks/useViewportFraming";
import { useBookmarkNameDialog } from "./useBookmarkNameDialog";
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
  const captureFraming = useCaptureFraming();
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { create: createBookmark, canBookmark } = useCanvasBookmarks({
    canvasId,
    enabled: false,
  });
  const { startBookmark, dialog: bookmarkNameDialog } = useBookmarkNameDialog(
    createBookmark,
  );

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

      {/* Repère de cadrage. Masqué quand le menu naît d'un drag d'edge lâché
          dans le vide : ce geste-là demande un node à relier, pas un signet.

          Il capture le cadrage courant — centre de la vue et zoom du moment —
          et non le point cliqué : c'est la vue telle qu'on la voit qui est
          rejouée à la navigation (cf. `captureFraming` / `applyFraming`).

          Contrairement aux deux autres menus, ce repère est FIGÉ dans le
          monde : il ne suit rien, puisqu'il ne vise rien. */}
      {canBookmark && !pendingConnection && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={() => {
              const framing = captureFraming();
              closeMenu();
              if (framing) {
                startBookmark({ kind: "framing", framing });
              }
            }}
          >
            <TbBookmark />
            Bookmark here
          </DropdownMenuItem>
        </>
      )}

      {bookmarkNameDialog}
    </>
  );
}
