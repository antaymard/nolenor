import { z } from "zod";
import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";

// Derived from the harness's own return validator rather than duplicated by
// hand, so a change to runEvalTurn's shape surfaces here as a type error
// instead of silently drifting.
export type NoleTurnOutput = FunctionReturnType<
  typeof api.ia.evalHarness.runEvalTurn
>;

// Recursively collects string values keyed "...NodeId"/"...nodeId" from a tool
// call's input, to check for hallucinated node references.
function collectNodeIdRefs(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectNodeIdRefs(item, acc);
  } else if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/nodeid$/i.test(key) && typeof val === "string") {
        acc.add(val);
      } else {
        collectNodeIdRefs(val, acc);
      }
    }
  }
  return acc;
}

export function toolUsageScorer({
  input,
  output,
}: {
  input: { expectedToolNames?: string[]; forbiddenToolNames?: string[] };
  output: NoleTurnOutput;
}) {
  const calledNames = output.toolCalls.map((c) => c.toolName);
  const expected = input.expectedToolNames ?? [];
  const forbidden = input.forbiddenToolNames ?? [];

  const expectedScore =
    expected.length === 0
      ? 1
      : expected.filter((name) => calledNames.includes(name)).length /
        expected.length;

  const forbiddenScore = forbidden.some((name) => calledNames.includes(name))
    ? 0
    : 1;

  const knownIds = new Set(output.visibleNodeIds);
  let hallucinated = 0;
  let checked = 0;
  for (const call of output.toolCalls) {
    for (const id of collectNodeIdRefs(call.input)) {
      checked++;
      if (!knownIds.has(id)) hallucinated++;
    }
    // A successful create_node's output becomes a legitimate id for any later
    // call in the same transcript (toolCalls is in transcript order).
    const created = call.output as { success?: boolean; nodeId?: string } | null;
    if (call.toolName === "create_node" && created?.success && created.nodeId) {
      knownIds.add(created.nodeId);
    }
  }
  const noHallucinationScore = checked === 0 ? 1 : 1 - hallucinated / checked;

  return [
    { name: "tool_usage_expected", score: expectedScore },
    { name: "tool_usage_forbidden", score: forbiddenScore },
    { name: "tool_usage_no_hallucinated_nodeids", score: noHallucinationScore },
  ];
}

const RELEVANCE_JUDGE_MODEL = "anthropic/claude-haiku-4.5";

const relevanceSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});

export async function relevanceJudge({
  input,
  output,
  expected,
}: {
  input: { prompt: string };
  output: NoleTurnOutput;
  expected: string;
}) {
  const { object } = await generateObject({
    model: openrouter(RELEVANCE_JUDGE_MODEL),
    schema: relevanceSchema,
    prompt: `Tu évalues la réponse d'un agent IA nommé Nolë à une demande utilisateur.

Demande utilisateur :
${input.prompt}

Texte final de la réponse de Nolë :
${output.text || "(aucun texte, seulement des appels d'outils)"}

Outils appelés par Nolë durant ce tour : ${JSON.stringify(output.toolCalls.map((t) => t.toolName))}

Grille d'évaluation :
${expected}

Note de 0 à 1 dans quelle mesure la réponse satisfait cette grille d'évaluation, et explique brièvement pourquoi.`,
  });

  return {
    name: "relevance",
    score: object.score,
    metadata: { rationale: object.rationale },
  };
}
