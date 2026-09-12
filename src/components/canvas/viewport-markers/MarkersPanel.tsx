import { useStore, type ReactFlowState } from "@xyflow/react";
import { TbDirections, TbX } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { markersFromNodes } from "@/lib/viewportMarkers";
import MarkerList from "./MarkerList";

/** Nombre de repères, pour le badge de l'en-tête — l'encart seul l'affiche. */
const selectMarkerCount = (state: ReactFlowState): number =>
  markersFromNodes(state.nodes).length;

/**
 * L'encart « Markers » de la `CanvasToolbar` : la liste des repères du canvas,
 * à portée de clic depuis la barre du bas.
 *
 * Existe en plus de la fenêtre singleton (`ViewportWindow`) parce que celle-ci
 * n'est atteignable qu'en double-cliquant un repère : sur un canvas qui n'en a
 * aucun, ou dont aucun n'est à l'écran, rien n'indiquait où l'on pouvait
 * aller. Les deux rendent le même `MarkerList` — seule la coquille diffère.
 *
 * Gabarit repris de l'ancien panneau des hotspots, que le node `viewport` a
 * remplacé : `canvas-ui-container` passé en colonne, en-tête bordé, corps
 * défilant.
 */
export default function MarkersPanel({ onClose }: { onClose: () => void }) {
  const markerCount = useStore(selectMarkerCount);
  return (
    <div
      role="dialog"
      aria-label="Navigation markers"
      className="canvas-ui-container h-80 max-h-[70vh] w-72 flex-col items-stretch overflow-hidden p-0! shadow-xl ring-1 ring-border/50 animate-appear-zoom origin-bottom"
    >
      <div className="flex w-full shrink-0 items-center justify-between border-b py-2 pr-1.5 pl-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <TbDirections size={14} className="text-muted-foreground" />
          Markers
          {markerCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none font-medium text-muted-foreground tabular-nums">
              {markerCount}
            </span>
          ) : null}
        </h3>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onClose}
          title="Close the markers list"
          aria-label="Close the markers list"
        >
          <TbX className="size-3.5" />
        </Button>
      </div>
      {/* `min-h-0 flex-1` porté par ce wrapper : `MarkerList` se dimensionne
          en `h-full`, ce qui convient au corps (bloc) d'une `WindowFrame` mais
          déborderait sous l'en-tête dans une colonne flex. `w-full` car le
          `items-stretch` ci-dessus est battu par le `items-center` de
          `.canvas-ui-container` (règle hors layer, donc prioritaire) : sans lui
          le corps se centre en shrink-to-fit au lieu de s'étirer. */}
      <div className="min-h-0 w-full flex-1">
        {/* Fermé à la navigation : aller quelque part, c'est vouloir regarder
            le canvas, pas rester devant la liste. `variant="panel"` :
            l'embellissement vit derrière, la fenêtre garde son aspect. */}
        <MarkerList variant="panel" onNavigate={onClose} />
      </div>
    </div>
  );
}
