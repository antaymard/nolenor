/**
 * Nettoyages ponctuels de données rendues invalides par un changement de
 * schéma. Une migration jouée jusqu'au bout peut être retirée de ce fichier.
 *
 * Historique (jouées partout, code supprimé) :
 * - `dropAttachedPages` : retirait `attachments.page` de `messageMetadata`.
 * - `dropCanvasViewportArrays` : retirait `slideshows` / `hotspots` de
 *   `canvases` (remplacés par le node `viewport`).
 * - `migrateImageReferencesToBool` : convertissait `values.imageReferences`
 *   (tableau de nodeDataIds) vers `values.imageIncludeReferences` (bool,
 *   défaut `true`), puis supprimait l'ancien champ.
 * - `backfillNodesFromCanvases` / `backfillEdgesFromCanvases` : copiaient les
 *   nodes/edges embarqués (`canvases.nodes` / `canvases.edges`) vers les
 *   tables dédiées `nodes` / `edges`, llmIds préservés, idempotents.
 * - `stripNodesFromCanvases` / `stripEdgesFromCanvases` : retiraient les
 *   champs embarqués des docs canvas (dégonflement) après bascule des
 *   writers, condition préalable au prune des champs dans `canvasesSchema`
 *   (oct. 2026).
 *
 * Patron pour la prochaine fois : une `internalMutation` paginée par lots
 * (cf. `ctx.db.query(...).paginate({ numItems: 200, cursor })`) qui se
 * replanifie via `ctx.scheduler.runAfter(0, internal.migrations.maMigration, …)`
 * tant que `isDone` est faux, à lancer avec
 * `npx convex run migrations:maMigration '{}'` AVANT de pousser le schéma
 * nettoyé.
 */
