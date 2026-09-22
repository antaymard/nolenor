import { useWindowsStore } from "@/stores/windowsStore";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import MinimizedWindowPill from "./MinimizedWindowPill";

export default function MinimizedWindowsStack() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const closeAllMinimizedWindows = useWindowsStore(
    (s) => s.closeAllMinimizedWindows,
  );
  const existingNodeIds = useExistingNodeIds();

  const minimizedWindows = useMemo(
    () =>
      openedWindows.filter(
        (w) => w.windowState === "minimized" && existingNodeIds.has(w.xyNodeId),
      ),
    [openedWindows, existingNodeIds],
  );

  if (minimizedWindows.length === 0) return null;

  return (
    // `shrink-0` : dans la rangée du bas, la pile garde sa largeur et c'est le
    // dock des repères, à sa gauche, qui recule (cf. `routes/canvas/$canvasId`).
    <div className="pointer-events-none ml-auto flex shrink-0 flex-col-reverse items-end gap-1.5">
      {/* Même matériau et même hauteur que le bouton Nolë, à l'autre bout de
          la rangée : le `h-8` sur-mesure d'avant faisait lire la barre du bas
          comme deux UI différentes, et ses `bg-white`/`text-slate-600` codés
          en dur ne connaissaient pas le thème sombre — que
          `.canvas-ui-container`, lui, gère. */}
      <div className="canvas-ui-container pointer-events-auto px-0!">
        <Button
          variant="ghost"
          className="h-10 rounded-lg px-3 font-bold tracking-tight text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={closeAllMinimizedWindows}
          title="Close all minimized windows"
        >
          <Trash2 size={14} />
          Close all ({minimizedWindows.length})
        </Button>
      </div>
      {minimizedWindows.map((w) => (
        <MinimizedWindowPill key={w.xyNodeId} window={w} />
      ))}
    </div>
  );
}
