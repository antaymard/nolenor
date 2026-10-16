# Moteur de layout — frames à espaces, custom nodes, bibliothèque de champs

> Statut : **proposition, à valider**. Remplace l'approche « frames typées »
> (Kanban/matrice codés en dur, PR #430 fermée).
>
> Idée directrice : **un seul moteur de layout (un arbre de boîtes flex), deux
> usages.** Une frame dont les espaces rangent d'autres nodes du canvas ; un
> custom node dont les feuilles sont ses propres champs. Et **une seule
> bibliothèque de champs**, partagée par les custom nodes, les tables et les
> prebuilt qui peuvent s'en servir.

---

## 0. État des lieux

- **Le moteur existe déjà, enfermé dans les custom nodes.** `nodeLayout` est un
  arbre de conteneurs flex (`direction`, `gap`, `align`, `justify`, `padding`,
  `grow`) validé par zod (`convex/config/templateConfig.ts`), rendu par
  `src/components/fields/layout/LayoutRenderer.tsx`. Feuilles : `field`,
  `text`, `divider`.
- **La bibliothèque de champs existe aussi, à moitié adoptée.**
  `src/components/fields/` : registry (type × variant → shell + vue +
  éditeur), 4 shells (static, inline, popover, window), vues et éditeurs par
  type, `FieldHost` comme point d'entrée. Bien découpée, mais :
  - `FieldHost` prend un `TemplateField` et un `LayoutFieldPlacement` : il est
    couplé aux templates ;
  - les prebuilt ne s'en servent quasiment pas (seuls `UploadFile` et
    `ImageField` sont réutilisés).
- **Trois vocabulaires de champs coexistent :**

  | | Custom fields | Colonnes de table | Prebuilt |
  |---|---|---|---|
  | Types | short_text, number, date, select, boolean, rich_text, image | text, richtext, number, checkbox, select, date, link, node | sur mesure (title, value…) |
  | Config | `fieldConfig` + `fieldVariants` | `tableColumnTypes` | `nodeConfig` |
  | Éditeurs | `fields/editors` | `table/*CellEditor` | dans chaque node |

  `SelectField` enveloppe déjà `SelectCellEditor` : la convergence a commencé,
  par le bas.
- **Le builder de templates** (`src/components/settings/templates/`, ~3 500
  lignes) est jugé incompréhensible. Le custom node n'est **pas en prod** :
  aucune contrainte de compatibilité sur ses données.
- Invariant du canvas à préserver : **un seul niveau de `parentId`** (pas de
  frame dans une frame — `nodeGeometry`, `node-types-converter`,
  `nodeModels`…).

---

## 1. Le moteur commun

### 1.1 L'arbre

```ts
type LayoutBox = {
  kind: "box";
  id: string;
  direction: "row" | "column";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  grow?: number;
  children: LayoutNode[];
};

type LayoutNode = LayoutBox | LayoutLeaf;
```

`gap` et `padding` sont **codés en dur** au départ (une valeur pour tout le
moteur), on les ouvrira si le besoin se confirme.

Les **feuilles** dépendent de l'usage :

| Feuille | Custom node | Frame à espaces |
|---|---|---|
| `field` — un champ du node | oui | non (v1) |
| `space` — accueille des nodes du canvas | non (v1) | oui |
| `text` — texte statique | oui | non : on y dépose un node `title` |
| `divider` | oui | oui |

Mélanger `field` et `space` dans un même node est techniquement possible avec
ce moteur (une fiche projet avec un espace « livrables »), mais hors v1.

### 1.2 Ce que le module fournit

Module neutre, sorti du custom node :

- `convex/lib/layoutTree.ts` : schéma zod (paramétré par les feuilles
  autorisées), parcours, et **opérations pures** — insérer une boîte, entourer
  d'une boîte, déplacer, supprimer, changer une propriété. Testées seules.
  Utilisées par l'éditeur ET par les tools de Nolë.
- `src/components/layout/` : le rendu (`LayoutRenderer`, généralisé) et
  l'éditeur sur le canvas (§4). Le rendu délègue chaque feuille à un
  `renderLeaf` fourni par l'usage.

---

## 2. Usage A — la frame à espaces

### 2.1 Modèle

- **Nouveau type de node** (nom à trancher : `board`, `layout`…), distinct de
  la frame libre, qui reste intacte. Partagé avec elle : `parentId`, la
  suppression en cascade, la détection du conteneur sous le curseur au drag.
