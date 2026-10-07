// Ce qu'un participant publie dans la présence d'un canvas, partagé
// client/serveur.
//
// Le composant `@convex-dev/presence` stocke `data` en `v.any()` et le
// remplace en bloc à chaque mise à jour : c'est ici qu'on fixe sa forme, et
// tout nouveau champ (viewport, node en édition…) s'y ajoute.

/** Au-delà, la sélection publiée est tronquée : la pill n'a pas besoin de plus. */
export const MAX_PUBLISHED_SELECTION = 100;

export type CanvasPresenceData = {
  selectedNodeIds: string[];
};

/** Lecture défensive d'un `data` reçu de la présence (stocké en `v.any()`). */
export function readSelectedNodeIds(data: unknown): string[] {
  if (typeof data !== "object" || data === null) return [];
  const ids = (data as { selectedNodeIds?: unknown }).selectedNodeIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
}
