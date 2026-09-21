import { type OpenedWindow } from "@/stores/windowsStore";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import BlocknoteWindow from "./prebuilt/BlocknoteWindow";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleAside } from "./FullscreenNolePanel";

interface FullscreenBlocknoteWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenBlocknoteWindow({
  openedWindow,
}: FullscreenBlocknoteWindowProps) {
  const { nodeDataId } = openedWindow;
  const isTabletPortrait = useIsTabletPortrait();

  return (
    <FullscreenWindowFrame openedWindow={openedWindow} defaultSidePanelOpen>
      <div className="flex min-h-0 flex-1">
        {/* Left: Nolë chat */}
        {!isTabletPortrait && <NoleAside />}

        {/* Middle: editor (full width container, content centered) */}
        <main className="flex min-w-0 flex-1 overflow-hidden [&_.bn-editor]:px-[max(1rem,calc((100%-56rem)/2))]!">
          <div className="h-full w-full overflow-y-auto">
            <BlocknoteWindow nodeDataId={nodeDataId} />
          </div>
        </main>
      </div>
    </FullscreenWindowFrame>
  );
}
