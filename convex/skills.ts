import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import * as SkillModels from "./models/skillModels";
import { extractSkillFields } from "./lib/parseSkillFrontmatter";
import { skillAttachmentTypeValidator } from "./schemas/skillAttachmentsSchema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);
    const skills = await SkillModels.listOwnedByUser(ctx, {
      userId: authUserId,
    });
    return skills.map((skill) => ({
      _id: skill._id,
      name: skill.name,
      description: skill.description,
    }));
  },
});

export const read = query({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, { skillId }) => {
    const authUserId = await requireAuth(ctx);
    const skill = await ctx.db.get(skillId);
    if (!skill) return null;
    if (skill.userId !== authUserId) {
      throw new ConvexError("Skill not accessible.");
    }

    const attachments = await SkillModels.listAttachments(ctx, { skillId });
    return {
      ...skill,
      attachments: attachments.map((attachment) => ({
        _id: attachment._id,
        name: attachment.name,
        type: attachment.type,
      })),
    };
  },
});

export const create = mutation({
  args: {
    rawContent: v.string(),
  },
  returns: v.id("skills"),
  handler: async (ctx, { rawContent }) => {
    const authUserId = await requireAuth(ctx);

    const parsed = extractSkillFields(rawContent);
    if (!parsed.ok) {
      throw new ConvexError(parsed.error);
    }

    const existing = await SkillModels.findByNameForUser(ctx, {
      userId: authUserId,
      name: parsed.name,
    });
    if (existing) {
      throw new ConvexError(
        `A skill named '${parsed.name}' already exists.`,
      );
    }

    return await SkillModels.insertSkill(ctx, {
      name: parsed.name,
      description: parsed.description,
      content: parsed.body,
      userId: authUserId,
      isSystem: false,
    });
  },
});

export const update = mutation({
  args: {
    skillId: v.id("skills"),
    rawContent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { skillId, rawContent }) => {
    const authUserId = await requireAuth(ctx);
    const skill = await ctx.db.get(skillId);
    if (!skill) throw new ConvexError("Skill not found.");
    if (skill.userId !== authUserId) {
      throw new ConvexError("Cannot edit this skill.");
    }

    const parsed = extractSkillFields(rawContent);
    if (!parsed.ok) {
      throw new ConvexError(parsed.error);
    }

    await SkillModels.patchSkill(ctx, {
      skillId,
      name: parsed.name,
      description: parsed.description,
      content: parsed.body,
    });
    return null;
  },
});

export const remove = mutation({
  args: {
    skillId: v.id("skills"),
  },
  returns: v.null(),
  handler: async (ctx, { skillId }) => {
    const authUserId = await requireAuth(ctx);
    const skill = await ctx.db.get(skillId);
    if (!skill) return null;
    if (skill.userId !== authUserId) {
      throw new ConvexError("Cannot delete this skill.");
    }

    await SkillModels.deleteSkillCascade(ctx, { skillId });
    return null;
  },
});

export const addAttachment = mutation({
  args: {
    skillId: v.id("skills"),
    name: v.string(),
    content: v.string(),
    type: skillAttachmentTypeValidator,
  },
  returns: v.id("skillAttachments"),
  handler: async (ctx, { skillId, name, content, type }) => {
    const authUserId = await requireAuth(ctx);
    const skill = await ctx.db.get(skillId);
    if (!skill) throw new ConvexError("Skill not found.");
    if (skill.userId !== authUserId) {
      throw new ConvexError("Cannot modify this skill.");
    }

    const existing = await SkillModels.findAttachmentByName(ctx, {
      skillId,
      name,
    });
    if (existing) {
      throw new ConvexError(
        `An attachment named '${name}' already exists on this skill.`,
      );
    }

    return await SkillModels.insertAttachment(ctx, {
      skillId,
      name,
      content,
      type,
    });
  },
});

export const removeAttachment = mutation({
  args: {
    attachmentId: v.id("skillAttachments"),
  },
  returns: v.null(),
  handler: async (ctx, { attachmentId }) => {
    const authUserId = await requireAuth(ctx);
    const attachment = await ctx.db.get(attachmentId);
    if (!attachment) return null;

    const skill = await ctx.db.get(attachment.skillId);
    if (!skill || skill.userId !== authUserId) {
      throw new ConvexError("Cannot modify this skill.");
    }

    await SkillModels.deleteAttachment(ctx, { attachmentId });
    return null;
  },
});
