import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Le command center est volontairement séparé de la recherche
 * (`canvasStore.isSearchModalOpen`) : la recherche fouille le *contenu* d'un
 * canvas, le command center exécute des *actions* de l'app (switcher de canvas
 * pour l'instant) et vit donc au-dessus de la route canvas.
 */
interface CommandCenterStore {
  isOpen: boolean;
  query: string;

  open: (query?: string) => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
}

export const useCommandCenterStore = create<CommandCenterStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      query: "",

      // À l'ouverture on repart d'une requête vide : contrairement à la
      // recherche, le command center n'a pas vocation à retenir la dernière
      // commande tapée.
      open: (query) => {
        set({ isOpen: true, query: query ?? "" });
      },
      close: () => {
        set({ isOpen: false });
      },
      toggle: () => {
        set((state) =>
          state.isOpen ? { isOpen: false } : { isOpen: true, query: "" },
        );
      },
      setQuery: (query) => {
        set({ query });
      },
    }),
    { name: "command-center-store" },
  ),
);
