import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Canvas } from "@/types";
import type { CanvasNode } from "@/types/convex";
import { useShallow } from "zustand/react/shallow";

export type NolePanelLayout = "minimized" | "expanded";

interface NoleStore {
  canvas: Omit<Canvas, "nodes" | "edges"> | null;
  panelLayout: NolePanelLayout;
  activeThreadId: string | null;
  attachedNodes: CanvasNode[];
  attachedPosition: { x: number; y: number } | null;

  setCanvas: (canvas: Canvas) => void;
  setPanelLayout: (layout: NolePanelLayout) => void;
  togglePanelLayout: () => void;
  // null → on retombe sur le thread initial résolu par useNoleThread.
  setActiveThreadId: (id: string | null) => void;
  addAttachments: (
    attachments: { nodes?: CanvasNode[]; position?: { x: number; y: number } },
    removeIfPresent?: boolean,
  ) => void;
  removeAttachments: (
    attachments: {
      type: "node" | "position";
      ids?: string[]; // Null if position
    }[],
  ) => void;
  resetAttachments: () => void;
}

export const useNoleStore = create<NoleStore>()(
  devtools(
    (set, get) => ({
      canvas: null,
      panelLayout: "minimized",
      activeThreadId: null,
      attachedNodes: [],
      attachedPosition: null,

      setCanvas: (canvas: Canvas) => {
        set({ canvas });
      },

      setPanelLayout: (layout: NolePanelLayout) => {
        set({ panelLayout: layout });
      },

      setActiveThreadId: (id: string | null) => {
        set({ activeThreadId: id });
      },

      togglePanelLayout: () => {
        set((state) => ({
          panelLayout:
            state.panelLayout === "minimized" ? "expanded" : "minimized",
        }));
      },

      addAttachments: (attachments, removeIfPresent = false) => {
        const { attachedNodes } = get();
        // eslint-disable-next-line prefer-const
        let newAttachedNodes = [...attachedNodes];

        if (attachments.nodes) {
          for (const node of attachments.nodes) {
            const existingIndex = newAttachedNodes.findIndex(
              (n) => n.id === node.id,
            );
            if (removeIfPresent && existingIndex !== -1) {
              newAttachedNodes.splice(existingIndex, 1);
            } else if (existingIndex === -1) {
              newAttachedNodes.push(node);
            }
          }
        }

        set({
          attachedNodes: newAttachedNodes,
          ...(attachments.position !== undefined && {
            attachedPosition: attachments.position,
          }),
        });
      },

      removeAttachments: (attachments) => {
        let newAttachedNodes = [...get().attachedNodes];
        let newAttachedPosition = get().attachedPosition;

        for (const attachment of attachments) {
          if (attachment.type === "node" && attachment.ids) {
            newAttachedNodes = newAttachedNodes.filter(
              (node) => !attachment.ids!.includes(node.id),
            );
          } else if (attachment.type === "position") {
            newAttachedPosition = null;
          }
        }

        set({
          attachedNodes: newAttachedNodes,
          attachedPosition: newAttachedPosition,
        });
      },
      resetAttachments: () => {
        set({ attachedNodes: [], attachedPosition: null });
      },
    }),
    { name: "canvas-store" },
  ),
);

/**
 * Optimized hook to check if a node is attached.
 * Returns a stable boolean - only re-renders when the attachment status changes.
 */
export const useIsNodeAttached = (nodeId: string): boolean => {
  return useNoleStore(
    useShallow((state) => state.attachedNodes.some((n) => n.id === nodeId)),
  );
};

export const useIsNolePanelExpanded = (): boolean => {
  return useNoleStore(useShallow((state) => state.panelLayout === "expanded"));
};
