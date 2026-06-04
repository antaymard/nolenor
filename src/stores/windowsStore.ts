import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useCanvasStore } from "./canvasStore";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain/nodeTypes";

const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 220;
const VIEWPORT_SIZE_PADDING = 24;

type WindowSize = { width: number; height: number };
type ViewportWindowSize = {
  widthRatio: number;
  heightRatio: number;
};
type WindowSizePreset = WindowSize | ViewportWindowSize;

const DEFAULT_WINDOW_SIZE: WindowSizePreset = { width: 720, height: 520 };

const WINDOW_SIZE_BY_TYPE: Partial<Record<NodeType, WindowSizePreset>> = {
  document: { widthRatio: 1 / 2.66, heightRatio: 0.9 },
  image: { width: 600, height: 600 },
  embed: { width: 500, height: 500 },
  app: { widthRatio: 1 / 2, heightRatio: 0.9 },
  link: { width: 480, height: 360 },
  pdf: { widthRatio: 1 / 2.66, heightRatio: 0.9 },
  value: { width: 400, height: 300 },
  title: { width: 480, height: 320 },
  table: { widthRatio: 1 / 2, heightRatio: 0.9 },
};

function resolveWindowSize(preset: WindowSizePreset): WindowSize {
  if ("widthRatio" in preset && "heightRatio" in preset) {
    const maxWidth = Math.max(
      MIN_WINDOW_WIDTH,
      window.innerWidth - VIEWPORT_SIZE_PADDING * 2,
    );
    const maxHeight = Math.max(
      MIN_WINDOW_HEIGHT,
      window.innerHeight - VIEWPORT_SIZE_PADDING * 2,
    );

    return {
      width: Math.min(
        maxWidth,
        Math.max(
          MIN_WINDOW_WIDTH,
          Math.round(window.innerWidth * preset.widthRatio),
        ),
      ),
      height: Math.min(
        maxHeight,
        Math.max(
          MIN_WINDOW_HEIGHT,
          Math.round(window.innerHeight * preset.heightRatio),
        ),
      ),
    };
  }

  return preset;
}

function getDefaultWindowSize(nodeType: NodeType): WindowSize {
  const preset = WINDOW_SIZE_BY_TYPE[nodeType] ?? DEFAULT_WINDOW_SIZE;
  return resolveWindowSize(preset);
}

export const MAX_MINIMIZED_WINDOWS = 10;

const PLACEMENT_PADDING = 24;
const PLACEMENT_STEP = 40;
const SNAP_EDGE_THRESHOLD = 20;
const SNAP_PADDING = 10;

/**
 * Scans the viewport in a raster pattern to find a position for a new window
 * that doesn't overlap any existing visible window.
 * Falls back to a cascaded center position if no free spot exists.
 */
function findSmartPosition(
  existingWindows: OpenedWindow[],
  newWidth: number,
  newHeight: number,
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const maxX = Math.max(
    PLACEMENT_PADDING,
    viewportWidth - newWidth - PLACEMENT_PADDING,
  );
  const maxY = Math.max(
    PLACEMENT_PADDING,
    viewportHeight - newHeight - PLACEMENT_PADDING,
  );

  const visibleWindows = existingWindows.filter(
    (w) => w.windowState !== "minimized",
  );

  if (visibleWindows.length === 0) {
    return {
      x: Math.max(
        PLACEMENT_PADDING,
        Math.round((viewportWidth - newWidth) / 2),
      ),
      y: 20,
    };
  }

  const overlapsAny = (x: number, y: number): boolean =>
    visibleWindows.some(
      (w) =>
        !(
          x + newWidth <= w.position.x ||
          x >= w.position.x + w.width ||
          y + newHeight <= w.position.y ||
          y >= w.position.y + w.height
        ),
    );

  for (let y = PLACEMENT_PADDING; y <= maxY; y += PLACEMENT_STEP) {
    for (let x = PLACEMENT_PADDING; x <= maxX; x += PLACEMENT_STEP) {
      if (!overlapsAny(x, y)) {
        return { x, y };
      }
    }
  }

  // No free spot: cascade from center so the window is at least visible
  const cascadeOffset = (visibleWindows.length % 8) * 36;
  return {
    x: Math.min(
      Math.max(
        PLACEMENT_PADDING,
        Math.round((viewportWidth - newWidth) / 2) + cascadeOffset,
      ),
      maxX,
    ),
    y: Math.min(
      Math.max(
        PLACEMENT_PADDING,
        Math.round((viewportHeight - newHeight) / 2) + cascadeOffset,
      ),
      maxY,
    ),
  };
}

