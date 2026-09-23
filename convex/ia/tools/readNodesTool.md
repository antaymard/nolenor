# Specs — `read_nodes` tool (`readNodesTool.ts`)

## Vue d'ensemble

Outil exposé au modèle pour lire un ou plusieurs nœuds du canvas courant et retourner leur contenu sous forme de XML LLM-friendly. Il gère aussi bien les nœuds "classiques" (document, lien, …) que les nœuds **PDF**, **table** et **image**, chacun avec un mode par défaut peu coûteux et un mode détaillé sur demande.

**Agents autorisés** : `nole`, `worker`. Également exposé sur le endpoint MCP en accès `read`.

**Sortie** : `{ text: string; images: string[] }`, et non plus une chaîne. `text` est le XML ; `images` porte les URLs que `toModelOutput` transforme en parts image. Le chemin MCP, lui, est textuel : `convex/mcp/execute.ts` aplatit la sortie sur son champ `text`, donc ce qu'un client MCP reçoit est identique à ce qu'il recevait avant.

---

## Input schema (zod)

| Champ          | Type                                         | Obligatoire         | Description                                                                          |
| -------------- | -------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `nodeIds`      | `string[]` (min 1)                           | oui                 | IDs des nœuds à lire                                                                 |
| `withPosition` | `boolean`                                    | non (défaut `true`) | Inclure les attributs de position/dimensions dans les balises `<node>`               |
| `pdfPages`     | `Array<{ nodeId: string, pages: number[] }>` | non                 | Pour les nœuds PDF : pages spécifiques à lire (index 1-based). Si absent → mode TOC. |
| `tableRows`    | `Array<{ nodeId, offset?, limit?, rowIds? }>` | non                 | Pour les nœuds table : pagination ou lignes ciblées. Si absent → les 50 premières lignes. |
| `viewImages`   | `string[]`                                   | non                 | Pour les nœuds image : ids dont les **vraies images** doivent être jointes au résultat. Honoré uniquement si le modèle est multimodal. Si absent → seule la description textuelle indexée. |

---

## Flux d'exécution

1. **Résolution du canvas** : `getCanvasNodesAndEdges` → liste des nœuds + arêtes du canvas courant.
2. **Lecture en parallèle** de chaque `nodeId` via `getNodeWithNodeData`.
3. Pour chaque nœud :
   - Si `type === "image"` → branche image (description indexée, et pixels si `viewImages`).
   - Si `type === "pdf"` → branche PDF.
   - Si `type === "table"` → branche table.
   - Si `pdfPages` / `tableRows` / `viewImages` désigne ce nodeId mais que le nœud n'est pas du bon type → `<warning>` et l'argument est ignoré.
   - Sinon → contenu LLM-friendly standard via `makeNodeDataLLMFriendly`.
4. **Résolution des connexions** : pour chaque arête liée à un nœud demandé, les nœuds connectés (source/target) sont résolus pour exposer leur titre/type dans les attributs `sourceNodes` / `targetNodes`, avec le label de l'arête quand il existe (`data.label`).
5. **Schemas** : pour chaque type de nœud unique présent dans la réponse, un bloc `<schema>` est ajouté avec les outils d'édition et/ou le JSON Schema du nodeData.
6. **Images jointes** : les URLs collectées sont plafonnées, passées par `toModelImageUrl`, et un manifeste `<attachedImages>` est ajouté au XML.
7. Retourne `{ text, images }`.

---

## Branche PDF — détail

### Appels internes

| Étape                   | Appel Convex                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| Récupération des chunks | `searchableChunkWrappers.listPdfPagesByNodeDataId({ nodeDataId })` |

→ Filtre les chunks de type `"page"`, parse leur `metadata` (champs : `page`, `totalPages`, `sections[]`, `hasImages`, `imageCount`), trie par `order`.

Le résultat est un tableau `PdfPageChunk[]` :

```ts
type PdfPageChunk = {
  order: number;
  text: string; // Markdown OCR (Mistral) de la page
  page: number | undefined;
  totalPages: number | undefined;
  sections: Array<{ level: string; title: string }>; // headings détectés
  hasImages: boolean;
  imageCount: number | undefined;
};
```

---

### Cas 1 — PDF non indexé (`pageChunks.length === 0`)

Aucun chunk `"page"` en base. OCR Mistral en attente ou échoué.

