import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Un onglet du shell mobile. Les trois panneaux restent montés en permanence et
 * l'inactif est masqué par `visibility`, pas par `display:none` : un
 * `<ReactFlow>` sous un ancêtre `display:none` mesure 0×0 et perd son viewport,
 * alors que `visibility:hidden` conserve la boîte de layout. Ça préserve aussi
 * le scroll du chat et la requête de recherche d'un onglet à l'autre.
 *
 * `inert` empêche le focus de partir dans un panneau caché (le composer et le
 * champ de recherche sont focusables).
 */
export default function MobileTabPanel({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      inert={!active}
      aria-hidden={!active}
      className={cn(
        "absolute inset-0",
        !active && "invisible pointer-events-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
