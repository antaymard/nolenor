import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import errors from "../config/errorsConfig";
import { validateTemplateDefinition } from "../config/templateConfig";
import type { TemplateField } from "../config/fieldConfig";

type Ctx = QueryCtx | MutationCtx;

// ── Lectures ────────────────────────────────────────────────────────────

export async function listByCreator(
  ctx: Ctx,
  {
    creatorId,
    includeArchived = false,
  }: { creatorId: Id<"users">; includeArchived?: boolean },
) {
  const templates = await ctx.db
    .query("nodeTemplates")
    .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
    .collect();

  const filtered = includeArchived
    ? templates
    : templates.filter((t) => t.archivedAt === undefined);

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

// Résout les templates référencés par les nodes d'un canvas, quel que soit
// leur creator (viewers de canvases partagés) et y compris archivés (les
// instances vivantes doivent continuer à rendre). Tri stable par _id : la
// query qui appelle ceci relit le doc canvas à chaque drag de node, un
// résultat stable évite des pushes inutiles aux subscribers.
export async function resolveTemplatesForCanvas(
  ctx: Ctx,
  canvas: Doc<"canvases">,
): Promise<Doc<"nodeTemplates">[]> {
  const ids = new Set<string>();
  for (const node of canvas.nodes ?? []) {
    const templateId = node.data?.templateId;
    if (typeof templateId === "string") ids.add(templateId);
  }
  if (ids.size === 0) return [];

  const docs = await Promise.all(
    Array.from(ids).map((id) => ctx.db.get(id as Id<"nodeTemplates">)),
  );

  return docs
    .filter((d): d is Doc<"nodeTemplates"> => d !== null)
    .sort((a, b) => a._id.localeCompare(b._id));
}

export async function countInstances(
  ctx: Ctx,
  templateId: Id<"nodeTemplates">,
): Promise<number> {
  const instances = await ctx.db
    .query("nodeDatas")
    .withIndex("by_templateId", (q) => q.eq("templateId", templateId))
    .collect();
  return instances.length;
}

// ── Écritures ───────────────────────────────────────────────────────────

type TemplateWriteInput = {
  name: string;
  description?: string;
  llmDescription?: string;
  icon?: string;
  color?: string;
  fields: unknown;
  nodeLayout: unknown;
  windowLayout?: unknown;
  titleFieldId?: string;
  defaultDimensions: { width: number; height: number; resizable?: boolean };
  windowSize?: { width: number; height: number };
};

// Zod-parse obligatoire : nodeLayout/windowLayout sont v.any() côté Convex,
// un arbre malformé crasherait le rendu chez tous les viewers.
function parseDefinitionOrThrow(input: TemplateWriteInput) {
  const result = validateTemplateDefinition({
    fields: input.fields,
    nodeLayout: input.nodeLayout,
    windowLayout: input.windowLayout,
    titleFieldId: input.titleFieldId,
  });
  if (!result.ok) {
    throw new ConvexError(
      `Invalid template definition: ${result.errors.join(" | ")}`,
    );
  }
  return result;
}

export async function createTemplate(
  ctx: MutationCtx,
  { creatorId, input }: { creatorId: Id<"users">; input: TemplateWriteInput },
): Promise<Id<"nodeTemplates">> {
  const parsed = parseDefinitionOrThrow(input);

  return ctx.db.insert("nodeTemplates", {
    creatorId,
    name: input.name,
    description: input.description,
    llmDescription: input.llmDescription,
    icon: input.icon,
    color: input.color,
    fields: parsed.fields,
    nodeLayout: parsed.nodeLayout,
    windowLayout: parsed.windowLayout,
    titleFieldId: input.titleFieldId,
    defaultDimensions: input.defaultDimensions,
    windowSize: input.windowSize,
    updatedAt: Date.now(),
  });
}

// Update en remplacement complet (le builder sauvegarde son draft entier).
// Le type d'un champ existant est immuable : renommer est gratuit (values
// keyées par id), re-typer casserait les values des instances — le builder
// propose « dupliquer en nouveau champ » à la place.
export async function updateTemplate(
  ctx: MutationCtx,
  {
    template,
    input,
  }: { template: Doc<"nodeTemplates">; input: TemplateWriteInput },
): Promise<void> {
  const parsed = parseDefinitionOrThrow(input);

  const previousTypesById = new Map(
    template.fields.map((f: TemplateField) => [f.id, f.type]),
  );
  for (const field of parsed.fields) {
    const previousType = previousTypesById.get(field.id);
    if (previousType !== undefined && previousType !== field.type) {
      throw new ConvexError(
        `Field "${field.name}" (${field.id}) cannot change type from "${previousType}" to "${field.type}". Duplicate it as a new field instead.`,
      );
    }
  }

  await ctx.db.patch(template._id, {
    name: input.name,
    description: input.description,
    llmDescription: input.llmDescription,
    icon: input.icon,
    color: input.color,
    fields: parsed.fields,
    nodeLayout: parsed.nodeLayout,
    windowLayout: parsed.windowLayout,
    titleFieldId: input.titleFieldId,
    defaultDimensions: input.defaultDimensions,
    windowSize: input.windowSize,
    updatedAt: Date.now(),
  });
}

export async function setArchived(
  ctx: MutationCtx,
  {
    template,
    archived,
  }: { template: Doc<"nodeTemplates">; archived: boolean },
): Promise<void> {
  await ctx.db.patch(template._id, {
    archivedAt: archived ? Date.now() : undefined,
    updatedAt: Date.now(),
  });
}

export async function requireOwnedTemplate(
  ctx: Ctx,
  templateId: Id<"nodeTemplates">,
  userId: Id<"users">,
): Promise<Doc<"nodeTemplates">> {
  const template = await ctx.db.get(templateId);
  if (!template) {
    throw new ConvexError(errors.TEMPLATE_NOT_FOUND);
  }
  if (template.creatorId !== userId) {
    throw new ConvexError(errors.INSUFFICIENT_PERMISSIONS);
  }
  return template;
}

export type { TemplateWriteInput };
