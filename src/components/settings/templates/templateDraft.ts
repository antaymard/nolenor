import type { Doc } from "@/../convex/_generated/dataModel";
import {
  getFieldTypeConfig,
  type TemplateField,
} from "@/../convex/config/fieldConfig";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import {
  getLayoutDepth,
  MAX_LAYOUT_DEPTH,
  type LayoutContainer,
  type LayoutFieldPlacement,
  type LayoutNode,
} from "@/../convex/config/templateConfig";

// État local du builder : le draft complet d'un template, sauvegardé
// explicitement (bouton Save) via nodeTemplates.create/update qui refont la
// validation Zod côté serveur.

type TemplateDraft = {
  name: string;
  description?: string;
  llmDescription?: string;
  icon?: string;
  color?: string;
  fields: TemplateField[];
  nodeLayout: LayoutContainer;
  windowLayout?: LayoutContainer;
  titleFieldId?: string;
  defaultDimensions: { width: number; height: number; resizable?: boolean };
  windowSize?: { width: number; height: number };
};

// Surface d'édition, et node de layout sélectionné SUR cette surface. La
// surface n'est plus un mode choisi à l'avance : elle est portée par la
// sélection, donc déterminée par l'aperçu dans lequel on a cliqué.
type LayoutSurface = "node" | "window";
type LayoutSelection = { surface: LayoutSurface; nodeId: string } | null;

// Ids stables (fields, placements, containers) : jamais réutilisés ni
// modifiés après création.
function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

// Nom par défaut d'un NOUVEAU champ. Concept distinct du libellé du type
// (« un champ de type Texte » vs « ce champ s'appelle Texte »), mais qui
// coïncide avec lui aujourd'hui — donc dérivé plutôt que recopié une
// troisième fois. Si les deux divergent un jour (ex. nom par défaut
// numéroté), c'est ici, et ici seulement, que ça se décide.
function defaultFieldName(type: FieldType): string {
  return getFieldTypeConfig(type).label;
}

function newField(type: FieldType): TemplateField {
  const field: TemplateField = {
    id: genId("f"),
    name: defaultFieldName(type),
    type,
  };
  if (type === "select") {
    // Le schéma exige au moins une option.
    field.options = {
      choices: [{ id: genId("opt"), label: "Option 1", color: "blue" }],
    };
  }
  return field;
}

function newPlacement(fieldId: string): LayoutFieldPlacement {
  return { kind: "field", id: genId("p"), fieldId };
}

function newContainer(direction: "row" | "column"): LayoutContainer {
  return { kind: "container", id: genId("c"), direction, gap: 8, children: [] };
}

function newEmptyDraft(): TemplateDraft {
  const titleField = newField("short_text");
  titleField.name = "Title";

  const nodePlacement = newPlacement(titleField.id);
  const windowPlacement = newPlacement(titleField.id);
  windowPlacement.showLabel = true;

  return {
    name: "New template",
    color: "default",
    fields: [titleField],
    nodeLayout: {
      kind: "container",
      id: genId("c"),
      direction: "column",
      gap: 8,
      padding: 8,
      children: [nodePlacement],
    },
    windowLayout: {
      kind: "container",
      id: genId("c"),
      direction: "column",
      gap: 12,
      padding: 16,
      children: [windowPlacement],
    },
    titleFieldId: titleField.id,
    defaultDimensions: { width: 260, height: 140, resizable: true },
  };
}

function draftFromTemplate(template: Doc<"nodeTemplates">): TemplateDraft {
  return {
    name: template.name,
    description: template.description,
    llmDescription: template.llmDescription,
    icon: template.icon,
    color: template.color,
    fields: template.fields,
    nodeLayout: template.nodeLayout as LayoutContainer,
    windowLayout: template.windowLayout as LayoutContainer | undefined,
    titleFieldId: template.titleFieldId,
    defaultDimensions: template.defaultDimensions,
    windowSize: template.windowSize,
  };
}

// ── Opérations immuables sur l'arbre ────────────────────────────────────

