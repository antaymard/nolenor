import { type OpenedWindow } from "@/stores/windowsStore";
import ImageWindow from "./prebuilt/ImageWindow";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleOverlayBody } from "./FullscreenNolePanel";

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

  return (
    <FullscreenWindowFrame openedWindow={openedWindow}>
      <NoleOverlayBody>
        <ImageWindow nodeDataId={nodeDataId} />
      </NoleOverlayBody>
    </FullscreenWindowFrame>
  );
}
