import { TbArrowBackUp, TbArrowForwardUp } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useCanvasStore } from "@/stores/canvasStore";

/**
 * Les deux flèches d'annulation du bandeau haut-gauche.
 *
 * Composant à part, et pas deux boutons posés dans `CanvasSidebar` : c'est ici
 * qu'on s'abonne aux piles, donc c'est ici — et ici seulement — que ça re-rend
 * à chaque geste. La sidebar, elle, porte tout le canvas en `children`.
 *
 * Le clavier reste la voie principale (cf. `CanvasFlow`) ; ces boutons servent
 * la découvrabilité — un undo qu'on ne voit pas est un undo qu'on n'essaie
 * pas. Desktop seulement : le mobile a son propre arbre (`MobileCanvas`) et
 * ne monte pas la sidebar.
 */
export default function CanvasHistoryControls({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const permission = useCanvasStore((state) => state.canvas?._permission);
  const { undo, redo, canUndo, canRedo } = useCanvasHistory(canvasId);

  if (!permission || permission === "viewer") return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={!canUndo}
        onClick={() => void undo()}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <TbArrowBackUp size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={!canRedo}
        onClick={() => void redo()}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
      >
        <TbArrowForwardUp size={14} />
      </Button>
    </>
  );
}
