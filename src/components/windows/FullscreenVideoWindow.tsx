import { type OpenedWindow } from "@/stores/windowsStore";
import VideoWindow from "./prebuilt/VideoWindow";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleOverlayBody } from "./FullscreenNolePanel";

interface FullscreenVideoWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenVideoWindow({
  openedWindow,
}: FullscreenVideoWindowProps) {
  const { xyNodeId, nodeDataId } = openedWindow;

  return (
    <FullscreenWindowFrame openedWindow={openedWindow}>
      <NoleOverlayBody>
        <VideoWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />
      </NoleOverlayBody>
    </FullscreenWindowFrame>
  );
}
