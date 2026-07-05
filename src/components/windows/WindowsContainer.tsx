import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useWindowsStore, type SnapSide } from "@/stores/windowsStore";
import { useStore } from "@xyflow/react";
import WindowFrame from "./WindowFrame";
import FullscreenDocumentWindow from "./FullscreenDocumentWindow";
import FullscreenTableWindow from "./FullscreenTableWindow";
import FullscreenPdfWindow from "./FullscreenPdfWindow";

export default function WindowsContainer() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const fullscreenNodeId = useWindowsStore((s) => s.fullscreenNodeId);
  const bringWindowToFront = useWindowsStore((s) => s.bringWindowToFront);
  const existingNodeIds = useStore((state) =>
    state.nodes.map((node) => node.id),
  );
  const [snapPreview, setSnapPreview] = useState<SnapSide | null>(null);

  const fullscreenWindow = fullscreenNodeId
    ? openedWindows.find((w) => w.xyNodeId === fullscreenNodeId)
    : undefined;

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
        existingNodeIds.includes(fullscreenWindow.xyNodeId) && (
          <div className="pointer-events-auto">
            {fullscreenWindow.nodeType === "document" ? (
              <FullscreenDocumentWindow openedWindow={fullscreenWindow} />
            ) : fullscreenWindow.nodeType === "table" ? (
              <FullscreenTableWindow openedWindow={fullscreenWindow} />
            ) : fullscreenWindow.nodeType === "pdf" ? (
              <FullscreenPdfWindow openedWindow={fullscreenWindow} />
            ) : null}
          </div>
        )}

      {/* Snap preview overlay */}
      {snapPreview && (
        <div
          className="pointer-events-none absolute z-100 rounded-lg border-2 border-(--brand)/60 bg-(--brand)/15 transition-all duration-150"
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
          existingNodeIds.includes(openedWindow.xyNodeId),
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
