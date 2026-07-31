import { v } from "convex/values";

/**
 * One row per reference from a nodeData to an object stored on R2.
 *
 * Duplicating a node copies its `values` verbatim, so two nodes can point at
 * the same storage key. Without this table the first deletion takes the file
 * out from under everyone else still using it.
 */
const r2ObjectsValidator = v.object({
  key: v.string(),
  nodeDataId: v.id("nodeDatas"),
});

export { r2ObjectsValidator };
