import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Save } from "lucide-react";
import {
  TbArrowLeft,
  TbRefresh,
  TbDotsVertical,
  TbHistory,
  TbLocation,
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
import { useGoToNode } from "@/hooks/useGoToNode";
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
import { useMobileShell } from "./mobileShellContext";

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

/**
 * Ce qui doit se passer une fois la fermeture tranchée : simplement quitter la
 * fenêtre, ou la quitter pour aller cadrer son node sur le canvas.
 */
type PendingExit = "close" | "navigate";

function NodeOverlayInner({ window: openedWindow }: { window: OpenedWindow }) {
  const { xyNodeId, nodeDataId, nodeType } = openedWindow;
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const closeWindowsForNodeIds = useWindowsStore(
    (s) => s.closeWindowsForNodeIds,
  );
  const { selectThread } = useMobileNoleChat();
  const goToNode = useGoToNode();
  const shell = useMobileShell();

  const {
    isDirty,
    isSaving,
    saveState,
    saveHandler,
    refreshHandler,
    handleSave,
    contextValue,
  } = useWindowFrameState(xyNodeId);

  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [associatedThreadsOpen, setAssociatedThreadsOpen] = useState(false);

  const { title, NodeIcon } = useNodeWindowIdentity(nodeDataId);

  /**
   * « Navigate to node » depuis le plein écran mobile.
   *
   * Le canvas n'est jamais démonté quand une window s'ouvre : `MobileTabPanel`
   * masque l'onglet inactif en `opacity`, et le `ReactFlowProvider` de
   * `MobileCanvas` enveloppe aussi cet overlay. `fitView` opère donc sur une
   * surface aux vraies dimensions, même pendant que le node couvre l'écran.
   *
   * On ferme toute la pile visible et pas seulement cette fenêtre : sur mobile
   * une window recouvre tout l'écran, donc la fenêtre parente (celle d'où on a
   * suivi une mention) masquerait le canvas qu'on vient de cadrer. Les
   * fenêtres du dessous ne sont pas montées — seule celle du dessus l'est —
   * donc aucune d'elles ne porte de brouillon à perdre.
   */
  const navigateToNode = useCallback(() => {
    goToNode(xyNodeId);
    shell?.setActiveTab("canvas");
    const visibleIds = useWindowsStore
      .getState()
      .openedWindows.filter((w) => w.windowState !== "minimized")
      .map((w) => w.xyNodeId);
    closeWindowsForNodeIds(visibleIds);
  }, [goToNode, shell, xyNodeId, closeWindowsForNodeIds]);

  const runPendingExit = useCallback(
    (save: boolean) => {
      if (save) void handleSave();
      if (pendingExit === "navigate") navigateToNode();
      else closeWindow(xyNodeId);
      setPendingExit(null);
    },
    [closeWindow, handleSave, navigateToNode, pendingExit, xyNodeId],
  );

  // Les deux façons de quitter une fenêtre modifiée — le geste retour et
  // « Navigate to node » — partagent cette modale ; seuls les libellés
  // changent, pour dire où l'on part.
  const exitCopy =
    pendingExit === "navigate"
      ? {
          title: "Navigate without saving?",
          text: "This window has unsaved changes. Going to the node on the canvas closes it.",
          discard: "Navigate without saving",
          confirm: "Save and navigate",
        }
      : {
          title: "Close without saving?",
          text: "You have unsaved changes. Do you want to close this window?",
          discard: "Close without saving",
          confirm: "Save and close",
        };

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
        setPendingExit("close");
      } else {
        closeWindow(xyNodeId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [closeWindow, xyNodeId]);

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <AlertDialog
        open={pendingExit !== null}
        onOpenChange={(open) => {
          if (!open) setPendingExit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{exitCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{exitCopy.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Le seul bouton qui ne quitte pas la fenêtre, et il n'est pas
                décoratif : sur un téléphone il n'y a pas de touche Échap, et
                Radix interdit de fermer un AlertDialog en tapant dehors. Sans
                lui, ouvrir cette modale par erreur oblige à sortir. */}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => runPendingExit(false)}>
              {exitCopy.discard}
            </Button>
            <AlertDialogAction onClick={() => runPendingExit(true)}>
              {exitCopy.confirm}
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
                  onSelect={() => {
                    // Quitter la fenêtre fait partie de l'action : on repasse
                    // donc par la même confirmation que le bouton retour.
                    if (isDirty) setPendingExit("navigate");
                    else navigateToNode();
                  }}
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
