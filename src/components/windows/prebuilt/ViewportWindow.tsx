import { memo } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import MarkerList from "@/components/canvas/viewport-markers/MarkerList";

/**
 * La fenêtre d'un node `viewport` : tous les repères du canvas, avec
 * navigation, renommage, recapture, suppression et réordonnancement.
 *
 * Une coquille : la liste elle-même est partagée avec l'encart de la
 * `CanvasToolbar` (`MarkersPanel`). Le `nodeDataId` reçu est celui du repère
 * qui possède la fenêtre — la window `viewport` est un singleton par canvas
 * et change de propriétaire au dernier marker cliqué (cf. `windowsStore`) —
 * et ne sert donc qu'au surlignage de sa ligne.
 */
function ViewportWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  return <MarkerList currentNodeDataId={nodeDataId} />;
}

export default memo(ViewportWindow);
