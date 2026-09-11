import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import * as SkillModels from "../models/skillModels";

export const listAvailableForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => SkillModels.listAvailableForUser(ctx, args),
});

export const findByNameForUser = internalQuery({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => SkillModels.findByNameForUser(ctx, args),
});

export const listAttachments = internalQuery({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => SkillModels.listAttachments(ctx, args),
});

export const findAttachmentByName = internalQuery({
  args: {
    skillId: v.id("skills"),
    name: v.string(),
  },
  handler: async (ctx, args) => SkillModels.findAttachmentByName(ctx, args),
});

export const findAttachmentByNameForUser = internalQuery({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) =>
    SkillModels.findAttachmentByNameForUser(ctx, args),
});
