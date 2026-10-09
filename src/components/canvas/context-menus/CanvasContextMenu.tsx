import { useViewport } from "@xyflow/react";
import { TbBookmark } from "react-icons/tb";
import AddBlockMenuContent from "./AddBlockMenuContent";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useCaptureFraming } from "@/hooks/useViewportFraming";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  isPendingCanvasConnectionElement,
  type ConnectedNodeCreatedInfo,
  type FrameScope,
  type PendingCanvasConnection,
} from "@/types/ui/context-menu.types";

export default function ContextMenu({
  closeMenu,
  position,
  element,
  onConnectionNodeCreated,
  frameScope = null,
}: {
  closeMenu: () => void;
  position: { x: number; y: number };
  /** Connexion en attente quand le menu naît d'un drag lâché dans le vide. */
  element?: PendingCanvasConnection | null;
  onConnectionNodeCreated?: (info: ConnectedNodeCreatedInfo) => void;
  /**
   * Ouvert depuis la window d'une frame : le node naît dans la frame, au
   * point cliqué — déjà converti en coordonnées de la frame par la window.
   */
  frameScope?: FrameScope | null;
}) {
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();
  const captureFraming = useCaptureFraming();
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { create: createBookmark, canBookmark } = useCanvasBookmarks({
    canvasId,
    enabled: false,
  });

  const pendingConnection =
    element && isPendingCanvasConnectionElement(element) ? element : null;

  // Drag dans le vide : le node naît pile dessous, au point de drop. Sinon
  // (clic droit) : conversion écran → flow du point de clic — faite par la
  // window quand le menu vient d'une frame, le viewport du canvas n'ayant
  // rien à voir avec le sien.
  const newNodePosition = pendingConnection?.dropFlowPosition ??
    frameScope?.flowPosition ?? {
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
        parentFrame={frameScope}
      />

      {/* Repère de cadrage. Masqué quand le menu naît d'un drag d'edge lâché
          dans le vide : ce geste-là demande un node à relier, pas un signet.

          Il capture le cadrage courant — centre de la vue et zoom du moment —
          et non le point cliqué : c'est la vue telle qu'on la voit qui est
          rejouée à la navigation (cf. `captureFraming` / `applyFraming`).

          Contrairement aux deux autres menus, ce repère est FIGÉ dans le
          monde : il ne suit rien, puisqu'il ne vise rien.

          Créé sans nom, comme les autres : le panneau l'affiche « Position »
          et on le renomme depuis lui. Pas de dialogue de nommage — il vivrait
          dans ce menu, démonté dès le clic, et mourrait avec lui. */}
      {canBookmark && !pendingConnection && !frameScope && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={() => {
              const framing = captureFraming();
              closeMenu();
              if (framing) {
                void createBookmark({ kind: "framing", framing });
              }
            }}
          >
            <TbBookmark />
            Bookmark here
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
