import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { assertWithinLimit } from "./lib/memoryLimits";
import * as MemoryModels from "./models/memoryModels";

export const listNodeDataMemories = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.any(),
  handler: async (ctx, _args) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) return null;

    return {};
  },
});

// Lecture seule pour Settings : la memory de l'utilisateur connecté.
// Retourne le doc `memories` (dont `content` = JSON.stringify(string[]))
// ou null si aucune memory.
export const getUserMemory = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);
    return await MemoryModels.read(ctx, {
      subjectId: authUserId,
      type: "memory",
    });
  },
});

// Lecture seule pour Settings : la memory d'un canvas possédé par l'user.
// "owner" et pas "viewer" : on n'édite que les canvas créés par l'user,
// comme l'export (cf. dataExport.getCanvasForExport).
export const getCanvasMemory = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.any(),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "owner");
    return await MemoryModels.read(ctx, {
      subjectId: canvasId,
      type: "memory",
    });
  },
});

// Écriture depuis Settings : remplace toute la user memory.
// La limite (1300 chars sur le JSON sérialisé) est la même que le tool IA :
// throw en cas de dépassement, rien n'est écrit.
export const saveUserMemory = mutation({
  args: {
    entries: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { entries }) => {
    const authUserId = await requireAuth(ctx);
    const serialized = JSON.stringify(entries);
    assertWithinLimit("user", serialized);
    await MemoryModels.upsert(ctx, {
      subjectType: "user",
      subjectId: authUserId,
      type: "memory",
      content: serialized,
    });
    return null;
  },
});

// Écriture depuis Settings : remplace toute la memory d'un canvas possédé.
// Même limite que le tool IA (2500 chars sérialisés), throw si dépassée.
export const saveCanvasMemory = mutation({
  args: {
    canvasId: v.id("canvases"),
    entries: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { canvasId, entries }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "owner");
    const serialized = JSON.stringify(entries);
    assertWithinLimit("canvas", serialized);
    await MemoryModels.upsert(ctx, {
      subjectType: "canvas",
      subjectId: canvasId,
      type: "memory",
      content: serialized,
    });
    return null;
  },
});
