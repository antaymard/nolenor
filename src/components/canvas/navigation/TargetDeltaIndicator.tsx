import { memo } from "react";
import { useTargetDelta } from "@/hooks/useViewportFraming";
import type { DeltaTarget } from "@/lib/canvasViewportFraming";
import TargetDeltaBadge from "./TargetDeltaBadge";

/**
 * Cap + distance vers une cible du canvas (node, sélection, ou point monde),
 * en direct pendant le pan : `TargetDeltaBadge` abonné via `useTargetDelta`.
 *
 * Les re-renders sont bornés aux crans visibles par l'égalité quantifiée du
 * hook. Doit vivre dans un `ReactFlowProvider`.
 */
function TargetDeltaIndicator({ target }: { target: DeltaTarget | null }) {
  const delta = useTargetDelta(target);
  return <TargetDeltaBadge delta={delta} />;
}

export default memo(TargetDeltaIndicator);
