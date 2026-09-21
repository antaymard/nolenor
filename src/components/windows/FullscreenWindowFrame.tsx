import { type ReactNode, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  TbArrowsMinimize,
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
import { useGoToNode } from "@/hooks/useGoToNode";
import {
  MAX_MINIMIZED_WINDOWS,
  useWindowsStore,
  type OpenedWindow,
} from "@/stores/windowsStore";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { WindowFrameContext } from "./WindowFrameContext";
import { useWindowFrameState } from "./useWindowFrameState";
import { Spinner } from "@/components/shadcn/spinner";
import { Kbd } from "@/components/shadcn/kbd";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
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
import AssociatedThreadsViewer from "./AssociatedThreadsViewer";

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

  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  const goToNode = useGoToNode();

  const {
    isDirty,
    isSaving,
    saveHandler,
    refreshHandler,
    handleSave,
    contextValue,
  } = useWindowFrameState(xyNodeId);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [associatedThreadsOpen, setAssociatedThreadsOpen] = useState(false);

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div
          className="flex h-10 select-none items-center gap-2 border-b border-slate-200/70 bg-white/60 py-0 pl-3 pr-1"
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-window-control="true"]'))
              return;
            if (isDirty) void handleSave();
            exitFullscreen();
          }}
          title={title}
        >
          {headerLeftSlot}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-window-control="true"
                className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
                aria-label="More options"
              >
                <TbDotsVertical size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className="flex items-center text-sm"
                onSelect={() => goToNode(xyNodeId)}
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
              exitFullscreen();
              toggleMinimizeWindow(xyNodeId);
            }}
            aria-label="Minimize"
          >
            <TbMinus size={15} />
          </button>
          <button
            data-window-control="true"
            className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
            onClick={() => {
              if (isDirty) void handleSave();
              exitFullscreen();
            }}
            aria-label="Exit fullscreen"
            title="Exit fullscreen"
          >
            <TbArrowsMinimize size={15} />
          </button>
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
              aria-label="Close"
            >
              <TbX size={15} />
            </button>
          </ConfirmableButton>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        {children}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex h-[70vh] max-h-175 flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <VersionHistoryViewer
            nodeDataId={nodeDataId}
            closeModale={() => setHistoryOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={associatedThreadsOpen}
        onOpenChange={setAssociatedThreadsOpen}
      >
        <DialogContent className="flex h-[70vh] max-h-175 flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Threads that modified this node</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <AssociatedThreadsViewer
            nodeDataId={nodeDataId}
            closeModale={() => setAssociatedThreadsOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </WindowFrameContext.Provider>
  );
}
