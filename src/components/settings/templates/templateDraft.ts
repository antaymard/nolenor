import type { Doc } from "@/../convex/_generated/dataModel";
import {
  getFieldTypeConfig,
  type TemplateField,
} from "@/../convex/config/fieldConfig";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import {
  MAX_LAYOUT_DEPTH,
  type LayoutContainer,
  type LayoutDivider,
  type LayoutFieldPlacement,
  type LayoutNode,
  type LayoutStaticText,
} from "@/../convex/config/templateConfig";
import {
  findLayoutNode,
  findLayoutParentId as findParentId,
  genLayoutId as genId,
  getLayoutAncestorPath as getAncestorPath,
  getLayoutDepth,
  insertLayoutNode,
  moveLayoutNode,
  newLayoutContainer,
  removeLayoutLeaves,
  removeLayoutNode,
  resolveLayoutInsertionPoint as resolveInsertionPoint,
  updateLayoutNode,
  wrapLayoutNode,
} from "@/../convex/lib/layoutTree";

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
  return newLayoutContainer(direction);
}

function newDivider(): LayoutDivider {
  return { kind: "divider", id: genId("d") };
}

function newStaticText(): LayoutStaticText {
  // Vide à la création : le contenu se saisit dans l'inspecteur, et le rendu
  // en édition affiche un substitut pour que l'élément reste sélectionnable.
  return { kind: "text", id: genId("t"), content: "" };
}

// Libellé d'un nœud de layout, partagé par le fil d'ariane, la vue
// structurelle et l'inspecteur — trois endroits qui décliraient sinon le même
// switch, avec le risque d'oublier un kind à chacun.
function layoutNodeLabel(node: LayoutNode, fields: TemplateField[]): string {
  switch (node.kind) {
    case "container":
      return node.direction === "row" ? "Row" : "Column";
    case "field":
      return fields.find((f) => f.id === node.fieldId)?.name ?? "Unknown field";
    case "divider":
      return "Divider";
    case "text": {
      const content = node.content.trim();
      return content ? `“${content.slice(0, 24)}”` : "Text";
    }
  }
}

// Insertion sous garde de profondeur. `insertLayoutNode` ne la vérifie pas —
// jusqu'ici seul `wrapInContainer` créait des containers et portait le
// contrôle. Ajouter un container par bouton passe par ici, sinon l'erreur ne
// tomberait qu'au Save, loin du geste qui l'a causée.
//
// Rend `null` en cas de refus, comme wrapInContainer, plutôt qu'un arbre
// silencieusement inchangé.
function insertLayoutNodeGuarded(
  tree: LayoutContainer,
  containerId: string,
  index: number | undefined,
  node: LayoutNode,
): LayoutContainer | null {
  const next = insertLayoutNode(tree, containerId, index, node);
  if (getLayoutDepth(next) > MAX_LAYOUT_DEPTH) return null;
  return next;
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
  return wrapLayoutNode(tree, nodeId, direction, MAX_LAYOUT_DEPTH);
}

// Retire tous les placements d'un champ (suppression du champ).
function removeFieldPlacements(
  tree: LayoutContainer,
  fieldId: string,
): LayoutContainer {
  return removeLayoutLeaves(
    tree,
    (leaf) => leaf.kind === "field" && leaf.fieldId === fieldId,
  );
}

export {
  genId,
  newField,
  newPlacement,
  newContainer,
  newDivider,
  newStaticText,
  insertLayoutNodeGuarded,
  layoutNodeLabel,
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
