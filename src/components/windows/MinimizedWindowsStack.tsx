import { useWindowsStore } from "@/stores/windowsStore";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import MinimizedWindowPill from "./MinimizedWindowPill";

export default function MinimizedWindowsStack() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const closeAllMinimizedWindows = useWindowsStore(
    (s) => s.closeAllMinimizedWindows,
  );
  const existingNodeIds = useExistingNodeIds();

  const minimizedWindows = useMemo(
    () =>
      openedWindows.filter(
        (w) => w.windowState === "minimized" && existingNodeIds.has(w.xyNodeId),
      ),
    [openedWindows, existingNodeIds],
  );

  if (minimizedWindows.length === 0) return null;

  return (
    <div className="pointer-events-none flex flex-col-reverse items-end gap-1.5">
      <button
        type="button"
        onClick={closeAllMinimizedWindows}
        className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-medium text-slate-600 shadow-md transition-colors hover:bg-red-500/10 hover:text-red-600"
        title="Close all minimized windows"
      >
        <Trash2 size={12} />
        Close all ({minimizedWindows.length})
      </button>
      {minimizedWindows.map((w) => (
        <MinimizedWindowPill key={w.xyNodeId} window={w} />
      ))}
    </div>
  );
}