```xml
<node id="NODE_ID" type="pdf" sourceNodes="…" targetNodes="…" totalPages="">
  <pdfFiles>
    - document.pdf | application/pdf | https://…
  </pdfFiles>
  <pdfStatus>PDF content not yet indexed (Mistral OCR pending or failed). Files are listed above; retry later.</pdfStatus>
</node>
```

---

### Cas 2 — Mode TOC (pas de `pdfPages` pour ce nœud)

Appelé par `buildPdfTocMarkdown(pageChunks)`.

**Sous-cas 2a — Headings détectés (`structured: true`)**

Le markdown TOC liste toutes les sections par page : `# Titre [n]`, `## Sous-titre [n]`, etc.

```xml
<node id="NODE_ID" type="pdf" sourceNodes="…" targetNodes="…" totalPages="42">
  <pdfFiles>
    - document.pdf | application/pdf | https://…
  </pdfFiles>
  <pdfToc totalPages="42" structured="true">
# Introduction [1]
## Background [2]
# Chapter 1 [5]
### Deep section [7]
  </pdfToc>
  <pdfHint>Call read_nodes with pdfPages=[{nodeId, pages:[…]}] to read full markdown of specific pages.</pdfHint>
</node>
```

**Sous-cas 2b — Pas de headings détectés (`structured: false`)**

Aucune section n'a été trouvée dans l'OCR.

```xml
<node id="NODE_ID" type="pdf" sourceNodes="…" targetNodes="…" totalPages="12">
  <pdfFiles>
    - document.pdf | application/pdf | https://…
  </pdfFiles>
  <pdfToc totalPages="12" structured="false">No headings detected in OCR output. Use pdfPages to read pages directly by 1-based page number.</pdfToc>
  <pdfHint>Call read_nodes with pdfPages=[{nodeId, pages:[…]}] to read full markdown of specific pages.</pdfHint>
</node>
```

---

### Cas 3 — Mode pages (`pdfPages` fourni)

Appelé par `buildPdfPagesMarkdown(pageChunks, requestedPages)`.

**Limites appliquées** (dans `pdfChunkFormatters.ts`) :

- Max **10 pages** par appel (`MAX_PDF_PAGES_PER_CALL`).
- Max **60 000 caractères** cumulés (`MAX_PDF_CHARS_PER_CALL`).
- Les pages dupliquées sont dédupliquées ; l'ordre de rendu est croissant.

**Sous-cas 3a — Pages trouvées, pas de troncature**

```xml
<node id="NODE_ID" type="pdf" sourceNodes="…" targetNodes="…" totalPages="42">
  <pdfFiles>
    - document.pdf | application/pdf | https://…
  </pdfFiles>
  <pdfPage n="3" totalPages="42">
## Section Title

Lorem ipsum OCR text of page 3…
  </pdfPage>
  <pdfPage n="7" totalPages="42">
…
  </pdfPage>
</node>
```

**Sous-cas 3b — Page introuvable**

```xml
<pdfPage n="99" error="page not found" />
```

**Sous-cas 3c — Troncature (trop de pages ou trop de caractères)**

Les pages dépassant la limite sont ignorées silencieusement. Un hint est ajouté :

```xml
<node id="NODE_ID" type="pdf" …>
  <pdfFiles>…</pdfFiles>
  <pdfPage n="1" totalPages="42">…</pdfPage>
  …
  <pdfHint>Output truncated: too many pages or characters requested. Re-call with fewer pages.</pdfHint>
</node>
```

---

## Branche image — détail

La description d'une image vient de l'indexation (`convex/searchable/chunkBuilder.ts`
envoie chaque image à un modèle de vision et stocke `TITLE / IMAGE_TYPE / SUMMARY /
VISIBLE_TEXT / KEY_FACTS / SEARCH_TERMS` dans `searchableChunks`). Elle est le mode
par défaut : quelques centaines de tokens, payés une fois.

### Cas 1 — Défaut (pas de `viewImages` pour ce nœud)

Le bloc complet, plus un `<imageHint>` qui dit au modèle comment regarder vraiment —
uniquement si le modèle est multimodal, sinon le hint désignerait un tool qu'il n'a pas.

```xml
<node id="NODE_ID" type="image" …>
<image url="…" filename="…" order="0">
TITLE: …
IMAGE_TYPE: …
SUMMARY: …
VISIBLE_TEXT: …
KEY_FACTS: …
SEARCH_TERMS: …
</image>
<imagePrompt>…</imagePrompt>
<imageHint>2 image(s) on this node. … re-call read_nodes with viewImages=["NODE_ID"] …</imageHint>
</node>
```

