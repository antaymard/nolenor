import { Eval } from "braintrust";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createEvalConvexClient, requiredEnv } from "./convexAuthClient";
import { noleDataset } from "./dataset";
import { toolUsageScorer, relevanceJudge } from "./scorers";

// Existing Braintrust project (see evals/README.md); overridable via env var.
const BRAINTRUST_PROJECT_ID =
  process.env.BRAINTRUST_PROJECT_ID ?? "a5d57965-787e-4d62-8d63-cba247f5c490";

// Logged in once for the whole experiment, not once per case: this is a
// module-scope promise, so every task() call below just awaits the same
// already-resolved (or in-flight) sign-in instead of re-authenticating.
const clientPromise = createEvalConvexClient();

Eval("Nolë", {
  projectId: BRAINTRUST_PROJECT_ID,
  data: () =>
    noleDataset.map((c) => ({
      input: c.input,
      expected: c.expected,
      metadata: c.metadata,
    })),
  task: async (input) => {
    const client = await clientPromise;
    return client.action(api.ia.evalHarness.runEvalTurn, {
      canvasId: requiredEnv("EVAL_CANVAS_ID") as Id<"canvases">,
      prompt: input.prompt,
    });
  },
  scores: [toolUsageScorer, relevanceJudge],
});
