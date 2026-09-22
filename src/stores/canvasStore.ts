import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { CanvasPermission } from "@/../convex/lib/auth";

type CanvasInStore = Omit<Doc<"canvases">, "nodes" | "edges"> & {
  _permission: CanvasPermission;
};

type Status = "idle" | "unsynced" | "saving" | "saved" | "error";
/**
 * Where keyboard input is currently going. `richtext-editor` covers the
 * BlockNote surfaces — what matters to callers is "a text editor has focus",
 * not which library renders it. `modal` covers full-screen overlays that own
 * the keyboard (template editor).
 *
 * Callers must test `focus === "canvas"` to enable a canvas behaviour, never
 * `focus !== "richtext-editor"`: a new value must default to "the canvas is
 * NOT driving", otherwise adding one silently re-enables canvas shortcuts
 * under every new surface.
 */
type Focus = "canvas" | "richtext-editor" | "modal";
/**
 * L'outil actif du canvas. Trois modes exclusifs, comme dans n'importe quel
 * éditeur de canvas :
 *
 * - `select` : le comportement normal — lasso au clic gauche, drag des nodes,
 *   sélection. Le clic molette pan.
 * - `hand` : le clic gauche pan le viewport. Plus rien ne se déplace, mais
 *   tout le reste répond encore : sélection au clic, création d'edges,
 *   double-clic, clic droit.
 * - `frame` : la souris trace le rectangle d'une nouvelle frame, et repasse en
 *   `select` dès le tracé terminé ou annulé.
 *
 * `frame` est un mode de passage — rien ne doit pouvoir y rester coincé —
 * là où `select` et `hand` sont deux façons durables de tenir le canvas.
 */
type Tool = "select" | "hand" | "frame";

/**
 * Fenêtre de rétention de la query de la search modale : si on la rouvre
 * dans ce délai après l'avoir fermée, on restaure la dernière recherche ;
 * au-delà, on repart d'une query vide (comme le command center, qui vide
 * systématiquement la sienne).
 */
const SEARCH_QUERY_RETENTION_MS = 3 * 60 * 1000;

interface CanvasStore {
  canvas: CanvasInStore | null;
  status: Status;
  focus: Focus;
  tool: Tool;
  isSearchModalOpen: boolean;
  searchQuery: string;
  /** Instant (`Date.now()`) de la dernière fermeture de la search modale. */
  searchQueryClosedAt: number | null;

  setCanvas: (canvas: CanvasInStore | null) => void;
  setStatus: (status: Status) => void;
  /**
   * Nombre d'écritures serveur en vol. Les mutations canvas partent en rafale
   * (un drag produit une écriture par frame throttlée), donc le statut ne peut
   * pas être piloté par un simple booléen : il faut attendre que la dernière
   * soit retombée avant d'annoncer "saved".
   */
  pendingWrites: number;
  beginSync: () => void;
  endSync: (outcome: "ok" | "error") => void;
  /** Remise à zéro au changement de canvas : le compteur ne doit pas fuiter. */
  resetSync: () => void;
  setFocus: (focus: Focus) => void;
  /**
   * Rend le clavier au canvas, mais seulement si `owner` le détient encore.
   *
   * À appeler au démontage d'une surface qui avait pris le focus. `blur` ne se
   * déclenche PAS quand un élément focalisé est démonté (node supprimé, window
   * fermée, changement de canvas) : sans ça le store reste bloqué sur
   * `richtext-editor` et tous les raccourcis du canvas meurent en silence,
   * jusqu'à ce que l'utilisateur pense à cliquer dans puis hors d'un autre
   * éditeur.
   *
   * Conditionné à `owner` pour ne pas voler le clavier à qui l'a pris depuis :
   * une modale ouverte par-dessus, typiquement.
   */
  releaseFocus: (owner: Focus) => void;
  setTool: (tool: Tool) => void;
  openSearchModal: (query?: string) => void;
  closeSearchModal: () => void;
  toggleSearchModal: () => void;
  setSearchQuery: (query: string) => void;
  resetSearchModal: () => void;
}

export const useCanvasStore = create<CanvasStore>()(
  devtools(
    (set) => ({
      canvas: null,
      status: "idle",
      pendingWrites: 0,
      focus: "canvas",
      tool: "select",
      isSearchModalOpen: false,
      searchQuery: "",
      searchQueryClosedAt: null,

      setTool: (tool) => {
        set({ tool });
      },
      setFocus: (focus) => {
        set({ focus });
      },
      releaseFocus: (owner) => {
        set((state) => (state.focus === owner ? { focus: "canvas" } : state));
      },
      setCanvas: (canvas) => {
        set({ canvas });
      },
      setStatus: (status) => {
        set({ status });
      },
      beginSync: () => {
        set((state) => ({
          pendingWrites: state.pendingWrites + 1,
          status: "saving",
        }));
      },
      endSync: (outcome) => {
        set((state) => {
          const pendingWrites = Math.max(0, state.pendingWrites - 1);
          if (outcome === "error") return { pendingWrites, status: "error" };
          // Une écriture réussie ne "répare" pas l'affichage tant que d'autres
          // sont en vol : on n'annonce "saved" qu'une fois la file vide.
          if (pendingWrites > 0) return { pendingWrites };
          return { pendingWrites, status: "saved" };
        });
      },
      resetSync: () => {
        set({ pendingWrites: 0, status: "idle" });
      },
      openSearchModal: (query) => {
        set((state) => {
          if (query !== undefined) {
            return { isSearchModalOpen: true, searchQuery: query };
          }
          const withinRetention =
            state.searchQueryClosedAt !== null &&
            Date.now() - state.searchQueryClosedAt < SEARCH_QUERY_RETENTION_MS;
          return {
            isSearchModalOpen: true,
            searchQuery: withinRetention ? state.searchQuery : "",
          };
        });
      },
      closeSearchModal: () => {
        set({ isSearchModalOpen: false, searchQueryClosedAt: Date.now() });
      },
      toggleSearchModal: () => {
        set((state) => {
          const nextOpen = !state.isSearchModalOpen;
          if (!nextOpen) {
            return {
              isSearchModalOpen: false,
              searchQueryClosedAt: Date.now(),
            };
          }
          const withinRetention =
            state.searchQueryClosedAt !== null &&
            Date.now() - state.searchQueryClosedAt < SEARCH_QUERY_RETENTION_MS;
          return {
            isSearchModalOpen: true,
            searchQuery: withinRetention ? state.searchQuery : "",
          };
        });
      },
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },
      resetSearchModal: () => {
        set({
          isSearchModalOpen: false,
          searchQuery: "",
          searchQueryClosedAt: null,
        });
      },
    }),
    { name: "canvas-store" },
  ),
);
