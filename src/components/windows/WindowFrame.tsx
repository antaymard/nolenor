import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";
import {
  useWindowsStore,
  type OpenedWindow,
  type SnapSide,
  SNAP_EDGE_THRESHOLD,
  isFullscreenEligible,
  MAX_MINIMIZED_WINDOWS,
} from "@/stores/windowsStore";
import toast from "react-hot-toast";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNodeData } from "@/hooks/useNodeData";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { X, Minus, Save, Maximize2 } from "lucide-react";
import {
  TbDotsVertical,
  TbHistory,
  TbLocation,
  TbRefresh,
} from "react-icons/tb";
import { useReactFlow } from "@xyflow/react";
import { useGoToNode } from "@/hooks/useGoToNode";
import DocumentWindow from "./prebuilt/DocumentWindow";
import EmbedWindow from "./prebuilt/EmbedWindow";
import ImageWindow from "./prebuilt/ImageWindow";
import PdfWindow from "./prebuilt/PdfWindow";
import TableWindow from "./prebuilt/TableWindow";
import AppWindow from "./prebuilt/AppWindow";
import { WindowFrameContext } from "./WindowFrameContext";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../shadcn/dialog";
import VersionHistoryViewer from "./VersionHistoryViewer";

function WindowContent({ openedWindow }: { openedWindow: OpenedWindow }) {
  const { nodeType, xyNodeId, nodeDataId } = openedWindow;

  switch (nodeType) {
    case "document":
      return <DocumentWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "embed":
      return <EmbedWindow nodeDataId={nodeDataId} />;
    case "app":
      return <AppWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "pdf":
      return <PdfWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "image":
      return <ImageWindow nodeDataId={nodeDataId} />;
    case "table":
      return <TableWindow nodeDataId={nodeDataId} />;
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {nodeType}
        </div>
      );
  }
}

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const RESIZE_CURSOR: Record<ResizeDirection, string> = {
  n: "cursor-n-resize",
  ne: "cursor-ne-resize",
  e: "cursor-e-resize",
  se: "cursor-se-resize",
  s: "cursor-s-resize",
  sw: "cursor-sw-resize",
  w: "cursor-w-resize",
  nw: "cursor-nw-resize",
};

interface WindowFrameProps {
  openedWindow: OpenedWindow;
  onSnapPreviewChange?: (side: SnapSide | null) => void;
}

