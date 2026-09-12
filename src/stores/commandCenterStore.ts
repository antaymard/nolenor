import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Le command center est volontairement séparé de la recherche
 * (`canvasStore.isSearchModalOpen`) : la recherche fouille le *contenu* d'un
 * canvas, le command center exécute des *actions* de l'app (switcher de canvas
 * pour l'instant) et vit donc au-dessus de la route canvas.
 */
/**
 * Le contexte de recherche courant.
 *
 * `all` cherche dans les actions de l'app (les canvas, aujourd'hui) ; `go`
 * cherche dans les repères de navigation du canvas courant. On y entre en
 * tapant « go » + espace, on en sort par Backspace sur une requête vide — le
 * préfixe devient alors une pastille, il ne reste pas dans la saisie.
 */
export type CommandCenterMode = "all" | "go";

interface CommandCenterStore {
  isOpen: boolean;
  query: string;
  mode: CommandCenterMode;

  open: (query?: string) => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setMode: (mode: CommandCenterMode) => void;
}

export const useCommandCenterStore = create<CommandCenterStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      query: "",
      mode: "all",

      // À l'ouverture on repart d'une requête vide : contrairement à la
      // recherche, le command center n'a pas vocation à retenir la dernière
      // commande tapée. Le mode repart à `all` à l'ouverture *et* à la
      // fermeture, pour la même raison : rouvrir la palette ne doit pas
      // retomber dans une recherche de repères dont plus rien ne rappellerait
      // le contexte.
      open: (query) => {
        set({ isOpen: true, query: query ?? "", mode: "all" });
      },
      close: () => {
        set({ isOpen: false, mode: "all" });
      },
      toggle: () => {
        set((state) =>
          state.isOpen
            ? { isOpen: false, mode: "all" }
            : { isOpen: true, query: "", mode: "all" },
        );
      },
      setQuery: (query) => {
        set({ query });
      },
      setMode: (mode) => {
        set({ mode });
      },
    }),
    { name: "command-center-store" },
  ),
);
