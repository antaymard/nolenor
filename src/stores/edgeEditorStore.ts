import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Tracks which edge is currently in label-edit mode.
 *
 * Double-click on an edge is handled at the `<ReactFlow>` level via
 * `onEdgeDoubleClick`, which sets `editingEdgeId`. The matching
 * `CustomEdge` reads this store to show its inline `<EdgeLabelEditor />`.
 */
interface EdgeEditorStore {
  editingEdgeId: string | null;
  setEditingEdgeId: (id: string | null) => void;
}

export const useEdgeEditorStore = create<EdgeEditorStore>()(
  devtools((set) => ({
    editingEdgeId: null,
    setEditingEdgeId: (id) => set({ editingEdgeId: id }),
  })),
);
