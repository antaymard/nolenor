import { useState } from "react";
import { TbBookmark } from "react-icons/tb";
import { Toggle } from "@/components/shadcn/toggle";
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
 */
export default function CanvasDock() {
  const [isOpen, setIsOpen] = useState(isBookmarksDockOpen);

  function handleToggle(next: boolean) {
    setIsOpen(next);
    setBookmarksDockOpen(next);
  }

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
          title="Bookmarks: jump to a saved spot"
        >
          <TbBookmark size={19} />
        </Toggle>
      </div>
    </div>
  );
}
