import { v } from "convex/values";

const sharesValidator = v.object({
  resourceType: v.union(v.literal("canvas")), // extensible: "nodeData" later
  canvasId: v.id("canvases"),
  userId: v.id("users"),
  permission: v.union(v.literal("viewer"), v.literal("editor")),
  grantedBy: v.id("users"),
});

export { sharesValidator };
