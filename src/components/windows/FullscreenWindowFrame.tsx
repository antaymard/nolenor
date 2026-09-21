import { type ReactNode, useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import {
  TbArrowsMinimize,
  TbCheck,
  TbDeviceFloppy,
  TbDotsVertical,
  TbLocation,
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
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasStore } from "@/stores/canvasStore";
import useRichQuery from "@/components/utils/useRichQuery";
import { toastError } from "@/components/utils/errorUtils";
import { WindowFrameContext } from "./WindowFrameContext";
import { useWindowFrameState } from "./useWindowFrameState";
import { Spinner } from "@/components/shadcn/spinner";
import { Kbd } from "@/components/shadcn/kbd";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { WindowEditControl } from "./WindowEditControl";
import { WindowSidePanelTrigger } from "./side-panel/WindowSidePanelTrigger";
import { WindowSidePanel } from "./side-panel/WindowSidePanel";
import { VersionPreviewBanner } from "./side-panel/VersionPreviewBanner";
import { VersionContentPreview } from "./side-panel/VersionContentPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu";

interface FullscreenWindowFrameProps {
  openedWindow: OpenedWindow;
  children: ReactNode;
  headerLeftSlot?: ReactNode;
  /** Reading-type windows (blocknote, pdf) reserve a permanent NoleAside
   * column and used to show their outline there — the side panel's Plan tab
   * now owns that, so it opens by default for these instead of starting
   * hidden behind a click. */
  defaultSidePanelOpen?: boolean;
}

export default function FullscreenWindowFrame({
  openedWindow,
  children,
  headerLeftSlot,
  defaultSidePanelOpen = false,
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
    planTabContent,
    handleSave,
    contextValue,
  } = useWindowFrameState(xyNodeId);

  const [sidePanelOpen, setSidePanelOpen] = useState(defaultSidePanelOpen);
  const canvasId = useCanvasStore((s) => s.canvas?._id);

  // ── Version preview (in place, no dialog) ───────────────────────────────
  const [previewVersionId, setPreviewVersionId] =
    useState<Id<"nodeDataVersions"> | null>(null);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);
  const restoreVersion = useMutation(api.nodeDataVersions.restore);
  const isAppNode = nodeData?.type === "app";
  const { data: versions } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    { nodeDataId },
  );
  const previewedVersion = versions?.find((v) => v._id === previewVersionId);

  const handleSelectVersion = useCallback(
    (versionId: Id<"nodeDataVersions">) => {
      if (isDirty) {
        toast.error("Save your changes before previewing a version.");
        return;
      }
      setPreviewVersionId(versionId);
    },
    [isDirty],
  );

  const handleCancelVersionPreview = useCallback(() => {
    setPreviewVersionId(null);
  }, []);

  const handleRestoreVersion = useCallback(async () => {
    if (!previewVersionId || isRestoringVersion) return;
    setIsRestoringVersion(true);
    try {
      await restoreVersion({ versionId: previewVersionId });
      toast.success("Version restored.");
      setPreviewVersionId(null);
    } catch (error) {
      toastError(error, "Error restoring version");
    } finally {
      setIsRestoringVersion(false);
    }
  }, [previewVersionId, isRestoringVersion, restoreVersion]);

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
          {!previewVersionId && refreshHandler && (
            <button
              data-window-control="true"
              className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
              onClick={refreshHandler}
              title="Refresh window"
            >
              <TbRefresh size={15} />
            </button>
          )}
          {!previewVersionId && saveHandler && (
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
          {!previewVersionId && (
            <WindowEditControl openedWindow={openedWindow} />
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
            </DropdownMenuContent>
          </DropdownMenu>
          <WindowSidePanelTrigger
            open={sidePanelOpen}
            onClick={() => setSidePanelOpen((o) => !o)}
          />
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

        {/* ── Body row: content + side panel ──────────────────────────── */}
        <div className="relative flex min-h-0 flex-1">
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col",
              previewVersionId && "bg-yellow-50",
            )}
          >
            {previewVersionId && previewedVersion ? (
              <>
                <VersionPreviewBanner
                  version={previewedVersion}
                  isApp={isAppNode}
                  isRestoring={isRestoringVersion}
                  onCancel={handleCancelVersionPreview}
                  onRestore={() => void handleRestoreVersion()}
                />
                <div className="min-h-0 flex-1 overflow-auto">
                  <VersionContentPreview versionId={previewVersionId} />
                </div>
              </>
            ) : (
              children
            )}
          </div>
          {sidePanelOpen && (
            <WindowSidePanel
              nodeDataId={nodeDataId}
              xyNodeId={xyNodeId}
              canvasId={canvasId}
              planTabContent={planTabContent}
              previewVersionId={previewVersionId}
              onSelectVersion={handleSelectVersion}
            />
          )}
        </div>
      </div>
    </WindowFrameContext.Provider>
  );
}
