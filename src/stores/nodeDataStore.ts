import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Doc, Id } from "@/../convex/_generated/dataModel";

interface NodeDataStore {
  // Map pour O(1) lookup
  nodeDatas: Map<Id<"nodeDatas">, Doc<"nodeDatas">>;

  /**
   * nodeDatas factices des créations local-first en vol, keyés par le llmId
   * du node (`_id` = `pending_<llmId>`). Ils ne sont pas écrits dans
   * `nodeDatas` directement : c'est la synchro (`useCanvasBootstrap`) qui les y
   * verse, et qui les relâche quand le vrai doc est chargé. Une création qui
   * échoue les retire elle-même (`removePendingNodeData`).
   */
  pendingNodeDatas: Map<string, Doc<"nodeDatas">>;

  // Actions
  setNodeDatas: (nodeDatas: Doc<"nodeDatas">[]) => void;
  getNodeData: (id: Id<"nodeDatas">) => Doc<"nodeDatas"> | undefined;
  updateNodeData: (
    id: Id<"nodeDatas">,
    values: Record<string, unknown>,
  ) => void;
  setNodeData: (id: Id<"nodeDatas">, nodeData: Doc<"nodeDatas">) => void;
  addPendingNodeData: (nodeId: string, nodeData: Doc<"nodeDatas">) => void;
  removePendingNodeData: (nodeId: string) => void;
  clear: () => void;
}

export const useNodeDataStore = create<NodeDataStore>()(
  devtools(
    (set, get) => ({
      nodeDatas: new Map(),
      pendingNodeDatas: new Map(),

      setNodeDatas: (nodeDatas) => {
        set((state) => {
          const newMap = new Map(state.nodeDatas);
          let changed = false;
          const incomingIds = new Set<Id<"nodeDatas">>();

          for (const nd of nodeDatas) {
            incomingIds.add(nd._id);
            const existing = newMap.get(nd._id);
            if (!existing || existing.updatedAt !== nd.updatedAt) {
              newMap.set(nd._id, nd);
              changed = true;
            }
          }

          for (const key of newMap.keys()) {
            if (!incomingIds.has(key)) {
              newMap.delete(key);
              changed = true;
            }
          }

          return changed ? { nodeDatas: newMap } : state;
        });
      },

      getNodeData: (id) => get().nodeDatas.get(id),

      updateNodeData: (id, values) => {
        set((state) => {
          const existing = state.nodeDatas.get(id);
          if (!existing) return state;

          const newMap = new Map(state.nodeDatas);
          newMap.set(id, {
            ...existing,
            values: { ...existing.values, ...values },
          });
          return { nodeDatas: newMap };
        });
      },

      setNodeData: (id, nodeData) => {
        set((state) => {
          const newMap = new Map(state.nodeDatas);
          newMap.set(id, nodeData);
          return { nodeDatas: newMap };
        });
      },

      addPendingNodeData: (nodeId, nodeData) => {
        set((state) => {
          const next = new Map(state.pendingNodeDatas);
          next.set(nodeId, nodeData);
          return { pendingNodeDatas: next };
        });
      },

      removePendingNodeData: (nodeId) => {
        set((state) => {
          if (!state.pendingNodeDatas.has(nodeId)) return state;
          const next = new Map(state.pendingNodeDatas);
          next.delete(nodeId);
          return { pendingNodeDatas: next };
        });
      },

      clear: () => set({ nodeDatas: new Map(), pendingNodeDatas: new Map() }),
    }),
    { name: "nodeData-store" },
  ),
);
