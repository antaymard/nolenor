import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import * as NodeTemplateModels from "./models/nodeTemplateModels";
import { templateFieldValidator } from "./schemas/nodeTemplatesSchema";

// Args partagés create/update. fields/nodeLayout/windowLayout passent par
// le validateur Convex permissif puis par le Zod-parse serveur strict dans
// les models (validateTemplateDefinition) — ne jamais faire confiance au
// client pour la forme des arbres.
const templateWriteArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  llmDescription: v.optional(v.string()),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
  fields: v.array(templateFieldValidator),
  nodeLayout: v.any(),
  windowLayout: v.optional(v.any()),
  titleFieldId: v.optional(v.string()),
  defaultDimensions: v.object({
    width: v.number(),
    height: v.number(),
    resizable: v.optional(v.boolean()),
  }),
  windowSize: v.optional(v.object({ width: v.number(), height: v.number() })),
};

// Templates du user connecté (builder + menu d'ajout de node).
export const listMine = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    return NodeTemplateModels.listByCreator(ctx, {
      creatorId: authUserId,
      includeArchived: args.includeArchived,
    });
  },
});

// Templates référencés par les nodes d'un canvas — c'est ainsi que les
// viewers d'un canvas partagé résolvent les templates d'autres users.
export const listForCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const authUserId = await optionalAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "viewer",
      { allowPublic: true },
    );
    return NodeTemplateModels.resolveTemplatesForCanvas(ctx, canvas);
  },
});

// Nombre d'instances vivantes d'un template (confirmations destructives
// dans le builder). Query séparée de listMine pour ne pas rendre le menu
// d'ajout réactif à toutes les écritures de nodeDatas.
export const countInstances = query({
  args: { templateId: v.id("nodeTemplates") },
  returns: v.number(),
  handler: async (ctx, { templateId }) => {
    const authUserId = await requireAuth(ctx);
    await NodeTemplateModels.requireOwnedTemplate(ctx, templateId, authUserId);
    return NodeTemplateModels.countInstances(ctx, templateId);
  },
});

export const create = mutation({
  args: templateWriteArgs,
  returns: v.id("nodeTemplates"),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    return NodeTemplateModels.createTemplate(ctx, {
      creatorId: authUserId,
      input: args,
    });
  },
});

export const update = mutation({
  args: {
    templateId: v.id("nodeTemplates"),
    ...templateWriteArgs,
  },
  returns: v.null(),
  handler: async (ctx, { templateId, ...input }) => {
    const authUserId = await requireAuth(ctx);
    const template = await NodeTemplateModels.requireOwnedTemplate(
      ctx,
      templateId,
      authUserId,
    );
    await NodeTemplateModels.updateTemplate(ctx, { template, input });
    return null;
  },
});

// Soft-delete uniquement : les instances vivantes continuent de rendre via
// listForCanvas, un template archivé disparaît juste de listMine.
export const setArchived = mutation({
  args: {
    templateId: v.id("nodeTemplates"),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { templateId, archived }) => {
    const authUserId = await requireAuth(ctx);
    const template = await NodeTemplateModels.requireOwnedTemplate(
      ctx,
      templateId,
      authUserId,
    );
    await NodeTemplateModels.setArchived(ctx, { template, archived });
    return null;
  },
});
