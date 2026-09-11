import { v } from "convex/values";

const wishlistEmailsValidator = v.object({
  email: v.string(),
  referral: v.optional(v.string()),
});

export { wishlistEmailsValidator };
