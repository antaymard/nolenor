import { useState, useCallback, lazy, Suspense } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";
import { useWindowsStore, type SnapSide } from "@/stores/windowsStore";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import { useSyncWindowNodeDataIds } from "@/hooks/useSyncWindowNodeDataIds";
import WindowFrame from "./WindowFrame";
import WindowContentErrorBoundary from "./WindowContentErrorBoundary";
import {
  getWindowSaveHandler,
  useHasWindowSaveHandler,
} from "./windowSaveRegistry";

// Fullscreen windows share the heavy editor dependencies of their windowed
// counterparts; load them on demand instead of with the canvas chunk.
const FullscreenBlocknoteWindow = lazy(
  () => import("./FullscreenBlocknoteWindow"),
);
const FullscreenTableWindow = lazy(() => import("./FullscreenTableWindow"));
const FullscreenPdfWindow = lazy(() => import("./FullscreenPdfWindow"));
const FullscreenAppWindow = lazy(() => import("./FullscreenAppWindow"));
const FullscreenVideoWindow = lazy(
  () => import("./FullscreenVideoWindow"),
);
const FullscreenImageWindow = lazy(
  () => import("./FullscreenImageWindow"),
);

export default function WindowsContainer() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const fullscreenNodeId = useWindowsStore((s) => s.fullscreenNodeId);
  const bringWindowToFront = useWindowsStore((s) => s.bringWindowToFront);
  const existingNodeIds = useExistingNodeIds();
  const [snapPreview, setSnapPreview] = useState<SnapSide | null>(null);

  // Les windows figent le `nodeDataId` qu'elles avaient à l'ouverture ; ce
  // hook les recale quand le node change d'id (création local-first confirmée
  // par le serveur). Monté ici parce que c'est le seul point où l'on est à la
  // fois sous le provider React Flow et au-dessus de toutes les windows.
  useSyncWindowNodeDataIds();

  const fullscreenWindow = fullscreenNodeId
    ? openedWindows.find((w) => w.xyNodeId === fullscreenNodeId)
    : undefined;

  // `Mod+S` global, topmost strict : d'où que vienne le focus (canvas, chat,
  // cellule de table, BlockNote...), le save s'applique à la fenêtre au
  // premier plan — plein écran d'abord, sinon `zIndex` max hors minimisées.
  // Le `preventDefault` bloque le dialog système même si cette fenêtre n'a
  // rien à sauver ; sans aucune fenêtre sauvegardable, `enabled` rend la
  // main au browser (settings, canvas vide...). Le handler appelé porte déjà
  // les gardes `isDirty` / `isSaving`.
  const hasSaveHandler = useHasWindowSaveHandler();
  useHotkey(
    "Mod+S",
    () => {
      const state = useWindowsStore.getState();
      const visible = state.openedWindows.filter(
        (w) => w.windowState !== "minimized",
      );
      if (visible.length === 0) return;
      const topmost =
        state.fullscreenNodeId !== null
          ? (visible.find((w) => w.xyNodeId === state.fullscreenNodeId) ??
            visible.reduce((a, b) => (b.zIndex > a.zIndex ? b : a)))
          : visible.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
      getWindowSaveHandler(topmost.xyNodeId)?.();
    },
    { preventDefault: true, enabled: hasSaveHandler },
  );

  const handleSnapPreviewChange = useCallback(
    (side: SnapSide | null) => setSnapPreview(side),
    [],
  );

  const handleWindowMouseDownCapture = useCallback(
    (xyNodeId: string, e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      const isWindowControl =
        target?.closest('[data-window-control="true"]') !== null;
      if (isWindowControl) return;

      bringWindowToFront(xyNodeId);
    },
    [bringWindowToFront],
  );

  return (
    <div
      data-slot="windows-container"
      className="pointer-events-none fixed inset-0 z-10 h-full w-full"
    >
      {/* Fullscreen layer (rendered below regular windows) */}
      {fullscreenWindow &&
        existingNodeIds.has(fullscreenWindow.xyNodeId) && (
          <div className="pointer-events-auto">
            {/* Même raison qu'au-dessus de `NodeWindowContent` : sans boundary,
                un chunk plein écran manquant emporte tout le canvas. */}
            <WindowContentErrorBoundary
              key={`${fullscreenWindow.nodeType}:${fullscreenWindow.nodeDataId}`}
            >
              <Suspense fallback={null}>
                {fullscreenWindow.nodeType === "blocknote" ? (
                  <FullscreenBlocknoteWindow openedWindow={fullscreenWindow} />
                ) : fullscreenWindow.nodeType === "table" ? (
                  <FullscreenTableWindow openedWindow={fullscreenWindow} />
                ) : fullscreenWindow.nodeType === "pdf" ? (
                  <FullscreenPdfWindow openedWindow={fullscreenWindow} />
                ) : fullscreenWindow.nodeType === "app" ? (
                  <FullscreenAppWindow openedWindow={fullscreenWindow} />
                ) : fullscreenWindow.nodeType === "video" ? (
                  <FullscreenVideoWindow openedWindow={fullscreenWindow} />
                ) : fullscreenWindow.nodeType === "image" ? (
                  <FullscreenImageWindow openedWindow={fullscreenWindow} />
                ) : null}
              </Suspense>
            </WindowContentErrorBoundary>
          </div>
        )}

      {/* Snap preview overlay */}
      {snapPreview && (
        <div
          className="pointer-events-none absolute z-100 rounded-lg border-2 border-blue-400/60 bg-blue-400/15 transition-all duration-150"
          style={
            snapPreview === "top"
              ? { top: 10, bottom: 10, left: 10, right: 10 }
              : {
                  width: `calc(33% - 20px)`,
                  top: 10,
                  bottom: 10,
                  left: snapPreview === "left" ? 10 : undefined,
                  right: snapPreview === "right" ? 10 : undefined,
                }
          }
        />
      )}

      {openedWindows
        .filter((openedWindow) =>
          existingNodeIds.has(openedWindow.xyNodeId),
        )
        .filter((openedWindow) => openedWindow.xyNodeId !== fullscreenNodeId)
        .map((openedWindow) => (
          <div
            key={openedWindow.xyNodeId}
            className={cn(
              "pointer-events-auto absolute",
              openedWindow.windowState === "minimized" && "hidden",
            )}
            onMouseDownCapture={(e) =>
              handleWindowMouseDownCapture(openedWindow.xyNodeId, e)
            }
            style={{
              left: openedWindow.position.x,
              top: openedWindow.position.y,
              width: openedWindow.width,
              height: openedWindow.height,
              zIndex: 100 + openedWindow.zIndex,
            }}
          >
            <WindowFrame
              openedWindow={openedWindow}
              onSnapPreviewChange={handleSnapPreviewChange}
            />
          </div>
        ))}
    </div>
  );
}
