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

// MODELS CONF ==============================================================
export const chatModelOptions = [
  {
    label: "Tencent Hy3",
    value: "tencent/hy3",
    price: "0.14_0.58",
    isMultimodal: false,
    maxContext: 256000,
  },
  {
    label: "DeepSeek V4 Pro",
    value: "deepseek/deepseek-v4-pro",
    price: "0.435 _0.87",
    isMultimodal: false,
    maxContext: 1000000,
  },
  {
    label: "Z.ai GLM5.2",
    value: "z-ai/glm-5.2",
    price: "0.95_3",
    isMultimodal: false,
    maxContext: 1000000,
  },
  {
    label: "Claude Haiku 4.5",
    value: "anthropic/claude-haiku-4.5",
    price: "1_5",
    isMultimodal: true,
    maxContext: 1000000,
  },
  {
    label: "Claude Sonnet 5",
    value: "anthropic/claude-sonnet-5",
    price: "2_10",
    isMultimodal: true,
    maxContext: 1000000,
  },
  {
    label: "GPT-5.6 Sol Pro",
    value: "openai/gpt-5.6-sol-pro",
    price: "5_30",
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
  worker: getChatModel("deepseek/deepseek-v4-pro"),
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
      // Called once per LLM step. Per-message metadata (model/usage/cost) is
      // recorded once per turn after the stream completes (see noleCompletion);
      // here we only accumulate the thread-level cost across all steps.
      if (
        !args.threadId ||
        !args.usage ||
        !args.usage.raw ||
        typeof args.usage.raw.cost !== "number"
      ) {
        console.error(`Cannot update usage. Wrong `);
        return;
      }
      await ctx.runMutation(
        internal.wrappers.threadMetadataWrappers.updateUsage,
        {
          threadId: args.threadId,
          additionalUsageUsd: args.usage.raw.cost || 0, // Use the cost from usage data, default to 0 if not available
        },
      );
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
