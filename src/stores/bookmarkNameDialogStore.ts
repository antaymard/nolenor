import { create } from "zustand";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";

/**
 * Le dialogue de nommage d'un repère, ouvert depuis un menu contextuel.
 *
 * Un store et pas un `useState` dans le menu : le clic sur l'item ferme le
 * menu, et `CanvasFlow` le démonte aussitôt (`{contextMenu.type && …}`) — un
 * état tenu par le menu mourait avec lui, et le dialogue avec, avant même
 * d'avoir été vu. Le menu ne fait donc qu'annoncer la cible ;
 * `BookmarkNameDialogHost`, monté par `CanvasFlow` hors du menu, rend le
 * dialogue et crée le repère.
 */
interface BookmarkNameDialogStore {
  /**
   * La cible à nommer, figée au clic et pas relue au submit : la sélection
   * React Flow peut changer pendant que le dialogue est ouvert, le repère doit
   * viser ce qu'on visait.
   */
  pendingTarget: BookmarkTarget | null;
  /**
   * Séparé de `pendingTarget` : la cible survit à la fermeture le temps de
   * l'animation de sortie, sinon le dialogue flasherait sur la copie du repère
   * précédent pendant qu'il se referme.
   */
  open: boolean;
  startBookmark: (target: BookmarkTarget) => void;
  close: () => void;
}

export const useBookmarkNameDialogStore = create<BookmarkNameDialogStore>()(
  (set) => ({
    pendingTarget: null,
    open: false,
    startBookmark: (target) => set({ pendingTarget: target, open: true }),
    close: () => set({ open: false }),
  }),
);
