# Split canvas.nodes / canvas.edges → 3 tables — Suivi

> Objectif : sortir `nodes` et `edges` du doc `canvases` (inline) vers deux tables
> dédiées `canvasNodes` et `canvasEdges`. `canvases` ne garde que métadonnées +
> `background`.
>
> Statut : **étape 0 — cadrage en cours, aucun code modifié**.

---

## 0. État des lieux (vérifié 2026-09-11)

### Schéma actuel
- `convex/schemas/canvasesSchema.ts` :
  - `canvasNodesValidator` : `{ id: string, nodeDataId?: Id<nodeDatas>, type, position {x,y}, width, height, locked?, hidden?, zIndex?, color?, variant?, parentId?, extent?, extendParent?, data? }`.
  - `edgesValidator` : `{ id: string, source: string, target: string, sourceHandle?, targetHandle?, markerEnd?, data? }`.
  - `canvasesValidator` : `{ creatorId, name, description?, isPublic?, isSystem?, nodes?: CanvasNode[], edges?: Edge[], background?, updatedAt }`.
- `convex/schema.ts` : `canvases` indexé `by_creator`, `by_creator_and_updatedAt`, search `search_name`. Pas de table nodes/edges.
- `createCanvasForUser` insère `nodes: [], edges: []`.

### Lecteurs / écrivains de `canvas.nodes` / `canvas.edges` (inventaire)
Backend (`convex/`) :
- `models/canvasModels.ts` : `listUserCanvasesWithShares` et `dataExport.listCanvasesForExport` calculent `nodeCount` via `canvas.nodes?.length ?? 0`. `readCanvasById` retourne le doc entier.
- `models/canvasNodeModels.ts` : `add`, `updatePositionOrDimensions`, `updateCanvasNodes` (props+data), `remove` (+ cascade scheduler `nodeDataWrappers.deleteWithCascade`), `moveToCanvas` (déplace nodes + prune edges + re-pointe `nodeDatas.canvasId` + `SearchableChunkModels.updateCanvasId`), `getNodeWithNodeData`.
- `models/canvasEdgeModels.ts` : `add` (+ `markerEnd` défaut + garde-fou self-edge), `update`, `remove`. Tout en `patch` du doc parent.
- `wrappers/canvasNodeWrappers.ts#getCanvasNodesAndEdges` : point d'entrée unique des tools IA + `chunkBuilder` (retourne `{ nodes, edges }` depuis le doc).
- `nodeDatas.ts#listByCanvasId` + `listRecentByCanvasId` : résolvent les `nodeDataId` **en parcourant `canvas.nodes`**, puis `db.get` un par un.
- `models/nodeTemplateModels.ts` (listForCanvas), `ia/imageGeneration.ts`, `ia/helpers/generateCanvasMinimap.ts`, `ia/helpers/getCanvasChangesSinceLastMessage.ts` : itèrent `canvas.nodes / canvas.edges`.
- `models/onboardingModels.ts#cloneCanvasForUser` : clone nodeDatas, remappe `node.nodeDataId`, filtre edges orphelines, `patch({ edges })`.
- `ia/tools/*` : `listNodesTool`, `readNodesTool`, `createConnectionTool`, `table*Tool` passent par `getCanvasNodesAndEdges`.

Frontend (`src/`) :
- `readCanvas` = **seule subscription realtime** (`useCanvasBootstrap` + `routes/canvas/$canvasId.tsx` + `MobileCanvas.tsx`). Le doc entier (nodes+edges) transite à chaque patch.
- `useCanvasBootstrap` strippe `nodes/edges` pour `canvasStore` (`Omit<Doc<"canvases">, "nodes"|"edges">`).
- `useCanvasNodes.ts` / `useUpdateCanvasNode.ts` / `useUpdateCanvasEdge.ts` / `useTitleNodeSizing.ts` / `CanvasFormModal` / `CanvasBackgroundPanel` font des **optimistic updates** via `localStore.getQuery(api.canvases.readCanvas)` + `setQuery`.
- `types/convex/canvas.ts` : `CanvasNode = Doc<"canvases">["nodes"][number]`, `Edge = ...["edges"][number]`.
- `lib/export/buildExportFiles.ts` : `canvas.nodes` porte **l'ordre voulu** + lien vers nodeData ; `canvas.edges` direct.
- `lib/pendingCreatedNodes.ts` : commente la fenêtre entre `addNodes` locaux et N mutations (lié à `readCanvas` partiel).

### Pourquoi splitter (rappel)
- Doc `canvases` jusqu'à ~1 Mo (cf. commentaire `dataExport.ts`), limite Convex 1 Mo/doc + 8192 entrées/array.
- **Contention OCC** : deux users qui bougent deux nodes différents patchent le même doc → conflits/retries.
- `nodeCount` et exports obligés de lire tout le doc.
- Pagination impossible sur un array inline.

---

## 1. Cible proposée

