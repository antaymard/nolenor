import type { OpenedWindow } from "@/stores/windowsStore";
import { LinkEditControl } from "@/components/nodes/edit/LinkEditControl";
import { PdfEditControl } from "@/components/nodes/edit/PdfEditControl";
import { VideoEditControl } from "@/components/nodes/edit/VideoEditControl";
import { AppTitleEditControl } from "@/components/nodes/edit/AppTitleEditControl";
import { ImageEditControl } from "@/components/nodes/edit/ImageEditControl";

interface WindowEditControlProps {
  openedWindow: Pick<
    OpenedWindow,
    "nodeType" | "nodeDataId" | "xyNodeId"
  >;
}

/**
 * Bouton Edit + popover/dialog d'édition dans le header d'une window.
 *
 * Point d'entrée unique (DRY) : le header flottant (`WindowFrame`) et le plein
 * écran (`FullscreenWindowFrame`) rendent la même ligne, le dispatch par
 * `nodeType` choisit le contrôle partagé avec la toolbar canvas (`nodes/edit`,
 * `variant="window"` pour le trigger au format header).
 *
 * Rend `null` pour les types sans édition (blocknote, table…) : aucun `if`
 * dans les frames.
 */
export function WindowEditControl({ openedWindow }: WindowEditControlProps) {
  const { nodeType, nodeDataId, xyNodeId } = openedWindow;

  switch (nodeType) {
    case "link":
      return <LinkEditControl nodeDataId={nodeDataId} variant="window" />;
    case "pdf":
      return <PdfEditControl nodeDataId={nodeDataId} variant="window" />;
    case "video":
      return <VideoEditControl nodeDataId={nodeDataId} variant="window" />;
    case "app":
      return <AppTitleEditControl nodeDataId={nodeDataId} variant="window" />;
    case "image":
      return (
        <ImageEditControl
          nodeDataId={nodeDataId}
          xyNodeId={xyNodeId}
          variant="window"
        />
      );
    default:
      return null;
  }
}
