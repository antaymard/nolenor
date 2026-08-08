import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Save } from "lucide-react";
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
import { WindowFrameContext } from "@/components/windows/WindowFrameContext";
import NodeWindowContent from "@/components/windows/NodeWindowContent";
import NodeWindowDialogs from "@/components/windows/NodeWindowDialogs";
import { useNodeWindowIdentity } from "@/components/windows/useNodeWindowIdentity";
import { useWindowFrameState } from "@/components/windows/useWindowFrameState";
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
} from "@/components/shadcn/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
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
  const { selectThread } = useMobileNoleChat();

  const {
    isDirty,
    isSaving,
    saveState,
    saveHandler,
    refreshHandler,
    handleSave,
    contextValue,
  } = useWindowFrameState(xyNodeId);

  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [associatedThreadsOpen, setAssociatedThreadsOpen] = useState(false);

  const { title, NodeIcon } = useNodeWindowIdentity(nodeDataId);

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
  }, [closeWindow, xyNodeId]);

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
                void handleSave();
                closeWindow(xyNodeId);
              }}
            >
              Save and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Un node ouvert recouvre tout, top bar et bottom nav comprises : on en
          sort par le bouton retour du header ou par le geste OS. */}
      <div className="fixed inset-0 z-50 bg-white animate-in slide-in-from-bottom duration-200">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 border-b px-2 py-2 shrink-0">
            <ConfirmableButton
              title="Close without saving?"
              text="You have unsaved changes. Do you want to close this window?"
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
                disabled={!isDirty || isSaving}
                onClick={() => void handleSave()}
                aria-busy={isSaving}
                className={cn(!isDirty && "text-slate-400")}
              >
                {isSaving ? (
                  <Spinner className="size-4" />
                ) : saveState === "saved" ? (
                  <Check size={14} />
                ) : (
                  <Save size={14} />
                )}
                {isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}
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
            <NodeWindowContent
              xyNodeId={xyNodeId}
              nodeDataId={nodeDataId}
              nodeType={nodeType}
            />
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
        onOpenThread={(threadId) => {
          selectThread(threadId);
          closeWindow(xyNodeId);
        }}
      />
    </WindowFrameContext.Provider>
  );
}
