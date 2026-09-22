import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";

/**
 * Le command center est volontairement séparé de la recherche
 * (`canvasStore.isSearchModalOpen`) : la recherche fouille le *contenu* d'un
 * canvas, le command center exécute des *actions* de l'app (switcher de canvas,
 * rejoindre un repère) et vit donc au-dessus de la route canvas.
 */

/**
 * Emmener la vue quelque part sur le canvas ouvert. Rend `false` quand la
 * cible n'existe plus.
 */
type CanvasNavigator = (target: BookmarkTarget) => boolean;

interface CommandCenterStore {
  isOpen: boolean;
  query: string;
  /**
   * Le pont vers le canvas ouvert, `null` quand il n'y en a pas.
   *
   * Le command center est monté à la racine (`routes/__root.tsx`), donc HORS
   * du `ReactFlowProvider` : il ne peut appeler ni `useReactFlow` ni
   * `useGoToBookmark`. Plutôt que de lui donner une seconde source de
   * commandes vivant, elle, sous le provider, on lui injecte la seule capacité
   * qui lui manque — le canvas l'enregistre au montage et la retire au
   * démontage, et sa présence dit à elle seule « un canvas est ouvert ».
   */
  canvasNavigator: CanvasNavigator | null;

  open: (query?: string) => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setCanvasNavigator: (navigator: CanvasNavigator | null) => void;
}

export const useCommandCenterStore = create<CommandCenterStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      query: "",
      canvasNavigator: null,

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
      setCanvasNavigator: (navigator) => {
        set({ canvasNavigator: navigator });
      },
    }),
    { name: "command-center-store" },
  ),
);
