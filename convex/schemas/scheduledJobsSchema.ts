import { v } from "convex/values";

const scheduledJobsValidator = v.object({
  type: v.union(v.literal("generate-node-data-one-liner")),
  nodesDataId: v.optional(v.id("nodeDatas")),
  scheduledAt: v.number(),
  jobId: v.id("_scheduled_functions"),
});

export { scheduledJobsValidator };
