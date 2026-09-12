import { memo } from "react";
import { useTargetDelta } from "@/hooks/useViewportFraming";
import type { DeltaTarget } from "@/lib/canvasViewportFraming";
import TargetDeltaBadge from "./TargetDeltaBadge";

/**
 * Cap + distance vers une cible de navigation (cadrage enregistré ou node du
 * canvas), en direct pendant le pan : `TargetDeltaBadge` abonné via
 * `useTargetDelta`.
 *
 * Utilisé par les lignes de repères (`MarkerRow`, donc encart et fenêtre).
 * Les re-renders sont bornés aux crans visibles par l'égalité quantifiée du
 * hook. Doit vivre dans un `ReactFlowProvider` — hors provider (command
 * center), alimenter `TargetDeltaBadge` avec un delta figé.
 */
function TargetDeltaIndicator({ target }: { target: DeltaTarget | null }) {
  const delta = useTargetDelta(target);
  return (
    <TargetDeltaBadge
      delta={delta}
      noun={target?.kind === "node" ? "node" : "marker"}
    />
  );
}

export default memo(TargetDeltaIndicator);
