import { z } from "zod";
import {
  templateFieldSchema,
  type TemplateField,
} from "./fieldConfig";
import {
  resolveFieldVariant,
  type FieldSurface,
} from "./fieldVariants";
import { getResolvedOptionsSchema } from "./optionDescriptors";

// Modèle de layout des custom node templates : un arbre de containers flex
// (row/column, gap, alignement) dont les feuilles sont des placements de
// champs. Un template a un arbre par surface (node / window) ; la visibilité
// par surface tombe gratuitement de la présence dans l'arbre.
//
// Stocké en v.any() côté Convex (pas de validateurs récursifs) : le
// Zod-parse serveur dans les mutations de template est OBLIGATOIRE, sinon
// un arbre malformé crasherait le rendu chez tous les viewers du canvas.

const MAX_LAYOUT_DEPTH = 4;
const MAX_CHILDREN_PER_CONTAINER = 20;
const MAX_FIELDS_PER_TEMPLATE = 30;

// ── Types ───────────────────────────────────────────────────────────────

type LayoutFieldPlacement = {
  kind: "field";
  // Id du placement (nanoid) — distinct du fieldId, utilisé par le dnd.
  id: string;
  fieldId: string;
  showLabel?: boolean;
  grow?: number;
  width?: number | "auto" | "fill";
  // Variante d'affichage (cf. fieldVariants.ts) — normalisée à chaque save de
  // template : un id inconnu ou non autorisé sur cette surface est réécrit
  // silencieusement vers le défaut, jamais rejeté (cf. normalizeLayoutTree).
  variant?: string;
  // Options du variant résolu, validées par son `optionsSchema`. Réduites à
  // `{}` si le variant n'a pas d'optionsSchema ou si elles ne le valident
  // plus (variant changé, schéma resserré).
  variantOptions?: Record<string, unknown>;
};

type LayoutContainer = {
  kind: "container";
  id: string;
  direction: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  padding?: number;
  grow?: number;
  children: LayoutNode[];
};

// Éléments de mise en page qui ne portent aucune donnée : ils structurent le
// rendu sans jamais apparaître dans `template.fields`. Conséquence utile et
// voulue — `buildTemplateToolSchema` construisant le schéma de l'agent depuis
// les champs, Nolë ne les voit pas et n'a rien à y écrire.
type LayoutDivider = {
  kind: "divider";
  id: string;
};

type LayoutStaticText = {
  kind: "text";
  id: string;
  content: string;
  // Mêmes dimensions qu'un placement de champ, et volontairement le même
  // vocabulaire : deux façons de dire « largeur » dans le même éditeur seraient
  // une de trop.
  width?: number | "auto" | "fill";
  // Propre au texte, parce que lui seul se retourne à la ligne. `width` fixe
  // force la boîte même pour trois mots ; `maxWidth` plafonne la longueur de
  // ligne en laissant le texte plus court quand le contenu l'est. La
  // combinaison utile est fill + maxWidth : prendre la place disponible sans
  // jamais dépasser.
  maxWidth?: number;
};

type LayoutNode =
  | LayoutContainer
  | LayoutFieldPlacement
  | LayoutDivider
  | LayoutStaticText;

// ── Zod ─────────────────────────────────────────────────────────────────

const layoutFieldPlacementSchema = z.strictObject({
  kind: z.literal("field"),
  id: z.string().min(1).max(64),
  fieldId: z.string().min(1).max(64),
  showLabel: z.boolean().optional(),
  grow: z.number().min(0).max(12).optional(),
  width: z
    .union([z.number().positive(), z.literal("auto"), z.literal("fill")])
    .optional(),
  variant: z.string().max(30).optional(),
  // Forme libre ici : chaque variant a son propre optionsSchema, appliqué
  // par normalizeLayoutTree (pas à ce stade, qui ne connaît pas encore le
  // type du champ référencé par fieldId).
  variantOptions: z.record(z.string(), z.unknown()).optional(),
});

const layoutContainerSchema: z.ZodType<LayoutContainer> = z.strictObject({
  kind: z.literal("container"),
  id: z.string().min(1).max(64),
  direction: z.enum(["row", "column"]),
  gap: z.number().min(0).max(100).optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  justify: z.enum(["start", "center", "end", "between"]).optional(),
  padding: z.number().min(0).max(100).optional(),
  grow: z.number().min(0).max(12).optional(),
  children: z
    .array(z.lazy((): z.ZodType<LayoutNode> => layoutNodeSchema))
    .max(MAX_CHILDREN_PER_CONTAINER),
});

const layoutDividerSchema = z.strictObject({
  kind: z.literal("divider"),
  id: z.string().min(1).max(64),
});

const layoutStaticTextSchema = z.strictObject({
  kind: z.literal("text"),
  id: z.string().min(1).max(64),
  // Borné comme tout ce qui est persisté : un texte de mise en page, pas un
  // champ rich_text déguisé.
  content: z.string().max(500),
  // strictObject : sans ces deux lignes, tout template portant une largeur de
  // texte serait REJETÉ à l'écriture, pas silencieusement rogné.
  width: z
    .union([z.number().positive(), z.literal("auto"), z.literal("fill")])
    .optional(),
  maxWidth: z.number().positive().max(2000).optional(),
});

