import { Agent } from "@convex-dev/agent";
import { components, internal } from "../../_generated/api";
import type { Profile } from "../../harness/types";
import { aiUsageSources } from "../../schemas/aiUsageSourceSchema";
import { threadAgentNames } from "../../schemas/threadMetadataSchema";
import { isModelMultimodal } from "../agents";
import { toolAgentNames } from "../agentConfig";
import { generateMessageContext } from "../helpers/generateMessageContext";
import type { NoleMessageMetadata } from "../nole";
import { generateNoleSystemPrompt } from "../systemPrompts/noleSystemPrompt";
import { getToolsForAgent } from "../tools";
import { createUsageHandler } from "../usage";
import {
  canvasCompaction,
  canvasStepContext,
  deferredToolNames,
  languageModel,
  toolReplay,
} from "./shared";

/** Ce que `nole.saveMessage` confie à la première génération d'un run. */
export type NoleRunInput = {
  userPrompt: string;
  metadata?: NoleMessageMetadata;
};

function readRunInput(input: unknown): NoleRunInput {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as { userPrompt?: unknown }).userPrompt !== "string"
  ) {
    throw new Error("Nolë run input is missing its userPrompt.");
  }
  return input as NoleRunInput;
}

/**
 * Ce que le modèle voit d'un message : son contexte (pièces jointes, vue du
 * canvas, modifications depuis le message précédent), puis le message. L'UI
 * n'affiche que le contenu de `<user_message>`.
 */
export function noleMessageContent(
  userPrompt: string,
  metadata: NoleMessageMetadata | undefined,
  canvasChangesSinceLastMessage = "",
): string {
  const generatedMessageContext = generateMessageContext({
    metadata,
    canvasChangesSinceLastMessage,
  });
  return generatedMessageContext
    ? `${generatedMessageContext}\n\n<user_message>\n${userPrompt}\n</user_message>`
    : userPrompt;
}

/**
 * Nolë, l'agent du panel. Reprend à l'identique ce que faisait
 * `noleCompletion.streamResponse` : même system prompt, même contexte injecté
 * dans le message, mêmes tools, même plafond de 25 steps.
 */
export const noleProfile: Profile = {
  name: "nole",
  agentName: threadAgentNames.nole,
  maxGenerationsPerRun: 25,

  async prepareRun(ctx, run, input) {
    const { userPrompt, metadata } = readRunInput(input);

    const systemPrompt = await generateNoleSystemPrompt({
      canvasId: run.canvasId,
      userId: run.userId,
      ctx,
    });

    // Le message qui précède celui du run : les modifications du canvas sont
    // calculées depuis sa date. On en demande deux, dont celui du run.
    const previousMessages = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: run.threadId,
        order: "desc",
        excludeToolMessages: true,
        upToAndIncludingMessageId: run.runMessageId,
        paginationOpts: { cursor: null, numItems: 2 },
      },
    );
    const previousMessage = previousMessages.page.find(
      (message) => message._id !== run.runMessageId,
    );

    const canvasChangesSinceLastMessage = previousMessage
      ? await ctx.runQuery(
          internal.ia.helpers.getCanvasChangesSinceLastMessage
            .getCanvasChangesSinceLastMessage,
          {
            canvasId: run.canvasId,
            lastMessageAt: previousMessage._creationTime,
          },
        )
      : "";

    return {
      systemPrompt,
      llmPrompt: noleMessageContent(
        userPrompt,
        metadata,
        canvasChangesSinceLastMessage,
      ),
    };
  },

  agent(run) {
    return new Agent(components.agent, {
      name: threadAgentNames.nole,
      languageModel: languageModel(run),
      usageHandler: createUsageHandler(aiUsageSources.nole),
    });
  },

  tools(run) {
    return getToolsForAgent({
      agentName: toolAgentNames.nole,
      threadCtx: { authUserId: run.userId, canvasId: run.canvasId },
      isMultimodal: isModelMultimodal(languageModel(run)),
      trackActivity: false,
    });
  },

  replay: toolReplay,
  deferredTools: deferredToolNames,
  compaction: canvasCompaction,
  stepContext: canvasStepContext,
  subagents: { profile: "worker" },
  askUser: true,
};
