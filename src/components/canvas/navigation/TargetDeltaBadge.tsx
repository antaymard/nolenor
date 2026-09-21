import { memo } from "react";
import { TbArrowUp } from "react-icons/tb";
import {
  CENTERED_SCREENS,
  type FramingDelta,
} from "@/lib/canvasViewportFraming";

/**
 * Cap + distance vers un node, version pure (aucun abonnement) : flèche
 * orientée et décalage en fractions d'écran — rien quand la vue est dessus.
 *
 * `TargetDeltaIndicator` y ajoute l'abonnement live.
 */
function TargetDeltaBadge({ delta }: { delta: FramingDelta | null }) {
  // Node centré : rien à montrer (la flèche n'aurait aucun sens, et le
  // décalage annoncé serait du bruit).
  if (!delta || delta.here || delta.screens < CENTERED_SCREENS) return null;

  const label = `This node is about ${delta.screens.toFixed(1)} screens away — the arrow points toward it`;
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
