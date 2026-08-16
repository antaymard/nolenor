import { components } from "../_generated/api";
import { Agent } from "@convex-dev/agent";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { v } from "convex/values";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ToolSet } from "ai";
import { stepCountIs } from "ai";
import { toolAgentNames, type ThreadCtx } from "./agentConfig";
import { getToolsForAgent } from "./tools";
import { createUsageHandler } from "./usage";
import {
  aiUsageSources,
  type AiUsageSource,
} from "../schemas/aiUsageSourceSchema";

// MODELS CONF ==============================================================
export const chatModelOptions = [
  {
    label: "Deepseek v4 Flash",
    value: "deepseek/deepseek-v4-flash-0731",
    price: "0.09_0.18",
    isMultimodal: false,
    maxContext: 1000000,
  },
  {
    label: "GPT-5.6 Luna Pro",
    value: "openai/gpt-5.6-luna-pro",
    price: "0.10_0.60",
    isMultimodal: true,
    maxContext: 1000000,
  },
  {
    label: "GPT-5.6 Terra Pro",
    value: "openai/gpt-5.6-terra-pro",
    price: "1_6",
    isMultimodal: true,
    maxContext: 1000000,
  },
  {
    label: "Kimi K3",
    value: "moonshotai/kimi-k3",
    price: "3_15",
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

/**
 * Point de passage UNIQUE vers OpenRouter.
 *
 * `usage: { include: true }` active l'usage accounting : c'est la seule façon
 * d'obtenir le champ `cost` dans la réponse, et c'est un réglage du modèle, pas
 * de l'appel. Sans lui, tout le suivi de coût retombe silencieusement à zéro —
 * c'était le bug. Tout nouveau modèle doit passer par ici.
 *
 * `.chat(...)` plutôt que `openrouter(...)` : l'appel direct résout d'abord
 * vers la surcharge TypeScript « completion », alors que c'est bien un modèle
 * chat qui est construit au runtime.
 */
function openRouterModel(modelId: string): LanguageModelV3 {
  return openrouter.chat(modelId, { usage: { include: true } });
}

export function getChatModel(
  modelPreference: ChatModelValues,
): LanguageModelV3 {
  return openRouterModel(modelPreference);
}

export function isModelMultimodal(model: LanguageModelV3): boolean {
  const option = chatModelOptions.find((o) => o.value === model.modelId);
  return option?.isMultimodal ?? false;
}

const defaultModels = {
  nole: getChatModel(defaultChatModelValue),
  worker: getChatModel("deepseek/deepseek-v4-flash-0731"),
  // Hors de `chatModelOptions` (donc pas proposé à l'utilisateur), mais il
  // passe par le même helper : c'est ce qui évite que la génération de titre
  // reparte silencieusement sans coût.
  fast: openRouterModel("mistralai/mistral-small-2603"),
};

// AGENTS CONF =================================================================

/**
 * Agent minimal pour les opérations utilitaires. Attention : il sert à la fois
 * à des appels sans LLM (`saveMessage`, cf. ia/nole.ts et ia/worker.ts) et à un
 * vrai appel LLM (la génération de titre, cf. threads.ts). D'où `usageSource`
 * explicite plutôt qu'une valeur par défaut : marquer les `saveMessage` comme
 * de la consommation IA serait un mensonge dans le ledger.
 */
export function createBaseAgent({
  model,
  usageSource,
}: { model?: LanguageModelV3; usageSource?: AiUsageSource } = {}) {
  return new Agent(components.agent, {
    name: "base",
    languageModel: model ?? defaultModels.fast,
    usageHandler: usageSource ? createUsageHandler(usageSource) : undefined,
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
    usageHandler: createUsageHandler(aiUsageSources.nole),
  });
}

// `createCloneAgent` et `createSupervisorAgent` vivaient ici. Aucun appelant, et
// tous deux étaient des points d'entrée LLM sans `usageHandler` : les garder,
// c'était préparer le prochain chemin de dépense non compté. Les entrées
// `clone`/`supervisor` de `toolAgentNames` restent en place, les ToolConfig les
// référencent encore.

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
    usageHandler: createUsageHandler(aiUsageSources.worker),
  });
}