- Son **arbre vit dans ses values**, propre à chaque instance. Un Kanban ou une
  matrice ne sont que des arbres de départ copiés à la création.
- Ses enfants sont des nodes ordinaires, `parentId` = la frame (un seul niveau,
  l'invariant tient), plus un champ **sur la ligne `nodes`** :

  ```ts
  // convex/schemas/nodesSchema.ts — nodesValidator et nodePatchPropsValidator
  placement: v.optional(v.object({
    spaceId: v.string(),
    order: v.string(), // clé d'ordre fractionnaire
  })),
  // dans le patch : v.union(..., v.null()) pour l'effacer à la sortie
  ```

  Sur la ligne `nodes` et pas dans le nodeData : c'est de la mise en page,
  comme `parentId` ou `position`, pas du contenu (ni versionné, ni indexé).
  Clé fractionnaire : insérer entre deux cartes n'écrit qu'elle, sans conflit
  entre deux dépôts simultanés.
- Un espace supprimé qui contenait des nodes : ils sont rendus dans le premier
  espace, sans écriture.
- Pas de label sur les espaces : l'en-tête d'une colonne, c'est un node `title`
  déposé en tête de l'espace.

### 2.2 Positions : mesurées par le DOM

Le node rend son arbre en vraie flexbox CSS. Chaque espace y contient des
**boîtes fantômes** de la taille de chacun de ses enfants, dans l'ordre. Le
client mesure leur position dans le node et en déduit celle des vrais nodes
React Flow ; la frame prend la taille de son contenu (même mécanisme que
`useTitleNodeSizing`).

Les positions et la taille sont **écrites quand elles changent** (au-delà d'un
epsilon) : tous les clients mesurent la même chose, les écritures convergent.
Le serveur, la minimap et Nolë lisent la position stockée ; **le sens vient de
`placement`**, qui est la vraie donnée.

Pourquoi pas une fonction de layout pure partagée avec le serveur : la hauteur
d'un texte, d'un champ ou d'un node qui grandit ne se connaît qu'avec le DOM.
Mesurer donne toute la flexbox CSS sans réimplémenter un moteur.

### 2.3 Glisser-déposer

- Pendant le drag : l'espace sous le curseur, et l'index d'insertion le long de
  son axe ; une ligne montre où la carte tombera.
- Au relâcher : `parentId`, `placement` (clé entre ses deux voisines) et
  position, dans la même mutation et la même entrée d'historique — comme les
  frames aujourd'hui (`flushDragPositions`).
- Sortir d'une frame : `placement: null`, `parentId: null`.

### 2.4 Nolë

- Lecture : `nole read` sur la frame rend l'arbre et, par espace, ses enfants
  dans l'ordre.
- Écriture : créer depuis un arbre (ou un template système), modifier l'arbre
  (opérations de §1.2), placer un node dans un espace à un index. Aucune
  géométrie à calculer.

---

## 3. Usage B — le custom node

### 3.1 Définition inline, template optionnel

```
définition effective = nodeData.definition  ??  template(nodeData.templateId)
définition = { fields: TemplateField[], layout: LayoutBox }
```

- **Créer à la volée** : on pose un node et on lui ajoute champs et boîtes
  directement sur le canvas. Définition inline, aucun template.
- **« Enregistrer comme template »** : la définition part dans
  `nodeTemplates`, le node y pointe.
- **Instance liée** (défaut depuis un template) : modifier le template modifie
  ses instances, comme un composant Figma. C'est ce qui garde des données
  homogènes — « tous les Contacts » ont les mêmes champs.
- **« Détacher »** : l'instance récupère une copie de la définition.

Tout passe par la définition effective : rendu, validation serveur des values
(`buildTemplateValuesSchema` prend une définition au lieu d'un template),
titre, recherche, lecture par Nolë.

Règles :
- duplication : une définition inline est copiée ; une instance liée garde le
  lien ;
- retirer un champ d'un template ne supprime pas les values stockées, elles
  deviennent invisibles (comportement actuel) ;
- un node créé à la volée n'a qu'un layout (canvas) en v1 ; sa window affiche
  la liste des champs.

### 3.2 Nolë

Il peut créer un node sur mesure pour un besoin ponctuel, sans toucher à la
bibliothèque de templates de l'utilisateur, et proposer de l'enregistrer si le
motif revient.

---

## 4. L'éditeur sur le canvas

Remplace le builder des settings, pour les deux usages.

- Un mode édition sur le node sélectionné ; on sélectionne une boîte (clic),
  la toolbar du node en montre les propriétés : direction, alignement,
  répartition.
- Ajouter dans la boîte sélectionnée : une boîte, un champ (custom) ou un
  espace (frame), un séparateur. Entourer d'une boîte, supprimer.
- Réordonner en glissant (`@dnd-kit`, déjà en dépendance).
- Le champ sélectionné montre son type, sa variante et ses options (les
  formulaires d'options dérivés de `fieldConfig` existent déjà).

Le builder des settings devient une simple liste des templates (renommer,
supprimer, voir les instances), puis disparaît.

---

## 5. La bibliothèque de champs

### 5.1 Ce qu'on garde

Le découpage actuel est bon : **un type** (schéma de valeur, options, rendu
pour le LLM) côté `convex/config`, **des variantes** (shell + vue + éditeur)
côté front, `FieldHost` comme unique point d'entrée. On ne le réécrit pas.

### 5.2 Ce qu'on change

1. **Découpler `FieldHost` des templates.** Il prend une spec neutre
   `{ type, options, variant, variantOptions, label }`, plus `value` et
   `onCommit`. Un custom node, une cellule de table ou un prebuilt
   construisent cette spec chacun à leur façon.
2. **Un seul catalogue de types**, côté `convex/config` : celui des champs,
   étendu de ce qui manque aux tables (`link`/url, `node`). Les noms stockés des
   colonnes de table (`text`, `checkbox`, `richtext`) restent ce qu'ils sont en
   base, avec une correspondance à la frontière : pas de migration de données
   de tables, qui elles sont en prod.
3. **Les tables passent par la bibliothèque** pour l'affichage et l'édition
   des cellules, type par type, en commençant par ceux dont l'éditeur est déjà
   partagé (`select`).

### 5.3 Les prebuilt : réutiliser quand c'est possible, étendre sinon

| Prebuilt | Ce qu'il réutilise |
|---|---|
| `value` | champ number / short_text / boolean, unité en option : c'est presque un champ seul |
| `title` | vue et éditeur `short_text` en variante titre ; garde son auto-dimensionnement et ses niveaux |
| `link` | futur champ url (vues ligne, carte, iframe) |
| `image`, `audio`, `video`, `pdf` | les pièces d'upload déjà partagées ; le reste reste dédié |
| `table`, `app`, `blocknote` | dédiés (cf. décision 1.1 de `custom-nodes-templates.md`) |

Règle : un prebuilt n'est **pas** ré-exprimé en template système. Il compose
des champs de la bibliothèque dans son propre composant, et ajoute une
variante quand il lui faut un rendu à lui (`fieldVariantRegistrations`).

### 5.4 Ampleur

Modérée, et découpable :
- découpler `FieldHost` : petit, mécanique ;
- catalogue unique + correspondance tables : moyen, surtout de la config ;
- cellules de table via la bibliothèque : le plus gros morceau (8 types, avec
  filtres, tri et CSV autour), à faire type par type ;
- `value` et `title` : un node chacun.

Rien de tout ça ne bloque le moteur de layout : la convergence des champs peut
avancer en parallèle ou après.

---

## 6. Découpage

Chaque étape est une PR utilisable seule.

1. **Sortir le moteur.** `layoutTree` (schéma, parcours, opérations) et le
   rendu généralisé hors du custom node. Refactor sans changement visible,
   tests des opérations.
2. **La frame à espaces.** Type de node, feuille `space`, `placement` sur les
   nodes, boîtes fantômes et mesure, dépôt dans un espace, arbres de départ
   Kanban et matrice, édition minimale de l'arbre sur le node.
3. **Nolë et la frame à espaces.** Lecture de l'arbre et des espaces, création,
   modification de l'arbre, placement.
4. **L'éditeur sur le canvas**, commun aux deux usages.
5. **Custom node à la volée.** Définition inline, « enregistrer comme
   template », instances liées / détachées. Le builder des settings disparaît.
6. **Champs.** `FieldHost` découplé et catalogue unique, puis `value` et
   `title`, puis les cellules de table type par type.

---

## 7. Questions ouvertes

1. Nom du type de node de la frame à espaces.
2. Une frame à espaces peut-elle être compacte, comme la frame libre ?
3. Un node déposé dans un espace garde-t-il sa largeur, ou l'espace peut-il
   l'étirer (`align: stretch` appliqué aux enfants) ? Un Kanban aux cartes de
   largeurs différentes est moins propre.
4. Faut-il autoriser `field` et `space` dans un même node dès la v1 ?
