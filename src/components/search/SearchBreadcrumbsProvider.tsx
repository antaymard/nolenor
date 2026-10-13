import type { ReactNode } from "react";
import { BreadcrumbContext, useBreadcrumbResolver } from "./searchBreadcrumb";

/**
 * Indexe le canvas une fois pour toutes les lignes de résultats.
 *
 * À monter DANS le contenu de la recherche (qui n'existe que lorsqu'elle est
 * ouverte) : il s'abonne aux nodes et edges, donc re-rend à chaque drag. Monté
 * au niveau de la modale toujours présente, il la ferait re-rendre en
 * permanence.
 */
export function SearchBreadcrumbsProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  /** false : pas d'abonnement au canvas, les lignes n'ont pas de fil. */
  enabled?: boolean;
}) {
  if (!enabled) return children;
  return <ActiveProvider>{children}</ActiveProvider>;
}

function ActiveProvider({ children }: { children: ReactNode }) {
  const resolve = useBreadcrumbResolver();

  return (
    <BreadcrumbContext.Provider value={resolve}>
      {children}
    </BreadcrumbContext.Provider>
  );
}
