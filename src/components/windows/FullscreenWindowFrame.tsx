import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Minimize2, Minus, Save, X } from "lucide-react";
import { TbLocation, TbRefresh } from "react-icons/tb";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { WindowFrameContext } from "./WindowFrameContext";
import ConfirmableButton from "@/components/ui/ConfirmableButton";

interface FullscreenWindowFrameProps {
  openedWindow: OpenedWindow;
  children: ReactNode;
  headerLeftSlot?: ReactNode;
}

export default function FullscreenWindowFrame({
  openedWindow,
  children,
  headerLeftSlot,
}: FullscreenWindowFrameProps) {
  const { xyNodeId, nodeDataId } = openedWindow;

  const exitFullscreen = useWindowsStore((s) => s.exitFullscreen);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const addDirtyNode = useWindowsStore((s) => s.addDirtyNode);
  const removeDirtyNode = useWindowsStore((s) => s.removeDirtyNode);

  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  const goToNode = useGoToNode();

  const [isDirty, setDirty] = useState(false);
  const [saveHandler, setSaveHandler] = useState<(() => void) | null>(null);
  const [refreshHandler, setRefreshHandler] = useState<(() => void) | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDirty) {
      addDirtyNode(xyNodeId);
    } else {
      removeDirtyNode(xyNodeId);
    }
    return () => removeDirtyNode(xyNodeId);
  }, [isDirty, xyNodeId, addDirtyNode, removeDirtyNode]);

  useHotkey(
    "Mod+S",
    (e) => {
      e.preventDefault();
      saveHandler?.();
    },
    { target: containerRef, enabled: !!saveHandler && isDirty },
  );

  const contextValue = useMemo(
    () => ({
      setDirty,
      setSaveHandler: (fn: (() => void) | null) => setSaveHandler(() => fn),
      setRefreshHandler: (fn: (() => void) | null) =>
        setRefreshHandler(() => fn),
    }),
    [],
  );

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col bg-white"
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div
          className="flex select-none items-center gap-2 border-b bg-white px-4 py-2"
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-window-control="true"]'))
              return;
            if (isDirty) saveHandler?.();
            exitFullscreen();
          }}
        >
          {headerLeftSlot}
          {NodeIcon ? (
            <NodeIcon className="size-4 shrink-0 text-slate-600" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {title ?? "—"}
          </span>
          {refreshHandler && (
            <button
              data-window-control="true"
              className="shrink-0 rounded p-1 opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100"
              onClick={refreshHandler}
              title="Refresh"
            >
              <TbRefresh size={14} />
            </button>
          )}
          {saveHandler && (
            <button
              data-window-control="true"
              className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-green-100 hover:text-green-800 disabled:pointer-events-none disabled:opacity-30"
              onClick={saveHandler}
              disabled={!isDirty}
            >
              <Save size={12} />
              Save
            </button>
          )}
          <button
            data-window-control="true"
            className="shrink-0 rounded p-1 opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100"
            onClick={() => goToNode(xyNodeId)}
            aria-label="Go to node"
            title="Go to node"
          >
            <TbLocation size={14} />
          </button>
          <button
            data-window-control="true"
            className="shrink-0 rounded p-1 opacity-60 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100"
            onClick={() => {
              if (isDirty) saveHandler?.();
              exitFullscreen();
            }}
            aria-label="Exit fullscreen"
            title="Exit fullscreen"
          >
            <Minimize2 size={14} />
          </button>
          <button
            data-window-control="true"
            className="shrink-0 rounded p-1 opacity-50 hover:bg-black/10 hover:opacity-100"
            onClick={() => {
              exitFullscreen();
              toggleMinimizeWindow(xyNodeId);
            }}
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <ConfirmableButton
            title="Close without saving?"
            text="You have unsaved changes. Do you want to close this window?"
            onCancel={() => closeWindow(xyNodeId)}
            onConfirm={() => {
              if (isDirty) saveHandler?.();
              closeWindow(xyNodeId);
            }}
            shouldConfirm={isDirty}
            cancelLabel="Close without saving"
            confirmLabel="Save and close"
            autoFocusConfirm
          >
            <button
              data-window-control="true"
              className="shrink-0 rounded p-1 opacity-50 hover:bg-red-500/15 hover:text-red-600 hover:opacity-100"
              aria-label="Close"
              title="Close"
            >
              <X size={14} />
            </button>
          </ConfirmableButton>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        {children}
      </div>
    </WindowFrameContext.Provider>
  );
}
