import { memo } from "react";
import { TbArrowUp } from "react-icons/tb";
import {
  CENTERED_SCREENS,
  type FramingDelta,
} from "@/lib/canvasViewportFraming";

/**
 * Cap + distance vers une cible, version pure (aucun abonnement) : flèche
 * orientée et décalage en fractions d'écran — rien quand la vue est dessus.
 *
 * `TargetDeltaIndicator` y ajoute l'abonnement live ; le command center, hors
 * `ReactFlowProvider`, l'alimente avec un delta figé à l'ouverture (la vue ne
 * bouge pas tant que la modale est ouverte).
 */
function TargetDeltaBadge({
  delta,
  noun,
}: {
  delta: FramingDelta | null;
  noun: "marker" | "node";
}) {
  if (!delta || delta.match === "here") return null;

  // Même position, zoom différent — et seulement quand on connaît le zoom de
  // référence : l'angle serait du bruit, on montre l'écart plutôt qu'un
  // « 0,0 » qui n'aide pas. Cible node centrée : rien (pas de zoom à
  // montrer, et la flèche n'aurait aucun sens).
  if (delta.screens < CENTERED_SCREENS) {
    if (delta.zoomRatio === null) return null;
    const label = `You're at this ${noun} — only the zoom differs (×${delta.zoomRatio.toFixed(1)})`;
    return (
      <span
        className="shrink-0 text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums"
        title={label}
        aria-label={label}
      >
        ×{delta.zoomRatio.toFixed(1)}
      </span>
    );
  }

  const label = `This ${noun} is about ${delta.screens.toFixed(1)} screens away — the arrow points toward it`;
  return (
    <span
      className="flex shrink-0 items-center gap-0.5 text-muted-foreground"
      title={label}
      aria-label={label}
    >
      <TbArrowUp
        size={14}
        aria-hidden
        style={{ transform: `rotate(${delta.angleDeg}deg)` }}
      />
      <span className="min-w-6 text-[11px] font-medium whitespace-nowrap tabular-nums">
        {delta.screens.toFixed(1)}
      </span>
    </span>
  );
}

export default memo(TargetDeltaBadge);
