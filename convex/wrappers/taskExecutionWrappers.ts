// import { v } from "convex/values";
// import { internalMutation, internalQuery } from "../_generated/server";
// import { taskExecutionsValidator } from "../schemas/taskExecutionsSchema";
// import * as TaskModels from "../models/taskModels";

// export const create = internalMutation({
//   args: taskExecutionsValidator.fields,
//   returns: v.id("tasks"),
//   handler: async (ctx, args) => {
//     return TaskModels.createTask(ctx, args);
//   },
// });

// export const run = internalMutation({
//   args: {
//     id: taskExecutionsValidator.fields.id,
//     startTime: v.optional(taskExecutionsValidator.fields.startTime),
//   },
//   returns: v.boolean(),
//   handler: async (ctx, args) => {
//     return TaskModels.runTask(ctx, args);
//   },
// });

// export const read = internalQuery({
//   args: {
//     id: taskExecutionsValidator.fields.id,
//   },
//   handler: async (ctx, args) => {
//     return TaskModels.readTask(ctx, args);
//   },
// });

// export const update = internalMutation({
//   args: {
//     id: taskExecutionsValidator.fields.id,
//     name: v.optional(taskExecutionsValidator.fields.name),
//     instructions: v.optional(taskExecutionsValidator.fields.instructions),
//     status: v.optional(taskExecutionsValidator.fields.status),
//     nodeId: v.optional(taskExecutionsValidator.fields.nodeId),
//     startTime: v.optional(taskExecutionsValidator.fields.startTime),
//     endTime: v.optional(taskExecutionsValidator.fields.endTime),
//     resultMessage: v.optional(taskExecutionsValidator.fields.resultMessage),
//   },
//   returns: v.boolean(),
//   handler: async (ctx, args) => {
//     const { id, ...patch } = args;
//     return TaskModels.updateTask(ctx, { id, patch });
//   },
// });

// export const stop = internalMutation({
//   args: {
//     id: taskExecutionsValidator.fields.id,
//     endTime: v.optional(taskExecutionsValidator.fields.endTime),
//     resultMessage: v.optional(taskExecutionsValidator.fields.resultMessage),
//   },
//   returns: v.boolean(),
//   handler: async (ctx, args) => {
//     return TaskModels.stopTask(ctx, args);
//   },
// });
