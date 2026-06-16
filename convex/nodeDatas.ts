import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import * as NodeDataModel from "./models/nodeDataModels";
import { nodeDatasValidator } from "./schemas/nodeDatasSchema";
export const create = mutation({
  args: nodeDatasValidator,
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "editor");

    const nodeDataId = await ctx.db.insert("nodeDatas", {
      ...args,
    });

    return nodeDataId;
  },
  returns: v.id("nodeDatas"),
});

export const read = query({
  args: { nodeDataId: v.id("nodeDatas") },
  handler: async (ctx, args) => {
    const authUserId = await optionalAuth(ctx);
    const nodeData = await ctx.db.get(args.nodeDataId);
    if (!nodeData) return null;
    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId, "viewer", {
      allowPublic: true,
    });
    return nodeData;
  },
});

export const listByCanvasId = query({
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

    // Extraire les nodeDataIds des nodes du canvas
    const nodeDataIds = (canvas.nodes || [])
      .map((node) => node.nodeDataId)
      .filter((id): id is Id<"nodeDatas"> => id !== undefined);

    if (nodeDataIds.length === 0) return [];

    // Fetch les nodeDatas en parallèle
    const nodeDatas = await Promise.all(
      nodeDataIds.map((id) => ctx.db.get(id)),
    );

    // Filtrer les nulls (au cas où un nodeData aurait été supprimé)
    return nodeDatas.filter((nd) => nd !== null);
  },
});

export const listRecentByCanvasId = query({
  args: {
    canvasId: v.id("canvases"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { canvasId, limit }) => {
    const authUserId = await optionalAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "viewer",
      { allowPublic: true },
    );

    const nodeByDataId = new Map<Id<"nodeDatas">, string>();
    for (const node of canvas.nodes || []) {
      if (node.nodeDataId) {
        nodeByDataId.set(node.nodeDataId, node.id);
      }
    }

    if (nodeByDataId.size === 0) return [];

    const nodeDatas = await Promise.all(
      Array.from(nodeByDataId.keys()).map((id) => ctx.db.get(id)),
    );

    const filtered = nodeDatas
      .filter((nd) => nd !== null)
      .sort((a, b) => (b!.updatedAt ?? 0) - (a!.updatedAt ?? 0));

    const sliced = limit ? filtered.slice(0, limit) : filtered;

    return sliced.map((nd) => ({
      nodeData: nd!,
      xyNodeId: nodeByDataId.get(nd!._id)!,
    }));
  },
});

const APP_ERROR_MAX = 10;
const APP_ERROR_MESSAGE_MAX_CHARS = 2_000;
const APP_ERROR_STACK_MAX_CHARS = 4_000;

const reportedAppErrorValidator = v.object({
  type: v.string(),
  message: v.string(),
  stack: v.optional(v.string()),
  source: v.optional(v.string()),
  line: v.optional(v.number()),
  col: v.optional(v.number()),
  timestamp: v.number(),
});

// AppNode runtime error reporting from the iframe SDK.
// - Stale writes (mismatched __v) are silently dropped to ignore late posts
//   from an iframe still running a previous code version.
// - Errors are deduplicated by (type|message|stack) and capped at APP_ERROR_MAX.
export const reportAppErrors = mutation({
  args: {
    _id: v.id("nodeDatas"),
    __v: v.string(),
    errors: v.array(reportedAppErrorValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, { _id, __v, errors }): Promise<boolean> => {
    const authUserId = await requireAuth(ctx);
    const existing = await ctx.db.get(_id);
    if (!existing) throw new ConvexError("NodeData not found");
    await requireCanvasAccess(ctx, existing.canvasId, authUserId, "editor");

    if (existing.type !== "app") return false;

    const currentVersion = existing.values?.__v;
    if (typeof currentVersion === "string" && currentVersion !== __v) {
      return false;
    }

    const truncate = (s: string | undefined, max: number) =>
      typeof s === "string" && s.length > max ? s.slice(0, max) : s;

    const incoming = errors.map((e) => ({
      ...e,
      message: truncate(e.message, APP_ERROR_MESSAGE_MAX_CHARS) ?? "",
      stack: truncate(e.stack, APP_ERROR_STACK_MAX_CHARS),
    }));

    const previous = Array.isArray(existing.values?.errors)
      ? (existing.values.errors as typeof incoming)
      : [];

    const seen = new Set<string>();
    const merged: typeof incoming = [];
    for (const e of [...previous, ...incoming]) {
      const key = `${e.type}|${e.message}|${e.stack ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
    const capped = merged.slice(-APP_ERROR_MAX);

    if (
      capped.length === previous.length &&
      capped.every((e, i) => {
        const p = previous[i];
        return (
          p &&
          p.type === e.type &&
          p.message === e.message &&
          p.stack === e.stack
        );
      })
    ) {
      return true;
    }

    await ctx.db.patch(_id, {
      values: { ...existing.values, errors: capped },
      updatedAt: Date.now(),
    });
    return true;
  },
});

// TODO : use NodeConfiig to validate values schema based on type
export const updateValues = mutation({
  args: {
    _id: v.id("nodeDatas"),
    values: v.record(v.string(), v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, { _id, values }): Promise<boolean> => {
    const authUserId = await requireAuth(ctx);
    const existing = await ctx.db.get(_id);

    if (!existing) throw new ConvexError("NodeData not found");

    await requireCanvasAccess(ctx, existing.canvasId, authUserId, "editor");
    // L'actor est dérivé de l'auth server-side : un client ne doit jamais
    // pouvoir s'attribuer une autre identité (ni se faire passer pour un agent).
    return NodeDataModel.updateValues(ctx, {
      _id,
      values,
      actor: { type: "user", userId: authUserId },
    });
  },
});
