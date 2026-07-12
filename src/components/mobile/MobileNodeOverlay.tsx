import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import {
  TbArrowLeft,
  TbRefresh,
  TbDotsVertical,
  TbHistory,
  TbMessageSearch,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { WindowFrameContext } from "@/components/windows/WindowFrameContext";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/plate/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/shadcn/dialog";
import VersionHistoryViewer from "@/components/windows/VersionHistoryViewer";
import AssociatedThreadsViewer from "@/components/windows/AssociatedThreadsViewer";
// Same lazy boundaries as WindowFrame: keep the heavy editors out of the
// canvas chunk on mobile too.
const DocumentWindow = lazy(
  () => import("@/components/windows/prebuilt/DocumentWindow"),
);
const EmbedWindow = lazy(
  () => import("@/components/windows/prebuilt/EmbedWindow"),
);
const ImageWindow = lazy(
  () => import("@/components/windows/prebuilt/ImageWindow"),
);
const PdfWindow = lazy(() => import("@/components/windows/prebuilt/PdfWindow"));
const TableWindow = lazy(
  () => import("@/components/windows/prebuilt/TableWindow"),
);
const AppWindow = lazy(() => import("@/components/windows/prebuilt/AppWindow"));
import { cn } from "@/lib/utils";
import { useMobileNoleChat } from "./mobileNoleContextValue";

export default function MobileNodeOverlay() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);

  // The "top" opened window = the most recently opened/brought-to-front.
  const topWindow = useMemo(() => {
    const visible = openedWindows.filter((w) => w.windowState !== "minimized");
    if (visible.length === 0) return null;
    return visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
  }, [openedWindows]);

  if (!topWindow) return null;

  return <NodeOverlayInner key={topWindow.xyNodeId} window={topWindow} />;
}

function NodeOverlayInner({ window: openedWindow }: { window: OpenedWindow }) {
  const { xyNodeId, nodeDataId, nodeType } = openedWindow;
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const addDirtyNode = useWindowsStore((s) => s.addDirtyNode);
  const removeDirtyNode = useWindowsStore((s) => s.removeDirtyNode);
  const { selectThread } = useMobileNoleChat();

  const [isDirty, setDirty] = useState(false);
  const [saveHandler, setSaveHandlerState] = useState<(() => void) | null>(
    null,
  );
  const [refreshHandler, setRefreshHandlerState] = useState<
    (() => void) | null
  >(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [associatedThreadsOpen, setAssociatedThreadsOpen] = useState(false);

  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  useEffect(() => {
    if (isDirty) {
      addDirtyNode(xyNodeId);
    } else {
      removeDirtyNode(xyNodeId);
    }
    return () => removeDirtyNode(xyNodeId);
  }, [isDirty, xyNodeId, addDirtyNode, removeDirtyNode]);

  // Push a history entry when the overlay opens so the browser back button
  // navigates back to the chat instead of leaving the app.
  useEffect(() => {
    history.pushState({ mobileNodeOverlay: xyNodeId }, "");

    return () => {
      // If the overlay is closed programmatically (via the in-app button),
      // consume the history entry we pushed so the stack stays clean.
      if (history.state?.mobileNodeOverlay === xyNodeId) {
        history.back();
      }
    };
  }, [xyNodeId]);

  // Intercept the browser / OS back gesture while this overlay is visible.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const saveHandlerRef = useRef(saveHandler);
  saveHandlerRef.current = saveHandler;

  useEffect(() => {
    const handlePopState = () => {
      if (isDirtyRef.current) {
        // Re-push state to cancel the navigation, then ask the user.
        history.pushState({ mobileNodeOverlay: xyNodeId }, "");
        setShowBackConfirm(true);
      } else {
        closeWindow(xyNodeId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [xyNodeId, closeWindow]);

  const contextValue = useMemo(
    () => ({
      setDirty,
      setSaveHandler: (fn: (() => void) | null) =>
        setSaveHandlerState(() => fn),
      setRefreshHandler: (fn: (() => void) | null) =>
        setRefreshHandlerState(() => fn),
    }),
    [],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <AlertDialog open={showBackConfirm} onOpenChange={setShowBackConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to close this window?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeWindow(xyNodeId)}>
              Close without saving
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                saveHandlerRef.current?.();
                closeWindow(xyNodeId);
              }}
            >
              Save and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div
        ref={containerRef}
        className="fixed left-0 right-0 top-0 z-40 bg-white animate-in slide-in-from-bottom duration-200"
        style={{ bottom: "var(--mobile-chat-input-h, 0px)" }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 border-b px-2 py-2 shrink-0">
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
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to chat"
                className="h-10 w-10"
              >
                <TbArrowLeft size={20} />
              </Button>
            </ConfirmableButton>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {NodeIcon ? (
                <NodeIcon className="size-4 shrink-0 text-slate-600" />
              ) : null}
              <span className="truncate text-sm font-medium">
                {title || nodeType}
              </span>
            </div>
            {refreshHandler && (
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshHandler}
                aria-label="Refresh"
                className="h-10 w-10"
              >
                <TbRefresh size={18} />
              </Button>
            )}
            {saveHandler && (
              <Button
                variant={isDirty ? "default" : "ghost"}
                size="sm"
                disabled={!isDirty}
                onClick={saveHandler}
                className={cn(!isDirty && "text-slate-400")}
              >
                <Save size={14} />
                Save
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More options"
                  className="h-10 w-10"
                >
                  <TbDotsVertical size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onSelect={() => setHistoryOpen(true)}
                >
                  <TbHistory size={13} />
                  History
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center text-sm"
                  onSelect={() => setAssociatedThreadsOpen(true)}
                >
                  <TbMessageSearch size={13} />
                  Associated threads
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <NodeContent
              xyNodeId={xyNodeId}
              nodeDataId={nodeDataId}
              nodeType={nodeType}
            />
          </div>
        </div>
      </div>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex h-[80vh] max-h-175 flex-col">
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
        <DialogContent className="flex h-[80vh] max-h-175 flex-col">
          <DialogHeader>
            <DialogTitle>Associated threads</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <AssociatedThreadsViewer
            nodeDataId={nodeDataId}
            closeModale={() => setAssociatedThreadsOpen(false)}
            onOpenThread={(threadId) => {
              selectThread(threadId);
              closeWindow(xyNodeId);
            }}
          />
        </DialogContent>
      </Dialog>
    </WindowFrameContext.Provider>
  );
}

function NodeContent(props: Pick<OpenedWindow, "xyNodeId" | "nodeDataId" | "nodeType">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      }
    >
      <NodeContentBody {...props} />
    </Suspense>
  );
}

function NodeContentBody({
  xyNodeId,
  nodeDataId,
  nodeType,
}: Pick<OpenedWindow, "xyNodeId" | "nodeDataId" | "nodeType">) {
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
