import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as MemoryModels from "../models/memoryModels";
import {
  memoriesValidator,
  subjectIdValidator,
  typeValidator,
} from "../schemas/memoriesSchema";

const { updatedAt: _, ...upsertArgs } = memoriesValidator.fields;

export const upsert = internalMutation({
  args: upsertArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => MemoryModels.upsert(ctx, args),
});

export const read = internalQuery({
  args: {
    subjectId: subjectIdValidator,
    type: typeValidator,
  },
  handler: async (ctx, args) => MemoryModels.read(ctx, args),
});

export const list = internalQuery({
  args: {
    subjectId: subjectIdValidator,
  },
  handler: async (ctx, args) => MemoryModels.list(ctx, args),
});