const layoutNodeSchema: z.ZodType<LayoutNode> = z.union([
  layoutContainerSchema,
  layoutFieldPlacementSchema,
  layoutDividerSchema,
  layoutStaticTextSchema,
]);

// ── Parcours ────────────────────────────────────────────────────────────

// Les parcours ci-dessous switchent EXHAUSTIVEMENT sur `kind`, avec garde
// `never`. Ils testaient auparavant `field` par exclusion et traitaient tout
// le reste comme un container — ce qui plantait dès qu'un kind sans `children`
// est apparu (divider, texte statique). Ces fonctions tournent côté serveur à
// chaque validateTemplateDefinition ET côté client sur le canvas : le prochain
// kind doit échouer à la compilation, pas à l'exécution.
function assertNeverNode(node: never): never {
  throw new Error(
    `Unhandled layout node kind: ${JSON.stringify((node as LayoutNode).kind)}`,
  );
}

function collectLayoutFieldIds(tree: LayoutContainer): string[] {
  const ids: string[] = [];
  const walk = (node: LayoutNode) => {
    switch (node.kind) {
      case "field":
        ids.push(node.fieldId);
        return;
      case "container":
        node.children.forEach(walk);
        return;
      case "divider":
      case "text":
        return;
      default:
        assertNeverNode(node);
    }
  };
  walk(tree);
  return ids;
}

// Profondeur d'imbrication : ne compte que les containers. Une feuille, quelle
// qu'elle soit, vaut 0.
function getLayoutDepth(tree: LayoutContainer): number {
  const walk = (node: LayoutNode): number => {
    switch (node.kind) {
      case "container":
        return 1 + Math.max(0, ...node.children.map(walk));
      case "field":
      case "divider":
      case "text":
        return 0;
      default:
        return assertNeverNode(node);
    }
  };
  return walk(tree);
}

// Placements de champs d'un arbre, dans l'ordre du parcours. Utile dès qu'on a
// besoin du placement complet (et pas seulement du fieldId) : résoudre le
// variant effectif, détecter les champs à commit différé, avertir sur un champ
// inatteignable.
function collectLayoutPlacements(
  tree: LayoutContainer,
): LayoutFieldPlacement[] {
  const placements: LayoutFieldPlacement[] = [];
  const walk = (node: LayoutNode) => {
    switch (node.kind) {
      case "field":
        placements.push(node);
        return;
      case "container":
        node.children.forEach(walk);
        return;
      case "divider":
      case "text":
        return;
      default:
        assertNeverNode(node);
    }
  };
  walk(tree);
  return placements;
}

function collectLayoutNodeIds(tree: LayoutContainer): string[] {
  const ids: string[] = [];
  const walk = (node: LayoutNode) => {
    ids.push(node.id);
    if (node.kind === "container") node.children.forEach(walk);
  };
  walk(tree);
  return ids;
}

// ── Validation complète d'une définition de template ────────────────────

type TemplateDefinitionInput = {
  fields: unknown;
  nodeLayout: unknown;
  windowLayout?: unknown;
  titleFieldId?: string;
};

type TemplateDefinitionResult =
  | {
      ok: true;
      fields: TemplateField[];
      nodeLayout: LayoutContainer;
      windowLayout?: LayoutContainer;
    }
  | { ok: false; errors: string[] };

function formatZodIssues(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
    return `${prefix}${path}: ${issue.message}`;
  });
}

