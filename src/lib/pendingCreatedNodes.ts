/**
 * Registre des nodes créés localement et pas encore confirmés par le serveur.
 *
 * Pourquoi : une création multi-nodes (`useCreateNodesFromItems`) enchaîne N
 * `addNodes` locaux + N mutations Convex asynchrones. Entre deux, `readCanvas`
 * peut revenir avec une liste partielle (ex. node1 persisté, node2/3 pas
 * encore) ; le sync Convex → ReactFlow (`useCanvasNodes`) reconstruisait alors
 * l'état depuis la seule liste serveur — supprimant les nodes locaux pas
 * encore confirmés, qui réapparaissaient ensuite avec `selected: false`.
 * Résultat : après paste/duplicate de plusieurs nodes, un seul restait
 * sélectionné.
 *
 * Le registre permet au sync de :
 * - garder les nodes locaux en attente (pas de suppression/flicker),
 * - forcer `selected: true` à leur première apparition serveur,
 * - désélectionner les anciens (la sélection finale reste posée par
 *   `useCreateNodesFromItems`, sans toucher au viewport).
 *
 * Pur module (pas de React) : lu/écrit depuis `useCreateNode`,
 * `useCreateNodesFromItems` et `useCanvasNodes`.
 */

const pendingIds = new Set<string>();

/** Marque des ids comme créés localement, en attente de confirmation serveur. */
export function markNodesAsPendingCreation(ids: readonly string[]): void {
  for (const id of ids) pendingIds.add(id);
}

/** Vrai tant que le serveur n'a pas encore renvoyé ce node. */
export function isNodePendingCreation(id: string): boolean {
  return pendingIds.has(id);
}

/**
 * Consomme le statut pending : à appeler quand le serveur a renvoyé le node.
 * Retourne `true` si le node était en attente (=> forcer la sélection).
 */
export function consumePendingCreation(id: string): boolean {
  if (!pendingIds.has(id)) return false;
  pendingIds.delete(id);
  return true;
}

/** Vrai s'il reste des créations non confirmées (garde les nodes locaux). */
export function hasPendingCreations(): boolean {
  return pendingIds.size > 0;
}

/** Nettoyage au changement de canvas : aucun pending ne doit fuiter. */
export function clearPendingCreations(): void {
  pendingIds.clear();
}
