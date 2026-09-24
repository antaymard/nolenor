import { useEffect, useRef, useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import {
  useWindowsStore,
  type OpenedWindow,
  type SnapSide,
  SNAP_EDGE_THRESHOLD,
  MAX_MINIMIZED_WINDOWS,
} from "@/stores/windowsStore";
import toast from "react-hot-toast";
import { Spinner } from "@/components/shadcn/spinner";
import {
  TbArrowsMaximize,
  TbArrowsMinimize,
  TbCheck,
  TbDeviceFloppy,
  TbLocation,
  TbMinus,
  TbRefresh,
  TbX,
} from "react-icons/tb";
import { useReactFlow } from "@xyflow/react";
import { useGoToNode } from "@/hooks/useGoToNode";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeData } from "@/hooks/useNodeData";
import { useCanvasStore } from "@/stores/canvasStore";
import useRichQuery from "@/components/utils/useRichQuery";
import { toastError } from "@/components/utils/errorUtils";
import NodeWindowContent from "./NodeWindowContent";
import { isPendingDocId } from "@/lib/pendingDocIds";
import { WindowEditControl } from "./WindowEditControl";
import { useNodeWindowIdentity } from "./useNodeWindowIdentity";
import { useWindowFrameState } from "./useWindowFrameState";
import { WindowFrameContext } from "./WindowFrameContext";
import { WindowSidePanelTrigger } from "./side-panel/WindowSidePanelTrigger";
import { WindowSidePanel } from "./side-panel/WindowSidePanel";
import { VersionPreviewBanner } from "./side-panel/VersionPreviewBanner";
import { VersionContentPreview } from "./side-panel/VersionContentPreview";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { Kbd } from "@/components/shadcn/kbd";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import type { NodeType } from "@/types/domain/nodeTypes";
import { NoleAside, NoleOverlay } from "./WindowNolePanel";

// Matches WindowSidePanel's `w-85`.
const SIDE_PANEL_WIDTH = 340;
// En dessous, docker le panel laisserait moins d'une fois et demie sa largeur
// au contenu : la fenêtre grandit plutôt que de s'écraser. Le seuil est à 2.5x
// et non 2x, où le contenu se retrouvait à la largeur exacte du panel — trop
// étroit pour une table ou un document.
const SIDE_PANEL_GROW_THRESHOLD = SIDE_PANEL_WIDTH * 2.5;

// Fenêtres « de lecture » : en plein écran, Nolë y a sa colonne à gauche (le
// texte reste centré) et le panel latéral s'ouvre d'emblée sur le Plan. Les
// autres types gardent Nolë en surimpression et le panel fermé.
const READING_NODE_TYPES: ReadonlySet<NodeType> = new Set(["blocknote", "pdf"]);

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
  /** Même fenêtre, même arbre : seul le chrome change (ni drag ni resize,
   * Nolë affichée). Le body n'est jamais remonté à la bascule. */
  isFullscreen?: boolean;
  onSnapPreviewChange?: (side: SnapSide | null) => void;
}