type OpenedWindowState = "normal" | "minimized" | "maximized";

type Delta = { x: number; y: number };

export type SnapSide = "left" | "right" | "top";

const FULLSCREEN_ELIGIBLE_NODE_TYPES: ReadonlySet<NodeType> = new Set([
  "document",
  "table",
  "pdf",
]);

export function isFullscreenEligible(nodeType: NodeType): boolean {
  return FULLSCREEN_ELIGIBLE_NODE_TYPES.has(nodeType);
}

export interface OpenedWindow {
  position: { x: number; y: number };
  width: number;
  height: number;
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: NodeType;
  windowState: OpenedWindowState;
  zIndex: number;
  preSnapSize?: { width: number; height: number };
}

type OpenedWindowPayload = Pick<
  OpenedWindow,
  "xyNodeId" | "nodeDataId" | "nodeType"
>;

interface WindowsStore {
  openedWindows: OpenedWindow[];
  topZIndex: number;
  dirtyNodeIds: string[];
  fullscreenNodeId: string | null;
  addDirtyNode: (xyNodeId: string) => void;
  removeDirtyNode: (xyNodeId: string) => void;
  openWindow: (payload: OpenedWindowPayload) => void;
  bringWindowToFront: (xyNodeId: string) => void;
  closeWindow: (xyNodeId: string) => void;
  closeWindowsForNodeIds: (xyNodeIds: string[]) => void;
  closeAllWindows: () => void;
  moveWindow: (xyNodeId: string, delta: Delta) => void;
  resizeWindow: (
    xyNodeId: string,
    sizeDelta: Delta,
    positionDelta?: Delta,
  ) => void;
  setWindowState: (xyNodeId: string, state: OpenedWindowState) => void;
  toggleMinimizeWindow: (xyNodeId: string) => void;
  closeAllMinimizedWindows: () => void;
  snapWindow: (xyNodeId: string, side: SnapSide) => void;
  toggleFullscreenWindow: (xyNodeId: string) => void;
  exitFullscreen: () => void;
}

