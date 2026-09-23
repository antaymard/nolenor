import { useEffect, useMemo, useRef, useState } from "react";
import { TbBookmark } from "react-icons/tb";
import { Toggle } from "@/components/shadcn/toggle";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import {
  isBookmarksDockOpen,
  setBookmarksDockOpen,
} from "@/lib/canvasDockStorage";
import { useWindowsStore } from "@/stores/windowsStore";
import DockBookmarksList from "./DockBookmarksList";
import DockMinimizedList from "./DockMinimizedList";

/**
 * Le dock du coin bas-droite : un bouton, un panneau.
 *
 * Windows minimisées et repères partagent le même panneau, en deux sections
 * séparées par un trait et titrées : les minimisées en haut (de l'état de
 * session, courte, et ce qu'on vient chercher quand le panneau s'ouvre tout
 * seul), les repères dessous. Un seul scroll pour les deux.
 *
 * Le panneau pop au-dessus du bouton, aligné à droite, avec l'origine au coin
 * du bouton — le geste d'un dossier du Dock macOS. Même montage que
 * `NoleCanvasPanel` en bas à gauche : un wrapper `relative`, le panneau en
 * `absolute`, l'îlot du bouton en flux dessous.
 */
export default function CanvasDock() {
  const [isOpen, setIsOpen] = useState(isBookmarksDockOpen);
  // Le panneau a-t-il été ouvert par une minimisation, et pas par un clic ?
  // Seul ce cas-là se referme tout seul quand la dernière window minimisée
  // s'en va : un panneau ouvert à la main reste ouvert sur les repères.
  const openedByMinimizeRef = useRef(false);

  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const existingNodeIds = useExistingNodeIds();
  // Filtré ici et pas dans la liste : la pastille de compteur et la liste
  // doivent annoncer le même nombre, or une window dont le node a été
  // supprimé ne doit compter dans ni l'un ni l'autre.
  const minimizedWindows = useMemo(
    () =>
      openedWindows.filter(
        (w) => w.windowState === "minimized" && existingNodeIds.has(w.xyNodeId),
      ),
    [openedWindows, existingNodeIds],
  );
  const minimizedCount = minimizedWindows.length;

  const previousCountRef = useRef(minimizedCount);
  useEffect(() => {
    const grew = minimizedCount > previousCountRef.current;
    previousCountRef.current = minimizedCount;
    // Minimiser une window déplie le panneau — c'est ce qui dit où la window
    // est partie. S'il est déjà ouvert, la section apparaît ou grandit sous
    // les yeux, rien à faire de plus.
    if (grew) {
      setIsOpen((current) => {
        if (!current) openedByMinimizeRef.current = true;
        return true;
      });
    }
    if (minimizedCount === 0 && openedByMinimizeRef.current) {
      openedByMinimizeRef.current = false;
      setIsOpen(false);
    }
  }, [minimizedCount]);

  function handleToggle(next: boolean) {
    openedByMinimizeRef.current = false;
    setIsOpen(next);
    // Retenu d'une session à l'autre : « je veux voir mes repères ». Une
    // ouverture automatique par minimisation ne passe pas par ici, et n'est
    // donc pas retenue.
    setBookmarksDockOpen(next);
  }

  return (
    <div className="relative">
      {isOpen && (
        // `bottom-12.5` : la valeur de `NoleCanvasPanel`, pour la même raison —
        // le bouton fait h-10 et `canvas-ui-container` ajoute son p-1, 50px
        // dégagent la rangée. `right-0` + origine au coin bas-droit : le
        // panneau grandit DEPUIS le bouton.
        <div className="absolute bottom-12.5 right-0 w-72 origin-bottom-right animate-appear-zoom">
          <div className="flex max-h-96 w-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white pt-1 shadow-[0_6px_20px_rgba(15,23,42,0.12)]">
            {minimizedCount > 0 && (
              <DockMinimizedList windows={minimizedWindows} />
            )}
            <DockBookmarksList withDivider={minimizedCount > 0} />
          </div>
        </div>
      )}

      <div className="canvas-ui-container animate-appear-up">
        <Toggle
          pressed={isOpen}
          onPressedChange={handleToggle}
          className="relative h-10 w-10 rounded-lg p-0"
          aria-label={
            minimizedCount > 0
              ? `Bookmarks and minimized windows (${minimizedCount} minimized)`
              : "Bookmarks"
          }
          title="Bookmarks and minimized windows"
        >
          <TbBookmark size={19} />
          {minimizedCount > 0 && (
            // `key` : la pastille rejoue son apparition à chaque incrément,
            // ce qui la fait pulser quand une window est minimisée alors que
            // le panneau est déjà ouvert.
            <span
              key={minimizedCount}
              className="animate-node-appear absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground"
            >
              {minimizedCount}
            </span>
          )}
        </Toggle>
      </div>
    </div>
  );
}
