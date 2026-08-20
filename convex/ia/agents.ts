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
 * Modèles de génération d'images proposés dans l'onglet « Générer » de
 * l'ImageNode. Même contrat que `chatModelOptions` : la liste est la source de
 * vérité, le validateur en dérive, donc retirer un modèle d'ici le fait
 * automatiquement rejeter par la mutation.
 *
 * `maxImages` borne ce que le sélecteur propose. `pricePerImage` est en USD par
 * image et sert UNIQUEMENT à l'affichage : le coût réellement compté vient
 * d'OpenRouter (cf. `requestOpenRouterImages`), jamais d'un calcul local.
 *
 * ⚠️ Les slugs ci-dessous n'ont pas pu être vérifiés contre le catalogue
 * OpenRouter (réseau indisponible au moment de l'écriture). À confirmer sur
 * https://openrouter.ai/models?modality=text-%3Eimage avant mise en prod : un
 * slug faux échoue au premier appel, avec l'erreur remontée dans le node.
 */
export const imageModelOptions = [
  {
    label: "Seedream 5.0 Lite",
    value: "bytedance-seed/seedream-5-0-lite",
    pricePerImage: "0.035",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
  {
    label: "Seedream 5.0 Pro",
    value: "bytedance-seed/seedream-5-0-pro",
    pricePerImage: "0.045",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
  {
    label: "Microsoft MAI-Image-2.5 Pro",
    value: "microsoft/mai-image-2.5-pro",
    pricePerImage: "0.15",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
  {
    label: "Krea 2 Large",
    value: "krea/krea-2-large",
    pricePerImage: "0.06",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
  {
    label: "Nano Banana 2",
    value: "google/gemini-3.1-flash-image",
    pricePerImage: "0.15",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
  {
    label: "GPT Image 2",
    value: "openai/gpt-image-2",
    pricePerImage: "0.18",
    inputModalities: ["text", "image"],
    maxImages: 4,
  },
] as const;

export const imageModelValues = imageModelOptions.map((model) => model.value);

export const vImageModelValues = v.union(
  ...imageModelValues.map((model) => v.literal(model)),
);

export type ImageModelValues = typeof vImageModelValues.type;

export type ImageModelOption = (typeof imageModelOptions)[number];

/** Borne dure côté serveur, indépendante de ce que le client demande. */
export const MAX_IMAGES_PER_GENERATION = Math.max(
  ...imageModelOptions.map((model) => model.maxImages),
);

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

/**
 * Point de passage UNIQUE vers OpenRouter pour les images.
 *
 * `fetch` brut plutôt que `generateImage` de l'ai-sdk, pour une seule raison :
 * le provider mappe la réponse vers `ImageModelV3Usage`, qui ne porte que trois
 * compteurs de tokens. Le champ `cost` d'OpenRouter y est PERDU, et la
 * génération d'images redeviendrait un chemin de dépense non compté — ce que
 * `schemas/aiUsageSourceSchema.ts` existe précisément pour empêcher. Aucun
 * calcul local à partir de `pricePerImage` : `undefined` veut dire
 * « OpenRouter n'a rien dit », pas « gratuit ».
 *
 * `usage: { include: true }` est le même réglage que sur les modèles chat, ici
 * passé par requête puisqu'il n'y a pas d'objet modèle à configurer.
 */
export async function requestOpenRouterImages({
  model,
  prompt,
  n,
}: {
  model: ImageModelValues;
  prompt: string;
  n: number;
}): Promise<{
  /** Images encodées en base64, sans préfixe data-URL. */
  images: string[];
  costUsd: number | undefined;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");

  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, n, usage: { include: true } }),
  });

  if (!response.ok) {
    // Le corps porte le message utile d'OpenRouter (modèle inconnu, crédit
    // épuisé, prompt refusé) : il finit affiché sur le node, donc on le garde.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter image request failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const payload: unknown = await response.json();
  const data = readArray(readObjectKey(payload, "data"));
  const images = data
    .map((item) => readString(readObjectKey(item, "b64_json")))
    .filter((value): value is string => value !== undefined);

  if (images.length === 0) {
    throw new Error("OpenRouter returned no image in its response.");
  }

  const usage = readObjectKey(payload, "usage");
  return {
    images,
    costUsd: readNumber(readObjectKey(usage, "cost")),
    tokens: {
      inputTokens: readNumber(readObjectKey(usage, "prompt_tokens")) ?? 0,
      outputTokens: readNumber(readObjectKey(usage, "completion_tokens")) ?? 0,
      totalTokens: readNumber(readObjectKey(usage, "total_tokens")) ?? 0,
    },
  };
}

// Lecture défensive d'un JSON de provenance externe : sa forme est documentée
// mais pas garantie, et un cast menteur ferait planter loin de la cause.
function readObjectKey(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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
