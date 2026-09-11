import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const upsertWishlistEmail = internalMutation({
  args: {
    email: v.string(),
    referral: v.optional(v.string()),
  },
  returns: v.object({
    alreadyExists: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const normalizedReferral = args.referral?.trim() || undefined;

    const existingEntry = await ctx.db
      .query("wishlistEmails")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    if (existingEntry) {
      return {
        alreadyExists: true,
        message: "Email deja enregistre, c'etait deja OK.",
      };
    }

    await ctx.db.insert("wishlistEmails", {
      email: normalizedEmail,
      referral: normalizedReferral,
    });

    return {
      alreadyExists: false,
      message: "Email enregistre avec succes.",
    };
  },
});
