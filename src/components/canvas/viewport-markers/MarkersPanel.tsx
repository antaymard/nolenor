import { TbDirections, TbX } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import MarkerList from "./MarkerList";

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
  return (
    <div className="canvas-ui-container h-80 max-h-[70vh] w-64 flex-col items-stretch overflow-hidden p-0! shadow-lg animate-appear-zoom origin-bottom">
      <div className="flex w-full shrink-0 items-center justify-between border-b py-1 pr-1 pl-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <TbDirections size={14} className="text-muted-foreground" />
          Markers
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
          déborderait sous l'en-tête dans une colonne flex. */}
      <div className="min-h-0 flex-1">
        {/* Fermé à la navigation : aller quelque part, c'est vouloir regarder
            le canvas, pas rester devant la liste. */}
        <MarkerList onNavigate={onClose} />
      </div>
    </div>
  );
}