export const useWindowsStore = create<WindowsStore>()(
  devtools(
    (set) => ({
      openedWindows: [],
      topZIndex: 0,
      dirtyNodeIds: [],
      fullscreenNodeId: null,
      addDirtyNode: (xyNodeId: string) => {
        set((store) => {
          if (store.dirtyNodeIds.includes(xyNodeId)) return store;
          return { dirtyNodeIds: [...store.dirtyNodeIds, xyNodeId] };
        });
      },
      removeDirtyNode: (xyNodeId: string) => {
        set((store) => {
          if (!store.dirtyNodeIds.includes(xyNodeId)) return store;
          return {
            dirtyNodeIds: store.dirtyNodeIds.filter((id) => id !== xyNodeId),
          };
        });
      },
      openWindow: ({ xyNodeId, nodeDataId, nodeType }: OpenedWindowPayload) => {
        set((store) => {
          const existingWindowIndex = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );

          // If the window is already open, just bring it to front (and unminimize if needed)
          if (existingWindowIndex >= 0) {
            const currentWindow = store.openedWindows[existingWindowIndex];

            const isAlreadyOnTopAndVisible =
              currentWindow.zIndex === store.topZIndex &&
              currentWindow.windowState !== "minimized";

            if (isAlreadyOnTopAndVisible) return store;

            const nextTopZIndex = store.topZIndex + 1;
            const updatedWindow: OpenedWindow = {
              ...currentWindow,
              zIndex: nextTopZIndex,
              windowState:
                currentWindow.windowState === "minimized"
                  ? "normal"
                  : currentWindow.windowState,
            };

            return {
              openedWindows: store.openedWindows.map((w) =>
                w.xyNodeId === xyNodeId ? updatedWindow : w,
              ),
              topZIndex: nextTopZIndex,
            };
          }

          // If the window is not open, create a new one
          const { width, height } = getDefaultWindowSize(nodeType);
          const nextTopZIndex = store.topZIndex + 1;
          const newWindow: OpenedWindow = {
            xyNodeId,
            nodeDataId,
            nodeType,
            position: findSmartPosition(store.openedWindows, width, height),
            width,
            height,
            windowState: "normal",
            zIndex: nextTopZIndex,
          };

          return {
            openedWindows: [...store.openedWindows, newWindow],
            topZIndex: nextTopZIndex,
          };
        });
      },
      bringWindowToFront: (xyNodeId: string) => {
        set((store) => {
          const existingWindowIndex = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );

          if (existingWindowIndex < 0) return store;

          const currentWindow = store.openedWindows[existingWindowIndex];
          if (currentWindow.zIndex === store.topZIndex) return store;

          const nextTopZIndex = store.topZIndex + 1;
          return {
            openedWindows: store.openedWindows.map((w) =>
              w.xyNodeId === xyNodeId
                ? { ...w, zIndex: nextTopZIndex }
                : w,
            ),
            topZIndex: nextTopZIndex,
          };
        });
      },
      closeWindow: (xyNodeId: string) => {
        useCanvasStore.getState().setFocus("canvas");
        set((store) => {
          const newOpenedWindows = store.openedWindows.filter(
            (window) => window.xyNodeId !== xyNodeId,
          );
          // Avoir re-render if no changes
          if (newOpenedWindows.length === store.openedWindows.length) {
            return store;
          }

          return {
            openedWindows: newOpenedWindows,
            dirtyNodeIds: store.dirtyNodeIds.filter((id) => id !== xyNodeId),
            fullscreenNodeId:
              store.fullscreenNodeId === xyNodeId
                ? null
                : store.fullscreenNodeId,
          };
        });
      },
      closeWindowsForNodeIds: (xyNodeIds: string[]) => {
        if (xyNodeIds.length === 0) return;

        useCanvasStore.getState().setFocus("canvas");
        set((store) => {
          const idsToClose = new Set(xyNodeIds);
          const nextOpenedWindows = store.openedWindows.filter(
            (window) => !idsToClose.has(window.xyNodeId),
          );

          if (nextOpenedWindows.length === store.openedWindows.length) {
            return store;
          }

          return {
            openedWindows: nextOpenedWindows,
            dirtyNodeIds: store.dirtyNodeIds.filter(
              (id) => !idsToClose.has(id),
            ),
            fullscreenNodeId:
              store.fullscreenNodeId && idsToClose.has(store.fullscreenNodeId)
                ? null
                : store.fullscreenNodeId,
          };
        });
      },
      closeAllWindows: () => {
        useCanvasStore.getState().setFocus("canvas");
        set(() => ({
          openedWindows: [],
          dirtyNodeIds: [],
          fullscreenNodeId: null,
        }));
      },
      moveWindow: (xyNodeId: string, delta: Delta) => {
        if (delta.x === 0 && delta.y === 0) return;

        set((store) => {
          const windowToMoveIndex = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );
          if (windowToMoveIndex < 0) return store;

          let windowToMove = store.openedWindows[windowToMoveIndex];
          if (windowToMove.windowState !== "normal") return store;

          // Auto-unsnap: restore original dimensions on first drag delta
          if (windowToMove.preSnapSize) {
            windowToMove = {
              ...windowToMove,
              width: windowToMove.preSnapSize.width,
              height: windowToMove.preSnapSize.height,
              preSnapSize: undefined,
            };
          }

          const nextPosition = {
            x: windowToMove.position.x + delta.x,
            y: Math.max(0, windowToMove.position.y + delta.y),
          };

          const nextOpenedWindows = store.openedWindows.slice();
          nextOpenedWindows[windowToMoveIndex] = {
            ...windowToMove,
            position: nextPosition,
          };
          return { openedWindows: nextOpenedWindows };
        });
      },
      resizeWindow: (
        xyNodeId: string,
        sizeDelta: Delta,
        positionDelta?: Delta,
      ) => {
        if (sizeDelta.x === 0 && sizeDelta.y === 0) return;

        set((store) => {
          const windowToResizeIndex = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );
          if (windowToResizeIndex < 0) return store;

          const windowToResize = store.openedWindows[windowToResizeIndex];
          if (windowToResize.windowState !== "normal") return store;

          const nextWidth = Math.max(
            MIN_WINDOW_WIDTH,
            windowToResize.width + sizeDelta.x,
          );
          const nextHeight = Math.max(
            MIN_WINDOW_HEIGHT,
            windowToResize.height + sizeDelta.y,
          );

          // When resizing from left/top edges, the position must shift accordingly
          const nextPosition = positionDelta
            ? {
                x: windowToResize.position.x + positionDelta.x,
                y: Math.max(0, windowToResize.position.y + positionDelta.y),
              }
            : windowToResize.position;

          if (
            nextWidth === windowToResize.width &&
            nextHeight === windowToResize.height &&
            nextPosition === windowToResize.position
          ) {
            return store;
          }

          const nextOpenedWindows = store.openedWindows.slice();
          nextOpenedWindows[windowToResizeIndex] = {
            ...windowToResize,
            width: nextWidth,
            height: nextHeight,
            position: nextPosition,
          };
          return { openedWindows: nextOpenedWindows };
        });
      },
      setWindowState: (xyNodeId: string, windowState: OpenedWindowState) => {
        set((store) => {
          const index = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );
          if (index < 0) return store;

          const current = store.openedWindows[index];
          if (current.windowState === windowState) return store;

          const nextOpenedWindows = store.openedWindows.slice();
          nextOpenedWindows[index] = { ...current, windowState };
          return { openedWindows: nextOpenedWindows };
        });
      },
      toggleMinimizeWindow: (xyNodeId: string) => {
        set((store) => {
          const index = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );
          if (index < 0) return store;

          const current = store.openedWindows[index];
          const nextWindowState: OpenedWindowState =
            current.windowState === "minimized" ? "normal" : "minimized";

          if (nextWindowState === current.windowState) return store;

          const nextOpenedWindows = store.openedWindows.slice();

          // When restoring from minimized, bring the window to the front so it
          // doesn't reappear behind windows that were focused more recently.
          if (nextWindowState === "normal") {
            const nextTopZIndex = store.topZIndex + 1;
            nextOpenedWindows[index] = {
              ...current,
              windowState: nextWindowState,
              zIndex: nextTopZIndex,
            };
            return {
              openedWindows: nextOpenedWindows,
              topZIndex: nextTopZIndex,
            };
          }

          nextOpenedWindows[index] = {
            ...current,
            windowState: nextWindowState,
          };
          return { openedWindows: nextOpenedWindows };
        });
      },
      closeAllMinimizedWindows: () => {
        set((store) => {
          const remaining = store.openedWindows.filter(
            (w) => w.windowState !== "minimized",
          );
          if (remaining.length === store.openedWindows.length) return store;
          const remainingIds = new Set(remaining.map((w) => w.xyNodeId));
          return {
            openedWindows: remaining,
            dirtyNodeIds: store.dirtyNodeIds.filter((id) =>
              remainingIds.has(id),
            ),
          };
        });
      },
      toggleFullscreenWindow: (xyNodeId: string) => {
        set((store) => {
          if (store.fullscreenNodeId === xyNodeId) {
            return { fullscreenNodeId: null };
          }
          const exists = store.openedWindows.some(
            (w) => w.xyNodeId === xyNodeId,
          );
          if (!exists) return store;
          return { fullscreenNodeId: xyNodeId };
        });
      },
      exitFullscreen: () => {
        set((store) =>
          store.fullscreenNodeId === null ? store : { fullscreenNodeId: null },
        );
      },
      snapWindow: (xyNodeId: string, side: SnapSide) => {
        set((store) => {
          const index = store.openedWindows.findIndex(
            (window) => window.xyNodeId === xyNodeId,
          );
          if (index < 0) return store;

          const current = store.openedWindows[index];

          if (side === "top") {
            if (!isFullscreenEligible(current.nodeType)) return store;
            return { fullscreenNodeId: xyNodeId };
          }

          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const snapWidth = Math.round(viewportWidth * 0.33) - SNAP_PADDING * 2;

          const nextOpenedWindows = store.openedWindows.slice();
          nextOpenedWindows[index] = {
            ...current,
            preSnapSize: current.preSnapSize ?? {
              width: current.width,
              height: current.height,
            },
            position: {
              x:
                side === "left"
                  ? SNAP_PADDING
                  : viewportWidth - snapWidth - SNAP_PADDING,
              y: SNAP_PADDING,
            },
            width: snapWidth,
            height: viewportHeight - SNAP_PADDING * 2,
            windowState: "normal",
          };
          return { openedWindows: nextOpenedWindows };
        });
      },
    }),
    { name: "windows-store" },
  ),
);

export { SNAP_EDGE_THRESHOLD };
