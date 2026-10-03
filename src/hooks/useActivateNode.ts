import { useCallback } from "react";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useWindowsStore } from "@/stores/windowsStore";
import type { Id } from "@/types";
import type { NodeType } from "@/types/domain";

type GoToOptions = Parameters<ReturnType<typeof useGoToNode>>[1];

type ActivateTarget = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
};

/**
 * Modifier that turns the default "go to node" gesture into "open its window"
 * (Cmd on macOS, Ctrl elsewhere) — same idea as Cmd/Ctrl+click opening a link
 * in a new tab. Works for both clicks and Enter key presses.
 */
export function isOpenModifier(event: { metaKey: boolean; ctrlKey: boolean }) {
  return event.metaKey || event.ctrlKey;
}

/** Label of that modifier for hints, matching the platform. */
export const OPEN_MODIFIER_LABEL =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

/**
 * The app-wide way to act on a node reference (search result, mention, chat
 * pill…): by default go to the node on the canvas; with `open: true` open its
 * window instead. A node that has no window falls back to go to, so the
 * gesture never silently does nothing.
 *
 * Needs a `ReactFlowProvider` ancestor (via `useGoToNode`).
 */
export function useActivateNode() {
  const goToNode = useGoToNode();
  const openWindow = useWindowsStore((state) => state.openWindow);

  return useCallback(
    (
      target: ActivateTarget,
      options?: { open?: boolean; goToOptions?: GoToOptions },
    ) => {
      if (options?.open) {
        const opened = openWindow({
          xyNodeId: target.nodeId,
          nodeDataId: target.nodeDataId,
          nodeType: target.nodeType as NodeType,
        });
        if (opened) return;
      }
      goToNode(target.nodeId, options?.goToOptions);
    },
    [goToNode, openWindow],
  );
}