### Cas 2 — `viewImages` fourni, modèle multimodal

Les pixels partent dans le résultat du tool. Le bloc texte est réduit à `VISIBLE_TEXT` :
le modèle voit l'image, donc `SUMMARY`, `KEY_FACTS` et `SEARCH_TERMS` ne lui apprennent
plus rien. `VISIBLE_TEXT` reste, parce qu'il vient d'une passe OCR mono-image dédiée et
qu'un modèle de vision lit moins bien un graphe ou une UI dense — c'est aussi ce qui
autorise de réduire les pixels envoyés (cf. `lib/imageTransform.ts`).

```xml
<image url="…" filename="…" order="0" attached="true">
VISIBLE_TEXT: …
</image>
```

Et, après `</nodeDataSchemas>`, un manifeste qui dit quelle part image vient d'où (le
modèle reçoit N images sans étiquette) :

```xml
<attachedImages count="2" cap="4">
1 | NODE_ID | https://…
2 | NODE_ID | https://…
</attachedImages>
```

### Limites et avertissements

- **Cap : 4 images par appel** (`MAX_ATTACHED_IMAGES_PER_CALL`). Au-delà, les 4
  premières **dans l'ordre de `viewImages`** sont jointes et un `<imageHint>` annonce
  `Attached 4 of N`. Jamais de troncature silencieuse.
- La raison du cap : un résultat de tool est renvoyé en entrée à **chaque step restant**
  du run (`stopWhen: stepCountIs(25)`). Une image ≈ 800 tokens, donc ≈ 800 × steps restants.
- Les URLs jointes sont lues dans `values.images` (`readStoredImages`), **pas** dans les
  metadata du chunk : celles-ci datent de l'indexation et pointent dans le vide si
  l'image a été remplacée depuis.
- Elles passent par `toModelImageUrl` (`convex/lib/imageTransform.ts`), qui les réduit
  via Cloudflare **si et seulement si** `R2_IMAGE_TRANSFORM=cloudflare` (taille réglable
  par `R2_IMAGE_MAX_EDGE`, défaut 768 px). Sinon, URL d'origine inchangée. Désactivé par
  défaut : le gain dépend de l'encodeur du modèle et se mesure, il ne se déduit pas.
- `<warning>` émis dans quatre cas : nœud non-image dans `viewImages`, nœud sans image,
  nodeId absent de `nodeIds`, modèle non multimodal.
- **Image non indexée** (aucun chunk) : `<imageStatus>Image content not yet indexed…</imageStatus>`
  suivi du rendu générique (liens markdown). Les pixels partent quand même si `viewImages`
  le demande — l'indexation n'est pas un préalable pour regarder.

---

## Format global de la réponse XML

```xml
<nodes>
  <!-- Un <node> par nodeId demandé -->
  <node id="…" type="blocknote" sourceNodes="id1 | type | title ; …" targetNodes="…" x="100" y="200" width="300" height="400" title="Mon doc">
    … contenu LLM-friendly …
  </node>

  <node id="…" type="pdf" sourceNodes="…" targetNodes="…" totalPages="42" title="Mon PDF">
    <!-- contenu PDF selon le cas ci-dessus -->
  </node>

</nodes>

<nodeDataSchemas>
  <schema nodeType="blocknote" edition_tools="insert_blocks,replace_block,delete_blocks,update_block_props,patch_block_text"></schema>
  <schema nodeType="table" edition_tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows"></schema>
  <schema nodeType="task" edition_tool="set_node_data">{ … JSON Schema … }</schema>
</nodeDataSchemas>
```

### Attributs `<node>`

| Attribut                       | Présent si                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `id`                          | Toujours                                                                          |
| `type`                        | Toujours                                                                          |
| `title`                       | Toujours                                                                          |
| `sourceNodes` / `targetNodes` | Toujours (chaîne vide si aucune connexion) — format : `"id \| type \| title ; …"`, suivi de `\| label: "…"` quand l'arête porte un label |
| `x`, `y`, `width`, `height`   | Si `withPosition=true` et données disponibles                                     |
| `totalPages`                  | Nœud PDF seulement                                                                |
| `readError`                   | En cas d'erreur de lecture                                                        |

---

## Gestion des erreurs

- Erreur sur un nœud individuel → `<node>` avec `readError` en attribut ou balise CDATA, les autres nœuds continuent.
- Erreur globale → retourne une chaîne `toolError(...)` wrappée (cf. `toolHelpers.ts`).