export default function WindowFrame({
  openedWindow,
  isFullscreen = false,
  onSnapPreviewChange,
}: WindowFrameProps) {
  const { xyNodeId, nodeDataId } = openedWindow;
  const {
    isDirty,
    isSaving,
    saveHandler,
    refreshHandler,
    planTabContent,
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
  const exitFullscreen = useWindowsStore((s) => s.exitFullscreen);
  const snapWindow = useWindowsStore((s) => s.snapWindow);
  const addAttachments = useNoleStore((s) => s.addAttachments);
  const isAttachedToConversation = useIsNodeAttached(xyNodeId);
  const { getNode } = useReactFlow();
  const goToNode = useGoToNode();

  const { title, NodeIcon } = useNodeWindowIdentity(nodeDataId);

  const [isDraggingOrResizing, setIsDraggingOrResizing] = useState(false);
  const isReadingType = READING_NODE_TYPES.has(openedWindow.nodeType);
  const isTabletPortrait = useIsTabletPortrait();

  // ── Side panel ────────────────────────────────────────────────────────
  // Too narrow for the panel to dock without cramping the content (docking is
  // always a flex-sibling squeeze, never an overlay): opening grows the
  // window by the panel's width instead, closing shrinks it back by the same
  // amount. Growing can push the right edge off-screen, so the window is also
  // shifted left by however much overflow that would cause (never past the
  // left edge) — `grownRef` remembers both amounts so closing undoes exactly
  // what opening did, even if the window was moved in between.
  //
  // Un état par mode : le plein écran a la place de docker le panel sans rien
  // redimensionner, et l'y ouvrir ne doit pas laisser la fenêtre flottante
  // écrasée au retour (elle n'a pas grandi pour le loger).
  const [windowedSidePanelOpen, setWindowedSidePanelOpen] = useState(false);
  const [fullscreenSidePanelOpen, setFullscreenSidePanelOpen] =
    useState(isReadingType);
  const sidePanelOpen = isFullscreen
    ? fullscreenSidePanelOpen
    : windowedSidePanelOpen;
  const canvasId = useCanvasStore((s) => s.canvas?._id);
  const grownRef = useRef<{ shiftedX: number } | null>(null);
  // Side effect kept OUT of the `setSidePanelOpen` updater on purpose: React
  // StrictMode double-invokes functional updaters to catch impurities like
  // this one, and `resizeWindow` was firing twice per click as a result.
  const toggleSidePanel = useCallback(() => {
    if (isFullscreen) {
      setFullscreenSidePanelOpen((open) => !open);
      return;
    }
    const willOpen = !windowedSidePanelOpen;
    if (willOpen) {
      if (openedWindow.width < SIDE_PANEL_GROW_THRESHOLD) {
        const rightEdgeAfterGrow =
          openedWindow.position.x + openedWindow.width + SIDE_PANEL_WIDTH;
        const overflow = rightEdgeAfterGrow - window.innerWidth;
        const shiftedX =
          overflow > 0 ? Math.min(overflow, openedWindow.position.x) : 0;
        resizeWindow(
          xyNodeId,
          { x: SIDE_PANEL_WIDTH, y: 0 },
          shiftedX > 0 ? { x: -shiftedX, y: 0 } : undefined,
        );
        grownRef.current = { shiftedX };
      } else {
        grownRef.current = null;
      }
    } else if (grownRef.current) {
      const { shiftedX } = grownRef.current;
      resizeWindow(
        xyNodeId,
        { x: -SIDE_PANEL_WIDTH, y: 0 },
        shiftedX > 0 ? { x: shiftedX, y: 0 } : undefined,
      );
      grownRef.current = null;
    }
    setWindowedSidePanelOpen(willOpen);
  }, [
    isFullscreen,
    windowedSidePanelOpen,
    openedWindow.width,
    openedWindow.position.x,
    resizeWindow,
    xyNodeId,
  ]);

  // ── Version preview (in place, no dialog) ───────────────────────────────
  const [previewVersionId, setPreviewVersionId] =
    useState<Id<"nodeDataVersions"> | null>(null);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);
  const restoreVersion = useMutation(api.nodeDataVersions.restore);
  const isAppNode = useNodeData(nodeDataId)?.type === "app";
  // `"skip"` tant que la création n'est pas confirmée : `pending_<llmId>`
  // n'est pas un `Id<"nodeDatas">` valide, et le validateur serveur ferait
  // remonter une erreur de query pendant ces quelques centaines de
  // millisecondes. L'historique arrive avec le vrai id (cf.
  // `useSyncWindowNodeDataIds`).
  const { data: versions } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    isPendingDocId(nodeDataId) ? "skip" : { nodeDataId },
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
      // Plein écran : rien à déplacer.
      if (isFullscreen) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY };
      setIsDraggingOrResizing(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [xyNodeId, isFullscreen, addAttachments, getNode],
  );

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-window-control="true"]'))
        return;
      toggleFullscreenWindow(xyNodeId);
    },
    [xyNodeId, toggleFullscreenWindow],
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

  const updateSnapPreview = useCallback((clientX: number, clientY: number) => {
    let side: SnapSide | null = null;
    if (clientY <= SNAP_EDGE_THRESHOLD) side = "top";
    else if (clientX <= SNAP_EDGE_THRESHOLD) side = "left";
    else if (clientX >= window.innerWidth - SNAP_EDGE_THRESHOLD) side = "right";

    if (side !== snapPreviewRef.current) {
      snapPreviewRef.current = side;
      onSnapPreviewChangeRef.current?.(side);
    }
  }, []);

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

  const headerButtonClass =
    "shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center";

  return (
    <WindowFrameContext.Provider value={contextValue}>
      <div
        className={cn(
          "relative h-full w-full",
          isAttachedToConversation &&
            "after:pointer-events-none after:absolute after:inset-0 after:border-2 after:border-dashed after:border-violet-500/90",
          isAttachedToConversation && !isFullscreen && "after:rounded-2xl",
        )}
      >
        <div
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden bg-white",
            !isFullscreen &&
              "rounded-2xl border border-white/40 shadow-[0_6px_20px_rgba(15,23,42,0.12)]",
          )}
        >
          {/* ── Resize handles (fenêtré seulement) ───────────────────── */}
          {!isFullscreen && (
            <>
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
            </>
          )}

          {/* ── Header (draggable en fenêtré) ─────────────────────────── */}
          <div
            className={cn(
              "flex h-10 select-none items-center gap-2 border-b border-slate-200/70 bg-white/60 py-0 pl-3 pr-1",
              !isFullscreen &&
                "cursor-grab rounded-t-2xl hover:cursor-grab active:cursor-grabbing",
            )}
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
            {!previewVersionId && refreshHandler && (
              <button
                data-window-control="true"
                className={headerButtonClass}
                onMouseDown={(e) => e.stopPropagation()}
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
            {!previewVersionId && (
              <WindowEditControl openedWindow={openedWindow} />
            )}
            <button
              data-window-control="true"
              className={headerButtonClass}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => goToNode(xyNodeId)}
              aria-label="Navigate to node"
              title="Navigate to node"
            >
              <TbLocation size={15} />
            </button>
            <WindowSidePanelTrigger
              open={sidePanelOpen}
              onClick={toggleSidePanel}
            />
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
                if (isFullscreen) exitFullscreen();
                toggleMinimizeWindow(xyNodeId);
              }}
              aria-label="Minimize"
            >
              <TbMinus size={15} />
            </button>
            {/* Pas de save avant la bascule : la fenêtre n'est pas remontée,
                le brouillon reste là, dirty compris. */}
            <button
              data-window-control="true"
              className={headerButtonClass}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => toggleFullscreenWindow(xyNodeId)}
              aria-label={
                isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"
              }
              title={isFullscreen ? "Exit fullscreen" : "Expand"}
            >
              {isFullscreen ? (
                <TbArrowsMinimize size={15} />
              ) : (
                <TbArrowsMaximize size={15} />
              )}
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
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="Close"
              >
                <TbX size={15} />
              </button>
            </ConfirmableButton>
          </div>

          {/* ── Body row (non-draggable): [Nolë] content + side panel ───── */}
          {/* Nolë est un voisin conditionnel du contenu, jamais une
              enveloppe : `NodeWindowContent` garde la même place dans l'arbre
              dans les deux modes, sans quoi React le remonterait. */}
          <div className="relative flex min-h-0 flex-1">
            {isFullscreen && isReadingType && !isTabletPortrait && (
              <NoleAside />
            )}
            <div
              className={cn(
                "relative min-h-0 min-w-0 flex-1 overflow-auto",
                previewVersionId && "bg-yellow-50",
              )}
            >
              {previewVersionId && previewedVersion ? (
                <div className="flex h-full flex-col">
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
                </div>
              ) : (
                <NodeWindowContent
                  nodeType={openedWindow.nodeType}
                  xyNodeId={xyNodeId}
                  nodeDataId={nodeDataId}
                />
              )}
              {isDraggingOrResizing && (
                <div className="absolute inset-0 z-10" />
              )}
            </div>
            {isFullscreen && !isReadingType && <NoleOverlay />}
            {sidePanelOpen && (
              <WindowSidePanel
                nodeDataId={nodeDataId}
                xyNodeId={xyNodeId}
                nodeType={openedWindow.nodeType}
                canvasId={canvasId}
                planTabContent={planTabContent}
                previewVersionId={previewVersionId}
                onSelectVersion={handleSelectVersion}
              />
            )}
          </div>
        </div>
      </div>
    </WindowFrameContext.Provider>
  );
}
