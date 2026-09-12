import type { Doc, Id } from "@/../convex/_generated/dataModel";

/**
 * Dernier document serveur connu pour chaque node, edge et nodeData du canvas
 * ouvert.
 *
 * Pourquoi : restaurer une suppression, c'est réinsérer une ligne dans le
 * cache de `nodes.listFromCanvas` — donc il faut le document ENTIER, avec ses
 * `_id`, `_creationTime` et `canvasId`. Or c'est précisément le document qui
 * vient de disparaître de la liste, et les DTO que manipule le canvas
 * (`toCanvasNode`, `toCanvasEdge`) ont laissé ces champs derrière eux. Sans ce
 * registre, l'update optimiste d'un untrash n'aurait rien à écrire et le node
 * ne réapparaîtrait qu'au retour du serveur.
 *
 * Le registre ne supprime jamais sur resync : c'est le document absent de la
 * liste qu'on veut garder sous la main. Il est vidé au changement de canvas,
 * et borné par la taille du canvas courant.
 *
 * Pur module (pas de React), comme `pendingCreatedNodes` : alimenté par
 * `useCanvasBootstrap` et la modale corbeille, lu depuis les updates
 * optimistes de `useCanvasHistory` et `useUntrashNodes`.
 */

const nodeDocs = new Map<string, Doc<"nodes">>();
const edgeDocs = new Map<string, Doc<"edges">>();
const nodeDataDocs = new Map<Id<"nodeDatas">, Doc<"nodeDatas">>();

/** Upsert, jamais de suppression — cf. le commentaire du module. */
export function rememberNodeDocs(docs: readonly Doc<"nodes">[]): void {
  for (const doc of docs) nodeDocs.set(doc.id, doc);
}

export function rememberEdgeDocs(docs: readonly Doc<"edges">[]): void {
  for (const doc of docs) edgeDocs.set(doc.id, doc);
}

export function rememberNodeDataDocs(
  docs: readonly Doc<"nodeDatas">[],
): void {
  for (const doc of docs) nodeDataDocs.set(doc._id, doc);
}

/**
 * Le document tel qu'il était vivant : `status` et `trashedAt` sont retirés,
 * puisque l'appelant s'en sert pour peindre un élément de nouveau présent.
 */
export function getLiveNodeDoc(llmId: string): Doc<"nodes"> | undefined {
  const doc = nodeDocs.get(llmId);
  if (!doc) return undefined;
  const { status: _status, trashedAt: _trashedAt, ...live } = doc;
  return live as Doc<"nodes">;
}

export function getLiveEdgeDoc(llmId: string): Doc<"edges"> | undefined {
  const doc = edgeDocs.get(llmId);
  if (!doc) return undefined;
  const { status: _status, trashedAt: _trashedAt, ...live } = doc;
  return live as Doc<"edges">;
}

export function getNodeDataDoc(
  nodeDataId: Id<"nodeDatas">,
): Doc<"nodeDatas"> | undefined {
  return nodeDataDocs.get(nodeDataId);
}

/** Nettoyage au changement de canvas : aucun document ne doit fuiter. */
export function clearCanvasDocCache(): void {
  nodeDocs.clear();
  edgeDocs.clear();
  nodeDataDocs.clear();
}
