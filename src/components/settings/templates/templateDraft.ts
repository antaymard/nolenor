import type { Doc } from "@/../convex/_generated/dataModel";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import type {
  LayoutContainer,
  LayoutFieldPlacement,
  LayoutNode,
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

// Ids stables (fields, placements, containers) : jamais réutilisés ni
// modifiés après création.
function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

const DEFAULT_FIELD_NAMES: Record<FieldType, string> = {
  short_text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  boolean: "Checkbox",
  rich_text: "Rich text",
  image: "Image",
};

function newField(type: FieldType): TemplateField {
  const field: TemplateField = {
    id: genId("f"),
    name: DEFAULT_FIELD_NAMES[type],
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
};
export type { TemplateDraft };