// Valide la structure (profondeur, unicité des ids, champs référencés
// existants et placés au plus une fois) ET normalise `variant`/`variantOptions`
// de chaque placement. Normaliser plutôt que rejeter : `updateTemplate` fait
// une revalidation complète à CHAQUE save, donc rejeter un id de variant
// devenu invalide (variant retiré du catalogue, optionsSchema resserré)
// rendrait le template entier non-sauvegardable pour toujours — y compris
// pour un edit sans rapport (renommer un champ). Le seul rejet dur reste
// structurel (déjà couvert par Zod plus haut).
function normalizeLayoutTree(
  label: "nodeLayout" | "windowLayout",
  tree: LayoutContainer,
  fieldsById: Map<string, TemplateField>,
  errors: string[],
): LayoutContainer {
  const surface: FieldSurface = label === "nodeLayout" ? "node" : "window";

  if (getLayoutDepth(tree) > MAX_LAYOUT_DEPTH) {
    errors.push(`${label}: max container depth is ${MAX_LAYOUT_DEPTH}`);
  }

  const nodeIds = collectLayoutNodeIds(tree);
  if (new Set(nodeIds).size !== nodeIds.length) {
    errors.push(`${label}: layout node ids must be unique`);
  }

  const placedFieldIds = collectLayoutFieldIds(tree);
  const seen = new Set<string>();
  for (const fieldId of placedFieldIds) {
    if (!fieldsById.has(fieldId)) {
      errors.push(`${label}: references unknown field "${fieldId}"`);
    }
    if (seen.has(fieldId)) {
      errors.push(
        `${label}: field "${fieldId}" is placed more than once in the tree`,
      );
    }
    seen.add(fieldId);
  }

  const normalizeNode = (node: LayoutNode): LayoutNode => {
    if (node.kind === "container") {
      return { ...node, children: node.children.map(normalizeNode) };
    }
    // Seuls les placements de champ portent un variant à normaliser. Les
    // éléments de mise en page n'ont rien à résoudre — test explicite plutôt
    // que par exclusion, pour que le prochain kind ne tombe pas ici par
    // accident.
    if (node.kind !== "field") return node;

    const field = fieldsById.get(node.fieldId);
    // Champ inconnu : déjà signalé ci-dessus (errors non vide ⇒ ce tree
    // normalisé ne sera de toute façon jamais persisté). Laissé tel quel.
    if (!field) return node;

    const resolved = resolveFieldVariant(field.type, surface, node.variant);

    let variantOptions = node.variantOptions;
    if (variantOptions !== undefined) {
      const descriptors = resolved.optionFields;
      if (!descriptors || descriptors.length === 0) {
        variantOptions = {};
      } else {
        // Même schéma que celui du rendu (dérivé des descripteurs, mis en
        // cache) : ce qui est normalisé à l'écriture est exactement ce qui
        // sera résolu à la lecture.
        const parsed =
          getResolvedOptionsSchema(descriptors).safeParse(variantOptions);
        variantOptions = parsed.success
          ? (parsed.data as Record<string, unknown>)
          : {};
      }
    }

    return { ...node, variant: resolved.id, variantOptions };
  };

  return normalizeNode(tree) as LayoutContainer;
}

// Valide fields + layouts + titleFieldId d'un coup. À appeler dans TOUTES
// les mutations qui écrivent un template (create/update), jamais côté
// client uniquement.
function validateTemplateDefinition(
  input: TemplateDefinitionInput,
): TemplateDefinitionResult {
  const errors: string[] = [];

  const fieldsResult = z
    .array(templateFieldSchema)
    .max(MAX_FIELDS_PER_TEMPLATE)
    .safeParse(input.fields);
  if (!fieldsResult.success) {
    return { ok: false, errors: formatZodIssues("fields", fieldsResult.error) };
  }
  const fields = fieldsResult.data as TemplateField[];

  const fieldIds = new Set(fields.map((f) => f.id));
  if (fieldIds.size !== fields.length) {
    errors.push("fields: ids must be unique (ids are never reused)");
  }
  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  const nodeLayoutResult = layoutContainerSchema.safeParse(input.nodeLayout);
  if (!nodeLayoutResult.success) {
    errors.push(...formatZodIssues("nodeLayout", nodeLayoutResult.error));
  }

  let windowLayout: LayoutContainer | undefined;
  if (input.windowLayout !== undefined) {
    const windowLayoutResult = layoutContainerSchema.safeParse(
      input.windowLayout,
    );
    if (!windowLayoutResult.success) {
      errors.push(...formatZodIssues("windowLayout", windowLayoutResult.error));
    } else {
      windowLayout = windowLayoutResult.data;
    }
  }

  if (input.titleFieldId !== undefined) {
    const titleField = fields.find((f) => f.id === input.titleFieldId);
    if (!titleField) {
      errors.push(`titleFieldId: unknown field "${input.titleFieldId}"`);
    } else if (titleField.type !== "short_text") {
      errors.push("titleFieldId: must reference a short_text field");
    }
  }

  if (errors.length > 0 || !nodeLayoutResult.success) {
    return { ok: false, errors };
  }

  const normalizedNodeLayout = normalizeLayoutTree(
    "nodeLayout",
    nodeLayoutResult.data,
    fieldsById,
    errors,
  );
  const normalizedWindowLayout = windowLayout
    ? normalizeLayoutTree("windowLayout", windowLayout, fieldsById, errors)
    : undefined;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    fields,
    nodeLayout: normalizedNodeLayout,
    windowLayout: normalizedWindowLayout,
  };
}

// Résumé auto pour le catalogue agent quand llmDescription est vide.
function buildTemplateLLMSummary(template: {
  fields: TemplateField[];
}): string {
  const parts = template.fields.map((f) => `${f.name} (${f.type})`);
  return parts.length > 0 ? `Fields: ${parts.join(", ")}` : "No fields";
}

export {
  layoutFieldPlacementSchema,
  layoutContainerSchema,
  layoutNodeSchema,
  collectLayoutFieldIds,
  collectLayoutPlacements,
  getLayoutDepth,
  validateTemplateDefinition,
  buildTemplateLLMSummary,
  MAX_LAYOUT_DEPTH,
  MAX_CHILDREN_PER_CONTAINER,
  MAX_FIELDS_PER_TEMPLATE,
};
export type {
  LayoutNode,
  LayoutContainer,
  LayoutFieldPlacement,
  LayoutDivider,
  LayoutStaticText,
};
