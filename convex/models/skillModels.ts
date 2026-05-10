import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  SYSTEM_SKILLS,
  findSystemSkillByName,
  type SystemSkill,
} from "../systemSkills/_registry.generated";

type Skill = Doc<"skills">;
type SkillAttachment = Doc<"skillAttachments">;

export type SkillSummary = {
  name: string;
  description: string;
};

export type SkillLookup =
  | { kind: "user"; skill: Skill }
  | { kind: "system"; skill: SystemSkill };

export async function listAvailableForUser(
  ctx: QueryCtx,
  { userId }: { userId: Id<"users"> },
): Promise<SkillSummary[]> {
  const userSkills = await ctx.db
    .query("skills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const seen = new Set<string>();
  const merged: SkillSummary[] = [];
  for (const skill of userSkills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    merged.push({ name: skill.name, description: skill.description });
  }
  for (const skill of SYSTEM_SKILLS) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    merged.push({ name: skill.name, description: skill.description });
  }
  return merged;
}

export async function listOwnedByUser(
  ctx: QueryCtx,
  { userId }: { userId: Id<"users"> },
): Promise<Skill[]> {
  return await ctx.db
    .query("skills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export async function findByNameForUser(
  ctx: QueryCtx,
  { userId, name }: { userId: Id<"users">; name: string },
): Promise<SkillLookup | null> {
  const userMatch = await ctx.db
    .query("skills")
    .withIndex("by_user_and_name", (q) =>
      q.eq("userId", userId).eq("name", name),
    )
    .unique();
  if (userMatch) return { kind: "user", skill: userMatch };

  const systemMatch = findSystemSkillByName(name);
  if (systemMatch) return { kind: "system", skill: systemMatch };

  return null;
}

export async function listAttachments(
  ctx: QueryCtx,
  { skillId }: { skillId: Id<"skills"> },
): Promise<SkillAttachment[]> {
  return await ctx.db
    .query("skillAttachments")
    .withIndex("by_skill", (q) => q.eq("skillId", skillId))
    .collect();
}

export async function findAttachmentByName(
  ctx: QueryCtx,
  { skillId, name }: { skillId: Id<"skills">; name: string },
): Promise<SkillAttachment | null> {
  return await ctx.db
    .query("skillAttachments")
    .withIndex("by_skill_and_name", (q) =>
      q.eq("skillId", skillId).eq("name", name),
    )
    .unique();
}

export async function findAttachmentByNameForUser(
  ctx: QueryCtx,
  { userId, name }: { userId: Id<"users">; name: string },
): Promise<{ attachment: SkillAttachment; skill: Skill } | null> {
  const userSkills = await listOwnedByUser(ctx, { userId });
  for (const skill of userSkills) {
    const attachment = await findAttachmentByName(ctx, {
      skillId: skill._id,
      name,
    });
    if (attachment) {
      return { attachment, skill };
    }
  }
  return null;
}

export async function insertSkill(
  ctx: MutationCtx,
  args: {
    name: string;
    description: string;
    content: string;
    userId?: Id<"users">;
    isSystem: boolean;
  },
): Promise<Id<"skills">> {
  return await ctx.db.insert("skills", args);
}

export async function patchSkill(
  ctx: MutationCtx,
  {
    skillId,
    ...patch
  }: {
    skillId: Id<"skills">;
    name?: string;
    description?: string;
    content?: string;
  },
): Promise<void> {
  await ctx.db.patch(skillId, patch);
}

export async function deleteSkillCascade(
  ctx: MutationCtx,
  { skillId }: { skillId: Id<"skills"> },
): Promise<void> {
  const attachments = await listAttachments(ctx, { skillId });
  for (const attachment of attachments) {
    await ctx.db.delete(attachment._id);
  }
  await ctx.db.delete(skillId);
}

export async function insertAttachment(
  ctx: MutationCtx,
  args: {
    skillId: Id<"skills">;
    name: string;
    content: string;
    type: SkillAttachment["type"];
  },
): Promise<Id<"skillAttachments">> {
  return await ctx.db.insert("skillAttachments", args);
}

export async function deleteAttachment(
  ctx: MutationCtx,
  { attachmentId }: { attachmentId: Id<"skillAttachments"> },
): Promise<void> {
  await ctx.db.delete(attachmentId);
}
