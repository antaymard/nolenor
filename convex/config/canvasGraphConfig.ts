import { convexToJson, type Value } from "convex/values";

// Admission limits for the legacy full-graph contract during A/M1. They are
// conservative defaults to validate on a representative isolated deployment.
export const GRAPH_LIMITS = {
  mutationItems: 128,
  graphNodes: 8192,
  graphEdges: 8192,
  graphBytes: 900 * 1024,
  mutationBytes: 4 * 1024 * 1024,
  mutationDocuments: 2048,
  migrationBatch: 32,
} as const;

export function graphValueBytes(value: unknown): number {
  return new TextEncoder().encode(
    JSON.stringify(convexToJson(value as Value)),
  ).byteLength;
}
