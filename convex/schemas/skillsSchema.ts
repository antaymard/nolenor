import { v } from "convex/values";

const skillsValidator = v.object({
  name: v.string(),
  description: v.string(),
  content: v.string(),
  userId: v.optional(v.id("users")),
  isSystem: v.boolean(),
});

export { skillsValidator };
