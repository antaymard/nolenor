import { useState } from "react";
import { Spinner } from "@/components/shadcn/spinner";
import { Kbd } from "@/components/shadcn/kbd";
import { cn } from "@/lib/utils";
import { parseTip, type CanvasLoadingSession } from "./canvasLoadingTips";

/**
 * Délai avant que le spinner et l'astuce n'apparaissent : un canvas qui
 * charge vite ne doit rien faire clignoter.
 */
const REVEAL_DELAY_MS = 250;
/** Période de `animate-spin`. */
const SPIN_PERIOD_MS = 1000;

/**
 * L'écran de chargement du canvas, sobre : un spinner et une astuce au
 * centre, sur le fond du canvas. Il ne couvre que la zone du canvas — les
 * coins d'UI du haut restent en place (le coin gauche vit hors du canvas, le
 * droit est un `<Panel>` peint au-dessus, cf. le z-index plus bas).
 *
 * Monté à deux endroits pour une même séance : seul tant que le doc canvas
 * n'est pas là, puis dans le React Flow (`CanvasContent`). D'où `session`,
 * tirée par le parent : l'astuce ne change pas au passage, et les animations
 * se calent sur `startedAt` plutôt que sur le montage, pour ne pas repartir
 * de zéro.
 *
 * `visible` à faux : fondu de sortie, puis plus rien.
 */
export default function CanvasLoadingScreen({
  visible,
  session,
  className,
}: {
  visible: boolean;
  session: CanvasLoadingSession;
  className?: string;
}) {
  const [isGone, setIsGone] = useState(!visible);
  // Figés au montage : changer un `animation-delay` en cours d'animation la
  // ferait sauter.
  const [timing] = useState(() => {
    const now = performance.now();
    return {
      revealDelay: `${REVEAL_DELAY_MS - (now - session.startedAt)}ms`,
      // Phase calée sur l'horloge : le spinner remonté dans le React Flow
      // reprend la rotation où l'autre l'a laissée.
      spinDelay: `${-(now % SPIN_PERIOD_MS)}ms`,
    };
  });

  if (isGone) return null;

  return (
    <div
      // Au-dessus du renderer de React Flow (z 4, peint avant les
      // `children`), sous ses `<Panel>` (z 5). Capte le pointeur pendant le
      // chargement : pas de lasso ni de pan sur un canvas qu'on ne voit pas.
      className={cn(
        "absolute inset-0 z-[4] flex items-center justify-center transition-opacity duration-300 ease-out",
        !visible && "pointer-events-none opacity-0",
        className,
      )}
      onTransitionEnd={(event) => {
        if (!visible && event.target === event.currentTarget) setIsGone(true);
      }}
      aria-busy={visible}
    >
      <div
        className="flex max-w-xs flex-col items-center gap-3 px-6 text-center animate-appear"
        style={{ animationDelay: timing.revealDelay }}
      >
        <Spinner
          className="size-5 text-muted-foreground"
          style={{ animationDelay: timing.spinDelay }}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {parseTip(session.tip).map((part, index) =>
            part.isKey ? (
              <Kbd key={index} className="align-middle">
                {part.text}
              </Kbd>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      </div>
    </div>
  );
}
