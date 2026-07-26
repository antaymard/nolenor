# Custom Nodes (templates utilisateur) — Spec & Plan — by opencode

> Feature : permettre à l'utilisateur de créer ses propres types de nodes à partir
> d'une bibliothèque de champs (titre, richtext Plate.js, date, select, image, etc.),
> agencés librement (flexbox row/column, spacing, alignement) avec **deux layouts
> distincts** : affichage canvas et affichage window (double-clic). Un champ peut
> n'apparaître que dans l'un des deux. Parité complète avec les nodes prebuilt :
> automations, liens entre nodes, lecture/écriture par l'agent Nolë, recherche,
> versioning.
>
> Statut : **plan validé, prêt pour exécution**. Les 4 arbitrages structurants ont
> été tranchés par l'utilisateur (voir §1).

---

## 0. État des lieux (ce qui existe déjà)

Le terrain est mieux préparé qu'il n'y paraît :

- `src/types/ui/field.types.ts` : `FieldType` à **11 littéraux** déjà déclarés
  (`short_text`, `url`, `select`, `image`, `image_url`, `number`, `date`,
  `rich_text`, `boolean`, `file`, `document`) et `BaseFieldProps` avec
  `visualType: "node" | "window"` — exactement la distinction canvas/window.
- `src/types/domain/nodeTypes.ts` : interface `NodeField { id, name, type, description?, options? }`.
- `convex/schemas/searchableChunksSchema.ts` : champ `templateId: v.optional(v.string())`
  **déjà provisionné** (jamais rempli aujourd'hui).
- `.github/instructions/nolenor-technical-summary.instructions.md` : mentionne le
  chantier "Refonte des templates de nœuds custom" (11 types de champs, variantes
  canvas/fenêtre, templates système + utilisateur) et un `templateStore` Zustand
  parmi les 6 stores prévus.
- `convex/config/nodeConfig.ts` : source de vérité unique des types prebuilt
  (zod schema + `llmDescription` + variants + dimensions), importée par le front
  (`prebuiltNodesConfig.ts`), l'agent et la création serveur. **C'est le modèle à
  répliquer pour les champs custom.**
- `nodeDatas.values` : `v.record(v.string(), v.any())` libre → aucun changement
  nécessaire ; versioning, optimistic updates, diff minimal par clé et écritures
  agent fonctionnent tels quels.
- `@dnd-kit/core` + `sortable` déjà dans les dépendances.
- Patterns de champs existants : `DocumentStaticField` (canvas, virtualisé) vs
  `DocumentEditorField` (window), `ImageField`, `FileNameField`, éditeurs de
  cellules table (`SelectCellEditor`, `SelectOptionsDialog` avec options
  `{id,label,color}` + `isMulti`, `NodeCellEditor`, date…).

Points de friction identifiés :

- `nodeTypeValidator` est un **enum fermé** (10 littéraux) utilisé dans 4 schémas.
- Switchs par type hardcodés : `chunkBuilder.buildChunks`, `getNodeDataTitle`,
  `makeNodeDataLLMFriendly`, `generateCanvasMinimap` (TYPE_WEIGHT),
  `createNodeTool.applyNodeDataTitle`, blocs `<nodeDataSchemas>` (read/list tools),
  `WindowBody` (WindowFrame.tsx), `WINDOW_SIZE_BY_TYPE`,
  `FULLSCREEN_ELIGIBLE_NODE_TYPES`, `MobileCanvas`.
- Le node `fetch` existe côté front mais pas dans l'enum backend — précédent
  douloureux de désynchronisation à ne pas reproduire.
- `scheduledJobs` = stub mort ; automations à construire plus tard, passeront par
  les tools génériques.

---

## 1. Décisions structurantes (validées)

### 1.1 Prebuilt vs custom : **définition unifiée, rendus séparés** ✅

On ne bascule PAS les prebuilt sur le moteur de templates. Raisons :

- Comportements inexprimables par un moteur de champs : `AppNode` (iframe sandboxée
  + SDK `nolenor.getData()`), `PdfNode` (react-pdf + OCR Mistral), `TableNode`
  (tanstack-table + éditeurs de cellules), `BlocknoteNode` (5 tools agent adressés
  par block id), `ImageNode` (upload R2 + vision LLM).
- 12 tools agent spécialisés couplés à ces types (document ×2, blocknote ×5,
  table ×4, app ×1).

On unifie la **couche définition** :

```
NodeDefinition = { kind: "prebuilt", ...nodeDataConfig[i] }
               | { kind: "template",  ...nodeTemplates doc }
```

consommée par : AddBlockMenu, `create_node`, `read_nodes`, titre, icône, ouverture
window. Les prebuilt gardent leurs composants dédiés ; les custom passent par un
renderer générique piloté par fields + layout. Dogfooding possible plus tard
(title, value ré-exprimés en templates système) — non requis.

### 1.2 Builder : **fait-maison avec @dnd-kit** ✅

Puck editor écarté : paradigme page-builder (zones, composants à props) incompatible
avec notre modèle où **les champs sont à la fois le schéma de données ET les éléments
de layout** (définis une fois, placés dans deux arbres). Besoin borné : palette de
11 champs draggables, conteneurs stack imbriquables (row/column, gap, align,
justify, padding), panneau de propriétés, 2 onglets (canvas / window), preview
live. ~3-4 j de dev, zéro dépendance, contrôle UX total.

### 1.3 Édition sur canvas : **champs simples inline, riches statiques** ✅

- Inline sur canvas : `short_text`, `number`, `boolean`, `select`, `date`, `url`.
- Statique sur canvas (édition en window) : `rich_text`, `image`, `file`,
  `document` — perf (`DocumentStaticField` est virtualisé via
  @tanstack/react-virtual : 50 instances Plate sur un canvas tueraient tout).
- Convention existante : `onChange === undefined` ⇒ rendu preview/statique.

### 1.4 Portée des templates : **user-level + système** ✅

Templates persos réutilisables sur tous les canvases + templates système fournis.
Lecture auto pour les viewers d'un canvas partagé via query
`getTemplatesForCanvas(canvasId)` (l'accès canvas viewer suffit ; édition réservée
au owner).

---

## 2. Structure de DB

Tous les changements sont **additifs, zéro migration** (ajout de littéral à une
union = rétrocompatible ; nouveaux champs optionnels ; nouvelle table).

### 2.1 Nouvelle table `nodeTemplates`

```ts
// convex/schemas/nodeTemplatesSchema.ts
const templateFieldValidator = v.object({
  id: v.string(),                      // nanoid immuable = clé dans values
  type: fieldTypeValidator,            // les 11 FieldType
  label: v.string(),
  description: v.optional(v.string()), // injecté dans le schéma LLM
  required: v.optional(v.boolean()),
  defaultValue: v.optional(v.any()),
  options: v.optional(v.any()),        // select: {id,label,color}[]+isMulti ; number: min/max…
});

const layoutItemValidator = v.object({
  id: v.string(),
  parentId: v.optional(v.string()),    // undefined = racine — LISTE PLATE
  order: v.number(),
  kind: v.union(v.literal("stack"), v.literal("field")),
  fieldId: v.optional(v.string()),     // si kind=field
  // si stack :
  direction: v.optional(v.union(v.literal("row"), v.literal("column"))),
  gap: v.optional(v.number()),
  align: v.optional(v.string()),       // start|center|end|stretch
  justify: v.optional(v.string()),
  padding: v.optional(v.number()),
  grow: v.optional(v.number()),        // flex-grow dans le parent
});

const nodeTemplatesValidator = v.object({
  userId: v.optional(v.id("users")),   // undefined = template système
  isSystem: v.boolean(),
  name: v.string(),
  description: v.optional(v.string()),
  llmDescription: v.optional(v.string()), // doc lue par l'agent (cf. nodeConfig.llmDescription)
  icon: v.optional(v.string()),           // nom d'icône react-icons/tb
  defaultColor: v.optional(v.string()),
  titleFieldId: v.optional(v.string()),   // champ faisant office de titre
  defaultDimensions: v.object({
    width: v.number(),
    height: v.number(),
    resizable: v.optional(v.boolean()),
  }),
  fields: v.array(templateFieldValidator),
  nodeLayout: v.array(layoutItemValidator),   // affichage canvas
  windowLayout: v.array(layoutItemValidator), // affichage window
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),     // soft delete tant que référencé
});
```

Index : `by_user` (`userId`), `by_isSystem` (`isSystem`).

**Layouts en liste plate** (pas d'arbre JSON imbriqué) : les validators Convex ne
supportent pas la récursion. La liste plate est validable en DB, triviale à rendre
récursivement, et simplifie le drag-drop cross-container. Un champ peut figurer
dans les deux layouts, un seul, ou aucun (→ warning builder).

### 2.2 Modifications de l'existant

1. `convex/schemas/nodeTypeSchema.ts` : ajouter le littéral `"custom"` à
   `nodeTypeValues` → propage automatiquement aux 4 schémas utilisant
   `nodeTypeValidator` (`nodeDatas`, `canvases` nodes, `nodeDataVersions`,
   `searchableChunks`).
2. `nodeDatasSchema` : += `templateId: v.optional(v.id("nodeTemplates"))`.
3. `searchableChunks.templateId` : enfin rempli par le chunkBuilder (branche custom).
4. `values` : **inchangé** — `values[fieldId] = value`.

---

## 3. Pièce maîtresse : registre de field-types partagé

`convex/config/customFieldsConfig.ts` — **aucun import React** (importé par Convex
ET par le front, pattern déjà éprouvé avec `nodeConfig` via `prebuiltNodesConfig`) :

```ts
fieldTypeRegistry = {
  short_text: { zod: (f) => z.string().default(...), toLLM, fromLLM,
                searchable: true, canvasMode: "inline" },
  rich_text:  { zod: () => z.string().default("[]"),
                toLLM: plateToMarkdown, fromLLM: markdownToPlate,
                searchable: true, canvasMode: "static" },
  select:     { optionsSchema: {id,label,color}[] + isMulti, searchable: true,
                canvasMode: "inline" },
  date:       { toLLM: iso, fromLLM: parseDate, canvasMode: "inline" },
  image:      { containsR2Key: true, canvasMode: "static" },
  file:       { containsR2Key: true, canvasMode: "static" },
  // …url, image_url, number, boolean, document
};
```

Ce registre alimente, depuis un seul endroit :

- génération du zod schema (validation agent, `validateNodeInputSchemaForLLM`) ;
- valeurs par défaut (`getDefaultValuesFromFields(fields)` — équivalent de
  `getDefaultNodeDataValues`) ;
- sérialisation LLM (`read_nodes`) et coercions (`set_node_data`) ;
- extraction de texte pour la recherche (`searchable`) ;
- mode d'édition canvas (`canvasMode`) ;
- nettoyage R2 à la suppression (`containsR2Key`).

**C'est ce registre qui garantit la parité de features, pas les composants React.**

---

## 4. Organisation des composants React

```
src/components/
├── fields/                          # bibliothèque de champs (existe, à compléter)
│   ├── registry.ts                  # fieldType → { component, icon, label, defaults }
│   ├── FieldWrapper.tsx             # label, required, description
│   ├── ShortTextField / NumberField / BooleanField / UrlField / DateField
│   ├── SelectField.tsx              # patterns SelectCellEditor/SelectOptionsDialog
│   ├── RichTextField.tsx            # static (canvas) vs editor (window)
│   ├── ImageField.tsx               # existe déjà
│   └── file-fields/…                # existe partiellement
│
├── nodes/custom-nodes/
│   ├── CustomNode.tsx               # composant xyflow type "custom" (NodeFrame + LayoutRenderer "node")
│   ├── CustomNodeWindow.tsx         # body de window (LayoutRenderer "window", éditable)
│   ├── LayoutRenderer.tsx           # liste plate → arbre → rendu récursif (PARTAGÉ node+window)
│   └── FieldSlot.tsx                # field def + values[fieldId] + onChange → composant field
│
├── template-editor/                 # le builder
│   ├── TemplateEditorDialog.tsx     # dialog plein écran
│   ├── FieldPalette.tsx             # 11 types draggables
│   ├── LayoutCanvas.tsx             # drop zones dnd-kit, conteneurs stack
│   ├── SortableLayoutItem.tsx
│   ├── FieldPropsPanel.tsx          # label, options, required, default
│   ├── StackPropsPanel.tsx          # direction, gap, align, justify, padding
│   ├── LayoutTabs.tsx               # "Canvas" / "Fenêtre"
│   └── TemplatePreview.tsx          # preview live avec valeurs par défaut
│
└── template-manager/                # liste, duplicate, delete
```

- `src/stores/templateStore.ts` (déjà annoncé dans la doc) : cache système + miens +
  canvas courant, résolution O(1) par `templateId`.
- Wiring : `nodeTypes.ts` += `"custom": CustomNode` ; switch `WindowBody`
  (WindowFrame.tsx) += case custom (ou résolution via NodeDefinition) ;
  `WINDOW_SIZE_BY_TYPE` ← `template.defaultDimensions` ; AddBlockMenu (section
  "Custom" + "Créer un template") ; `MobileCanvas` ; icône par template (picker,
  même set react-icons/tb que `nodeIconMap`).

---

## 5. Parité features — checklist

| Feature | Mécanisme pour custom | Effort |
|---|---|---|
| Liens entre nodes | Edges = string ids, agnostiques au type | **gratuit** |
| Versioning | Générique sur values/actor/changedKeys | **gratuit** |
| Attach Nolë, duplicate, move to canvas, context menus, slideshows | Génériques sur canvasNode/nodeDataId | **gratuit** |
| Création agent | `create_node` + arg optionnel `templateId` ; defaults via registre ; required honorés ; titre via `titleFieldId` | moyen |
| Lecture agent | `read_nodes` : branche custom → XML `<field name type>` (richtext→markdown) ; `<nodeDataSchemas>` généré depuis les fields (réutilise `formatZodSchemaAsMinimap`) | moyen |
| Écriture agent | `set_node_data` : zod généré depuis template + coercions `fromLLM` par type de champ | moyen |
| Découverte agent | Section "custom templates" du system prompt (nom, id, llmDescription, résumé champs) — capée | faible |
| Recherche | `chunkBuilder` : branche custom = concat champs `searchable` ; remplit `templateId` ; `getNodeDataTitle` → `titleFieldId` | faible |
| Cascade R2 | `deleteNodeDataWithCascade` : parcourt champs `containsR2Key` du template | faible |
| Automations (à venir) | Passeront par les tools génériques → couvert | anticipé |

---

## 6. Pièges identifiés (au-delà de la demande initiale)

1. **Partage de canvas** : templates user-scoped lus par les viewers d'un canvas
   partagé via `getTemplatesForCanvas(canvasId)` (règle aussi la perf : fetch batché).
2. **Évolution d'un template** : ajout de champ = OK (default) ; suppression de
   champ = values orphelines **conservées** dans le record (non rendues) + warning
   builder ; changement de type = **interdit en v1** si des nodes existent ;
   suppression de template = soft-delete + card fallback "template manquant".
3. **Ids de champs immuables** : renommer un label ne touche jamais l'id →
   renommages gratuits, zéro perte de données.
4. **Coût tokens LLM** : schémas injectés dans system prompt / read_nodes → cap
   (templates récents + système, résumés concis).
5. **Champs requis à la création agent** : remplis via defaults ou erreur explicite.
6. **Warnings builder** : champ dans aucun layout (donnée inaccessible) ; champ
   required absent de la window (jamais remplissable par l'user).
7. **Enum backend dès J1** : `"custom"` entre dans `nodeTypeValidator`
   immédiatement (contrairement au précédent `fetch`, front-only).
8. **Icônes custom** : picker d'icône dans le builder, sinon tous les custom se
   ressemblent (canvas, AddBlockMenu, cards cliquables Nolë — cf. SPECS.md racine).
9. **Mobile** : `MobileCanvas` dispatche par type → branche custom (réutilise
   `LayoutRenderer`).
10. **Candidat v2** : champ "référence de node" (la table a déjà un type de colonne
    `node` via `NodeCellEditor`) — graphe de fiches interconnectées, très puissant
    avec les automations. Hors scope v1.

---

## 7. Phasage (~10-13 j de dev)

| Phase | Contenu | Durée |
|---|---|---|
| **0 — Socle** | Schéma (`nodeTemplates`, `"custom"`, `templateId`), `customFieldsConfig.ts`, CRUD templates backend + `getTemplatesForCanvas`. Déployée seule d'abord pour valider le schéma. | 1 j |
| **1 — Rendu** | Bibliothèque de champs complétée, `LayoutRenderer`, `CustomNode`/`CustomNodeWindow`, `templateStore`, wiring nodeTypes/WindowBody/titre. Test avec template seedé en DB (sans builder). | 2-3 j |
| **2 — Builder** | Éditeur dnd complet (palette, 2 onglets layout, panneaux props, preview, warnings), intégration AddBlockMenu, gestion (duplicate/delete). | 3-4 j |
| **3 — Agent** | `create_node` + `templateId`, read/set + validation zod générée, section system prompt. Smoke tests : créer/lire/éditer un custom node via Nolë. | 2-3 j |
| **4 — Parité & polish** | chunkBuilder + titre, cascade R2, partage, minimap, mobile, empty states, sync doc `.github/instructions` (templateStore déjà mentionné). | 2 j |

**Vérification par phase** : `yarn typecheck` + `yarn lint` + tests manuels
(création / édition / liens / versioning / recherche). Pas d'infra de tests
unitaires dans le repo (pas de vitest) → QA manuelle + smoke tests agent.

---

## 8. Fichiers clés touchés (référence rapide)

**Backend** : `convex/schema.ts`, `convex/schemas/nodeTypeSchema.ts`,
`convex/schemas/nodeDatasSchema.ts`, `convex/schemas/nodeTemplatesSchema.ts` (new),
`convex/nodeTemplates.ts` (new), `convex/config/customFieldsConfig.ts` (new),
`convex/models/nodeDataModels.ts` (cascade R2), `convex/searchable/chunkBuilder.ts`,
`convex/lib/getNodeDataTitle.ts`, `convex/ia/tools/createNodeTool.ts`,
`convex/ia/tools/readNodesTool.ts`, `convex/ia/tools/setNodeDataTool.ts`,
`convex/ia/helpers/nodeInputSchemaValidatorForLLM.ts`,
`convex/ia/systemPrompts/systemParts.ts`.

**Frontend** : `src/components/nodes/nodeTypes.ts`,
`src/components/nodes/custom-nodes/*` (new), `src/components/fields/*` (extend),
`src/components/template-editor/*` (new), `src/components/windows/WindowFrame.tsx`,
`src/stores/templateStore.ts` (new), `src/stores/windowsStore.ts`,
`src/components/canvas/context-menus/AddBlockMenuContent.tsx`,
`src/components/mobile/*`, `src/types/ui/field.types.ts` (extend si besoin).

**Doc** : `.github/instructions/nolenor-technical-summary.instructions.md` (sync
état du chantier à la fin).
