import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { TbBookmark, TbBookmarkFilled } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { useCanvasStore } from "@/stores/canvasStore";
import { Toggle } from "@/components/shadcn/toggle";
import { useCanvasOwnsKeyboard } from "@/hooks/useCanvasHotkeysEnabled";
import { useIsolatedHotkey } from "@/hooks/useIsolatedHotkey";
import {
  isBookmarksDockOpen,
  setBookmarksDockOpen,
} from "@/lib/canvasDockStorage";
import DockBookmarksList from "./DockBookmarksList";

/**
 * Le bouton des repères, en bas à droite, et la liste qu'il déplie.
 *
 * Les windows minimisées n'y sont pas : elles vivent en pastilles à sa gauche
 * (`MinimizedDock`).
 *
 * La liste pop au-dessus du bouton, alignée à droite, avec l'origine au coin
 * du bouton — le geste d'un dossier du Dock macOS. Même montage que
 * `NoleCanvasPanel` en bas à gauche : un wrapper `relative`, la liste en
 * `absolute`, l'îlot du bouton en flux dessous.
 *
 * `B` bascule la liste, comme `N` le panneau Nolë.
 */
export default function CanvasDock() {
  const [isOpen, setIsOpen] = useState(isBookmarksDockOpen);

  // Même garde que `useCanvasBookmarks` : pas de session (canvas public visité
  // sans compte), pas de repères — l'icône reste outline.
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { isAuthenticated } = useConvexAuth();
  const bookmarks = useQuery(
    api.canvasBookmarks.listForCanvas,
    canvasId && isAuthenticated ? { canvasId } : "skip",
  );
  // `undefined` le temps du chargement : on reste en outline, comme vide.
  const hasBookmarks = (bookmarks?.length ?? 0) > 0;

  function handleToggle(next: boolean) {
    setIsOpen(next);
    setBookmarksDockOpen(next);
  }

  const canvasOwnsKeyboard = useCanvasOwnsKeyboard();
  useIsolatedHotkey("B", () => handleToggle(!isOpen), {
    enabled: canvasOwnsKeyboard,
  });

  return (
    <div className="relative">
      {isOpen && (
        // `bottom-12.5` : la valeur de `NoleCanvasPanel`, pour la même raison —
        // le bouton fait h-10 et `canvas-ui-container` ajoute sa bordure, 50px
        // dégagent la rangée. `right-0` + origine au coin bas-droit : la liste
        // grandit DEPUIS le bouton.
        <div className="absolute bottom-12.5 right-0 w-72 origin-bottom-right animate-appear-zoom">
          <DockBookmarksList onClose={() => handleToggle(false)} />
        </div>
      )}

      {/* `px-0!` : le bouton remplit l'îlot, sans marge blanche autour. */}
      <div className="canvas-ui-container animate-appear-up px-0!">
        <Toggle
          pressed={isOpen}
          onPressedChange={handleToggle}
          className="h-10 w-10 rounded-lg p-0"
          aria-label="Bookmarks"
          title="Bookmarks: jump to a saved spot (B)"
        >
          {hasBookmarks ? (
            <TbBookmarkFilled
              size={19}
              className="text-amber-500"
              aria-hidden
            />
          ) : (
            <TbBookmark size={19} aria-hidden />
          )}
        </Toggle>
      </div>
    </div>
  );
}
