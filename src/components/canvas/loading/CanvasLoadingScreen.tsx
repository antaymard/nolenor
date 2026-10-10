import { useState } from "react";
import {
  HandGrab,
  Lightbulb,
  Mouse,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import { Spinner } from "@/components/shadcn/spinner";
import { Kbd } from "@/components/shadcn/kbd";
import { cn } from "@/lib/utils";
import {
  parseTip,
  type CanvasLoadingSession,
  type Gesture,
  type TipPart,
} from "./canvasLoadingTips";

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
        className="flex max-w-lg flex-col items-center gap-5 px-6 animate-appear"
        style={{ animationDelay: timing.revealDelay }}
      >
        <Spinner
          className="size-8 text-muted-foreground"
          style={{ animationDelay: timing.spinDelay }}
        />
        <div className="canvas-ui-container gap-2.5 px-4 py-2.5">
          <Lightbulb className="size-4 shrink-0 text-amber-500" aria-hidden />
          <p className="text-base leading-7">
            {parseTip(session.tip).map((part, index) => (
              <TipPartView key={index} part={part} />
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}

const GESTURE_VIEWS: Record<Gesture, { icon: LucideIcon; label: string }> = {
  click: { icon: MousePointerClick, label: "click" },
  "right-click": { icon: Mouse, label: "right-click" },
  "double-click": { icon: MousePointerClick, label: "double-click" },
  drag: { icon: HandGrab, label: "drag" },
};

const CHIP_CLASS = "mx-px h-6 min-w-6 px-1.5 align-middle text-sm";

/** Une pièce d'astuce : touche et geste en pastille, flèches estompées. */
function TipPartView({ part }: { part: TipPart }) {
  if (part.kind === "key") {
    return <Kbd className={CHIP_CLASS}>{part.text}</Kbd>;
  }
  if (part.kind === "gesture") {
    const { icon: Icon, label } = GESTURE_VIEWS[part.gesture];
    return (
      <Kbd className={CHIP_CLASS}>
        <Icon className="size-3.5" aria-hidden />
        {label}
      </Kbd>
    );
  }
  return (
    <>
      {part.text.split(/(→|·)/).map((chunk, index) =>
        chunk === "→" || chunk === "·" ? (
          <span key={index} className="text-muted-foreground/70">
            {chunk}
          </span>
        ) : (
          <span key={index}>{chunk}</span>
        ),
      )}
    </>
  );
}