```ts
// canvases : métadonnées seules
canvases = defineTable({
  creatorId, name, description?, isPublic?, isSystem?,
  background?, updatedAt,
  // option : nodeCount dénormalisé (voir §3 Q3)
})

// Nouvelle table — 1 doc par node
canvasNodes = defineTable({
  canvasId: v.id("canvases"),
  nodeId: v.string(),          // ex-id ReactFlow `node.id`, stable, référencé par edges/handles/mentions
  nodeDataId?: v.id("nodeDatas"),
  type, position, width, height,
  locked?, hidden?, zIndex?, color?, variant?,
  parentId?, extent?, extendParent?, data?,
  // option : sortOrder? / createdAt? si l'ordre du tableau compte (export)
  updatedAt: v.number(),
})
  .index("by_canvasId", ["canvasId"])
  .index("by_canvas_and_nodeId", ["canvasId", "nodeId"])  // lookup ciblé + unicité logique
  .index("by_nodeDataId", ["nodeDataId"])                  // cascade inverse (option)

// Nouvelle table — 1 doc par edge
canvasEdges = defineTable({
  canvasId: v.id("canvases"),
  edgeId: v.string(),          // ex-`edge.id`
  source: v.string(),          // nodeId logique, PAS un Id<>
  target: v.string(),
  sourceHandle?, targetHandle?, markerEnd?, data?,
  updatedAt: v.number(),
})
  .index("by_canvasId", ["canvasId"])
  .index("by_canvas_and_edgeId", ["canvasId", "edgeId"])
```

Points fermes proposés (à valider) :
- On **garde les ids logiques `string`** (`node.id`, `edge.id`) comme clés métier. Les `_id` Convex deviennent des clés techniques. Justification : edges, `parentId`, mentions `[[node:<nodeId>]]`, `searchableChunks.nodeId`, handles ReactFlow, optimistic UI et tools IA parlent tous en `nodeId: string` aujourd'hui. Changer ça = migration de toutes les références.
- `nodeDatas.canvasId` reste la source de vérité du rattachement contenu ; `canvasNodes.nodeDataId` reste le pont visuel↔contenu.
- `background` reste dans `canvases` (déjà isolé, petit, patché seul).

---

## 2. Plan étape par étape (proposé)

| # | Étape | Contenu | Validation |
|---|-------|---------|------------|
| 1 | Schéma + validators | Extraire `canvasNodesValidator` / `edgesValidator` vers `canvasNodesSchema.ts` / `canvasEdgesSchema.ts` (avec `canvasId` + `nodeId`/`edgeId` + `updatedAt`), garder `canvasesValidator` sans nodes/edges. Ajouter tables + index dans `schema.ts`. Types front `canvas.ts` re-pointés. | `tsc`, `convex dev --once` passe, aucun appel modifié |
| 2 | Double-lecture | Nouvelles queries `canvasNodes.listByCanvas` / `canvasEdges.listByCanvas` + `getCanvasNodesAndEdges` re-routé (lit les 2 tables). `readCanvas` ne retourne plus que métadonnées. Front : `useCanvasBootstrap` souscrit aux 3 queries. | 1 canvas de test s'affiche à l'identique avec doc vide de nodes |
| 3 | Écritures nodes/edges sur tables | Réécrire `canvasNodeModels` / `canvasEdgeModels` (insert/patch/delete par doc, plus de `patch(canvases)` géant). `updatedAt` du parent bumpé via patch léger. | Tests manuels add/move/remove/update |
| 4 | Migration backfill | Script `migrations/backfillCanvasNodesAndEdges` : pour chaque `canvases` avec nodes/edges inline → insert docs enfants, idempotent (skip si enfants existants), puis `patch(canvases, {nodes: undefined...})` — en pratique recréer sans les champs. Dry-run d'abord. | Comptes dev + prod-preview |
| 5 | Cascades & transverses | `deleteCanvasAndShares`, `moveToCanvas`, `cloneCanvasForUser` (onboarding), `nodeCount` (compteur vs `count()`), `listByCanvasId`/`listRecentByCanvasId` (via `by_canvasId` au lieu du scan du doc), export, `chunkBuilder`, tools IA. | Checklist §4 cochée |
| 6 | Front optimistic + realtime | Réécrire les `setQuery(readCanvas)` en `setQuery(listByCanvas)` ; `useCanvasNodes` sync depuis 2 queries ; `pendingCreatedNodes` adapté. | Drag/resize/undo perçus sans flash |
| 7 | Nettoyage | Supprimer champs `nodes/edges` du validator, supprimer code legacy double-écriture, maj `dataExport` comments (1 Mo), docs IA (`readNodesTool.md`, prompts). | `grep canvas\.nodes` ne rend que l'historique |

---

## 3. Questions à trancher avant l'étape 1