function findLayoutNode(
  tree: LayoutContainer,
  nodeId: string,
): LayoutNode | null {
  if (tree.id === nodeId) return tree;
  for (const child of tree.children) {
    if (child.id === nodeId) return child;
    if (child.kind === "container") {
      const found = findLayoutNode(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function findParentId(tree: LayoutContainer, nodeId: string): string | null {
  for (const child of tree.children) {
    if (child.id === nodeId) return tree.id;
    if (child.kind === "container") {
      const found = findParentId(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function updateLayoutNode(
  tree: LayoutContainer,
  nodeId: string,
  patch: Partial<LayoutContainer> | Partial<LayoutFieldPlacement>,
): LayoutContainer {
  const mapNode = (node: LayoutNode): LayoutNode => {
    if (node.id === nodeId) {
      return { ...node, ...patch } as LayoutNode;
    }
    if (node.kind === "container") {
      return { ...node, children: node.children.map(mapNode) };
    }
    return node;
  };
  return mapNode(tree) as LayoutContainer;
}

function removeLayoutNode(
  tree: LayoutContainer,
  nodeId: string,
): { tree: LayoutContainer; removed: LayoutNode | null } {
  let removed: LayoutNode | null = null;

  const mapContainer = (container: LayoutContainer): LayoutContainer => {
    const children: LayoutNode[] = [];
    for (const child of container.children) {
      if (child.id === nodeId) {
        removed = child;
        continue;
      }
      children.push(child.kind === "container" ? mapContainer(child) : child);
    }
    return { ...container, children };
  };

  return { tree: mapContainer(tree), removed };
}

function insertLayoutNode(
  tree: LayoutContainer,
  containerId: string,
  index: number | undefined,
  node: LayoutNode,
): LayoutContainer {
  const mapContainer = (container: LayoutContainer): LayoutContainer => {
    if (container.id === containerId) {
      const children = [...container.children];
      const at =
        index === undefined
          ? children.length
          : Math.max(0, Math.min(index, children.length));
      children.splice(at, 0, node);
      return { ...container, children };
    }
    return {
      ...container,
      children: container.children.map((child) =>
        child.kind === "container" ? mapContainer(child) : child,
      ),
    };
  };
  return mapContainer(tree);
}

// Déplace un node vers (containerId, index). Refuse de déplacer un
// container dans lui-même ou un de ses descendants.
function moveLayoutNode(
  tree: LayoutContainer,
  nodeId: string,
  targetContainerId: string,
  targetIndex: number | undefined,
): LayoutContainer {
  const node = findLayoutNode(tree, nodeId);
  if (!node || node.id === tree.id) return tree;

  if (node.kind === "container") {
    if (
      node.id === targetContainerId ||
      findLayoutNode(node, targetContainerId)
    ) {
      return tree;
    }
  }

  const { tree: without, removed } = removeLayoutNode(tree, nodeId);
  if (!removed) return tree;
  if (!findLayoutNode(without, targetContainerId)) return tree;

  return insertLayoutNode(without, targetContainerId, targetIndex, removed);
}

// Chemin racine → node, ids inclus, le node lui-même en dernier. Alimente le
// fil d'ariane, qui a remplacé la lecture de l'arbre : les containers n'ayant
// aucune existence visuelle propre dans l'aperçu, sans lui rien n'indique dans
// quel container on se trouve. Vide si le node est introuvable.
function getAncestorPath(tree: LayoutContainer, nodeId: string): string[] {
  const path: string[] = [];

  const walk = (node: LayoutNode, trail: string[]): boolean => {
    const next = [...trail, node.id];
    if (node.id === nodeId) {
      path.push(...next);
      return true;
    }
    return (
      node.kind === "container" &&
      node.children.some((child) => walk(child, next))
    );
  };

  walk(tree, []);
  return path;
}

// Où atterrit un nouveau champ. C'est la sélection qui porte le point
// d'insertion — ce qui remplace le toggle de surface : on ne désigne plus une
// cible à l'avance dans une autre colonne, on l'a déjà désignée en cliquant.
function resolveInsertionPoint(
  tree: LayoutContainer,
  selectedId: string | null,
): { containerId: string; index: number | undefined } {
  const selected = selectedId ? findLayoutNode(tree, selectedId) : null;
  if (!selected) return { containerId: tree.id, index: undefined };
  if (selected.kind === "container") {
    return { containerId: selected.id, index: undefined };
  }

  const parentId = findParentId(tree, selected.id);
  if (!parentId) return { containerId: tree.id, index: undefined };
  const parent = findLayoutNode(tree, parentId) as LayoutContainer;
  const index = parent.children.findIndex((c) => c.id === selected.id);

  // Juste APRÈS le placement sélectionné : ajouter un champ en ayant
  // sélectionné son voisin doit le poser à côté, pas en fin de container.
  return { containerId: parentId, index: index < 0 ? undefined : index + 1 };
}

// Groupe un node dans un nouveau container, à sa place exacte. Remplace le
// bouton « + Container » de l'arbre, qui créait un container vide sans aucun
// rapport avec la sélection — inutilisable sans vue structurelle.
//
// `containerId: null` signale un refus (node racine, node introuvable, ou
// profondeur maximale atteinte). Refuser ici plutôt que laisser
// `validateTemplateDefinition` rejeter : l'erreur ne tomberait qu'au save,
// longtemps après le geste qui l'a causée.
function wrapInContainer(
  tree: LayoutContainer,
  nodeId: string,
  direction: "row" | "column",
): { tree: LayoutContainer; containerId: string | null } {
  const parentId = findParentId(tree, nodeId);
  if (!parentId) return { tree, containerId: null };
  const parent = findLayoutNode(tree, parentId) as LayoutContainer;
  const index = parent.children.findIndex((c) => c.id === nodeId);
  if (index < 0) return { tree, containerId: null };

  const { tree: without, removed } = removeLayoutNode(tree, nodeId);
  if (!removed) return { tree, containerId: null };

  const container: LayoutContainer = {
    ...newContainer(direction),
    children: [removed],
  };
  // Réinséré à `index` : le node retiré a décalé ses suivants d'un cran vers
  // la gauche, donc réinsérer à la même position le remet exactement où il
  // était.
  const next = insertLayoutNode(without, parentId, index, container);

  if (getLayoutDepth(next) > MAX_LAYOUT_DEPTH) {
    return { tree, containerId: null };
  }
  return { tree: next, containerId: container.id };
}

// Retire toutes les placements d'un champ (suppression du champ).
function removeFieldPlacements(
  tree: LayoutContainer,
  fieldId: string,
): LayoutContainer {
  const mapContainer = (container: LayoutContainer): LayoutContainer => ({
    ...container,
    children: container.children
      .filter((child) => !(child.kind === "field" && child.fieldId === fieldId))
      .map((child) => (child.kind === "container" ? mapContainer(child) : child)),
  });
  return mapContainer(tree);
}

export {
  genId,
  newField,
  newPlacement,
  newContainer,
  newEmptyDraft,
  draftFromTemplate,
  findLayoutNode,
  findParentId,
  updateLayoutNode,
  removeLayoutNode,
  insertLayoutNode,
  moveLayoutNode,
  removeFieldPlacements,
  getAncestorPath,
  resolveInsertionPoint,
  wrapInContainer,
};
export type { TemplateDraft, LayoutSurface, LayoutSelection };
