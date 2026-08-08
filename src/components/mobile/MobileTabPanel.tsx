import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Un onglet du shell mobile. Les trois panneaux restent montés en permanence :
 * le canvas alimente le store xy-flow que lisent le chat et les mentions, et
 * chaque onglet garde son scroll / sa requête d'un aller-retour à l'autre.
 *
 * Le masquage de l'inactif se fait par `opacity`, et le choix est contraint des
 * deux côtés :
 * - pas `display:none` : un `<ReactFlow>` sous un ancêtre `display:none` mesure
 *   0×0, log l'erreur #004 et perd son viewport ;
 * - pas `visibility:hidden` : React Flow pose un `visibility: visible` *inline*
 *   sur chaque node dès qu'il a des dimensions (NodeWrapper), ce qui annule le
 *   masquage de l'ancêtre — les nodes repassaient devant le chat et la
 *   recherche.
 *
 * `opacity` s'applique au sous-arbre comme un groupe : aucun descendant ne peut
 * s'en extraire, et la boîte de layout est conservée.
 *
 * `inert` empêche le focus de partir dans un panneau caché (le composer et le
 * champ de recherche sont focusables) ; `pointer-events-none` laisse passer les
 * taps vers l'onglet actif.
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
        active ? "z-10" : "pointer-events-none opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
