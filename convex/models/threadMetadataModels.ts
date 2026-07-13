import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type ThreadMetadata = Doc<"threadMetadata">;

export async function findByThreadId(
  ctx: QueryCtx,
  { threadId }: { threadId: string },
): Promise<ThreadMetadata | null> {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .unique();
}
