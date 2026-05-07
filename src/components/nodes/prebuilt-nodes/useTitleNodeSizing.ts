import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { useParams } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";

const MIN_DELTA = 0.5;
const PERSIST_DEBOUNCE_MS = 120;

function logTitleSizing(nodeId: string, event: string, payload?: unknown) {
  if (payload !== undefined) {
    console.log(`[TitleNodeSizing][${nodeId}] ${event}`, payload);
    return;
  }
  console.log(`[TitleNodeSizing][${nodeId}] ${event}`);
}

// Tracks nodes with an in-flight auto-size debounce so useCanvasNodes can
// skip the redundant dimension mutation that would otherwise fire via the
// ResizeObserver path for the same change.
export const pendingAutoSizeIds = new Set<string>();

interface UseTitleNodeSizingArgs {
  nodeId: string;
  ghostRef: RefObject<HTMLElement | null>;
  /** False while node data values are still loading; skips sizing side effects. */
  isHydrated?: boolean;
  /** "auto": width follows text on a single line; "manual": width fixed, height adapts to wrapped text */
  sizingMode: "auto" | "manual";
  /** Current node width (px) coming from React Flow / Convex */
  currentWidth: number;
  /** Current node height (px) coming from React Flow / Convex */
  currentHeight: number;
  /** Current text — used to retrigger measurement */
  text: string;
  /** Current heading level — used to retrigger measurement */
  level: string;
  /** Live text being typed (uncontrolled). When set, measure from this instead of `text`. */
  liveText?: string;
  /**
   * When true, measurement still applies dims locally (so the node grows in
   * sync with typing) but does not persist them to Convex. The caller is
   * expected to flush via `flushPendingPersist` on save.
   */
  isEditing?: boolean;
  /** Padding (px) inside the NodeFrame around the editable element (left + right) */
  paddingX?: number;
  /** Padding (px) inside the NodeFrame around the editable element (top + bottom) */
  paddingY?: number;
  /** Border (px) of the NodeFrame, both horizontal and vertical sides combined. */
  borderTotal?: number;
}

/**
 * Drives the auto/manual sizing of a TitleNode by measuring a hidden ghost
 * element and persisting dimensions through the canvasNodes mutation
 * (which already does an optimistic update so React Flow reflects the change
 * within a frame).
 */
