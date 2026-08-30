import { type OpenedWindow } from "@/stores/windowsStore";
import AppWindow from "./prebuilt/AppWindow";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleOverlayBody } from "./FullscreenNolePanel";

interface FullscreenAppWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenAppWindow({
  openedWindow,
}: FullscreenAppWindowProps) {
  const { xyNodeId, nodeDataId } = openedWindow;

  return (
    <FullscreenWindowFrame openedWindow={openedWindow}>
      <NoleOverlayBody>
        <AppWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />
      </NoleOverlayBody>
    </FullscreenWindowFrame>
  );
}
