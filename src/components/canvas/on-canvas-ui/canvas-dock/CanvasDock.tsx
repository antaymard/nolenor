import { useEffect, useMemo, useRef, useState } from "react";
import { TbBookmark, TbLayoutBottombarCollapse } from "react-icons/tb";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import {
  isBookmarksDockOpen,
  setBookmarksDockOpen,
} from "@/lib/canvasDockStorage";
import { useWindowsStore } from "@/stores/windowsStore";
import DockBookmarksList from "./DockBookmarksList";
import DockMinimizedList from "./DockMinimizedList";

type DockTab = "bookmarks" | "minimized";

/**
 * Le dock du coin bas-droite : deux boutons, une seule liste dépliée à la fois.
 *
 * Repères et windows minimisées partagent le coin sans mélanger leurs listes —
 * elles n'ont ni la même durée de vie (les uns sont durables et ordonnés à la
 * main, les autres sont de l'état de session) ni les mêmes actions. Deux
 * onglets, donc, et un accordéon : ouvrir l'un referme l'autre, recliquer
 * l'actif referme tout.
 *
 * La liste pop au-dessus des boutons, alignée à droite, avec l'origine au coin
 * du bouton qui l'a ouverte — le geste d'un dossier du Dock macOS. Même
 * montage que `NoleCanvasPanel` en bas à gauche : un wrapper `relative`, la
 * liste en `absolute`, l'îlot de boutons en flux dessous.
 */
export default function CanvasDock() {
  const [openTab, setOpenTab] = useState<DockTab | null>(() =>
    isBookmarksDockOpen() ? "bookmarks" : null,
  );

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
    // Minimiser une window déplie sa liste — c'est ce qui dit où la window
    // est partie. Mais pas si une liste est déjà ouverte : voler la liste que
    // l'utilisateur est en train de lire coûte plus que ça ne rapporte, et la
    // window part visiblement vers le dock pendant que le compteur monte.
    setOpenTab((current) => (grew && current === null ? "minimized" : current));
  }, [minimizedCount]);

  useEffect(() => {
    // La dernière window minimisée vient d'être fermée : son bouton disparaît,
    // le panneau ne peut pas rester ouvert sur une liste qui n'existe plus.
    if (minimizedCount === 0) {
      setOpenTab((current) => (current === "minimized" ? null : current));
    }
  }, [minimizedCount]);

  function handleTabChange(next: string) {
    // Radix rend `""` quand on reclique l'onglet actif. `CanvasToolbar` avale
    // ce cas (le canvas doit toujours être dans un mode) ; ici on veut
    // exactement l'inverse — il referme le panneau, gratuitement.
    const tab = next === "bookmarks" || next === "minimized" ? next : null;
    setOpenTab(tab);
    // Seul l'état des repères est retenu d'une session à l'autre : rouvrir
    // l'onglet des minimisées au chargement, quand aucune window ne l'est,
    // n'aurait aucun sens.
    setBookmarksDockOpen(tab === "bookmarks");
  }

  return (
    <div className="relative">
      {openTab !== null && (
        // `bottom-12.5` : la valeur de `NoleCanvasPanel`, pour la même raison —
        // les boutons font h-10 et `canvas-ui-container` ajoute son p-1, 50px
        // dégagent la rangée. `right-0` + origine au coin bas-droit : la liste
        // grandit DEPUIS le bouton qui l'a ouverte.
        //
        // `key` : changer d'onglet remonte le panneau, donc l'animation se
        // rejoue — un dossier du Dock qui se referme, l'autre qui s'ouvre.
        <div
          key={openTab}
          className="absolute bottom-12.5 right-0 w-72 origin-bottom-right animate-appear-zoom"
        >
          {openTab === "bookmarks" ? (
            <DockBookmarksList />
          ) : (
            <DockMinimizedList windows={minimizedWindows} />
          )}
        </div>
      )}

      <div className="canvas-ui-container animate-appear-up px-0!">
        <ToggleGroup
          type="single"
          value={openTab ?? ""}
          onValueChange={handleTabChange}
          aria-label="Canvas dock"
        >
          <ToggleGroupItem
            value="bookmarks"
            className="h-10 w-10 rounded-lg p-0"
            aria-label="Bookmarks"
            title="Bookmarks: jump to a saved spot"
          >
            <TbBookmark size={19} />
          </ToggleGroupItem>
          {minimizedCount > 0 && (
            // N'existe que s'il y a quelque chose dedans — comme la pile
            // qu'il remplace, qui ne se rendait pas à vide. À zéro window, le
            // dock est un bouton, pas un bouton et un fantôme désactivé.
            <ToggleGroupItem
              value="minimized"
              className="relative h-10 w-10 rounded-lg p-0"
              aria-label={`Minimized windows (${minimizedCount})`}
              title="Minimized windows"
            >
              <TbLayoutBottombarCollapse size={19} />
              {/* `key` : la pastille rejoue son apparition à chaque
                  incrément, ce qui la fait pulser quand une window est
                  minimisée sans que la liste s'ouvre. */}
              <span
                key={minimizedCount}
                className="animate-node-appear absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground"
              >
                {minimizedCount}
              </span>
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </div>
    </div>
  );
}
