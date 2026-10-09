import { create } from "zustand";
import type { SnapGuides } from "@/lib/snapGuides";

/**
 * Les guides d'alignement du drag en cours (cf. `useNodeSnapping`), lus par
 * `SnapGuidesOverlay`.
 *
 * Un store et pas un état dans `CanvasFlow`, pour la même raison que
 * `frameHoverStore` : les guides changent à chaque frame du geste, et seul le
 * calque qui les dessine doit re-rendre à ce rythme.
 *
 * Éphémère : vidé au relâcher.
 */
interface SnapGuidesStore {
  guides: SnapGuides | null;
  /** Empreinte des guides affichés, pour ne pas notifier à l'identique. */
  key: string;
  setGuides: (guides: SnapGuides | null) => void;
}

export const useSnapGuidesStore = create<SnapGuidesStore>()((set) => ({
  guides: null,
  key: "",
  setGuides: (guides) =>
    set((state) => {
      const empty =
        !guides ||
        (guides.alignments.length === 0 && guides.spacings.length === 0);
      const key = empty ? "" : JSON.stringify(guides);
      if (key === state.key) return state;
      return { guides: empty ? null : guides, key };
    }),
}));