export function useTitleNodeSizing({
  nodeId,
  ghostRef,
  isHydrated = true,
  sizingMode,
  currentWidth,
  currentHeight,
  text,
  level,
  liveText,
  isEditing = false,
  paddingX = 16, // matches "px-2" (8 each side)
  paddingY = 8, // matches "p-1" (4 top + 4 bottom)
  borderTotal = 2, // 1px on each side
}: UseTitleNodeSizingArgs) {
  const { canvasId } = useParams({ from: "/canvas/$canvasId" }) as {
    canvasId: Id<"canvases">;
  };
  const { setNodes } = useReactFlow();
  const updateDimensions = useMutation(
    api.canvasNodes.updatePositionOrDimensions,
  ).withOptimisticUpdate(
    (localStore, { canvasId: targetCanvasId, nodeChanges }) => {
      const existing = localStore.getQuery(api.canvases.readCanvas, {
        canvasId: targetCanvasId,
      });
      if (!existing || !existing.nodes) return;
      const changeById = new Map<string, { width: number; height: number }>();
      for (const change of nodeChanges as Array<{
        id: string;
        dimensions?: { width: number; height: number };
      }>) {
        if (change.dimensions) {
          changeById.set(change.id, change.dimensions);
        }
      }
      if (changeById.size === 0) return;
      localStore.setQuery(
        api.canvases.readCanvas,
        { canvasId: targetCanvasId },
        {
          ...existing,
          nodes: existing.nodes.map((node) => {
            const dim = changeById.get(node.id);
            if (!dim) return node;
            return { ...node, width: dim.width, height: dim.height };
          }),
        },
      );
    },
  );

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDimensions = useRef<{ width: number; height: number } | null>(
    null,
  );
  // Snapshot of the latest dims we applied locally. Used by
  // `flushPendingPersist` so the caller (TitleNode.exitEditAndSave) can persist
  // the final size at save time, since persistDimensions is skipped while
  // isEditing is true.
  const latestAppliedDimsRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  // Snapshot of the inputs and dimensions we last reconciled. The first
  // hydrated run records these and skips measuring — the persisted dims in
  // Convex are the source of truth on load. After that, we only re-measure
  // when something we actually care about changes: a text edit, a level
  // change, a sizing-mode toggle, or (in manual mode) an external dimension
  // override (user resize, or React Flow's resizer dispatching a stale
  // height on release). After applying new dims locally we record them here
  // so the post-apply re-render doesn't look like an external override.
  // This kills the post-load loop where pre-hydration measurements (text=""
  // → tiny size) overwrote saved dims, then post-hydration measurements
  // rewrote them back.
  const lastMeasuredRef = useRef<{
    text: string;
    level: string;
    sizingMode: "auto" | "manual";
    currentWidth: number;
    currentHeight: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      pendingAutoSizeIds.delete(nodeId);
      logTitleSizing(nodeId, "cleanup");
    };
  }, [nodeId]);

  const persistDimensions = (width: number, height: number) => {
    pendingAutoSizeIds.add(nodeId);
    pendingDimensions.current = { width, height };
    logTitleSizing(nodeId, "persist-scheduled", {
      width,
      height,
      debounceMs: PERSIST_DEBOUNCE_MS,
    });
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      pendingAutoSizeIds.delete(nodeId);
      const dim = pendingDimensions.current;
      pendingDimensions.current = null;
      debounceTimer.current = null;
      if (!dim) return;
      logTitleSizing(nodeId, "persist-commit-mutation", {
        width: dim.width,
        height: dim.height,
      });
      void updateDimensions({
        canvasId,
        nodeChanges: [
          {
            id: nodeId,
            dimensions: dim,
          },
        ],
      });
    }, PERSIST_DEBOUNCE_MS);
  };

  // Apply locally first so the React Flow node grows in the same frame as the
  // user's input. The optimistic mutation will catch up shortly after.
  const applyLocalDimensions = (width: number, height: number) => {
    latestAppliedDimsRef.current = { width, height };
    logTitleSizing(nodeId, "apply-local-dimensions", {
      width,
      height,
    });
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              width,
              height,
              measured: { width, height },
            }
          : node,
      ),
    );
  };

  // Flush the latest locally-applied dims to Convex immediately (no debounce).
  // Called by the caller on save: persistDimensions is skipped while
  // isEditing is true, and the post-save re-render arrives with text already
  // synced via Zustand's optimistic update — at which point lastMeasuredRef
  // matches the new text and the measure block would skip persisting too.
  const flushPendingPersist = useCallback(() => {
    const dims = latestAppliedDimsRef.current;
    if (!dims) {
      logTitleSizing(nodeId, "flush-skipped-no-dims");
      return;
    }
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pendingDimensions.current = null;
    pendingAutoSizeIds.delete(nodeId);
    logTitleSizing(nodeId, "flush-commit-mutation", dims);
    void updateDimensions({
      canvasId,
      nodeChanges: [
        {
          id: nodeId,
          dimensions: dims,
        },
      ],
    });
  }, [canvasId, nodeId, updateDimensions]);

  // Measure & sync whenever the relevant inputs change.
  useLayoutEffect(() => {
    if (!isHydrated) {
      logTitleSizing(nodeId, "measure-skipped-not-hydrated");
      return;
    }

    const ghost = ghostRef.current;
    if (!ghost) return;

    const effectiveText = liveText ?? text;

    if (lastMeasuredRef.current === null) {
      // First run after hydration: trust the persisted dimensions and just
      // record the baseline. Without this, a node whose nodeData hydrates
      // after the canvas dims have rendered would re-measure against the
      // pre-hydration empty placeholder and persist a wrong size, then
      // re-measure once the real text arrives and persist again.
      lastMeasuredRef.current = {
        text: effectiveText,
        level,
        sizingMode,
        currentWidth,
        currentHeight,
      };
      logTitleSizing(nodeId, "measure-skipped-initial-hydration", {
        text: effectiveText,
        level,
        sizingMode,
        currentWidth,
        currentHeight,
      });
      return;
    }

    const last = lastMeasuredRef.current;
    const textChanged = last.text !== effectiveText;
    const levelChanged = last.level !== level;
    const sizingModeChanged = last.sizingMode !== sizingMode;
    // Width/height changes are only relevant in manual mode. In auto mode
    // they're our output: React Flow / Convex echoing them back must not
    // retrigger us. In manual mode an external override can come from a
    // user resize (currentWidth) or React Flow's resizer dispatching a
    // stale height on release (currentHeight) — both warrant a re-measure.
    const manualDimsChanged =
      sizingMode === "manual" &&
      (Math.abs(last.currentWidth - currentWidth) > MIN_DELTA ||
        Math.abs(last.currentHeight - currentHeight) > MIN_DELTA);

    if (
      !textChanged &&
      !levelChanged &&
      !sizingModeChanged &&
      !manualDimsChanged
    ) {
      logTitleSizing(nodeId, "measure-skipped-no-relevant-change", {
        currentWidth,
        currentHeight,
      });
      return;
    }

    logTitleSizing(nodeId, "measure-start", {
      sizingMode,
      currentWidth,
      currentHeight,
      textLength: effectiveText.length,
      level,
    });

    let nextWidth = currentWidth;
    let nextHeight = currentHeight;

    if (sizingMode === "auto") {
      // Single-line measurement
      ghost.style.whiteSpace = "pre";
      ghost.style.width = "auto";
      const naturalWidth = ghost.offsetWidth;
      const naturalHeight = ghost.offsetHeight;
      const desiredWidth = Math.ceil(naturalWidth + paddingX + borderTotal);
      const desiredHeight = Math.ceil(naturalHeight + paddingY + borderTotal);

      if (
        Math.abs(desiredWidth - currentWidth) > MIN_DELTA ||
        Math.abs(desiredHeight - currentHeight) > MIN_DELTA
      ) {
        logTitleSizing(nodeId, "measure-auto-delta", {
          desiredWidth,
          desiredHeight,
          currentWidth,
          currentHeight,
          isEditing,
        });
        applyLocalDimensions(desiredWidth, desiredHeight);
        if (!isEditing) persistDimensions(desiredWidth, desiredHeight);
        nextWidth = desiredWidth;
        nextHeight = desiredHeight;
      } else {
        logTitleSizing(nodeId, "measure-auto-noop", {
          desiredWidth,
          desiredHeight,
          currentWidth,
          currentHeight,
        });
      }
    } else {
      // Manual mode: width is fixed by the user; we only adapt height to wrap.
      const innerWidth = Math.max(0, currentWidth - paddingX - borderTotal);
      ghost.style.whiteSpace = "pre-wrap";
      ghost.style.width = `${innerWidth}px`;
      const wrappedHeight = ghost.offsetHeight;
      const desiredHeight = Math.ceil(wrappedHeight + paddingY + borderTotal);

      if (Math.abs(desiredHeight - currentHeight) > MIN_DELTA) {
        logTitleSizing(nodeId, "measure-manual-delta", {
          currentWidth,
          desiredHeight,
          currentHeight,
          innerWidth,
          isEditing,
        });
        applyLocalDimensions(currentWidth, desiredHeight);
        if (!isEditing) persistDimensions(currentWidth, desiredHeight);
        nextHeight = desiredHeight;
      } else {
        logTitleSizing(nodeId, "measure-manual-noop", {
          currentWidth,
          desiredHeight,
          currentHeight,
          innerWidth,
        });
      }
    }

    // Record the dims we settled on, including any local apply. The post-
    // apply re-render will pass currentWidth/currentHeight equal to these,
    // so the next effect run will see no change and skip cleanly.
    lastMeasuredRef.current = {
      text: effectiveText,
      level,
      sizingMode,
      currentWidth: nextWidth,
      currentHeight: nextHeight,
    };
    // currentHeight is in the deps so manual-mode height re-runs catch the
    // case where React Flow's resizer overwrites our height on release
    // (the dimension change persists even with resizeDirection="horizontal").
    // liveText is in the deps so the node grows on every keystroke.
    // eslint-disabled because applyLocal/persist are stable closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text,
    liveText,
    level,
    sizingMode,
    currentWidth,
    currentHeight,
    isHydrated,
    isEditing,
    nodeId,
  ]);

  return { flushPendingPersist };
}
