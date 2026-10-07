// Ce qu'un participant publie dans la présence d'un canvas, partagé
// client/serveur.
//
// Le composant `@convex-dev/presence` stocke `data` en `v.any()` et le
// remplace en bloc à chaque mise à jour : c'est ici qu'on fixe sa forme, et
// tout nouveau champ (viewport, …) s'y ajoute — publié avec les autres, sans
// quoi il effacerait ceux-ci.

/** Au-delà, chaque liste publiée est tronquée : la pill n'a pas besoin de plus. */
export const MAX_PUBLISHED_NODE_IDS = 100;

export type CanvasPresenceData = {
  /** Nodes sélectionnés sur le canvas. */
  selectedNodeIds: string[];
  /** Nodes ouverts en window (hors windows réduites). */
  openNodeIds: string[];
};

function readNodeIdList(data: unknown, key: keyof CanvasPresenceData): string[] {
  if (typeof data !== "object" || data === null) return [];
  const ids = (data as Record<string, unknown>)[key];
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
}

/**
 * Les nodes sur lesquels ce participant est actif : sélectionnés ou ouverts.
 * Lecture défensive d'un `data` reçu de la présence (stocké en `v.any()`).
 */
export function readActiveNodeIds(data: unknown): string[] {
  return [
    ...new Set([
      ...readNodeIdList(data, "selectedNodeIds"),
      ...readNodeIdList(data, "openNodeIds"),
    ]),
  ];
}
