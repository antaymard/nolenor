import { components } from "../_generated/api";
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
    label: "DeepSeek V4 Flash",
    value: "deepseek/deepseek-v4-flash",
    price: "0.14_0.28",
    isMultimodal: false,
    maxContext: 131072,
  },
  {
    label: "Tencent Hy3",
    value: "tencent/hy3-preview",
    price: "0.066_0.26",
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

// TO DEP
export function createAutomationAgent({
  model,
  threadCtx,
  extraTools = {},
}: {
  model?: LanguageModelV3;
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
}) {
  const languageModel = model ?? defaultModels.fast;
  return new Agent(components.agent, {
    name: toolAgentNames.automation,
    languageModel,
    stopWhen: stepCountIs(5),
    tools: getToolsForAgent({
      agentName: toolAgentNames.automation,
      threadCtx,
      extraTools,
      isMultimodal: isModelMultimodal(languageModel),
    }),
    instructions: `You are an automation agent linked to a node in a canvas-based app similar to Miro. You can use the tools at your disposal to accomplish the requested tasks. The node you are linked to may contain input data from other nodes that you will most often need to use to complete your task. Use the tools available to you to find information.
    Do not respond to the user as a general chat assistant. Use the standard tools available directly if an action on the canvas or content is necessary.
    Be as concise, exact, and factual as possible. Do not fabricate information. Do not be verbose.`,
  });
}
