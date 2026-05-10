import { internalMutation } from "./_generated/server";
import * as SkillModels from "./models/skillModels";

/**
 * One-shot purge of legacy system skills (and their attachments) from the DB.
 * System skills now live in the code (convex/systemSkills/), so any leftover
 * `isSystem: true` rows would create duplicates in <available_skills>.
 *
 * Run with: `npx convex run migrations:purgeLegacySystemSkills`
 */
export const purgeLegacySystemSkills = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_isSystem", (q) => q.eq("isSystem", true))
      .collect();

    for (const row of rows) {
      await SkillModels.deleteSkillCascade(ctx, { skillId: row._id });
    }

    return { deleted: rows.length };
  },
});