1. **Clé node** : garder `nodeId: string` métier + `_id` technique (recommandé) vs basculer tout en `Id<"canvasNodes">` ? Le 2e casse edges/mentions/chunks/tools.
2. **Ordre des nodes** : `buildExportFiles` dit que l'ordre du tableau compte. On ajoute `sortOrder: number` (ou `createdAt`) ou l'ordre est reconstructible (zIndex/position) ? Sans ça l'export change d'ordre.
3. **`nodeCount`** : compteur dénormalisé sur `canvases` (write à chaque add/remove, lecture O(1) pour sidebar/home/export) vs `ctx.db.query(...).count()` à chaque listing (simple mais N queries) ?
4. **Migration** : big-bang avec maintenance (simple, downtime) vs double-écriture transitoire (zéro downtime, plus de code) ? Volume prod à estimer d'abord (`count nodes/edges inline`).
5. **`updatedAt` parent** : chaque mutation node/edge bump `canvases.updatedAt` (garde le tri sidebar/home + `getLastModified`, mais recrée de la contention sur le parent) vs `updatedAt` seulement sur mutations métadonnées (sidebar ne remonte plus au drag) ?
6. **Unicité** : contrainte `nodeId` unique par canvas appliquée en code (pas d'index unique Convex) — accepter le risque de doublon en concurrence ou sérialiser via check-then-insert ?

---

## 4. Implications / risques (à vérifier à chaque étape)

- **Realtime x3** : 3 subscriptions au lieu d'1 → 3x `useQuery`, loading states composés, `useCanvasBootstrap` cleanup, coût bande passante. Gagné : patches fins (un drag ne re-télécharge plus tout le canvas).
- **Transactions** : Convex = 1 transaction par mutation. `moveToCanvas` touchait 2 docs `canvases` ; après split il touchera N docs nodes/edges + 2 parents + N nodeDatas + chunks. Risque limite transaction (16 Mo / 1000 writes ?). Prévoir batching + scheduler.
- **OCC inversée** : fini les conflits inter-nodes, mais `nodeCount` dénormalisé ou `updatedAt` parent reintroduisent un point chaud. À doser (Q3/Q5).
- **Suppression canvas** : aujourd'hui `deleteCanvasAndShares` schedule N `deleteWithCascade` puis `db.delete(canvas)`. Après : supprimer aussi N `canvasNodes` + M `canvasEdges` (ou scheduler). Oubli = orphelins facturés.
- **Remove nodes** : ne pas oublier de pruner les edges incidentes (aujourd'hui `moveToCanvas` le fait, `removeCanvasNodes` ne touche pas aux edges — vérifier si volontaire ou bug à corriger au passage).
- **Onboarding/clone** : `cloneCanvasForUser` en 1 transaction avec boucle `createNodeData` — avec N inserts nodes/edges en plus, risque de dépasser les limites. Prévoir chunking ou action.
- **`searchableChunks`** : `by_nodeId: string` reste valide si on garde les nodeIds logiques. `chunkBuilder.rebuildChunksBatch` et `updateCanvasId` à re-câbler sur la nouvelle source (`by_canvasId` sur `canvasNodes`).
- **`nodeDatas.listByCanvasId`** : réécrire via `canvasNodes.by_canvasId` (collect nodeDataIds) au lieu du scan du doc parent. Même perf, sans le 1 Mo.
- **Export** : `getCanvasForExport` doit assembler `canvas + nodes + edges` ; `listCanvasesForExport.nodeCount` vient du compteur ; `canvas.json` garde le même format pour rétro-compat (sinon l'import casse).
- **IA / MCP** : `getCanvasNodesAndEdges` garde sa signature (les tools ne voient pas le split). Prompts (`noleSystemPrompt`, `readNodesTool.md`) parlent de `canvas.nodes` — maj cosmétique mais évite la confusion future.
- **Mentions `[[node:id]]` + `parentId` + handles** : pas de changement si ids logiques conservés. Sinon migration de contenu BlockNote (dangereux).
- **Sécurité** : `requireCanvasAccess` reste au niveau canvas ; pas de partage au niveau node/edge. Les nouvelles queries/mutations doivent toutes la checker (ne pas exposer `canvasNodes` en lecture directe sans garde).
- **Front optimistic** : ~6 fichiers patchent le cache `readCanvas`. Chaque `setQuery` doit être re-pointé, sinon UI fantôme (write serveur OK mais cache local jamais invalidé).
- **Mobile** : `MobileCanvas.tsx` consomme `canvas.nodes/edges` comme le desktop — même refactor.
- **Tests** : pas de suite trouvée sur canvas ; prévoir au minimum un script de non-régression (add → move → remove → export → clone) + `convex-test` si on veut verrouiller (skill `convex-test` dispo).

---

## Journal

- **2026-09-11 — Étape 0 (cadrage)** : inventaire lecteurs/écrivains, proposition cible + plan 7 étapes + 6 questions. En attente des arbitrages avant étape 1.
