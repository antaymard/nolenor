# Specs — `nole read` (`readNodes.ts`, `readNodes.xml.ts`, `readNodes.cli.ts`)

## Vue d'ensemble

Commande du shell de l'agent (tool `bash`) pour lire un ou plusieurs nœuds du canvas courant et retourner leur contenu sous forme de XML LLM-friendly. Elle gère aussi bien les nœuds "classiques" (document, lien, …) que les nœuds **PDF**, **table**, **image** et **audio/vidéo**, chacun avec un mode par défaut peu coûteux et un mode détaillé sur demande.

C'est le seul chemin de lecture : le tool JSON `read_nodes` a été retiré. Les blocs d'un document sortent au format que prennent les tools d'écriture. Les pixels d'une image ne passent plus par ici : c'est `view_image`.

**Disponible pour** : Nolë, le worker, et le endpoint MCP (accès `read`), via `bash`.

---

## Options (`nole read --help`)

| Option | Description |
| --- | --- |
| `<id>…` ou `-` | Les nœuds à lire ; `-` lit les ids sur stdin (premier champ de chaque ligne). 200 au plus. |
| `--pages <n,n…>` | Nœuds PDF : ces pages (1-based) au lieu de la table des matières. |
| `--rows <offset:limit>` / `--row-ids <id,id…>` | Nœuds table : une tranche (défaut 0:50, max 200) ou des lignes précises. Toutes les lignes : `nole table`. |
| `--range <start:end>` | Nœuds audio/vidéo : le transcript de cette plage, en secondes. |
| `--no-position` | Sans x, y, width, height. |
| `--format jsonl` | Un objet par nœud `{id, type, title, ok, error, xml}`, pour jq. |
| `--schemas` | Ajoute `<nodeDataSchemas>` (comment écrire chaque type). |

Une option ne vaut que pour les nœuds du bon type (`--pages` pour les PDF…).

---

## Flux d'exécution

Le noyau (`readNodes.ts`) lit, `renderReadNodes` (`readNodes.xml.ts`) rend le XML.

1. **Structure du canvas** : `tools/nodes/canvasGraph.load` → nœuds et arêtes dans le scope, positions monde, sans contenu.
2. **Lecture des contenus** par lots de 10 (`tools/nodes/nodeContents.contents`), après la recopie des docs vivants des blocknotes demandés.
3. Pour chaque nœud :
   - Si `type === "image"` → branche image (description indexée).
   - Si `type === "pdf"` → branche PDF.
   - Si `type === "table"` → branche table.
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

### Cas 2 — Mode TOC (sans `--pages`)

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
  <pdfHint>Read the full markdown of specific pages with: nole read --pages 3,4 <nodeId>.</pdfHint>
</node>
```

**Sous-cas 2b — Pas de headings détectés (`structured: false`)**

Aucune section n'a été trouvée dans l'OCR.

```xml
<node id="NODE_ID" type="pdf" sourceNodes="…" targetNodes="…" totalPages="12">
  <pdfFiles>
    - document.pdf | application/pdf | https://…
  </pdfFiles>
  <pdfToc totalPages="12" structured="false">No headings detected in OCR output. Read pages directly by 1-based number: nole read --pages 1,2 <nodeId>.</pdfToc>
  <pdfHint>Read the full markdown of specific pages with: nole read --pages 3,4 <nodeId>.</pdfHint>
</node>
```

---

### Cas 3 — Mode pages (`--pages`)

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

Le bloc complet. Si le modèle est multimodal, un `<imageHint>` unique en fin de
sortie renvoie à `view_image` pour les pixels (sinon il désignerait un tool que le
modèle n'a pas).

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
</node>
…
<imageHint>Indexed descriptions only (…) for NODE_ID (2 images). Call view_image to see the pixels …</imageHint>
```

**Image non indexée** (aucun chunk) : `<imageStatus>Image content not yet indexed…</imageStatus>`
suivi du rendu générique (liens markdown).

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
