// Identifiants de présence, partagés client/serveur.
//
// Le composant `@convex-dev/presence` range ses `data` par (room, userId).
// Pour qu'un même utilisateur ouvert dans deux onglets publie deux états
// distincts (sa sélection dans chacun, plus tard), l'identifiant de présence
// est donc par onglet : `<users._id>:<tabId>`. La facepile regroupe ensuite
// par utilisateur réel.

const SEPARATOR = ":";

export function makePresenceUserId(userId: string, tabId: string): string {
  return `${userId}${SEPARATOR}${tabId}`;
}

/** L'id `users` porté par un identifiant de présence, `null` s'il est mal formé. */
export function parsePresenceUserId(presenceUserId: string): string | null {
  const index = presenceUserId.indexOf(SEPARATOR);
  if (index <= 0 || index === presenceUserId.length - 1) return null;
  return presenceUserId.slice(0, index);
}
