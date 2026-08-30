import { type OpenedWindow } from "@/stores/windowsStore";
import TableWindow from "./prebuilt/TableWindow";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleOverlayBody } from "./FullscreenNolePanel";

interface FullscreenTableWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenTableWindow({
  openedWindow,
}: FullscreenTableWindowProps) {
  const { nodeDataId } = openedWindow;

  return (
    <FullscreenWindowFrame openedWindow={openedWindow}>
      <NoleOverlayBody>
        <TableWindow nodeDataId={nodeDataId} />
      </NoleOverlayBody>
    </FullscreenWindowFrame>
  );
}
