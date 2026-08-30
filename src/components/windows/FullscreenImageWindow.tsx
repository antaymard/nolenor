import { useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { type OpenedWindow } from "@/stores/windowsStore";
import ImageWindow from "./prebuilt/ImageWindow";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import FullscreenWindowFrame from "./FullscreenWindowFrame";

interface FullscreenImageWindowProps {
  openedWindow: OpenedWindow;
}

/**
 * La window image, en grand : même surface qu'en fenêtré — l'image tient dans
 * le cadre, zoom et déplacement à la molette et au glisser — mais avec tout
 * l'écran pour elle, ce qui est le seul intérêt d'une photo de 4000 pixels de
 * large sur un canvas.
 *
 * Le fond reste celui du frame plutôt qu'un noir de visionneuse : beaucoup
 * d'images d'un canvas sont des captures et des schémas à fond transparent,
 * dont les traits sombres disparaîtraient.
 */
export default function FullscreenImageWindow({
  openedWindow,
}: FullscreenImageWindowProps) {
  const { nodeDataId } = openedWindow;
  const [isChatOpen, setIsChatOpen] = useState(false);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  return (
    <FullscreenWindowFrame openedWindow={openedWindow}>
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="h-full w-full">
          <ImageWindow nodeDataId={nodeDataId} />
        </div>

        {/* Nolë overlay (bottom-left) */}
        <div className="pointer-events-none absolute bottom-4 left-4">
          <div className="pointer-events-auto relative">
            {isChatOpen && (
              <div className="absolute bottom-10 left-0 w-95 h-[calc(100dvh-8rem)] rounded border bg-white shadow-2xl/10 overflow-hidden [&>div]:shadow-none!">
                <ChatContainer onClose={() => setIsChatOpen(false)} />
              </div>
            )}
            <div className="canvas-ui-container px-0!">
              <Button variant="ghost" onClick={() => setIsChatOpen((v) => !v)}>
                <NoleIcon /> Nolë
                <Kbd>N</Kbd>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </FullscreenWindowFrame>
  );
}
