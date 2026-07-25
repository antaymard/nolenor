import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { CanvasPermission } from "@/../convex/lib/auth";

type CanvasInStore = Omit<Doc<"canvases">, "nodes" | "edges"> & {
  _permission: CanvasPermission;
};

type Status = "idle" | "unsynced" | "saving" | "saved" | "error";
/**
 * Where keyboard input is currently going. `richtext-editor` covers both
 * rich-text editors (Plate.js document nodes and BlockNote nodes) — the
 * distinction that matters to callers is "a text editor has focus", not which
 * library renders it.
 */
type Focus = "canvas" | "richtext-editor";
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
