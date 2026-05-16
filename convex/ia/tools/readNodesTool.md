# Specs — `read_nodes` tool (`readNodesTool.ts`)

## Vue d'ensemble

Outil exposé au modèle pour lire un ou plusieurs nœuds du canvas courant et retourner leur contenu sous forme de XML LLM-friendly. Il gère aussi bien les nœuds "classiques" (document, table, embed, …) que les nœuds **PDF**, avec deux modes de lecture distincts pour ces derniers.

**Agents autorisés** : `nole`, `clone`, `supervisor`, `worker`

---

## Input schema (zod)

| Champ          | Type                                         | Obligatoire         | Description                                                                          |
| -------------- | -------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `nodeIds`      | `string[]` (min 1)                           | oui                 | IDs des nœuds à lire                                                                 |
| `withPosition` | `boolean`                                    | non (défaut `true`) | Inclure les attributs de position/dimensions dans les balises `<node>`               |
| `pdfPages`     | `Array<{ nodeId: string, pages: number[] }>` | non                 | Pour les nœuds PDF : pages spécifiques à lire (index 1-based). Si absent → mode TOC. |

---

## Flux d'exécution

1. **Résolution du canvas** : `getCanvasNodesAndEdges` → liste des nœuds + arêtes du canvas courant.
2. **Lecture en parallèle** de chaque `nodeId` via `getNodeWithNodeData`.
3. Pour chaque nœud :
   - Si `type === "pdf"` → branche PDF (voir section suivante).
   - Si `pdfPages` contient ce nodeId mais que le nœud n'est pas PDF → warning `<warning>pdfPages was provided for a non-pdf node and was ignored.</warning>`.
   - Sinon → contenu LLM-friendly standard via `makeNodeDataLLMFriendly`.
4. **Résolution des connexions** : pour chaque arête liée à un nœud demandé, les nœuds connectés (source/target) sont résolus pour exposer leur titre/type dans les attributs `sourceNodes` / `targetNodes`.
5. **Schemas** : pour chaque type de nœud unique présent dans la réponse, un bloc `<schema>` est ajouté avec les outils d'édition et/ou le JSON Schema du nodeData.
6. Retourne le XML final.

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

## Format global de la réponse XML

```xml
<nodes>
  <!-- Un <node> par nodeId demandé -->
  <node id="…" type="document" sourceNodes="id1 | type | title ; …" targetNodes="…" x="100" y="200" width="300" height="400" title="Mon doc">
    … contenu LLM-friendly …
  </node>

  <node id="…" type="pdf" sourceNodes="…" targetNodes="…" totalPages="42" title="Mon PDF">
    <!-- contenu PDF selon le cas ci-dessus -->
  </node>

  <node id="…" type="embed" title="…" url="…" embedUrl="…" embedType="…" />
</nodes>

<nodeDataSchemas>
  <schema nodeType="document" edition_tools="insert_document_content,string_replace_document_content"></schema>
  <schema nodeType="table" edition_tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows"></schema>
  <schema nodeType="task" edition_tool="set_node_data">{ … JSON Schema … }</schema>
</nodeDataSchemas>
```

### Attributs `<node>`

| Attribut                       | Présent si                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `id`                           | Toujours                                                                          |
| `type`                         | Toujours                                                                          |
| `title`                        | Toujours                                                                          |
| `sourceNodes` / `targetNodes`  | Toujours (chaîne vide si aucune connexion) — format : `"id \| type \| title ; …"` |
| `x`, `y`, `width`, `height`    | Si `withPosition=true` et données disponibles                                     |
| `totalPages`                   | Nœud PDF seulement                                                                |
| `url`, `embedUrl`, `embedType` | Nœud embed seulement                                                              |
| `readError`                    | En cas d'erreur de lecture                                                        |

---

## Gestion des erreurs

- Erreur sur un nœud individuel → `<node>` avec `readError` en attribut ou balise CDATA, les autres nœuds continuent.
- Erreur globale → retourne une chaîne `toolError(...)` wrappée (cf. `toolHelpers.ts`).