export default function WindowFrame({
  openedWindow,
  onSnapPreviewChange,
}: WindowFrameProps) {
  const { xyNodeId, nodeDataId } = openedWindow;
  const [isDirty, setDirty] = useState(false);
  const [saveHandler, setSaveHandler] = useState<(() => void) | null>(null);
  const [refreshHandler, setRefreshHandler] = useState<(() => void) | null>(
    null,
  );
  const moveWindow = useWindowsStore((s) => s.moveWindow);
  const resizeWindow = useWindowsStore((s) => s.resizeWindow);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const toggleFullscreenWindow = useWindowsStore(
    (s) => s.toggleFullscreenWindow,
  );
  const snapWindow = useWindowsStore((s) => s.snapWindow);
  const addDirtyNode = useWindowsStore((s) => s.addDirtyNode);
  const removeDirtyNode = useWindowsStore((s) => s.removeDirtyNode);
  const addAttachments = useNoleStore((s) => s.addAttachments);
  const isAttachedToConversation = useIsNodeAttached(xyNodeId);
  const { getNode } = useReactFlow();
  const goToNode = useGoToNode();

  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  const [isDraggingOrResizing, setIsDraggingOrResizing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useHotkey(
    "Mod+S",
    (e) => {
      e.preventDefault();
      saveHandler?.();
    },
    { target: containerRef, enabled: !!saveHandler && isDirty },
  );

  useEffect(() => {
    if (isDirty) {
      addDirtyNode(xyNodeId);
    } else {
      removeDirtyNode(xyNodeId);
    }
    return () => removeDirtyNode(xyNodeId);
  }, [isDirty, xyNodeId, addDirtyNode, removeDirtyNode]);

  // Stored as refs to avoid stale closures in the event listeners
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    direction: ResizeDirection;
  } | null>(null);

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Ignore clicks on buttons (contrôles)
      if ((e.target as HTMLElement).closest('[data-window-control="true"]'))
        return;

      if (e.altKey) {
        e.preventDefault();

        const node = getNode(xyNodeId);
        if (node) {
          addAttachments({ nodes: [fromXyNodeToCanvasNode(node)] }, true);
        }
        return;
      }
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY };
      setIsDraggingOrResizing(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [xyNodeId, addAttachments, getNode],
  );

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-window-control="true"]'))
        return;
      if (!isFullscreenEligible(openedWindow.nodeType)) return;
      if (isDirty) saveHandler?.();
      toggleFullscreenWindow(xyNodeId);
    },
    [
      openedWindow.nodeType,
      xyNodeId,
      isDirty,
      saveHandler,
      toggleFullscreenWindow,
    ],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { startX: e.clientX, startY: e.clientY, direction };
      setIsDraggingOrResizing(true);
      document.body.style.cursor = RESIZE_CURSOR[direction].replace(
        "cursor-",
        "",
      );
      document.body.style.userSelect = "none";
    },
    [],
  );

  // Ref to track current snap preview so the callback doesn't go stale
  const snapPreviewRef = useRef<SnapSide | null>(null);
  const onSnapPreviewChangeRef = useRef(onSnapPreviewChange);
  onSnapPreviewChangeRef.current = onSnapPreviewChange;

  const fullscreenEligible = isFullscreenEligible(openedWindow.nodeType);

  const updateSnapPreview = useCallback(
    (clientX: number, clientY: number) => {
      let side: SnapSide | null = null;
      if (fullscreenEligible && clientY <= SNAP_EDGE_THRESHOLD) side = "top";
      else if (clientX <= SNAP_EDGE_THRESHOLD) side = "left";
      else if (clientX >= window.innerWidth - SNAP_EDGE_THRESHOLD)
        side = "right";

      if (side !== snapPreviewRef.current) {
        snapPreviewRef.current = side;
        onSnapPreviewChangeRef.current?.(side);
      }
    },
    [fullscreenEligible],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const delta = {
          x: e.clientX - dragRef.current.startX,
          y: e.clientY - dragRef.current.startY,
        };
        dragRef.current = { startX: e.clientX, startY: e.clientY };
        moveWindow(xyNodeId, delta);
        updateSnapPreview(e.clientX, e.clientY);
        return;
      }

      if (resizeRef.current) {
        const { startX, startY, direction } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        resizeRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          direction,
        };

        let sizeDelta = { x: 0, y: 0 };
        let positionDelta: { x: number; y: number } | undefined;

        switch (direction) {
          case "n":
            sizeDelta = { x: 0, y: -dy };
            positionDelta = { x: 0, y: dy };
            break;
          case "ne":
            sizeDelta = { x: dx, y: -dy };
            positionDelta = { x: 0, y: dy };
            break;
          case "e":
            sizeDelta = { x: dx, y: 0 };
            break;
          case "se":
            sizeDelta = { x: dx, y: dy };
            break;
          case "s":
            sizeDelta = { x: 0, y: dy };
            break;
          case "sw":
            sizeDelta = { x: -dx, y: dy };
            positionDelta = { x: dx, y: 0 };
            break;
          case "w":
            sizeDelta = { x: -dx, y: 0 };
            positionDelta = { x: dx, y: 0 };
            break;
          case "nw":
            sizeDelta = { x: -dx, y: -dy };
            positionDelta = { x: dx, y: dy };
            break;
        }

        resizeWindow(xyNodeId, sizeDelta, positionDelta);
      }
    };

    const handleMouseUp = () => {
      // Snap detection on drop
      if (dragRef.current || snapPreviewRef.current) {
        const side = snapPreviewRef.current;
        if (side) {
          snapWindow(xyNodeId, side);
        }
        // Clear preview
        if (snapPreviewRef.current) {
          snapPreviewRef.current = null;
          onSnapPreviewChangeRef.current?.(null);
        }
      }

      dragRef.current = null;
      resizeRef.current = null;
      setIsDraggingOrResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    xyNodeId,
    moveWindow,
    resizeWindow,
    snapWindow,
    updateSnapPreview,
    setIsDraggingOrResizing,
  ]);

  const contextValue = useMemo(
    () => ({
      setDirty,
      setSaveHandler: (fn: (() => void) | null) => setSaveHandler(() => fn),
      setRefreshHandler: (fn: (() => void) | null) =>
        setRefreshHandler(() => fn),
    }),
    [setDirty],
  );

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <div
        className={cn(
          "relative h-full w-full",
          isAttachedToConversation &&
            "after:pointer-events-none after:absolute after:inset-0 after:rounded-[12px] after:border-2 after:border-dashed after:border-violet-500/90",
        )}
      >
        <div
          ref={containerRef}
          className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-white shadow-2xl/10"
        >
          {/* ── Resize handles ───────────────────────────────────────── */}

          {/* Corners (12×12, priority z-20) */}
          <div
            className={cn(
              "absolute -left-1 -top-1 z-20 h-3 w-3 rounded-sm transition-colors hover:bg-blue-400/50",
              RESIZE_CURSOR.nw,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "nw")}
          />
          <div
            className={cn(
              "absolute -right-1 -top-1 z-20 h-3 w-3 rounded-sm transition-colors hover:bg-blue-400/50",
              RESIZE_CURSOR.ne,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "ne")}
          />
          <div
            className={cn(
              "absolute -bottom-1 -left-1 z-20 h-3 w-3 rounded-sm transition-colors hover:bg-blue-400/50",
              RESIZE_CURSOR.sw,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "sw")}
          />
          <div
            className={cn(
              "absolute -bottom-1 -right-1 z-20 h-3 w-3 rounded-sm transition-colors hover:bg-blue-400/50",
              RESIZE_CURSOR.se,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "se")}
          />

          {/* Edges (z-10, inset slightly so corners win) */}
          <div
            className={cn(
              "absolute -top-1 left-2 right-2 z-10 h-2 transition-colors hover:bg-blue-400/30",
              RESIZE_CURSOR.n,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "n")}
          />
          <div
            className={cn(
              "absolute -bottom-1 left-2 right-2 z-10 h-2 transition-colors hover:bg-blue-400/30",
              RESIZE_CURSOR.s,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "s")}
          />
          <div
            className={cn(
              "absolute -left-1 bottom-2 top-2 z-10 w-2 transition-colors hover:bg-blue-400/30",
              RESIZE_CURSOR.w,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "w")}
          />
          <div
            className={cn(
              "absolute -right-1 bottom-2 top-2 z-10 w-2 transition-colors hover:bg-blue-400/30",
              RESIZE_CURSOR.e,
            )}
            onMouseDown={(e) => handleResizeMouseDown(e, "e")}
          />

          {/* ── Header (draggable) ────────────────────────────────────── */}
          <div
            className="flex cursor-grab select-none items-center gap-2 border-b px-3 py-2 hover:cursor-grab active:cursor-grabbing"
            onMouseDown={handleHeaderMouseDown}
            onDoubleClick={handleHeaderDoubleClick}
            title={title}
          >
            {NodeIcon ? (
              <NodeIcon className="size-4 shrink-0 text-slate-600" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {title ?? "—"}
            </span>
            {refreshHandler && (
              <button
                data-window-control="true"
                className="shrink-0 rounded p-0.5 opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 h-full aspect-square flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={refreshHandler}
                title="Refresh window"
              >
                <TbRefresh size={13} />
              </button>
            )}
            {saveHandler && (
              <button
                data-window-control="true"
                className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-green-100 hover:text-green-800 disabled:pointer-events-none disabled:opacity-30 h-full"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={saveHandler}
                disabled={!isDirty}
              >
                <Save size={12} />
                Save
              </button>
            )}
            {fullscreenEligible && (
              <button
                data-window-control="true"
                className="shrink-0 rounded p-0.5 opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 h-full aspect-square flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (isDirty) saveHandler?.();
                  toggleFullscreenWindow(xyNodeId);
                }}
                aria-label="Expand to fullscreen"
                title="Expand"
              >
                <Maximize2 size={13} />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="shrink-0 rounded p-0.5 opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 h-full aspect-square flex items-center justify-center">
                  <TbDotsVertical size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => goToNode(xyNodeId)}
                >
                  <TbLocation size={13} />
                  Navigate to node
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onSelect={() => setHistoryOpen(true)}
                >
                  <TbHistory size={13} />
                  History
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              data-window-control="true"
              className="shrink-0 rounded p-0.5 opacity-50 hover:bg-black/10 hover:opacity-100 h-full aspect-square flex items-center justify-center"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (openedWindow.windowState !== "minimized") {
                  const minimizedCount = useWindowsStore
                    .getState()
                    .openedWindows.filter(
                      (w) => w.windowState === "minimized",
                    ).length;
                  if (minimizedCount >= MAX_MINIMIZED_WINDOWS) {
                    toast.error(
                      `Maximum ${MAX_MINIMIZED_WINDOWS} minimized windows reached`,
                    );
                    return;
                  }
                }
                toggleMinimizeWindow(xyNodeId);
              }}
              aria-label="Minimize"
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
                className="shrink-0 rounded p-0.5 opacity-50 hover:bg-red-500/15 hover:text-red-600 hover:opacity-100 h-full aspect-square flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </ConfirmableButton>
          </div>

          {/* ── Body (non-draggable) ──────────────────────────────────── */}
          <div className="relative min-h-0 flex-1 overflow-auto">
            <WindowContent openedWindow={openedWindow} />
            {isDraggingOrResizing && <div className="absolute inset-0 z-10" />}
          </div>
        </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex h-[70vh] max-h-175 flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <VersionHistoryViewer
            nodeDataId={nodeDataId}
            onRestored={() => setHistoryOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </WindowFrameContext.Provider>
  );
}
