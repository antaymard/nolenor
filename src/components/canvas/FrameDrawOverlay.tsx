import type { PointerEvent } from "react";
import type { DrawnRect } from "@/hooks/useFrameDrawTool";

/**
 * La surface de tracé d'une frame : elle couvre le canvas le temps du mode et
 * dessine le rectangle en cours.
 *
 * Une surface à part et pas des handlers posés sur le pane de React Flow :
 * elle capte le pointeur avant lui, donc un appui sur un node ne démarre pas
 * un drag, et un appui sur le vide ne démarre pas un lasso — sans avoir à
 * défaire leurs comportements un par un.
 *
 * Le rectangle est en pixels écran, relatifs à cette surface : c'est le
 * repère dans lequel le geste est lu, et la conversion en coordonnées monde
 * n'arrive qu'au relâcher. Le dessiner en coordonnées monde le ferait
 * dériver si la vue bougeait en cours de tracé.
 */
export default function FrameDrawOverlay({
  rect,
  handlers,
}: {
  rect: DrawnRect | null;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  };
}) {
  return (
    <div
      className="absolute inset-0 z-[5] cursor-crosshair"
      role="presentation"
      {...handlers}
      // Le pointeur peut sortir de la fenêtre en plein tracé : sans ça le
      // rectangle resterait collé au curseur jusqu'au prochain clic.
      onPointerCancel={handlers.onPointerUp}
    >
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[5px] border-2 border-blue-500/70 bg-blue-500/5"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
    </div>
  );
}
