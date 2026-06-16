import { components, internal } from "../_generated/api";
import { Agent } from "@convex-dev/agent";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { v } from "convex/values";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ToolSet } from "ai";
import { stepCountIs } from "ai";
import { toolAgentNames, type ThreadCtx } from "./agentConfig";
import { getToolsForAgent } from "./tools";
import { generateSupervisorSystemPrompt } from "./systemPrompts/supervisorSystemPrompt";
import { recordUsageInThreadMetadata } from "./helpers/usageHandler";

// MODELS CONF ==============================================================
export const chatModelOptions = [
  {
    label: "DeepSeek V4 Flash",
    value: "deepseek/deepseek-v4-flash",
    price: "0.10_0.20",
    isMultimodal: false,
    maxContext: 1000000,
  },
  {
    label: "Nemotron 3 Ultra",
    value: "nvidia/nemotron-3-ultra-550b-a55b:free",
    price: "Free",
    isMultimodal: false,
    maxContext: 128000,
  },
  {
    label: "DeepSeek V4 Pro",
    value: "deepseek/deepseek-v4-pro",
    price: "0.435_0.87",
    isMultimodal: false,
    maxContext: 1000000,
  },
  {
    label: "Claude Opus 4.8",
    value: "~anthropic/claude-opus-latest",
    price: "5_25",
    isMultimodal: true,
    maxContext: 1000000,
  },
] as const;

export const chatModelValues = chatModelOptions.map((model) => model.value);

export const defaultChatModelValue = chatModelValues[0];

export const vChatModelValues = v.union(
  ...chatModelValues.map((model) => v.literal(model)),
);

export type ChatModelValues = typeof vChatModelValues.type;

export type ChatModelOption = (typeof chatModelOptions)[number];

export function getChatModel(
  modelPreference: ChatModelValues,
): LanguageModelV3 {
  return openrouter(modelPreference);
}

export function isModelMultimodal(model: LanguageModelV3): boolean {
  const option = chatModelOptions.find((o) => o.value === model.modelId);
  return option?.isMultimodal ?? false;
}

const defaultModels = {
  nole: getChatModel(defaultChatModelValue),
  worker: getChatModel("deepseek/deepseek-v4-flash"),
  fast: openrouter("mistralai/mistral-small-2603"),
};

// AGENTS CONF =================================================================

// Minimal agent used for utility operations (e.g. saveMessage) that don't require a specific model.
export function createBaseAgent({ model }: { model?: LanguageModelV3 } = {}) {
  return new Agent(components.agent, {
    name: "base",
    languageModel: model ?? defaultModels.fast,
  });
}
export const baseAgent = createBaseAgent();

export function createNoleAgent({
  model,
  threadCtx,
  extraTools = {},
}: {
  model?: LanguageModelV3;
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
}) {
  const languageModel = model ?? defaultModels.nole;
  return new Agent(components.agent, {
    name: "Nolë",
    stopWhen: stepCountIs(25),
    languageModel,
    tools: getToolsForAgent({
      agentName: toolAgentNames.nole,
      threadCtx,
      extraTools,
      isMultimodal: isModelMultimodal(languageModel),
    }),
    rawRequestResponseHandler: async (ctx, args) => {
      const _args = args as any;
      console.log(_args.response.messages[0].content);
      // [
      //   {
      //     type: 'reasoning',
      //     text: `The user wants one more "coucou" for testing. They're in a viewport showing several nodes including documents about meditation, exercise, hydration benefits, a Rick Astley embed, and some apps. Let me give them their final coucou.`,
      //     providerOptions: { openrouter: [Object] }
      //   },
      //   {
      //     type: 'text',
      //     text: 'Coucou ! 👋\n' +
      //       '\n' +
      //       'Test #7 (et probablement dernier). Tout bon de mon côté connexion. \n' +
      //       '\n' +
      //       `Je vois que tu regardes la zone "santé" avec les 3 docs bienfaits + l'app météo Morlaix. Tu veux que je lise l'un d'eux ou on arrête les tests là ?`,
      //     providerOptions: undefined
      //   }

      // Process the response message to get the tools used
    },
    usageHandler: async (ctx, args) => {
      // Called once per LLM step. Per-message metadata (model/usage/cost) is
      // recorded once per turn after the stream completes (see noleCompletion);
      // here we only accumulate the thread-level cost across all steps.
      await recordUsageInThreadMetadata(ctx, {
        threadId: args.threadId,
        userId: args.userId,
        agentName: args.agentName,
        usage: args.usage,
      });
    },
  });
}

export function createCloneAgent({
  threadCtx,
  extraTools = {},
  model,
}: {
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
  model?: LanguageModelV3;
}) {
  const languageModel = model ?? defaultModels.nole;
  return new Agent(components.agent, {
    name: "Clone",
    stopWhen: stepCountIs(25),
    languageModel,
    tools: getToolsForAgent({
      agentName: toolAgentNames.clone,
      threadCtx,
      extraTools,
      isMultimodal: isModelMultimodal(languageModel),
    }),
  });
}

export function createSupervisorAgent({
  threadCtx,
  extraTools = {},
  model,
}: {
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
  model?: LanguageModelV3;
}) {
  const languageModel = model ?? defaultModels.nole;
  return new Agent(components.agent, {
    name: "Supervisor",
    stopWhen: stepCountIs(25),
    instructions: generateSupervisorSystemPrompt(),
    languageModel,
    tools: getToolsForAgent({
      agentName: toolAgentNames.supervisor,
      threadCtx,
      extraTools,
      isMultimodal: isModelMultimodal(languageModel),
    }),
  });
}

export function createWorkerAgent({
  threadCtx,
  extraTools = {},
  model,
}: {
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
  model?: LanguageModelV3;
}) {
  const languageModel = model ?? defaultModels.worker;
  return new Agent(components.agent, {
    name: "Worker",
    stopWhen: stepCountIs(15),
    languageModel,
    tools: getToolsForAgent({
      agentName: toolAgentNames.worker,
      threadCtx,
      extraTools,
      isMultimodal: isModelMultimodal(languageModel),
    }),
  });
}
