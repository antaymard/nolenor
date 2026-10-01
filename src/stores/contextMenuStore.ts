import { create } from "zustand";
import type { ContextMenuState } from "@/types/ui/context-menu.types";

interface ContextMenuStore {
  contextMenu: ContextMenuState;
  setContextMenu: (contextMenu: ContextMenuState) => void;
}

/**
 * Le menu contextuel est ouvert depuis le canvas (clic droit React Flow) comme
 * depuis le header d'une window (`WindowFrame`) : un seul état partagé, posé
 * ici, pour que les deux surfaces ouvrent le même menu (`NodeContextMenu`) et
 * qu'une seule instance soit rendue (`CanvasFlow`).
 */
export const useContextMenuStore = create<ContextMenuStore>()((set) => ({
  contextMenu: { type: null, position: { x: 0, y: 0 }, element: null },
  setContextMenu: (contextMenu) => set({ contextMenu }),
}));
