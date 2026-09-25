import { useState, useCallback } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useWindowsStore, type SnapSide } from "@/stores/windowsStore";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import { useSyncWindowNodeDataIds } from "@/hooks/useSyncWindowNodeDataIds";
import WindowFrame from "./WindowFrame";
import {
  getWindowSaveHandler,
  useHasWindowSaveHandler,
} from "./windowSaveRegistry";

export default function WindowsContainer() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const fullscreenNodeId = useWindowsStore((s) => s.fullscreenNodeId);
  const existingNodeIds = useExistingNodeIds();
  const [snapPreview, setSnapPreview] = useState<SnapSide | null>(null);

  // Les windows figent le `nodeDataId` qu'elles avaient à l'ouverture ; ce
  // hook les recale quand le node change d'id (création local-first confirmée
  // par le serveur). Monté ici parce que c'est le seul point où l'on est à la
  // fois sous le provider React Flow et au-dessus de toutes les windows.
  useSyncWindowNodeDataIds();

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

  return (
    <div
      data-slot="windows-container"
      className="pointer-events-none fixed inset-0 z-10 h-full w-full"
    >
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

      {/* Une seule liste, clé stable : le plein écran n'est qu'un autre
          placement du même wrapper (rendu par `WindowFrame`). La fenêtre n'est donc jamais démontée en
          entrant ou en sortant du plein écran — lecture vidéo, scroll, zoom
          et brouillon non sauvegardé survivent à la bascule. En plein écran
          elle passe sous les fenêtres flottantes (50 < 100 + zIndex). */}
      {openedWindows
        .filter((openedWindow) => existingNodeIds.has(openedWindow.xyNodeId))
        .map((openedWindow) => (
          <WindowFrame
            key={openedWindow.xyNodeId}
            openedWindow={openedWindow}
            isFullscreen={
              openedWindow.xyNodeId === fullscreenNodeId &&
              openedWindow.windowState !== "minimized"
            }
            onSnapPreviewChange={handleSnapPreviewChange}
          />
        ))}
    </div>
  );
}
