import { Agent } from "@convex-dev/agent";
import { components } from "../../_generated/api";
import type { Profile } from "../../harness/types";
import { aiUsageSources } from "../../schemas/aiUsageSourceSchema";
import { threadAgentNames } from "../../schemas/threadMetadataSchema";
import { isModelMultimodal } from "../agents";
import { toolAgentNames } from "../agentConfig";
import generateWorkerSystemPrompt from "../systemPrompts/workerSystemPrompt";
import { getToolsForAgent } from "../tools";
import { createUsageHandler } from "../usage";
import {
  canvasCompaction,
  canvasStepContext,
  deferredToolNames,
  languageModel,
  toolReplay,
} from "./shared";

/** Ce que `run_subAgent` confie au sous-agent (cf. harness/subagents.ts). */
export type WorkerRunInput = { brief: string };

function readBrief(input: unknown): string {
  const brief = (input as { brief?: unknown } | null)?.brief;
  if (typeof brief !== "string") throw new Error("Worker run input has no brief.");
  return brief;
}

/**
 * Le worker : sous-agent lancé par Nolë (`run_subAgent`), sur son propre
 * thread. Il hérite du modèle du run parent, n'a que les tools autorisés au
 * worker, et ne lance pas d'autre sous-agent ni ne pose de question.
 */
export const workerProfile: Profile = {
  name: "worker",
  agentName: threadAgentNames.worker,
  // Pas de chat à garder fluide ici : la tâche est bornée par son brief.
  maxGenerationsPerRun: 40,

  async prepareRun(ctx, run, input) {
    return {
      systemPrompt: await generateWorkerSystemPrompt({
        ctx,
        canvasId: run.canvasId,
        userId: run.userId,
      }),
      llmPrompt: readBrief(input),
    };
  },

  agent(run) {
    return new Agent(components.agent, {
      name: threadAgentNames.worker,
      languageModel: languageModel(run),
      usageHandler: createUsageHandler(aiUsageSources.worker),
    });
  },

  tools(run) {
    return getToolsForAgent({
      agentName: toolAgentNames.worker,
      threadCtx: { authUserId: run.userId, canvasId: run.canvasId },
      isMultimodal: isModelMultimodal(languageModel(run)),
      trackActivity: false,
    });
  },

  replay: toolReplay,
  deferredTools: deferredToolNames,
  compaction: canvasCompaction,
  stepContext: canvasStepContext,
};
