// import type { Doc, Id } from "../_generated/dataModel";
// import type { MutationCtx, QueryCtx } from "../_generated/server";

// type Task = Doc<"tasks">;

// async function getTaskByTaskId(ctx: QueryCtx | MutationCtx, id: Task["id"]) {
//   return await ctx.db
//     .query("tasks")
//     .withIndex("by_taskId", (q) => q.eq("id", id))
//     .unique();
// }

// function removeUndefinedFields<T extends Record<string, unknown>>(input: T) {
//   return Object.fromEntries(
//     Object.entries(input).filter(([, value]) => value !== undefined),
//   ) as Partial<T>;
// }

// export async function createTask(
//   ctx: MutationCtx,
//   payload: Omit<Task, "_id" | "_creationTime">,
// ): Promise<Id<"tasks">> {
//   return await ctx.db.insert("tasks", payload);
// }

// export async function runTask(
//   ctx: MutationCtx,
//   { id, startTime }: Pick<Task, "id"> & { startTime?: number },
// ) {
//   const task = await getTaskByTaskId(ctx, id);

//   if (!task) {
//     return false;
//   }

//   await ctx.db.patch(task._id, {
//     status: "running",
//     startTime: startTime ?? Date.now(),
//   });

//   return true;
// }

// export async function readTask(ctx: QueryCtx, { id }: Pick<Task, "id">) {
//   return await getTaskByTaskId(ctx, id);
// }

// export async function updateTask(
//   ctx: MutationCtx,
//   { id, patch }: { id: Task["id"]; patch: Partial<Omit<Task, "id">> },
// ) {
//   const task = await getTaskByTaskId(ctx, id);

//   if (!task) {
//     return false;
//   }

//   const sanitizedPatch = removeUndefinedFields(patch);
//   if (Object.keys(sanitizedPatch).length === 0) {
//     return true;
//   }

//   await ctx.db.patch(task._id, sanitizedPatch);
//   return true;
// }

// export async function stopTask(
//   ctx: MutationCtx,
//   {
//     id,
//     endTime,
//     resultMessage,
//   }: Pick<Task, "id"> & {
//     endTime?: number;
//     resultMessage?: string;
//   },
// ) {
//   return await updateTask(ctx, {
//     id,
//     patch: {
//       status: "stopped",
//       endTime: endTime ?? Date.now(),
//       resultMessage,
//     },
//   });
// }
