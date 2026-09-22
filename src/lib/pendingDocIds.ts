import type { Id, TableNames } from "@/../convex/_generated/dataModel";

/**
 * Le préfixe des `_id` factices fabriqués par les créations local-first
 * (`useCreateNode`, `useCreateEdge`) : le doc optimiste habite le cache Convex
 * sous `pending_<llmId>` jusqu'à ce que la mutation réponde avec le vrai `_id`.
 *
 * Centralisé ici parce que le préfixe n'est plus seulement *posé* : il est
 * aussi *lu*. Une window ouverte dans la foulée d'une création pointe sur un
 * `pending_…`, un id que le serveur ne connaît pas — l'UI doit le reconnaître
 * pour afficher un état d'attente plutôt qu'un éditeur qui ne saura pas
 * sauvegarder (cf. `NodeWindowContent`).
 */
const PENDING_DOC_ID_PREFIX = "pending_";

/** L'`_id` factice d'un doc optimiste, dérivé de son llmId. */
export function pendingDocId<T extends TableNames>(llmId: string): Id<T> {
  return `${PENDING_DOC_ID_PREFIX}${llmId}` as Id<T>;
}

/** Vrai pour un `_id` factice : le doc n'existe pas (encore) côté serveur. */
export function isPendingDocId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PENDING_DOC_ID_PREFIX);
}
