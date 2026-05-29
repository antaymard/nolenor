import { v } from "convex/values";

const recipesValidor = v.object({
  userId: v.id("users"),
  name: v.string(),
  content: v.string(),
});

export { recipesValidor };
