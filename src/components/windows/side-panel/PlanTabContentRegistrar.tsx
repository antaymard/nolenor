import { useEffect, type ReactNode } from "react";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";

/**
 * Publishes `content` as the Plan tab's content for as long as this stays
 * mounted, then clears it.
 *
 * Needed when the outline/scroll logic lives in a Fullscreen*Window component
 * itself (e.g. `FullscreenPdfWindow`'s `transformRef`) rather than in the
 * shared body it renders as `children` of `FullscreenWindowFrame`: that parent
 * component sits ABOVE `WindowFrameContext.Provider` in the tree (it's the one
 * rendering the frame that owns the Provider), so `useWindowFrameContext()`
 * called directly in its body would only see the no-op default. Rendering this
 * tiny component as part of `children` puts the call where the Provider can
 * actually reach it, without moving the ref-owning logic itself.
 */
export function PlanTabContentRegistrar({
  content,
}: {
  content: ReactNode | null;
}) {
  const { setPlanTabContent } = useWindowFrameContext();
  useEffect(() => {
    setPlanTabContent(content);
    return () => setPlanTabContent(null);
  }, [content, setPlanTabContent]);
  return null;
}
