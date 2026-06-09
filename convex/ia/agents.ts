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
import { recordAssistantUsage } from "./helpers/useHandler";

type RawUsage =
  | {
      inputTokens?: number;
      inputTokenDetails?: object;
      outputTokens?: number;
      outputTokenDetails?: object;
      totalTokens?: number;
      cachedInputTokens?: number;
    }
  | undefined;

function normalizeUsage(usage: RawUsage) {
  if (!usage) return undefined;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
  };
}

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
    label: "Tencent Hy3",
    value: "tencent/hy3-preview",
    price: "0.063_0.21",
    isMultimodal: false,
    maxContext: 260000,
  },
  {
    label: "Laguna M.1 Free",
    value: "poolside/laguna-m.1:free",
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
    label: "Gemini 3.5 Flash",
    value: "google/gemini-3.5-flash",
    price: "1.50_9.00",
    isMultimodal: true,
    maxContext: 1000000,
  },
] as const;

export const chatModelValues = chatModelOptions.map((model) => model.value);

const defaultChatModelValue = chatModelValues[0];

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
    usageHandler: async (ctx, args) => {
      console.log("Agent usage reported:", args);
      /* Args are
      {
        userId: 'jx73vs22b97g3td1ja6gqcd3sn7tber0',
        threadId: 'm579nvm58s54wg4ws1e8ws2n0d87kv9p',
        agentName: 'Nolë',
        model: 'deepseek/deepseek-v4-flash',
        provider: 'openrouter',
        usage: {
          inputTokens: 18506,
          inputTokenDetails: { noCacheTokens: 18506, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokens: 80,
          outputTokenDetails: { textTokens: 50, reasoningTokens: 30 },
          totalTokens: 18586,
          raw: {
            prompt_tokens: 18506,
            prompt_tokens_details: [Object],
            completion_tokens: 80,
            completion_tokens_details: [Object],
            total_tokens: 18586,
            cost: 0.002501244,
            cost_details: [Object],
            is_byok: false
          },
          reasoningTokens: 30,
          cachedInputTokens: 0
        },
        providerMetadata: {
          openrouter: {
            usage: [Object],
            provider: 'Alibaba',
            reasoning_details: [Array]
        }
      }*/

      await recordAssistantUsage(ctx, {
        userId: args.userId,
        agentName: args.agentName,
        threadId: args.threadId,
        model: args.model,
        provider: args.provider,
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
  const languageModel = model ?? defaultModels.nole;
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
