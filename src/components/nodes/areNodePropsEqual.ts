import type { XyNodeProps } from "@/types/domain";

const EMPTY: Record<string, unknown> = {};

/**
 * Shallow-compare two data objects by their own enumerable keys.
 * Returns true when every value is reference-equal (`displayOptions`
 * excepted, compared one level deeper) and both sides have the same set of
 * keys.
 */
function shallowEqualData(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  if (a === b) return true;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] === b[key]) continue;
    // Seul objet imbriqué de `data` : Convex le recrée à chaque sync, comme
    // `data` lui-même. Comparé par référence, il re-rendrait à chaque sync
    // tous les nodes qui portent une option d'affichage.
    if (
      key === "displayOptions" &&
      shallowEqualData(
        (a[key] ?? EMPTY) as Record<string, unknown>,
        (b[key] ?? EMPTY) as Record<string, unknown>,
      )
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Custom comparator for React.memo on ReactFlow node components.
 *
 * Prend des `XyNodeProps` et non un `Node` : c'est bien ce que React Flow
 * passe au composant, donc ce que memo compare.
 * ReactFlow passes internal props (measured, internals, etc.) that change
 * on every render cycle, defeating memo's shallow comparison.
 * This comparator only checks the props that actually affect rendering.
 *
 * `data` is shallow-compared instead of using reference equality because
 * Convex syncs recreate new data objects even when the content is identical,
 * which would otherwise force every node to re-render on every sync.
 */
export function areNodePropsEqual(
  prev: XyNodeProps,
  next: XyNodeProps,
): boolean {
  return (
    prev.id === next.id &&
    shallowEqualData(prev.data, next.data) &&
    prev.selected === next.selected &&
    prev.dragging === next.dragging &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.type === next.type &&
    // Entrer dans une frame ou en sortir ne change rien d'autre dans les
    // props : sans cette comparaison, un node mémoïsé garderait le rendu
    // qu'il avait avant le changement d'appartenance.
    prev.parentId === next.parentId
  );
}
