import { useEffect, useRef, useCallback, useState } from "react";
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
import { Spinner } from "@/components/shadcn/spinner";
import {
  TbArrowsMaximize,
  TbCheck,
  TbDeviceFloppy,
  TbDotsVertical,
  TbHistory,
  TbLocation,
  TbMessageSearch,
  TbMinus,
  TbRefresh,
  TbX,
} from "react-icons/tb";
import { useReactFlow } from "@xyflow/react";
import { useGoToNode } from "@/hooks/useGoToNode";
import NodeWindowContent from "./NodeWindowContent";
import NodeWindowDialogs from "./NodeWindowDialogs";
import { WindowEditControl } from "./WindowEditControl";
import { useNodeWindowIdentity } from "./useNodeWindowIdentity";
import { useWindowFrameState } from "./useWindowFrameState";
import { WindowFrameContext } from "./WindowFrameContext";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { Kbd } from "@/components/shadcn/kbd";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu";
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
  const {
    isDirty,
    isSaving,
    saveHandler,
    refreshHandler,
    handleSave,
    contextValue,
  } = useWindowFrameState(xyNodeId);
  const moveWindow = useWindowsStore((s) => s.moveWindow);
  const resizeWindow = useWindowsStore((s) => s.resizeWindow);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const toggleFullscreenWindow = useWindowsStore(
    (s) => s.toggleFullscreenWindow,
  );
  const snapWindow = useWindowsStore((s) => s.snapWindow);
  const addAttachments = useNoleStore((s) => s.addAttachments);
  const isAttachedToConversation = useIsNodeAttached(xyNodeId);
  const { getNode } = useReactFlow();
  const goToNode = useGoToNode();

  const { title, NodeIcon } = useNodeWindowIdentity(nodeDataId);

  const [isDraggingOrResizing, setIsDraggingOrResizing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [associatedThreadsOpen, setAssociatedThreadsOpen] = useState(false);

  // Le `Mod+S` est global (voir `WindowsContainer`) : il résout la fenêtre au
  // premier plan via le store et appelle son handler enregistré. Plus de
  // hotkey scopé ici — le focus pouvait être hors de ce div (canvas, chat,
  // autre fenêtre) et le save du browser partait.

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
      if (isDirty) void handleSave();
      toggleFullscreenWindow(xyNodeId);
    },
    [
      openedWindow.nodeType,
      xyNodeId,
      isDirty,
      handleSave,
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

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <div
        className={cn(
          "relative h-full w-full",
          isAttachedToConversation &&
            "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:border-2 after:border-dashed after:border-violet-500/90",
        )}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.12)]">
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
            className="flex h-10 cursor-grab select-none items-center gap-2 rounded-t-2xl border-b border-slate-200/70 bg-white/60 py-0 pl-3 pr-1 hover:cursor-grab active:cursor-grabbing"
            onMouseDown={handleHeaderMouseDown}
            onDoubleClick={handleHeaderDoubleClick}
            title={title}
          >
            {NodeIcon ? (
              <NodeIcon className="size-4 shrink-0 text-slate-600" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight">
              {title ?? "—"}
            </span>
            {refreshHandler && (
              <button
                data-window-control="true"
                className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={refreshHandler}
                title="Refresh window"
              >
                <TbRefresh size={15} />
              </button>
            )}
            {saveHandler && (
              <button
                data-window-control="true"
                className={cn(
                  "my-1 flex h-7 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 transition-colors",
                  isSaving
                    ? "text-slate-500"
                    : isDirty
                      ? "text-green-600 hover:bg-green-500/15"
                      : "text-slate-400/60 hover:bg-green-500/15 hover:text-green-600",
                )}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                aria-busy={isSaving}
                title={
                  isSaving
                    ? "Saving..."
                    : isDirty
                      ? "Save changes (Ctrl+S)"
                      : "Saved"
                }
              >
                {isSaving ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <span className="flex items-center gap-1">
                    {isDirty && (
                      <Kbd className="h-3.5 min-w-0 bg-transparent text-green-600 ">
                        Ctrl + S
                      </Kbd>
                    )}
                    {isDirty ? (
                      <TbDeviceFloppy size={17} />
                    ) : (
                      <TbCheck size={15} />
                    )}
                  </span>
                )}
              </button>
            )}
            <WindowEditControl openedWindow={openedWindow} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-window-control="true"
                  className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="More options"
                >
                  <TbDotsVertical size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => goToNode(xyNodeId)}
                >
                  <TbLocation size={15} />
                  Navigate to node
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onSelect={() => setHistoryOpen(true)}
                >
                  <TbHistory size={15} />
                  History
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onSelect={() => setAssociatedThreadsOpen(true)}
                >
                  <TbMessageSearch size={15} />
                  Threads that modified this node
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              data-window-control="true"
              className="shrink-0 rounded-full opacity-50 hover:bg-black/10 hover:opacity-100 size-7 my-1 flex items-center justify-center"
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
              <TbMinus size={15} />
            </button>
            {fullscreenEligible && (
              <button
                data-window-control="true"
                className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (isDirty) void handleSave();
                  toggleFullscreenWindow(xyNodeId);
                }}
                aria-label="Expand to fullscreen"
                title="Expand"
              >
                <TbArrowsMaximize size={15} />
              </button>
            )}
            <ConfirmableButton
              title="Close without saving?"
              text="You have unsaved changes. Do you want to close this window?"
              hint={
                <>
                  <span>Tip: press</span>
                  <Kbd>Ctrl S</Kbd>
                  <span>to save without closing</span>
                </>
              }
              onCancel={() => closeWindow(xyNodeId)}
              onConfirm={() => {
                if (isDirty) void handleSave();
                closeWindow(xyNodeId);
              }}
              shouldConfirm={isDirty}
              cancelLabel="Close without saving"
              confirmLabel="Save and close"
              autoFocusConfirm
            >
              <button
                data-window-control="true"
                className="shrink-0 rounded-full opacity-50 hover:bg-red-500/15 hover:text-red-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="Close"
              >
                <TbX size={15} />
              </button>
            </ConfirmableButton>
          </div>

          {/* ── Body (non-draggable) ──────────────────────────────────── */}
          <div className="relative min-h-0 flex-1 overflow-auto">
            <NodeWindowContent
              nodeType={openedWindow.nodeType}
              xyNodeId={xyNodeId}
              nodeDataId={nodeDataId}
            />
            {isDraggingOrResizing && <div className="absolute inset-0 z-10" />}
          </div>
        </div>
      </div>

      <NodeWindowDialogs
        nodeDataId={nodeDataId}
        title={title}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
        threadsOpen={associatedThreadsOpen}
        onThreadsOpenChange={setAssociatedThreadsOpen}
        contentClassName="sm:max-w-3xl"
      />
    </WindowFrameContext.Provider>
  );
}
