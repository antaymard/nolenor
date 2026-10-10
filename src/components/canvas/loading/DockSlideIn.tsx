import type { ReactNode } from "react";

/**
 * Un dock du bas du canvas, qui monte depuis le bord de l'écran quand le
 * chargement se termine.
 *
 * Monté dès le départ mais invisible (et inerte) : ses propres queries
 * chargent en même temps que le canvas, et il arrive prêt. `delay` décale les
 * docks entre eux.
 */
export default function DockSlideIn({
  revealed,
  delay = 0,
  children,
}: {
  revealed: boolean;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={revealed ? "animate-dock-slide-in" : "invisible"}
      style={revealed ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
