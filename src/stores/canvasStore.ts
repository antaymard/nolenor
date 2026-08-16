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
type Tool = "edit" | "slides" | "draw" | "hotspots";

interface CanvasStore {
  canvas: CanvasInStore | null;
  status: Status;
  focus: Focus;
  tool: Tool;
  isSearchModalOpen: boolean;
  searchQuery: string;

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
      tool: "edit",
      isSearchModalOpen: false,
      searchQuery: "",

      setTool: (tool) => {
        set({ tool });
      },
      setFocus: (focus) => {
        set({ focus });
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
        set((state) => ({
          isSearchModalOpen: true,
          searchQuery: query ?? state.searchQuery,
        }));
      },
      closeSearchModal: () => {
        set({ isSearchModalOpen: false });
      },
      toggleSearchModal: () => {
        set((state) => ({ isSearchModalOpen: !state.isSearchModalOpen }));
      },
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },
      resetSearchModal: () => {
        set({ isSearchModalOpen: false, searchQuery: "" });
      },
    }),
    { name: "canvas-store" },
  ),
);
